const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { sendAnalysisNotification } = require('../services/emailService');

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Absorber Inlet Analysis data
 * @route   POST /api/absorber-inlet-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    payload.plant = 'CO2';
    payload.analysisType = 'Absorber Inlet Analysis';

    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed. Enter numeric values only within allowed limits.',
        errors: validation.errors,
      });
    }

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Absorber Inlet Analysis.',
      });
    }

    // Determine the data shape. If it's single-shift, it might be in rows.shift1 or parameters
    let processedRows = payload.rows || {};
    if (Object.keys(processedRows).length === 0 && payload.parameters) {
       // Support flat parameters object if frontend uses it for "Once in a shift"
       processedRows = { shift1: payload.parameters };
    }

    const savedShifts = [];

    // Save each shift independently
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
      const Model = req.TestModel || PlantAnalysisRecord;
      
      for (const [shiftKey, shiftData] of Object.entries(processedRows)) {
        if (!shiftData || Object.keys(shiftData).length === 0) continue;
        
        let shiftName = '';
        if (shiftKey === 'shift1') shiftName = 'I SHIFT';
        if (shiftKey === 'shift2') shiftName = 'II SHIFT';
        if (shiftKey === 'shift3') shiftName = 'III SHIFT';
        if (!shiftName) shiftName = 'Once in a shift'; // fallback

        // Check if user is authorized for this shift
        if (req.user?.authorizedShifts && req.user.authorizedShifts.length > 0 && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
          if (!req.user.authorizedShifts.includes(shiftName) && shiftName !== 'Once in a shift') {
            return res.status(403).json({
              success: false,
              message: `Forbidden: You are not authorized to edit ${shiftName}.`
            });
          }
        }

        const saved = await Model.findOneAndUpdate(
          {
            plantCode: 'CO2',
            analysisType: 'Absorber Inlet Analysis',
            date: payload.date,
            shift: shiftName
          },
          {
            $set: {
              plantName: 'CO2 Plant',
              plantCode: 'CO2',
              analysisType: 'Absorber Inlet Analysis',
              unit: 'Absorber Inlet',
              date: payload.date,
              shift: shiftName,
              data: {
                 // Encapsulate properly so the legacy frontend expects it
                 parameters: shiftData
              },
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              company: req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending'
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        savedShifts.push(saved);
        
        // Trigger Email Notification safely
        try {
           sendAnalysisNotification(saved).catch(err => console.error('[Email Notification Failed] for', shiftName, ':', err.message));
        } catch (e) {
           console.error('[Email Dispatcher Error]', e.message);
        }
      }
    } else {
       throw new Error('Database model is unavailable.');
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'ABSORBER_INLET_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Absorber Inlet Analysis saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Absorber Inlet Analysis data saved successfully.',
      data: savedShifts,
    });
  } catch (error) {
    console.error('[CO2 API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Absorber Inlet Analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Absorber Inlet Analysis records
 * @route   GET /api/absorber-inlet-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    const query = {
      plantCode: 'CO2',
      analysisType: 'Absorber Inlet Analysis',
    };
    if (date) query.date = date;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const Model = req.TestModel || PlantAnalysisRecord;
    const dbRecords = await Model.find(query).sort({ date: -1, shift: 1 }).lean();
    
    // Group records by date to match the React grid structure expected by the frontend
    const groupedByDate = {};
    for (const r of dbRecords) {
       if (!groupedByDate[r.date]) {
          groupedByDate[r.date] = {
             id: r._id,
             date: r.date,
             plant: r.plantName || r.plantCode,
             analysisType: r.analysisType,
             submittedBy: r.submittedBy,
             rows: {}, // Frontend requires this object
             parameters: {}
          };
       }
       
       let shiftKey = 'shift1';
       if (r.shift === 'II SHIFT') shiftKey = 'shift2';
       else if (r.shift === 'III SHIFT') shiftKey = 'shift3';
       
       const params = r.data?.parameters || r.data?.rows || {};
       groupedByDate[r.date].rows[shiftKey] = params;
       
       // Fallback for flat structure 
       groupedByDate[r.date].parameters = params;
    }

    const resultList = Object.values(groupedByDate).sort((a,b) => b.date.localeCompare(a.date));

    return res.status(200).json({
      success: true,
      count: resultList.length,
      data: resultList,
    });
  } catch (error) {
    console.error('[CO2 API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Absorber Inlet Analysis records: ' + error.message,
    });
  }
});

module.exports = router;
