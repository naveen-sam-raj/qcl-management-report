const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for CR 202 analysis records
const cr202Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save CR 202 Analysis data (CNH3 streams A-H, AVG TCl, AVG A-H & PCl row)
 * @route   POST /api/cr-202-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save CR 202 Analysis.',
      });
    }

    const { timeRows = {}, pclRow = {} } = payload;
    const errors = [];

    // Validate time row values
    Object.entries(timeRows).forEach(([timeKey, paramValues]) => {
      if (typeof paramValues !== 'object' || paramValues === null) return;
      Object.entries(paramValues).forEach(([paramKey, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Time '${timeKey}', Parameter '${paramKey.toUpperCase()}' must be a valid number.`);
        }
      });
    });

    // Validate PCl row values
    Object.entries(pclRow).forEach(([streamKey, val]) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Row 'PCl', Stream '${streamKey.toUpperCase()}' must be a valid number.`);
      }
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
      id: `cr202_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'CR 202 Analysis',
      crystallizer: 'CR 202',
      timeRows,
      pclRow,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    cr202Records.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'CR_202_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `CR 202 Analysis saved for date: ${payload.date} (CNH3 streams A-H, AVG TCl, AVG A-H, PCl).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log CR 202 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'CR 202 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[CR202Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing CR 202 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve CR 202 Analysis records
 * @route   GET /api/cr-202-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...cr202Records];

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
    console.error('[CR202Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving CR 202 analysis records.',
    });
  }
});

module.exports = router;
