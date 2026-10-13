const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory / cache storage for ACL 300# records
const acl300Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_DISPLAY_NAMES = {
  shift1: 'SHIFT 1',
  shift2: 'SHIFT 2',
  shift3: 'SHIFT 3',
};

const PARAM_KEYS = ['p18', 'p44', 'nacl'];

const PARAM_DISPLAY_NAMES = {
  p18: '+18 % (+18 Mesh Particle Spec)',
  p44: '+44 % (+44 Mesh Particle Spec)',
  nacl: 'NaCl % (Sodium Chloride Content)',
};

// Helper to determine today's date in Asia/Kolkata (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

/**
 * @desc    Save ACL 300# Analysis data (Shift 1, Shift 2, Shift 3 for [+18%, +44%, NaCl%])
 * @route   POST /api/acl-300-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save ACL 300# Analysis.',
      });
    }

    // 1. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: ACL 300# Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const { shifts = {} } = payload;
    const errors = [];

    // Validate shift parameters: shift1, shift2, shift3
    ['shift1', 'shift2', 'shift3'].forEach((shiftKey) => {
      const shiftData = shifts[shiftKey] || {};
      PARAM_KEYS.forEach((paramKey) => {
        const val = shiftData[paramKey];
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Shift '${shiftKey.toUpperCase()}' parameter '${paramKey.toUpperCase()}' must be a valid number.`);
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

    const plantTarget = payload.plant || 'ACL';
    const targetShifts = ['shift1', 'shift2', 'shift3'];

    // 2. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'ACL 300# Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingShifts = existingData.shifts || existingData.shiftRows || {};

    let incomingShifts = shifts;
    if (payload.shift && payload.shiftData && !payload.shifts) {
      const sKey = payload.shift.toLowerCase().replace(/[\s_]/g, '');
      const mappedKey = sKey === 'shift1' || sKey === 'ishift' ? 'shift1' : sKey === 'shift2' || sKey === 'iishift' ? 'shift2' : sKey === 'shift3' || sKey === 'iiishift' ? 'shift3' : payload.shift;
      incomingShifts = { [mappedKey]: payload.shiftData };
    }

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, shiftsSource) => {
      const s = shiftsSource ? shiftsSource[shiftKey] : null;
      return s && Object.values(s).some((v) => v !== null && v !== '' && v !== undefined);
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldShifts, newShifts) => {
      const oldS = (oldShifts && oldShifts[shiftKey]) || {};
      const newS = (newShifts && newShifts[shiftKey]) || {};
      return PARAM_KEYS.some((pk) => {
        let oVal = oldS[pk] ?? null;
        let nVal = newS[pk] ?? null;
        if (nVal === '') nVal = null;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          return Number(oVal) !== Number(nVal);
        }
        return String(oVal) !== String(nVal);
      });
    };

    let lockedShifts = existingData.lockedShifts || {
      shift1: false,
      shift2: false,
      shift3: false,
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      shift3Edits: 0,
    };
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    // Helper: check if a shift is locked according to sequential workflow rules:
    // - Shift 1 is locked once Shift 2 is saved.
    // - Shift 2 is locked once Shift 3 is saved.
    // - Shift 3 is locked once Shift 3 has had its final edit (shift3Edits >= 1).
    const isShiftLocked = (key) => {
      if (lockedShifts[key]) return true;
      if (key === 'shift1' && lockedShifts.shift2Saved) return true;
      if (key === 'shift2' && lockedShifts.shift3Saved) return true;
      if (key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    };

    const willSave = {};

    // Check lock violations
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingShifts) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingShifts, incomingShifts)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is permanently locked.`,
          });
        }
      }
    }

    // Determine which shifts have actual modifications and are unlocked
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingShifts) && isShiftDiff(key, existingShifts, incomingShifts) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Enforce Shift-Wise Locking: Only one shift can be entered and saved at a time
    const shiftsToSave = targetShifts.filter((k) => willSave[k]);
    if (shiftsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time.',
      });
    }

    let newS1Saved = lockedShifts.shift1Saved || willSave.shift1;
    let newS2Saved = lockedShifts.shift2Saved || willSave.shift2;

    if (willSave.shift2 && !newS1Saved) {
      return res.status(400).json({ success: false, message: 'Cannot save SHIFT 2 before SHIFT 1 is saved.' });
    }
    if (willSave.shift3 && !newS2Saved) {
      return res.status(400).json({ success: false, message: 'Cannot save SHIFT 3 before SHIFT 2 is saved.' });
    }
    if (willSave.shift3 && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      return res.status(400).json({
        success: false,
        message: 'SHIFT 3 has already reached its maximum edit limit (one final edit allowed).',
      });
    }

    const activeShiftKey = shiftsToSave[0];
    if (!activeShiftKey) {
      return res.status(400).json({
        success: false,
        message: 'No unlocked shifts with valid new or modified data were found to save.',
      });
    }

    // Merge shifts separately without overwriting untouched shifts
    const mergedShifts = { ...(existingShifts || {}) };
    const oldShift = mergedShifts[activeShiftKey] || {};
    const newShift = incomingShifts[activeShiftKey] || {};

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    // Track Field-Level EDITED Badges on modified parameters of previously saved shift
    if (isPriorSavedShift) {
      PARAM_KEYS.forEach((paramKey) => {
        const oVal = oldShift[paramKey] ?? null;
        let nVal = newShift[paramKey] ?? null;
        if (nVal === '') nVal = null;

        let isParamChanged = false;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          isParamChanged = Number(oVal) !== Number(nVal);
        } else {
          isParamChanged = String(oVal) !== String(nVal);
        }

        if (isParamChanged) {
          editedFields[`${activeShiftKey}_${paramKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeShiftKey,
            shiftName: SHIFT_DISPLAY_NAMES[activeShiftKey],
            paramKey,
            paramName: PARAM_DISPLAY_NAMES[paramKey] || paramKey,
            oldValue: oVal !== null ? Number(oVal) : null,
            newValue: nVal !== null ? Number(nVal) : null,
            editedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
            editedById: req.user?._id || null,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    mergedShifts[activeShiftKey] = newShift;

    // Update locked status
    if (activeShiftKey === 'shift1') lockedShifts.shift1Saved = true;
    if (activeShiftKey === 'shift2') lockedShifts.shift2Saved = true;
    if (activeShiftKey === 'shift3') {
      if (!lockedShifts.shift3Saved) {
        lockedShifts.shift3Saved = true;
      } else {
        lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
      }
    }

    if (lockedShifts.shift2Saved) lockedShifts.shift1 = true;
    if (lockedShifts.shift3Saved) lockedShifts.shift2 = true;
    if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      lockedShifts.shift3 = true;
    }

    // Generate unique Save Event ID
    const saveEventId = `save_acl300_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `acl_300_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'ACL 300# Analysis',
      unit: 'ACL 300#',
      frequency: 'Once in a shift',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      shifts: mergedShifts,
      shiftRows: mergedShifts,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Save / Upsert directly to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'ACL 300# Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'ACL 300# Analysis',
        unit: 'ACL 300#',
        date: payload.date,
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
        data: updatedRecordData,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company,
        lastSaveEventId: saveEventId,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update in-memory storage
    acl300Records.unshift(updatedRecordData);
    if (acl300Records.length > 50) acl300Records.pop();

    // Log Activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          action: 'ACL_300_ANALYSIS_SAVED',
          user: req.user._id,
          userName: req.user.name,
          details: `ACL 300# Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]} [Event: ${saveEventId}].`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // 3. Centralized Save & Email Notification Workflow
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'ACL 300# Analysis',
        unit: 'ACL 300#',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: payload,
        saveEventId,
      });

      const fastLimit = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 7500));
      const raceResult = await Promise.race([emailPromise, fastLimit]);

      if (raceResult === 'TIMEOUT') {
        emailTimedOut = true;
        emailPromise
          .then((bgRes) => {
            console.log(`[ACL 300# Save] Background email dispatch finished for event ${saveEventId}:`, bgRes?.emailStatus);
          })
          .catch((bgErr) => {
            console.error(`[ACL 300# Save] Background email dispatch error for event ${saveEventId}:`, bgErr.message);
          });
      } else {
        lastEmailResult = raceResult;
      }
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for ACL 300#:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailTimedOut ? 'pending' : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} & email sent ✓`
        : emailTimedOut
        ? `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} — Email dispatching immediately 🚀`
        : `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} — Email delivery failed: ${lastEmailResult?.error || 'Unknown error'}`,
      data: updatedRecordData,
      recordId: savedDoc?._id || updatedRecordData.id,
      savedShift: activeShiftKey,
      saveEventId,
      emailSent,
      emailPending: emailTimedOut,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
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
 * @desc    Retrieve ACL 300# Analysis records
 * @route   GET /api/acl-300-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'ACL 300# Analysis',
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const enrichedData = {
          ...doc.data,
          _id: doc._id,
          recordId: doc._id,
        };
        return res.status(200).json({
          success: true,
          data: [enrichedData],
          recordId: doc._id,
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: [],
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[ACL GET ACL 300#] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved ACL 300# analysis record
 * @route   POST /api/acl-300-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;

    let record = null;
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findById === 'function') {
      record = await PlantAnalysisRecord.findById(id);
    }
    if (!record) {
      record = acl300Records.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'ACL 300# analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'ACL',
      analysisType: record.analysisType || 'ACL 300# Analysis',
      unit: 'ACL 300#',
      shift: record.shift || record.data?.shift || 'All Shifts',
      date: record.date,
      data: record.data || record,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json({
      success: result.success,
      emailSent: result.emailSent,
      emailStatus: result.emailStatus,
      emailRecipient: result.recipient || result.data?.emailRecipient || '',
      error: result.error,
    });
  } catch (error) {
    console.error('[ACL 300# Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry email for ACL 300# analysis: ' + error.message,
    });
  }
});

module.exports = router;
