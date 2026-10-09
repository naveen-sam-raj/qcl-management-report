const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for CBD Analysis records
// In-memory cache removed — all persistence via MongoDB

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save CBD Analysis data
 * @route   POST /api/cbd-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Server-side validation — limits not yet configured
    return res.status(501).json({ success: false, message: 'Blocked pending configuration: Server-side limits not yet verified for this analysis type.' });


    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save CBD Analysis.',
      });
    }

    const shifts = payload.shifts || {};
    const errors = [];
    const fields = ['ph', 'po4', 'na2so3', 'talk', 'tfe', 'sio2', 'ss', 'tds'];

    ['iShift', 'iiShift', 'iiiShift'].forEach((sKey) => {
      const sData = shifts[sKey] || {};
      fields.forEach((f) => {
        const val = sData[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${sKey} -> ${f.toUpperCase()} must be a valid number.`);
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
      id: `cbd_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: 'CBD',
      analysisType: 'CBD Analysis',
      shifts,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Secure MongoDB persistence (nested DB write bug fixed)
    let savedRecord;
    try {
      if (PlantAnalysisRecord) {
        savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: 'OFFSET',
            analysisType: 'CBD Analysis',
            date: payload.date,
            shift: payload.shift || '',
          },
          {
            $set: {
              plantName: 'OFFSET Plant',
              plantCode: 'OFFSET',
              analysisType: 'CBD Analysis',
              unit: record.unit || '',
              date: payload.date,
              shift: payload.shift || '',
              data: record,
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              company: req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        throw new Error('PlantAnalysisRecord model not available');
      }
    } catch (dbErr) {
      console.error('[CBD Analysis] Database save failed:', dbErr.message);
      return res.status(500).json({ success: false, message: 'Database save failed: ' + dbErr.message });
    }

    // Email notification only after confirmed persistence
    try {
      const { sendAnalysisNotification } = require('../services/emailService');
      if (savedRecord) {
        sendAnalysisNotification(savedRecord).catch(e => console.error('[Email Error]:', e.message));
      }
    } catch (emailErr) {
      // Email failure must not undo saved records
      console.error('[Email Dispatch Error]:', emailErr.message);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'CBD_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `CBD Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log CBD activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'CBD Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[CBDAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing CBD analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve CBD Analysis records
 * @route   GET /api/cbd-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;
    
    const query = { plantCode: 'OFFSET', analysisType: 'CBD Analysis' };
    if (date) query.date = date;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }
    if (req.user && req.user.company) {
      query.company = req.user.company;
    }

    if (date) {
      // Single-date lookup
      try {
        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          return res.status(200).json({ success: true, data: doc.data });
        }
      } catch (dbErr) {
        return res.status(500).json({ success: false, message: 'Database error: ' + dbErr.message });
      }
      return res.status(200).json({ success: true, data: null, message: 'No record found for date ' + date });
    }

    // All records
    try {
      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      const records = docs.map(d => d.data || d);
      return res.status(200).json({ success: true, count: records.length, data: records });
    } catch (dbErr) {
      return res.status(500).json({ success: false, message: 'Database error: ' + dbErr.message });
    }
  } catch (error) {
    console.error('Error in GET /api/cbd-analysis:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch records.', error: error.message });
  }
});

module.exports = router;
