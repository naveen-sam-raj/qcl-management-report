const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for TK1251 analysis records
const tk1251Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save TK1251 Analysis data (Once in a shift: pH, ALK)
 * @route   POST /api/tk1251-analysis
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
        message: 'Analysis Date is required to save TK1251 Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `tk1251_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'CO2',
      analysisType: payload.analysisType || 'TK1251 Analysis',
      tank: 'TK1251',
      unit: 'TK1251',
      frequency: 'Once in a shift',
      rows: payload.rows,
      parameters: payload.parameters || payload.rows?.shift1 || {},
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert in in-memory array by date
    const existingIndex = tk1251Records.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      tk1251Records[existingIndex] = { ...tk1251Records[existingIndex], ...record };
    } else {
      tk1251Records.unshift(record);
    }

    // Persist to MongoDB Atlas via PlantAnalysisRecord model if available
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plant: 'CO2',
            analysisType: 'TK1251 Analysis',
            date: payload.date,
          },
          {
            $set: {
              plant: 'CO2',
              analysisType: 'TK1251 Analysis',
              unit: 'TK1251',
              tank: 'TK1251',
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
      console.warn('[TK1251Analysis API] MongoDB persistence note:', dbErr.message);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK1251_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK1251 Analysis saved for date: ${payload.date} (pH, ALK).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log TK1251 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'TK1251 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[TK1251Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK1251 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK1251 Analysis records
 * @route   GET /api/tk1251-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    // Check MongoDB first
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
      const query = {
        plant: 'CO2',
        analysisType: 'TK1251 Analysis',
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

    let filtered = [...tk1251Records];
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
    console.error('[TK1251Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve TK1251 analysis records: ' + error.message,
    });
  }
});

module.exports = router;
