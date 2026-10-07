const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for ACL Product records
const aclProductRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save ACL Product Analysis data (Chemical & BSS Sieve specs)
 * @route   POST /api/acl-product
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save ACL Product Analysis.',
      });
    }

    const { chemical = {}, bss = {} } = payload;
    const errors = [];

    // Validate chemical values
    Object.entries(chemical).forEach(([key, val]) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Chemical parameter '${key.toUpperCase()}' must be a valid number.`);
      }
    });

    // Validate BSS values
    Object.entries(bss).forEach(([key, val]) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`BSS parameter '${key}' must be a valid number.`);
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
      id: `acl_prod_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'ACL Product Analysis',
      chemical,
      bss,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    aclProductRecords.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'ACL_PRODUCT_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `ACL Product Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log ACL Product activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'ACL Product Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[ACLProduct API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing ACL Product analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve ACL Product Analysis records
 * @route   GET /api/acl-product
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...aclProductRecords];

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
    console.error('[ACLProduct API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving ACL Product analysis records.',
    });
  }
});

module.exports = router;
