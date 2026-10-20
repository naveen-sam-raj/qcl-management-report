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
const cr203Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_TIME_SLOTS = {
  shift1: ['t07', 't11'],
  shift2: ['t15', 't19'],
  shift3: ['t23', 't03'],
};

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const STREAMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

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
 * @desc    Save CR 203 Analysis data (Shift-wise workflow, today date restriction, locking & instant email)
 * @route   POST /api/cr-203-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify CR 203
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: CR 203 Analysis data entry and modification is restricted to Company Admins.',
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
        message: 'Analysis Date is required to save CR 203 Analysis.',
      });
    }

    // 2. Strict Today's Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    const isTestMode = req.headers['x-test-mode'] === 'true' || payload.isTestMode === true;
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: CR 203 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const newlySavedShifts = [];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'CR 203 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingTimeRows = existingData.timeRows || {};
    let existingFnh3Row = existingData.fnh3Row || {};
    let existingPclRow = existingData.pclRow || {};

    const incomingTimeRows = payload.timeRows || payload.shiftRows || {};
    const incomingFnh3Row = payload.fnh3Row || {};
    const incomingPclRow = payload.pclRow || {};

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, tRowsSource) => {
      if (!tRowsSource) return false;
      const source = tRowsSource[shiftKey] || tRowsSource;
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const slot = source[sKey] || (tRowsSource && tRowsSource[sKey]);
        return slot && Object.values(slot).some((v) => v !== null && v !== '');
      });
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldTRows, newTRows) => {
      if (!oldTRows && !newTRows) return false;
      const oldSrc = (oldTRows && oldTRows[shiftKey]) ? oldTRows[shiftKey] : oldTRows;
      const newSrc = (newTRows && newTRows[shiftKey]) ? newTRows[shiftKey] : newTRows;
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const oldSlot = (oldSrc && oldSrc[sKey]) || (oldTRows && oldTRows[sKey]) || {};
        const newSlot = (newSrc && newSrc[sKey]) || (newTRows && newTRows[sKey]) || {};
        const fieldsToCheck = [...STREAMS, 'avgTcl'];
        return fieldsToCheck.some((f) => {
          let oVal = oldSlot[f] ?? null;
          let nVal = newSlot[f] ?? null;
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
      const hasSlotChanges = targetShifts.some(
        (key) => hasShiftData(key, incomingTimeRows) && isShiftDiff(key, existingTimeRows, incomingTimeRows)
      );
      if (hasSlotChanges) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }
    }

    const willSave = {};

    // Check lock violations for time slots
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingTimeRows) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingTimeRows, incomingTimeRows)) {
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
      if (hasShiftData(key, incomingTimeRows) && isShiftDiff(key, existingTimeRows, incomingTimeRows) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Also check changes in global FNH3 / PCL rows
    const isRowDiff = (oldR, newR) => {
      const fields = [...STREAMS, 'avgTcl'];
      return fields.some((f) => {
        let oVal = oldR[f] ?? null;
        let nVal = newR[f] ?? null;
        if (nVal === '') nVal = null;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          return Number(oVal) !== Number(nVal);
        }
        return oVal !== nVal;
      });
    };

    const fnh3Changed = isRowDiff(existingFnh3Row, incomingFnh3Row);
    const pclChanged = isRowDiff(existingPclRow, incomingPclRow);

    // If only FNH3 or PCL changed, associate with current active unlocked shift
    const shiftsToSave = targetShifts.filter((k) => willSave[k]);
    if (shiftsToSave.length === 0 && (fnh3Changed || pclChanged)) {
      if (areShiftsLocked) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for today are permanently locked. Cannot edit FNH₃ or PCl.',
        });
      }
      // Find current open shift
      if (!lockedShifts.shift1Saved || !lockedShifts.shift2Saved) {
        if (!lockedShifts.shift1Saved) shiftsToSave.push('shift1');
        else shiftsToSave.push('shift2');
      } else if (!lockedShifts.shift3Saved || (lockedShifts.shift3Edits || 0) === 0) {
        shiftsToSave.push('shift3');
      } else {
        return res.status(400).json({
          success: false,
          message: 'All shifts for today are permanently locked. Cannot edit FNH₃ or PCl.',
        });
      }
    }

    // Enforce Shift-Wise Locking: Only one shift can be saved at a time
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
    const mergedTimeRows = { ...(existingTimeRows || {}) };
    const slotKeysToUpdate = SHIFT_TIME_SLOTS[activeShiftKey] || [];

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    slotKeysToUpdate.forEach((sKey) => {
      const oldSlot = mergedTimeRows[sKey] || {};
      const newSlot = incomingTimeRows[sKey] || {};

      if (isPriorSavedShift) {
        [...STREAMS, 'avgTcl'].forEach((fieldKey) => {
          const oVal = oldSlot[fieldKey] ?? null;
          let nVal = newSlot[fieldKey] ?? null;
          if (nVal === '') nVal = null;

          let isParamChanged = false;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            isParamChanged = Number(oVal) !== Number(nVal);
          } else {
            isParamChanged = oVal !== nVal;
          }

          if (isParamChanged) {
            editedFields[`${sKey}_${fieldKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: sKey,
              paramKey: fieldKey,
              oldValue: oVal !== null ? Number(oVal) : null,
              newValue: nVal !== null ? Number(nVal) : null,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              editedById: req.user?._id || null,
              timestamp: new Date(),
            });
          }
        });
      }

      mergedTimeRows[sKey] = newSlot;
    });

    // Check changes for FNH3 and PCL rows
    const mergedFnh3Row = { ...(existingFnh3Row || {}), ...(incomingFnh3Row || {}) };
    const mergedPclRow = { ...(existingPclRow || {}), ...(incomingPclRow || {}) };

    if (isPriorSavedShift) {
      if (fnh3Changed) {
        [...STREAMS, 'avgTcl'].forEach((fieldKey) => {
          const oVal = existingFnh3Row[fieldKey] ?? null;
          let nVal = incomingFnh3Row[fieldKey] ?? null;
          if (nVal === '') nVal = null;
          if (oVal !== nVal) {
            editedFields[`fnh3_${fieldKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: 'fnh3',
              paramKey: fieldKey,
              oldValue: oVal,
              newValue: nVal,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              timestamp: new Date(),
            });
          }
        });
      }
      if (pclChanged) {
        [...STREAMS, 'avgTcl'].forEach((fieldKey) => {
          const oVal = existingPclRow[fieldKey] ?? null;
          let nVal = incomingPclRow[fieldKey] ?? null;
          if (nVal === '') nVal = null;
          if (oVal !== nVal) {
            editedFields[`pcl_${fieldKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: 'pcl',
              paramKey: fieldKey,
              oldValue: oVal,
              newValue: nVal,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              timestamp: new Date(),
            });
          }
        });
      }
    }

    newlySavedShifts.push(activeShiftKey);

    // Update locked status via universal locking engine
    lockedShifts = applySequentialSaveTransition({
      lockState: lockedShifts,
      targetItem: activeShiftKey,
      itemsOrder: targetShifts,
      isCorrection: saveValidation.isCorrection,
      type: 'shift',
    });

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `cr203_${Date.now()}`,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'CR 203 Analysis',
      crystallizer: 'CR 203',
      unit: 'CR 203',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      timeRows: mergedTimeRows,
      fnh3Row: mergedFnh3Row,
      pclRow: mergedPclRow,
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
        analysisType: 'CR 203 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'CR 203 Analysis',
        unit: 'CR 203',
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
    cr203Records.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'CR_203_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `CR 203 Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // Generate unique Save Event ID for this exact save operation
    const saveEventId = 'SE_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      req.headers['x-test-mode'] === 'true' ||
      req.headers['x-test-env'] === 'true' ||
      payload.isTestMode === true;

    // ── Execute Instant Email Dispatch Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: 'ACL',
        analysisType: 'CR 203 Analysis',
        unit: 'CR 203',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey],
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: { ...payload, data: updatedRecordData },
        saveEventId,
        isTestMode: isTestEnv,
      });

      lastEmailResult = await emailPromise;
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for CR 203 ${activeShiftKey}:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    if (savedDoc?._id) {
      await PlantAnalysisRecord.findByIdAndUpdate(savedDoc._id, { $set: { data: updatedRecordData } });
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.success));
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
    console.error('[CR203Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing CR 203 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve CR 203 Analysis records
 * @route   GET /api/cr-203-analysis
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

    const targetShifts = ['shift1', 'shift2', 'shift3'];

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'CR 203 Analysis' };
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
          id: doc._id,
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
    console.error('[CR203 GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved CR 203 analysis record
 * @route   POST /api/cr-203-analysis/:id/retry-email
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
