const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for Bottom Ash Analysis records
const bottomAshRecords = [
  {
    id: 'bottomash_seed_1',
    date: '2026-09-14',
    plant: 'OFFSET',
    unit: 'Bottom ash',
    analysisType: 'Bottom Ash Analysis',
    readings: [
      { id: 'r1', time: '07:00', combustible: '1.0', gcv: '78', moisture: '23.7' },
      { id: 'r2', time: '15:00', combustible: '', gcv: '', moisture: '' },
      { id: 'r3', time: '23:00', combustible: '', gcv: '', moisture: '' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T07:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Bottom Ash Analysis data
 * @route   POST /api/bottom-ash-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Bottom Ash Analysis.',
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
      if (reading.moisture !== '' && reading.moisture !== null && reading.moisture !== undefined) {
        if (isNaN(Number(reading.moisture))) {
          errors.push(`Row #${rowNum}: Moisture % must be a valid number.`);
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
      id: `bottomash_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'OFFSET',
      unit: 'Bottom ash',
      analysisType: 'Bottom Ash Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = bottomAshRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      bottomAshRecords[existingIndex] = { ...bottomAshRecords[existingIndex], ...record };
    } else {
      bottomAshRecords.unshift(record);
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

    // Keep memory cache under 50 records
    if (bottomAshRecords.length > 50) {
      bottomAshRecords.pop();
    }

    // Log user activity if ActivityLog model is present
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded Bottom Ash Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'Bottom ash',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Bottom Ash Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/bottom-ash-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Bottom Ash Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Bottom Ash Analysis data (by date or latest)
 * @route   GET /api/bottom-ash-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {

      try {
        if (PlantAnalysisRecord) {
          const query = { date, analysisType: 'Bottom Ash Analysis', plantCode: plant || 'OFFSET' };
          if (req.user && req.user.company) {
            query.company = req.user.company._id || req.user.company;
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

      const match = bottomAshRecords.find(
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
      count: bottomAshRecords.length,
      data: bottomAshRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/bottom-ash-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Bottom Ash Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
