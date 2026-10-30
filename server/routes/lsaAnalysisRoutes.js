const express = require('express');
const { PlantAnalysisRecord } = require('../models');
const { protect } = require('../middleware/auth');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isUnitEmpty,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { getPlantAssignedUser } = require('../services/plantNotificationService');

const PARAM_KEYS = ['na2co3', 'nacl', 'fe', 'na2so4', 'vm', 'ir', 'bd', 'turbidity'];
const SHIFT_ITEMS = ['iShift', 'iiShift', 'iiiShift'];
const ALL_UNITS = ['iShift', 'iiShift', 'iiiShift', 'composite'];

const SHIFT_KEY_ALIASES = {
  iShift: 'iShift',
  iiShift: 'iiShift',
  iiiShift: 'iiiShift',
  shift1: 'iShift',
  shift2: 'iiShift',
  shift3: 'iiiShift',
  s1: 'iShift',
  s2: 'iiShift',
  s3: 'iiiShift',
  composite: 'composite',
};

const SHIFT_DISPLAY_NAMES = {
  iShift: 'I SHIFT',
  iiShift: 'II SHIFT',
  iiiShift: 'III SHIFT',
  composite: 'COMPOSITE',
};

const PARAM_DISPLAY_NAMES = {
  na2co3: 'Na₂CO₃',
  nacl: 'NaCl',
  fe: 'Fe',
  na2so4: 'Na₂SO₄',
  vm: 'VM',
  ir: 'IR',
  bd: 'BD',
  turbidity: 'TURBIDITY',
};

const ANALYSIS_TYPES = [
  'LSA Shift Analysis',
  'LSA Shift',
  'LSA Analysis',
  'LSA SHIFT ANALYSIS',
];
const CANONICAL_ANALYSIS_TYPE = 'LSA Shift Analysis';
const PLANT_CODES = ['SA', 'SA Plant', 'SA PLANT'];

const cleanParamValues = (obj = {}) => {
  const res = {};
  PARAM_KEYS.forEach((pk) => {
    const val = obj[pk];
    if (val !== undefined && val !== null && val !== '') {
      res[pk] = Number(val);
    }
  });
  return res;
};

const defaultEmptyShifts = () => ({
  iShift: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
  iiShift: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
  iiiShift: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
  composite: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
});

const deriveLSALocks = (doc) => {
  const data = doc?.data || {};
  if (data.lockedSlots && typeof data.lockedSlots === 'object') {
    return {
      lockedSlots: data.lockedSlots,
      lockedShifts: data.lockedShifts || {},
    };
  }

  const lShifts = data.lockedShifts || {};
  const shifts = data.shifts || {};

  const s1Saved = Boolean(lShifts.iShiftSaved || lShifts.shift1Saved || !isUnitEmpty(shifts.iShift));
  const s2Saved = Boolean(lShifts.iiShiftSaved || lShifts.shift2Saved || !isUnitEmpty(shifts.iiShift));
  const s3Saved = Boolean(lShifts.iiiShiftSaved || lShifts.shift3Saved || !isUnitEmpty(shifts.iiiShift));
  const compSaved = Boolean(lShifts.compositeSaved || !isUnitEmpty(shifts.composite));

  const s1Corr = Boolean(lShifts.iShiftEdits >= 1 || (lShifts.iShiftLocked && !s2Saved));
  const s2Corr = Boolean(lShifts.iiShiftEdits >= 1 || (lShifts.iiShiftLocked && !s3Saved));
  const s3Corr = Boolean(lShifts.iiiShiftEdits >= 1 || lShifts.iiiShiftLocked);
  const compCorr = Boolean(lShifts.compositeEdits >= 1 || lShifts.compositeLocked);

  const lockedSlots = {
    iShift: {
      isSaved: s1Saved,
      isLocked: s1Saved ? (s2Saved ? true : s1Corr) : false,
      correctionUsed: s1Corr,
    },
    iiShift: {
      isSaved: s2Saved,
      isLocked: s2Saved ? (s3Saved ? true : s2Corr) : !s1Saved,
      correctionUsed: s2Corr,
    },
    iiiShift: {
      isSaved: s3Saved,
      isLocked: s3Saved ? s3Corr : !s2Saved,
      correctionUsed: s3Corr,
    },
    composite: {
      isSaved: compSaved,
      isLocked: compCorr,
      correctionUsed: compCorr,
    },
  };

  const allPermanentlyLocked = Boolean(
    lShifts.allPermanentlyLocked ||
      (lockedSlots.iShift.isLocked &&
        lockedSlots.iiShift.isLocked &&
        lockedSlots.iiiShift.isLocked &&
        lockedSlots.composite.isLocked)
  );

  const lockedShifts = {
    iShiftSaved: s1Saved,
    iiShiftSaved: s2Saved,
    iiiShiftSaved: s3Saved,
    compositeSaved: compSaved,
    iShiftLocked: lockedSlots.iShift.isLocked,
    iiShiftLocked: lockedSlots.iiShift.isLocked,
    iiiShiftLocked: lockedSlots.iiiShift.isLocked,
    compositeLocked: lockedSlots.composite.isLocked,
    iShiftEdits: s1Corr ? 1 : 0,
    iiShiftEdits: s2Corr ? 1 : 0,
    iiiShiftEdits: s3Corr ? 1 : 0,
    compositeEdits: compCorr ? 1 : 0,
    iShift: lockedSlots.iShift.isLocked,
    iiShift: lockedSlots.iiShift.isLocked,
    iiiShift: lockedSlots.iiiShift.isLocked,
    composite: lockedSlots.composite.isLocked,
    allPermanentlyLocked,
    slots: lockedSlots,
  };

  return { lockedSlots, lockedShifts };
};

function createLSAShiftAnalysisRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  router.get('/', async (req, res) => {
    try {
      const { date } = req.query;

      let assignedOperatorEmail = null;
      try {
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (_) {}

      const defaultLockedSlots = {
        iShift: { isSaved: false, isLocked: false, correctionUsed: false },
        iiShift: { isSaved: false, isLocked: true, correctionUsed: false },
        iiiShift: { isSaved: false, isLocked: true, correctionUsed: false },
        composite: { isSaved: false, isLocked: false, correctionUsed: false },
      };
      const defaultLockedShifts = {
        iShiftSaved: false,
        iiShiftSaved: false,
        iiiShiftSaved: false,
        compositeSaved: false,
        iShiftLocked: false,
        iiShiftLocked: true,
        iiiShiftLocked: true,
        compositeLocked: false,
        iShiftEdits: 0,
        iiShiftEdits: 0,
        iiiShiftEdits: 0,
        compositeEdits: 0,
        iShift: false,
        iiShift: true,
        iiiShift: true,
        composite: false,
        allPermanentlyLocked: false,
        slots: defaultLockedSlots,
      };

      if (date) {
        const query = {
          date,
          plantCode: { $in: PLANT_CODES },
          analysisType: { $in: ANALYSIS_TYPES },
        };
        if (req.user?.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc?.data) {
          const payloadData = doc.data;
          const { lockedSlots, lockedShifts } = deriveLSALocks(doc);
          const shifts = payloadData.shifts || doc.shifts || defaultEmptyShifts();

          const recordData = {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode,
            analysisType: doc.analysisType,
            shifts,
            rows: shifts,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          };

          return res.status(200).json({
            success: true,
            data: recordData,
            record: recordData,
            recordId: doc._id,
            shifts,
            rows: shifts,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            assignedOperatorEmail,
            emailStatus: 'disabled',
            emailRecipient: assignedOperatorEmail,
          });
        }

        return res.status(200).json({
          success: true,
          data: null,
          record: null,
          recordId: null,
          shifts: defaultEmptyShifts(),
          rows: defaultEmptyShifts(),
          lockedSlots: defaultLockedSlots,
          lockedShifts: defaultLockedShifts,
          editedFields: {},
          editAuditHistory: [],
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
          message: `No record found for date ${date}`,
        });
      }

      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    } catch (err) {
      console.error('[LSA Shift GET] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error while fetching LSA Shift Analysis: ' + err.message,
      });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Operator role is read-only for this analysis.',
        });
      }

      const payload = req.body || {};
      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save LSA Shift Analysis.',
        });
      }

      const now = typeof getNow === 'function' ? getNow() : new Date();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: LSA Shift Analysis records can only be created or modified for current operating day (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const incomingRaw = payload.shifts || payload.rows || payload.data?.shifts || {};
      const incomingShiftsRaw = {};
      Object.entries(incomingRaw).forEach(([k, v]) => {
        const alias = SHIFT_KEY_ALIASES[k];
        if (alias) incomingShiftsRaw[alias] = cleanParamValues(v);
      });

      // Query existing doc
      const companyVal = req.user?.company?._id || req.user?.company || null;
      const query = {
        date: payload.date,
        plantCode: { $in: PLANT_CODES },
        analysisType: { $in: ANALYSIS_TYPES },
      };
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const matchingDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};
      const existingShifts = existingData.shifts || {};
      const { lockedSlots: currentLockedSlots } = deriveLSALocks(existingDoc);

      const explicitUnitKey = payload.shift ? SHIFT_KEY_ALIASES[payload.shift] : null;

      // Identify modified units
      const unitsWithDiff = [];
      for (const uk of ALL_UNITS) {
        const inc = incomingShiftsRaw[uk];
        if (explicitUnitKey && uk !== explicitUnitKey) continue;
        if (!inc) continue;
        const exist = existingShifts[uk] || {};
        const isDiff = PARAM_KEYS.some((pk) => {
          const nv = inc[pk];
          const ov = exist[pk];
          if (nv === undefined || nv === null || nv === '') return ov !== undefined && ov !== null && ov !== '';
          return String(nv) !== String(ov ?? '');
        });
        if (isDiff) {
          unitsWithDiff.push(uk);
        }
      }

      if (unitsWithDiff.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Shift-wise input locking enforced: Only one shift or composite can be entered and saved at a time.',
        });
      }

      if (unitsWithDiff.length === 0) {
        // Either identical re-save or empty save
        if (explicitUnitKey) {
          if (!currentLockedSlots[explicitUnitKey]?.isSaved && isUnitEmpty(incomingShiftsRaw[explicitUnitKey])) {
            return res.status(400).json({
              success: false,
              message: `Cannot save empty slot ${explicitUnitKey}. At least one non-empty value is required.`,
            });
          }
        }
        const hasAnySaved = ALL_UNITS.some((u) => currentLockedSlots[u]?.isSaved);
        if (!hasAnySaved) {
          return res.status(400).json({
            success: false,
            message: 'Validation failed. Enter valid numbers only.',
          });
        }
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No new or modified data found to save.',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          lockedSlots: currentLockedSlots,
          lockedShifts: existingData.lockedShifts || {},
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailSent: false,
        });
      }

      const targetUnit = unitsWithDiff[0];
      const targetIncoming = incomingShiftsRaw[targetUnit] || {};
      const targetExisting = existingShifts[targetUnit] || {};

      let isCorrection = false;
      let nextAllLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));

      if (targetUnit === 'composite') {
        const currentComp = currentLockedSlots.composite || { isSaved: false, isLocked: false, correctionUsed: false };
        if (currentComp.isLocked) {
          return res.status(400).json({
            success: false,
            message: 'COMPOSITE is permanently locked. No further modifications permitted.',
          });
        }
        if (isUnitEmpty(targetIncoming)) {
          if (!currentComp.isSaved) {
            return res.status(400).json({
              success: false,
              message: 'Cannot save empty COMPOSITE data. At least one measurement is required.',
            });
          } else {
            return res.status(400).json({
              success: false,
              message: 'Clear-all correction rejected: Cannot erase all COMPOSITE values.',
            });
          }
        }

        if (!currentComp.isSaved) {
          nextAllLockedSlots.composite = { isSaved: true, isLocked: false, correctionUsed: false };
        } else {
          isCorrection = true;
          nextAllLockedSlots.composite = { isSaved: true, isLocked: true, correctionUsed: true };
        }
      } else {
        // Sequential shift logic (iShift -> iiShift -> iiiShift)
        const shiftSlotsOnly = {
          iShift: currentLockedSlots.iShift,
          iiShift: currentLockedSlots.iiShift,
          iiiShift: currentLockedSlots.iiiShift,
        };

        const incomingShiftRows = {};
        for (const u of SHIFT_ITEMS) {
          if (u === targetUnit) {
            incomingShiftRows[u] = targetIncoming;
          } else if (shiftSlotsOnly[u]?.isSaved) {
            incomingShiftRows[u] = existingShifts[u];
          }
        }

        const transition = computeSlotTransition({
          unitsOrder: SHIFT_ITEMS,
          lockedSlots: shiftSlotsOnly,
          storedRows: existingShifts,
          incomingRows: incomingShiftRows,
          now,
        });

        if (transition.noChange) {
          return res.status(200).json({
            success: true,
            noChange: true,
            message: 'No new or modified data found to save.',
            data: existingData,
            record: existingData,
            recordId: existingDoc?._id,
            lockedSlots: currentLockedSlots,
            lockedShifts: existingData.lockedShifts || {},
            editedFields: existingData.editedFields || {},
            editAuditHistory: existingData.editAuditHistory || [],
            emailStatus: 'disabled',
            emailSent: false,
          });
        }

        if (!transition.ok) {
          return res.status(transition.status || 400).json({
            success: false,
            message: transition.message,
          });
        }

        isCorrection = transition.isCorrection;
        if (!isCorrection) {
          nextAllLockedSlots[targetUnit] = { isSaved: true, isLocked: false, correctionUsed: false };
          const tIdx = SHIFT_ITEMS.indexOf(targetUnit);
          for (let p = 0; p < tIdx; p++) {
            nextAllLockedSlots[SHIFT_ITEMS[p]].isLocked = true;
          }
          if (tIdx + 1 < SHIFT_ITEMS.length) {
            nextAllLockedSlots[SHIFT_ITEMS[tIdx + 1]].isLocked = false;
          }
        } else {
          nextAllLockedSlots[targetUnit] = { isSaved: true, isLocked: true, correctionUsed: true };
        }
      }

      const allPermanentlyLocked =
        nextAllLockedSlots.iShift.isLocked &&
        nextAllLockedSlots.iiShift.isLocked &&
        nextAllLockedSlots.iiiShift.isLocked &&
        nextAllLockedSlots.composite.isLocked;

      const flatLockedShifts = {
        iShiftSaved: nextAllLockedSlots.iShift.isSaved,
        iiShiftSaved: nextAllLockedSlots.iiShift.isSaved,
        iiiShiftSaved: nextAllLockedSlots.iiiShift.isSaved,
        compositeSaved: nextAllLockedSlots.composite.isSaved,
        iShiftLocked: nextAllLockedSlots.iShift.isLocked,
        iiShiftLocked: nextAllLockedSlots.iiShift.isLocked,
        iiiShiftLocked: nextAllLockedSlots.iiiShift.isLocked,
        compositeLocked: nextAllLockedSlots.composite.isLocked,
        iShiftEdits: nextAllLockedSlots.iShift.correctionUsed ? 1 : 0,
        iiShiftEdits: nextAllLockedSlots.iiShift.correctionUsed ? 1 : 0,
        iiiShiftEdits: nextAllLockedSlots.iiiShift.correctionUsed ? 1 : 0,
        compositeEdits: nextAllLockedSlots.composite.correctionUsed ? 1 : 0,
        iShift: nextAllLockedSlots.iShift.isLocked,
        iiShift: nextAllLockedSlots.iiShift.isLocked,
        iiiShift: nextAllLockedSlots.iiiShift.isLocked,
        composite: nextAllLockedSlots.composite.isLocked,
        allPermanentlyLocked,
        slots: nextAllLockedSlots,
      };

      const nowIso = now.toISOString();
      const saveEventId = `lsa_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const existingEditedFields = existingData.editedFields || {};
      const newEditedFields = JSON.parse(JSON.stringify(existingEditedFields));
      const editAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        PARAM_KEYS.forEach((pk) => {
          const ov = targetExisting[pk];
          const nv = targetIncoming[pk];
          const oNum = ov !== '' && ov !== null && ov !== undefined ? Number(ov) : null;
          const nNum = nv !== '' && nv !== null && nv !== undefined ? Number(nv) : null;
          const changed = oNum !== null && nNum !== null ? oNum !== nNum : String(ov ?? '') !== String(nv ?? '');
          if (changed) {
            if (!newEditedFields[targetUnit]) newEditedFields[targetUnit] = {};
            newEditedFields[targetUnit][pk] = true;
            editAuditHistory.push({
              date: payload.date,
              shift: SHIFT_DISPLAY_NAMES[targetUnit],
              shiftKey: targetUnit,
              field: pk,
              fieldName: PARAM_DISPLAY_NAMES[pk] || pk,
              oldValue: ov,
              newValue: nv,
              editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }

      const mergedShifts = {
        ...existingShifts,
        [targetUnit]: {
          ...targetExisting,
          ...PARAM_KEYS.reduce((acc, pk) => {
            acc[pk] = targetIncoming[pk] !== undefined && targetIncoming[pk] !== null ? targetIncoming[pk] : '';
            return acc;
          }, {}),
        },
      };

      const docUpdatePayload = {
        'data.shifts': mergedShifts,
        'data.rows': mergedShifts,
        'data.lockedSlots': nextAllLockedSlots,
        'data.lockedShifts': flatLockedShifts,
        'data.editedFields': newEditedFields,
        'data.editAuditHistory': editAuditHistory,
        'data.submittedBy': req.user?.name || payload.submittedBy || 'Shift Chemist',
        'data.submittedById': req.user?._id || null,
        'data.submittedAt': nowIso,
        'data.saveEventId': saveEventId,
        'data.unit': 'LSA',
        'data.analysisType': CANONICAL_ANALYSIS_TYPE,
        'data.plant': 'SA',
        'data.plantCode': 'SA',
        'data.section': 'Soda Ash Production',
        submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
        submittedById: req.user?._id || null,
        status: 'completed',
        emailStatus: 'disabled',
        emailRecipient: null,
      };

      let savedDoc = null;
      if (existingDoc?._id) {
        const updateFilter = {
          _id: existingDoc._id,
          ...(isCorrection
            ? {
                [`data.lockedSlots.${targetUnit}.isSaved`]: true,
                [`data.lockedSlots.${targetUnit}.correctionUsed`]: false,
                [`data.lockedSlots.${targetUnit}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
                  { [`data.lockedSlots`]: { $exists: false } },
                ],
              }),
        };

        const updateRes = await PlantAnalysisRecord.updateOne(updateFilter, {
          $set: docUpdatePayload,
        });

        if (updateRes.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: This shift was locked or updated concurrently by another user.',
          });
        }
        savedDoc = await PlantAnalysisRecord.findById(existingDoc._id).lean();
      } else {
        try {
          const insertDoc = {
            plantName: 'SA Plant',
            plantCode: 'SA',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: 'LSA',
            date: payload.date,
            shift: 'All Shifts',
            status: 'completed',
            submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
            submittedById: req.user?._id || null,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: {
              id: `lsa_${Date.now()}`,
              date: payload.date,
              plant: 'SA',
              plantCode: 'SA',
              unit: 'LSA',
              section: 'Soda Ash Production',
              analysisType: CANONICAL_ANALYSIS_TYPE,
              shifts: mergedShifts,
              rows: mergedShifts,
              lockedSlots: nextAllLockedSlots,
              lockedShifts: flatLockedShifts,
              editedFields: newEditedFields,
              editAuditHistory,
              submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
              submittedById: req.user?._id || null,
              submittedAt: nowIso,
              company: companyVal,
              saveEventId,
            },
          };
          const created = await PlantAnalysisRecord.create(insertDoc);
          savedDoc = created.toObject();
        } catch (insertErr) {
          if (insertErr.code === 11000) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Document for this date was created concurrently.',
            });
          }
          throw insertErr;
        }
      }

      const finalRecordData = {
        ...savedDoc.data,
        _id: savedDoc._id,
        id: savedDoc._id.toString(),
        recordId: savedDoc._id,
        shifts: mergedShifts,
        rows: mergedShifts,
        lockedSlots: nextAllLockedSlots,
        lockedShifts: flatLockedShifts,
        editedFields: newEditedFields,
        editAuditHistory,
      };

      return res.status(200).json({
        success: true,
        message: 'LSA Shift Analysis saved successfully in MongoDB ✓',
        data: finalRecordData,
        record: finalRecordData,
        recordId: savedDoc._id,
        shifts: mergedShifts,
        rows: mergedShifts,
        lockedSlots: nextAllLockedSlots,
        lockedShifts: flatLockedShifts,
        editedFields: newEditedFields,
        editAuditHistory,
        emailStatus: 'disabled',
        emailDeliveryStatus: 'disabled',
        emailSent: false,
        emailRecipient: null,
        saveEventId,
      });
    } catch (err) {
      console.error('[LSA Shift POST] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error while saving LSA Shift Analysis: ' + err.message,
      });
    }
  });

  router.post('/:id/retry-email', async (req, res) => {
    return res.status(200).json({
      success: true,
      emailSent: false,
      emailStatus: 'disabled',
      message: 'Email notification functionality has been removed.',
    });
  });

  return router;
}

const defaultRouter = createLSAShiftAnalysisRouter();
defaultRouter.createRouter = createLSAShiftAnalysisRouter;
module.exports = defaultRouter;
