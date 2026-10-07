const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for Fly Ash Analysis records
const flyAshRecords = [
  {
    id: 'flyash_seed_1',
    date: '2026-09-14',
    plant: 'OFFSET',
    unit: 'FLY ash',
    analysisType: 'Fly Ash Analysis',
    readings: [
      { id: 'r1', time: '07:00', combustible: '1.2', gcv: '94' },
      { id: 'r2', time: '15:00', combustible: '', gcv: '' },
      { id: 'r3', time: '23:00', combustible: '', gcv: '' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T07:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Fly Ash Analysis data
 * @route   POST /api/fly-ash-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Fly Ash Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      if (reading.combustible !== '' && reading.combustible !== null && reading.combustible !== undefined) {
        if (isNaN(Number(reading.combustible))) {
          errors.push(`Row #${rowNum}: Combustible % must be a valid number.`);
        }
      }
      if (reading.gcv !== '' && reading.gcv !== null && reading.gcv !== undefined) {
        if (isNaN(Number(reading.gcv))) {
          errors.push(`Row #${rowNum}: GCV (Kcals/kg) must be a valid number.`);
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
      id: `flyash_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: 'FLY ash',
      analysisType: 'Fly Ash Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = flyAshRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      flyAshRecords[existingIndex] = { ...flyAshRecords[existingIndex], ...record };
    } else {
      flyAshRecords.unshift(record);

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
    if (flyAshRecords.length > 50) {
      flyAshRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Fly Ash Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'FLY ash',
          },
        });
      }
    } catch (logErr) {
      // Non-blocking log error
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Fly Ash Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/fly-ash-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Fly Ash Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Fly Ash Analysis data (by date or latest)
 * @route   GET /api/fly-ash-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {

      try {
        if (PlantAnalysisRecord) {
          const query = { date };
          if (req.user && req.user.company) {
            query.company = req.user.company;
          }
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

      const match = flyAshRecords.find(
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
      count: flyAshRecords.length,
      data: flyAshRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/fly-ash-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Fly Ash Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
