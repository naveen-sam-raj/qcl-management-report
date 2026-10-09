const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for Vacuum Seal Water Analysis records
// In-memory cache removed — all persistence via MongoDB

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Vacuum Seal Water Analysis data
 * @route   POST /api/vacuum-seal-water
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
        message: 'Analysis Date is required to save Vacuum Seal Water Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      ['fnh3', 'cnh3'].forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}): ${field.toUpperCase()} must be a valid number.`);
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
      id: `vacuum_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: payload.unit || 'Vaccum seal water',
      analysisType: 'Vacuum Seal Water Analysis',
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
            analysisType: 'Vacuum Seal Water Analysis',
            date: payload.date,
            shift: payload.shift || '',
          },
          {
            $set: {
              plantName: 'OFFSET Plant',
              plantCode: 'OFFSET',
              analysisType: 'Vacuum Seal Water Analysis',
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
      console.error('[Vacuum Seal Water Analysis] Database save failed:', dbErr.message);
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
            message: `Recorded Vacuum Seal Water Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Vaccum seal water',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Vacuum Seal Water Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/vacuum-seal-water:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Vacuum Seal Water Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Vacuum Seal Water Analysis data (by date or latest)
 * @route   GET /api/vacuum-seal-water
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;
    
    const query = { plantCode: 'OFFSET', analysisType: 'Vacuum Seal Water Analysis' };
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
    console.error('Error in GET /api/vacuum-seal-water:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch records.', error: error.message });
  }
});

module.exports = router;
