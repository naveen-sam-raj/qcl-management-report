const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { ActivityLog } = require('../models');

// In-memory / cache storage for pure salt records
const analysisRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Pure Salt Analysis data with strict tolerance and target validation
 * @route   POST /api/pure-salt-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // ── Enforce strict backend validation ──────────────────────────────────
    const validation = validateAnalysisPayload(payload);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. One or more values exceed allowed plant tolerance limits.',
        errors: validation.errors,
        errorDetails: validation.errorDetails,
      });
    }

    // Record creation
    const record = {
      id: `psa_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'Pure Salt Analysis',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    analysisRecords.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'PURE_SALT_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Pure Salt Analysis saved for date: ${payload.date} with all parameters in spec.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      // Non-blocking log failure
      console.warn('[ActivityLog] Could not log activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Pure Salt Analysis data verified and saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[PureSaltAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing analysis data: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Pure Salt Analysis records
 * @route   GET /api/pure-salt-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let filtered = [...analysisRecords];

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
