const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for P1256 analysis records
const p1256Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save P1256 Analysis data (Once in a shift: ALK)
 * @route   POST /api/p1256-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || 'Validation failed. Enter numeric values only.',
        errors: validation.errors,
      });
    }

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save P1256 Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `p1256_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'CO2',
      analysisType: payload.analysisType || 'P1256 Analysis',
      tank: 'P1256',
      unit: 'P1256',
      frequency: 'Once in a shift',
      rows: payload.rows,
      parameters: payload.parameters || payload.rows?.shift1 || {},
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert in in-memory array by date
    const existingIndex = p1256Records.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      p1256Records[existingIndex] = { ...p1256Records[existingIndex], ...record };
    } else {
      p1256Records.unshift(record);
    }

    // Persist to MongoDB Atlas via PlantAnalysisRecord model if available
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plant: 'CO2',
            analysisType: 'P1256 Analysis',
            date: payload.date,
          },
          {
            $set: {
              plant: 'CO2',
              analysisType: 'P1256 Analysis',
              unit: 'P1256',
              tank: 'P1256',
              date: payload.date,
              shift: 'Once in a shift',
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              data: {
                rows: payload.rows,
                parameters: payload.parameters,
              },
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
      }
    } catch (dbErr) {
      console.warn('[P1256Analysis API] MongoDB persistence note:', dbErr.message);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'P1256_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `P1256 Analysis saved for date: ${payload.date} (ALK).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log P1256 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'P1256 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[P1256Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing P1256 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve P1256 Analysis records
 * @route   GET /api/p1256-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    // Check MongoDB first
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
      const query = {
        plant: 'CO2',
        analysisType: 'P1256 Analysis',
      };
      if (date) query.date = date;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
      }
      const dbRecords = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      if (dbRecords && dbRecords.length > 0) {
        return res.status(200).json({
          success: true,
          count: dbRecords.length,
          data: dbRecords.map((r) => ({
            id: r._id,
            date: r.date,
            plant: r.plant,
            analysisType: r.analysisType,
            rows: r.data?.rows || {},
            submittedBy: r.submittedBy,
          })),
        });
      }
    }

    let filtered = [...p1256Records];
    if (date) {
      filtered = filtered.filter((r) => r.date === date);
    }
    if (startDate) {
      filtered = filtered.filter((r) => r.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((r) => r.date <= endDate);
    }

    return res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    console.error('[P1256Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve P1256 analysis records: ' + error.message,
    });
  }
});

module.exports = router;
