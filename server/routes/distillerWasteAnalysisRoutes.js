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
const CANONICAL_ANALYSIS_TYPE = 'Distiller Waste Analysis';
const ANALYSIS_TYPES = ['Distiller Waste Analysis'];
const CANONICAL_UNIT = 'Distiller waste';

const SLOT_KEYS = ['t0630', 't0730', 't0830', 't0930', 't1030', 't1130'];

const SLOT_META = {
  t0630: { id: 't0630', time: '06:30', label: '06:30' },
  t0730: { id: 't0730', time: '07:30', label: '07:30' },
  t0830: { id: 't0830', time: '08:30', label: '08:30' },
  t0930: { id: 't0930', time: '09:30', label: '09:30' },
  t1030: { id: 't1030', time: '10:30', label: '10:30' },
  t1130: { id: 't1130', time: '11:30', label: '11:30' },
};

const TIME_TO_SLOT = {
  '06:30': 't0630',
  '07:30': 't0730',
  '08:30': 't0830',
  '09:30': 't0930',
  '10:30': 't1030',
  '11:30': 't1130',
};

const NUMERIC_FIELDS = ['exCao', 'fnh3', 'cnh3', 'tnh3', 'nahco3'];

const DEFAULT_READINGS_TEMPLATE = [
  { id: 't0630', time: '06:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0730', time: '07:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0830', time: '08:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0930', time: '09:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't1030', time: '10:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't1130', time: '11:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
];

function getSlotKey(row) {
  if (!row || typeof row !== 'object') return null;
  const idStr = String(row.id || '').trim().toLowerCase();
  if (SLOT_KEYS.includes(idStr)) return idStr;
  const timeStr = String(row.time || '').trim();
  if (TIME_TO_SLOT[timeStr]) return TIME_TO_SLOT[timeStr];
  return null;
}

function isUnitEmpty(row) {
  if (!row || typeof row !== 'object') return true;
  return NUMERIC_FIELDS.every((f) => {
    const val = row[f];
    return val === undefined || val === null || String(val).trim() === '';
  });
}

function cleanRow(row) {
  const cleaned = {};
  NUMERIC_FIELDS.forEach((f) => {
    const val = row?.[f];
    cleaned[f] = val !== undefined && val !== null ? String(val).trim() : '';
  });
  return cleaned;
}

function deriveDistillerWasteLocks(existingDoc) {
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
      lockedSlots[sk] = {
        isSaved: Boolean(storedSlots[sk].isSaved || storedSlots[sk].initialSaved),
        isLocked: Boolean(storedSlots[sk].isLocked),
        correctionUsed: Boolean(storedSlots[sk].correctionUsed),
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

function createDistillerWasteRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  /**
   * @desc    Get Distiller Waste Analysis data
   * @route   GET /api/distiller-waste-analysis
   * @access  Private (Admin only)
   */
  router.get('/', async (req, res) => {
    try {
      const { date, startDate, endDate } = req.query;

      if (date) {
        if (req.user?.role === 'user') {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Distiller Waste Analysis data access is restricted to authorized Admins.',
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
          const { lockedSlots } = deriveDistillerWasteLocks(doc);
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
            const rowData = readingsMap[sk] || {};
            return {
              id: SLOT_META[sk].id,
              time: SLOT_META[sk].time,
              exCao: rowData.exCao || '',
              fnh3: rowData.fnh3 || '',
              cnh3: rowData.cnh3 || '',
              tnh3: rowData.tnh3 || '',
              nahco3: rowData.nahco3 || '',
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
          message: 'Forbidden: Distiller Waste Analysis data access is restricted to authorized Admins.',
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
      console.error('[DistillerWaste GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving Distiller Waste records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Save Distiller Waste Analysis data
   * @route   POST /api/distiller-waste-analysis
   * @access  Private (Admin only)
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Distiller Waste Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Distiller Waste Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Distiller Waste Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
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
        NUMERIC_FIELDS.forEach((f) => {
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

      const currentLocks = deriveDistillerWasteLocks(existingDoc);
      const currentLockedSlots = currentLocks.lockedSlots;

      // Extract existing rows by slot key
      const existingReadings = Array.isArray(existingData.readings)
        ? existingData.readings
        : Array.isArray(existingData.shifts)
          ? existingData.shifts
          : Array.isArray(existingData.rows)
            ? existingData.rows
            : [];

      const existingSlots = {};
      SLOT_KEYS.forEach((sk) => {
        existingSlots[sk] = {};
      });
      existingReadings.forEach((r) => {
        const sk = getSlotKey(r);
        if (sk) {
          existingSlots[sk] = cleanRow(r);
        }
      });

      // Extract incoming rows only for slots present in payload.readings
      const incomingSlots = {};
      readings.forEach((r) => {
        const sk = getSlotKey(r);
        if (sk) {
          incomingSlots[sk] = cleanRow(r);
        }
      });

      // Detect changed slots among provided rows
      const changedSlots = [];
      SLOT_KEYS.forEach((sk) => {
        if (incomingSlots[sk] !== undefined) {
          const ex = existingSlots[sk] || {};
          const inc = incomingSlots[sk];
          if (NUMERIC_FIELDS.some((f) => isValueDifferent(ex[f], inc[f]))) {
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
      const targetIncomingRow = incomingSlots[targetSlot] || {};
      if (!currentLockedSlots[targetSlot]?.isSaved && isUnitEmpty(targetIncomingRow)) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty slot ${targetSlot}. At least one non-empty value is required.`,
        });
      }

      // Prepare incomingShiftRows for computeSlotTransition:
      // only targetSlot gets the incoming data; other slots retain existing data to prevent multi-slot mutation
      const incomingShiftRows = {};
      for (const u of SLOT_KEYS) {
        if (u === targetSlot) {
          incomingShiftRows[u] = incomingSlots[u] || {};
        } else if (existingSlots[u] !== undefined) {
          incomingShiftRows[u] = existingSlots[u];
        }
      }

      // Compute sequential transition via Universal Lock Engine
      const transition = computeSlotTransition({
        unitsOrder: SLOT_KEYS,
        lockedSlots: currentLockedSlots,
        storedRows: existingSlots,
        incomingRows: incomingShiftRows,
        now,
      });

      const canonicalReadingsTemplate = SLOT_KEYS.map((sk) => {
        const ex = existingSlots[sk] || {};
        return {
          id: SLOT_META[sk].id,
          time: SLOT_META[sk].time,
          exCao: ex.exCao || '',
          fnh3: ex.fnh3 || '',
          cnh3: ex.cnh3 || '',
          tnh3: ex.tnh3 || '',
          nahco3: ex.nahco3 || '',
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
        const shiftLabel = '1 Hour Once';
        const targetExisting = existingSlots[targetSlot] || {};
        const targetIncoming = incomingSlots[targetSlot] || {};

        NUMERIC_FIELDS.forEach((f) => {
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

      // Build updated readings in visual order
      const updatedReadings = SLOT_KEYS.map((sk) => {
        const row = sk === targetSlot ? incomingSlots[sk] : existingSlots[sk];
        return {
          id: SLOT_META[sk].id,
          time: SLOT_META[sk].time,
          exCao: row?.exCao || '',
          fnh3: row?.fnh3 || '',
          cnh3: row?.cnh3 || '',
          tnh3: row?.tnh3 || '',
          nahco3: row?.nahco3 || '',
        };
      });

      const recordData = {
        id: existingDoc ? String(existingDoc._id) : `distiller_${Date.now()}`,
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
        shift: '1 Hour Once',
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
            shift: '1 Hour Once',
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
        message: 'Distiller Waste Analysis saved successfully in MongoDB ✓',
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
      console.error('[DistillerWaste POST] Uncaught error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing Distiller Waste analysis: ' + error.message,
      });
    }
  });

  /**
   * @desc    Retry email notification for Distiller Waste Analysis
   * @route   POST /api/distiller-waste-analysis/:id/retry-email
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

const defaultRouter = createDistillerWasteRouter();
defaultRouter.createRouter = createDistillerWasteRouter;
module.exports = defaultRouter;
