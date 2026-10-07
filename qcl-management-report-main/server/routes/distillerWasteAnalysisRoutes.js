const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for Distiller Waste Water Analysis records
const distillerRecords = [
  {
    id: 'distiller_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    unit: 'Distiller waste',
    analysisType: 'Distiller Waste Water Analysis',
    readings: [
      { id: 't0630', time: '06:30', exCao: '00.00', fnh3: '272', cnh3: '1190', tnh3: '1462', nahco3: '0' },
      { id: 't0730', time: '07:30', exCao: '00.00', fnh3: '340', cnh3: '1870', tnh3: '2210', nahco3: '0' },
      { id: 't0830', time: '08:30', exCao: '00.00', fnh3: '425', cnh3: '8330', tnh3: '8755', nahco3: '0' },
      { id: 't0930', time: '09:30', exCao: '00.00', fnh3: '510', cnh3: '4420', tnh3: '4930', nahco3: '0' },
      { id: 't1030', time: '10:30', exCao: '00.00', fnh3: '238', cnh3: '13090', tnh3: '13328', nahco3: '0' },
      { id: 't1130', time: '11:30', exCao: '00.00', fnh3: '442', cnh3: '21250', tnh3: '21692', nahco3: '0' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T12:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Distiller Waste Water Analysis data
 * @route   POST /api/distiller-waste-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Distiller Waste Water Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];
    const fields = ['exCao', 'fnh3', 'cnh3', 'tnh3', 'nahco3'];

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
      id: `distiller_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: payload.unit || 'Distiller waste',
      analysisType: 'Distiller Waste Water Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = distillerRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      distillerRecords[existingIndex] = { ...distillerRecords[existingIndex], ...record };
    } else {
      distillerRecords.unshift(record);
    }

    // Keep memory cache under 50 records
    if (distillerRecords.length > 50) {
      distillerRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Distiller Waste Water Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Distiller waste',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Distiller Waste Water Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/distiller-waste-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Distiller Waste Water Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Distiller Waste Water Analysis data (by date or latest)
 * @route   GET /api/distiller-waste-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {
      const match = distillerRecords.find(
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
      count: distillerRecords.length,
      data: distillerRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/distiller-waste-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Distiller Waste Water Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
