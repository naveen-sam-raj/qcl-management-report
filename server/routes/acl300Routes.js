const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for ACL 300# records (Legacy support)
// Removed cache

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save ACL 300# Analysis data (Shift-Wise Independence)
 * @route   POST /api/acl-300-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    
    payload.plant = 'ACL';
    payload.analysisType = 'ACL 300 Analysis';
    
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }
  
    return res.status(501).json({ success: false, message: 'Blocked pending configuration: Server-side limits not yet verified for this analysis type.' });
      

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save ACL 300# Analysis.',
      });
    }

    const { shifts = {}, readings = [] } = payload;
    const errors = [];

    const ACL_300_LIMITS = {
      nacl: { min: 1.90, max: 2.10 },
      p18: { min: 4.0, max: 6.0 },
      p44: { min: 55.0, max: 65.0 },
    };

    const validateParam = (shiftOrRowLabel, paramKey, val) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (typeof val !== 'string' && typeof val !== 'number') {
         errors.push(`${shiftOrRowLabel}: Parameter '${paramKey.toUpperCase()}' must be a numeric value.`);
         return;
      }
      if (isNaN(num) || !isFinite(num)) {
         errors.push(`${shiftOrRowLabel}: Parameter '${paramKey.toUpperCase()}' must be a valid finite number.`);
         return;
      }
      
      const limits = ACL_300_LIMITS[paramKey];
      if (limits) {
        if (num < limits.min || num > limits.max) {
           errors.push(`${shiftOrRowLabel}: Parameter '${paramKey.toUpperCase()}' value ${num} is out of bounds (Allowed: ${limits.min} - ${limits.max}).`);
        }
      }
    };

    // Validation
    if (readings && readings.length > 0) {
      readings.forEach((r, idx) => {
        ['p18', 'p44', 'nacl'].forEach((paramKey) => {
          validateParam(`Row ${idx + 1}`, paramKey, r[paramKey]);
        });
      });
    } else {
      ['shift1', 'shift2', 'shift3'].forEach((shiftKey) => {
        const shiftData = shifts[shiftKey] || {};
        ['p18', 'p44', 'nacl'].forEach((paramKey) => {
          validateParam(`Shift '${shiftKey.toUpperCase()}'`, paramKey, shiftData[paramKey]);
        });
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Readings do not meet industrial boundary limits.',
        errors,
      });
    }

    const savedRecords = [];
    
    // RBAC: Check user's authorized shifts
    const userRole = req.user?.role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    const authorizedShifts = req.user?.authorizedShifts || []; 

    // Process shifts independently
    if (shifts && Object.keys(shifts).length > 0) {
      for (const [key, shiftData] of Object.entries(shifts)) {
        // Only save if there is actual data inputted
        const hasData = Object.values(shiftData).some(val => val !== '' && val !== null && val !== undefined);
        if (!hasData) continue;
        
        const shiftName = key === 'shift1' ? 'I SHIFT' : key === 'shift2' ? 'II SHIFT' : 'III SHIFT';

        // Enforce Backend RBAC
        if (!isAdmin && !authorizedShifts.includes(shiftName)) {
           return res.status(403).json({
             success: false,
             message: `Forbidden: You are not authorized to write data for ${shiftName}.`
           });
        }

        const recordData = {
          id: `acl_300_${Date.now()}_${key}`,
          date: payload.date,
          plant: payload.plant || 'ACL',
          analysisType: payload.analysisType || 'ACL 300# Analysis',
          shift: shiftName,
          data: shiftData,
          submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
          submittedById: req.user?._id,
          submittedAt: new Date().toISOString(),
          company: req.user?.company?._id || req.user?.company,
        };

        if (PlantAnalysisRecord) {
          const Model = req.TestModel || PlantAnalysisRecord;
          const saved = await Model.findOneAndUpdate(
            {
              plantCode: recordData.plant || 'Unknown',
              analysisType: recordData.analysisType || 'Unknown',
              date: recordData.date,
              shift: shiftName // Independent shift isolation
            },
            {
              plantName: recordData.plant || 'Plant',
              plantCode: recordData.plant || 'Unknown',
              analysisType: recordData.analysisType || 'Unknown',
              unit: recordData.unit || '',
              date: recordData.date,
              shift: shiftName,
              data: recordData.data,
              submittedBy: recordData.submittedBy || req.user?.name,
              submittedById: recordData.submittedById || req.user?._id,
              company: recordData.company || req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          
          savedRecords.push(saved);
        }
      }
    }

    // Email Notification Trigger
    for (const record of savedRecords) {
      // Prevent duplicate emails for rapid saves (check last updated or if already sent)
      // Since this is a new save, we trigger. Real email service integration goes here.
      try {
        const { emailService } = require('../services'); // Adjust path as needed
        if (emailService && emailService.sendAnalysisNotification) {
          await emailService.sendAnalysisNotification(record);
          
          const Model = req.TestModel || PlantAnalysisRecord;
          await Model.findByIdAndUpdate(record._id, { emailStatus: 'Sent' });
        }
      } catch (emailErr) {
        console.warn(`[Email Notification Failed] for ${record.shift}:`, emailErr.message);
        // Persist DB failure state, but DO NOT rollback the saved DB record
        const Model = req.TestModel || PlantAnalysisRecord;
        await Model.findByIdAndUpdate(record._id, { emailStatus: 'Failed' });
      }
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'ACL_300_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `ACL 300# Analysis shift(s) saved for date: ${payload.date}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log ACL 300# activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'ACL 300# Analysis shifts saved successfully.',
      data: savedRecords,
    });
  } catch (error) {
    console.error('[ACL300 API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing ACL 300# analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve ACL 300# Analysis records with Backward-Compatible Mapping
 * @route   GET /api/acl-300-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    const userRole = req.user?.role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    const authorizedShifts = req.user?.authorizedShifts || []; 

    if (date) {
      try {
        if (PlantAnalysisRecord) {
          const Model = req.TestModel || PlantAnalysisRecord;
          
          // RBAC: Construct secure query
          const query = { date, analysisType: 'ACL 300# Analysis' };
          if (req.user && req.user.company) {
            query.company = req.user.company;
          }
          if (!isAdmin) {
            // Mask out shifts the user isn't authorized for at the database level
            // Allow '' for non-shift backward compatibility initially, then filter.
            query.shift = { $in: [...authorizedShifts, ''] }; 
          }
          
          const docs = await Model.find(query).sort({ createdAt: -1 }).lean();
          
          if (docs && docs.length > 0) {
            // Backward-Compatibility Mapper
            const mappedPayload = {
              date: date,
              plant: 'ACL',
              analysisType: 'ACL 300# Analysis',
              shifts: {
                shift1: { p18: '', p44: '', nacl: '' },
                shift2: { p18: '', p44: '', nacl: '' },
                shift3: { p18: '', p44: '', nacl: '' },
              }
            };
            
            docs.forEach(doc => {
              if (doc.shift === 'I SHIFT') {
                mappedPayload.shifts.shift1 = doc.data;
              } else if (doc.shift === 'II SHIFT') {
                mappedPayload.shifts.shift2 = doc.data;
              } else if (doc.shift === 'III SHIFT') {
                mappedPayload.shifts.shift3 = doc.data;
              } else if (doc.data && doc.data.shifts) {
                // Legacy monolithic doc fallback with RBAC masking
                if (doc.data.shifts.shift1 && (isAdmin || authorizedShifts.includes('I SHIFT'))) mappedPayload.shifts.shift1 = doc.data.shifts.shift1;
                if (doc.data.shifts.shift2 && (isAdmin || authorizedShifts.includes('II SHIFT'))) mappedPayload.shifts.shift2 = doc.data.shifts.shift2;
                if (doc.data.shifts.shift3 && (isAdmin || authorizedShifts.includes('III SHIFT'))) mappedPayload.shifts.shift3 = doc.data.shifts.shift3;
              }
            });
            
            return res.status(200).json({
              success: true,
              data: [mappedPayload] // Return array to match frontend expectation
            });
          }
        }
      } catch (dbErr) {
        console.warn('MongoDB lookup note:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      count: 0,
      data: [],
    });
  } catch (error) {
    console.error('[ACL300 API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving ACL 300# analysis records.',
    });
  }
});

/**
 * @desc    Retrieve Quarantined Conflict Records (Admin Only)
 * @route   GET /api/acl-300-analysis/conflicts
 * @access  Private/Admin
 */
router.get('/conflicts', async (req, res) => {
  try {
    const userRole = req.user?.role || 'user';
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admin access required to view quarantined conflicts.'
      });
    }

    const mongoose = require('mongoose');
    const conflictCollection = mongoose.connection.db.collection('plantanalysisrecords_conflicts');
    
    // Retrieve quarantined ACL 300# records for review
    const conflicts = await conflictCollection.find({ analysisType: 'ACL 300# Analysis' }).toArray();
    
    return res.status(200).json({
      success: true,
      count: conflicts.length,
      data: conflicts
    });
  } catch (error) {
    console.error('[ACL300 API] Error fetching conflicts:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving conflicts.'
    });
  }
});

module.exports = router;
