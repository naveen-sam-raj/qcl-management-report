const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for DM Water / Anion Unit Analysis records
// In-memory cache removed — all persistence via MongoDB

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save DM Water / Anion Unit Analysis data
 * @route   POST /api/dm-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // Server-side validation
    const { validateAnalysisPayload } = require('../services/analysisValidation');
    
    // Create a sanitized payload for generic validation to prevent string fields from failing the numeric check
    const validationPayload = JSON.parse(JSON.stringify(payload));
    validationPayload.plant = 'OFFSET';
    validationPayload.analysisType = 'DM Water Analysis';
    
    if (Array.isArray(validationPayload.readings)) {
      validationPayload.readings.forEach(r => {
        delete r.stream;
        delete r.time;
        if (r.th && String(r.th).toLowerCase() === 'nil') delete r.th;
      });
    }

    const validation = validateAnalysisPayload(validationPayload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }


    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save DM Water Analysis.',
      });
    }

    const readings = payload.readings || [];
    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one analytical reading row is required.',
      });
    }

    const numericFields = ['ph', 'cond', 'alk', 'p', 'm', 'th', 'sio2'];
    const errors = [];

    readings.forEach((reading, index) => {
      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (field === 'th' && (String(val).toLowerCase() === 'nil' || String(val).toLowerCase() === '0')) {
            return;
          }
          if (isNaN(Number(val))) {
            errors.push(`Row ${index + 1} (${reading.unit || 'Sample'}) -> ${field.toUpperCase()} must be a valid number.`);
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
      id: `dm_water_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: payload.unit || 'DM Water',
      analysisType: 'Analysis For DM Water / Anion unit',
      readings,
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
            analysisType: 'DM Water Analysis',
            date: payload.date,
            shift: payload.shift || '',
          },
          {
            $set: {
              plantName: 'OFFSET Plant',
              plantCode: 'OFFSET',
              analysisType: 'DM Water Analysis',
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
      console.error('[DM Water Analysis] Database save failed:', dbErr.message);
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
          action: 'DM_WATER_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `DM Water & Anion Unit Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log DM Water activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'DM Water & Anion Unit Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[DMWaterAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing DM Water analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve DM Water / Anion Unit Analysis records
 * @route   GET /api/dm-water-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;
    
    const query = { plantCode: 'OFFSET', analysisType: 'DM Water Analysis' };
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
    console.error('Error in GET /api/dm-water-analysis:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch records.', error: error.message });
  }
});

module.exports = router;
