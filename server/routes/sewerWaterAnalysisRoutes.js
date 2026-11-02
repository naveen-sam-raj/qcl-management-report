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
const CANONICAL_ANALYSIS_TYPE = 'Sewer Water Analysis';
const ANALYSIS_TYPES = ['Sewer Water Analysis'];
const CANONICAL_UNIT = 'Sewer Water';

const SLOT_KEYS = ['t11', 't13', 't15', 't17', 't19', 't21'];

const SLOT_META = {
  t11: { id: 't11', time: '11:00', label: '11:00' },
  t13: { id: 't13', time: '13:00', label: '13:00' },
  t15: { id: 't15', time: '15:00', label: '15:00' },
  t17: { id: 't17', time: '17:00', label: '17:00' },
  t19: { id: 't19', time: '19:00', label: '19:00' },
  t21: { id: 't21', time: '21:00', label: '21:00' },
};

const TIME_TO_SLOT = {
  '11:00': 't11',
  '13:00': 't13',
  '15:00': 't15',
  '17:00': 't17',
  '19:00': 't19',
  '21:00': 't21',
};

const SEWER_PARAMS = [
  ['sec200', 'fnh3'],
  ['sec200', 'cnh3'],
  ['sec400', 'fnh3'],
  ['sec400', 'cnh3'],
  ['sec400', 'hco3'],
  ['finalOutlet', 'fnh3'],
  ['finalOutlet', 'cnh3'],
  ['finalOutlet', 'hco3'],
  ['finalOutlet', 'pcl'],
];

const DEFAULT_READINGS_TEMPLATE = [
  { id: 't11', time: '11:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't13', time: '13:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't15', time: '15:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't17', time: '17:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't19', time: '19:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't21', time: '21:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
];

function getSlotKey(row) {
  if (!row || typeof row !== 'object') return null;
  const idStr = String(row.id || '').trim().toLowerCase();
  if (SLOT_KEYS.includes(idStr)) return idStr;
  const timeStr = String(row.time || '').trim();
  if (TIME_TO_SLOT[timeStr]) return TIME_TO_SLOT[timeStr];
  return null;
}

function cleanRow(row) {
  const cleaned = {
    sec200: { fnh3: '', cnh3: '' },
    sec400: { fnh3: '', cnh3: '', hco3: '' },
    finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' },
  };
  if (!row || typeof row !== 'object') return cleaned;

  SEWER_PARAMS.forEach(([sec, key]) => {
    const val = row[sec]?.[key];
    cleaned[sec][key] = val !== undefined && val !== null ? String(val).trim() : '';
  });
  return cleaned;
}

function flattenRow(row) {
  const flat = {};
  SEWER_PARAMS.forEach(([sec, key]) => {
    const val = row?.[sec]?.[key];
    flat[`${sec}_${key}`] = val !== undefined && val !== null ? String(val).trim() : '';
  });
  return flat;
}

function isUnitEmpty(row) {
  if (!row || typeof row !== 'object') return true;
  return SEWER_PARAMS.every(([sec, key]) => {
    const val = row[sec]?.[key];
    return val === undefined || val === null || String(val).trim() === '';
  });
}

function deriveSewerWaterLocks(existingDoc) {
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
    const sk = getSlotKey(r);
    if (sk && !rowsBySlot[sk]) {
      rowsBySlot[sk] = r;
    }
  });

  const slotSavedMap = {};
  const slotCorrMap = {};

  SLOT_KEYS.forEach((sk) => {
    const r = rowsBySlot[sk];
    const hasData = r && !isUnitEmpty(r);
    const sSlot = storedSlots[sk] || {};
    const legacyEdits = sSlot.editCount || 0;
    const legacyLocked = Boolean(sSlot.isLocked || legacyEdits >= 1);
    const isSaved = Boolean(sSlot.isSaved || sSlot.initialSaved || hasData);
    const corrUsed = Boolean(sSlot.correctionUsed || legacyEdits >= 1 || (legacyLocked && isSaved));
    slotSavedMap[sk] = isSaved;
    slotCorrMap[sk] = corrUsed;
  });

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

  return { lockedSlots };
}

function createSewerWaterRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  /**
   * @desc    Get Sewer Water Analysis data
   * @route   GET /api/sewer-water-analysis
   * @access  Private (Admin only)
   */
  router.get('/', async (req, res) => {
    try {
      const { date, startDate, endDate } = req.query;

      if (date) {
        if (req.user?.role === 'user') {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Sewer Water Analysis data access is restricted to authorized Admins.',
          });
        }

        const companyVal = req.user?.company?._id || req.user?.company || null;
        const query = {
          date,
          analysisType: { $in: ANALYSIS_TYPES },
          plantCode: { $in: PLANT_CODES },
        };
        if (companyVal) {
          query.$or = [{ company: companyVal }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc && doc.data) {
          const payloadData = doc.data;
          const { lockedSlots } = deriveSewerWaterLocks(doc);
          const rawReadings = Array.isArray(payloadData.readings)
            ? payloadData.readings
            : Array.isArray(payloadData.shifts)
              ? payloadData.shifts
              : Array.isArray(payloadData.rows)
                ? payloadData.rows
                : [];

          const readingsMap = {};
          rawReadings.forEach((r) => {
            const sk = getSlotKey(r);
            if (sk && !readingsMap[sk]) {
              readingsMap[sk] = cleanRow(r);
            }
          });

          const canonicalReadings = SLOT_KEYS.map((sk) => {
            const rowData = readingsMap[sk] || cleanRow({});
            return {
              id: SLOT_META[sk].id,
              time: SLOT_META[sk].time,
              sec200: rowData.sec200,
              sec400: rowData.sec400,
              finalOutlet: rowData.finalOutlet,
            };
          });

          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: null,
            emailStatus: 'disabled',
            assignedOperatorEmail: null,
            readings: canonicalReadings,
            lockedSlots,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              readings: canonicalReadings,
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
          assignedOperatorEmail: null,
          data: null,
          message: `No record found for date ${date}`,
        });
      }

      // List query
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Sewer Water Analysis data access is restricted to authorized Admins.',
        });
      }

      const query = {
        analysisType: { $in: ANALYSIS_TYPES },
        plantCode: { $in: PLANT_CODES },
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (req.user && req.user.company) {
        const companyVal = req.user.company._id || req.user.company;
        query.$or = [{ company: companyVal }, { company: null }];
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
      console.error('[SewerWater GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving Sewer Water records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Save Sewer Water Analysis data
   * @route   POST /api/sewer-water-analysis
   * @access  Private (Admin only)
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Sewer Water Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Sewer Water Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Sewer Water Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const readings = Array.isArray(payload.readings) ? payload.readings : [];
      if (readings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      const errors = [];
      readings.forEach((reading, idx) => {
        const rowNum = idx + 1;
        SEWER_PARAMS.forEach(([sec, key]) => {
          const val = reading[sec]?.[key];
          if (val !== '' && val !== null && val !== undefined) {
            if (key === 'pcl') {
              const isNil = ['nil', 'n', 'ni', 'none', '-'].includes(String(val).toLowerCase().trim());
              if (!isNil && isNaN(Number(val))) {
                errors.push(`Row #${rowNum} (${reading.time || ''}) [${sec}.${key}]: must be a valid number or 'NIL'.`);
              }
            } else if (isNaN(Number(val))) {
              errors.push(`Row #${rowNum} (${reading.time || ''}) [${sec}.${key}]: must be a valid number.`);
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

      // Prevent duplicate time slots within submission
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
      };
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const matchingDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};

      const currentLocks = deriveSewerWaterLocks(existingDoc);
      const currentLockedSlots = currentLocks.lockedSlots;

      // Extract existing nested rows by slot key
      const existingReadings = Array.isArray(existingData.readings)
        ? existingData.readings
        : Array.isArray(existingData.shifts)
          ? existingData.shifts
          : Array.isArray(existingData.rows)
            ? existingData.rows
            : [];

      const existingSlots = {};
      const existingFlatSlots = {};
      SLOT_KEYS.forEach((sk) => {
        existingSlots[sk] = cleanRow({});
        existingFlatSlots[sk] = flattenRow(existingSlots[sk]);
      });
      existingReadings.forEach((r) => {
        const sk = getSlotKey(r);
        if (sk) {
          existingSlots[sk] = cleanRow(r);
          existingFlatSlots[sk] = flattenRow(existingSlots[sk]);
        }
      });

      // Extract incoming nested rows only for slots present in payload.readings
      const incomingSlots = {};
      const incomingFlatSlots = {};
      readings.forEach((r) => {
        const sk = getSlotKey(r);
        if (sk) {
          incomingSlots[sk] = cleanRow(r);
          incomingFlatSlots[sk] = flattenRow(incomingSlots[sk]);
        }
      });

      // Detect changed slots among provided rows
      const changedSlots = [];
      SLOT_KEYS.forEach((sk) => {
        if (incomingFlatSlots[sk] !== undefined) {
          const exFlat = existingFlatSlots[sk] || {};
          const incFlat = incomingFlatSlots[sk];
          if (SEWER_PARAMS.some(([sec, key]) => isValueDifferent(exFlat[`${sec}_${key}`], incFlat[`${sec}_${key}`]))) {
            changedSlots.push(sk);
          }
        }
      });

      let targetSlot = payload.targetSlot ? String(payload.targetSlot).trim().toLowerCase() : null;
      if (targetSlot && !SLOT_KEYS.includes(targetSlot)) {
        return res.status(400).json({
          success: false,
          message: `Invalid targetSlot '${targetSlot}'. Valid slots are: ${SLOT_KEYS.join(', ')}`,
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
          // If no changes, find the first unsaved slot, or first slot
          targetSlot = SLOT_KEYS.find((sk) => !currentLockedSlots[sk]?.isSaved) || SLOT_KEYS[0];
        }
      }

      // Check empty slot on first save
      const targetIncomingRow = incomingSlots[targetSlot] || cleanRow({});
      if (!currentLockedSlots[targetSlot]?.isSaved && isUnitEmpty(targetIncomingRow)) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty slot ${targetSlot}. At least one non-empty value is required.`,
        });
      }

      // Prepare incomingShiftRows for computeSlotTransition:
      // only targetSlot gets incoming flat data; other slots retain existing flat data
      const incomingShiftRows = {};
      for (const u of SLOT_KEYS) {
        if (u === targetSlot) {
          incomingShiftRows[u] = incomingFlatSlots[u] || {};
        } else if (existingFlatSlots[u] !== undefined) {
          incomingShiftRows[u] = existingFlatSlots[u];
        }
      }

      // Compute sequential transition via Universal Lock Engine
      const transition = computeSlotTransition({
        unitsOrder: SLOT_KEYS,
        lockedSlots: currentLockedSlots,
        storedRows: existingFlatSlots,
        incomingRows: incomingShiftRows,
        now,
      });

      const canonicalReadingsTemplate = SLOT_KEYS.map((sk) => {
        const ex = existingSlots[sk] || cleanRow({});
        return {
          id: SLOT_META[sk].id,
          time: SLOT_META[sk].time,
          sec200: ex.sec200,
          sec400: ex.sec400,
          finalOutlet: ex.finalOutlet,
        };
      });

      if (transition.noChange) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          readings: canonicalReadingsTemplate,
          lockedSlots: currentLockedSlots,
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

      const isCorrection = transition.isCorrection;
      const targetIdx = SLOT_KEYS.indexOf(targetSlot);
      const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();

      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (!isCorrection) {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        for (let p = 0; p < targetIdx; p++) {
          updatedLockedSlots[SLOT_KEYS[p]].isLocked = true;
        }
      } else {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: true,
          correctionUsed: true,
        };
      }

      // Field-level flat edit audit on corrections
      const updatedEditedFields = { ...(existingData.editedFields || {}) };
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        const rowId = SLOT_META[targetSlot].id;
        const timeVal = SLOT_META[targetSlot].time;
        const shiftLabel = 'Day';
        const targetExistingFlat = existingFlatSlots[targetSlot] || {};
        const targetIncomingFlat = incomingFlatSlots[targetSlot] || {};

        SEWER_PARAMS.forEach(([sec, key]) => {
          const fieldKey = `${sec}_${key}`;
          const ov = targetExistingFlat[fieldKey];
          const nv = targetIncomingFlat[fieldKey];
          if (isValueDifferent(ov, nv)) {
            updatedEditedFields[`${rowId}_${fieldKey}`] = true;
            updatedEditedFields[`${timeVal}_${fieldKey}`] = true;
            updatedAuditHistory.push({
              date: payload.date,
              rowId,
              shift: shiftLabel,
              time: timeVal,
              field: fieldKey,
              oldValue: ov !== undefined && ov !== null ? String(ov) : '',
              newValue: nv !== undefined && nv !== null ? String(nv) : '',
              editedBy: editorName,
              editedById: editorId,
              timestamp: nowIso,
            });
          }
        });
      }

      // Build updated readings in visual order preserving nested shape
      const updatedReadings = SLOT_KEYS.map((sk) => {
        const row = sk === targetSlot ? incomingSlots[sk] : existingSlots[sk];
        return {
          id: SLOT_META[sk].id,
          time: SLOT_META[sk].time,
          sec200: row.sec200,
          sec400: row.sec400,
          finalOutlet: row.finalOutlet,
        };
      });

      const recordData = {
        id: existingDoc ? String(existingDoc._id) : `sewer_${Date.now()}`,
        date: payload.date,
        plant: 'OFFSET',
        plantCode: CANONICAL_PLANT_CODE,
        plantName: CANONICAL_PLANT_NAME,
        unit: CANONICAL_UNIT,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        readings: updatedReadings,
        lockedSlots: updatedLockedSlots,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        submittedBy: editorName,
        submittedById: editorId,
        submittedAt: nowIso,
        company: companyVal,
      };

      const docUpdatePayload = {
        plantName: CANONICAL_PLANT_NAME,
        plantCode: CANONICAL_PLANT_CODE,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        unit: CANONICAL_UNIT,
        date: payload.date,
        shift: 'Day',
        data: recordData,
        submittedBy: editorName,
        submittedById: editorId,
        company: companyVal,
        savedAt: now,
        emailStatus: 'disabled',
        emailRecipient: null,
      };

      let savedDoc = null;
      if (existingDoc?._id) {
        const updateFilter = {
          _id: existingDoc._id,
          ...(isCorrection
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
                  [`data.lockedSlots`]: { $exists: false },
                  'data.isLocked': { $ne: true },
                  'data.editCount': { $not: { $gte: 1 } },
                },
              ],
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
            plantName: CANONICAL_PLANT_NAME,
            plantCode: CANONICAL_PLANT_CODE,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: CANONICAL_UNIT,
            date: payload.date,
            shift: 'Day',
            data: recordData,
            submittedBy: editorName,
            submittedById: editorId,
            company: companyVal,
            savedAt: now,
            emailStatus: 'disabled',
            emailRecipient: null,
          };
          savedDoc = await PlantAnalysisRecord.create(insertDoc);
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

      recordData.id = String(savedDoc._id);
      recordData._id = savedDoc._id;

      return res.status(200).json({
        success: true,
        message: 'Sewer Water Analysis saved successfully in MongoDB ✓',
        recordId: savedDoc._id,
        emailStatus: 'disabled',
        emailRecipient: null,
        emailSent: false,
        emailPending: false,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        readings: updatedReadings,
        lockedSlots: updatedLockedSlots,
        data: recordData,
      });
    } catch (error) {
      console.error('[SewerWater POST] Uncaught error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing Sewer Water analysis: ' + error.message,
      });
    }
  });

  /**
   * @desc    Retry email notification for Sewer Water Analysis
   * @route   POST /api/sewer-water-analysis/:id/retry-email
   * @access  Private (Admin only)
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

const defaultRouter = createSewerWaterRouter();
defaultRouter.createRouter = createSewerWaterRouter;
module.exports = defaultRouter;
