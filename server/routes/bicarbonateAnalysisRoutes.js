const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for Bi Carbonate Analysis records
const bicarbonateRecords = [
  {
    id: 'bicarb_seed_1',
    date: '2026-09-12',
    plant: 'SA',
    unit: 'Bi carbonate',
    analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
    readings: [
      { id: 't0630', time: '06:30', filter: 'F-1', naclNa2co3: '1.06' },
      { id: 't0830', time: '08:30', filter: 'F-1', naclNa2co3: '0.60' },
      { id: 't1030', time: '10:30', filter: '', naclNa2co3: '' },
      { id: 't1230', time: '12:30', filter: 'F-2', naclNa2co3: '4.83' },
      { id: 't1430', time: '14:30', filter: 'F-2', naclNa2co3: '1.61' },
      { id: 't1630', time: '16:30', filter: 'F-3', naclNa2co3: '2.80' },
      { id: 't1830', time: '18:30', filter: 'F-3', naclNa2co3: '2.49' },
      { id: 't2030', time: '20:30', filter: 'F-4', naclNa2co3: '1.04' },
      { id: 't2230', time: '22:30', filter: 'F-4', naclNa2co3: '1.30' },
      { id: 't0030', time: '00:30', filter: 'F-5', naclNa2co3: '0.83' },
      { id: 't0230', time: '02:30', filter: 'F-5', naclNa2co3: '0.78' },
      { id: 't0430', time: '04:30', filter: '', naclNa2co3: '' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-12T05:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Bi Carbonate Analysis data
 * @route   POST /api/bicarbonate-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Bi Carbonate Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      const val = reading.naclNa2co3;
      if (val !== '' && val !== null && val !== undefined) {
        if (isNaN(Number(val))) {
          errors.push(`Row #${rowNum} (${reading.time || ''}): NaCl/Na2CO3 must be a valid number.`);
        }
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    const record = {
      id: `bicarb_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      unit: payload.unit || 'Bi carbonate',
      analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = bicarbonateRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      bicarbonateRecords[existingIndex] = { ...bicarbonateRecords[existingIndex], ...record };
    } else {
      bicarbonateRecords.unshift(record);
    }

    // Keep memory cache under 50 records
    if (bicarbonateRecords.length > 50) {
      bicarbonateRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Bi Carbonate Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Bi carbonate',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Bi Carbonate Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/bicarbonate-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Bi Carbonate Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Bi Carbonate Analysis data (by date or latest)
 * @route   GET /api/bicarbonate-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {
      const match = bicarbonateRecords.find(
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
      count: bicarbonateRecords.length,
      data: bicarbonateRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/bicarbonate-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Bi Carbonate Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
