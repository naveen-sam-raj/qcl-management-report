const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for BFW / SHS Analysis records
// In-memory cache removed — all persistence via MongoDB

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save BFW Analysis data
 * @route   POST /api/bfw-analysis
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
    validationPayload.analysisType = 'BFW Analysis';
    
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
        message: 'Analysis Date is required to save BFW Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];
    const numericFields = ['ph', 'cond', 'tAlk', 'alk', 'sio2', 'fe2o3'];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      // Allow 'Nil' or numeric for TH
      if (reading.th !== '' && reading.th !== null && reading.th !== undefined) {
        const thStr = String(reading.th).trim().toLowerCase();
        if (thStr !== 'nil' && thStr !== 'n' && thStr !== 'none' && thStr !== '-' && isNaN(Number(reading.th))) {
          errors.push(`Row #${rowNum} (${reading.stream || 'Reading'}): TH must be a valid number or 'Nil'.`);
        }
      }

      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.stream || 'Reading'}): ${field.toUpperCase()} must be a valid number.`);
          }
        }
      });

      // Synchronize alk and tAlk
      if (reading.alk !== undefined && reading.tAlk === undefined) {
        reading.tAlk = reading.alk;
      } else if (reading.tAlk !== undefined && reading.alk === undefined) {
        reading.alk = reading.tAlk;
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    const record = {
      id: `bfw_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: 'BFW',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
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
            analysisType: 'BFW Analysis',
            date: payload.date,
            shift: payload.shift || '',
          },
          {
            $set: {
              plantName: 'OFFSET Plant',
              plantCode: 'OFFSET',
              analysisType: 'BFW Analysis',
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
      console.error('[BFW Analysis] Database save failed:', dbErr.message);
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

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded BFW/SHS Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'BFW',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `BFW / SHS Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/bfw-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save BFW Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get BFW Analysis data (by date or latest)
 * @route   GET /api/bfw-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;
    
    const query = { plantCode: 'OFFSET', analysisType: 'BFW Analysis' };
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
    console.error('Error in GET /api/bfw-analysis:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch records.', error: error.message });
  }
});

module.exports = router;
