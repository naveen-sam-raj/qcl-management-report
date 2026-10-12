const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for Lean analysis records
const leanRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Lean Analysis data (Shift: Loading, Alk, Foam Height, Collapse Time; Day: HSS, Density, TSS)
 * @route   POST /api/lean-analysis
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
        message: 'Analysis Date is required to save Lean Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `lean_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'CO2',
      analysisType: payload.analysisType || 'Lean Analysis',
      tank: 'Lean',
      unit: 'Lean',
      frequency: 'Shift & Day',
      rows: payload.rows,
      parameters: payload.parameters || payload.rows?.shift1 || {},
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert in in-memory array by date
    const existingIndex = leanRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      leanRecords[existingIndex] = { ...leanRecords[existingIndex], ...record };
    } else {
      leanRecords.unshift(record);
    }

    // Persist to MongoDB Atlas via PlantAnalysisRecord model if available
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plant: 'CO2',
            analysisType: 'Lean Analysis',
            date: payload.date,
          },
          {
            $set: {
              plant: 'CO2',
              analysisType: 'Lean Analysis',
              unit: 'Lean',
              date: payload.date,
              shift: 'Shift & Day',
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
      console.warn('[LeanAnalysis API] MongoDB persistence note:', dbErr.message);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'LEAN_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Lean Analysis saved for date: ${payload.date} (Shift: Loading, Alk, Foam Height, Collapse Time; Day: HSS, Density, TSS).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log Lean activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Lean Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LeanAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Lean analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Lean Analysis records
 * @route   GET /api/lean-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    // Check MongoDB first
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
      const query = {
        plant: 'CO2',
        analysisType: 'Lean Analysis',
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

    let filtered = [...leanRecords];
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
    console.error('[LeanAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Lean analysis records: ' + error.message,
    });
  }
});

module.exports = router;
