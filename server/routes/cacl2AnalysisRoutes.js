const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache storage for CaCl2 Analysis records
const cacl2Records = [
  {
    id: 'cacl2_seed_1',
    date: '2026-09-14',
    plant: 'ACL',
    unit: 'CaCl2',
    frequency: 'Day',
    analysisType: 'CaCl2 Analysis',
    readings: [
      {
        id: 'r1',
        time: '08:00',
        ph: '7.7',
        conc: '20',
        fnh3: '1000',
        cnh3: '500',
        ss: '60',
      },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T08:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save CaCl2 Analysis data
 * @route   POST /api/cacl2-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    
    payload.plant = 'ACL';
    payload.analysisType = 'CaCl2 Analysis';
    
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
        message: 'Analysis Date is required to save CaCl2 Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];
    const numericFields = ['ph', 'conc', 'fnh3', 'cnh3', 'ss'];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum}: ${field.toUpperCase()} must be a valid number.`);
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
      id: `cacl2_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      unit: 'CaCl2',
      frequency: 'Day',
      analysisType: 'CaCl2 Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert into in-memory storage
    const existingIndex = cacl2Records.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      cacl2Records[existingIndex] = { ...cacl2Records[existingIndex], ...record };
    } else {
      // Cache push removed
    }

    if (cacl2Records.length > 50) {
      cacl2Records.pop();
    }

    // Persist to MongoDB PlantAnalysisRecord if model available
    try {
      if (PlantAnalysisRecord) {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: 'ACL',
            analysisType: 'CaCl2 Analysis',
            date: payload.date,
          },
          {
            plantName: 'ACL Plant',
            plantCode: 'ACL',
            analysisType: 'CaCl2 Analysis',
            unit: 'CaCl2',
            date: payload.date,
            data: { readings },
            submittedBy: record.submittedBy,
            submittedById: req.user?._id,
            company: req.user?.company?._id || req.user?.company,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (dbErr) {
      console.error('DB Error:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed' });
    }

    // Log user activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `Recorded CaCl2 Analysis for date ${payload.date}`,
            plant: record.plant,
            unit: 'CaCl2',
          },
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `CaCl2 Analysis for ${payload.date} saved successfully!`,
      data: record,
    });
  } catch (error) {
    console.error('Error in POST /api/cacl2-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save CaCl2 Analysis record.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get CaCl2 Analysis data (by date or latest)
 * @route   GET /api/cacl2-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    if (date) {
      // Check MongoDB first if available
      try {
        if (PlantAnalysisRecord) {
          const doc = await PlantAnalysisRecord.findOne({
            plantCode: 'ACL',
            analysisType: 'CaCl2 Analysis',
            date,
          }).lean();

          if (doc) {
            return res.status(200).json({
              success: true,
              data: {
                id: doc._id,
                date: doc.date,
                plant: doc.plantCode,
                unit: doc.unit,
                readings: doc.data?.readings || [],
                submittedBy: doc.submittedBy,
                submittedAt: doc.createdAt,
              },
            });
          }
        }
      } catch (dbErr) {
        console.warn('MongoDB lookup note:', dbErr.message);
      }

      const match = cacl2Records.find(
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
      count: cacl2Records.length,
      data: cacl2Records,
    });
  } catch (error) {
    console.error('Error in GET /api/cacl2-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CaCl2 Analysis records.',
      error: error.message,
    });
  }
});

module.exports = router;
