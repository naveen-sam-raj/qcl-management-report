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

const SLOT_KEYS = ['dm_water', 'a_unit'];
const USER_FIELDS = ['ph', 'cond', 'th', 'alk', 'sio2'];
const NUMERIC_FIELDS = ['ph', 'cond', 'alk', 'sio2'];

const CANONICAL_PLANT_CODE = 'OFFSITE';
const CANONICAL_PLANT_NAME = 'OFFSITE Plant';
const CANONICAL_PLANT = 'OFFSET';
const CANONICAL_UNIT = 'DM Water';
const CANONICAL_ANALYSIS_TYPE = 'Analysis For DM Water / Anion unit';

const DEFAULT_READINGS = [
  {
    id: 'r_dm_water',
    unit: 'DM WATER',
    time: '',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    sio2: '',
    p: '0',
    m: '0',
    isDefault: true,
  },
  {
    id: 'r_anion_unit',
    unit: 'A.UNIT',
    time: '',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    sio2: '',
    p: '0',
    m: '0',
    isDefault: true,
  },
];

function getSlotKeyFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const idStr = String(row.id || '').trim().toLowerCase();
  const unitStr = String(row.unit || '').trim().toLowerCase();
  if (idStr === 'r_dm_water' || unitStr === 'dm water' || unitStr.includes('dm water')) {
    return 'dm_water';
  }
  if (idStr === 'r_anion_unit' || unitStr === 'a.unit' || unitStr === 'a_unit' || unitStr.includes('anion')) {
    return 'a_unit';
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

function deriveDmWaterLocks(existingDoc) {
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
  } else {
    SLOT_KEYS.forEach((sk) => {
      const r = rowsBySlot[sk];
      const userObj = extractUserSlotFields(r);
      const hasData = r && !isUnitEmpty(userObj);
      const sSlot = storedSlots[sk] || {};
      const legacyEdits = sSlot.editCount || 0;
      const legacyLocked = Boolean(sSlot.isLocked || legacyEdits >= 1);
      const isSaved = Boolean(hasData && (sSlot.isSaved || sSlot.initialSaved || hasData));
      const corrUsed = Boolean(sSlot.correctionUsed || legacyEdits >= 1 || (legacyLocked && isSaved));
      slotSavedMap[sk] = isSaved;
      slotCorrMap[sk] = corrUsed;
    });
  }

  const lockedSlots = {};
  SLOT_KEYS.forEach((sk, idx) => {
    if (storedSlots[sk] && typeof storedSlots[sk] === 'object' && ('isSaved' in storedSlots[sk] || 'initialSaved' in storedSlots[sk])) {
      const isSaved = Boolean(storedSlots[sk].isSaved || storedSlots[sk].initialSaved);
      const corr = Boolean(storedSlots[sk].correctionUsed);
      let isLocked = Boolean(storedSlots[sk].isLocked || corr);
      for (let nextIdx = idx + 1; nextIdx < SLOT_KEYS.length; nextIdx++) {
        if (slotSavedMap[SLOT_KEYS[nextIdx]]) {
          isLocked = true;
          break;
        }
      }
      lockedSlots[sk] = {
        isSaved,
        isLocked: Boolean(isLocked),
        correctionUsed: corr,
      };
    } else {
      const isSaved = Boolean(slotSavedMap[sk]);
      const corr = Boolean(slotCorrMap[sk]);
      let isLocked = corr;
      for (let nextIdx = idx + 1; nextIdx < SLOT_KEYS.length; nextIdx++) {
        if (slotSavedMap[SLOT_KEYS[nextIdx]]) {
          isLocked = true;
          break;
        }
      }
      lockedSlots[sk] = {
        isSaved,
        isLocked: Boolean(isLocked),
        correctionUsed: corr,
      };
    }
  });

  const allSaved = SLOT_KEYS.every((sk) => lockedSlots[sk]?.isSaved);
  const allLocked = SLOT_KEYS.every((sk) => lockedSlots[sk]?.isLocked);

  return {
    lockedSlots,
    initialSaved: allSaved || Boolean(existingData.initialSaved),
    isLocked: allLocked || Boolean(existingData.isLocked),
    editCount: existingData.editCount || 0,
    rowsBySlot,
  };
}

function createDmWaterRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  router.get('/smtp-diagnostic', async (req, res) => {
    return res.status(200).json({
      status: 'disabled',
      message: 'Email notification functionality has been removed.',
    });
  });

  router.post('/test-emailjs', async (req, res) => {
    return res.status(200).json({
      success: true,
      emailSent: false,
      emailStatus: 'disabled',
      message: 'Email notification test endpoints are disabled.',
    });
  });

  router.use(protect);

  router.get('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: DM Water Analysis data access is restricted to authorized Admins.',
        });
      }

      const { date, startDate, endDate } = req.query;

      if (date) {
        const query = {
          date,
          analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        const companyId = req.user?.company?._id || req.user?.company || null;
        if (companyId) {
          query.$or = [{ company: companyId }, { company: null }];
        }

        const docs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(docs, {
          preferredAnalysisTypes: [CANONICAL_ANALYSIS_TYPE, 'DM Water Analysis'],
          preferredPlantCodes: [CANONICAL_PLANT_CODE, 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'],
        });

        if (doc && doc.data) {
          const payloadData = doc.data;
          const currentLocks = deriveDmWaterLocks(doc);
          const rawReadings = Array.isArray(payloadData.readings)
            ? payloadData.readings
            : Array.isArray(payloadData.shifts)
              ? payloadData.shifts
              : Array.isArray(payloadData.rows)
                ? payloadData.rows
                : [];

          let rowDM = rawReadings.find((r) => getSlotKeyFromRow(r) === 'dm_water');
          let rowAnion = rawReadings.find((r) => getSlotKeyFromRow(r) === 'a_unit');

          // Handle legacy flat document
          if (!rowDM && (payloadData.ph !== undefined || payloadData.cond !== undefined || payloadData.conductivity !== undefined || payloadData.silica !== undefined)) {
            rowDM = {
              id: 'r_dm_water',
              unit: 'DM WATER',
              time: payloadData.time || '',
              ph: normalizeScalar(payloadData.ph),
              cond: normalizeScalar(payloadData.cond || payloadData.conductivity),
              th: normalizeScalar(payloadData.th),
              alk: normalizeScalar(payloadData.alk),
              sio2: normalizeScalar(payloadData.sio2 || payloadData.silica),
              p: normalizeScalar(payloadData.p) || '0',
              m: normalizeScalar(payloadData.m) || normalizeScalar(payloadData.alk) || '0',
              isDefault: true,
            };
          }

          const extraRows = rawReadings.filter((r) => !getSlotKeyFromRow(r));

          const cleanRow = (row, defId, defUnit) => {
            const r = row || {};
            const alk = normalizeScalar(r.alk);
            const m = normalizeScalar(r.m) || alk || '0';
            const p = normalizeScalar(r.p) || '0';
            return {
              ...r,
              id: r.id || defId,
              unit: r.unit || defUnit,
              time: r.time !== undefined && r.time !== null ? String(r.time) : '',
              ph: normalizeScalar(r.ph),
              cond: normalizeScalar(r.cond || r.conductivity),
              th: normalizeScalar(r.th),
              alk,
              sio2: normalizeScalar(r.sio2 || r.silica),
              p,
              m,
              isDefault: true,
            };
          };

          const canonicalReadings = [
            cleanRow(rowDM, 'r_dm_water', 'DM WATER'),
            cleanRow(rowAnion, 'r_anion_unit', 'A.UNIT'),
          ];

          const readings = [...canonicalReadings, ...extraRows];

          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: null,
            emailStatus: 'disabled',
            assignedOperatorEmail: null,
            lockedSlots: currentLocks.lockedSlots,
            initialSaved: currentLocks.initialSaved,
            editCount: currentLocks.editCount,
            isLocked: currentLocks.isLocked,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              readings,
              lockedSlots: currentLocks.lockedSlots,
              initialSaved: currentLocks.initialSaved,
              editCount: currentLocks.editCount,
              isLocked: currentLocks.isLocked,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: 'disabled',
              emailRecipient: null,
            },
          });
        }

        return res.status(200).json({
          success: true,
          assignedOperatorEmail: null,
          data: null,
          message: `No record found for date ${date}`,
        });
      }

      // Date range or listing query
      const query = {
        analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      const companyId = req.user?.company?._id || req.user?.company || null;
      if (companyId) {
        query.$or = [{ company: companyId }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      const results = (docs || []).map((d) => ({
        ...d.data,
        _id: d._id,
        id: d._id,
        date: d.date,
        emailStatus: 'disabled',
        emailRecipient: null,
      }));

      return res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      console.error('[DMWater GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving DM Water records: ' + error.message,
      });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: DM Water Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};

      if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save DM Water Analysis.',
        });
      }

      const operatingDate = getOperatingDateIST(getNow());
      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: DM Water Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const readings = Array.isArray(payload.readings) ? payload.readings : [];
      if (readings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      // Input validation on user fields
      const errors = [];
      readings.forEach((reading, index) => {
        const sk = getSlotKeyFromRow(reading);
        if (!sk) return; // ignore legacy extra rows from validation failure
        USER_FIELDS.forEach((field) => {
          const val = normalizeScalar(reading[field]);
          if (val !== '') {
            if (field === 'th') {
              const lower = val.toLowerCase();
              if (lower === 'nil' || lower === '0' || !isNaN(Number(val))) {
                return;
              }
              errors.push(`Row ${index + 1} (${reading.unit || 'Sample'}) -> ${field.toUpperCase()} must be a valid number.`);
            } else if (NUMERIC_FIELDS.includes(field)) {
              if (isNaN(Number(val))) {
                errors.push(`Row ${index + 1} (${reading.unit || 'Sample'}) -> ${field.toUpperCase()} must be a valid number.`);
              }
            }
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

      // Query existing record
      const query = {
        date: payload.date,
        analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
      };
      const companyId = req.user?.company?._id || req.user?.company || null;
      if (companyId) {
        query.$or = [{ company: companyId }, { company: null }];
      }

      const existingDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(existingDocs, {
        preferredAnalysisTypes: [CANONICAL_ANALYSIS_TYPE, 'DM Water Analysis'],
        preferredPlantCodes: [CANONICAL_PLANT_CODE, 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'],
      });

      const currentLocks = deriveDmWaterLocks(existingDoc);
      const currentLockedSlots = currentLocks.lockedSlots;
      const existingData = existingDoc?.data || {};

      const existingRawReadings = Array.isArray(existingData.readings)
        ? existingData.readings
        : Array.isArray(existingData.shifts)
          ? existingData.shifts
          : Array.isArray(existingData.rows)
            ? existingData.rows
            : [];

      const existingSlots = {};
      const extraLegacyRows = [];
      existingRawReadings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk && !existingSlots[sk]) {
          existingSlots[sk] = extractUserSlotFields(r);
        } else if (!sk) {
          extraLegacyRows.push(r);
        }
      });
      SLOT_KEYS.forEach((sk) => {
        if (!existingSlots[sk]) {
          existingSlots[sk] = extractUserSlotFields({});
        }
      });

      const incomingSlots = {};
      readings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk && !incomingSlots[sk]) {
          incomingSlots[sk] = extractUserSlotFields(r);
        }
      });
      SLOT_KEYS.forEach((sk) => {
        if (!incomingSlots[sk]) {
          incomingSlots[sk] = extractUserSlotFields({});
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
        const prev = existingSlots[sk] || {};
        const curr = incomingSlots[sk] || {};
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

      // Sequential lock propagation: if any slot k is saved, all preceding slots p < k are locked
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
        const rowId = targetSlot === 'dm_water' ? 'r_dm_water' : 'r_anion_unit';
        const unitName = targetSlot === 'dm_water' ? 'DM WATER' : 'A.UNIT';
        const targetIncomingRow = readings.find((r) => getSlotKeyFromRow(r) === targetSlot) || {};
        const targetTime = targetIncomingRow.time !== undefined && targetIncomingRow.time !== null ? String(targetIncomingRow.time) : '';

        USER_FIELDS.forEach((f) => {
          const oldVal = existingSlots[targetSlot]?.[f];
          const newVal = incomingSlots[targetSlot]?.[f];
          if (isValueDifferent(oldVal, newVal)) {
            updatedEditedFields[`${rowId}_${f}`] = true;

            updatedAuditHistory.push({
              date: payload.date,
              rowId,
              shift: unitName,
              time: targetTime,
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
      const makeCleanRow = (sk, defId, defUnit) => {
        const incRow = readings.find((r) => getSlotKeyFromRow(r) === sk);
        const prevRow = existingRawReadings.find((r) => getSlotKeyFromRow(r) === sk) || {};
        const sourceRow = incRow || prevRow;

        const alk = normalizeScalar(sourceRow.alk);
        const m = normalizeScalar(sourceRow.m) || alk || '0';
        const p = normalizeScalar(sourceRow.p) || normalizeScalar(prevRow.p) || '0';

        return {
          id: defId,
          unit: defUnit,
          time: sourceRow.time !== undefined && sourceRow.time !== null ? String(sourceRow.time) : (prevRow.time || ''),
          ph: normalizeScalar(sourceRow.ph),
          cond: normalizeScalar(sourceRow.cond || sourceRow.conductivity),
          th: normalizeScalar(sourceRow.th),
          alk,
          sio2: normalizeScalar(sourceRow.sio2 || sourceRow.silica),
          p,
          m,
          isDefault: true,
        };
      };

      const finalCanonicalReadings = [
        makeCleanRow('dm_water', 'r_dm_water', 'DM WATER'),
        makeCleanRow('a_unit', 'r_anion_unit', 'A.UNIT'),
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
        message: 'DM Water Analysis saved successfully in MongoDB ✓',
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
      console.error('[DMWater POST] Uncaught error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing DM Water analysis: ' + error.message,
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

const defaultRouter = createDmWaterRouter();
defaultRouter.createRouter = createDmWaterRouter;

module.exports = defaultRouter;
