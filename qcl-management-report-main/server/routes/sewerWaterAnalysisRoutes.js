const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for Sewer Water Analysis records
const sewerWaterRecords = [
  {
    id: 'sewer_seed_1',
    date: '2026-09-14',
    plant: 'OFFSET',
    unit: 'Sewer Water',
    analysisType: 'Sewer Water Analysis',
    readings: [
      {
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '3', cnh3: '0' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
      },
      {
        id: 't13',
        time: '13:00',
        sec200: { fnh3: '0', cnh3: '0' },
        sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
      },
      {
        id: 't15',
        time: '15:00',
        sec200: { fnh3: '0', cnh3: '0' },
        sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
      },
      {
        id: 't17',
        time: '17:00',
        sec200: { fnh3: '0', cnh3: '0' },
        sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
      },
      {
        id: 't19',
        time: '19:00',
        sec200: { fnh3: '1020', cnh3: '2244' },
        sec400: { fnh3: '5780', cnh3: '2720', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '38.5' },
      },
      {
        id: 't21',
        time: '21:00',
        sec200: { fnh3: '0', cnh3: '0' },
        sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
      },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T21:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Sewer Water Analysis data
 * @route   POST /api/sewer-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Sewer Water Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      const checkVal = (section, key) => {
        const val = reading[section]?.[key];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}) [${section}.${key}]: must be a valid number.`);
          }
        }
      };

      checkVal('sec200', 'fnh3');
      checkVal('sec200', 'cnh3');
      checkVal('sec400', 'fnh3');
      checkVal('sec400', 'cnh3');
      checkVal('sec400', 'hco3');
      checkVal('finalOutlet', 'fnh3');
      checkVal('finalOutlet', 'cnh3');
      checkVal('finalOutlet', 'hco3');
      checkVal('finalOutlet', 'pcl');
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    const record = {
      id: `sewer_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: 'Sewer Water',
      analysisType: 'Sewer Water Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = sewerWaterRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      sewerWaterRecords[existingIndex] = { ...sewerWaterRecords[existingIndex], ...record };
    } else {
      sewerWaterRecords.unshift(record);
    }

    // Keep memory cache under 50 records
    if (sewerWaterRecords.length > 50) {
      sewerWaterRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Sewer Water Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Sewer Water',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Sewer Water Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/sewer-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Sewer Water Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Sewer Water Analysis data (by date or latest)
 * @route   GET /api/sewer-water-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {
      const match = sewerWaterRecords.find(
        (r) => r.date === date && (!plant || r.plant.toLowerCase() === plant.toLowerCase())
      );
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
        });
      }
      return res.status(200).json({
        success: true,
        data: null,
        message: `No record found for date ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      count: sewerWaterRecords.length,
      data: sewerWaterRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/sewer-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Sewer Water Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
