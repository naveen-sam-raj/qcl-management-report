const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isUnitEmpty,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const SLOT_KEYS = ['bfw', 'shs'];
const USER_FIELDS = ['ph', 'cond', 'th', 'alk', 'sio2'];
const NUMERIC_FIELDS = ['ph', 'cond', 'alk', 'sio2'];

const CANONICAL_PLANT_CODE = 'OFFSITE';
const CANONICAL_PLANT_NAME = 'OFFSITE Plant';
const CANONICAL_PLANT = 'OFFSET';
const CANONICAL_UNIT = 'BFW';
const CANONICAL_ANALYSIS_TYPE = 'Boiler Feed Water / Super Heated Steam Analysis';

const DEFAULT_READINGS = [
  {
    id: 'r1',
    stream: 'Boiler Feed Water (BFW)',
    frequency: 'Day',
    time: '15:00',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    tAlk: '',
    sio2: '',
    fe2o3: '',
    isDefault: true,
  },
  {
    id: 'r2',
    stream: 'Super Heated Steam (SHS)',
    frequency: 'Day',
    time: '15:00',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    tAlk: '',
    sio2: '',
    fe2o3: '',
    isDefault: true,
  },
];

function getSlotKeyFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const idStr = String(row.id || '').trim().toLowerCase();
  if (idStr === 'r1' || idStr === 'bfw_1') {
    return 'bfw';
  }
  if (idStr === 'r2' || idStr === 'shs_1') {
    return 'shs';
  }
  const streamStr = String(row.stream || '').trim().toLowerCase();
  if (streamStr === 'boiler feed water (bfw)' || streamStr === 'bfw' || streamStr === 'boiler feed water') {
    return 'bfw';
  }
  if (streamStr === 'super heated steam (shs)' || streamStr === 'shs' || streamStr === 'super heated steam') {
    return 'shs';
  }
  return null;
}

function normalizeScalar(val) {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  if (s === '–' || s === '-' || s === '') return '';
  return s;
}

function extractUserSlotFields(row = {}) {
  const out = {};
  for (const f of USER_FIELDS) {
    out[f] = normalizeScalar(row[f]);
  }
  return out;
}

function deriveBfwLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots || {};
  const rawReadings = Array.isArray(existingData.readings)
    ? existingData.readings
    : Array.isArray(existingData.shifts)
      ? existingData.shifts
      : Array.isArray(existingData.rows)
        ? existingData.rows
        : [];

  const rowsBySlot = {};
  rawReadings.forEach((r) => {
    const sk = getSlotKeyFromRow(r);
    if (sk && !rowsBySlot[sk]) {
      rowsBySlot[sk] = r;
    }
  });

  const slotSavedMap = {};
  const slotCorrMap = {};

  if ((existingData.isLocked !== undefined || existingData.editCount !== undefined || existingData.initialSaved !== undefined) && !existingData.lockedSlots) {
    const docLocked = Boolean(existingData.isLocked || (existingData.editCount || 0) >= 1);
    const savedSlots = [];
    SLOT_KEYS.forEach((sk) => {
      const r = rowsBySlot[sk];
      const userObj = extractUserSlotFields(r);
      const hasData = r && !isUnitEmpty(userObj);
      const isSaved = Boolean(hasData);
      slotSavedMap[sk] = isSaved;
      if (isSaved) savedSlots.push(sk);
    });

    SLOT_KEYS.forEach((sk) => {
      if (!slotSavedMap[sk]) {
        slotCorrMap[sk] = false;
      } else if (docLocked) {
        slotCorrMap[sk] = true;
      } else {
        const isLastSaved = savedSlots.length > 0 && savedSlots[savedSlots.length - 1] === sk;
        slotCorrMap[sk] = !isLastSaved;
      }
    });
  }

  const out = {};
  SLOT_KEYS.forEach((sk) => {
    const fromStored = storedSlots[sk] || {};
    const isSaved = fromStored.isSaved !== undefined ? Boolean(fromStored.isSaved) : Boolean(slotSavedMap[sk]);
    const correctionUsed = fromStored.correctionUsed !== undefined ? Boolean(fromStored.correctionUsed) : Boolean(slotCorrMap[sk]);
    let isLocked = fromStored.isLocked !== undefined ? Boolean(fromStored.isLocked) : correctionUsed;

    out[sk] = {
      isSaved,
      isLocked,
      correctionUsed,
    };
  });

  // Sequential waterfall propagation
  SLOT_KEYS.forEach((sk, idx) => {
    let hasSuccessorSaved = false;
    for (let nextIdx = idx + 1; nextIdx < SLOT_KEYS.length; nextIdx++) {
      if (out[SLOT_KEYS[nextIdx]]?.isSaved) {
        hasSuccessorSaved = true;
        break;
      }
    }
    if (hasSuccessorSaved) {
      out[sk] = {
        ...(out[sk] || {}),
        isLocked: true,
      };
    }
  });

  return out;
}

function createBfwRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  router.get('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Users with role "user" are not permitted to view BFW / SHS Analysis records.',
        });
      }

      const { date, startDate, endDate } = req.query;
      const companyId = req.user?.company?._id || req.user?.company || null;

      if (date) {
        const query = {
          date,
          analysisType: {
            $in: [
              'Boiler Feed Water / Super Heated Steam Analysis',
              'BFW Analysis',
              'Boiler Feed Water (BFW) Analysis',
            ],
          },
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (companyId) {
          query.$or = [{ company: companyId }, { company: null }];
        }

        const candidateDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(candidateDocs);

        if (!doc) {
          const freshLockedSlots = {
            bfw: { isSaved: false, isLocked: false, correctionUsed: false },
            shs: { isSaved: false, isLocked: false, correctionUsed: false },
          };
          return res.status(200).json({
            success: true,
            data: null,
            lockedSlots: freshLockedSlots,
            initialSaved: false,
            editCount: 0,
            isLocked: false,
            editedFields: {},
            editAuditHistory: [],
            message: `No record found for date ${date}`,
          });
        }

        const payloadData = doc.data || {};
        const lockedSlots = deriveBfwLocks(doc);
        const rawReadings = Array.isArray(payloadData.readings)
          ? payloadData.readings
          : Array.isArray(payloadData.shifts)
            ? payloadData.shifts
            : Array.isArray(payloadData.rows)
              ? payloadData.rows
              : [];

        const rowsBySlot = {};
        const extraLegacyRows = [];
        rawReadings.forEach((r) => {
          const sk = getSlotKeyFromRow(r);
          if (sk && !rowsBySlot[sk]) {
            rowsBySlot[sk] = r;
          } else if (!sk) {
            extraLegacyRows.push(r);
          }
        });

        const finalCanonicalReadings = DEFAULT_READINGS.map((defRow) => {
          const sk = getSlotKeyFromRow(defRow);
          const found = rowsBySlot[sk];
          if (!found) return { ...defRow };

          const alk = normalizeScalar(found.alk || found.tAlk);
          const tAlk = alk;
          return {
            id: found.id || defRow.id,
            stream: found.stream || defRow.stream,
            frequency: found.frequency || defRow.frequency,
            time: found.time !== undefined && found.time !== null ? String(found.time) : defRow.time,
            ph: normalizeScalar(found.ph),
            cond: normalizeScalar(found.cond),
            th: normalizeScalar(found.th),
            alk,
            tAlk,
            sio2: normalizeScalar(found.sio2),
            fe2o3: found.fe2o3 !== undefined && found.fe2o3 !== null ? String(found.fe2o3) : '',
            isDefault: true,
          };
        });

        const mergedReadings = [...finalCanonicalReadings, ...extraLegacyRows];

        const allSlotsSaved = SLOT_KEYS.every((sk) => lockedSlots[sk]?.isSaved);
        const allSlotsLocked = SLOT_KEYS.every((sk) => lockedSlots[sk]?.isLocked);

        const responsePayload = {
          ...payloadData,
          _id: doc._id,
          id: doc._id,
          date: doc.date,
          plant: CANONICAL_PLANT,
          plantCode: CANONICAL_PLANT_CODE,
          plantName: CANONICAL_PLANT_NAME,
          unit: CANONICAL_UNIT,
          analysisType: CANONICAL_ANALYSIS_TYPE,
          readings: mergedReadings,
          lockedSlots,
          initialSaved: allSlotsSaved || Boolean(payloadData.initialSaved),
          editCount: payloadData.editCount || 0,
          isLocked: allSlotsLocked || Boolean(payloadData.isLocked),
          editedFields: payloadData.editedFields || {},
          editAuditHistory: payloadData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailRecipient: null,
        };

        return res.status(200).json({
          success: true,
          recordId: doc._id,
          lockedSlots,
          initialSaved: responsePayload.initialSaved,
          editCount: responsePayload.editCount,
          isLocked: responsePayload.isLocked,
          editedFields: responsePayload.editedFields,
          editAuditHistory: responsePayload.editAuditHistory,
          data: responsePayload,
        });
      }

      // List query
      const query = {
        analysisType: {
          $in: [
            'Boiler Feed Water / Super Heated Steam Analysis',
            'BFW Analysis',
            'Boiler Feed Water (BFW) Analysis',
          ],
        },
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (companyId) {
        query.$or = [{ company: companyId }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      const results = docs.map((d) => {
        const payloadData = d.data || {};
        const lockedSlots = deriveBfwLocks(d);
        return {
          ...payloadData,
          _id: d._id,
          id: d._id,
          date: d.date,
          lockedSlots,
          emailStatus: 'disabled',
          emailRecipient: null,
        };
      });

      return res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      console.error('[BFW GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving BFW records: ' + error.message,
      });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Users with role "user" are not permitted to save BFW / SHS Analysis records.',
        });
      }

      const payload = req.body || {};
      const todayOperatingDate = getOperatingDateIST(getNow());

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save BFW Analysis.',
        });
      }

      if (payload.date !== todayOperatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Boiler Feed Water / SHS Analysis records can only be created or modified for today's operating date (${todayOperatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const readings = Array.isArray(payload.readings) ? payload.readings : [];
      if (readings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      // Validate numeric fields and th
      for (let idx = 0; idx < readings.length; idx++) {
        const reading = readings[idx];
        const rowNum = idx + 1;
        for (const field of NUMERIC_FIELDS) {
          const val = reading[field];
          if (val !== '' && val !== null && val !== undefined) {
            const norm = normalizeScalar(val);
            if (norm !== '' && isNaN(Number(norm))) {
              return res.status(400).json({
                success: false,
                message: `Row #${rowNum} (${reading.stream || 'Reading'}): ${field.toUpperCase()} must be a valid number.`,
              });
            }
          }
        }

        if (reading.th !== '' && reading.th !== null && reading.th !== undefined) {
          const thNorm = normalizeScalar(reading.th);
          if (thNorm !== '') {
            const thStr = thNorm.toLowerCase();
            const isNil = thStr === 'nil' || thStr === 'n' || thStr === 'none';
            if (!isNil && isNaN(Number(thNorm))) {
              return res.status(400).json({
                success: false,
                message: `Row #${rowNum} (${reading.stream || 'Reading'}): TH must be a valid number or 'Nil'.`,
              });
            }
          }
        }
      }

      const companyId = req.user?.company?._id || req.user?.company || null;
      const query = {
        date: payload.date,
        analysisType: {
          $in: [
            'Boiler Feed Water / Super Heated Steam Analysis',
            'BFW Analysis',
            'Boiler Feed Water (BFW) Analysis',
          ],
        },
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
      };
      if (companyId) {
        query.$or = [{ company: companyId }, { company: null }];
      }

      const candidateDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(candidateDocs);

      const existingData = existingDoc?.data || {};
      const currentLockedSlots = deriveBfwLocks(existingDoc);

      const existingRawReadings = Array.isArray(existingData.readings)
        ? existingData.readings
        : Array.isArray(existingData.shifts)
          ? existingData.shifts
          : Array.isArray(existingData.rows)
            ? existingData.rows
            : [];

      const existingSlots = {};
      const storedRowsBySlot = {};
      const extraLegacyRows = [];
      existingRawReadings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk && !existingSlots[sk]) {
          existingSlots[sk] = extractUserSlotFields(r);
          storedRowsBySlot[sk] = r;
        } else if (!sk) {
          extraLegacyRows.push(r);
        }
      });
      SLOT_KEYS.forEach((sk) => {
        if (!existingSlots[sk]) {
          existingSlots[sk] = extractUserSlotFields({});
        }
      });

      const rawSlotMatches = {};
      readings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk && !rawSlotMatches[sk]) {
          rawSlotMatches[sk] = extractUserSlotFields(r);
        }
      });

      // Target slot resolution
      let targetSlot = payload.targetSlot || null;
      if (targetSlot && !SLOT_KEYS.includes(targetSlot)) {
        return res.status(400).json({
          success: false,
          message: `Invalid targetSlot '${targetSlot}'. Valid slots are: ${SLOT_KEYS.join(', ')}`,
        });
      }

      const diffSlots = [];
      SLOT_KEYS.forEach((sk) => {
        if (rawSlotMatches[sk]) {
          const prev = existingSlots[sk] || {};
          const curr = rawSlotMatches[sk];
          let diff = false;
          for (const f of USER_FIELDS) {
            if (isValueDifferent(prev[f], curr[f])) {
              diff = true;
              break;
            }
          }
          if (diff) {
            diffSlots.push(sk);
          }
        }
      });

      if (diffSlots.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Only one slot can be saved per submission.',
        });
      }

      if (targetSlot && diffSlots.length === 1 && diffSlots[0] !== targetSlot) {
        return res.status(400).json({
          success: false,
          message: 'Only one slot can be saved per submission.',
        });
      }

      if (!targetSlot) {
        if (diffSlots.length === 1) {
          targetSlot = diffSlots[0];
        } else {
          const firstUnsaved = SLOT_KEYS.find((sk) => !currentLockedSlots[sk]?.isSaved);
          targetSlot = firstUnsaved || SLOT_KEYS[0];
        }
      }

      const incomingSlots = {};
      SLOT_KEYS.forEach((sk) => {
        if (sk === targetSlot) {
          incomingSlots[sk] = rawSlotMatches[sk] || extractUserSlotFields({});
        } else {
          incomingSlots[sk] = existingSlots[sk] || extractUserSlotFields({});
        }
      });

      // Check slot emptiness on USER FIELDS ONLY
      const targetIncomingUserObj = incomingSlots[targetSlot] || {};
      const targetEmpty = isUnitEmpty(targetIncomingUserObj);
      const isTargetSaved = Boolean(currentLockedSlots[targetSlot]?.isSaved);

      if (targetEmpty && !isTargetSaved) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty slot ${targetSlot}. At least one non-empty value is required.`,
        });
      }

      // Compute slot transition
      const transition = computeSlotTransition({
        unitsOrder: SLOT_KEYS,
        lockedSlots: currentLockedSlots,
        storedRows: existingSlots,
        incomingRows: incomingSlots,
      });

      if (transition.noChange) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          recordId: existingDoc?._id || null,
          data: existingData,
          lockedSlots: currentLockedSlots,
        });
      }

      if (!transition.ok) {
        return res.status(transition.status || 400).json({
          success: false,
          message: transition.message,
        });
      }

      // Build updated lockedSlots
      const isCorrection = transition.isCorrection;
      const updatedLockedSlots = { ...currentLockedSlots };

      if (!currentLockedSlots[targetSlot]?.isSaved) {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        const targetIdx = SLOT_KEYS.indexOf(targetSlot);
        for (let i = 0; i < targetIdx; i++) {
          const prevSlot = SLOT_KEYS[i];
          if (updatedLockedSlots[prevSlot]) {
            updatedLockedSlots[prevSlot] = {
              ...updatedLockedSlots[prevSlot],
              isLocked: true,
            };
          }
        }
      } else if (isCorrection) {
        updatedLockedSlots[targetSlot] = {
          ...updatedLockedSlots[targetSlot],
          isLocked: true,
          correctionUsed: true,
        };
      }

      // Sequential waterfall propagation
      SLOT_KEYS.forEach((sk, idx) => {
        let hasSuccessorSaved = false;
        for (let nextIdx = idx + 1; nextIdx < SLOT_KEYS.length; nextIdx++) {
          if (updatedLockedSlots[SLOT_KEYS[nextIdx]]?.isSaved) {
            hasSuccessorSaved = true;
            break;
          }
        }
        if (hasSuccessorSaved) {
          updatedLockedSlots[sk] = {
            ...(updatedLockedSlots[sk] || {}),
            isLocked: true,
          };
        }
      });

      // Audit and field diffs for targetSlot (corrections only)
      const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
      const editorId = req.user?._id || null;
      const nowIso = new Date().toISOString();
      const updatedEditedFields = { ...(existingData.editedFields || {}) };
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        const storedRow = storedRowsBySlot[targetSlot] || {};
        const rowId = storedRow.id || (targetSlot === 'bfw' ? 'r1' : 'r2');
        const shiftLabel = targetSlot === 'bfw' ? 'BFW' : 'SHS';

        USER_FIELDS.forEach((f) => {
          const oldVal = existingSlots[targetSlot]?.[f];
          const newVal = incomingSlots[targetSlot]?.[f];
          if (isValueDifferent(oldVal, newVal)) {
            updatedEditedFields[`${rowId}_${f}`] = true;

            updatedAuditHistory.push({
              date: payload.date,
              rowId,
              shift: shiftLabel,
              time: rowId,
              field: f,
              oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
              newValue: newVal !== undefined && newVal !== null ? String(newVal) : '',
              editedBy: editorName,
              editedById: editorId,
              timestamp: nowIso,
            });
          }
        });
      }

      // Prepare readings array for persistence
      const makeCleanRow = (sk, defId, defStream) => {
        const incRow = readings.find((r) => getSlotKeyFromRow(r) === sk);
        const prevRow = storedRowsBySlot[sk] || {};
        const sourceRow = incRow || prevRow;

        const effectiveId = prevRow.id || (incRow && incRow.id ? incRow.id : defId);
        const effectiveStream = prevRow.stream || defStream;
        const effectiveFrequency = prevRow.frequency || 'Day';
        const effectiveTime = prevRow.time !== undefined && prevRow.time !== null ? String(prevRow.time) : '15:00';
        const effectiveFe2o3 = prevRow.fe2o3 !== undefined && prevRow.fe2o3 !== null ? String(prevRow.fe2o3) : '';

        const alk = normalizeScalar(sourceRow.alk || sourceRow.tAlk);
        const tAlk = alk;

        return {
          id: effectiveId,
          stream: effectiveStream,
          frequency: effectiveFrequency,
          time: effectiveTime,
          ph: normalizeScalar(sourceRow.ph),
          cond: normalizeScalar(sourceRow.cond),
          th: normalizeScalar(sourceRow.th),
          alk,
          tAlk,
          sio2: normalizeScalar(sourceRow.sio2),
          fe2o3: effectiveFe2o3,
          isDefault: true,
        };
      };

      const finalCanonicalReadings = [
        makeCleanRow('bfw', 'r1', 'Boiler Feed Water (BFW)'),
        makeCleanRow('shs', 'r2', 'Super Heated Steam (SHS)'),
      ];

      const finalReadings = [...finalCanonicalReadings, ...extraLegacyRows];

      const allSlotsSaved = SLOT_KEYS.every((sk) => updatedLockedSlots[sk]?.isSaved);
      const allSlotsLocked = SLOT_KEYS.every((sk) => updatedLockedSlots[sk]?.isLocked);
      const nextEditCount = transition.isCorrection
        ? (existingData.editCount || 0) + 1
        : (existingData.editCount || 0);

      const recordData = {
        ...existingData,
        id: existingDoc ? String(existingDoc._id) : undefined,
        _id: existingDoc ? existingDoc._id : undefined,
        date: payload.date,
        plant: CANONICAL_PLANT,
        plantCode: CANONICAL_PLANT_CODE,
        plantName: CANONICAL_PLANT_NAME,
        unit: CANONICAL_UNIT,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        readings: finalReadings,
        lockedSlots: updatedLockedSlots,
        initialSaved: allSlotsSaved || Boolean(existingData.initialSaved),
        editCount: nextEditCount,
        isLocked: allSlotsLocked || Boolean(existingData.isLocked),
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        submittedBy: editorName,
        submittedById: editorId,
        submittedAt: nowIso,
        company: companyId,
      };

      // Atomic conditional update or insert
      let savedRecord = null;
      if (existingDoc && existingDoc._id) {
        const updateFilter = {
          _id: existingDoc._id,
          ...(transition.isCorrection
            ? {
              $or: [
                {
                  [`data.lockedSlots.${targetSlot}.isSaved`]: true,
                  [`data.lockedSlots.${targetSlot}.correctionUsed`]: false,
                  [`data.lockedSlots.${targetSlot}.isLocked`]: false,
                },
                {
                  [`data.lockedSlots.${targetSlot}`]: { $exists: false },
                  'data.isLocked': { $ne: true },
                  'data.editCount': { $not: { $gte: 1 } },
                },
                {
                  'data.lockedSlots': { $exists: false },
                  'data.isLocked': { $ne: true },
                  'data.editCount': { $not: { $gte: 1 } },
                },
              ],
            }
            : {
              $or: [
                { [`data.lockedSlots.${targetSlot}.isSaved`]: { $ne: true } },
                { [`data.lockedSlots.${targetSlot}`]: { $exists: false } },
                { 'data.lockedSlots': { $exists: false } },
              ],
            }),
        };

        const updateRes = await PlantAnalysisRecord.updateOne(updateFilter, {
          $set: {
            plantName: CANONICAL_PLANT_NAME,
            plantCode: CANONICAL_PLANT_CODE,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: CANONICAL_UNIT,
            date: payload.date,
            shift: 'Day',
            data: recordData,
            submittedBy: editorName,
            submittedById: editorId,
            company: companyId,
            savedAt: new Date(),
          },
        });

        if (updateRes.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: This shift was locked or updated concurrently by another user.',
          });
        }

        savedRecord = await PlantAnalysisRecord.findById(existingDoc._id).lean();
      } else {
        try {
          const newDoc = new PlantAnalysisRecord({
            plantName: CANONICAL_PLANT_NAME,
            plantCode: CANONICAL_PLANT_CODE,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: CANONICAL_UNIT,
            date: payload.date,
            shift: 'Day',
            data: recordData,
            submittedBy: editorName,
            submittedById: editorId,
            company: companyId,
            savedAt: new Date(),
          });
          const inserted = await newDoc.save();
          savedRecord = inserted.toObject();
          recordData._id = savedRecord._id;
          recordData.id = String(savedRecord._id);
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

      return res.status(200).json({
        success: true,
        message: 'Boiler Feed Water / SHS Analysis saved successfully in MongoDB ✓',
        recordId: savedRecord._id,
        lockedSlots: updatedLockedSlots,
        initialSaved: recordData.initialSaved,
        editCount: recordData.editCount,
        isLocked: recordData.isLocked,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        data: recordData,
      });
    } catch (error) {
      console.error('[BFW POST] Uncaught error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing BFW analysis: ' + error.message,
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

const defaultRouter = createBfwRouter();
defaultRouter.createRouter = createBfwRouter;

module.exports = defaultRouter;
