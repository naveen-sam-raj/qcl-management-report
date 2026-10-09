const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for PCL/TCL & +18 analysis records
// Removed cache

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

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    
    payload.plant = 'ACL';
    payload.analysisType = 'PCL/TCL Analysis';
    
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }
  

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save PCL/TCL Analysis.',
      });
    }

    const { shiftRows = {}, timeRows = {}, plus18Row = {} } = payload;
    const errors = [];

    // Validate shift row values (I Shift, II Shift, III Shift across Streams A - H)
    Object.entries(shiftRows).forEach(([shiftKey, streamValues]) => {
      if (typeof streamValues !== 'object' || streamValues === null) return;
      Object.entries(streamValues).forEach(([streamKey, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Shift '${shiftKey}', Stream '${streamKey.toUpperCase()}' must be a valid number.`);
        }
      });
    });

    // Validate time row values (backward compatibility)
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

    // Validate +18 % row values (backward compatibility)
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
      analysisType: payload.analysisType || 'PCL/TCL Analysis',
      shiftRows,
      timeRows,
      plus18Row,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Cache push removed

    // Persist to MongoDB PlantAnalysisRecord
    try {
      if (PlantAnalysisRecord) {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: record.plant || 'Unknown',
            analysisType: record.analysisType || 'Unknown',
            date: record.date,
          },
          {
            plantName: record.plant || 'Plant',
            plantCode: record.plant || 'Unknown',
            analysisType: record.analysisType || 'Unknown',
            unit: record.unit || '',
            date: record.date,
            data: record,
            submittedBy: record.submittedBy || req.user?.name,
            submittedById: record.submittedById || req.user?._id,
            company: record.company || req.user?.company?._id || req.user?.company,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (dbErr) {
      console.error('DB Error:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed' });
    }


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

    let results = []; // Replaced by DB

    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const query = { date };
          query.analysisType = 'PCL/TCL Analysis';
          if (req.user && req.user.company) {
            query.company = req.user.company;
          }
          
          const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
          if (doc && doc.data) {
            return res.status(200).json({
              success: true,
              data: [doc.data] // return as array because the frontend usually expects array or we modified it to handle both
            });
          }
        }
      } catch (dbErr) {
        console.warn('MongoDB lookup note:', dbErr.message);
      }
    }


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
