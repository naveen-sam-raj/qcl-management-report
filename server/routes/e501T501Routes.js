const express = require('express');
const { PlantAnalysisRecord } = require('../models');
const { protect } = require('../middleware/auth');
const {
  computeSlotTransition,
  recordFieldEdits,
  pickCanonicalDoc,
  isUnitEmpty,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { getPlantAssignedUser } = require('../services/plantNotificationService');

const PARAM_KEYS = ['e501_fnh3', 'e501_na2co3', 't501_fnh3', 't501_na2co3'];
const SHIFT_ITEMS = ['shift1', 'shift2', 'shift3'];
const SHIFT_MAP = {
  shift1: { id: '1', shift: 'I' },
  shift2: { id: '2', shift: 'II' },
  shift3: { id: '3', shift: 'III' },
  s1: { id: '1', shift: 'I' },
  s2: { id: '2', shift: 'II' },
  s3: { id: '3', shift: 'III' },
  '1': { id: '1', shift: 'I' },
  '2': { id: '2', shift: 'II' },
  '3': { id: '3', shift: 'III' },
};
const SHIFT_KEY_FROM_INPUT = {
  '1': 'shift1',
  '2': 'shift2',
  '3': 'shift3',
  s1: 'shift1',
  s2: 'shift2',
  s3: 'shift3',
  shift1: 'shift1',
  shift2: 'shift2',
  shift3: 'shift3',
  I: 'shift1',
  II: 'shift2',
  III: 'shift3',
  'I SHIFT': 'shift1',
  'II SHIFT': 'shift2',
  'III SHIFT': 'shift3',
};

const ANALYSIS_TYPES = [
  'E 501 / T 501 Analysis',
  'E 501 / T 501',
  'E501 / T501 Analysis',
  'E501 / T501',
];
const CANONICAL_ANALYSIS_TYPE = 'E 501 / T 501 Analysis';
const PLANT_CODES = ['SA', 'SA Plant', 'SA PLANT'];

const calcAvg = (readings, field) => {
  const vals = readings
    .map((r) => parseFloat(r[field]))
    .filter((n) => !isNaN(n));
  return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
};

const buildReadingsArray = (rowsObj = {}) => {
  return SHIFT_ITEMS.map((sk) => {
    const rData = rowsObj[sk] || {};
    const meta = SHIFT_MAP[sk];
    const item = { id: meta.id, shift: meta.shift };
    PARAM_KEYS.forEach((pk) => {
      const val = rData[pk];
      item[pk] = val !== undefined && val !== null ? val : '';
    });
    return item;
  });
};

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

const deriveE501Locks = (doc) => {
  const data = doc?.data || {};
  if (data.lockedSlots && typeof data.lockedSlots === 'object') {
    return {
      lockedSlots: data.lockedSlots,
      lockedShifts: data.lockedShifts || {},
    };
  }
  const lShifts = data.lockedShifts || {};
  const rows = data.rows || {};
  const s1Saved = Boolean(lShifts.shift1Saved || lShifts.s1Saved || !isUnitEmpty(rows.shift1));
  const s2Saved = Boolean(lShifts.shift2Saved || lShifts.s2Saved || !isUnitEmpty(rows.shift2));
  const s3Saved = Boolean(lShifts.shift3Saved || lShifts.s3Saved || !isUnitEmpty(rows.shift3));

  const s1Corr = Boolean(lShifts.shift1Edits >= 1 || lShifts.s1Edits >= 1 || (lShifts.shift1Locked && !s2Saved));
  const s2Corr = Boolean(lShifts.shift2Edits >= 1 || lShifts.s2Edits >= 1 || (lShifts.shift2Locked && !s3Saved));
  const s3Corr = Boolean(lShifts.shift3Edits >= 1 || lShifts.s3Edits >= 1 || lShifts.shift3Locked);

  const lockedSlots = {
    shift1: {
      isSaved: s1Saved,
      isLocked: s1Saved ? (s2Saved ? true : s1Corr) : false,
      correctionUsed: s1Corr,
    },
    shift2: {
      isSaved: s2Saved,
      isLocked: s2Saved ? (s3Saved ? true : s2Corr) : !s1Saved,
      correctionUsed: s2Corr,
    },
    shift3: {
      isSaved: s3Saved,
      isLocked: s3Saved ? s3Corr : !s2Saved,
      correctionUsed: s3Corr,
    },
  };

  const allPermanentlyLocked = Boolean(lShifts.allPermanentlyLocked || (s3Saved && s3Corr));
  const lockedShifts = {
    shift1Saved: s1Saved,
    shift2Saved: s2Saved,
    shift3Saved: s3Saved,
    shift1Locked: lockedSlots.shift1.isLocked,
    shift2Locked: lockedSlots.shift2.isLocked,
    shift3Locked: lockedSlots.shift3.isLocked,
    shift1Edits: s1Corr ? 1 : 0,
    shift2Edits: s2Corr ? 1 : 0,
    shift3Edits: s3Corr ? 1 : 0,
    shift1: lockedSlots.shift1.isLocked,
    shift2: lockedSlots.shift2.isLocked,
    shift3: lockedSlots.shift3.isLocked,
    s1Saved,
    s2Saved,
    s3Saved,
    s1Locked: lockedSlots.shift1.isLocked,
    s2Locked: lockedSlots.shift2.isLocked,
    s3Locked: lockedSlots.shift3.isLocked,
    s1: lockedSlots.shift1.isLocked,
    s2: lockedSlots.shift2.isLocked,
    s3: lockedSlots.shift3.isLocked,
    allPermanentlyLocked,
    slots: lockedSlots,
  };

  return { lockedSlots, lockedShifts };
};

function createE501T501Router({ getNow = () => new Date() } = {}) {
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
        shift1: { isSaved: false, isLocked: false, correctionUsed: false },
        shift2: { isSaved: false, isLocked: true, correctionUsed: false },
        shift3: { isSaved: false, isLocked: true, correctionUsed: false },
      };
      const defaultLockedShifts = {
        shift1Saved: false,
        shift2Saved: false,
        shift3Saved: false,
        shift1Locked: false,
        shift2Locked: true,
        shift3Locked: true,
        shift1Edits: 0,
        shift2Edits: 0,
        shift3Edits: 0,
        shift1: false,
        shift2: true,
        shift3: true,
        s1Saved: false,
        s2Saved: false,
        s3Saved: false,
        s1Locked: false,
        s2Locked: true,
        s3Locked: true,
        s1: false,
        s2: true,
        s3: true,
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
          const { lockedSlots, lockedShifts } = deriveE501Locks(doc);
          const rows = payloadData.rows || {};
          const readings = Array.isArray(payloadData.readings) && payloadData.readings.length > 0
            ? payloadData.readings
            : buildReadingsArray(rows);
          const averages = payloadData.averages || {
            e501_fnh3: calcAvg(readings, 'e501_fnh3'),
            e501_na2co3: calcAvg(readings, 'e501_na2co3'),
            t501_fnh3: calcAvg(readings, 't501_fnh3'),
            t501_na2co3: calcAvg(readings, 't501_na2co3'),
          };

          const recordData = {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode,
            analysisType: doc.analysisType,
            readings,
            rows,
            averages,
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
            readings,
            rows,
            averages,
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
          readings: buildReadingsArray({}),
          rows: {},
          averages: { e501_fnh3: null, e501_na2co3: null, t501_fnh3: null, t501_na2co3: null },
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
      console.error('[E 501 / T 501 GET] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch E 501 / T 501 Analysis records: ' + err.message,
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
          message: 'Analysis Date is required to save E 501 / T 501 Analysis.',
        });
      }

      const now = typeof getNow === 'function' ? getNow() : new Date();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: E 501 / T 501 Analysis records can only be created or modified for current operating day (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      // Parse incoming readings / rows into cleaned parameter maps (stripping id/shift metadata)
      const incomingRowsRaw = {};
      if (Array.isArray(payload.readings)) {
        payload.readings.forEach((r) => {
          const sk = SHIFT_KEY_FROM_INPUT[r.id] || SHIFT_KEY_FROM_INPUT[r.shift];
          if (sk) {
            incomingRowsRaw[sk] = cleanParamValues(r);
          }
        });
      } else if (payload.rows && typeof payload.rows === 'object') {
        Object.entries(payload.rows).forEach(([k, v]) => {
          const sk = SHIFT_KEY_FROM_INPUT[k];
          if (sk) incomingRowsRaw[sk] = cleanParamValues(v);
        });
      }

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
      const existingRows = existingData.rows || {};
      const { lockedSlots: currentLockedSlots } = deriveE501Locks(existingDoc);

      const explicitUnitKey = payload.shift ? SHIFT_KEY_FROM_INPUT[payload.shift] : null;

      // Check if any unit is currently saved in this document
      const hasAnySaved = SHIFT_ITEMS.some((u) => currentLockedSlots[u]?.isSaved);
      const nonEmptyUnsaved = SHIFT_ITEMS.filter(
        (u) => !currentLockedSlots[u]?.isSaved && incomingRowsRaw[u] && !isUnitEmpty(incomingRowsRaw[u])
      );

      // If explicitUnitKey is provided, check if saving an unsaved slot as empty
      if (explicitUnitKey) {
        if (!currentLockedSlots[explicitUnitKey]?.isSaved && isUnitEmpty(incomingRowsRaw[explicitUnitKey])) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save empty slot ' + explicitUnitKey + '. At least one non-empty value is required.',
          });
        }
      }

      if (!hasAnySaved) {
        if (explicitUnitKey) {
          const explicitVal = incomingRowsRaw[explicitUnitKey] || {};
          if (isUnitEmpty(explicitVal)) {
            return res.status(400).json({
              success: false,
              message: 'Cannot save empty slot ' + explicitUnitKey + '. At least one non-empty value is required.',
            });
          }
        } else if (nonEmptyUnsaved.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save empty slot ' + SHIFT_ITEMS[0] + '. At least one non-empty value is required.',
          });
        }
      }

      // Normalize incomingRows for computeSlotTransition:
      const incomingShiftRows = {};
      if (explicitUnitKey) {
        for (const u of SHIFT_ITEMS) {
          if (u === explicitUnitKey) {
            incomingShiftRows[u] = incomingRowsRaw[u] || {};
          } else if (existingRows[u] !== undefined) {
            incomingShiftRows[u] = existingRows[u];
          }
        }
      } else {
        for (const u of SHIFT_ITEMS) {
          if (currentLockedSlots[u]?.isSaved) {
            if (incomingRowsRaw[u] !== undefined) {
              incomingShiftRows[u] = incomingRowsRaw[u];
            } else if (existingRows[u] !== undefined) {
              incomingShiftRows[u] = existingRows[u];
            }
          } else {
            if (incomingRowsRaw[u] !== undefined && !isUnitEmpty(incomingRowsRaw[u])) {
              incomingShiftRows[u] = incomingRowsRaw[u];
            }
          }
        }
      }

      // Call computeSlotTransition with correct signature
      const transition = computeSlotTransition({
        unitsOrder: SHIFT_ITEMS,
        lockedSlots: currentLockedSlots,
        storedRows: existingRows,
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

      const targetSlot = transition.targetUnit;
      const isCorrection = transition.isCorrection;
      const targetIncoming = incomingShiftRows[targetSlot] || {};
      const targetExisting = existingRows[targetSlot] || {};

      // Check numeric inputs on target incoming unit
      for (const pk of PARAM_KEYS) {
        const val = targetIncoming[pk];
        if (val !== undefined && val !== null && val !== '') {
          if (isNaN(Number(val))) {
            return res.status(400).json({
              success: false,
              message: `Validation failed: Parameter '${pk}' must be a valid number.`,
            });
          }
        }
      }

      // Compute next lockedSlots
      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (!isCorrection) {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        const targetIdx = SHIFT_ITEMS.indexOf(targetSlot);
        for (let p = 0; p < targetIdx; p++) {
          updatedLockedSlots[SHIFT_ITEMS[p]].isLocked = true;
        }
        if (targetIdx + 1 < SHIFT_ITEMS.length) {
          updatedLockedSlots[SHIFT_ITEMS[targetIdx + 1]].isLocked = false;
        }
      } else {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: true,
          correctionUsed: true,
        };
      }

      const allPermanentlyLocked = SHIFT_ITEMS.every((sk) => updatedLockedSlots[sk]?.isLocked);

      const flatLockedShifts = {
        shift1Saved: updatedLockedSlots.shift1.isSaved,
        shift2Saved: updatedLockedSlots.shift2.isSaved,
        shift3Saved: updatedLockedSlots.shift3.isSaved,
        shift1Locked: updatedLockedSlots.shift1.isLocked,
        shift2Locked: updatedLockedSlots.shift2.isLocked,
        shift3Locked: updatedLockedSlots.shift3.isLocked,
        shift1Edits: updatedLockedSlots.shift1.correctionUsed ? 1 : 0,
        shift2Edits: updatedLockedSlots.shift2.correctionUsed ? 1 : 0,
        shift3Edits: updatedLockedSlots.shift3.correctionUsed ? 1 : 0,
        shift1: updatedLockedSlots.shift1.isLocked,
        shift2: updatedLockedSlots.shift2.isLocked,
        shift3: updatedLockedSlots.shift3.isLocked,
        s1Saved: updatedLockedSlots.shift1.isSaved,
        s2Saved: updatedLockedSlots.shift2.isSaved,
        s3Saved: updatedLockedSlots.shift3.isSaved,
        s1Locked: updatedLockedSlots.shift1.isLocked,
        s2Locked: updatedLockedSlots.shift2.isLocked,
        s3Locked: updatedLockedSlots.shift3.isLocked,
        s1: updatedLockedSlots.shift1.isLocked,
        s2: updatedLockedSlots.shift2.isLocked,
        s3: updatedLockedSlots.shift3.isLocked,
        allPermanentlyLocked,
        slots: updatedLockedSlots,
      };

      const nowIso = now.toISOString();
      const saveEventId = `e501_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const existingEditedFields = existingData.editedFields || {};
      const newEditedFields = JSON.parse(JSON.stringify(existingEditedFields));
      const editAuditHistory = [...(existingData.editAuditHistory || [])];

      const rowId = SHIFT_MAP[targetSlot].id;
      const shiftNumLabel = SHIFT_MAP[targetSlot].shift;

      if (isCorrection) {
        PARAM_KEYS.forEach((pk) => {
          const ov = targetExisting[pk];
          const nv = targetIncoming[pk];
          const oNum = ov !== '' && ov !== null && ov !== undefined ? Number(ov) : null;
          const nNum = nv !== '' && nv !== null && nv !== undefined ? Number(nv) : null;
          const changed = oNum !== null && nNum !== null ? oNum !== nNum : String(ov ?? '') !== String(nv ?? '');
          if (changed) {
            if (!newEditedFields[rowId]) newEditedFields[rowId] = {};
            newEditedFields[rowId][pk] = true;
            editAuditHistory.push({
              date: payload.date,
              rowId,
              shift: shiftNumLabel,
              field: pk,
              fieldName: pk.toUpperCase().replace('_', ' '),
              oldValue: ov,
              newValue: nv,
              editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }

      // Reconstruct merged rows
      const mergedRows = {
        ...existingRows,
        [targetSlot]: {
          ...targetExisting,
          ...PARAM_KEYS.reduce((acc, pk) => {
            acc[pk] = targetIncoming[pk] !== undefined && targetIncoming[pk] !== null ? targetIncoming[pk] : '';
            return acc;
          }, {}),
        },
      };

      const updatedReadings = buildReadingsArray(mergedRows);
      const updatedAverages = {
        e501_fnh3: calcAvg(updatedReadings, 'e501_fnh3'),
        e501_na2co3: calcAvg(updatedReadings, 'e501_na2co3'),
        t501_fnh3: calcAvg(updatedReadings, 't501_fnh3'),
        t501_na2co3: calcAvg(updatedReadings, 't501_na2co3'),
      };

      const docUpdatePayload = {
        'data.rows': mergedRows,
        'data.readings': updatedReadings,
        'data.averages': updatedAverages,
        'data.lockedSlots': updatedLockedSlots,
        'data.lockedShifts': flatLockedShifts,
        'data.editedFields': newEditedFields,
        'data.editAuditHistory': editAuditHistory,
        'data.submittedBy': req.user?.name || payload.submittedBy || 'Shift Chemist',
        'data.submittedById': req.user?._id || null,
        'data.submittedAt': nowIso,
        'data.saveEventId': saveEventId,
        'data.unit': 'E 501 / T 501',
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
                [`data.lockedSlots.${targetSlot}.isSaved`]: true,
                [`data.lockedSlots.${targetSlot}.correctionUsed`]: false,
                [`data.lockedSlots.${targetSlot}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetSlot}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetSlot}`]: { $exists: false } },
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
            unit: 'E 501 / T 501',
            date: payload.date,
            shift: 'All Shifts',
            status: 'completed',
            submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
            submittedById: req.user?._id || null,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: {
              id: `e501_${Date.now()}`,
              date: payload.date,
              plant: 'SA',
              plantCode: 'SA',
              unit: 'E 501 / T 501',
              section: 'Soda Ash Production',
              analysisType: CANONICAL_ANALYSIS_TYPE,
              rows: mergedRows,
              readings: updatedReadings,
              averages: updatedAverages,
              lockedSlots: updatedLockedSlots,
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
        readings: updatedReadings,
        rows: mergedRows,
        averages: updatedAverages,
        lockedSlots: updatedLockedSlots,
        lockedShifts: flatLockedShifts,
        editedFields: newEditedFields,
        editAuditHistory,
      };

      return res.status(200).json({
        success: true,
        message: 'E 501 / T 501 Analysis saved successfully in MongoDB ✓',
        data: finalRecordData,
        record: finalRecordData,
        recordId: savedDoc._id,
        readings: updatedReadings,
        rows: mergedRows,
        averages: updatedAverages,
        lockedSlots: updatedLockedSlots,
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
      console.error('[E 501 / T 501 POST] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error while saving E 501 / T 501 Analysis: ' + err.message,
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

const defaultRouter = createE501T501Router();
defaultRouter.createRouter = createE501T501Router;
module.exports = defaultRouter;
