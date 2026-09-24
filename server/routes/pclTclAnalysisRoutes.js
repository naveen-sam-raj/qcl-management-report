const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory / cache storage for PCL/TCL & +18 analysis records
const pclTclRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save PCL/TCL & +18 Analysis data (Streams A - H, 4-hourly intervals + 18% row)
 * @route   POST /api/pcl-tcl-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save PCL/TCL Analysis.',
      });
    }

    const { timeRows = {}, plus18Row = {} } = payload;
    const errors = [];

    // Validate time row values
    Object.entries(timeRows).forEach(([timeKey, streamValues]) => {
      if (typeof streamValues !== 'object' || streamValues === null) return;
      Object.entries(streamValues).forEach(([streamKey, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Time '${timeKey}', Stream '${streamKey.toUpperCase()}' must be a valid number.`);
        }
      });
    });

    // Validate +18 % row values
    Object.entries(plus18Row).forEach(([streamKey, val]) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Row '+18 %', Stream '${streamKey.toUpperCase()}' must be a valid number.`);
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
      id: `pcl_tcl_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'PCL/TCL & +18 Analysis',
      timeRows,
      plus18Row,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    pclTclRecords.unshift(record);

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'PCL_TCL_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `PCL/TCL & +18 Analysis saved for date: ${payload.date} (Streams A-H).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log PCL/TCL activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'PCL/TCL & +18 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[PclTclAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing PCL/TCL analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve PCL/TCL Analysis records
 * @route   GET /api/pcl-tcl-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...pclTclRecords];

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
    console.error('[PclTclAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving PCL/TCL analysis records.',
    });
  }
});

module.exports = router;
