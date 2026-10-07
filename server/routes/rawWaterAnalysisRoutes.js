const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for Raw Water Analysis records
const rawWaterRecords = [
  {
    id: 'rawwater_seed_1',
    date: '2026-09-14',
    time: '08:00',
    plant: 'OFFSET',
    unit: 'Raw Water',
    analysisType: 'Raw Water Analysis',
    parameters: {
      ph: '7.6',
      cond: '211',
      turbidity: '8',
      tds: '137',
      freeCl2: '0',
      fe: '0.30',
      sio2: '5',
      mAlk: '56',
      th: '60',
      caH: '36',
      mgH: '24',
      cl: '30',
      so4: '15',
      ema: '45',
    },
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T08:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Raw Water Analysis data
 * @route   POST /api/raw-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Raw Water Analysis.',
      });
    }

    const params = payload.parameters || {};
    const errors = [];
    const numericKeys = [
      'ph', 'cond', 'turbidity', 'tds', 'freeCl2', 'fe',
      'sio2', 'mAlk', 'th', 'caH', 'mgH', 'cl', 'so4', 'ema'
    ];

    numericKeys.forEach((key) => {
      const val = params[key];
      if (val !== '' && val !== null && val !== undefined) {
        if (isNaN(Number(val))) {
          errors.push(`${key.toUpperCase()} must be a valid number.`);
        }
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
      id: `rawwater_${Date.now()}`,
      date: payload.date,
      time: payload.time || '',
      plant: payload.plant || 'OFFSET',
      unit: 'Raw Water',
      analysisType: 'Raw Water Analysis',
      parameters: params,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = rawWaterRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      rawWaterRecords[existingIndex] = { ...rawWaterRecords[existingIndex], ...record };
    } else {
      rawWaterRecords.unshift(record);

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

    // Keep memory cache under 50 records
    if (rawWaterRecords.length > 50) {
      rawWaterRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Raw Water Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Raw Water',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Raw Water Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/raw-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Raw Water Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Raw Water Analysis data (by date or latest)
 * @route   GET /api/raw-water-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {

      try {
        if (PlantAnalysisRecord) {
          const query = { date };
          
          
          const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
          if (doc && doc.data) {
            return res.status(200).json({
              success: true,
              data: doc.data
            });
          }
        }
      } catch (dbErr) {
        console.warn('MongoDB lookup note:', dbErr.message);
      }

      const match = rawWaterRecords.find(
        (r) => r.date === date && (!plant || r.plant.toLowerCase() === plant.toLowerCase())
      );
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
        });
      }
      return res.status(200).json({
        success: true,
        data: null,
        message: `No record found for date ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      count: rawWaterRecords.length,
      data: rawWaterRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/raw-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Raw Water Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
