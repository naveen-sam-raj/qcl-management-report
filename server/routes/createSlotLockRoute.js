const express = require('express');
const authMiddleware = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const {
  hydrateLockState,
  getInitialLockState,
  computeSlotTransition,
  recordFieldEdits,
  pickCanonicalDoc,
  isUnitEmpty,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const SLOT_SHIFT_MAP = {
  t07: 'shift1',
  t09: 'shift1',
  t11: 'shift1',
  t13: 'shift1',
  t15: 'shift2',
  t17: 'shift2',
  t19: 'shift2',
  t21: 'shift2',
  t23: 'shift3',
  t01: 'shift3',
  t03: 'shift3',
  t05: 'shift3',
};

/**
 * Derives lockedSlots state in memory for legacy documents that do not have data.lockedSlots.
 *
 * Rules:
 * - h = highest saved slot index.
 * - slots < h: locked (isSaved per data). Gaps are locked-empty.
 * - h: locked + correctionUsed if legacy lockedShifts says its shift is locked, else one correction available.
 * - h + 1: open (unless allPermanentlyLocked).
 * - rest (> h + 1): waiting (isSaved: false, isLocked: true).
 */
function deriveLegacyLockedSlots(rows = {}, legacyLockedShifts = {}, unitsOrder = []) {
  const result = {};
  const savedIndices = [];
  unitsOrder.forEach((slotKey, idx) => {
    if (!isUnitEmpty(rows?.[slotKey])) {
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

  // Case 1: No saved slots
  const allLocked = Boolean(legacyLockedShifts?.allPermanentlyLocked);
  if (savedIndices.length === 0) {
    unitsOrder.forEach((slotKey) => {
      result[slotKey] = {
        isSaved: false,
        isLocked: allLocked,
        correctionUsed: false,
      };
    });
    return result;
  }

  // Case 2: Some saved slots
  const hIdx = Math.max(...savedIndices);
  const hSlotKey = unitsOrder[hIdx];
  const hShiftKey = SLOT_SHIFT_MAP[hSlotKey] || 'shift1';
  const hShiftIsLocked = isLegacyShiftLocked(hShiftKey) || Boolean(legacyLockedShifts.allPermanentlyLocked);

  unitsOrder.forEach((slotKey, idx) => {
    if (idx < hIdx) {
      const hasData = !isUnitEmpty(rows?.[slotKey]);
      result[slotKey] = {
        isSaved: hasData,
        isLocked: true,
        correctionUsed: false,
      };
    } else if (idx === hIdx) {
      result[slotKey] = {
        isSaved: true,
        isLocked: hShiftIsLocked,
        correctionUsed: hShiftIsLocked,
      };
    } else if (idx === hIdx + 1) {
      result[slotKey] = {
        isSaved: false,
        isLocked: allLocked,
        correctionUsed: false,
      };
    } else {
      // rest: waiting (not locked unless allPermanentlyLocked)
      result[slotKey] = {
        isSaved: false,
        isLocked: allLocked,
        correctionUsed: false,
      };
    }
  });

  return result;
}

/**
 * Route factory for slot-level locking analysis routes (TK 205, TK 203, TK 207).
 *
 * @param {Object} config
 * @param {string} config.analysisType - e.g. 'TK 205 Analysis'
 * @param {string} config.unitName - e.g. 'TK 205'
 * @param {string} [config.plantName='ACL Plant']
 * @param {string} [config.plantCode='ACL']
 * @param {string[]} [config.unitsOrder]
 * @param {string[]} [config.parameters]
 * @returns {Function} ({ getNow } = {}) => express.Router()
 */
function createSlotLockRoute({
  analysisType,
  unitName,
  plantName = 'ACL Plant',
  plantCode = 'ACL',
  unitsOrder = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'],
  parameters = ['fnh3', 'cnh3', 'tcl', 'pcl'],
}) {
  const logAction = `${unitName.toUpperCase().replace(/\s+/g, '_')}_ANALYSIS_SAVED`;
  const plantCodes = [plantCode, `${plantCode} Plant`, `${plantCode} PLANT`];

  return function createRouter(options = {}) {
    const getNow = typeof options.getNow === 'function' ? options.getNow : () => new Date();
    const router = express.Router();

    // Apply authentication middleware
    router.use((req, res, next) => authMiddleware.protect(req, res, next));

    /**
     * @desc    Save analysis data with sequential slot-level locking
     * @route   POST /
     * @access  Private
     */
    router.post('/', async (req, res) => {
      try {
        const payload = req.body;

        // 1. Authorization: Standard users in View-Only mode cannot modify data
        if (req.user && req.user.role === 'user') {
          return res.status(403).json({
            success: false,
            message: `Forbidden: ${analysisType} data entry and modification is restricted to Company Admins.`,
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
            message: `Analysis Date is required to save ${analysisType}.`,
          });
        }

        // Strict operating date guard (06:00-06:00 IST). Never accepts x-test-now or payload.now
        const now = getNow();
        const operatingDate = getOperatingDateIST(now);

        if (payload.date !== operatingDate) {
          return res.status(400).json({
            success: false,
            message: `Date restriction enforced: ${analysisType} records can only be created or modified for the current operating date (${operatingDate}). Historical or future modifications are not permitted.`,
          });
        }

        // 2. Load docs for this plantCode + analysisType + date
        const query = {
          date: payload.date,
          plantCode: { $in: plantCodes },
          analysisType,
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query);
        const existingDoc = pickCanonicalDoc(matchingDocs);
        const existingData = existingDoc?.data || {};
        const existingRows = existingData.rows || {};
        let existingLockedSlots = existingData.lockedSlots;
        const hasStoredLockedSlots = Boolean(existingLockedSlots && Object.keys(existingLockedSlots).length > 0);

        if (!hasStoredLockedSlots) {
          existingLockedSlots = deriveLegacyLockedSlots(existingRows, existingData.lockedShifts, unitsOrder);
        }

        const incomingRows = payload.rows || payload.shiftRows || {};

        // 3. Compute slot transition using pure engine
        const transition = computeSlotTransition({
          unitsOrder,
          lockedSlots: existingLockedSlots,
          storedRows: existingRows,
          incomingRows,
          now,
        });

        // Identical re-save: HTTP 200 {success:true, noChange:true, message:'No changes'}, no write
        if (transition.noChange) {
          return res.status(200).json({
            success: true,
            noChange: true,
            message: 'No changes',
          });
        }

        // Transition errors: 400 for empty / locked-unit edit / skip-ahead / multi-unit / correction-clears-all
        if (!transition.ok) {
          return res.status(transition.status || 400).json({
            success: false,
            message: transition.message,
          });
        }

        const targetUnit = transition.targetUnit;

        // Doc missing: first save must be first unit
        if (!existingDoc && targetUnit !== unitsOrder[0]) {
          return res.status(400).json({
            success: false,
            message: `Sequential restriction: ${unitsOrder[0]} must be completed and saved before proceeding to ${targetUnit}.`,
          });
        }

        // Audit tracking entries via recordFieldEdits in same update (only on corrections)
        if (transition.isCorrection) {
          const auditResult = recordFieldEdits({
            fields: parameters,
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
        const targetIdx = unitsOrder.indexOf(targetUnit);
        for (let p = 0; p < targetIdx; p++) {
          const pKey = unitsOrder[p];
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

        // If doc had no stored lockedSlots in DB, persist all hydrated slots so full state is stored
        if (existingDoc && !hasStoredLockedSlots) {
          for (const s of unitsOrder) {
            if (s !== targetUnit && existingLockedSlots[s] && (existingLockedSlots[s].isSaved || existingLockedSlots[s].isLocked)) {
              transition.dotPathUpdates[`data.lockedSlots.${s}.isSaved`] = Boolean(existingLockedSlots[s].isSaved);
              if (transition.dotPathUpdates[`data.lockedSlots.${s}.isLocked`] === undefined) {
                transition.dotPathUpdates[`data.lockedSlots.${s}.isLocked`] = Boolean(existingLockedSlots[s].isLocked);
              }
              transition.dotPathUpdates[`data.lockedSlots.${s}.correctionUsed`] = Boolean(existingLockedSlots[s].correctionUsed);
            }
          }
        }

        // Top-level metadata
        transition.dotPathUpdates['submittedBy'] = req.user?.name || payload.submittedBy || 'Plant Operator';
        transition.dotPathUpdates['submittedById'] = req.user?._id || null;
        transition.dotPathUpdates['savedAt'] = new Date();

        let savedDoc = null;

        if (!existingDoc) {
          // Missing doc: updateOne with $setOnInsert + $set, upsert: true
          const missingFilter = {
            plantCode,
            analysisType,
            date: payload.date,
            [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true },
          };
          const updateDoc = {
            $setOnInsert: {
              plantName,
              plantCode,
              analysisType,
              unit: unitName,
              date: payload.date,
              shift: 'All Shifts',
              company: req.user?.company?._id || req.user?.company || null,
              createdAt: new Date(),
            },
            $set: transition.dotPathUpdates,
          };

          try {
            const updateResult = await PlantAnalysisRecord.updateOne(missingFilter, updateDoc, { upsert: true });
            if (updateResult.upsertedCount === 0) {
              return res.status(409).json({
                success: false,
                message: 'Conflict: Document for this date was created concurrently. Please retry.',
              });
            }
            savedDoc = await PlantAnalysisRecord.findOne({
              plantCode,
              analysisType,
              date: payload.date,
            });
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
          // Existing doc: findOneAndUpdate by _id, NO upsert, conditional atomic guard
          const existsFilter = {
            _id: existingDoc._id,
            ...(transition.isCorrection
              ? (hasStoredLockedSlots
                  ? {
                      [`data.lockedSlots.${targetUnit}.isSaved`]: true,
                      [`data.lockedSlots.${targetUnit}.correctionUsed`]: false,
                      [`data.lockedSlots.${targetUnit}.isLocked`]: false,
                    }
                  : {
                      $or: [
                        {
                          [`data.lockedSlots.${targetUnit}.isSaved`]: true,
                          [`data.lockedSlots.${targetUnit}.correctionUsed`]: false,
                          [`data.lockedSlots.${targetUnit}.isLocked`]: false,
                        },
                        { [`data.lockedSlots`]: { $exists: false } },
                        { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
                      ],
                    })
              : {
                  $or: [
                    { [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true } },
                    { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
                  ],
                }),
          };

          try {
            savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
              existsFilter,
              { $set: transition.dotPathUpdates },
              { new: true }
            );
          } catch (err) {
            if (err.code === 11000 || String(err.message).includes('E11000')) {
              return res.status(409).json({
                success: false,
                message: 'Conflict: Document for this date was created concurrently. Please retry.',
              });
            }
            throw err;
          }

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
              action: logAction,
              user: req.user?._id,
              userName: req.user?.name,
              details: `${analysisType} saved for date: ${payload.date}, slot: ${targetUnit}.`,
              timestamp: new Date(),
            });
          }
        } catch (logErr) {}

        const savedData = savedDoc?.data || {};
        return res.status(200).json({
          success: true,
          message: transition.isCorrection
            ? `Correction for ${targetUnit} saved successfully. Slot is now locked.`
            : `Successfully saved ${targetUnit} in MongoDB ✓`,
          targetUnit,
          isCorrection: transition.isCorrection,
          recordId: savedDoc?._id || existingDoc?._id || null,
          data: {
            rows: savedData.rows || {},
            lockedSlots: savedData.lockedSlots || {},
            lockedShifts: savedData.lockedShifts || {},
            editedFields: savedData.editedFields || {},
            editAuditHistory: savedData.editAuditHistory || [],
          },
        });
      } catch (error) {
        console.error(`[${unitName} Analysis API] Error saving data:`, error);
        return res.status(500).json({
          success: false,
          message: `Server error while processing ${analysisType.toLowerCase()}: ` + error.message,
        });
      }
    });

    /**
     * @desc    Retrieve analysis records
     * @route   GET /
     * @access  Private
     */
    router.get('/', async (req, res) => {
      try {
        const { date } = req.query;
        const targetShifts = ['shift1', 'shift2', 'shift3'];
        const { getPlantAssignedUser } = require('../services/plantNotificationService');

        let assignedOperatorEmail = null;
        try {
          const { assignedUser, primaryEmail } = await getPlantAssignedUser(plantCode);
          assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
        } catch (uErr) {}

        if (date) {
          const query = {
            date,
            plantCode: { $in: plantCodes },
            analysisType,
          };
          if (req.user && req.user.company) {
            query.$or = [{ company: req.user.company }, { company: null }];
          }

          const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

          if (doc && doc.data) {
            const resolvedLocks = doc.data.lockedShifts
              ? hydrateLockState(doc.data.lockedShifts, { type: 'shift', items: targetShifts })
              : getInitialLockState({ type: 'shift', items: targetShifts });

            const resolvedLockedSlots =
              doc.data.lockedSlots && Object.keys(doc.data.lockedSlots).length > 0
                ? doc.data.lockedSlots
                : deriveLegacyLockedSlots(doc.data.rows, doc.data.lockedShifts, unitsOrder);

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
              lockedSlots: resolvedLockedSlots,
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
          lockedSlots: {},
          lockedShifts: getInitialLockState({ type: 'shift', items: targetShifts }),
          editedFields: {},
          editAuditHistory: [],
          assignedOperatorEmail,
          emailStatus: 'pending',
          emailRecipient: assignedOperatorEmail,
        });
      } catch (error) {
        console.error(`[${plantCode} GET] Error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Server error: ' + error.message,
        });
      }
    });

    /**
     * @desc    Retry sending email (disabled)
     * @route   POST /:id/retry-email
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

    return router;
  };
}

createSlotLockRoute.deriveLegacyLockedSlots = deriveLegacyLockedSlots;

module.exports = createSlotLockRoute;
