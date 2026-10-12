const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for ACL 300# records
const acl300Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save ACL 300# Analysis data (Shift 1, Shift 2, Shift 3 for [+18%, +44%, NaCl%])
 * @route   POST /api/acl-300-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save ACL 300# Analysis.',
      });
    }

    const { shifts = {} } = payload;
    const errors = [];

    // Validate shift parameters: shift1, shift2, shift3
    ['shift1', 'shift2', 'shift3'].forEach((shiftKey) => {
      const shiftData = shifts[shiftKey] || {};
      ['p18', 'p44', 'nacl'].forEach((paramKey) => {
        const val = shiftData[paramKey];
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Shift '${shiftKey.toUpperCase()}' parameter '${paramKey.toUpperCase()}' must be a valid number.`);
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
      id: `acl_300_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'ACL 300# Analysis',
      shifts: {
        shift1: shifts.shift1 || { p18: '', p44: '', nacl: '' },
        shift2: shifts.shift2 || { p18: '', p44: '', nacl: '' },
        shift3: shifts.shift3 || { p18: '', p44: '', nacl: '' },
      },
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    acl300Records.unshift(record);

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
      console.warn('MongoDB PlantAnalysisRecord save note:', dbErr.message);
    }


    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'ACL_300_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `ACL 300# Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log ACL 300# activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'ACL 300# Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[ACL300 API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing ACL 300# analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve ACL 300# Analysis records
 * @route   GET /api/acl-300-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { PlantAnalysisRecord } = require('../models');

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'ACL 300# Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
      
      if (doc && doc.data) {
        return res.status(200).json({
          success: true,
          data: [doc.data]
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('[ACL GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
