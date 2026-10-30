const express = require('express');
const { PlantAnalysisRecord } = require('../models');
const { protect } = require('../middleware/auth');
const {
  computeSlotTransition,
  recordFieldEdits,
  pickCanonicalDoc,
  isUnitEmpty,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { getPlantAssignedUser } = require('../services/plantNotificationService');

const CANONICAL_ANALYSIS_TYPE = 'Bicarbonate Moisture Analysis';
const ANALYSIS_TYPES = [
  'Bicarbonate Moisture Analysis',
  'Bi Carbonate Moisture Analysis',
  'Bicarbonate Moisture',
];
const PLANT_CODES = ['SA', 'SA Plant', 'SA PLANT'];
const PARAM_KEYS = ['m404_a', 'm404_b', 'm404_c', 'm405_outlet', 'sb_turb1', 'sb_turb2'];

const SHIFT_SLOTS = ['shift1', 'shift2', 'shift3'];
const INDEPENDENT_SLOTS = ['addl', 'sample'];
const ALL_SLOTS = ['shift1', 'shift2', 'shift3', 'addl', 'sample'];

const SLOT_META = {
  shift1: { id: '1', shift: 'I SHIFT', defaultTime: '06:00', label: 'I SHIFT' },
  shift2: { id: '2', shift: 'II SHIFT', defaultTime: '14:00', label: 'II SHIFT' },
  shift3: { id: '3', shift: 'III SHIFT', defaultTime: '22:00', label: 'III SHIFT' },
  addl:   { id: '4', shift: 'ADDL SAPL1', defaultTime: '10:00', label: 'ADDL SAPL1' },
  sample: { id: '5', shift: 'SAMPLE', defaultTime: '18:00', label: 'SAMPLE' },
};

const DEFAULT_READINGS_TEMPLATE = [
  { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
];

function getSlotKeyFromRow(r) {
  if (!r) return null;
  const idStr = String(r.id || '').trim();
  const shiftStr = String(r.shift || '').trim().toUpperCase();
  if (idStr === '3' || shiftStr.includes('III SHIFT') || shiftStr === 'III' || shiftStr === '3') return 'shift3';
  if (idStr === '2' || shiftStr.includes('II SHIFT') || shiftStr === 'II' || shiftStr === '2') return 'shift2';
  if (idStr === '1' || shiftStr.includes('I SHIFT') || shiftStr === 'I' || shiftStr === '1') return 'shift1';
  if (idStr === '4' || shiftStr.includes('ADDL') || shiftStr.includes('SAPL1') || shiftStr === '4') return 'addl';
  if (idStr === '5' || shiftStr.includes('SAMPLE') || shiftStr === '5') return 'sample';
  return null;
}

function cleanParamValues(row = {}) {
  const cleaned = {};
  for (const k of PARAM_KEYS) {
    const v = row[k];
    if (v === '' || v === null || v === undefined) {
      cleaned[k] = null;
    } else {
      const num = Number(v);
      cleaned[k] = !isNaN(num) ? num : String(v).trim();
    }
  }
  return cleaned;
}

function calculateAverages(readings = []) {
  const averages = {};
  for (const k of PARAM_KEYS) {
    const numericVals = readings
      .map((r) => r[k])
      .filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
      .map((v) => Number(v));

    if (numericVals.length > 0) {
      const sum = numericVals.reduce((acc, curr) => acc + curr, 0);
      averages[k] = Number((sum / numericVals.length).toFixed(2));
    } else {
      averages[k] = null;
    }
  }
  return averages;
}

function deriveMoistureLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots;
  const legacyShifts = existingData.lockedShifts || {};

  const lockedSlots = {};

  if (storedSlots && typeof storedSlots === 'object' && Object.keys(storedSlots).length > 0) {
    for (const sk of ALL_SLOTS) {
      const s = storedSlots[sk];
      if (s) {
        lockedSlots[sk] = {
          isSaved: Boolean(s.isSaved || s.initialSaved),
          isLocked: Boolean(s.isLocked),
          correctionUsed: Boolean(s.correctionUsed || (s.editCount && s.editCount >= 1)),
        };
      } else {
        lockedSlots[sk] = { isSaved: false, isLocked: false, correctionUsed: false };
      }
    }
  } else {
    // Hydrate from legacy lockedShifts if present
    const shift1Saved = Boolean(legacyShifts.shift1Saved);
    const shift1Locked = Boolean(legacyShifts.shift1Locked || legacyShifts.shift1 || legacyShifts.allPermanentlyLocked);
    const shift1Correction = Boolean((legacyShifts.shift1Edits || 0) >= 1 || shift1Locked);

    const shift2Saved = Boolean(legacyShifts.shift2Saved);
    const shift2Locked = Boolean(legacyShifts.shift2Locked || legacyShifts.shift2 || legacyShifts.allPermanentlyLocked);
    const shift2Correction = Boolean((legacyShifts.shift2Edits || 0) >= 1 || shift2Locked);

    const shift3Saved = Boolean(legacyShifts.shift3Saved);
    const shift3Locked = Boolean(legacyShifts.shift3Locked || legacyShifts.shift3 || legacyShifts.allPermanentlyLocked);
    const shift3Correction = Boolean((legacyShifts.shift3Edits || 0) >= 1 || shift3Locked);

    lockedSlots.shift1 = { isSaved: shift1Saved, isLocked: shift1Locked, correctionUsed: shift1Correction };
    lockedSlots.shift2 = { isSaved: shift2Saved, isLocked: shift2Locked, correctionUsed: shift2Correction };
    lockedSlots.shift3 = { isSaved: shift3Saved, isLocked: shift3Locked, correctionUsed: shift3Correction };
    lockedSlots.addl = {
      isSaved: Boolean(legacyShifts.addlSaved),
      isLocked: Boolean(legacyShifts.addlLocked || legacyShifts.allPermanentlyLocked),
      correctionUsed: Boolean(legacyShifts.addlEdits >= 1),
    };
    lockedSlots.sample = {
      isSaved: Boolean(legacyShifts.sampleSaved),
      isLocked: Boolean(legacyShifts.sampleLocked || legacyShifts.allPermanentlyLocked),
      correctionUsed: Boolean(legacyShifts.sampleEdits >= 1),
    };
  }

  // Build dual-write lockedShifts
  const lockedShifts = {
    shift1Saved: lockedSlots.shift1.isSaved,
    shift1Locked: lockedSlots.shift1.isLocked,
    shift1Edits: lockedSlots.shift1.correctionUsed ? 1 : 0,
    shift1: lockedSlots.shift1.isLocked,

    shift2Saved: lockedSlots.shift2.isSaved,
    shift2Locked: lockedSlots.shift2.isLocked,
    shift2Edits: lockedSlots.shift2.correctionUsed ? 1 : 0,
    shift2: lockedSlots.shift2.isLocked,

    shift3Saved: lockedSlots.shift3.isSaved,
    shift3Locked: lockedSlots.shift3.isLocked,
    shift3Edits: lockedSlots.shift3.correctionUsed ? 1 : 0,
    shift3: lockedSlots.shift3.isLocked,

    addlSaved: lockedSlots.addl.isSaved,
    addlLocked: lockedSlots.addl.isLocked,
    addlEdits: lockedSlots.addl.correctionUsed ? 1 : 0,
    addl: lockedSlots.addl.isLocked,

    sampleSaved: lockedSlots.sample.isSaved,
    sampleLocked: lockedSlots.sample.isLocked,
    sampleEdits: lockedSlots.sample.correctionUsed ? 1 : 0,
    sample: lockedSlots.sample.isLocked,

    allPermanentlyLocked:
      lockedSlots.shift1.isLocked &&
      lockedSlots.shift2.isLocked &&
      lockedSlots.shift3.isLocked &&
      lockedSlots.addl.isLocked &&
      lockedSlots.sample.isLocked,
  };

  return { lockedSlots, lockedShifts };
}

function createBicarbonateMoistureRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  router.use(protect);

  router.get('/', async (req, res) => {
    try {
      const { date } = req.query;

      let assignedOperatorEmail = null;
      try {
        const assigned = await getPlantAssignedUser('SA', { company: req.user?.company });
        assignedOperatorEmail = assigned?.primaryEmail || null;
      } catch (e) {
        console.warn('[Bicarbonate Moisture GET] getPlantAssignedUser note:', e.message);
      }

      const defaultTemplate = DEFAULT_READINGS_TEMPLATE.map((r) => ({ ...r }));
      const { lockedSlots: defaultLockedSlots, lockedShifts: defaultLockedShifts } = deriveMoistureLocks(null);

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

        const matchingDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc && doc.data) {
          const payloadData = doc.data;
          const { lockedSlots, lockedShifts } = deriveMoistureLocks(doc);
          const rawReadings = Array.isArray(payloadData.readings) ? payloadData.readings : [];

          // Merge into template, preserving any extra legacy rows
          const matchedSlotKeys = new Set();
          const mergedReadings = defaultTemplate.map((defRow) => {
            const slotKey = getSlotKeyFromRow(defRow);
            const found = rawReadings.find((r) => getSlotKeyFromRow(r) === slotKey);
            if (found) {
              matchedSlotKeys.add(found.id || found.shift);
              return { ...defRow, ...found, id: defRow.id, shift: defRow.shift };
            }
            return defRow;
          });

          // Append legacy extra rows
          rawReadings.forEach((r) => {
            const k = r.id || r.shift;
            if (!matchedSlotKeys.has(k) && !getSlotKeyFromRow(r)) {
              mergedReadings.push(r);
            }
          });

          const averages = payloadData.averages || calculateAverages(mergedReadings);

          const recordData = {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode,
            analysisType: doc.analysisType,
            readings: mergedReadings,
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
            readings: mergedReadings,
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
          readings: defaultTemplate,
          averages: { m404_a: null, m404_b: null, m404_c: null, m405_outlet: null, sb_turb1: null, sb_turb2: null },
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
      console.error('[Bicarbonate Moisture GET] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch Bicarbonate Moisture Analysis records: ' + err.message,
      });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Bicarbonate Moisture data entry and modification is restricted to Company Admins.',
        });
      }

      const payload = req.body || {};
      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Bicarbonate Moisture data.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Bicarbonate Moisture Analysis records can only be created or modified for current operating day (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const incomingReadings = Array.isArray(payload.readings) ? payload.readings : [];
      if (incomingReadings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed. Readings array is required.',
        });
      }

      // Check numeric inputs across incoming rows
      const validationErrors = [];
      incomingReadings.forEach((r, idx) => {
        const rowNum = idx + 1;
        const label = r.shift || `Row #${rowNum}`;
        PARAM_KEYS.forEach((f) => {
          const val = r[f];
          if (val !== '' && val !== null && val !== undefined) {
            if (isNaN(Number(val))) {
              validationErrors.push(`${label}: ${f} must be a valid number.`);
            }
          }
        });
      });

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed. Enter numeric values only.',
          errors: validationErrors,
        });
      }

      // Parse incoming readings by slotKey
      const incomingSlots = {};
      const incomingExtraRows = [];
      incomingReadings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk) {
          incomingSlots[sk] = cleanParamValues(r);
        } else {
          incomingExtraRows.push(r);
        }
      });

      // Load existing doc
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
      const existingReadings = Array.isArray(existingData.readings) ? existingData.readings : [];

      const existingSlots = {};
      const existingExtraRows = [];
      existingReadings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk) {
          existingSlots[sk] = cleanParamValues(r);
        } else {
          existingExtraRows.push(r);
        }
      });

      const { lockedSlots: currentLockedSlots } = deriveMoistureLocks(existingDoc);

      // Find changed slots
      const changedSlots = [];
      for (const sk of ALL_SLOTS) {
        const inc = incomingSlots[sk] || {};
        const ext = existingSlots[sk] || {};
        const hasDiff = PARAM_KEYS.some((pk) => isValueDifferent(ext[pk], inc[pk]));
        if (hasDiff) {
          changedSlots.push(sk);
        }
      }

      // If document has no saved units yet and no non-empty units provided in payload, reject empty first save
      const hasAnySaved = ALL_SLOTS.some((s) => currentLockedSlots[s]?.isSaved);
      if (!existingDoc || !hasAnySaved) {
        if (changedSlots.length === 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot save empty slot ${SHIFT_SLOTS[0]}. At least one non-empty value is required.`,
          });
        }
      }

      // Handle identical re-save (no change in any slot)
      if (changedSlots.length === 0) {
        const { lockedShifts: currentFlatLocks } = deriveMoistureLocks(existingDoc);
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          readings: existingReadings.length > 0 ? existingReadings : DEFAULT_READINGS_TEMPLATE,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentFlatLocks,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailSent: false,
        });
      }

      // Enforce one slot per POST
      if (changedSlots.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Only one shift or slot can be entered and saved at a time.',
        });
      }

      const targetSlot = changedSlots[0];
      const isShiftChain = SHIFT_SLOTS.includes(targetSlot);
      const isIndependent = INDEPENDENT_SLOTS.includes(targetSlot);

      let transition = null;

      if (isShiftChain) {
        // Build incomingShiftRows: preserve saved shifts, include target
        const incomingShiftRows = {};
        for (const u of SHIFT_SLOTS) {
          if (u === targetSlot) {
            incomingShiftRows[u] = incomingSlots[u] || {};
          } else if (existingSlots[u] !== undefined) {
            incomingShiftRows[u] = existingSlots[u];
          }
        }

        const shiftSlotsOnly = {
          shift1: currentLockedSlots.shift1,
          shift2: currentLockedSlots.shift2,
          shift3: currentLockedSlots.shift3,
        };

        // If doc missing: first save must be shift1
        if (!existingDoc && targetSlot !== SHIFT_SLOTS[0]) {
          return res.status(400).json({
            success: false,
            message: `Sequential restriction: ${SLOT_META[SHIFT_SLOTS[0]].label} must be completed and saved before proceeding to ${SLOT_META[targetSlot].label}.`,
          });
        }

        transition = computeSlotTransition({
          unitsOrder: SHIFT_SLOTS,
          lockedSlots: shiftSlotsOnly,
          storedRows: existingSlots,
          incomingRows: incomingShiftRows,
          now,
        });
      } else if (isIndependent) {
        // Independent slots: unitsOrder of length 1 enforces first save, ONE correction, then permanent lock
        transition = computeSlotTransition({
          unitsOrder: [targetSlot],
          lockedSlots: { [targetSlot]: currentLockedSlots[targetSlot] },
          storedRows: { [targetSlot]: existingSlots[targetSlot] || {} },
          incomingRows: { [targetSlot]: incomingSlots[targetSlot] || {} },
          now,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: `Unknown sampling slot '${targetSlot}'.`,
        });
      }

      if (transition.noChange) {
        const { lockedShifts: currentFlatLocks } = deriveMoistureLocks(existingDoc);
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          readings: existingReadings,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentFlatLocks,
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
      const editorName = req.user?.name || payload.submittedBy || 'Shift Chemist';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();
      const saveEventId = `bicarb_moist_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Compute next lockedSlots
      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (isShiftChain) {
        if (!isCorrection) {
          updatedLockedSlots[targetSlot] = {
            isSaved: true,
            isLocked: false,
            correctionUsed: false,
          };
          const targetIdx = SHIFT_SLOTS.indexOf(targetSlot);
          for (let p = 0; p < targetIdx; p++) {
            updatedLockedSlots[SHIFT_SLOTS[p]].isLocked = true;
          }
        } else {
          updatedLockedSlots[targetSlot] = {
            isSaved: true,
            isLocked: true,
            correctionUsed: true,
          };
        }
      } else {
        if (!isCorrection) {
          updatedLockedSlots[targetSlot] = {
            isSaved: true,
            isLocked: false,
            correctionUsed: false,
          };
        } else {
          updatedLockedSlots[targetSlot] = {
            isSaved: true,
            isLocked: true,
            correctionUsed: true,
          };
        }
      }

      // Handle audit tracking for corrections
      const updatedEditedFields = JSON.parse(JSON.stringify(existingData.editedFields || {}));
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        const rowId = SLOT_META[targetSlot].id;
        const shiftLabel = SLOT_META[targetSlot].shift;
        const targetExisting = existingSlots[targetSlot] || {};
        const targetIncoming = incomingSlots[targetSlot] || {};

        PARAM_KEYS.forEach((pk) => {
          const ov = targetExisting[pk];
          const nv = targetIncoming[pk];
          const oNum = ov !== '' && ov !== null && ov !== undefined ? Number(ov) : null;
          const nNum = nv !== '' && nv !== null && nv !== undefined ? Number(nv) : null;
          const changed = oNum !== null && nNum !== null ? oNum !== nNum : String(ov ?? '') !== String(nv ?? '');
          if (changed) {
            if (!updatedEditedFields[rowId]) updatedEditedFields[rowId] = {};
            updatedEditedFields[rowId][pk] = true;
            updatedAuditHistory.push({
              date: payload.date,
              rowId,
              shift: shiftLabel,
              time: SLOT_META[targetSlot].defaultTime,
              field: pk,
              fieldName: pk.toUpperCase().replace('_', ' '),
              oldValue: ov,
              newValue: nv,
              editor: editorName,
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }

      // Rebuild updated readings array preserving original default rows and any legacy extra rows
      const mergedSlots = { ...existingSlots, [targetSlot]: incomingSlots[targetSlot] };
      const updatedReadings = DEFAULT_READINGS_TEMPLATE.map((defRow) => {
        const sk = getSlotKeyFromRow(defRow);
        const slotVals = mergedSlots[sk] || {};
        const existingRow = existingReadings.find((r) => getSlotKeyFromRow(r) === sk) || {};
        const incomingRow = incomingReadings.find((r) => getSlotKeyFromRow(r) === sk) || {};
        return {
          id: defRow.id,
          shift: defRow.shift,
          time: existingRow.time || incomingRow.time || defRow.time,
          ...slotVals,
        };
      });

      // Preserve legacy extra rows
      const existingExtra = existingReadings.filter((r) => !getSlotKeyFromRow(r));
      existingExtra.forEach((extraRow) => {
        updatedReadings.push(extraRow);
      });

      const updatedAverages = calculateAverages(updatedReadings);

      // Build dual-write lockedShifts
      const updatedLockedShifts = {
        shift1Saved: updatedLockedSlots.shift1.isSaved,
        shift1Locked: updatedLockedSlots.shift1.isLocked,
        shift1Edits: updatedLockedSlots.shift1.correctionUsed ? 1 : 0,
        shift1: updatedLockedSlots.shift1.isLocked,

        shift2Saved: updatedLockedSlots.shift2.isSaved,
        shift2Locked: updatedLockedSlots.shift2.isLocked,
        shift2Edits: updatedLockedSlots.shift2.correctionUsed ? 1 : 0,
        shift2: updatedLockedSlots.shift2.isLocked,

        shift3Saved: updatedLockedSlots.shift3.isSaved,
        shift3Locked: updatedLockedSlots.shift3.isLocked,
        shift3Edits: updatedLockedSlots.shift3.correctionUsed ? 1 : 0,
        shift3: updatedLockedSlots.shift3.isLocked,

        addlSaved: updatedLockedSlots.addl.isSaved,
        addlLocked: updatedLockedSlots.addl.isLocked,
        addlEdits: updatedLockedSlots.addl.correctionUsed ? 1 : 0,
        addl: updatedLockedSlots.addl.isLocked,

        sampleSaved: updatedLockedSlots.sample.isSaved,
        sampleLocked: updatedLockedSlots.sample.isLocked,
        sampleEdits: updatedLockedSlots.sample.correctionUsed ? 1 : 0,
        sample: updatedLockedSlots.sample.isLocked,

        allPermanentlyLocked:
          updatedLockedSlots.shift1.isLocked &&
          updatedLockedSlots.shift2.isLocked &&
          updatedLockedSlots.shift3.isLocked &&
          updatedLockedSlots.addl.isLocked &&
          updatedLockedSlots.sample.isLocked,
      };

      // Atomic Mongo Persistence
      const docUpdatePayload = {
        'data.readings': updatedReadings,
        'data.averages': updatedAverages,
        'data.lockedSlots': updatedLockedSlots,
        'data.lockedShifts': updatedLockedShifts,
        'data.editedFields': updatedEditedFields,
        'data.editAuditHistory': updatedAuditHistory,
        'data.submittedBy': editorName,
        'data.submittedAt': nowIso,
        'data.saveEventId': saveEventId,
        'data.unit': 'Bicarbonate Moisture',
        'data.analysisType': CANONICAL_ANALYSIS_TYPE,
        'data.plant': 'SA',
        'data.plantCode': 'SA',
        'data.section': 'Soda Ash Production',
        submittedBy: editorName,
        submittedById: editorId,
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
            message: 'Conflict: This slot was locked or updated concurrently by another user.',
          });
        }
        savedDoc = await PlantAnalysisRecord.findById(existingDoc._id).lean();
      } else {
        try {
          const insertDoc = {
            plantName: 'SA Plant',
            plantCode: 'SA',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: 'Bicarbonate Moisture',
            date: payload.date,
            shift: 'All Shifts',
            status: 'completed',
            submittedBy: editorName,
            submittedById: editorId,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: {
              id: `bicarb_moist_${Date.now()}`,
              date: payload.date,
              plant: 'SA',
              plantCode: 'SA',
              unit: 'Bicarbonate Moisture',
              section: 'Soda Ash Production',
              analysisType: CANONICAL_ANALYSIS_TYPE,
              readings: updatedReadings,
              averages: updatedAverages,
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

      return res.status(200).json({
        success: true,
        message: 'Bicarbonate Moisture Analysis saved successfully in MongoDB',
        data: savedDoc.data,
        record: savedDoc.data,
        recordId: savedDoc._id,
        readings: updatedReadings,
        averages: updatedAverages,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        emailStatus: 'disabled',
        emailDeliveryStatus: 'disabled',
        emailRecipient: null,
        statusFromApi: 'disabled',
        saveEventId,
      });
    } catch (error) {
      console.error('Error saving Bicarbonate Moisture Analysis:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while saving Bicarbonate Moisture Analysis: ' + error.message,
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

  return router;
}

const defaultRouter = createBicarbonateMoistureRouter();
defaultRouter.createRouter = createBicarbonateMoistureRouter;
module.exports = defaultRouter;
