const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for TK 207 analysis records
const tk207Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save TK 207 Analysis data (2-hourly intervals: FNH3, CNH3, TCl, PCl)
 * @route   POST /api/tk-207-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save TK 207 Analysis.',
      });
    }

    const rows = payload.rows || {};
    const errors = [];

    // Validate numeric values if entered
    Object.entries(rows).forEach(([rowKey, paramValues]) => {
      if (typeof paramValues !== 'object' || paramValues === null) return;
      Object.entries(paramValues).forEach(([paramKey, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Time slot '${rowKey}', parameter '${paramKey.toUpperCase()}' must be a valid number.`);
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

    // Record creation
    const record = {
      id: `tk207_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'TK 207 Analysis',
      tank: 'TK 207',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    tk207Records.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_207_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 207 Analysis saved for date: ${payload.date} (FNH3, CNH3, TCl, PCl).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log TK 207 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'TK 207 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[TK207Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 207 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 207 Analysis records
 * @route   GET /api/tk-207-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...tk207Records];

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
    console.error('[TK207Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving TK 207 analysis records.',
    });
  }
});

module.exports = router;
