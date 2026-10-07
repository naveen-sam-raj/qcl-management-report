const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for LSA AT 500# analysis records
const lsa500Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save LSA AT 500# Analysis data (NaCl %)
 * @route   POST /api/lsa-500-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA AT 500# Analysis.',
      });
    }

    const rows = payload.rows || [];
    const errors = [];

    // Validate numeric values if entered
    if (Array.isArray(rows)) {
      rows.forEach((row, index) => {
        if (row.nacl !== '' && row.nacl !== null && row.nacl !== undefined) {
          const num = Number(row.nacl);
          if (isNaN(num)) {
            errors.push(`Row ${index + 1} (${row.time || 'Unknown time'}): NaCl % must be a valid number.`);
          }
        }
      });
    } else if (typeof rows === 'object' && rows !== null) {
      Object.entries(rows).forEach(([rowKey, valObj]) => {
        const val = typeof valObj === 'object' ? valObj.nacl : valObj;
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Slot '${rowKey}': NaCl % must be a valid number.`);
          }
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    // Record creation
    const record = {
      id: `lsa500_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      analysisType: payload.analysisType || 'LSA AT 500# Analysis',
      unit: 'LSA AT 500#',
      rows: payload.rows,
      averageNaCl: payload.averageNaCl || null,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    lsa500Records.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'LSA500_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `LSA AT 500# Analysis saved for date: ${payload.date} (NaCl %).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA 500# activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'LSA AT 500# Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LSA500Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing LSA AT 500# analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve LSA AT 500# Analysis records
 * @route   GET /api/lsa-500-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...lsa500Records];

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
    console.error('[LSA500Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving LSA AT 500# analysis records.',
    });
  }
});

module.exports = router;
