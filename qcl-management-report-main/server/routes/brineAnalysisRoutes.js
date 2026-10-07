const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for brine analysis records
const brineRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Brine Analysis data (TK 109, TK 110)
 * @route   POST /api/brine-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Brine Analysis.',
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
          errors.push(`${rowKey.toUpperCase()} - ${paramKey.toUpperCase()} must be a valid number.`);
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
      id: `brine_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'Brine Analysis',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    brineRecords.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'BRINE_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Brine Analysis saved for date: ${payload.date} (TK 109, TK 110).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log brine activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Brine Analysis recorded and saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[BrineAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing brine analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Brine Analysis records
 * @route   GET /api/brine-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let filtered = [...brineRecords];

    if (date) {
      filtered = filtered.filter((r) => r.date === date);
    } else if (startDate || endDate) {
      if (startDate) filtered = filtered.filter((r) => r.date >= startDate);
      if (endDate) filtered = filtered.filter((r) => r.date <= endDate);
    }

    return res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
