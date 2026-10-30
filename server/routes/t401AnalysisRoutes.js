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
};

const ANALYSIS_TYPES = ['T 401 Analysis', 'T401 Analysis'];
const CANONICAL_ANALYSIS_TYPE = 'T 401 Analysis';
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

const defaultEmptyTowerShifts = () => {
  const result = {};
  TOWERS.forEach((t) => {
    result[t] = {
      s1: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
      s2: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
      s3: Object.fromEntries(PARAM_KEYS.map((k) => [k, ''])),
    };
  });
  return result;
};

const defaultInitialTowerLocks = () => {
  const lockedSlots = {};
  const lockedShifts = {};
  TOWERS.forEach((t) => {
    lockedSlots[t] = {
      s1: { isSaved: false, isLocked: false, correctionUsed: false },
      s2: { isSaved: false, isLocked: true, correctionUsed: false },
      s3: { isSaved: false, isLocked: true, correctionUsed: false },
    };
    lockedShifts[t] = {
      s1Saved: false,
      s2Saved: false,
      s3Saved: false,
      s1Locked: false,
      s2Locked: true,
      s3Locked: true,
      s1Edits: 0,
      s2Edits: 0,
      s3Edits: 0,
      s1: false,
      s2: true,
      s3: true,
      allPermanentlyLocked: false,
      slots: lockedSlots[t],
    };
  });
  return { lockedSlots, lockedShifts };
};

const deriveT401Locks = (doc) => {
  const data = doc?.data || {};
  const existingLockedSlots = data.lockedSlots || {};
  const existingLockedShifts = data.lockedShifts || {};
  const units = data.units || data.towers || data.shifts || {};

  const lockedSlots = {};
  const lockedShifts = {};

  TOWERS.forEach((t) => {
    if (existingLockedSlots[t] && typeof existingLockedSlots[t] === 'object') {
      lockedSlots[t] = existingLockedSlots[t];
      lockedShifts[t] = existingLockedShifts[t] || {
        s1Saved: Boolean(lockedSlots[t].s1?.isSaved),
        s2Saved: Boolean(lockedSlots[t].s2?.isSaved),
        s3Saved: Boolean(lockedSlots[t].s3?.isSaved),
        s1Locked: Boolean(lockedSlots[t].s1?.isLocked),
        s2Locked: Boolean(lockedSlots[t].s2?.isLocked),
        s3Locked: Boolean(lockedSlots[t].s3?.isLocked),
        s1Edits: lockedSlots[t].s1?.correctionUsed ? 1 : 0,
        s2Edits: lockedSlots[t].s2?.correctionUsed ? 1 : 0,
        s3Edits: lockedSlots[t].s3?.correctionUsed ? 1 : 0,
        s1: Boolean(lockedSlots[t].s1?.isLocked),
        s2: Boolean(lockedSlots[t].s2?.isLocked),
        s3: Boolean(lockedSlots[t].s3?.isLocked),
        allPermanentlyLocked: Boolean(
          lockedSlots[t].s1?.isLocked && lockedSlots[t].s2?.isLocked && lockedSlots[t].s3?.isLocked
        ),
        slots: lockedSlots[t],
      };
      return;
    }

    const tLocks = existingLockedShifts[t] || {};
    const tUnits = units[t] || {};

    const s1Saved = Boolean(tLocks.s1Saved || !isUnitEmpty(tUnits.s1));
    const s2Saved = Boolean(tLocks.s2Saved || !isUnitEmpty(tUnits.s2));
    const s3Saved = Boolean(tLocks.s3Saved || !isUnitEmpty(tUnits.s3));

    const s1Corr = Boolean(tLocks.s1Edits >= 1 || (tLocks.s1Locked && !s2Saved));
    const s2Corr = Boolean(tLocks.s2Edits >= 1 || (tLocks.s2Locked && !s3Saved));
    const s3Corr = Boolean(tLocks.s3Edits >= 1 || tLocks.s3Locked);

    lockedSlots[t] = {
      s1: {
        isSaved: s1Saved,
        isLocked: s1Saved ? (s2Saved ? true : s1Corr) : false,
        correctionUsed: s1Corr,
      },
      s2: {
        isSaved: s2Saved,
        isLocked: s2Saved ? (s3Saved ? true : s2Corr) : !s1Saved,
        correctionUsed: s2Corr,
      },
      s3: {
        isSaved: s3Saved,
        isLocked: s3Saved ? s3Corr : !s2Saved,
        correctionUsed: s3Corr,
      },
    };

    const allPermanentlyLocked = Boolean(
      tLocks.allPermanentlyLocked ||
        (lockedSlots[t].s1.isLocked && lockedSlots[t].s2.isLocked && lockedSlots[t].s3.isLocked)
    );

    lockedShifts[t] = {
      s1Saved,
      s2Saved,
      s3Saved,
      s1Locked: lockedSlots[t].s1.isLocked,
      s2Locked: lockedSlots[t].s2.isLocked,
      s3Locked: lockedSlots[t].s3.isLocked,
      s1Edits: s1Corr ? 1 : 0,
      s2Edits: s2Corr ? 1 : 0,
      s3Edits: s3Corr ? 1 : 0,
      s1: lockedSlots[t].s1.isLocked,
      s2: lockedSlots[t].s2.isLocked,
      s3: lockedSlots[t].s3.isLocked,
      allPermanentlyLocked,
      slots: lockedSlots[t],
    };
  });

  return { lockedSlots, lockedShifts };
};

function createT401AnalysisRouter({ getNow = () => new Date() } = {}) {
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

      const { lockedSlots: defaultLockedSlots, lockedShifts: defaultLockedShifts } = defaultInitialTowerLocks();

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
          const { lockedSlots, lockedShifts } = deriveT401Locks(doc);
          const units = payloadData.units || payloadData.towers || payloadData.shifts || defaultEmptyTowerShifts();

          const recordData = {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode,
            analysisType: doc.analysisType,
            units,
            towers: units,
            shifts: units,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          };

          return res.status(200).json({
            success: true,
            data: [recordData],
            record: recordData,
            recordId: doc._id,
            units,
            towers: units,
            shifts: units,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            assignedOperatorEmail,
            emailStatus: 'disabled',
            emailRecipient: assignedOperatorEmail,
          });
        }

        const initialUnits = defaultEmptyTowerShifts();
        return res.status(200).json({
          success: true,
          data: [],
          record: null,
          recordId: null,
          units: initialUnits,
          towers: initialUnits,
          shifts: initialUnits,
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
      console.error('[T 401 GET] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving T 401 analysis records.',
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
          message: 'Analysis Date is required to save T 401 Analysis.',
        });
      }

      const now = typeof getNow === 'function' ? getNow() : new Date();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: T 401 Analysis records can only be created or modified for today's date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      // Mandatory targetTower check: multi-tower or "all" rejected
      const targetTower = payload.targetTower || payload.selectedOption;
      if (!targetTower || targetTower === 'all' || !TOWERS.includes(targetTower)) {
        return res.status(400).json({
          success: false,
          message: 'Target tower is required. Single-tower submission enforced (options a through f).',
        });
      }

      const unitsRaw = payload.units || payload.towers || payload.shifts || {};
      const targetTowerDataRaw = unitsRaw[targetTower] || {};

      // Clean parameter values on target tower
      const targetTowerClean = {};
      SHIFTS.forEach((sk) => {
        if (targetTowerDataRaw[sk]) {
          targetTowerClean[sk] = cleanParamValues(targetTowerDataRaw[sk]);
        }
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
      const existingUnits = existingData.units || existingData.towers || existingData.shifts || {};
      const existingTowerData = existingUnits[targetTower] || {};
      const { lockedSlots: currentLockedSlots, lockedShifts: currentLockedShifts } = deriveT401Locks(existingDoc);

      const towerLockedSlots = currentLockedSlots[targetTower];

      // Check whether other towers in payload were also modified -> reject multi-tower POST
      const otherTowersChanged = TOWERS.filter((t) => t !== targetTower).some((t) => {
        const tInc = unitsRaw[t];
        const tExist = existingUnits[t];
        if (!tInc) return false;
        return SHIFTS.some((sk) => {
          return PARAM_KEYS.some((pk) => {
            const nv = tInc?.[sk]?.[pk];
            const ov = tExist?.[sk]?.[pk];
            if (nv === undefined || nv === null || nv === '') return false;
            return String(nv) !== String(ov ?? '');
          });
        });
      });

      if (otherTowersChanged) {
        return res.status(400).json({
          success: false,
          message: 'Multi-tower submission rejected: Exactly one tower can be saved at a time.',
        });
      }

      const explicitUnitKey = payload.shift && SHIFTS.includes(payload.shift) ? payload.shift : null;

      // Identify modified shifts on target tower
      const shiftsWithDiff = [];
      for (const sk of SHIFTS) {
        const inc = targetTowerClean[sk];
        if (explicitUnitKey && sk !== explicitUnitKey) continue;
        if (!inc) continue;
        const exist = existingTowerData[sk] || {};
        const isDiff = PARAM_KEYS.some((pk) => {
          const nv = inc[pk];
          const ov = exist[pk];
          if (nv === undefined || nv === null || nv === '') return ov !== undefined && ov !== null && ov !== '';
          return String(nv) !== String(ov ?? '');
        });
        if (isDiff) {
          shiftsWithDiff.push(sk);
        }
      }

      if (shiftsWithDiff.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time for this tower.',
        });
      }

      if (shiftsWithDiff.length === 0) {
        if (explicitUnitKey) {
          if (!towerLockedSlots[explicitUnitKey]?.isSaved && isUnitEmpty(targetTowerClean[explicitUnitKey])) {
            return res.status(400).json({
              success: false,
              message: `Cannot save empty slot ${explicitUnitKey}. At least one non-empty value is required.`,
            });
          }
        }
        const hasAnySaved = SHIFTS.some((s) => towerLockedSlots[s]?.isSaved);
        if (!hasAnySaved) {
          return res.status(400).json({
            success: false,
            message: 'At least one shift measurement value is required for this tower.',
          });
        }
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes detected. Record remains unchanged.',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentLockedShifts,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailSent: false,
        });
      }

      const targetShift = shiftsWithDiff[0];
      const targetIncoming = targetTowerClean[targetShift] || {};
      const targetExisting = existingTowerData[targetShift] || {};

      const incomingTowerShifts = {};
      for (const s of SHIFTS) {
        if (s === targetShift) {
          incomingTowerShifts[s] = targetIncoming;
        } else if (towerLockedSlots[s]?.isSaved) {
          incomingTowerShifts[s] = existingTowerData[s];
        }
      }

      // Transition for this tower
      const transitionResult = computeSlotTransition({
        unitsOrder: SHIFTS,
        lockedSlots: towerLockedSlots,
        storedRows: existingTowerData,
        incomingRows: incomingTowerShifts,
        now,
      });

      if (!transitionResult.allowed && !transitionResult.ok) {
        return res.status(transitionResult.statusCode || transitionResult.status || 400).json({
          success: false,
          message: `${TOWER_DISPLAY_NAMES[targetTower]}: ${transitionResult.message}`,
        });
      }

      if (transitionResult.noChange) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes detected. Record remains unchanged.',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentLockedShifts,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailSent: false,
        });
      }

      const isCorrection = transitionResult.isCorrection;
      const updatedTowerSlots = JSON.parse(JSON.stringify(towerLockedSlots));

      if (!isCorrection) {
        updatedTowerSlots[targetShift] = { isSaved: true, isLocked: false, correctionUsed: false };
        const tIdx = SHIFTS.indexOf(targetShift);
        for (let p = 0; p < tIdx; p++) {
          updatedTowerSlots[SHIFTS[p]].isLocked = true;
        }
        if (tIdx + 1 < SHIFTS.length) {
          updatedTowerSlots[SHIFTS[tIdx + 1]].isLocked = false;
        }
      } else {
        updatedTowerSlots[targetShift] = { isSaved: true, isLocked: true, correctionUsed: true };
      }

      const allTowerLocked = SHIFTS.every((sk) => updatedTowerSlots[sk]?.isLocked);

      const updatedTowerFlatLocks = {
        s1Saved: updatedTowerSlots.s1.isSaved,
        s2Saved: updatedTowerSlots.s2.isSaved,
        s3Saved: updatedTowerSlots.s3.isSaved,
        s1Locked: updatedTowerSlots.s1.isLocked,
        s2Locked: updatedTowerSlots.s2.isLocked,
        s3Locked: updatedTowerSlots.s3.isLocked,
        s1Edits: updatedTowerSlots.s1.correctionUsed ? 1 : 0,
        s2Edits: updatedTowerSlots.s2.correctionUsed ? 1 : 0,
        s3Edits: updatedTowerSlots.s3.correctionUsed ? 1 : 0,
        s1: updatedTowerSlots.s1.isLocked,
        s2: updatedTowerSlots.s2.isLocked,
        s3: updatedTowerSlots.s3.isLocked,
        allPermanentlyLocked: allTowerLocked,
        slots: updatedTowerSlots,
      };

      const nextAllLockedSlots = {
        ...currentLockedSlots,
        [targetTower]: updatedTowerSlots,
      };
      const nextAllLockedShifts = {
        ...currentLockedShifts,
        [targetTower]: updatedTowerFlatLocks,
      };

      const nowIso = now.toISOString();
      const saveEventId = `t401_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

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
            if (!newEditedFields[targetTower]) newEditedFields[targetTower] = {};
            if (!newEditedFields[targetTower][targetShift]) newEditedFields[targetTower][targetShift] = {};
            newEditedFields[targetTower][targetShift][pk] = true;

            editAuditHistory.push({
              date: payload.date,
              tower: targetTower,
              towerName: TOWER_DISPLAY_NAMES[targetTower],
              shift: targetShift,
              shiftName: SHIFT_DISPLAY_NAMES[targetShift],
              field: pk,
              oldValue: ov,
              newValue: nv,
              editor: req.user?.name || payload.submittedBy || 'Plant Operator',
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }

      // Merge units
      const mergedUnits = JSON.parse(JSON.stringify(existingUnits));
      TOWERS.forEach((t) => {
        if (!mergedUnits[t]) mergedUnits[t] = {};
        SHIFTS.forEach((sk) => {
          if (!mergedUnits[t][sk]) mergedUnits[t][sk] = {};
          PARAM_KEYS.forEach((pk) => {
            if (mergedUnits[t][sk][pk] === undefined) mergedUnits[t][sk][pk] = '';
          });
        });
      });

      PARAM_KEYS.forEach((pk) => {
        mergedUnits[targetTower][targetShift][pk] =
          targetIncoming[pk] !== undefined && targetIncoming[pk] !== null ? targetIncoming[pk] : '';
      });

      const docUpdatePayload = {
        'data.units': mergedUnits,
        'data.towers': mergedUnits,
        'data.shifts': mergedUnits,
        'data.lockedSlots': nextAllLockedSlots,
        'data.lockedShifts': nextAllLockedShifts,
        'data.editedFields': newEditedFields,
        'data.editAuditHistory': editAuditHistory,
        'data.submittedBy': req.user?.name || payload.submittedBy || 'Plant Operator',
        'data.submittedById': req.user?._id || null,
        'data.submittedAt': nowIso,
        'data.saveEventId': saveEventId,
        'data.unit': 'T 401 (Options A–F)',
        'data.analysisType': CANONICAL_ANALYSIS_TYPE,
        'data.plant': 'SA',
        'data.plantCode': 'SA',
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
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
                [`data.lockedSlots.${targetTower}.${targetShift}.isSaved`]: true,
                [`data.lockedSlots.${targetTower}.${targetShift}.correctionUsed`]: false,
                [`data.lockedSlots.${targetTower}.${targetShift}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetTower}.${targetShift}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetTower}.${targetShift}`]: { $exists: false } },
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
            message: 'Conflict: This tower shift was locked or updated concurrently by another user.',
          });
        }
        savedDoc = await PlantAnalysisRecord.findById(existingDoc._id).lean();
      } else {
        try {
          const insertDoc = {
            plantName: 'SA Plant',
            plantCode: 'SA',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: 'T 401 (Options A–F)',
            date: payload.date,
            shift: 'All Shifts',
            status: 'completed',
            submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
            submittedById: req.user?._id || null,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: {
              id: `t401_${Date.now()}`,
              date: payload.date,
              plant: 'SA',
              plantCode: 'SA',
              tower: 'T 401',
              unit: 'T 401 (Options A–F)',
              analysisType: CANONICAL_ANALYSIS_TYPE,
              units: mergedUnits,
              towers: mergedUnits,
              shifts: mergedUnits,
              lockedSlots: nextAllLockedSlots,
              lockedShifts: nextAllLockedShifts,
              editedFields: newEditedFields,
              editAuditHistory,
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
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
        units: mergedUnits,
        towers: mergedUnits,
        shifts: mergedUnits,
        lockedSlots: nextAllLockedSlots,
        lockedShifts: nextAllLockedShifts,
        editedFields: newEditedFields,
        editAuditHistory,
      };

      return res.status(200).json({
        success: true,
        message: 'T 401 Analysis saved successfully in MongoDB ✓',
        data: finalRecordData,
        record: finalRecordData,
        recordId: savedDoc._id,
        units: mergedUnits,
        towers: mergedUnits,
        shifts: mergedUnits,
        lockedSlots: nextAllLockedSlots,
        lockedShifts: nextAllLockedShifts,
        editedFields: newEditedFields,
        editAuditHistory,
        emailStatus: 'disabled',
        emailDeliveryStatus: 'disabled',
        emailSent: false,
        emailRecipient: null,
        saveEventId,
      });
    } catch (err) {
      console.error('[T 401 POST] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing T 401 analysis: ' + err.message,
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

const defaultRouter = createT401AnalysisRouter();
defaultRouter.createRouter = createT401AnalysisRouter;
module.exports = defaultRouter;
