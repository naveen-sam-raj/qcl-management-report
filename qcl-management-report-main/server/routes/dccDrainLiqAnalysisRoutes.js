const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for DCC DRAIN LIQ analysis records
const dccDrainLiqRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save DCC DRAIN LIQ Analysis data (Once in a Week: Cl, SO4, Fe, TSS in PPM)
 * @route   POST /api/dcc-drain-liq-analysis
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
        message: 'Analysis Date is required to save DCC DRAIN LIQ Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `dcc_drain_liq_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'CO2',
      analysisType: payload.analysisType || 'DCC DRAIN LIQ Analysis',
      tank: 'DCC DRAIN LIQ',
      unit: 'DCC DRAIN LIQ',
      frequency: 'Once in a Week',
      rows: payload.rows,
      parameters: payload.parameters || payload.rows?.week || payload.rows?.shift1 || {},
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert in in-memory array by date
    const existingIndex = dccDrainLiqRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      dccDrainLiqRecords[existingIndex] = { ...dccDrainLiqRecords[existingIndex], ...record };
    } else {
      dccDrainLiqRecords.unshift(record);
    }

    // Persist to MongoDB Atlas via PlantAnalysisRecord model if available
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plant: 'CO2',
            analysisType: 'DCC DRAIN LIQ Analysis',
            date: payload.date,
          },
          {
            $set: {
              plant: 'CO2',
              analysisType: 'DCC DRAIN LIQ Analysis',
              unit: 'DCC DRAIN LIQ',
              tank: 'DCC DRAIN LIQ',
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
      console.warn('[DCCDrainLiqAnalysis API] MongoDB persistence note:', dbErr.message);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'DCC_DRAIN_LIQ_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `DCC DRAIN LIQ Analysis saved for date: ${payload.date} (Cl, SO4, Fe, TSS).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log DCC DRAIN LIQ activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'DCC DRAIN LIQ Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[DCCDrainLiqAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing DCC DRAIN LIQ analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve DCC DRAIN LIQ Analysis records
 * @route   GET /api/dcc-drain-liq-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    // Check MongoDB first
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
      const query = {
        plant: 'CO2',
        analysisType: 'DCC DRAIN LIQ Analysis',
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

    let filtered = [...dccDrainLiqRecords];
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
    console.error('[DCCDrainLiqAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve DCC DRAIN LIQ analysis records: ' + error.message,
    });
  }
});

module.exports = router;
