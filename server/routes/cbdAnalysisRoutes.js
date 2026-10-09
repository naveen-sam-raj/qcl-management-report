const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for CBD Analysis records
const cbdRecords = [
  {
    id: 'cbd_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    unit: 'CBD',
    analysisType: 'CBD Analysis',
    shifts: {
      iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
      iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
    },
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T10:00:00Z').toISOString(),
  },
];

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

    // Upsert by date
    const existingIndex = cbdRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      cbdRecords[existingIndex] = { ...cbdRecords[existingIndex], ...record };
    } else {
      cbdRecords.unshift(record);
    }

    // Persist to MongoDB PlantAnalysisRecord
    try {
      if (PlantAnalysisRecord) {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: record.plant || 'Unknown',
            analysisType: record.analysisType || 'Unknown',
            date: record.date,
            ...(req.user && req.user.company ? { company: req.user.company } : {}),
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
    const { date, startDate, endDate } = req.query;

    let results = [...cbdRecords];

    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const query = { date, analysisType: 'CBD Analysis' };
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
    console.error('[CBDAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving CBD records.',
    });
  }
});

module.exports = router;
