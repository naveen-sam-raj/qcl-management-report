const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory / cache storage for TK 204 analysis records
// Removed cache

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save TK 204 Analysis data (Once in a shift)
 * @route   POST /api/tk-204-analysis
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
        message: 'Analysis Date is required to save TK 204 Analysis.',
      });
    }

    // Record creation
    const record = {
      id: `tk204_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'ACL',
      analysisType: payload.analysisType || 'TK 204 Analysis',
      tank: 'TK 204',
      unit: 'TK 204',
      frequency: 'Once in a shift',
      rows: payload.rows,
      parameters: payload.parameters,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };

    // Upsert by date
    const existingIndex = tk204Records.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      tk204Records[existingIndex] = { ...tk204Records[existingIndex], ...record };
    } else {
      // Cache push removed

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
      console.error('DB Error:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed' });
    }

    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_204_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 204 Analysis saved for date: ${payload.date} (FNH3, CNH3, TCL, PCL).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log TK 204 activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'TK 204 Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[TK204Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 204 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 204 Analysis records
 * @route   GET /api/tk-204-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let results = []; // Replaced by DB

    if (date) {
      filtered = filtered.filter((r) => r.date === date);
    } else if (startDate || endDate) {
      if (startDate) filtered = filtered.filter((r) => r.date >= startDate);
      if (endDate) filtered = filtered.filter((r) => r.date <= endDate);
    }

    return res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    console.error('[TK204Analysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving TK 204 records.',
    });
  }
});

module.exports = router;
