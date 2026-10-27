const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const {
  hydrateLockState,
  getInitialLockState,
  computeSlotTransition,
  recordFieldEdits,
  pickCanonicalDoc,
} = require('../services/analysisLockEngine');

// In-memory fallback
const tk205Records = [];

// Apply authentication middleware
router.use(protect);

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl'];

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
 * @desc    Save TK 205 Analysis data (Sequential slot-level locking per FINAL SPEC 1-9)
 * @route   POST /api/tk-205-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify TK 205
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: TK 205 Analysis data entry and modification is restricted to Company Admins.',
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
        message: 'Analysis Date is required to save TK 205 Analysis.',
      });
    }

    // 1. Date guard: process.env.NODE_ENV==='test' || process.env.TEST_MODE==='true' ONLY
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: TK 205 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    // 2. Load docs where plantCode in ['ACL','ACL Plant','ACL PLANT'] + analysisType + date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'TK 205 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    const matchingDocs = await PlantAnalysisRecord.find(query);
    const existingDoc = pickCanonicalDoc(matchingDocs);
    const existingData = existingDoc?.data || {};
    const existingRows = existingData.rows || {};
    const existingLockedSlots = existingData.lockedSlots || {};
    const incomingRows = payload.rows || payload.shiftRows || {};

    // 3. Compute slot transition using pure engine
    const transition = computeSlotTransition({
      unitsOrder: UNITS_ORDER,
      lockedSlots: existingLockedSlots,
      storedRows: existingRows,
      incomingRows,
      isTestMode,
      now: new Date(),
    });

    // 6. Identical re-save: HTTP 200 {success:true, noChange:true, message:'No changes'}, no write.
    if (transition.noChange) {
      return res.status(200).json({
        success: true,
        noChange: true,
        message: 'No changes',
      });
    }

    // 7. Errors: 400 for empty / locked-unit edit / skip-ahead / multi-unit / correction-clears-all
    if (!transition.ok) {
      return res.status(transition.status || 400).json({
        success: false,
        message: transition.message,
      });
    }

    const targetUnit = transition.targetUnit;

    // 3. Doc missing: first save must be t07
    if (!existingDoc && targetUnit !== 't07') {
      return res.status(400).json({
        success: false,
        message: `Sequential restriction: t07 must be completed and saved before proceeding to ${targetUnit}.`,
      });
    }

    // 5. Audit tracking entries via recordFieldEdits in same update (only on corrections)
    if (transition.isCorrection) {
      const auditResult = recordFieldEdits({
        fields: PARAMETERS,
        oldRows: existingRows[targetUnit] || {},
        newRows: incomingRows[targetUnit] || {},
        editorName: req.user?.name || payload.submittedBy || 'Plant Operator',
        editorId: req.user?._id || null,
        itemKey: targetUnit,
        existingEditedFields: existingData.editedFields || {},
        existingAuditHistory: existingData.editAuditHistory || [],
      });
      transition.dotPathUpdates['data.editedFields'] = auditResult.editedFields;
      transition.dotPathUpdates['data.editAuditHistory'] = auditResult.editAuditHistory;
    }

    // Keep legacy data.lockedShifts in sync via dot-paths
    const currentSlots = { ...existingLockedSlots };
    currentSlots[targetUnit] = {
      ...(currentSlots[targetUnit] || {}),
      isSaved: true,
      isLocked: transition.isCorrection ? true : false,
      correctionUsed: transition.isCorrection ? true : false,
    };
    const targetIdx = UNITS_ORDER.indexOf(targetUnit);
    for (let p = 0; p < targetIdx; p++) {
      const pKey = UNITS_ORDER[p];
      currentSlots[pKey] = { ...(currentSlots[pKey] || {}), isLocked: true };
    }

    const shift1Saved = Boolean(currentSlots.t07?.isSaved);
    const shift1Locked = Boolean(currentSlots.t13?.isLocked || currentSlots.t15?.isSaved);
    const shift2Saved = Boolean(currentSlots.t15?.isSaved);
    const shift2Locked = Boolean(currentSlots.t21?.isLocked || currentSlots.t23?.isSaved);
    const shift3Saved = Boolean(currentSlots.t23?.isSaved);
    const shift3Locked = Boolean(currentSlots.t05?.isLocked);

    transition.dotPathUpdates['data.lockedShifts.shift1Saved'] = shift1Saved;
    transition.dotPathUpdates['data.lockedShifts.shift2Saved'] = shift2Saved;
    transition.dotPathUpdates['data.lockedShifts.shift3Saved'] = shift3Saved;
    transition.dotPathUpdates['data.lockedShifts.shift1Locked'] = shift1Locked;
    transition.dotPathUpdates['data.lockedShifts.shift2Locked'] = shift2Locked;
    transition.dotPathUpdates['data.lockedShifts.shift3Locked'] = shift3Locked;
    transition.dotPathUpdates['data.lockedShifts.shift1'] = Boolean(shift1Locked);
    transition.dotPathUpdates['data.lockedShifts.shift2'] = !shift1Saved || Boolean(shift2Locked);
    transition.dotPathUpdates['data.lockedShifts.shift3'] = !shift2Saved || Boolean(shift3Locked);

    // Top-level fields
    transition.dotPathUpdates['submittedBy'] = req.user?.name || payload.submittedBy || 'Plant Operator';
    transition.dotPathUpdates['submittedById'] = req.user?._id || null;
    transition.dotPathUpdates['savedAt'] = new Date();
    const activeShiftKey = ['t07', 't09', 't11', 't13'].includes(targetUnit) ? 'shift1' :
                           ['t15', 't17', 't19', 't21'].includes(targetUnit) ? 'shift2' : 'shift3';
    transition.dotPathUpdates['shift'] = SHIFT_DISPLAY_NAMES[activeShiftKey] || 'I SHIFT';

    let savedDoc = null;

    if (!existingDoc) {
      // 3. Doc missing: updateOne with $setOnInsert + $set, upsert: true
      const missingFilter = {
        plantCode: 'ACL',
        analysisType: 'TK 205 Analysis',
        date: payload.date,
      };
      const updateDoc = {
        $setOnInsert: {
          plantName: 'ACL Plant',
          plantCode: 'ACL',
          analysisType: 'TK 205 Analysis',
          unit: 'TK 205',
          date: payload.date,
          shift: 'All Shifts',
          company: req.user?.company?._id || req.user?.company || null,
          submittedById: req.user?._id || null,
          createdAt: new Date(),
        },
        $set: transition.dotPathUpdates,
      };

      try {
        await PlantAnalysisRecord.updateOne(missingFilter, updateDoc, { upsert: true });
        savedDoc = await PlantAnalysisRecord.findOne(missingFilter);
      } catch (err) {
        if (err.code === 11000 || String(err.message).includes('E11000')) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: Document for this date was created concurrently. Please retry.',
          });
        }
        throw err;
      }
    } else {
      // 4. Doc exists: findOneAndUpdate by _id, NO upsert, conditional guard
      const existsFilter = {
        _id: existingDoc._id,
        ...(transition.isCorrection
          ? {
              [`data.lockedSlots.${targetUnit}.isSaved`]: true,
              [`data.lockedSlots.${targetUnit}.correctionUsed`]: false,
              [`data.lockedSlots.${targetUnit}.isLocked`]: false,
            }
          : {
              $or: [
                { [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true } },
                { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
              ],
            }),
      };

      savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
        existsFilter,
        { $set: transition.dotPathUpdates },
        { new: true }
      );

      if (!savedDoc) {
        return res.status(409).json({
          success: false,
          message: `Conflict: Slot ${targetUnit} has already been saved or locked by another session. Please refresh.`,
        });
      }
    }

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_205_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 205 Analysis saved for date: ${payload.date}, slot: ${targetUnit}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: transition.isCorrection
        ? `Correction for ${targetUnit} saved successfully. Slot is now locked.`
        : `Successfully saved ${targetUnit} in MongoDB ✓`,
      targetUnit,
      isCorrection: transition.isCorrection,
      dotPathUpdates: transition.dotPathUpdates,
      recordId: savedDoc?._id || existingDoc?._id || null,
    });
  } catch (error) {
    console.error('[TK205Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 205 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 205 Analysis records
 * @route   GET /api/tk-205-analysis
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
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'TK 205 Analysis' };
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
    console.error('[ACL GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved TK 205 analysis record
 * @route   POST /api/tk-205-analysis/:id/retry-email
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
