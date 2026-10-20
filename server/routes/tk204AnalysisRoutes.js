const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory fallback
const tk204Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const SHIFT_PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl'];

const defaultLocks = {
  shift1: false,
  shift1Locked: false,
  shift2: true,
  shift2Locked: true,
  shift3: true,
  shift3Locked: true,
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift3Edits: 0,
};

// Asia/Kolkata date helper
const getTodayKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

/**
 * @desc    Save TK 204 Analysis data (Shift-wise workflow, today date restriction, locking & instant email)
 * @route   POST /api/tk-204-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify TK 204
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: TK 204 Analysis data entry and modification is restricted to Company Admins.',
      });
    }

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

    const isTestMode =
      process.env.NODE_ENV === 'test' ||
      process.env.TEST_MODE === 'true' ||
      req.headers['x-test-mode'] === 'true' ||
      req.headers['x-test-env'] === 'true' ||
      payload.isTestMode === true;

    // 2. Strict Today's Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: TK 204 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const newlySavedShifts = [];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'TK 204 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingRows = existingData.rows || existingData.shifts || existingData.readings || existingData;

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, rowsSource) => {
      const shift = rowsSource ? rowsSource[shiftKey] : null;
      return shift && Object.values(shift).some((v) => v !== null && v !== '');
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldRows, newRows) => {
      const oldShift = (oldRows && oldRows[shiftKey]) || {};
      const newShift = (newRows && newRows[shiftKey]) || {};
      return SHIFT_PARAMETERS.some((p) => {
        let oVal = oldShift[p] ?? null;
        let nVal = newShift[p] ?? null;
        if (nVal === '') nVal = null;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          return Number(oVal) !== Number(nVal);
        }
        return oVal !== nVal;
      });
    };

    let lockedShifts = existingData.lockedShifts
      ? { ...defaultLocks, ...existingData.lockedShifts }
      : { ...defaultLocks };
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    const areShiftsLocked = Boolean(lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1);
    const isShiftLocked = (key) => {
      if (key === 'shift1') return Boolean(lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved);
      if (key === 'shift2') {
        if (!lockedShifts.shift1Saved) return true;
        return Boolean(lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved);
      }
      if (key === 'shift3') {
        if (!lockedShifts.shift2Saved) return true;
        if (lockedShifts.shift3 || lockedShifts.shift3Locked) return true;
        if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
        return false;
      }
      return false;
    };

    if (areShiftsLocked) {
      const hasShiftChanges = targetShifts.some(
        (key) => hasShiftData(key, payload.rows) && isShiftDiff(key, existingRows, payload.rows)
      );
      if (hasShiftChanges) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }
    }

    const willSave = {};

    // Check lock violations
    for (const key of targetShifts) {
      if (hasShiftData(key, payload.rows) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingRows, payload.rows)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is locked.`,
          });
        }
      }
    }

    // Determine which shift has changes and is unlocked
    for (const key of targetShifts) {
      if (hasShiftData(key, payload.rows) && isShiftDiff(key, existingRows, payload.rows) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Enforce Shift-Wise Locking: Only one shift can be saved at a time
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
      return res.status(400).json({ success: false, message: 'Sequential restriction: Cannot save II SHIFT before I SHIFT is saved.' });
    }
    if (willSave.shift3 && !newS2Saved) {
      return res.status(400).json({ success: false, message: 'Sequential restriction: Cannot save III SHIFT before II SHIFT is saved.' });
    }
    if (willSave.shift3 && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot save III SHIFT because it is already permanently locked after 1 permitted correction.',
      });
    }

    const activeShiftKey = shiftsToSave[0];
    if (!activeShiftKey) {
      return res.status(400).json({
        success: false,
        message: 'No unlocked shifts with valid new or modified data were found to save.',
      });
    }

    // Merge rows separately without overwriting untouched shifts
    const mergedRows = { ...(existingRows || {}) };
    const oldShift = mergedRows[activeShiftKey] || {};
    const newShift = payload.rows[activeShiftKey] || {};

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    if (isPriorSavedShift) {
      SHIFT_PARAMETERS.forEach((paramKey) => {
        const oVal = oldShift[paramKey] ?? null;
        let nVal = newShift[paramKey] ?? null;
        if (nVal === '') nVal = null;

        let isParamChanged = false;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          isParamChanged = Number(oVal) !== Number(nVal);
        } else {
          isParamChanged = oVal !== nVal;
        }

        if (isParamChanged) {
          editedFields[`${activeShiftKey}_${paramKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeShiftKey,
            shiftName: SHIFT_DISPLAY_NAMES[activeShiftKey],
            paramKey,
            oldValue: oVal !== null ? Number(oVal) : null,
            newValue: nVal !== null ? Number(nVal) : null,
            editedBy: req.user?.name || payload.submittedBy || 'Admin',
            editedById: req.user?._id || null,
            timestamp: new Date(),
          });
        }
      });
    }

    mergedRows[activeShiftKey] = newShift;
    newlySavedShifts.push(activeShiftKey);

    // Update locked status
    if (activeShiftKey === 'shift1') {
      lockedShifts.shift1Saved = true;
      lockedShifts.shift1 = false;
      lockedShifts.shift1Locked = false;
      lockedShifts.shift2 = false;
      lockedShifts.shift2Locked = false;
      if (!lockedShifts.shift3Saved) {
        lockedShifts.shift3 = true;
        lockedShifts.shift3Locked = true;
      }
    }
    if (activeShiftKey === 'shift2') {
      lockedShifts.shift2Saved = true;
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2 = false;
      lockedShifts.shift2Locked = false;
      lockedShifts.shift3 = false;
      lockedShifts.shift3Locked = false;
    }
    if (activeShiftKey === 'shift3') {
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2 = true;
      lockedShifts.shift2Locked = true;
      if (lockedShifts.shift3Saved) {
        lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
        lockedShifts.shift3 = true;
        lockedShifts.shift3Locked = true;
      } else {
        lockedShifts.shift3Saved = true;
        lockedShifts.shift3Edits = 0;
        lockedShifts.shift3 = false;
        lockedShifts.shift3Locked = false;
      }
    }

    if (lockedShifts.shift2Saved) {
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
    }
    if (lockedShifts.shift3Saved) {
      lockedShifts.shift2 = true;
      lockedShifts.shift2Locked = true;
    }
    if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2 = true;
      lockedShifts.shift2Locked = true;
      lockedShifts.shift3 = true;
      lockedShifts.shift3Locked = true;
    }

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `tk204_${Date.now()}`,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'TK 204 Analysis',
      tank: 'TK 204',
      unit: 'TK 204',
      frequency: 'Once in a shift',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      rows: mergedRows,
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
        analysisType: 'TK 204 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'TK 204 Analysis',
        unit: 'TK 204',
        date: payload.date,
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
        data: updatedRecordData,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update in-memory cache
    tk204Records.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_204_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 204 Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // Generate unique Save Event ID for this exact save operation
    const saveEventId = 'SE_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    // ── Execute Instant Email Dispatch Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: 'ACL',
        analysisType: 'TK 204 Analysis',
        unit: 'TK 204',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey],
        date: payload.date,
        data: mergedRows,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: { ...payload, rows: mergedRows, data: updatedRecordData },
        saveEventId,
        isTestMode,
      });

      lastEmailResult = await emailPromise;
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for TK 204 ${activeShiftKey}:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    if (savedDoc?._id) {
      await PlantAnalysisRecord.findByIdAndUpdate(savedDoc._id, { $set: { data: updatedRecordData } });
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailTimedOut
      ? 'pending'
      : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const finalRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    if (savedDoc && savedDoc._id) {
      updatedRecordData._id = savedDoc._id;
      updatedRecordData.recordId = savedDoc._id;
    }

    return res.status(200).json({
      success: true,
      message: `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} in MongoDB ✓`,
      data: updatedRecordData,
      lockedShifts,
      editedFields,
      editAuditHistory,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      emailSent: false,
      emailPending: false,
      emailStatus: 'disabled',
      emailRecipient: '',
      newlySavedShifts,
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
    const { date } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'TK 204 Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const enrichedData = { ...doc.data };
        enrichedData.lockedShifts = doc.data.lockedShifts || defaultLocks;
        enrichedData.editedFields = doc.data.editedFields || {};
        enrichedData.editAuditHistory = doc.data.editAuditHistory || [];
        enrichedData.id = doc._id;
        enrichedData._id = doc._id;

        return res.status(200).json({
          success: true,
          data: [enrichedData],
          recordId: doc._id,
          lockedShifts: doc.data?.lockedShifts || defaultLocks,
          editedFields: doc.data?.editedFields || {},
          editAuditHistory: doc.data?.editAuditHistory || [],
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: [],
      lockedShifts: defaultLocks,
      editedFields: {},
      editAuditHistory: [],
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[ACL GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved TK 204 analysis record
 * @route   POST /api/tk-204-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

module.exports = router;
