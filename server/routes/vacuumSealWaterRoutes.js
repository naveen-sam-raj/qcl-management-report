const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for Vacuum Seal Water Analysis records
const vacuumSealRecords = [
  {
    id: 'vacuum_seed_1',
    date: '2026-09-11',
    plant: 'OFFSET',
    unit: 'Vaccum seal water',
    analysisType: 'Vacuum Seal Water Analysis',
    readings: [
      { id: 'r1', time: '07:00', fnh3: '1530', cnh3: '0' },
      { id: 'r2', time: '15:00', fnh3: '', cnh3: '' },
      { id: 'r3', time: '23:00', fnh3: '', cnh3: '' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-11T08:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Vacuum Seal Water Analysis data
 * @route   POST /api/vacuum-seal-water
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Vacuum Seal Water Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      ['fnh3', 'cnh3'].forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}): ${field.toUpperCase()} must be a valid number.`);
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
      id: `vacuum_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: payload.unit || 'Vaccum seal water',
      analysisType: 'Vacuum Seal Water Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = vacuumSealRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      vacuumSealRecords[existingIndex] = { ...vacuumSealRecords[existingIndex], ...record };
    } else {
      vacuumSealRecords.unshift(record);
    }

    // Keep memory cache under 50 records
    if (vacuumSealRecords.length > 50) {
      vacuumSealRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Vacuum Seal Water Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Vaccum seal water',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Vacuum Seal Water Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/vacuum-seal-water:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Vacuum Seal Water Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Vacuum Seal Water Analysis data (by date or latest)
 * @route   GET /api/vacuum-seal-water
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {
      const match = vacuumSealRecords.find(
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
      count: vacuumSealRecords.length,
      data: vacuumSealRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/vacuum-seal-water:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Vacuum Seal Water Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
