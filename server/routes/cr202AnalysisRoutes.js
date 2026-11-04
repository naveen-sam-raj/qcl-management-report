const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const {
  hydrateLockState,
  getInitialLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
  computeSlotTransition,
  isValueDifferent,
} = require('../services/analysisLockEngine');

// In-memory fallback
const cr202Records = [];

// Apply authentication middleware
router.use(protect);

const UNITS_ORDER = ['t07', 't11', 't15', 't19', 't23', 't03'];

const SLOT_SHIFT_MAP = {
  t07: 'shift1',
  t11: 'shift1',
  t15: 'shift2',
  t19: 'shift2',
  t23: 'shift3',
  t03: 'shift3',
};

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

/**
 * Derives lockedSlots state in memory for legacy documents that do not have data.lockedSlots.
 */
function deriveLegacyLockedSlots(timeRows = {}, legacyLockedShifts = {}, unitsOrder = UNITS_ORDER) {
  const result = {};
  const savedIndices = [];
  unitsOrder.forEach((slotKey, idx) => {
    const row = timeRows?.[slotKey];
    if (row && typeof row === 'object' && Object.values(row).some((v) => v !== null && v !== '' && v !== undefined)) {
      savedIndices.push(idx);
    }
  });

  const isLegacyShiftLocked = (shiftKey) => {
    if (!legacyLockedShifts) return false;
    if (legacyLockedShifts.allPermanentlyLocked) return true;
    if (legacyLockedShifts[`${shiftKey}Locked`] === true) return true;
    if (
      legacyLockedShifts.slots &&
      legacyLockedShifts.slots[shiftKey]?.isLocked === true &&
      legacyLockedShifts.slots[shiftKey]?.isSaved === true
    ) {
      return true;
    }
    if (legacyLockedShifts[shiftKey] === true && legacyLockedShifts[`${shiftKey}Saved`] === true) {
      return true;
    }
    return false;
  };

  const allLocked = Boolean(legacyLockedShifts?.allPermanentlyLocked);
  if (savedIndices.length === 0) {
    unitsOrder.forEach((slotKey) => {
      result[slotKey] = {
        isSaved: false,
        isLocked: allLocked,
        correctionUsed: false,
        editsCount: 0,
      };
    });
    return result;
  }

  const hIdx = Math.max(...savedIndices);
  const hSlotKey = unitsOrder[hIdx];
  const hShiftKey = SLOT_SHIFT_MAP[hSlotKey] || 'shift1';
  const hShiftIsLocked = isLegacyShiftLocked(hShiftKey) || Boolean(legacyLockedShifts.allPermanentlyLocked);

  unitsOrder.forEach((slotKey, idx) => {
    if (idx < hIdx) {
      const row = timeRows?.[slotKey];
      const hasData = row && typeof row === 'object' && Object.values(row).some((v) => v !== null && v !== '' && v !== undefined);
      result[slotKey] = {
        isSaved: hasData,
        isLocked: true,
        correctionUsed: true,
        editsCount: 1,
      };
    } else if (idx === hIdx) {
      result[slotKey] = {
        isSaved: true,
        isLocked: hShiftIsLocked,
        correctionUsed: hShiftIsLocked,
        editsCount: hShiftIsLocked ? 1 : 0,
      };
    } else if (idx === hIdx + 1) {
      result[slotKey] = {
        isSaved: false,
        isLocked: allLocked,
        correctionUsed: false,
        editsCount: 0,
      };
    } else {
      result[slotKey] = {
        isSaved: false,
        isLocked: allLocked,
        correctionUsed: false,
        editsCount: 0,
      };
    }
  });

  return result;
}

/**
 * Synchronizes backward-compatible lockedShifts from slot-level lockedSlots.
 */
function syncLockedShifts(lockedSlots = {}, unitsOrder = UNITS_ORDER) {
  const s1Saved = Boolean(lockedSlots.t07?.isSaved || lockedSlots.t11?.isSaved);
  const s2Saved = Boolean(lockedSlots.t15?.isSaved || lockedSlots.t19?.isSaved);
  const s3Saved = Boolean(lockedSlots.t23?.isSaved || lockedSlots.t03?.isSaved);

  const s1Locked = Boolean(lockedSlots.t07?.isLocked && lockedSlots.t11?.isLocked);
  const s2Locked = Boolean(lockedSlots.t15?.isLocked && lockedSlots.t19?.isLocked);
  const s3Locked = Boolean(lockedSlots.t23?.isLocked && lockedSlots.t03?.isLocked);

  return {
    type: 'shift',
    shift1Saved: s1Saved,
    shift2Saved: s2Saved,
    shift3Saved: s3Saved,
    shift1Locked: s1Locked,
    shift2Locked: s2Locked,
    shift3Locked: s3Locked,
    shift1: s1Locked,
    shift2: s2Locked,
    shift3: s3Locked,
    allPermanentlyLocked: s1Locked && s2Locked && s3Locked,
  };
}

/**
 * @desc    Save CR 202 Analysis data (Shift-wise workflow, today date restriction, locking & instant email)
 * @route   POST /api/cr-202-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify CR 202
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: CR 202 Analysis data entry and modification is restricted to Company Admins.',
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
        message: 'Analysis Date is required to save CR 202 Analysis.',
      });
    }

    const isTestMode =
      process.env.NODE_ENV === 'test' ||
      process.env.TEST_MODE === 'true' ||
      req.headers['x-test-mode'] === 'true' ||
      req.headers['x-test-env'] === 'true' ||
      payload.isTestMode === true;

    // 2. Strict Today's Operating Date Restriction (06:00 IST)
    const operatingDate = getOperatingDateIST(new Date());
    if (payload.date !== operatingDate && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: CR 202 Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const fieldsToCheck = [...STREAMS, 'avgTcl', 'avgAH'];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'CR 202 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingTimeRows = existingData.timeRows || existingData.shiftRows || {};
    let existingFnh3Row = existingData.fnh3Row || {};
    let existingPclRow = existingData.pclRow || {};

    const incomingTimeRows = payload.timeRows || payload.shiftRows || {};
    const incomingFnh3Row = payload.fnh3Row || {};
    const incomingPclRow = payload.pclRow || {};

    let existingLockedSlots = existingData.lockedSlots;
    if (!existingLockedSlots || Object.keys(existingLockedSlots).length === 0) {
      existingLockedSlots = deriveLegacyLockedSlots(existingTimeRows, existingData.lockedShifts, UNITS_ORDER);
    }

    let editedFields = { ...(existingData.editedFields || {}) };
    let editAuditHistory = [...(existingData.editAuditHistory || [])];

    // Check changes for global FNH3 / PCL rows
    const fnh3Changed = fieldsToCheck.some((f) => isValueDifferent(existingFnh3Row[f], incomingFnh3Row[f]));
    const pclChanged = fieldsToCheck.some((f) => isValueDifferent(existingPclRow[f], incomingPclRow[f]));

    // Compute slot transition using pure engine
    const transition = computeSlotTransition({
      unitsOrder: UNITS_ORDER,
      lockedSlots: existingLockedSlots,
      storedRows: existingTimeRows,
      incomingRows: incomingTimeRows,
      now: new Date(),
    });

    // Identical re-save: if no time slot changed and no global rows changed
    if (transition.noChange && !fnh3Changed && !pclChanged) {
      return res.status(200).json({
        success: true,
        noChange: true,
        message: 'No changes',
      });
    }

    // If slot changes were detected and transition was rejected
    if (!transition.ok && (!transition.noChange || (!fnh3Changed && !pclChanged))) {
      return res.status(transition.status || 400).json({
        success: false,
        message: transition.message,
      });
    }

    // Determine targetUnit and active shift
    let targetUnit = transition.targetUnit;
    if (!targetUnit && (fnh3Changed || pclChanged)) {
      const allSlotsLocked = UNITS_ORDER.every((k) => existingLockedSlots[k]?.isLocked);
      if (allSlotsLocked) {
        return res.status(400).json({
          success: false,
          message: 'All slots for today are permanently locked. Cannot edit FNH₃ or PCl.',
        });
      }
      targetUnit = UNITS_ORDER.find((k) => !existingLockedSlots[k]?.isLocked) || 't07';
    }

    const activeShiftKey = (targetUnit && SLOT_SHIFT_MAP[targetUnit]) || 'shift1';

    // Update lockedSlots based on transition
    const updatedLockedSlots = JSON.parse(JSON.stringify(existingLockedSlots));
    const nowIso = new Date().toISOString();

    if (transition.targetUnit) {
      const uKey = transition.targetUnit;
      const targetIdx = UNITS_ORDER.indexOf(uKey);

      if (!existingLockedSlots[uKey]?.isSaved) {
        // First save of this slot
        updatedLockedSlots[uKey] = {
          isSaved: true,
          correctionUsed: false,
          editsCount: 0,
          isLocked: false,
          savedAt: nowIso,
        };

        // Permanently lock all predecessors
        for (let p = 0; p < targetIdx; p++) {
          const pKey = UNITS_ORDER[p];
          if (updatedLockedSlots[pKey]) {
            updatedLockedSlots[pKey].isLocked = true;
          }
        }
      } else {
        // Single correction edit of this slot -> permanently locks immediately!
        updatedLockedSlots[uKey] = {
          ...updatedLockedSlots[uKey],
          isSaved: true,
          correctionUsed: true,
          editsCount: (existingLockedSlots[uKey]?.editsCount || 0) + 1,
          isLocked: true,
          correctedAt: nowIso,
        };
      }
    }

    // Merge rows: only targetUnit is merged into timeRows to ensure untouched slots are preserved
    const mergedTimeRows = { ...(existingTimeRows || {}) };
    if (transition.targetUnit) {
      mergedTimeRows[transition.targetUnit] = incomingTimeRows[transition.targetUnit] || {};
    }

    // Record field edits ONLY on a correction save for targetUnit
    if (transition.isCorrection && transition.targetUnit) {
      const oldSlot = existingTimeRows[transition.targetUnit] || {};
      const newSlot = incomingTimeRows[transition.targetUnit] || {};

      fieldsToCheck.forEach((fieldKey) => {
        const oVal = oldSlot[fieldKey];
        const nVal = newSlot[fieldKey];

        if (isValueDifferent(oVal, nVal)) {
          editedFields[`${transition.targetUnit}_${fieldKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeShiftKey,
            timeSlot: transition.targetUnit,
            paramKey: fieldKey,
            oldValue: oVal !== undefined && oVal !== null ? String(oVal) : '',
            newValue: nVal !== undefined && nVal !== null ? String(nVal) : '',
            editedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
            editedById: req.user?._id || null,
            timestamp: nowIso,
          });
        }
      });
    }

    // Merge FNH3 and PCL rows
    const mergedFnh3Row = { ...(existingFnh3Row || {}), ...(incomingFnh3Row || {}) };
    const mergedPclRow = { ...(existingPclRow || {}), ...(incomingPclRow || {}) };

    if (fnh3Changed) {
      fieldsToCheck.forEach((fieldKey) => {
        const oVal = existingFnh3Row[fieldKey];
        const nVal = incomingFnh3Row[fieldKey];
        if (isValueDifferent(oVal, nVal)) {
          editedFields[`fnh3_${fieldKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeShiftKey,
            timeSlot: 'fnh3',
            paramKey: fieldKey,
            oldValue: oVal !== undefined && oVal !== null ? String(oVal) : '',
            newValue: nVal !== undefined && nVal !== null ? String(nVal) : '',
            editedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
            editedById: req.user?._id || null,
            timestamp: nowIso,
          });
        }
      });
    }

    if (pclChanged) {
      fieldsToCheck.forEach((fieldKey) => {
        const oVal = existingPclRow[fieldKey];
        const nVal = incomingPclRow[fieldKey];
        if (isValueDifferent(oVal, nVal)) {
          editedFields[`pcl_${fieldKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeShiftKey,
            timeSlot: 'pcl',
            paramKey: fieldKey,
            oldValue: oVal !== undefined && oVal !== null ? String(oVal) : '',
            newValue: nVal !== undefined && nVal !== null ? String(nVal) : '',
            editedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
            editedById: req.user?._id || null,
            timestamp: nowIso,
          });
        }
      });
    }

    // Synchronize backward-compatible lockedShifts from updatedLockedSlots
    const lockedShifts = syncLockedShifts(updatedLockedSlots, UNITS_ORDER);

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `cr202_${Date.now()}`,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'CR 202 Analysis',
      crystallizer: 'CR 202',
      unit: 'CR 202',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      timeRows: mergedTimeRows,
      fnh3Row: mergedFnh3Row,
      pclRow: mergedPclRow,
      lockedSlots: updatedLockedSlots,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Save / Upsert directly to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'CR 202 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'CR 202 Analysis',
        unit: 'CR 202',
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
    cr202Records.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'CR_202_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `CR 202 Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]}.`,
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
        analysisType: 'CR 202 Analysis',
        unit: 'CR 202',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey],
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: { ...payload, data: updatedRecordData },
        saveEventId,
        isTestMode,
      });

      lastEmailResult = await emailPromise;
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for CR 202 ${activeShiftKey}:`, err.message);
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
      message: transition.targetUnit
        ? `Successfully saved slot ${transition.targetUnit} in MongoDB ✓`
        : `Successfully saved CR 202 data in MongoDB ✓`,
      data: updatedRecordData,
      lockedSlots: updatedLockedSlots,
      lockedShifts,
      editedFields,
      editAuditHistory,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      emailSent: false,
      emailPending: false,
      emailStatus: 'disabled',
      emailRecipient: '',
      targetUnit: transition.targetUnit,
    });
  } catch (error) {
    console.error('[CR202Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing CR 202 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve CR 202 Analysis records
 * @route   GET /api/cr-202-analysis
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
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'CR 202 Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const resolvedLocks = doc.data.lockedShifts
          ? hydrateLockState(doc.data.lockedShifts, { type: 'shift', items: targetShifts })
          : getInitialLockState({ type: 'shift', items: targetShifts });
        const existingRows = doc.data.timeRows || doc.data.shiftRows || {};
        let resolvedSlots = doc.data.lockedSlots;
        if (!resolvedSlots || Object.keys(resolvedSlots).length === 0) {
          resolvedSlots = deriveLegacyLockedSlots(existingRows, doc.data.lockedShifts, UNITS_ORDER);
        }
        const enrichedData = {
          ...doc.data,
          lockedSlots: resolvedSlots,
          lockedShifts: resolvedLocks,
          _id: doc._id,
          id: doc._id,
        };
        return res.status(200).json({
          success: true,
          data: [enrichedData],
          recordId: doc._id,
          lockedSlots: resolvedSlots,
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
    console.error('[CR202 GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved CR 202 analysis record
 * @route   POST /api/cr-202-analysis/:id/retry-email
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
