const express = require('express');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const CANONICAL_PLANT_CODE = 'OFFSITE';
const PLANT_CODES = ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'];
const CANONICAL_PLANT_NAME = 'OFFSITE Plant';
const CANONICAL_ANALYSIS_TYPE = 'Cooling Water (C.W Water) Analysis';
const ANALYSIS_TYPES = ['Cooling Water (C.W Water) Analysis', 'Cooling Water Analysis'];

// Day routine slots (6 slots)
const SLOT_KEYS_CW = ['t07', 't09', 't11', 't13', 't15', 't17'];
const SLOT_META_CW = {
  t07: { id: 't07', time: '07:00', label: '07:00' },
  t09: { id: 't09', time: '09:00', label: '09:00' },
  t11: { id: 't11', time: '11:00', label: '11:00' },
  t13: { id: 't13', time: '13:00', label: '13:00' },
  t15: { id: 't15', time: '15:00', label: '15:00' },
  t17: { id: 't17', time: '17:00', label: '17:00' },
};
const TIME_TO_SLOT_CW = {
  '07:00': 't07',
  '09:00': 't09',
  '11:00': 't11',
  '13:00': 't13',
  '15:00': 't15',
  '17:00': 't17',
};

// 200# shift slots (2 slots)
const SLOT_KEYS_200 = ['t07', 't19'];
const SLOT_META_200 = {
  t07: { id: 't07', time: '07:00', label: '07:00' },
  t19: { id: 't19', time: '19:00', label: '19:00' },
};
const TIME_TO_SLOT_200 = {
  '07:00': 't07',
  '19:00': 't19',
};

const CW_NUMERIC_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh'];
const CW_ALL_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh', 'ammn'];

const CW200_NUMERIC_FIELDS = ['ph', 'frc', 'opo4', 'cl'];
const CW200_ALL_FIELDS = ['ph', 'frc', 'opo4', 'cl'];

const emptyRowCW = { ph: '', frc: '', cl: '', opo4: '', turbidity: '', tds: '', fe: '', sio2: '', alk: '', so4: '', th: '', cah: '', mgh: '', ammn: '' };
const emptyRow200 = { ph: '', frc: '', opo4: '', cl: '' };

const DEFAULT_READINGS_DAY = [
  { id: 't07', time: '07:00', ...emptyRowCW },
  { id: 't09', time: '09:00', ...emptyRowCW },
  { id: 't11', time: '11:00', ...emptyRowCW },
  { id: 't13', time: '13:00', ...emptyRowCW },
  { id: 't15', time: '15:00', ...emptyRowCW },
  { id: 't17', time: '17:00', ...emptyRowCW },
];

const DEFAULT_READINGS_200 = [
  { id: 't07', time: '07:00', ...emptyRow200 },
  { id: 't19', time: '19:00', ...emptyRow200 },
];

function getUnitConfig(unitStr) {
  const is200 = String(unitStr || '').toLowerCase().includes('200');
  if (is200) {
    return {
      is200: true,
      normalizedUnit: 'cooling water 200#',
      slotKeys: SLOT_KEYS_200,
      slotMeta: SLOT_META_200,
      timeToSlot: TIME_TO_SLOT_200,
      fields: CW200_ALL_FIELDS,
      numericFields: CW200_NUMERIC_FIELDS,
      defaultReadings: DEFAULT_READINGS_200,
      shiftLabel: '200#',
    };
  }
  return {
    is200: false,
    normalizedUnit: 'cooling water',
    slotKeys: SLOT_KEYS_CW,
    slotMeta: SLOT_META_CW,
    timeToSlot: TIME_TO_SLOT_CW,
    fields: CW_ALL_FIELDS,
    numericFields: CW_NUMERIC_FIELDS,
    defaultReadings: DEFAULT_READINGS_DAY,
    shiftLabel: 'Day',
  };
}

function getSlotKey(row, unitConfig) {
  if (!row || typeof row !== 'object') return null;
  const idStr = String(row.id || '').trim().toLowerCase();
  if (unitConfig.slotKeys.includes(idStr)) return idStr;
  const timeStr = String(row.time || '').trim();
  if (unitConfig.timeToSlot[timeStr]) return unitConfig.timeToSlot[timeStr];
  return null;
}

function isUnitEmpty(row, fields) {
  if (!row || typeof row !== 'object') return true;
  return fields.every((f) => {
    const val = row[f];
    return val === undefined || val === null || String(val).trim() === '';
  });
}

function cleanRow(row, fields) {
  const cleaned = {};
  fields.forEach((f) => {
    const val = row?.[f];
    cleaned[f] = val !== undefined && val !== null ? String(val).trim() : '';
  });
  return cleaned;
}

function deriveCoolingWaterLocks(existingDoc, unitConfig) {
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
    const sk = getSlotKey(r, unitConfig);
    if (sk && !rowsBySlot[sk]) {
      rowsBySlot[sk] = r;
    }
  });

  const slotSavedMap = {};
  const slotCorrMap = {};

  if (unitConfig.is200 && existingData.lockedShifts && !existingData.lockedSlots) {
    const ls = existingData.lockedShifts;
    const s1Saved = Boolean(ls.shift1Saved || ls.s1Saved || ls.slots?.shift1?.isSaved || (rowsBySlot.t07 && !isUnitEmpty(rowsBySlot.t07, unitConfig.fields)));
    const s2Saved = Boolean(ls.shift2Saved || ls.s2Saved || ls.slots?.shift2?.isSaved || (rowsBySlot.t19 && !isUnitEmpty(rowsBySlot.t19, unitConfig.fields)));
    const s1Corr = Boolean((ls.shift1Edits || 0) >= 1 || ls.shift1Locked || s2Saved);
    const s2Corr = Boolean((ls.shift2Edits || 0) >= 1 || ls.shift2Locked);

    slotSavedMap.t07 = s1Saved;
    slotCorrMap.t07 = s1Corr;
    slotSavedMap.t19 = s2Saved;
    slotCorrMap.t19 = s2Corr;
  } else if (!unitConfig.is200 && (existingData.isLocked !== undefined || existingData.editCount !== undefined || existingData.initialSaved !== undefined) && !existingData.lockedSlots) {
    const docLocked = Boolean(existingData.isLocked || (existingData.editCount || 0) >= 1);
    const savedSlots = [];
    unitConfig.slotKeys.forEach((sk) => {
      const r = rowsBySlot[sk];
      const hasData = r && !isUnitEmpty(r, unitConfig.fields);
      const isSaved = Boolean(hasData || existingData.initialSaved);
      slotSavedMap[sk] = isSaved;
      if (isSaved) savedSlots.push(sk);
    });

    unitConfig.slotKeys.forEach((sk) => {
      if (docLocked) {
        slotCorrMap[sk] = true;
      } else {
        const isLastSaved = savedSlots.length > 0 && savedSlots[savedSlots.length - 1] === sk;
        slotCorrMap[sk] = !isLastSaved;
      }
    });
  } else {
    unitConfig.slotKeys.forEach((sk) => {
      const r = rowsBySlot[sk];
      const hasData = r && !isUnitEmpty(r, unitConfig.fields);
      const sSlot = storedSlots[sk] || {};
      const legacyEdits = sSlot.editCount || 0;
      const legacyLocked = Boolean(sSlot.isLocked || legacyEdits >= 1);
      const isSaved = Boolean(sSlot.isSaved || sSlot.initialSaved || hasData);
      const corrUsed = Boolean(sSlot.correctionUsed || legacyEdits >= 1 || (legacyLocked && isSaved));
      slotSavedMap[sk] = isSaved;
      slotCorrMap[sk] = corrUsed;
    });
  }

  const lockedSlots = {};
  unitConfig.slotKeys.forEach((sk, idx) => {
    if (storedSlots[sk] && typeof storedSlots[sk] === 'object' && ('isSaved' in storedSlots[sk] || 'initialSaved' in storedSlots[sk])) {
      const isSaved = Boolean(storedSlots[sk].isSaved || storedSlots[sk].initialSaved);
      const corr = Boolean(storedSlots[sk].correctionUsed);
      let isLocked = Boolean(storedSlots[sk].isLocked || corr);
      for (let nextIdx = idx + 1; nextIdx < unitConfig.slotKeys.length; nextIdx++) {
        if (slotSavedMap[unitConfig.slotKeys[nextIdx]]) {
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
      for (let nextIdx = idx + 1; nextIdx < unitConfig.slotKeys.length; nextIdx++) {
        if (slotSavedMap[unitConfig.slotKeys[nextIdx]]) {
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

  return { lockedSlots };
}

function createCoolingWaterRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  /**
   * @desc    Get Cooling Water Analysis data (by date & unit)
   * @route   GET /api/cooling-water-analysis
   * @access  Private (Admins only)
   */
  router.get('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Cooling Water Analysis data access is restricted to authorized Admins.',
        });
      }

      const { date, startDate, endDate, unit = 'cooling water' } = req.query;
      const unitConfig = getUnitConfig(unit);
      const companyVal = req.user?.company?._id || req.user?.company || null;

      if (date) {
        const query = {
          date,
          analysisType: { $in: ANALYSIS_TYPES },
          plantCode: { $in: PLANT_CODES },
          unit: unitConfig.normalizedUnit,
        };
        if (companyVal) {
          query.$or = [{ company: companyVal }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc && doc.data) {
          const payloadData = doc.data;
          const { lockedSlots } = deriveCoolingWaterLocks(doc, unitConfig);
          const rawReadings = Array.isArray(payloadData.readings)
            ? payloadData.readings
            : Array.isArray(payloadData.shifts)
              ? payloadData.shifts
              : Array.isArray(payloadData.rows)
                ? payloadData.rows
                : [];

          const rowsBySlot = {};
          const extraRows = [];
          rawReadings.forEach((r) => {
            const sk = getSlotKey(r, unitConfig);
            if (sk && !rowsBySlot[sk]) {
              rowsBySlot[sk] = r;
            } else if (!sk) {
              extraRows.push(r);
            }
          });

          const canonicalReadings = unitConfig.slotKeys.map((sk) => {
            const existingRow = rowsBySlot[sk] || {};
            const rowOut = {
              id: unitConfig.slotMeta[sk].id,
              time: unitConfig.slotMeta[sk].time,
            };
            unitConfig.fields.forEach((f) => {
              rowOut[f] = existingRow[f] !== undefined && existingRow[f] !== null ? String(existingRow[f]).trim() : '';
            });
            return rowOut;
          });

          const readings = [...canonicalReadings, ...extraRows];

          return res.status(200).json({
            success: true,
            recordId: doc._id,
            lockedSlots,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              unit: unitConfig.normalizedUnit,
              readings,
              lockedSlots,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: 'disabled',
              emailRecipient: null,
            },
          });
        }

        return res.status(200).json({
          success: true,
          data: null,
          message: `No record found for date ${date} and unit ${unitConfig.normalizedUnit}`,
        });
      }

      // List query
      const query = {
        analysisType: { $in: ANALYSIS_TYPES },
        plantCode: { $in: PLANT_CODES },
        unit: unitConfig.normalizedUnit,
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      const results = (docs || []).map((d) => ({
        ...d.data,
        _id: d._id,
        id: d._id,
        date: d.date,
        unit: d.unit,
        emailStatus: 'disabled',
        emailRecipient: null,
      }));

      return res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      console.error('[CoolingWater GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving Cooling Water records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Save Cooling Water Analysis data (Supports Cooling Water & Cooling Water 200#)
   * @route   POST /api/cooling-water-analysis
   * @access  Private (Admins only)
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Cooling Water Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};
      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Cooling Water Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Cooling Water Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const unitConfig = getUnitConfig(payload.unit);
      const readings = Array.isArray(payload.readings) ? payload.readings : [];
      if (readings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      // Numeric validations (excluding free-text fields like ammn)
      const errors = [];
      readings.forEach((reading, idx) => {
        const rowNum = idx + 1;
        unitConfig.numericFields.forEach((f) => {
          const val = reading[f];
          if (val !== '' && val !== null && val !== undefined) {
            if (isNaN(Number(val))) {
              errors.push(`Row #${rowNum} (${reading.time || ''}): ${f.toUpperCase()} must be a valid number.`);
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

      // Prevent duplicate sampling times
      const timeSlots = readings.map((r) => String(r.time || '').trim()).filter(Boolean);
      const uniqueSlots = new Set(timeSlots);
      if (timeSlots.length !== uniqueSlots.size) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate sampling time slots detected. Each observation must have a unique time slot.',
        });
      }

      const companyVal = req.user?.company?._id || req.user?.company || null;
      const query = {
        date: payload.date,
        analysisType: { $in: ANALYSIS_TYPES },
        plantCode: { $in: PLANT_CODES },
        unit: unitConfig.normalizedUnit,
      };
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const matchingDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(matchingDocs);

      const currentLocks = deriveCoolingWaterLocks(existingDoc, unitConfig);
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
        const sk = getSlotKey(r, unitConfig);
        if (sk && !existingSlots[sk]) {
          existingSlots[sk] = cleanRow(r, unitConfig.fields);
        } else if (!sk) {
          extraLegacyRows.push(r);
        }
      });
      unitConfig.slotKeys.forEach((sk) => {
        if (!existingSlots[sk]) {
          existingSlots[sk] = cleanRow({}, unitConfig.fields);
        }
      });

      const incomingSlots = {};
      readings.forEach((r) => {
        const sk = getSlotKey(r, unitConfig);
        if (sk && !incomingSlots[sk]) {
          incomingSlots[sk] = cleanRow(r, unitConfig.fields);
        }
      });
      unitConfig.slotKeys.forEach((sk) => {
        if (!incomingSlots[sk]) {
          incomingSlots[sk] = cleanRow({}, unitConfig.fields);
        }
      });

      const changedSlots = [];
      unitConfig.slotKeys.forEach((sk) => {
        const oldRow = existingSlots[sk];
        const newRow = incomingSlots[sk];
        const isDiff = unitConfig.fields.some((f) => isValueDifferent(oldRow[f], newRow[f]));
        if (isDiff) {
          changedSlots.push(sk);
        }
      });

      let targetSlot = payload.targetSlot ? String(payload.targetSlot).trim().toLowerCase() : null;
      if (targetSlot && !unitConfig.slotKeys.includes(targetSlot)) {
        return res.status(400).json({
          success: false,
          message: `Invalid targetSlot '${targetSlot}'. Valid slots are: ${unitConfig.slotKeys.join(', ')}`,
        });
      }

      if (changedSlots.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Only one slot can be saved per submission.',
        });
      }

      if (!targetSlot) {
        if (changedSlots.length === 1) {
          targetSlot = changedSlots[0];
        } else {
          targetSlot = unitConfig.slotKeys.find((sk) => !currentLockedSlots[sk]?.isSaved) || unitConfig.slotKeys[0];
        }
      }

      const targetIncomingRow = incomingSlots[targetSlot] || cleanRow({}, unitConfig.fields);
      if (!currentLockedSlots[targetSlot]?.isSaved && isUnitEmpty(targetIncomingRow, unitConfig.fields)) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty slot ${targetSlot}. At least one non-empty value is required.`,
        });
      }

      const incomingShiftRows = {};
      unitConfig.slotKeys.forEach((sk) => {
        if (sk === targetSlot) {
          incomingShiftRows[sk] = incomingSlots[sk];
        } else {
          incomingShiftRows[sk] = existingSlots[sk];
        }
      });

      const transition = computeSlotTransition({
        unitsOrder: unitConfig.slotKeys,
        lockedSlots: currentLockedSlots,
        storedRows: existingSlots,
        incomingRows: incomingShiftRows,
        now,
      });

      if (transition.noChange) {
        const currentReadings = unitConfig.slotKeys.map((sk) => ({
          id: unitConfig.slotMeta[sk].id,
          time: unitConfig.slotMeta[sk].time,
          ...existingSlots[sk],
        }));
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          recordId: existingDoc?._id || null,
          lockedSlots: currentLockedSlots,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          data: {
            ...existingData,
            _id: existingDoc?._id || null,
            id: existingDoc?._id || null,
            date: payload.date,
            unit: unitConfig.normalizedUnit,
            readings: [...currentReadings, ...extraLegacyRows],
            lockedSlots: currentLockedSlots,
            editedFields: existingData.editedFields || {},
            editAuditHistory: existingData.editAuditHistory || [],
            emailStatus: 'disabled',
            emailRecipient: null,
          },
        });
      }

      if (!transition.ok) {
        return res.status(transition.status || 400).json({
          success: false,
          message: transition.message,
        });
      }

      const isCorrection = transition.isCorrection;
      const updatedLockedSlots = { ...currentLockedSlots };

      if (!currentLockedSlots[targetSlot]?.isSaved) {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        const targetIdx = unitConfig.slotKeys.indexOf(targetSlot);
        for (let i = 0; i < targetIdx; i++) {
          const prevSlot = unitConfig.slotKeys[i];
          if (updatedLockedSlots[prevSlot]) {
            updatedLockedSlots[prevSlot] = {
              ...updatedLockedSlots[prevSlot],
              isLocked: true,
            };
          }
        }
        if (targetIdx === unitConfig.slotKeys.length - 1) {
          // Last slot stays open for 1 correction
        }
      } else if (isCorrection) {
        updatedLockedSlots[targetSlot] = {
          ...updatedLockedSlots[targetSlot],
          isLocked: true,
          correctionUsed: true,
        };
      }

      const updatedEditedFields = { ...(existingData.editedFields || {}) };
      const updatedAuditHistory = Array.isArray(existingData.editAuditHistory)
        ? [...existingData.editAuditHistory]
        : [];

      const editorName = req.user?.name || payload.submittedBy || 'Authorized Admin';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();

      if (isCorrection) {
        const rowId = unitConfig.slotMeta[targetSlot].id;
        const timeVal = unitConfig.slotMeta[targetSlot].time;
        const shiftLabel = unitConfig.shiftLabel;
        const targetExisting = existingSlots[targetSlot] || {};
        const targetIncoming = incomingSlots[targetSlot] || {};

        unitConfig.fields.forEach((f) => {
          const ov = targetExisting[f];
          const nv = targetIncoming[f];
          if (isValueDifferent(ov, nv)) {
            updatedEditedFields[`${rowId}_${f}`] = true;
            updatedEditedFields[`${timeVal}_${f}`] = true;
            updatedAuditHistory.push({
              date: payload.date,
              rowId,
              shift: shiftLabel,
              time: timeVal,
              field: f,
              oldValue: ov !== undefined && ov !== null ? String(ov) : '',
              newValue: nv !== undefined && nv !== null ? String(nv) : '',
              editedBy: editorName,
              editedById: editorId,
              timestamp: nowIso,
            });
          }
        });
      }

      const updatedReadings = unitConfig.slotKeys.map((sk) => {
        const row = sk === targetSlot ? incomingSlots[sk] : existingSlots[sk];
        return {
          id: unitConfig.slotMeta[sk].id,
          time: unitConfig.slotMeta[sk].time,
          ...row,
        };
      });

      const finalReadings = [...updatedReadings, ...extraLegacyRows];

      const recordData = {
        ...(existingData || {}),
        id: existingData.id || existingDoc?._id || `cw_${Date.now()}`,
        date: payload.date,
        plant: 'OFFSET',
        plantCode: CANONICAL_PLANT_CODE,
        plantName: CANONICAL_PLANT_NAME,
        unit: unitConfig.normalizedUnit,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        readings: finalReadings,
        lockedSlots: updatedLockedSlots,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        submittedBy: editorName,
        submittedById: editorId,
        submittedAt: nowIso,
        company: companyVal,
      };

      delete recordData.lockedShifts;
      delete recordData.initialSaved;
      delete recordData.editCount;
      delete recordData.isLocked;

      let savedDoc = null;

      if (existingDoc && existingDoc._id) {
        const atomicFilter = {
          _id: existingDoc._id,
        };

        if (isCorrection) {
          atomicFilter.$or = [
            {
              [`data.lockedSlots.${targetSlot}.isSaved`]: true,
              [`data.lockedSlots.${targetSlot}.correctionUsed`]: false,
              [`data.lockedSlots.${targetSlot}.isLocked`]: false,
            },
            {
              [`data.lockedSlots.${targetSlot}`]: { $exists: false },
            },
          ];
        } else {
          atomicFilter.$or = [
            { [`data.lockedSlots.${targetSlot}.isSaved`]: { $ne: true } },
            { [`data.lockedSlots.${targetSlot}`]: { $exists: false } },
          ];
        }

        const updateResult = await PlantAnalysisRecord.updateOne(
          atomicFilter,
          {
            $set: {
              data: recordData,
              updatedAt: now,
              submittedBy: editorName,
              submittedById: editorId,
              company: companyVal,
            },
          }
        );

        if (updateResult.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: This shift was locked or updated concurrently by another user.',
          });
        }

        savedDoc = await PlantAnalysisRecord.findById(existingDoc._id).lean();
      } else {
        try {
          const created = await PlantAnalysisRecord.create({
            plantName: CANONICAL_PLANT_NAME,
            plantCode: CANONICAL_PLANT_CODE,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: unitConfig.normalizedUnit,
            date: payload.date,
            shift: unitConfig.is200 ? '200#' : '',
            data: recordData,
            submittedBy: editorName,
            submittedById: editorId,
            company: companyVal,
          });
          savedDoc = created.toObject ? created.toObject() : created;
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
        message: 'Cooling Water Analysis saved successfully in MongoDB ✓',
        recordId: savedDoc._id,
        emailStatus: 'disabled',
        emailRecipient: null,
        emailSent: false,
        emailPending: false,
        lockedSlots: updatedLockedSlots,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        data: {
          ...recordData,
          _id: savedDoc._id,
          id: savedDoc._id,
        },
      });
    } catch (error) {
      console.error('Error in POST /api/cooling-water-analysis:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing Cooling Water analysis: ' + error.message,
      });
    }
  });

  /**
   * @desc    Retry email notification stub
   * @route   POST /api/cooling-water-analysis/:id/retry-email
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
}

const defaultRouter = createCoolingWaterRouter();
defaultRouter.createRouter = createCoolingWaterRouter;
module.exports = defaultRouter;
