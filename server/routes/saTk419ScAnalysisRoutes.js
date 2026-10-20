const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');
const {
  hydrateLockState,
  getInitialLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
} = require('../services/analysisLockEngine');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for TK 419 records
const saTk419Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_DISPLAY_NAMES = {
  s1: 'I SHIFT',
  s2: 'II SHIFT',
  s3: 'III SHIFT',
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const normalizeShiftKey = (key) => {
  if (!key) return 's1';
  const clean = String(key).toLowerCase().trim();
  if (clean === 'shift1' || clean === 's1' || clean === 'i shift' || clean.includes('i')) return 's1';
  if (clean === 'shift2' || clean === 's2' || clean === 'ii shift' || clean.includes('ii')) return 's2';
  if (clean === 'shift3' || clean === 's3' || clean === 'iii shift' || clean.includes('iii')) return 's3';
  return 's1';
};

/**
 * @desc    Save or edit SA Plant TK 419 SC Tank Analysis data with sequential shift locking
 * @route   POST /api/sa-tk-419-sc-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save TK 419 SC Tank Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: TK 419 SC Tank Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const shifts = payload.shifts || payload.rows || {};
    const errors = [];
    const paramKeys = ['fnh3', 'cnh3'];

    // Validate numeric values if entered
    ['s1', 's2', 's3'].forEach((sKey) => {
      const sObj = shifts[sKey] || shifts[`shift${sKey.slice(1)}`] || {};
      paramKeys.forEach((pKey) => {
        const val = sObj[pKey];
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`Shift '${SHIFT_DISPLAY_NAMES[sKey]}', parameter '${pKey.toUpperCase()}' must be a valid number.`);
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

    const plantTarget = payload.plant || 'SA';

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
      analysisType: { $in: ['TK 419 SC TANK Analysis', 'TK 419 SC Tank Analysis', 'TK 419 Analysis'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingShifts = existingData.shifts || existingData.rows || existingData || {};

    const targetShifts = ['s1', 's2', 's3'];
    let lockedShifts = existingData.lockedShifts
      ? hydrateLockState(existingData.lockedShifts, { type: 'shift', items: targetShifts })
      : getInitialLockState({ type: 'shift', items: targetShifts });
    let editedFields = { ...(existingData.editedFields || {}) };
    let editAuditHistory = [...(existingData.editAuditHistory || [])];

    // Helper: Compare values numerically or as strings
    const isParamDiff = (o, n) => {
      if (o === undefined || o === null || o === '') o = null;
      if (n === undefined || n === null || n === '') n = null;
      if (o === null && n === null) return false;
      if (o === null || n === null) return true;
      if (!isNaN(Number(o)) && !isNaN(Number(n))) {
        return Number(o) !== Number(n);
      }
      return String(o) !== String(n);
    };

    const isShiftDiff = (sKey) => {
      const oldObj = existingShifts[sKey] || existingShifts[`shift${sKey.slice(1)}`] || {};
      const newObj = shifts[sKey] || shifts[`shift${sKey.slice(1)}`] || {};
      return paramKeys.some((p) => isParamDiff(oldObj[p], newObj[p]));
    };

    const hasShiftData = (sKey) => {
      const sObj = shifts[sKey] || shifts[`shift${sKey.slice(1)}`] || {};
      return paramKeys.some((p) => sObj[p] !== '' && sObj[p] !== null && sObj[p] !== undefined);
    };

    const isShiftLocked = (sKey) => {
      const check = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: sKey,
        itemsOrder: targetShifts,
        isDiff: true,
        type: 'shift',
      });
      return !check.allowed;
    };

    if (lockedShifts.allPermanentlyLocked) {
      const hasShiftChanges = targetShifts.some((sKey) => hasShiftData(sKey) && isShiftDiff(sKey));
      if (hasShiftChanges) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }
    }

    // Check lock violations
    for (const sKey of targetShifts) {
      if (hasShiftData(sKey) && isShiftLocked(sKey)) {
        if (isShiftDiff(sKey)) {
          const check = validateSequentialSave({
            lockState: lockedShifts,
            targetItem: sKey,
            itemsOrder: targetShifts,
            isDiff: true,
            type: 'shift',
          });
          return res.status(400).json({
            success: false,
            message: check.message || `Cannot edit ${SHIFT_DISPLAY_NAMES[sKey]} because it is locked.`,
          });
        }
      }
    }

    // Determine which shifts have changed and are not locked
    const willSave = {};
    for (const sKey of targetShifts) {
      if (hasShiftData(sKey) && isShiftDiff(sKey) && !isShiftLocked(sKey)) {
        willSave[sKey] = true;
      }
    }

    const shiftsToSave = targetShifts.filter((k) => willSave[k]);
    if (shiftsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time.',
      });
    }

    const activeShiftKey = shiftsToSave[0] || (payload.shift ? normalizeShiftKey(payload.shift) : null);
    if (!activeShiftKey || (!willSave[activeShiftKey] && !hasShiftData(activeShiftKey))) {
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

    // Merge shift rows cleanly
    const mergedShifts = {
      s1: { fnh3: '', cnh3: '', ...(existingShifts.s1 || existingShifts.shift1 || {}) },
      s2: { fnh3: '', cnh3: '', ...(existingShifts.s2 || existingShifts.shift2 || {}) },
      s3: { fnh3: '', cnh3: '', ...(existingShifts.s3 || existingShifts.shift3 || {}) },
    };

    const newActiveObj = shifts[activeShiftKey] || shifts[`shift${activeShiftKey.slice(1)}`] || {};
    const oldActiveObj = existingShifts[activeShiftKey] || existingShifts[`shift${activeShiftKey.slice(1)}`] || {};

    const isPriorSavedShift =
      (activeShiftKey === 's1' && lockedShifts.s1Saved) ||
      (activeShiftKey === 's2' && lockedShifts.s2Saved) ||
      (activeShiftKey === 's3' && lockedShifts.s3Saved);

    paramKeys.forEach((pKey) => {
      const oVal = oldActiveObj[pKey];
      const nVal = newActiveObj[pKey];
      if (isPriorSavedShift && isParamDiff(oVal, nVal)) {
        editedFields[`${activeShiftKey}_${pKey}`] = true;
        editAuditHistory.push({
          shiftKey: activeShiftKey,
          field: pKey,
          oldValue: oVal !== undefined && oVal !== null ? oVal : null,
          newValue: nVal !== undefined && nVal !== null ? nVal : null,
          editor: req.user?.name || payload.submittedBy || 'Plant Operator',
          editorId: req.user?._id || null,
          date: payload.date,
          timestamp: new Date().toISOString(),
        });
      }
      mergedShifts[activeShiftKey][pKey] = nVal !== undefined && nVal !== null && nVal !== '' ? String(nVal) : '';
    });

    // Update locked status via universal locking engine
    lockedShifts = applySequentialSaveTransition({
      lockState: lockedShifts,
      targetItem: activeShiftKey,
      itemsOrder: targetShifts,
      isCorrection: saveValidation.isCorrection,
      type: 'shift',
    });

    // Generate unique Save Event ID
    const saveEventId = `save_satk419_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const updatedRecordData = {
      id: existingData.id || `sa_tk419_sc_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      unit: 'TK 419 SC TANK',
      frequency: 'Once in a Shift',
      analysisType: 'TK 419 SC TANK Analysis',
      tank: 'TK 419 SC TANK',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      shifts: mergedShifts,
      rows: mergedShifts,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // 6. Persist to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: { $in: ['TK 419 SC TANK Analysis', 'TK 419 SC Tank Analysis', 'TK 419 Analysis'] },
        date: payload.date,
      },
      {
        plantName: 'SA Plant',
        plantCode: 'SA',
        analysisType: 'TK 419 SC TANK Analysis',
        unit: 'TK 419 SC TANK',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
        date: payload.date,
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
    saTk419Records.unshift(updatedRecordData);
    if (saTk419Records.length > 50) saTk419Records.pop();

    // Log Activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          action: 'SA_TK419_SC_SAVED',
          user: req.user._id,
          userName: req.user.name,
          details: `TK 419 SC Tank Analysis saved for date: ${payload.date} (${SHIFT_DISPLAY_NAMES[activeShiftKey]}) [Event: ${saveEventId}].`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // 7. Execute Centralized Save & Email Workflow
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'TK 419 SC TANK Analysis',
        unit: 'TK 419 SC TANK',
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

      lastEmailResult = await emailPromise;
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for TK 419:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailSent ? 'sent' : 'failed';
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: `Successfully saved TK 419 SC Tank Analysis (${SHIFT_DISPLAY_NAMES[activeShiftKey]}) in MongoDB ✓`,
      data: updatedRecordData,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      savedShift: activeShiftKey,
      emailSent: false,
      emailPending: false,
      emailStatus: 'disabled',
      emailRecipient: null,
      emailNotification: null,
    });
  } catch (error) {
    console.error('Error in POST /api/sa-tk-419-sc-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save TK 419 SC Tank Analysis record: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 419 SC Tank Analysis records
 * @route   GET /api/sa-tk-419-sc-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    const targetShifts = ['s1', 's2', 's3'];

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: { $in: ['TK 419 SC TANK Analysis', 'TK 419 SC Tank Analysis', 'TK 419 Analysis'] },
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const docData = doc.data || {};
        const resolvedLocks = docData.lockedShifts
          ? hydrateLockState(docData.lockedShifts, { type: 'shift', items: targetShifts })
          : getInitialLockState({ type: 'shift', items: targetShifts });
        const enrichedData = {
          ...docData,
          _id: doc._id,
          id: doc._id,
          recordId: doc._id,
          lockedShifts: resolvedLocks,
          editedFields: docData.editedFields || {},
        };
        return res.status(200).json({
          success: true,
          data: enrichedData,
          recordId: doc._id,
          lockedShifts: resolvedLocks,
          editedFields: docData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    const initialLocks = getInitialLockState({ type: 'shift', items: targetShifts });
    return res.status(200).json({
      success: true,
      data: null,
      recordId: null,
      lockedShifts: initialLocks,
      editedFields: {},
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[SA GET TK 419] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved TK 419 analysis record
 * @route   POST /api/sa-tk-419-sc-analysis/:id/retry-email
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
