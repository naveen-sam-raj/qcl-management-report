const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for TK 209 analysis records
const tk209Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save TK 209 Analysis data (Once in a shift)
 * @route   POST /api/tk-209-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || 'Validation failed. Enter numeric values only.',
        errors: validation.errors,
      });
    }

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save TK 209 Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `tk209_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'TK 209 Analysis',
      tank: 'TK 209',
      unit: 'TK 209',
      frequency: 'Once in a shift',
      rows: payload.rows,
      parameters: payload.parameters,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert by date
    const existingIndex = tk209Records.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      tk209Records[existingIndex] = { ...tk209Records[existingIndex], ...record };
    } else {
      tk209Records.unshift(record);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_209_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 209 Analysis saved for date: ${payload.date} (FNH3, CNH3, TCL, PCL).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log TK 209 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'TK 209 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[TK209Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 209 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 209 Analysis records
 * @route   GET /api/tk-209-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let filtered = [...tk209Records];

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
    console.error('[TK209Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving TK 209 records.',
    });
  }
});

module.exports = router;
