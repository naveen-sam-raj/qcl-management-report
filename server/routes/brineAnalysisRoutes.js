const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for brine analysis records
// removed memory cache

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Brine Analysis data (TK 109, TK 110)
 * @route   POST /api/brine-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const { sendAnalysisNotification } = require('../services/emailService');

    const payload = req.body;
    payload.plant = 'ACL';
    payload.analysisType = 'Brine Analysis';

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Brine Analysis.',
      });
    }

    const validationPayload = { ...payload, plant: 'tfl' };
    const validation = validateAnalysisPayload(validationPayload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }
    


    const rows = payload.rows || {};
    const errors = [];

    // Validate numeric values if entered
    Object.entries(rows).forEach(([rowKey, paramValues]) => {
      if (typeof paramValues !== 'object' || paramValues === null) return;
      Object.entries(paramValues).forEach(([paramKey, val]) => {
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`${rowKey.toUpperCase()} - ${paramKey.toUpperCase()} must be a valid number.`);
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

    // Record creation
    const record = {
      id: `brine_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'Brine Analysis',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    let savedRecord;
    try {
      if (PlantAnalysisRecord) {
        savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: 'ACL',
            analysisType: 'Brine Analysis',
            date: payload.date,
            shift: '', // Using empty shift to store both tanks for the day
          },
          {
            $set: {
              plantName: 'ACL Plant',
              plantCode: 'ACL',
              analysisType: 'Brine Analysis',
              unit: 'g/L',
              date: payload.date,
              shift: '',
              data: { rows: payload.rows },
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              company: req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending',
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
         throw new Error("Model missing");
      }
    } catch (dbErr) {
      console.error('MongoDB PlantAnalysisRecord save failure:', dbErr.message);
      return res.status(500).json({ success: false, message: 'Server error while processing Brine Analysis: ' + dbErr.message });
    }

    // Attempt to notify
    try {
      if (savedRecord) {
         sendAnalysisNotification(savedRecord).catch(err => console.error('[Email Notification Failed]:', err.message));
      }
    } catch (e) {
      console.error('[Email Dispatcher Error]', e.message);
    }


    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'BRINE_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Brine Analysis saved for date: ${payload.date} (TK 109, TK 110).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log brine activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Brine Analysis recorded and saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[BrineAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing brine analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Brine Analysis records
 * @route   GET /api/brine-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    
    let dbRecords = [];
    if (PlantAnalysisRecord) {
      const query = { plantCode: 'ACL', analysisType: 'Brine Analysis' };
      if (date) query.date = date;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
      }
      if (req.user && req.user.company) {
        query.company = req.user.company;
      }
      
      const records = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      dbRecords = records.map(doc => ({
         date: doc.date,
         rows: doc.data?.rows || {}
      }));
    }

    return res.status(200).json({
      success: true,
      count: dbRecords.length,
      data: dbRecords,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
