const express = require('express');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');

const {
  getInitialLockState,
  hydrateLockState,
  computeSlotTransition,
  recordFieldEdits,
  pickCanonicalDoc,
  isUnitEmpty,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

/**
 * Helper to get Asia/Kolkata date string (YYYY-MM-DD) – used by the weekly router.
 */
const getTodayKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

/**
 * Derives lockedSlots in memory for legacy docs that have no data.lockedSlots.
 * Mirrors createSlotLockRoute.deriveLegacyLockedSlots for the 3-shift CO2 case.
 */
function deriveLegacyLockedSlotsShift(rows = {}, legacyLockedShifts = {}, unitsOrder = ['shift1', 'shift2', 'shift3']) {
  const result = {};
  const savedIndices = [];
  unitsOrder.forEach((slotKey, idx) => {
    if (!isUnitEmpty(rows?.[slotKey])) savedIndices.push(idx);
  });

  const isLegacyShiftLocked = (shiftKey) => {
    if (!legacyLockedShifts) return false;
    if (legacyLockedShifts.allPermanentlyLocked) return true;
    if (legacyLockedShifts[`${shiftKey}Locked`] === true) return true;
    if (
      legacyLockedShifts.slots &&
      legacyLockedShifts.slots[shiftKey]?.isLocked === true &&
      legacyLockedShifts.slots[shiftKey]?.isSaved === true
    ) return true;
    if (legacyLockedShifts[shiftKey] === true && legacyLockedShifts[`${shiftKey}Saved`] === true) return true;
    if (Number(legacyLockedShifts[`${shiftKey}Edits`] || 0) >= 1) return true;
    return false;
  };

  const allLocked = Boolean(legacyLockedShifts?.allPermanentlyLocked);
  if (savedIndices.length === 0) {
    unitsOrder.forEach((slotKey) => {
      result[slotKey] = { isSaved: false, isLocked: allLocked, correctionUsed: false };
    });
    return result;
  }

  const hIdx = Math.max(...savedIndices);
  const hShiftIsLocked = isLegacyShiftLocked(unitsOrder[hIdx]) || allLocked;

  unitsOrder.forEach((slotKey, idx) => {
    if (idx < hIdx) {
      result[slotKey] = {
        isSaved: !isUnitEmpty(rows?.[slotKey]),
        isLocked: true,
        correctionUsed: isLegacyShiftLocked(slotKey),
      };
    } else if (idx === hIdx) {
      result[slotKey] = { isSaved: true, isLocked: hShiftIsLocked, correctionUsed: hShiftIsLocked };
    } else if (idx === hIdx + 1) {
      result[slotKey] = { isSaved: false, isLocked: allLocked, correctionUsed: false };
    } else {
      result[slotKey] = { isSaved: false, isLocked: allLocked, correctionUsed: false };
    }
  });
  return result;
}

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

/**
 * Creates an Express router for 3-shift CO2 Plant analyses with:
 * - getOperatingDateIST date guard (injected getNow, no x-test-* bypass)
 * - computeSlotTransition + atomic $set dot-path updates with 409 on race
 * - pickCanonicalDoc on GET and POST
 * - 200 { noChange: true } on identical re-save
 * - Legacy hydration for docs without data.lockedSlots
 * - Dual-write flat data.lockedShifts for client contract
 * - recordFieldEdits on corrections only
 */
function createCO2ShiftAnalysisRouter({
  analysisType,
  unit,
  tank,
  parameters,
  getNow = () => new Date(),
  plantCodes = ['CO2', 'CO2 Plant', 'CO2 PLANT'],
  plantCode = 'CO2',
  plantName = 'CO2 Plant',
  plantIdentifier = 'CO2',
  shiftDisplayNames = SHIFT_DISPLAY_NAMES,
  dataKey = 'rows',
  extraFields = {},
  unitValue = undefined,
  onAfterSave = null,
}) {
  const router = express.Router();
  const inMemoryRecords = [];
  const unitsOrder = ['shift1', 'shift2', 'shift3'];
  const effectiveUnit = unitValue !== undefined ? unitValue : (unit || tank);
  const effectiveTank = unitValue !== undefined ? unitValue : (tank || unit);

  router.use(protect);

  // ── GET ──────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const { date, startDate, endDate } = req.query;

      let assignedOperatorEmail = null;
      try {
        const { assignedUser, primaryEmail } = await getPlantAssignedUser(plantIdentifier);
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (_) {}

      const defaultLocks = getInitialLockState({ type: 'shift', items: unitsOrder });
      const defaultLockedSlots = {
        shift1: { isSaved: false, isLocked: false, correctionUsed: false },
        shift2: { isSaved: false, isLocked: false, correctionUsed: false },
        shift3: { isSaved: false, isLocked: false, correctionUsed: false },
      };

      if (date) {
        const query = { plantCode: { $in: plantCodes }, analysisType, date };
        if (req.user?.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc?.data) {
          const payloadData = doc.data;
          const rows = payloadData.rows || payloadData.shifts || payloadData;
          const resolvedLocks = payloadData.lockedShifts
            ? hydrateLockState(payloadData.lockedShifts, { type: 'shift', items: unitsOrder })
            : defaultLocks;
          const resolvedLockedSlots =
            payloadData.lockedSlots && Object.keys(payloadData.lockedSlots).length > 0
              ? { ...defaultLockedSlots, ...payloadData.lockedSlots }
              : deriveLegacyLockedSlotsShift(rows, payloadData.lockedShifts, unitsOrder);

          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'pending',
            assignedOperatorEmail,
            lockedShifts: resolvedLocks,
            lockedSlots: resolvedLockedSlots,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              rows,
              ...(dataKey === 'shifts' || extraFields.shifts ? { shifts: payloadData.shifts || rows } : {}),
              ...(extraFields.shiftRows ? { shiftRows: payloadData.shiftRows || rows } : {}),
              lockedShifts: resolvedLocks,
              lockedSlots: resolvedLockedSlots,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }

        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          lockedShifts: defaultLocks,
          lockedSlots: defaultLockedSlots,
          editedFields: {},
          editAuditHistory: [],
          data: null,
          message: `No record found for date ${date}`,
        });
      }

      // Range / list query
      const listQuery = { plantCode: { $in: plantCodes }, analysisType };
      if (startDate && endDate) listQuery.date = { $gte: startDate, $lte: endDate };
      if (req.user?.company) {
        listQuery.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }
      const docs = await PlantAnalysisRecord.find(listQuery).sort({ date: -1 }).lean();
      if (docs?.length > 0) {
        return res.status(200).json({
          success: true,
          count: docs.length,
          data: docs.map((d) => ({ ...d.data, _id: d._id, id: d._id, date: d.date, emailStatus: d.emailStatus, emailRecipient: d.emailRecipient })),
        });
      }
      return res.status(200).json({ success: true, count: inMemoryRecords.length, data: inMemoryRecords });
    } catch (err) {
      console.error(`[${plantCode} ${analysisType} GET] Error:`, err);
      return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
  });

  // ── POST ─────────────────────────────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const payload = req.body || {};

      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: `Forbidden: ${analysisType} data entry and modification is restricted to authorized Admins.`,
        });
      }

      const validation = validateAnalysisPayload(payload);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.errors[0] || 'Validation failed. Enter numeric values only.',
          errors: validation.errors,
        });
      }

      if (!payload.date) {
        return res.status(400).json({ success: false, message: `Analysis Date is required to save ${analysisType}.` });
      }

      // Strict operating date guard (06:00–06:00 IST).
      // getNow is injected by the route file. x-test-mode, x-test-now, x-test-env,
      // payload.isTestMode, and payload.now are NEVER consulted here.
      const now = getNow();
      const operatingDate = getOperatingDateIST(now);
      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: ${analysisType} records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      // Load existing docs via pickCanonicalDoc
      const query = { date: payload.date, plantCode: { $in: plantCodes }, analysisType };
      if (req.user?.company) {
        const compId = req.user.company._id || req.user.company;
        query.$or = [{ company: compId }, { company: null }];
      }
      const matchingDocs = await PlantAnalysisRecord.find(query);
      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};
      const existingRows = existingData.rows || existingData.shifts || existingData.readings || {};

      let existingLockedSlots = existingData.lockedSlots;
      const hasStoredLockedSlots = Boolean(existingLockedSlots && Object.keys(existingLockedSlots).length > 0);
      if (!hasStoredLockedSlots) {
        existingLockedSlots = deriveLegacyLockedSlotsShift(existingRows, existingData.lockedShifts, unitsOrder);
      }

      const incomingRowsRaw = payload.rows || payload.shifts || {};

      // 1. Check if any unit is currently saved in this document
      const hasAnySaved = unitsOrder.some((u) => existingLockedSlots[u]?.isSaved);

      // 2. Identify candidate target units among unsaved units:
      const nonEmptyUnsaved = unitsOrder.filter(
        (u) => !existingLockedSlots[u]?.isSaved && incomingRowsRaw[u] && !isUnitEmpty(incomingRowsRaw[u])
      );

      // If document has no saved units yet and no non-empty units provided in payload, reject empty first save
      if (!hasAnySaved && nonEmptyUnsaved.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot save empty slot " + unitsOrder[0] + ". At least one non-empty value is required.",
        });
      }

      // 3. Normalize incomingRows:
      // - For saved units: preserve incoming if provided, else existing stored.
      // - For unsaved units: include only non-empty entries (dropping empty unsaved entries).
      const incomingRows = {};
      for (const u of unitsOrder) {
        if (existingLockedSlots[u]?.isSaved) {
          if (incomingRowsRaw[u] !== undefined) {
            incomingRows[u] = incomingRowsRaw[u];
          } else if (existingRows[u] !== undefined) {
            incomingRows[u] = existingRows[u];
          }
        } else {
          if (incomingRowsRaw[u] !== undefined && !isUnitEmpty(incomingRowsRaw[u])) {
            incomingRows[u] = incomingRowsRaw[u];
          }
        }
      }

      // Pure engine transition
      const transition = computeSlotTransition({
        unitsOrder,
        lockedSlots: existingLockedSlots,
        storedRows: existingRows,
        incomingRows,
        now,
      });

      // Identical re-save
      if (transition.noChange) {
        return res.status(200).json({ success: true, noChange: true, message: "No new or modified data found to save." });
      }

      // Validation / lock errors
      if (!transition.ok) {
        return res.status(transition.status || 400).json({ success: false, message: transition.message });
      }

      const targetUnit = transition.targetUnit;

      // Doc missing: first save must be shift1
      if (!existingDoc && targetUnit !== unitsOrder[0]) {
        return res.status(400).json({
          success: false,
          message: `Sequential restriction: ${unitsOrder[0]} must be completed and saved before proceeding to ${targetUnit}.`,
        });
      }

      // Audit — only on corrections
      let editedFields = { ...(existingData.editedFields || {}) };
      let editAuditHistory = Array.isArray(existingData.editAuditHistory) ? [...existingData.editAuditHistory] : [];

      if (transition.isCorrection) {
        const auditResult = recordFieldEdits({
          fields: parameters,
          oldRows: existingRows[targetUnit] || {},
          newRows: incomingRows[targetUnit] || {},
          editorName: req.user?.name || payload.submittedBy || 'Admin',
          editorId: req.user?._id || null,
          itemKey: targetUnit,
          existingEditedFields: editedFields,
          existingAuditHistory: editAuditHistory,
        });
        editedFields = auditResult.editedFields;
        editAuditHistory = auditResult.editAuditHistory;
        transition.dotPathUpdates['data.editedFields'] = editedFields;
        transition.dotPathUpdates['data.editAuditHistory'] = editAuditHistory;
      }

      // Build slot state after this save
      const currentSlots = {};
      unitsOrder.forEach((s) => {
        currentSlots[s] = { ...(existingLockedSlots[s] || { isSaved: false, isLocked: false, correctionUsed: false }) };
      });
      currentSlots[targetUnit] = {
        isSaved: true,
        correctionUsed: Boolean(transition.isCorrection),
        isLocked: Boolean(transition.isCorrection),
      };
      const targetIdx = unitsOrder.indexOf(targetUnit);
      for (let p = 0; p < targetIdx; p++) {
        currentSlots[unitsOrder[p]].isLocked = true;
      }

      const s1Saved = Boolean(currentSlots.shift1?.isSaved);
      const s2Saved = Boolean(currentSlots.shift2?.isSaved);
      const s3Saved = Boolean(currentSlots.shift3?.isSaved);
      const s1Corr  = Boolean(currentSlots.shift1?.correctionUsed);
      const s2Corr  = Boolean(currentSlots.shift2?.correctionUsed);
      const s3Corr  = Boolean(currentSlots.shift3?.correctionUsed);
      const s1Lock  = Boolean(currentSlots.shift1?.isLocked || s2Saved || s1Corr);
      const s2Lock  = Boolean(currentSlots.shift2?.isLocked || s3Saved || s2Corr);
      const s3Lock  = Boolean(currentSlots.shift3?.isLocked || s3Corr);

      // Dual-write flat lockedShifts dot-paths (client contract)
      transition.dotPathUpdates['data.lockedShifts.shift1Saved']  = s1Saved;
      transition.dotPathUpdates['data.lockedShifts.shift2Saved']  = s2Saved;
      transition.dotPathUpdates['data.lockedShifts.shift3Saved']  = s3Saved;
      transition.dotPathUpdates['data.lockedShifts.shift1Locked'] = s1Lock;
      transition.dotPathUpdates['data.lockedShifts.shift2Locked'] = s2Lock;
      transition.dotPathUpdates['data.lockedShifts.shift3Locked'] = s3Lock;
      transition.dotPathUpdates['data.lockedShifts.shift1Edits']  = s1Corr ? 1 : 0;
      transition.dotPathUpdates['data.lockedShifts.shift2Edits']  = s2Corr ? 1 : 0;
      transition.dotPathUpdates['data.lockedShifts.shift3Edits']  = s3Corr ? 1 : 0;
      // Disabled (true = locked/disabled in UI)
      transition.dotPathUpdates['data.lockedShifts.shift1'] = s1Lock;
      transition.dotPathUpdates['data.lockedShifts.shift2'] = !s1Saved || s2Lock;
      transition.dotPathUpdates['data.lockedShifts.shift3'] = !s2Saved || s3Lock;

      if (dataKey === 'shifts' || extraFields.shifts) {
        transition.dotPathUpdates[`data.shifts.${targetUnit}`] = incomingRows[targetUnit];
      }
      if (extraFields.shiftRows) {
        transition.dotPathUpdates[`data.shiftRows.${targetUnit}`] = incomingRows[targetUnit];
      }

      // Persist hydrated slots for legacy docs on first conditional write
      if (existingDoc && !hasStoredLockedSlots) {
        for (const s of unitsOrder) {
          if (s !== targetUnit && existingLockedSlots[s] && (existingLockedSlots[s].isSaved || existingLockedSlots[s].isLocked)) {
            transition.dotPathUpdates[`data.lockedSlots.${s}.isSaved`]        = Boolean(existingLockedSlots[s].isSaved);
            if (transition.dotPathUpdates[`data.lockedSlots.${s}.isLocked`] === undefined) {
              transition.dotPathUpdates[`data.lockedSlots.${s}.isLocked`]    = Boolean(existingLockedSlots[s].isLocked);
            }
            transition.dotPathUpdates[`data.lockedSlots.${s}.correctionUsed`] = Boolean(existingLockedSlots[s].correctionUsed);
          }
        }
      }

      transition.dotPathUpdates['submittedBy']   = req.user?.name || payload.submittedBy || 'Plant Operator';
      transition.dotPathUpdates['submittedById']  = req.user?._id || null;
      transition.dotPathUpdates['savedAt']        = new Date();

      let savedDoc = null;

      if (!existingDoc) {
        // First save: upsert with $setOnInsert + $set, 409 on race
        const missingFilter = {
          plantCode: { $in: plantCodes },
          analysisType,
          date: payload.date,
          [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true },
        };
        const updateDoc = {
          $setOnInsert: {
            plantName,
            plantCode,
            analysisType,
            unit: effectiveUnit,
            date: payload.date,
            shift: 'All Shifts',
            company: req.user?.company?._id || req.user?.company || null,
            createdAt: new Date(),
          },
          $set: transition.dotPathUpdates,
        };
        try {
          const updateResult = await PlantAnalysisRecord.updateOne(missingFilter, updateDoc, { upsert: true });
          if (updateResult.upsertedCount === 0) {
            return res.status(409).json({ success: false, message: 'Conflict: Document for this date was created concurrently. Please retry.' });
          }
          savedDoc = await PlantAnalysisRecord.findOne({ plantCode: { $in: plantCodes }, analysisType, date: payload.date });
        } catch (err) {
          if (err.code === 11000 || String(err.message).includes('E11000')) {
            return res.status(409).json({ success: false, message: 'Conflict: Document for this date was created concurrently. Please retry.' });
          }
          throw err;
        }
      } else {
        // Subsequent save: atomic guard by _id + slot state, 409 on race
        const existsFilter = {
          _id: existingDoc._id,
          ...(transition.isCorrection
            ? (hasStoredLockedSlots
                ? {
                    [`data.lockedSlots.${targetUnit}.isSaved`]:        true,
                    [`data.lockedSlots.${targetUnit}.correctionUsed`]: false,
                    [`data.lockedSlots.${targetUnit}.isLocked`]:       false,
                  }
                : {
                    $or: [
                      { [`data.lockedSlots.${targetUnit}.isSaved`]: true, [`data.lockedSlots.${targetUnit}.correctionUsed`]: false, [`data.lockedSlots.${targetUnit}.isLocked`]: false },
                      { [`data.lockedSlots`]: { $exists: false } },
                      { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
                    ],
                  })
            : {
                $or: [
                  { [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
                  { [`data.lockedSlots`]: { $exists: false } },
                ],
              }),
        };
        try {
          savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
            existsFilter,
            { $set: transition.dotPathUpdates },
            { new: true }
          );
        } catch (err) {
          if (err.code === 11000 || String(err.message).includes('E11000')) {
            return res.status(409).json({ success: false, message: 'Conflict: Document for this date was created concurrently. Please retry.' });
          }
          throw err;
        }
        if (!savedDoc) {
          return res.status(409).json({ success: false, message: `Conflict: Shift ${targetUnit} has already been saved or locked by another session. Please refresh.` });
        }
      }

      // Build response payload
      const mergedRows = { ...(existingRows || {}), [targetUnit]: incomingRows[targetUnit] };
      const lockedShifts = {
        shift1Saved:  s1Saved, shift2Saved:  s2Saved, shift3Saved:  s3Saved,
        shift1Locked: s1Lock,  shift2Locked: s2Lock,  shift3Locked: s3Lock,
        shift1Edits:  s1Corr ? 1 : 0,
        shift2Edits:  s2Corr ? 1 : 0,
        shift3Edits:  s3Corr ? 1 : 0,
        shift1: s1Lock,
        shift2: !s1Saved || s2Lock,
        shift3: !s2Saved || s3Lock,
      };
      const lockedSlots = { ...currentSlots, ...(savedDoc.data?.lockedSlots || {}) };

      const updatedRecordData = {
        id:             savedDoc._id,
        _id:            savedDoc._id,
        date:           payload.date,
        plant:          plantName,
        analysisType,
        tank:           effectiveTank,
        unit:           effectiveUnit,
        frequency:      'Once in a shift',
        shift:          shiftDisplayNames[targetUnit] || targetUnit,
        rows:           mergedRows,
        ...(dataKey === 'shifts' || extraFields.shifts ? { shifts: mergedRows } : {}),
        ...(extraFields.shiftRows ? { shiftRows: mergedRows } : {}),
        lockedSlots,
        lockedShifts,
        editedFields,
        editAuditHistory,
        submittedBy:    req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById:  req.user?._id || null,
        submittedAt:    new Date().toISOString(),
        company:        req.user?.company?._id || req.user?.company || null,
      };

      inMemoryRecords.unshift(updatedRecordData);

      try {
        if (ActivityLog && typeof ActivityLog.create === 'function') {
          await ActivityLog.create({
            action:    `${analysisType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_SAVED`,
            user:      req.user?._id,
            userName:  req.user?.name,
            details:   `${analysisType} saved for date: ${payload.date}, shift: ${shiftDisplayNames[targetUnit] || targetUnit}.`,
            timestamp: new Date(),
          });
        }
      } catch (_) {}

      const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';
      const saveEventId = `save_${unit}_${Date.now()}`;
      let emailResult = { success: false, emailStatus: 'failed' };
      try {
        emailResult = await executeSaveAndEmailWorkflow({
          plantIdentifier,
          analysisType,
          unit:           effectiveUnit,
          shift:          shiftDisplayNames[targetUnit] || targetUnit,
          date:           payload.date,
          data:           updatedRecordData,
          submittedBy:    req.user?.name || payload.submittedBy || 'Plant Operator',
          submittedById:  req.user?._id || null,
          company:        updatedRecordData.company,
          explicitRecord: savedDoc,
          rawBody:        { ...payload, rows: mergedRows, data: updatedRecordData },
          saveEventId,
          isTestMode,
        });
      } catch (mailErr) {
        console.warn(`[AutoPlantEmail] Note for ${analysisType} ${targetUnit}:`, mailErr.message);
        emailResult = { success: false, emailStatus: 'failed', error: mailErr.message };
      }

      if (typeof onAfterSave === 'function') {
        try {
          await onAfterSave({ savedDoc, payload, mergedRows, targetUnit, updatedRecordData });
        } catch (postSaveErr) {
          console.warn(`[${analysisType} onAfterSave] Error:`, postSaveErr.message);
        }
      }

      return res.status(200).json({
        success:          true,
        message:          `Successfully saved ${shiftDisplayNames[targetUnit] || targetUnit} in MongoDB ✓`,
        data:             updatedRecordData,
        emailSent:        false,
        emailPending:     false,
        emailStatus:      'disabled',
        emailRecipient:   null,
        emailNotification: null,
        newlySavedShifts: [targetUnit],
        recordId:         savedDoc._id,
        lockedShifts,
        lockedSlots,
        editedFields,
        editAuditHistory,
      });
    } catch (err) {
      console.error(`[${plantCode} ${analysisType} POST] Error:`, err);
      return res.status(500).json({ success: false, message: 'Server error saving analysis record: ' + err.message });
    }
  });

  router.post('/:recordId/retry-email', async (_req, res) =>
    res.status(200).json({ success: true, emailSent: false, emailStatus: 'disabled', message: 'Email notification functionality has been removed.' })
  );
  router.post('/retry-email', async (_req, res) =>
    res.status(200).json({ success: true, emailSent: false, emailStatus: 'disabled', message: 'Email notification functionality has been removed.' })
  );

  return router;
}

/**
 * Creates an Express router implementing the 1-time edit locking workflow
 * for Weekly / Single frequency CO2 Plant analysis options.
 */
function createCO2WeeklyAnalysisRouter({
  analysisType,
  unit,
  tank,
  parameters, // array of param keys e.g. ['cl', 'so4', 'fe', 'tss']
  frequency = 'Once in a Week',
  getNow = () => new Date(),
}) {
  const router = express.Router();
  const inMemoryRecords = [];
  const plantCodes = ['CO2', 'CO2 Plant', 'CO2 PLANT'];
  const unitsOrder = ['week'];

  router.use(protect);

  // ── GET: Fetch existing record for given date ──
  router.get('/', async (req, res) => {
    try {
      const { date, startDate, endDate } = req.query;

      let assignedOperatorEmail = null;
      try {
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('CO2');
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (e) {
        assignedOperatorEmail = null;
      }

      if (date) {
        const query = {
          plantCode: { $in: plantCodes },
          analysisType,
          date,
        };
        if (req.user?.company) {
          const compId = req.user.company._id || req.user.company;
          query.$or = [{ company: compId }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query);
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc && doc.data) {
          const payloadData = doc.data;
          const rows = payloadData.rows || payloadData;

          let lockedSlots = payloadData.lockedSlots;
          const hasStoredLockedSlots = Boolean(lockedSlots && lockedSlots.week);
          if (!hasStoredLockedSlots) {
            const isSaved = Boolean(payloadData.initialSaved);
            const editsCount = Number(payloadData.editCount || 0);
            const isLocked = Boolean(payloadData.isLocked || (editsCount >= 1));
            const correctionUsed = Boolean(payloadData.isLocked || editsCount >= 1);
            lockedSlots = {
              week: {
                isSaved,
                isLocked,
                correctionUsed,
                editsCount,
              },
            };
          }

          const initialSaved = Boolean(lockedSlots.week?.isSaved || payloadData.initialSaved);
          const editCount = Number(lockedSlots.week?.editsCount ?? payloadData.editCount ?? 0);
          const isLocked = Boolean(lockedSlots.week?.isLocked || (editCount >= 1) || payloadData.isLocked);
          const editedFields = payloadData.editedFields || {};
          const editAuditHistory = payloadData.editAuditHistory || [];

          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'disabled',
            assignedOperatorEmail,
            initialSaved,
            editCount,
            isLocked,
            lockedSlots,
            editedFields,
            editAuditHistory,
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              rows,
              initialSaved,
              editCount,
              isLocked,
              lockedSlots,
              editedFields,
              editAuditHistory,
              emailStatus: doc.emailStatus || 'disabled',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }

        const memMatch = inMemoryRecords.find((r) => r.date === date);
        if (memMatch) {
          const isSaved = Boolean(memMatch.initialSaved);
          const editCount = Number(memMatch.editCount || 0);
          const isLocked = Boolean(memMatch.isLocked || editCount >= 1);
          return res.status(200).json({
            success: true,
            assignedOperatorEmail,
            initialSaved,
            editCount,
            isLocked,
            lockedSlots: memMatch.lockedSlots || {
              week: {
                isSaved,
                isLocked,
                correctionUsed: isLocked,
                editsCount: editCount,
              },
            },
            data: memMatch,
          });
        }

        const defaultSlots = {
          week: {
            isSaved: false,
            isLocked: false,
            correctionUsed: false,
            editsCount: 0,
          },
        };

        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          initialSaved: false,
          editCount: 0,
          isLocked: false,
          lockedSlots: defaultSlots,
          data: null,
          message: `No record found for date ${date}`,
        });
      }

      // Range / list query
      const listQuery = {
        plantCode: { $in: plantCodes },
        analysisType,
      };
      if (startDate && endDate) {
        listQuery.date = { $gte: startDate, $lte: endDate };
      }
      if (req.user?.company) {
        listQuery.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(listQuery).sort({ date: -1 }).lean();
      if (docs && docs.length > 0) {
        return res.status(200).json({
          success: true,
          count: docs.length,
          data: docs.map((d) => ({
            ...d.data,
            _id: d._id,
            id: d._id,
            date: d.date,
            emailStatus: d.emailStatus,
            emailRecipient: d.emailRecipient,
          })),
        });
      }

      return res.status(200).json({
        success: true,
        count: inMemoryRecords.length,
        data: inMemoryRecords,
      });
    } catch (err) {
      console.error(`[CO2 ${analysisType} GET] Error:`, err);
      return res.status(500).json({
        success: false,
        message: 'Server error retrieving analysis records: ' + err.message,
      });
    }
  });

  // ── POST: Save with 1-time edit locking ──
  router.post('/', async (req, res) => {
    try {
      const payload = req.body || {};

      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: `Forbidden: ${analysisType} data entry and modification is restricted to authorized Admins.`,
        });
      }

      const validation = validateAnalysisPayload(payload);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.errors[0] || 'Validation failed. Enter numeric values only.',
          errors: validation.errors,
        });
      }

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: `Analysis Date is required to save ${analysisType}.`,
        });
      }

      // Strict operating date guard (06:00–06:00 IST).
      // getNow is injected by route file / test harness.
      // x-test-mode, x-test-now, x-test-env, payload.isTestMode, payload.now are NEVER consulted here.
      const now = getNow();
      const operatingDate = getOperatingDateIST(now);
      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: ${analysisType} records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      // Load existing docs via pickCanonicalDoc
      const query = {
        date: payload.date,
        plantCode: { $in: plantCodes },
        analysisType,
      };
      if (req.user?.company) {
        const compId = req.user.company._id || req.user.company;
        query.$or = [{ company: compId }, { company: null }];
      }

      const matchingDocs = await PlantAnalysisRecord.find(query);
      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};
      const existingRows = existingData.rows || {};

      let existingLockedSlots = existingData.lockedSlots;
      const hasStoredLockedSlots = Boolean(existingLockedSlots && existingLockedSlots.week);
      if (!hasStoredLockedSlots) {
        const isSaved = Boolean(existingData.initialSaved);
        const editsCount = Number(existingData.editCount || 0);
        const isLocked = Boolean(existingData.isLocked || (editsCount >= 1));
        const correctionUsed = Boolean(existingData.isLocked || editsCount >= 1);
        existingLockedSlots = {
          week: {
            isSaved,
            isLocked,
            correctionUsed,
            editsCount,
          },
        };
      }

      const incomingRowsRaw = payload.rows || {};
      const incomingWeek = incomingRowsRaw.week !== undefined ? incomingRowsRaw.week : incomingRowsRaw;
      const incomingRows = {
        week: incomingWeek,
      };

      // Empty first save rejection: 0 valid non-empty values
      const isSavedAlready = Boolean(existingLockedSlots.week?.isSaved);
      if (!isSavedAlready && isUnitEmpty(incomingWeek)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot save empty slot week. At least one non-empty value is required.',
        });
      }

      // Pure engine transition
      const transition = computeSlotTransition({
        unitsOrder,
        lockedSlots: existingLockedSlots,
        storedRows: existingRows,
        incomingRows,
        now,
      });

      // Identical re-save: HTTP 200 { success: true, noChange: true }
      if (transition.noChange) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No new or modified data found to save.',
        });
      }

      // Validation / lock / clear-all rejection
      if (!transition.ok) {
        return res.status(transition.status || 400).json({
          success: false,
          message: transition.message,
        });
      }

      const targetUnit = transition.targetUnit;

      // Audit tracking - only on corrections
      let editedFields = { ...(existingData.editedFields || {}) };
      let editAuditHistory = Array.isArray(existingData.editAuditHistory) ? [...existingData.editAuditHistory] : [];

      if (transition.isCorrection) {
        const auditResult = recordFieldEdits({
          fields: parameters,
          oldRows: existingRows.week || {},
          newRows: incomingRows.week || {},
          editorName: req.user?.name || payload.submittedBy || 'Admin',
          editorId: req.user?._id || null,
          itemKey: 'week',
          existingEditedFields: editedFields,
          existingAuditHistory: editAuditHistory,
        });
        editedFields = auditResult.editedFields;
        editAuditHistory = auditResult.editAuditHistory;
        transition.dotPathUpdates['data.editedFields'] = editedFields;
        transition.dotPathUpdates['data.editAuditHistory'] = editAuditHistory;
      }

      // Dual-write legacy fields
      const isSavedAfter = true;
      const isLockedAfter = Boolean(transition.isCorrection);
      const editCountAfter = transition.isCorrection ? (existingLockedSlots.week?.editsCount || 0) + 1 : 0;

      transition.dotPathUpdates['data.initialSaved'] = isSavedAfter;
      transition.dotPathUpdates['data.editCount'] = editCountAfter;
      transition.dotPathUpdates['data.isLocked'] = isLockedAfter;

      // Dual-write metadata
      transition.dotPathUpdates['submittedBy'] = req.user?.name || payload.submittedBy || 'Plant Operator';
      transition.dotPathUpdates['submittedById'] = req.user?._id || null;
      transition.dotPathUpdates['savedAt'] = new Date();

      let savedDoc = null;
      const compId = req.user?.company ? (req.user.company._id || req.user.company) : null;

      if (!existingDoc) {
        // First save: upsert with $setOnInsert + $set, 409 on race
        const missingFilter = {
          plantCode: 'CO2',
          analysisType,
          date: payload.date,
          ...(compId ? { company: compId } : {}),
          [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true },
        };
        const updateDoc = {
          $setOnInsert: {
            plantName: 'CO2 Plant',
            plantCode: 'CO2',
            analysisType,
            unit: unit || tank,
            tank: tank || unit,
            date: payload.date,
            shift: frequency,
            frequency,
            company: compId,
            createdAt: new Date(),
          },
          $set: transition.dotPathUpdates,
        };

        try {
          const updateResult = await PlantAnalysisRecord.updateOne(missingFilter, updateDoc, { upsert: true });
          if (updateResult.upsertedCount === 0) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Document for this date was created concurrently. Please retry.',
            });
          }
          savedDoc = await PlantAnalysisRecord.findOne({
            plantCode: 'CO2',
            analysisType,
            date: payload.date,
          });
        } catch (err) {
          if (err.code === 11000 || String(err.message).includes('E11000')) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Document for this date was created concurrently. Please retry.',
            });
          }
          throw err;
        }
      } else {
        // Doc exists: findOneAndUpdate by _id, conditional guard on slot state
        const existsFilter = {
          _id: existingDoc._id,
          ...(transition.isCorrection
            ? {
                [`data.lockedSlots.${targetUnit}.isSaved`]: true,
                [`data.lockedSlots.${targetUnit}.correctionUsed`]: false,
                [`data.lockedSlots.${targetUnit}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetUnit}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetUnit}`]: { $exists: false } },
                ],
              }),
        };

        try {
          savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
            existsFilter,
            { $set: transition.dotPathUpdates },
            { new: true }
          );
          if (!savedDoc) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Slot was locked or modified concurrently. Please retry.',
            });
          }
        } catch (err) {
          if (err.code === 11000 || String(err.message).includes('E11000')) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Document was modified concurrently. Please retry.',
            });
          }
          throw err;
        }
      }

      // Email notification workflow
      let assignedOperatorEmail = null;
      try {
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('CO2', {
          company: req.user?.company?._id || req.user?.company || null,
        });
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (uErr) {
        assignedOperatorEmail = null;
      }

      try {
        await executeSaveAndEmailWorkflow({
          plantIdentifier: 'CO2',
          analysisType,
          unit: unit || tank,
          shift: frequency,
          date: payload.date,
          data: savedDoc?.data,
          submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
          submittedById: req.user?._id || null,
          company: req.user?.company?._id || req.user?.company || null,
          explicitRecord: savedDoc,
          rawBody: payload,
        });
      } catch (notifyErr) {
        console.warn(`[CO2 ${analysisType}] Notification dispatch skipped:`, notifyErr.message);
      }

      const resLockedSlots = savedDoc?.data?.lockedSlots || {
        week: {
          isSaved: isSavedAfter,
          isLocked: isLockedAfter,
          correctionUsed: isLockedAfter,
          editsCount: editCountAfter,
        },
      };

      return res.status(200).json({
        success: true,
        message: `Successfully saved ${analysisType} in MongoDB ✓`,
        recordId: savedDoc?._id,
        emailSent: false,
        emailPending: false,
        emailStatus: 'disabled',
        emailRecipient: assignedOperatorEmail,
        initialSaved: isSavedAfter,
        editCount: editCountAfter,
        isLocked: isLockedAfter,
        lockedSlots: resLockedSlots,
        editedFields,
        editAuditHistory,
        data: {
          ...(savedDoc?.data || {}),
          _id: savedDoc?._id,
          id: savedDoc?._id,
          date: payload.date,
          initialSaved: isSavedAfter,
          editCount: editCountAfter,
          isLocked: isLockedAfter,
          lockedSlots: resLockedSlots,
          editedFields,
          editAuditHistory,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
        },
      });
    } catch (err) {
      console.error(`[CO2 ${analysisType} POST] Error:`, err);
      return res.status(500).json({
        success: false,
        message: `Server error processing ${analysisType}: ` + err.message,
      });
    }
  });

  // ── RETRY EMAIL ROUTE (Decommissioned) ──
  router.post('/:recordId/retry-email', async (req, res) => {
    return res.status(200).json({
      success: true,
      emailSent: false,
      emailStatus: 'disabled',
      message: 'Email notification functionality has been removed.',
    });
  });

  router.post('/retry-email', async (req, res) => {
    return res.status(200).json({
      success: true,
      emailSent: false,
      emailStatus: 'disabled',
      message: 'Email notification functionality has been removed.',
    });
  });

  return router;
}

module.exports = {
  createCO2ShiftAnalysisRouter,
  createCO2WeeklyAnalysisRouter,
};
