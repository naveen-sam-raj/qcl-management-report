const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for Cooling Water (C.W Water) Analysis records
const coolingWaterRecords = [
  {
    id: 'cw_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    unit: 'cooling water',
    analysisType: 'Cooling Water (C.W Water) Analysis',
    readings: [
      { id: 't07', time: '07:00', ph: '6.9', ppo4: '0.0', opo4: '15.0', cl: '1510', frc: '0.0', cl200: '1440' },
      { id: 't09', time: '09:00', ph: '0.0', ppo4: '0.0', opo4: '0.0', cl: '0', frc: '0.0', cl200: '0' },
      { id: 't11', time: '11:00', ph: '6.6', ppo4: '0.0', opo4: '0.0', cl: '1360', frc: '0.6', cl200: '0' },
      { id: 't13', time: '13:00', ph: '0.0', ppo4: '0.0', opo4: '0.0', cl: '0', frc: '0.0', cl200: '0' },
      { id: 't15', time: '15:00', ph: '7.1', ppo4: '0.0', opo4: '15.0', cl: '1305', frc: '0.5', cl200: '1275' },
      { id: 't17', time: '17:00', ph: '0.0', ppo4: '0.0', opo4: '0.0', cl: '0', frc: '0.0', cl200: '0' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T17:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Cooling Water Analysis data
 * @route   POST /api/cooling-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Cooling Water Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];
    const fields = ['ph', 'ppo4', 'opo4', 'cl', 'frc', 'cl200'];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      fields.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}): ${f.toUpperCase()} must be a valid number.`);
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
      id: `cw_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: payload.unit || 'cooling water',
      analysisType: 'Cooling Water (C.W Water) Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = coolingWaterRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      coolingWaterRecords[existingIndex] = { ...coolingWaterRecords[existingIndex], ...record };
    } else {
      coolingWaterRecords.unshift(record);
    }

    // Keep memory cache under 50 records
    if (coolingWaterRecords.length > 50) {
      coolingWaterRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Cooling Water Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'cooling water',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Cooling Water Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/cooling-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Cooling Water Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Cooling Water Analysis data (by date or latest)
 * @route   GET /api/cooling-water-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {
      const match = coolingWaterRecords.find(
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
      count: coolingWaterRecords.length,
      data: coolingWaterRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/cooling-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Cooling Water Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
