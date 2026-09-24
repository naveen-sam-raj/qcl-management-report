const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for T 401 analysis records
const t401Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save T 401 Analysis data (6 units A-F, 3 shifts: CNH3, TCl, PCl)
 * @route   POST /api/t-401-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save T 401 Analysis.',
      });
    }

    const { units = {} } = payload;
    const errors = [];

    // Validate units (A through F)
    Object.entries(units).forEach(([unitKey, shiftData]) => {
      if (typeof shiftData !== 'object' || shiftData === null) return;
      Object.entries(shiftData).forEach(([shiftKey, params]) => {
        if (typeof params !== 'object' || params === null) return;
        Object.entries(params).forEach(([paramKey, val]) => {
          if (val === '' || val === null || val === undefined) return;
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Unit '${unitKey.toUpperCase()}', Shift '${shiftKey.toUpperCase()}', Parameter '${paramKey.toUpperCase()}' must be a valid number.`);
          }
        });
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    // Record creation
    const record = {
      id: `t401_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      analysisType: payload.analysisType || 'T 401 Analysis',
      tower: 'T 401',
      units,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    t401Records.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'T401_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `T 401 Analysis saved for date: ${payload.date} (Units A-F, Shifts I-III).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log T 401 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'T 401 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[T401Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing T 401 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve T 401 Analysis records
 * @route   GET /api/t-401-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...t401Records];

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
    console.error('[T401Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving T 401 analysis records.',
    });
  }
});

module.exports = router;
