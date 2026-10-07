const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for Raw Salt records
const rawSaltRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Raw Salt Analysis data (NaCl %, Ca %, Mg %, SO4 %, IR %, H2O %)
 * @route   POST /api/raw-salt-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Raw Salt Analysis.',
      });
    }

    const { parameters = {} } = payload;
    const errors = [];

    // Validate parameters
    ['nacl', 'ca', 'mg', 'so4', 'ir', 'h2o'].forEach((key) => {
      const val = parameters[key];
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Parameter '${key.toUpperCase()}' must be a valid number.`);
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
      id: `raw_salt_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'Raw Salt Analysis',
      parameters: {
        nacl: parameters.nacl || '',
        ca: parameters.ca || '',
        mg: parameters.mg || '',
        so4: parameters.so4 || '',
        ir: parameters.ir || '',
        h2o: parameters.h2o || '',
      },
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    rawSaltRecords.unshift(record);

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
          action: 'RAW_SALT_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Raw Salt Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log Raw Salt activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Raw Salt Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[RawSalt API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Raw Salt analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Raw Salt Analysis records
 * @route   GET /api/raw-salt-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...rawSaltRecords];

    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const query = { date };
          query.analysisType = 'Raw Salt Analysis';
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
    console.error('[RawSalt API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving Raw Salt analysis records.',
    });
  }
});

module.exports = router;
