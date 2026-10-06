const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for LEAN Weekly analysis records
const leanWeeklyRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save LEAN Analysis data (Once in a Week: Cl, SO4, Fe, TSS, Na, K, NO2, NO3 in PPM)
 * @route   POST /api/lean-weekly-analysis
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
        message: 'Analysis Date is required to save LEAN Weekly Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `lean_weekly_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'CO2',
      analysisType: payload.analysisType || 'LEAN Analysis',
      tank: 'LEAN',
      unit: 'LEAN',
      frequency: 'Once in a Week',
      rows: payload.rows,
      parameters: payload.parameters || payload.rows?.week || payload.rows?.onceInAWeek || {},
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert in in-memory array by date
    const existingIndex = leanWeeklyRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      leanWeeklyRecords[existingIndex] = { ...leanWeeklyRecords[existingIndex], ...record };
    } else {
      leanWeeklyRecords.unshift(record);
    }

    // Persist to MongoDB Atlas via PlantAnalysisRecord model if available
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plant: 'CO2',
            analysisType: 'LEAN Weekly Analysis',
            date: payload.date,
          },
          {
            $set: {
              plant: 'CO2',
              analysisType: 'LEAN Weekly Analysis',
              unit: 'LEAN',
              tank: 'LEAN',
              date: payload.date,
              shift: 'Once in a Week',
              frequency: 'Once in a Week',
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              data: {
                rows: payload.rows,
                parameters: payload.parameters || payload.rows?.week || {},
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
      console.warn('[LeanWeeklyAnalysis API] MongoDB persistence note:', dbErr.message);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'LEAN_WEEKLY_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `LEAN Weekly Analysis saved for date: ${payload.date} (Cl, SO4, Fe, TSS, Na, K, NO2, NO3 in PPM).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LEAN Weekly activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'LEAN Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LeanWeeklyAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing LEAN analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve LEAN Weekly Analysis records
 * @route   GET /api/lean-weekly-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    // Check MongoDB first
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
      const query = {
        plant: 'CO2',
        analysisType: 'LEAN Weekly Analysis',
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

    let filtered = [...leanWeeklyRecords];
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
    console.error('[LeanWeeklyAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve LEAN weekly analysis records: ' + error.message,
    });
  }
});

module.exports = router;
