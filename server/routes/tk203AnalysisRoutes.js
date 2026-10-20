const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const {
  hydrateLockState,
  getInitialLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
} = require('../services/analysisLockEngine');

// In-memory fallback
const tk203Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_TIME_SLOTS = {
  shift1: ['t07', 't09', 't11', 't13'],
  shift2: ['t15', 't17', 't19', 't21'],
  shift3: ['t23', 't01', 't03', 't05'],
};

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const defaultLocks = {
  shift1: false,
  shift2: true,
  shift3: true,
  shift1Locked: false,
  shift2Locked: true,
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
 * @desc    Save TK 203 Analysis data (Shift-wise workflow, today date restriction, locking & instant email)
 * @route   POST /api/tk-203-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify TK 203
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: TK 203 Analysis data entry and modification is restricted to Company Admins.',
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
        message: 'Analysis Date is required to save TK 203 Analysis.',
      });
    }

    // 2. Strict Today's Date Restriction (Asia/Kolkata) with test mode bypass
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: TK 203 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const newlySavedShifts = [];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'TK 203 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingRows = existingData.rows || existingData;
    let incomingRows = payload.shiftRows || payload.rows || {};

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, rowsSource) => {
      if (!rowsSource) return false;
      const hasShiftContainers = Boolean(rowsSource.shift1 || rowsSource.shift2 || rowsSource.shift3);
      if (hasShiftContainers) {
        const source = rowsSource[shiftKey];
        if (!source) return false;
        const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
        return slotKeys.some((sKey) => {
          const slot = source[sKey];
          return slot && Object.values(slot).some((v) => v !== null && v !== '');
        });
      }
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const slot = rowsSource[sKey];
        return slot && Object.values(slot).some((v) => v !== null && v !== '');
      });
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldRows, newRows) => {
      if (!oldRows && !newRows) return false;
      const hasShiftContainers = Boolean(newRows && (newRows.shift1 || newRows.shift2 || newRows.shift3));
      if (hasShiftContainers && !newRows[shiftKey]) {
        return false;
      }
      const oldSrc = (oldRows && oldRows[shiftKey]) ? oldRows[shiftKey] : oldRows;
      const newSrc = (newRows && newRows[shiftKey]) ? newRows[shiftKey] : newRows;
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const oldSlot = (oldSrc && oldSrc[sKey]) || (oldRows && oldRows[sKey]) || {};
        const newSlot = (newSrc && newSrc[sKey]) || (newRows && newRows[sKey]) || {};
        const params = ['fnh3', 'cnh3', 'tcl', 'pcl', 'co2'];
        return params.some((p) => {
          let oVal = oldSlot[p] ?? null;
          let nVal = newSlot[p] ?? null;
          if (nVal === '') nVal = null;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            return Number(oVal) !== Number(nVal);
          }
          return oVal !== nVal;
        });
      });
    };

    let lockedShifts = existingData.lockedShifts
      ? hydrateLockState(existingData.lockedShifts, { type: 'shift', items: targetShifts })
      : getInitialLockState({ type: 'shift', items: targetShifts });
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    const isShiftLocked = (key) => {
      const check = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: key,
        itemsOrder: targetShifts,
        isDiff: true,
        type: 'shift',
      });
      return !check.allowed;
    };

    if (lockedShifts.allPermanentlyLocked) {
      const hasShiftChanges = targetShifts.some(
        (key) => hasShiftData(key, incomingRows) && isShiftDiff(key, existingRows, incomingRows)
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
      if (hasShiftData(key, incomingRows) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingRows, incomingRows)) {
          const check = validateSequentialSave({
            lockState: lockedShifts,
            targetItem: key,
            itemsOrder: targetShifts,
            isDiff: true,
            type: 'shift',
          });
          return res.status(400).json({
            success: false,
            message: check.message || `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is locked.`,
          });
        }
      }
    }

    // Determine which shift has changes and is unlocked
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingRows) && isShiftDiff(key, existingRows, incomingRows) && !isShiftLocked(key)) {
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

    const activeShiftKey = shiftsToSave[0];
    if (!activeShiftKey) {
      return res.status(400).json({
        success: false,
        message: 'No unlocked shifts with valid new or modified data were found to save.',
      });
    }

    // Authoritative sequential save check
    const saveValidation = validateSequentialSave({
      lockState: lockedShifts,
      targetItem: activeShiftKey,
      itemsOrder: targetShifts,
      isDiff: true,
      type: 'shift',
    });
    if (!saveValidation.allowed) {
      return res.status(saveValidation.statusCode || 400).json({
        success: false,
        message: saveValidation.message,
      });
    }

    // Merge rows separately without overwriting untouched slots
    const mergedRows = { ...(existingRows || {}) };
    const slotKeysToUpdate = SHIFT_TIME_SLOTS[activeShiftKey] || [];

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    slotKeysToUpdate.forEach((sKey) => {
      const oldSlot = mergedRows[sKey] || {};
      const newSlot = (incomingRows[activeShiftKey] && incomingRows[activeShiftKey][sKey]) || incomingRows[sKey] || {};
      const params = ['fnh3', 'cnh3', 'tcl', 'pcl', 'co2'];

      if (isPriorSavedShift) {
        params.forEach((paramKey) => {
          const oVal = oldSlot[paramKey] ?? null;
          let nVal = newSlot[paramKey] ?? null;
          if (nVal === '') nVal = null;

          let isParamChanged = false;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            isParamChanged = Number(oVal) !== Number(nVal);
          } else {
            isParamChanged = oVal !== nVal;
          }

          if (isParamChanged) {
            editedFields[`${sKey}_${paramKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: sKey,
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

      mergedRows[sKey] = newSlot;
    });

    newlySavedShifts.push(activeShiftKey);

    // Update locked status via universal locking engine
    lockedShifts = applySequentialSaveTransition({
      lockState: lockedShifts,
      targetItem: activeShiftKey,
      itemsOrder: targetShifts,
      isCorrection: saveValidation.isCorrection,
      type: 'shift',
    });

    // Generate unique Save Event ID for this exact save operation
    const saveEventId = `save_tk203_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `tk203_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'TK 203 Analysis',
      tank: 'TK 203',
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
        analysisType: 'TK 203 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'TK 203 Analysis',
        unit: 'TK 203',
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

    // Update in-memory cache
    tk203Records.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_203_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 203 Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]} [Event: ${saveEventId}].`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // ── Execute Instant Email Dispatch Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: 'ACL',
        analysisType: 'TK 203 Analysis',
        unit: 'TK 203',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey],
        date: payload.date,
        data: mergedRows,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: { ...payload, rows: mergedRows, data: updatedRecordData },
        saveEventId,
        changedSlotKeys: slotKeysToUpdate,
        isTestMode,
      });

      lastEmailResult = await emailPromise;
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for TK 203 ${activeShiftKey}:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    if (savedDoc?._id) {
      await PlantAnalysisRecord.findByIdAndUpdate(savedDoc._id, { $set: { data: updatedRecordData } });
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailTimedOut
      ? 'pending'
      : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const emailRecipient =
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
      emailRecipient: null,
      emailNotification: null,
      newlySavedShifts,
    });
  } catch (error) {
    console.error('[TK203Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 203 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 203 Analysis records
 * @route   GET /api/tk-203-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'TK 203 Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const resolvedLocks = doc.data.lockedShifts
          ? hydrateLockState(doc.data.lockedShifts, { type: 'shift', items: targetShifts })
          : getInitialLockState({ type: 'shift', items: targetShifts });
        const enrichedData = {
          ...doc.data,
          lockedShifts: resolvedLocks,
          _id: doc._id,
          recordId: doc._id,
        };
        return res.status(200).json({
          success: true,
          data: [enrichedData],
          recordId: doc._id,
          lockedShifts: resolvedLocks,
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
      lockedShifts: getInitialLockState({ type: 'shift', items: targetShifts }),
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
 * @desc    Retry sending email for an existing saved TK 203 analysis record
 * @route   POST /api/tk-203-analysis/:id/retry-email
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

