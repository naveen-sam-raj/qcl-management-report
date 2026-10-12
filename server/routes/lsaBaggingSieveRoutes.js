const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for LSA Bagging Sieve records
const lsaBaggingSieveRecords = [
  {
    id: 'lsa_sieve_seed_1',
    date: '2026-09-13',
    plant: 'SA',
    unit: 'LSA Bagging Sieve',
    analysisType: 'LSA Bagging Sieve Analysis',
    rows: [
      { id: 'r1', time: '09:30', p10: '0.1', p30: '0.4', p60: '4.0', m60: '4.5' },
      { id: 'r2', time: '10:30', p10: '0.1', p30: '0.4', p60: '4.1', m60: '4.6' },
      { id: 'r3', time: '11:30', p10: '0.1', p30: '0.4', p60: '4.0', m60: '4.5' },
      { id: 'r4', time: '14:30', p10: '0.1', p30: '0.3', p60: '4.2', m60: '4.6' },
    ],
    submittedBy: 'Shift Chemist (231)',
    submittedAt: new Date('2026-09-13T10:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save LSA Bagging Sieve Analysis data
 * @route   POST /api/lsa-bagging-sieve
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA Bagging Sieve Analysis.',
      });
    }

    const rows = payload.rows || [];
    const errors = [];

    if (Array.isArray(rows)) {
      rows.forEach((row, index) => {
        ['p10', 'p30', 'p60', 'm60', 'bss10', 'bss30', 'm30', 'bss60'].forEach((field) => {
          const val = row[field];
          if (val !== '' && val !== null && val !== undefined) {
            if (isNaN(Number(val))) {
              errors.push(`Row ${index + 1} (${row.time || 'Unknown time'}): ${field.toUpperCase()} must be a valid number.`);
            }
          }
        });
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter valid numbers only.',
        errors,
      });
    }

    const record = {
      id: `lsa_sieve_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      unit: 'LSA Bagging Sieve',
      analysisType: 'LSA Bagging Sieve Analysis',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = lsaBaggingSieveRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      lsaBaggingSieveRecords[existingIndex] = { ...lsaBaggingSieveRecords[existingIndex], ...record };
    } else {
      lsaBaggingSieveRecords.unshift(record);

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

    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'LSA_BAGGING_SIEVE_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `LSA Bagging Sieve Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA Bagging Sieve activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'LSA Bagging Sieve Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LSABaggingSieve API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing LSA Bagging Sieve analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve LSA Bagging Sieve records
 * @route   GET /api/lsa-bagging-sieve
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...lsaBaggingSieveRecords];

    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const query = { date, analysisType: 'LSA Bagging Sieve Analysis', plantCode: 'OFFSET' };
          if (req.user && req.user.company) {
            query.company = req.user.company._id || req.user.company;
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
    console.error('[LSABaggingSieve API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving LSA Bagging Sieve records.',
    });
  }
});

module.exports = router;
