const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for DM Water / Anion Unit Analysis records
const dmWaterRecords = [
  {
    id: 'dm_water_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    unit: 'DM Water',
    analysisType: 'Analysis For DM Water / Anion unit',
    readings: [
      {
        id: 'r_dm_water',
        unit: 'DM WATER',
        time: '15:00',
        ph: '7.2',
        cond: '20.7',
        p: '0',
        m: '6',
        th: '0',
        sio2: '0.20',
        isDefault: true,
      },
      {
        id: 'r_anion_unit',
        unit: 'A.UNIT',
        time: '',
        ph: '0',
        cond: '0',
        p: '0',
        m: '0',
        th: '0',
        sio2: '0.00',
        isDefault: true,
      },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T15:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save DM Water / Anion Unit Analysis data
 * @route   POST /api/dm-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save DM Water Analysis.',
      });
    }

    const readings = payload.readings || [];
    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one analytical reading row is required.',
      });
    }

    const numericFields = ['ph', 'cond', 'p', 'm', 'th', 'sio2'];
    const errors = [];

    readings.forEach((reading, index) => {
      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row ${index + 1} (${reading.unit || 'Sample'}) -> ${field.toUpperCase()} must be a valid number.`);
          }
        }
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    const record = {
      id: `dm_water_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: payload.unit || 'DM Water',
      analysisType: 'Analysis For DM Water / Anion unit',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = dmWaterRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      dmWaterRecords[existingIndex] = { ...dmWaterRecords[existingIndex], ...record };
    } else {
      dmWaterRecords.unshift(record);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'DM_WATER_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `DM Water & Anion Unit Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log DM Water activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'DM Water & Anion Unit Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[DMWaterAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing DM Water analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve DM Water / Anion Unit Analysis records
 * @route   GET /api/dm-water-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...dmWaterRecords];

    if (date) {
      results = results.filter((r) => r.date === date);
    } else if (startDate && endDate) {
      results = results.filter((r) => r.date >= startDate && r.date <= endDate);
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error('[DMWaterAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving DM Water records.',
    });
  }
});

module.exports = router;
