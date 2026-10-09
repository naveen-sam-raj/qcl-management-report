const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for ACL Product records
// Cache removed

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save ACL Product Analysis data (Chemical & BSS Sieve specs)
 * @route   POST /api/acl-product
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const { sendAnalysisNotification } = require('../services/emailService');

    const payload = req.body;
    payload.plant = 'ACL';
    payload.analysisType = 'ACL Product Analysis';

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save ACL Product Analysis.',
      });
    }

    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }
    
    // Blocked pending configuration
    return res.status(501).json({
      success: false,
      message: 'Blocked pending configuration: Server-side limits not yet verified for this analysis type.'
    });

    const { chemical = {}, bss = {}, readings = [] } = payload;
    const errors = [];

    // Validation for new 'readings' array format
    if (readings && readings.length > 0) {
      readings.forEach((r, idx) => {
        ['nh4cl', 'nacl', 'fe2o3', 'h2o', 'ir', 'bd', 'sieve_6', 'sieve_8', 'sieve_12', 'sieve_16', 'sieve_18', 'sieve_44', 'sieve_60', 'sieve_100'].forEach(key => {
          const val = r[key];
          if (val === '' || val === null || val === undefined) return;
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Row ${idx + 1}: Parameter '${key}' must be a valid number.`);
          }
        });
      });
    } else {
      // Validate old format
      Object.entries(chemical).forEach(([key, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Chemical parameter '${key.toUpperCase()}' must be a valid number.`);
        }
      });
      Object.entries(bss).forEach(([key, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`BSS parameter '${key}' must be a valid number.`);
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
      id: `acl_prod_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'ACL Product Analysis',
      chemical,
      bss,
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Replaced by validation block


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

    let results = [];
    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const query = { date, analysisType: 'ACL Product Analysis' };
          if (req.user && req.user.company) {
            query.company = req.user.company;
          }
          const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
          if (doc && doc.data) {
            return res.status(200).json({
              success: true,
              data: [doc.data]
            });
          }
        }
      } catch (dbErr) {
        return res.status(500).json({ success: false, message: 'Database error: ' + dbErr.message });
      }
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
