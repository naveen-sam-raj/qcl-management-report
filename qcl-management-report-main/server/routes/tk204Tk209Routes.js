const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for TK 204 / TK 209 Analysis records
const tk204Tk209Records = [
  {
    id: 'tk204_209_seed_1',
    date: '2026-09-14',
    plant: 'ACL',
    unit: 'TK 204 / TK 209',
    analysisType: 'TK 204 / TK 209 Analysis',
    parameters: {
      fnh3: { tk204: '2.92', tk209: '1.64' },
      cnh3: { tk204: '3.60', tk209: '3.20' },
      tcl:  { tk204: '5.28', tk209: '4.40' },
      pcl:  { tk204: '1.68', tk209: '1.20' },
    },
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T10:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save TK 204 / TK 209 Analysis data
 * @route   POST /api/tk204-tk209-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save TK 204 / TK 209 Analysis.',
      });
    }

    const parameters = payload.parameters || {};
    const errors = [];
    const fields = ['fnh3', 'cnh3', 'tcl', 'pcl'];

    fields.forEach((f) => {
      const pData = parameters[f] || {};
      ['tk204', 'tk209'].forEach((tank) => {
        const val = pData[tank];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${f.toUpperCase()} (${tank.toUpperCase()}) must be a valid number.`);
          }
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

    const record = {
      id: `tk204_209_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      unit: 'TK 204 / TK 209',
      analysisType: 'TK 204 / TK 209 Analysis',
      parameters,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = tk204Tk209Records.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      tk204Tk209Records[existingIndex] = { ...tk204Tk209Records[existingIndex], ...record };
    } else {
      tk204Tk209Records.unshift(record);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK204_TK209_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 204 / TK 209 Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log TK 204 / TK 209 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'TK 204 / TK 209 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[TK204/TK209 API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 204 / TK 209 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 204 / TK 209 Analysis records
 * @route   GET /api/tk204-tk209-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...tk204Tk209Records];

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
    console.error('[TK204/TK209 API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving TK 204 / TK 209 records.',
    });
  }
});

module.exports = router;
