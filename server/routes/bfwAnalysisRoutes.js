const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for BFW / SHS Analysis records
const bfwRecords = [
  {
    id: 'bfw_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    unit: 'BFW',
    analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
    readings: [
      {
        id: 'r1',
        stream: 'Boiler Feed Water (BFW)',
        time: '15:00',
        ph: '9',
        cond: '36.8',
        tAlk: '10',
        sio2: '0.26',
        fe2o3: '',
        th: '0',
      },
      {
        id: 'r2',
        stream: 'Super Heated Steam (SHS)',
        time: '15:00',
        ph: '7.6',
        cond: '7.3',
        tAlk: '6',
        sio2: '0.14',
        fe2o3: '',
        th: '',
      },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T15:30:00Z').toISOString(),
  },
];

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

    // Upsert by date
    const existingIndex = bfwRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      bfwRecords[existingIndex] = { ...bfwRecords[existingIndex], ...record };
    } else {
      bfwRecords.unshift(record);
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
    if (bfwRecords.length > 50) {
      bfwRecords.pop();
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
    const { date, plant } = req.query;

    if (date) {

      try {
        if (PlantAnalysisRecord) {
          const query = { date, analysisType: 'Boiler Feed Water / Super Heated Steam Analysis', plantCode: plant || 'OFFSET' };
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

      const match = bfwRecords.find(
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
      count: bfwRecords.length,
      data: bfwRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/bfw-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch BFW Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
