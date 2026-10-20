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

// In-memory cache storage for T 401 records
const t401Records = [];

// Apply authentication middleware
router.use(protect);

const TOWERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const SHIFTS = ['s1', 's2', 's3'];
const PARAM_KEYS = ['fnh3', 'cnh3', 'tcl', 'pcl'];

const TOWER_DISPLAY_NAMES = {
  a: 'T 401 A',
  b: 'T 401 B',
  c: 'T 401 C',
  d: 'T 401 D',
  e: 'T 401 E',
  f: 'T 401 F',
};

const SHIFT_DISPLAY_NAMES = {
  s1: 'I SHIFT',
  s2: 'II SHIFT',
  s3: 'III SHIFT',
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const hydrateTowerLocks = (rawLocks) => {
  const result = {};
  for (const uKey of TOWERS) {
    result[uKey] = hydrateLockState(rawLocks?.[uKey], { type: 'shift', items: SHIFTS });
  }
  return result;
};

const getInitialTowerLocks = () => {
  const result = {};
  for (const uKey of TOWERS) {
    result[uKey] = getInitialLockState({ type: 'shift', items: SHIFTS });
  }
  return result;
};

/**
 * @desc    Save or edit SA Plant T 401 Analysis data with tower-wise & sequential shift locking
 * @route   POST /api/t-401-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save T 401 Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: T 401 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const units = payload.units || payload.towers || {};
    const errors = [];

    // Validate numeric values if entered
    TOWERS.forEach((uKey) => {
      const uObj = units[uKey] || {};
      SHIFTS.forEach((sKey) => {
        const sObj = uObj[sKey] || uObj[`shift${sKey.slice(1)}`] || {};
        PARAM_KEYS.forEach((pKey) => {
          const val = sObj[pKey];
          if (val === '' || val === null || val === undefined) return;
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Tower '${TOWER_DISPLAY_NAMES[uKey]}', Shift '${SHIFT_DISPLAY_NAMES[sKey]}', Parameter '${pKey.toUpperCase()}' must be a valid number.`);
          }
        });
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
      analysisType: { $in: ['T 401 Analysis', 'T401 Analysis'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingUnits = existingData.units || existingData.towers || {};

    // lockedShifts structure: { [towerKey]: lockState }
    let lockedShifts = existingData.lockedShifts
      ? hydrateTowerLocks(existingData.lockedShifts)
      : getInitialTowerLocks();
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

    const isShiftDiff = (uKey, sKey) => {
      const oldObj = (existingUnits[uKey] && (existingUnits[uKey][sKey] || existingUnits[uKey][`shift${sKey.slice(1)}`])) || {};
      const newObj = (units[uKey] && (units[uKey][sKey] || units[uKey][`shift${sKey.slice(1)}`])) || {};
      return PARAM_KEYS.some((p) => isParamDiff(oldObj[p], newObj[p]));
    };

    const hasShiftData = (uKey, sKey) => {
      const sObj = (units[uKey] && (units[uKey][sKey] || units[uKey][`shift${sKey.slice(1)}`])) || {};
      return PARAM_KEYS.some((p) => sObj[p] !== '' && sObj[p] !== null && sObj[p] !== undefined);
    };

    const isShiftLocked = (uKey, sKey) => {
      const uLocks = lockedShifts[uKey] || getInitialLockState({ type: 'shift', items: SHIFTS });
      const check = validateSequentialSave({
        lockState: uLocks,
        targetItem: sKey,
        itemsOrder: SHIFTS,
        isDiff: true,
        type: 'shift',
      });
      return !check.allowed;
    };

    // Filter which towers are in scope if targetTower is specified, otherwise all
    const targetTower = payload.targetTower || payload.selectedOption; // 'a'-'f', 'all', or undefined
    const towersToCheck = (targetTower && targetTower !== 'all' && TOWERS.includes(targetTower))
      ? [targetTower]
      : TOWERS;

    // Check lock violations across in-scope towers
    for (const uKey of towersToCheck) {
      for (const sKey of SHIFTS) {
        if (hasShiftData(uKey, sKey) && isShiftLocked(uKey, sKey)) {
          if (isShiftDiff(uKey, sKey)) {
            const check = validateSequentialSave({
              lockState: lockedShifts[uKey] || getInitialLockState({ type: 'shift', items: SHIFTS }),
              targetItem: sKey,
              itemsOrder: SHIFTS,
              isDiff: true,
              type: 'shift',
            });
            return res.status(400).json({
              success: false,
              message: check.message || `Cannot edit ${TOWER_DISPLAY_NAMES[uKey]} ${SHIFT_DISPLAY_NAMES[sKey]} because it is locked.`,
            });
          }
        }
      }
    }

    // Determine changes per tower
    // changesToSave: Array of { towerKey, shiftKey, validation }
    const changesToSave = [];
    for (const uKey of towersToCheck) {
      const uLocks = lockedShifts[uKey] || getInitialLockState({ type: 'shift', items: SHIFTS });
      for (const sKey of SHIFTS) {
        if (hasShiftData(uKey, sKey) && isShiftDiff(uKey, sKey) && !isShiftLocked(uKey, sKey)) {
          const check = validateSequentialSave({
            lockState: uLocks,
            targetItem: sKey,
            itemsOrder: SHIFTS,
            isDiff: true,
            type: 'shift',
          });
          if (!check.allowed) {
            return res.status(check.statusCode || 400).json({
              success: false,
              message: `${TOWER_DISPLAY_NAMES[uKey]}: ${check.message}`,
            });
          }
          changesToSave.push({ towerKey: uKey, shiftKey: sKey, validation: check });
        }
      }
    }

    if (changesToSave.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unlocked tower shifts with valid new or modified data were found to save.',
      });
    }

    // If an individual tower is selected, enforce single-shift saving
    if (targetTower && targetTower !== 'all' && changesToSave.length > 1) {
      const distinctShifts = [...new Set(changesToSave.map(c => c.shiftKey))];
      if (distinctShifts.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time for this tower.',
        });
      }
    }

    // Build the merged units data
    const mergedUnits = JSON.parse(JSON.stringify(existingUnits));
    TOWERS.forEach((uKey) => {
      if (!mergedUnits[uKey]) mergedUnits[uKey] = {};
      SHIFTS.forEach((sKey) => {
        if (!mergedUnits[uKey][sKey]) mergedUnits[uKey][sKey] = {};
        PARAM_KEYS.forEach((pKey) => {
          if (!mergedUnits[uKey][sKey][pKey]) mergedUnits[uKey][sKey][pKey] = '';
        });
      });
    });

    const nowIso = new Date().toISOString();
    const saveEventId = `t401_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Apply changes and update tower-wise sequential lock flags
    for (const { towerKey: uKey, shiftKey: sKey, validation } of changesToSave) {
      if (!lockedShifts[uKey]) {
        lockedShifts[uKey] = getInitialLockState({ type: 'shift', items: SHIFTS });
      }
      const uLocks = lockedShifts[uKey];

      if (!editedFields[uKey]) editedFields[uKey] = {};
      if (!editedFields[uKey][sKey]) editedFields[uKey][sKey] = {};

      const oldShiftValues = (existingUnits[uKey] && (existingUnits[uKey][sKey] || existingUnits[uKey][`shift${sKey.slice(1)}`])) || {};
      const newShiftValues = (units[uKey] && (units[uKey][sKey] || units[uKey][`shift${sKey.slice(1)}`])) || {};

      // Audit and field-level tracking
      PARAM_KEYS.forEach((pKey) => {
        const oVal = oldShiftValues[pKey];
        const nVal = newShiftValues[pKey];
        if (nVal !== undefined) {
          mergedUnits[uKey][sKey][pKey] = nVal;
        }

        // Only track EDITED badge if shift was previously saved
        const wasPreviouslySaved =
          (sKey === 's1' && uLocks.s1Saved) ||
          (sKey === 's2' && uLocks.s2Saved) ||
          (sKey === 's3' && uLocks.s3Saved);

        if (wasPreviouslySaved && isParamDiff(oVal, nVal)) {
          editedFields[uKey][sKey][pKey] = true;
          editAuditHistory.push({
            date: payload.date,
            tower: uKey,
            towerName: TOWER_DISPLAY_NAMES[uKey],
            shift: sKey,
            shiftName: SHIFT_DISPLAY_NAMES[sKey],
            field: pKey,
            oldValue: oVal,
            newValue: nVal,
            editor: req.user?.name || payload.submittedBy || 'Plant Operator',
            timestamp: nowIso,
            saveEventId,
          });
        }
      });

      // Update sequential locking status for this specific tower via universal locking engine
      lockedShifts[uKey] = applySequentialSaveTransition({
        lockState: lockedShifts[uKey],
        targetItem: sKey,
        itemsOrder: SHIFTS,
        isCorrection: validation?.isCorrection || false,
        type: 'shift',
      });
    }

    // Determine primary shift label for display
    const savedShiftsSet = [...new Set(changesToSave.map(c => SHIFT_DISPLAY_NAMES[c.shiftKey]))];
    const shiftDisplayLabel = savedShiftsSet.join(', ');
    const savedTowersSet = [...new Set(changesToSave.map(c => TOWER_DISPLAY_NAMES[c.towerKey]))];
    const towerDisplayLabel = savedTowersSet.length === 6 ? 'All Options (A–F)' : savedTowersSet.join(', ');

    // Structure record data
    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `t401_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      analysisType: 'T 401 Analysis',
      tower: 'T 401',
      towerOption: towerDisplayLabel,
      units: mergedUnits,
      towers: mergedUnits,
      shifts: mergedUnits,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company || null,
      saveEventId,
    };

    // 4. Atomic Database Persistence
    let savedRecordDoc = null;
    try {
      savedRecordDoc = await PlantAnalysisRecord.findOneAndUpdate(
        {
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: { $in: ['T 401 Analysis', 'T401 Analysis'] },
          date: payload.date,
        },
        {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'T 401 Analysis',
          unit: 'T 401 (Options A–F)',
          date: payload.date,
          shift: shiftDisplayLabel,
          data: recordPayload,
          submittedBy: recordPayload.submittedBy,
          submittedById: recordPayload.submittedById,
          company: recordPayload.company,
          status: 'completed',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      console.error('[T 401 Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Keep in-memory cache synchronized
    const cachedIdx = t401Records.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      t401Records[cachedIdx] = recordPayload;
    } else {
      t401Records.unshift(recordPayload);
    }

    return res.status(201).json({
      success: true,
      message: 'T 401 Analysis saved successfully in MongoDB ✓',
      data: {
        ...recordPayload,
        _id: savedRecordDoc._id,
        id: savedRecordDoc._id,
      },
      recordId: savedRecordDoc._id,
      analysis: {
        _id: savedRecordDoc._id,
        recordSummary: {
          date: payload.date,
          units: mergedUnits,
          lockedShifts,
          editedFields,
          editAuditHistory,
        },
      },
      lockedShifts,
      editedFields,
      emailStatus: 'disabled',
      emailSent: false,
      emailDeliveryStatus: 'disabled',
      emailRecipient: null,
      saveEventId,
    });
  } catch (error) {
    console.error('[T 401 API] Unexpected error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing T 401 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve T 401 Analysis records
 * @route   GET /api/t-401-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: { $in: ['T 401 Analysis', 'T401 Analysis'] },
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const docData = doc.data || {};
        const resolvedLocks = docData.lockedShifts
          ? hydrateTowerLocks(docData.lockedShifts)
          : getInitialTowerLocks();
        const enrichedData = {
          ...docData,
          _id: doc._id,
          id: doc._id,
          recordId: doc._id,
          units: docData.units || docData.towers || {},
          lockedShifts: resolvedLocks,
          editedFields: docData.editedFields || {},
        };
        return res.status(200).json({
          success: true,
          data: [enrichedData],
          record: enrichedData,
          recordId: doc._id,
          lockedShifts: resolvedLocks,
          editedFields: docData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    const initialLocks = getInitialTowerLocks();
    return res.status(200).json({
      success: true,
      data: [],
      record: null,
      recordId: null,
      lockedShifts: initialLocks,
      editedFields: {},
      assignedOperatorEmail,
      emailStatus: 'failed',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[T 401 GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving T 401 analysis records.',
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved T 401 analysis record
 * @route   POST /api/t-401-analysis/:id/retry-email
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
