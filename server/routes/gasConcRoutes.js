const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { generateGasConcExcel } = require('../services/excelService');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');

const CANONICAL_ANALYSIS_TYPE = 'Gas Conc. Analysis';
const ANALYSIS_TYPES = [
  'Gas Conc. Analysis',
  'Gas Conc Analysis',
  'Gas Conc',
];
const PLANT_CODES = ['SA', 'SA Plant', 'SA PLANT'];
const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];

/**
 * Determines which shift a time slot belongs to:
 * - SHIFT 1: 06:00 to 13:59
 * - SHIFT 2: 14:00 to 21:59
 * - SHIFT 3: 22:00 to 05:59
 */
const getShiftFromTime = (timeStr) => {
  if (!timeStr) return 'shift1';
  const parts = String(timeStr).trim().split(':');
  const hour = parseInt(parts[0], 10);
  if (isNaN(hour)) return 'shift1';
  if (hour >= 6 && hour < 14) return 'shift1';
  if (hour >= 14 && hour < 22) return 'shift2';
  return 'shift3';
};

const SHIFT_DISPLAY_NAMES = {
  shift1: 'SHIFT 1 (06:00–14:00)',
  shift2: 'SHIFT 2 (14:00–22:00)',
  shift3: 'SHIFT 3 (22:00–06:00)',
};

const PARAM_DISPLAY_NAMES = {
  seal: 'SEAL (OK / NOT OK)',
  recoveryCo2Con: 'RECOVERY CO2 CON %',
  cleaningGas: 'CLEANING GAS %',
  bottomGas: 'BOTTOM GAS %',
};

function deriveGasConcLocks(doc) {
  const data = doc?.data || doc || {};
  const storedSlots = data.lockedSlots || {};
  const storedShifts = data.lockedShifts || {};

  const slots = {};
  for (const sk of SHIFT_KEYS) {
    if (storedSlots[sk]) {
      slots[sk] = {
        isSaved: Boolean(storedSlots[sk].isSaved),
        isLocked: Boolean(storedSlots[sk].isLocked),
        correctionUsed: Boolean(storedSlots[sk].correctionUsed),
      };
    } else {
      const isSaved = Boolean(storedShifts[`${sk}Saved`] || storedShifts[`s${sk.slice(5)}Saved`]);
      const isLocked = Boolean(storedShifts[`${sk}Locked`] || storedShifts[`s${sk.slice(5)}Locked`]);
      const edits = Number(storedShifts[`${sk}Edits`] || storedShifts[`s${sk.slice(5)}Edits`] || 0);
      slots[sk] = {
        isSaved,
        isLocked,
        correctionUsed: edits > 0 || (isSaved && isLocked),
      };
    }
  }

  // Sequential progression:
  if (!slots.shift1.isSaved) {
    slots.shift1.isLocked = false;
    slots.shift2.isLocked = true;
    slots.shift3.isLocked = true;
  } else {
    if (!slots.shift2.isSaved) {
      slots.shift2.isLocked = false;
      slots.shift3.isLocked = true;
    } else {
      slots.shift1.isLocked = true;
      if (!slots.shift3.isSaved) {
        slots.shift3.isLocked = false;
      } else {
        slots.shift2.isLocked = true;
      }
    }
  }

  const allPermanentlyLocked =
    slots.shift1.isLocked && slots.shift2.isLocked && slots.shift3.isLocked;

  const flatShifts = {
    shift1Saved: slots.shift1.isSaved,
    shift1Locked: slots.shift1.isLocked,
    shift1Edits: slots.shift1.correctionUsed ? 1 : 0,
    shift1: slots.shift1.isLocked,
    s1Saved: slots.shift1.isSaved,
    s1Locked: slots.shift1.isLocked,
    s1Edits: slots.shift1.correctionUsed ? 1 : 0,
    s1: slots.shift1.isLocked,

    shift2Saved: slots.shift2.isSaved,
    shift2Locked: slots.shift2.isLocked,
    shift2Edits: slots.shift2.correctionUsed ? 1 : 0,
    shift2: slots.shift2.isLocked,
    s2Saved: slots.shift2.isSaved,
    s2Locked: slots.shift2.isLocked,
    s2Edits: slots.shift2.correctionUsed ? 1 : 0,
    s2: slots.shift2.isLocked,

    shift3Saved: slots.shift3.isSaved,
    shift3Locked: slots.shift3.isLocked,
    shift3Edits: slots.shift3.correctionUsed ? 1 : 0,
    shift3: slots.shift3.isLocked,
    s3Saved: slots.shift3.isSaved,
    s3Locked: slots.shift3.isLocked,
    s3Edits: slots.shift3.correctionUsed ? 1 : 0,
    s3: slots.shift3.isLocked,

    allPermanentlyLocked,
  };

  return { lockedSlots: slots, lockedShifts: flatShifts };
}

function createGasConcRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  router.get('/', async (req, res) => {
    try {
      const { date } = req.query;

      let assignedOperatorEmail = null;
      try {
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (recipErr) {
        console.warn('[GasConc] Operator email resolution note:', recipErr.message);
        assignedOperatorEmail = null;
      }

      const defaultLocks = deriveGasConcLocks(null);

      if (date) {
        const companyVal = req.user?.company?._id || req.user?.company || null;
        const query = {
          date,
          plantCode: { $in: PLANT_CODES },
          analysisType: { $in: ANALYSIS_TYPES },
        };
        if (companyVal) {
          query.$or = [{ company: companyVal }, { company: null }];
        }

        let matchingDocs = [];
        try {
          if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
            matchingDocs = await PlantAnalysisRecord.find(query).lean();
          }
        } catch (e) {
          console.warn('[GasConc] Mongo lookup fallback:', e.message);
        }

        const doc = pickCanonicalDoc(matchingDocs);

        if (doc) {
          const payloadData = doc.data || {};
          const rows = Array.isArray(payloadData.rows) ? payloadData.rows : [];
          const { lockedSlots, lockedShifts } = deriveGasConcLocks(doc);
          const editedFields = payloadData.editedFields || {};
          const editAuditHistory = payloadData.editAuditHistory || [];

          return res.status(200).json({
            success: true,
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id.toString(),
              date: doc.date,
              plant: doc.plantCode || 'SA',
              unit: doc.unit || 'Gas Conc.',
              analysisType: doc.analysisType,
              rows,
              lockedSlots,
              lockedShifts,
              editedFields,
              editAuditHistory,
              assignedOperatorEmail,
              emailStatus: doc.emailStatus || 'disabled',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
              submittedBy: doc.submittedBy,
              submittedAt: doc.updatedAt || doc.createdAt,
            },
            record: doc,
            recordId: doc._id,
            rows,
            lockedSlots,
            lockedShifts,
            editedFields,
            editAuditHistory,
            assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'disabled',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
          });
        }

        return res.status(200).json({
          success: true,
          data: null,
          record: null,
          rows: [],
          lockedSlots: defaultLocks.lockedSlots,
          lockedShifts: defaultLocks.lockedShifts,
          editedFields: {},
          editAuditHistory: [],
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
        });
      }

      let mongoRecords = [];
      try {
        if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
          const query = {
            plantCode: { $in: PLANT_CODES },
            analysisType: { $in: ANALYSIS_TYPES },
          };
          mongoRecords = await PlantAnalysisRecord.find(query).sort({ date: -1, createdAt: -1 }).limit(30).lean();
        }
      } catch (e) {
        console.warn('[GasConc] Mongo lookup fallback:', e.message);
      }

      return res.status(200).json({
        success: true,
        count: mongoRecords.length,
        data: mongoRecords.map((r) => {
          const derived = deriveGasConcLocks(r);
          return {
            id: r._id,
            _id: r._id,
            date: r.date,
            plant: r.plantCode || 'SA',
            unit: r.unit || 'Gas Conc.',
            analysisType: r.analysisType,
            rows: r.data?.rows || [],
            lockedSlots: derived.lockedSlots,
            lockedShifts: derived.lockedShifts,
            editedFields: r.data?.editedFields || {},
            editAuditHistory: r.data?.editAuditHistory || [],
            submittedBy: r.submittedBy,
            submittedAt: r.createdAt || r.updatedAt,
            emailStatus: 'disabled',
            emailRecipient: r.emailRecipient || assignedOperatorEmail,
            assignedOperatorEmail,
          };
        }),
        assignedOperatorEmail,
      });
    } catch (error) {
      console.error('[GasConc] Error fetching data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while fetching Gas Conc. Analysis data.',
        error: error.message,
      });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Gas Conc. data entry and modification is restricted to Company Admins.',
        });
      }

      const payload = req.body;
      if (!payload || !payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Gas Conc. Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);
      const submissionDate = String(payload.date).trim();

      if (submissionDate !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Submissions are only permitted for the current operating date (${operatingDate}). Past and future dates cannot be submitted.`,
        });
      }

      const rawRows = Array.isArray(payload.rows)
        ? payload.rows
        : Array.isArray(payload.readings)
        ? payload.readings
        : [];
      if (rawRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one row of Gas Conc. readings is required.',
        });
      }

      const errors = [];
      let lastValidDate = submissionDate;
      const seenTimesByDate = new Map();

      const validatedRows = rawRows.map((r, idx) => {
        const rowNum = idx + 1;
        let rowDate = (r.date || '').trim();

        if (rowDate) {
          lastValidDate = rowDate;
        } else if (lastValidDate) {
          rowDate = lastValidDate;
        }

        const timeStr = (r.time || '').trim();
        if (!timeStr) {
          errors.push(`Row ${rowNum}: Time is required.`);
        } else {
          if (!seenTimesByDate.has(rowDate)) {
            seenTimesByDate.set(rowDate, new Set());
          }
          const timesSet = seenTimesByDate.get(rowDate);
          if (timesSet.has(timeStr)) {
            errors.push(`Duplicate time slot '${timeStr}' detected for date '${rowDate}'.`);
          }
          timesSet.add(timeStr);
        }

        const shiftKey = getShiftFromTime(timeStr);
        const shiftName =
          shiftKey === 'shift1' ? 'Shift 1' : shiftKey === 'shift2' ? 'Shift 2' : 'Shift 3';

        ['recoveryCo2Con', 'cleaningGas', 'bottomGas'].forEach((field) => {
          const val = r[field];
          if (val !== '' && val !== null && val !== undefined) {
            const num = Number(val);
            if (isNaN(num)) {
              errors.push(`Row ${rowNum}: ${field} must be a valid number.`);
            }
          }
        });

        let seal = (r.seal || '').trim().toUpperCase();
        if (seal && seal !== 'OK' && seal !== 'NOT OK') {
          errors.push(`Row ${rowNum}: SEAL must be either OK or NOT OK.`);
        }
        if (!seal) seal = 'NOT OK';

        return {
          id: r.id || `gc_${Date.now()}_${idx}`,
          date: r.date ? String(r.date).trim() : '',
          resolvedDate: rowDate,
          displayDate: r.displayDate || (r.date ? String(r.date).trim() : ''),
          time: timeStr,
          shift: shiftName,
          shiftKey,
          seal,
          recoveryCo2Con:
            r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined
              ? String(r.recoveryCo2Con)
              : '',
          cleaningGas:
            r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined
              ? String(r.cleaningGas)
              : '',
          bottomGas:
            r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined
              ? String(r.bottomGas)
              : '',
        };
      });

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: errors[0],
          errors,
        });
      }

      // Query canonical doc
      const companyVal = req.user?.company?._id || req.user?.company || null;
      const query = {
        date: submissionDate,
        plantCode: { $in: PLANT_CODES },
        analysisType: { $in: ANALYSIS_TYPES },
      };
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      let matchingDocs = [];
      try {
        if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
          matchingDocs = await PlantAnalysisRecord.find(query).lean();
        }
      } catch (e) {
        console.warn('[GasConc] MongoDB query warning:', e.message);
      }

      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};
      const existingRows = Array.isArray(existingData.rows) ? existingData.rows : [];

      const { lockedSlots: currentLockedSlots, lockedShifts: currentFlatLocks } =
        deriveGasConcLocks(existingDoc);

      // Group rows by shift
      const existingByShift = { shift1: [], shift2: [], shift3: [] };
      const existingExtraRows = [];
      existingRows.forEach((r) => {
        const sk = getShiftFromTime(r.time);
        if (existingByShift[sk]) {
          existingByShift[sk].push(r);
        } else {
          existingExtraRows.push(r);
        }
      });

      const incomingByShift = { shift1: [], shift2: [], shift3: [] };
      const incomingExtraRows = [];
      validatedRows.forEach((r) => {
        const sk = getShiftFromTime(r.time);
        if (incomingByShift[sk]) {
          incomingByShift[sk].push(r);
        } else {
          incomingExtraRows.push(r);
        }
      });

      // Saved row constraints: cannot delete or change time/date on saved rows
      for (const sk of SHIFT_KEYS) {
        if (currentLockedSlots[sk]?.isSaved) {
          const extRows = existingByShift[sk];
          const incRows = incomingByShift[sk];
          for (const er of extRows) {
            const ir = incRows.find((r) => r.id === er.id);
            if (!ir) {
              return res.status(400).json({
                success: false,
                message: `Cannot delete row '${er.id}' from saved shift ${sk}.`,
              });
            }
            if (String(ir.time).trim() !== String(er.time).trim()) {
              return res.status(400).json({
                success: false,
                message: `Sampling time cannot be modified on saved row (${er.id}).`,
              });
            }
            if (String(ir.date || '').trim() !== String(er.date || '').trim()) {
              return res.status(400).json({
                success: false,
                message: `Sampling date cannot be modified on saved row (${er.id}).`,
              });
            }
          }
        }
      }

      // Detect differences per shift
      const changedShifts = [];
      for (const sk of SHIFT_KEYS) {
        const extRows = existingByShift[sk];
        const incRows = incomingByShift[sk];

        let hasDiff = false;
        if (extRows.length !== incRows.length) {
          hasDiff = true;
        } else {
          for (const ir of incRows) {
            const er = extRows.find((r) => r.id === ir.id);
            if (!er) {
              hasDiff = true;
              break;
            }
            if (
              isValueDifferent(er.seal, ir.seal) ||
              isValueDifferent(er.recoveryCo2Con, ir.recoveryCo2Con) ||
              isValueDifferent(er.cleaningGas, ir.cleaningGas) ||
              isValueDifferent(er.bottomGas, ir.bottomGas)
            ) {
              hasDiff = true;
              break;
            }
          }
        }

        if (hasDiff) {
          changedShifts.push(sk);
        }
      }

      // Handle identical re-save
      if (changedShifts.length === 0) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          rows: existingRows,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentFlatLocks,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailSent: false,
        });
      }

      // Enforce single-shift save
      if (changedShifts.length > 1) {
        return res.status(400).json({
          success: false,
          message: `Only one shift can be entered or edited per save. Detected changes in: ${changedShifts.join(', ')}`,
        });
      }

      const targetShift = changedShifts[0];
      const incTargetRows = incomingByShift[targetShift] || [];

      // Empty shift check
      const isShiftEmpty =
        incTargetRows.length === 0 ||
        incTargetRows.every((r) => {
          const recEmpty = r.recoveryCo2Con === '' || r.recoveryCo2Con === null || r.recoveryCo2Con === undefined;
          const clnEmpty = r.cleaningGas === '' || r.cleaningGas === null || r.cleaningGas === undefined;
          const botEmpty = r.bottomGas === '' || r.bottomGas === null || r.bottomGas === undefined;
          return recEmpty && clnEmpty && botEmpty;
        });

      if (isShiftEmpty) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty shift ${targetShift}. At least one observation parameter value is required.`,
        });
      }

      // Prepare unit objects for computeSlotTransition
      const storedUnits = {};
      const incomingUnits = {};
      for (const sk of SHIFT_KEYS) {
        const eRows = existingByShift[sk] || [];
        const iRows = incomingByShift[sk] || [];

        storedUnits[sk] = {};
        eRows.forEach((r, idx) => {
          const prefix = r.id || `row_${idx}`;
          storedUnits[sk][`${prefix}_rec`] = r.recoveryCo2Con;
          storedUnits[sk][`${prefix}_cln`] = r.cleaningGas;
          storedUnits[sk][`${prefix}_bot`] = r.bottomGas;
          storedUnits[sk][`${prefix}_seal`] = r.seal;
        });

        incomingUnits[sk] = {};
        iRows.forEach((r, idx) => {
          const prefix = r.id || `row_${idx}`;
          incomingUnits[sk][`${prefix}_rec`] = r.recoveryCo2Con;
          incomingUnits[sk][`${prefix}_cln`] = r.cleaningGas;
          incomingUnits[sk][`${prefix}_bot`] = r.bottomGas;
          incomingUnits[sk][`${prefix}_seal`] = r.seal;
        });
      }

      const transition = computeSlotTransition({
        unitsOrder: SHIFT_KEYS,
        lockedSlots: currentLockedSlots,
        storedRows: storedUnits,
        incomingRows: incomingUnits,
        now,
      });

      if (!transition.ok) {
        return res.status(transition.status || 400).json({
          success: false,
          message: transition.message,
        });
      }

      const isCorrection = transition.isCorrection;
      const editorName = req.user?.name || payload.submittedBy || 'Shift Chemist';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();
      const saveEventId = `gc_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Update lockedSlots
      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (!isCorrection) {
        updatedLockedSlots[targetShift] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        const targetIdx = SHIFT_KEYS.indexOf(targetShift);
        for (let p = 0; p < targetIdx; p++) {
          updatedLockedSlots[SHIFT_KEYS[p]].isLocked = true;
        }
        if (targetIdx + 1 < SHIFT_KEYS.length) {
          updatedLockedSlots[SHIFT_KEYS[targetIdx + 1]].isLocked = false;
        }
      } else {
        updatedLockedSlots[targetShift] = {
          isSaved: true,
          isLocked: true,
          correctionUsed: true,
        };
      }

      const allPermanentlyLocked =
        updatedLockedSlots.shift1.isLocked &&
        updatedLockedSlots.shift2.isLocked &&
        updatedLockedSlots.shift3.isLocked;

      const updatedLockedShifts = {
        shift1Saved: updatedLockedSlots.shift1.isSaved,
        shift1Locked: updatedLockedSlots.shift1.isLocked,
        shift1Edits: updatedLockedSlots.shift1.correctionUsed ? 1 : 0,
        shift1: updatedLockedSlots.shift1.isLocked,
        s1Saved: updatedLockedSlots.shift1.isSaved,
        s1Locked: updatedLockedSlots.shift1.isLocked,
        s1Edits: updatedLockedSlots.shift1.correctionUsed ? 1 : 0,
        s1: updatedLockedSlots.shift1.isLocked,

        shift2Saved: updatedLockedSlots.shift2.isSaved,
        shift2Locked: updatedLockedSlots.shift2.isLocked,
        shift2Edits: updatedLockedSlots.shift2.correctionUsed ? 1 : 0,
        shift2: updatedLockedSlots.shift2.isLocked,
        s2Saved: updatedLockedSlots.shift2.isSaved,
        s2Locked: updatedLockedSlots.shift2.isLocked,
        s2Edits: updatedLockedSlots.shift2.correctionUsed ? 1 : 0,
        s2: updatedLockedSlots.shift2.isLocked,

        shift3Saved: updatedLockedSlots.shift3.isSaved,
        shift3Locked: updatedLockedSlots.shift3.isLocked,
        shift3Edits: updatedLockedSlots.shift3.correctionUsed ? 1 : 0,
        shift3: updatedLockedSlots.shift3.isLocked,
        s3Saved: updatedLockedSlots.shift3.isSaved,
        s3Locked: updatedLockedSlots.shift3.isLocked,
        s3Edits: updatedLockedSlots.shift3.correctionUsed ? 1 : 0,
        s3: updatedLockedSlots.shift3.isLocked,

        allPermanentlyLocked,
      };

      // Field edit audit history
      const updatedEditedFields = JSON.parse(JSON.stringify(existingData.editedFields || {}));
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        const extRows = existingByShift[targetShift] || [];
        const incRows = incomingByShift[targetShift] || [];

        incRows.forEach((newRow) => {
          const oldRow = extRows.find((r) => r.id === newRow.id);
          if (oldRow) {
            ['seal', 'recoveryCo2Con', 'cleaningGas', 'bottomGas'].forEach((field) => {
              const ov = oldRow[field];
              const nv = newRow[field];
              if (isValueDifferent(ov, nv) && ov !== undefined && ov !== null && ov !== '') {
                if (!updatedEditedFields[newRow.id]) updatedEditedFields[newRow.id] = {};
                updatedEditedFields[newRow.id][field] = true;

                updatedAuditHistory.push({
                  date: submissionDate,
                  rowId: newRow.id,
                  time: newRow.time,
                  shift: newRow.shift,
                  field,
                  fieldName: PARAM_DISPLAY_NAMES[field] || field,
                  oldValue: ov,
                  newValue: nv,
                  editor: editorName,
                  timestamp: nowIso,
                  saveEventId,
                });
              }
            });
          }
        });
      }

      // Rebuild updated rows
      const updatedRows = [];
      for (const sk of SHIFT_KEYS) {
        if (sk === targetShift) {
          (incomingByShift[sk] || []).forEach((r) => updatedRows.push(r));
        } else {
          (existingByShift[sk] || []).forEach((r) => updatedRows.push(r));
        }
      }
      existingExtraRows.forEach((r) => {
        if (!updatedRows.some((u) => u.id === r.id)) {
          updatedRows.push(r);
        }
      });

      const docUpdatePayload = {
        'data.rows': updatedRows,
        'data.lockedSlots': updatedLockedSlots,
        'data.lockedShifts': updatedLockedShifts,
        'data.editedFields': updatedEditedFields,
        'data.editAuditHistory': updatedAuditHistory,
        'data.submittedBy': editorName,
        'data.submittedAt': nowIso,
        'data.saveEventId': saveEventId,
        'data.unit': 'Gas Conc.',
        'data.analysisType': CANONICAL_ANALYSIS_TYPE,
        'data.plant': 'SA',
        'data.plantCode': 'SA',
        'data.plantName': 'Soda Ash Plant',
        submittedBy: editorName,
        submittedById: editorId,
        status: 'completed',
        emailStatus: 'disabled',
        emailRecipient: null,
      };

      if (existingDoc?._id) {
        const updateFilter = {
          _id: existingDoc._id,
          ...(isCorrection
            ? {
                [`data.lockedSlots.${targetShift}.isSaved`]: true,
                [`data.lockedSlots.${targetShift}.correctionUsed`]: false,
                [`data.lockedSlots.${targetShift}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetShift}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetShift}`]: { $exists: false } },
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
      } else {
        await PlantAnalysisRecord.create({
          plantName: 'Soda Ash Plant',
          plantCode: 'SA',
          analysisType: CANONICAL_ANALYSIS_TYPE,
          unit: 'Gas Conc.',
          date: submissionDate,
          shift: 'All Shifts',
          status: 'completed',
          submittedBy: editorName,
          submittedById: editorId,
          company: companyVal,
          emailStatus: 'disabled',
          emailRecipient: null,
          data: {
            id: `gas_conc_${Date.now()}`,
            date: submissionDate,
            plant: 'SA',
            plantName: 'Soda Ash Plant',
            plantCode: 'SA',
            unit: 'Gas Conc.',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            rows: updatedRows,
            lockedSlots: updatedLockedSlots,
            lockedShifts: updatedLockedShifts,
            editedFields: updatedEditedFields,
            editAuditHistory: updatedAuditHistory,
            submittedBy: editorName,
            submittedById: editorId,
            submittedAt: nowIso,
            company: companyVal,
            saveEventId,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: isCorrection
          ? `Shift ${targetShift} corrected successfully. Slot is now permanently locked.`
          : `Shift ${targetShift} saved successfully.`,
        data: {
          date: submissionDate,
          rows: updatedRows,
          lockedSlots: updatedLockedSlots,
          lockedShifts: updatedLockedShifts,
          editedFields: updatedEditedFields,
          editAuditHistory: updatedAuditHistory,
        },
        record: {
          date: submissionDate,
          rows: updatedRows,
          lockedSlots: updatedLockedSlots,
          lockedShifts: updatedLockedShifts,
          editedFields: updatedEditedFields,
          editAuditHistory: updatedAuditHistory,
        },
        rows: updatedRows,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        statusFromApi: 'disabled',
        emailStatus: 'disabled',
        emailSent: false,
        saveEventId,
      });
    } catch (error) {
      console.error('[GasConc Save] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while saving Gas Conc. Analysis data: ' + error.message,
        error: error.message,
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

  router.get('/export', async (req, res) => {
    try {
      const { date } = req.query;
      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date is required for export.',
        });
      }

      const query = {
        date,
        plantCode: { $in: PLANT_CODES },
        analysisType: { $in: ANALYSIS_TYPES },
      };
      const matchingDocs = await PlantAnalysisRecord.find(query).lean();
      const doc = pickCanonicalDoc(matchingDocs);

      const rows = doc?.data?.rows || [];
      const excelResult = await generateGasConcExcel({
        date,
        rows,
        submittedBy: doc?.submittedBy || 'Shift Chemist',
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${excelResult.filename || `Gas_Conc_Analysis_${date}.xlsx`}`);
      return res.send(excelResult.buffer);
    } catch (err) {
      console.error('[GasConc Export] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to export Gas Conc. Analysis report: ' + err.message,
      });
    }
  });

  return router;
}

const defaultRouter = createGasConcRouter();
defaultRouter.createRouter = createGasConcRouter;
module.exports = defaultRouter;
