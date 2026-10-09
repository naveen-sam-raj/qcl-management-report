const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for LSA AT 500# analysis records
// Removed cache

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save LSA AT 500# Analysis data (NaCl %)
 * @route   POST /api/lsa-500-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const { sendAnalysisNotification } = require('../services/emailService');
    payload.plant = 'SA';
    payload.analysisType = 'LSA AT 500# Analysis';
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
        message: 'Analysis Date is required to save LSA AT 500# Analysis.',
      });
    }

    const rows = payload.rows || [];
    const errors = [];

    // Validate numeric values if entered
    if (Array.isArray(rows)) {
      rows.forEach((row, index) => {
        ['nacl', 'bd', 'turbidity'].forEach(f => {
          if (row[f] !== '' && row[f] !== null && row[f] !== undefined) {
            const num = Number(row[f]);
            if (isNaN(num)) {
              errors.push(`Row ${index + 1} (${row.time || 'Unknown time'}): ${f.toUpperCase()} must be a valid number.`);
            }
          }
        });
      });
    } else if (typeof rows === 'object' && rows !== null) {
      Object.entries(rows).forEach(([rowKey, valObj]) => {
        const val = typeof valObj === 'object' ? valObj.nacl : valObj;
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Slot '${rowKey}': Invalid number.`);
          }
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    // Record creation
    const record = {
      id: `lsa500_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      analysisType: payload.analysisType || 'LSA AT 500# Analysis',
      unit: 'LSA AT 500#',
      rows: payload.rows,
      averageNaCl: payload.averageNaCl || null,
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
            plantCode: 'SA',
            analysisType: 'LSA AT 500# Analysis',
            date: payload.date,
            shift: payload.shift || ''
          },
          {
            $set: {
              plantName: 'SA Plant',
              plantCode: 'SA',
              analysisType: 'LSA AT 500# Analysis',
              date: payload.date,
              shift: payload.shift || '',
              data: record,
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              company: req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending'
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else { throw new Error("Model missing"); }
    } catch (dbErr) {
      console.error('DB Save Error:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed' });
    }
    try {
      if (savedRecord) sendAnalysisNotification(savedRecord).catch(e => console.error(e));
    } catch(e) {}
  

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
          action: 'LSA500_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `LSA AT 500# Analysis saved for date: ${payload.date} (NaCl %).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA 500# activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'LSA AT 500# Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LSA500Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing LSA AT 500# analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve LSA AT 500# Analysis records
 * @route   GET /api/lsa-500-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    
    let dbRecords = [];
    if (PlantAnalysisRecord) {
      const query = { plantCode: 'SA', analysisType: 'LSA AT 500# Analysis' };
      if (date) query.date = date;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
      }
      if (req.user && req.user.company) query.company = req.user.company;
      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      dbRecords = docs.map(d => d.data || d);
    }
    let results = dbRecords;
    

    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const query = { date };
          query.analysisType = 'LSA AT 500# Analysis';
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
    console.error('[LSA500Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving LSA AT 500# analysis records.',
    });
  }
});

module.exports = router;
