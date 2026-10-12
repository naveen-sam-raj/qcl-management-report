const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for pure salt sieve records
const sieveRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Pure Salt Sieve Analysis data (I Shift, II Shift, III Shift)
 * @route   POST /api/pure-salt-sieve-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Validate payload against format and limits
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || 'Validation failed. Enter numeric values only.',
        errors: validation.errors,
      });
    }

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Sieve Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `pssa_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'Pure Salt Sieve Analysis',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    sieveRecords.unshift(record);

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
          action: 'PURE_SALT_SIEVE_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Pure Salt Sieve Analysis saved for date: ${payload.date} (3 Shifts).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log sieve activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Pure Salt Sieve Analysis saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[PureSaltSieveAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing sieve analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Pure Salt Sieve Analysis records
 * @route   GET /api/pure-salt-sieve-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { PlantAnalysisRecord } = require('../models');

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Sieve Analysis' };
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
