const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for LSA Bagging records
const lsaBaggingRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save LSA Bagging Analysis data (Once in a Shift + 1 Hr Once)
 * @route   POST /api/lsa-bagging
 * @route   POST /api/lsa-bagging-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA Bagging Analysis.',
      });
    }

    const { shiftAnalysis = {}, hourlyReadings = [] } = payload;
    const errors = [];

    // Validate shift-wise parameters (Na2CO3, NaCl, Fe, Na2SO4, VM, IR, BD, Turbidity)
    const shiftKeys = ['shift1', 'shift2', 'shift3'];
    const shiftParams = ['na2co3', 'nacl', 'fe', 'na2so4', 'vm', 'ir', 'bd', 'turbidity'];

    shiftKeys.forEach((shiftKey) => {
      const shiftData = shiftAnalysis[shiftKey] || {};
      shiftParams.forEach((paramKey) => {
        const val = shiftData[paramKey];
        if (val !== undefined && val !== null && val !== '') {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Shift parameter '${shiftKey}.${paramKey}' must be a valid number.`);
          }
        }
      });
    });

    // Validate hourly parameters (NaCl, BD)
    if (Array.isArray(hourlyReadings)) {
      hourlyReadings.forEach((reading, idx) => {
        ['nacl', 'bd'].forEach((param) => {
          const val = reading[param];
          if (val !== undefined && val !== null && val !== '') {
            const num = Number(val);
            if (isNaN(num)) {
              errors.push(`Hourly reading at ${reading.time || `row ${idx + 1}`} '${param}' must be a valid number.`);
            }
          }
        });
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please enter valid numeric values only.',
        errors,
      });
    }

    // Record creation
    const record = {
      id: `lsa_bagging_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      plantId: payload.plantId || 'sa',
      analysisType: payload.analysisType || 'LSA Bagging Analysis',
      shiftAnalysis: {
        shift1: shiftAnalysis.shift1 || {},
        shift2: shiftAnalysis.shift2 || {},
        shift3: shiftAnalysis.shift3 || {},
      },
      hourlyReadings: hourlyReadings || [],
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    lsaBaggingRecords.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'LSA_BAGGING_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `LSA Bagging Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA Bagging activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'LSA Bagging Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LSABagging API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing LSA Bagging analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Get LSA Bagging Analysis records (optional ?date=YYYY-MM-DD)
 * @route   GET /api/lsa-bagging
 * @route   GET /api/lsa-bagging-analysis
 * @access  Private
 */
router.get('/', (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      const filtered = lsaBaggingRecords.filter((r) => r.date === date);
      return res.status(200).json({
        success: true,
        data: filtered[0] || null,
      });
    }

    return res.status(200).json({
      success: true,
      count: lsaBaggingRecords.length,
      data: lsaBaggingRecords.slice(0, 30),
    });
  } catch (error) {
    console.error('[LSABagging API] Error retrieving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving LSA Bagging analysis.',
    });
  }
});

module.exports = router;
