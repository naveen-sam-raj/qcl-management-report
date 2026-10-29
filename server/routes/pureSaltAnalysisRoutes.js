const express = require('express');
const { PureSaltAnalysis, ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { generatePureSaltAnalysisExcel } = require('../services/excelService');
const { sendPureSaltAnalysisReport } = require('../services/emailService');
const { getPlantAssignedUser, executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
const { protect } = require('../middleware/auth');
const {
  computeSlotTransition,
  recordFieldEdits,
  pickCanonicalDoc,
  isUnitEmpty,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const PARAMETERS = ['nacl', 'ca', 'mg', 'so4', 'ir', 'h2o'];
const TARGET_ROWS = ['rawSalt', 'shift1', 'shift2', 'shift3', 'composition'];
const SHIFT_ITEMS = ['shift1', 'shift2', 'shift3'];

const SHIFT_DISPLAY_NAMES = {
  rawSalt: 'RAW SALT',
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
  composition: 'COMPOSITION',
};

const defaultRow = () => ({ nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null });

/**
 * Normalizes Map / Object for editedFields
 */
const normalizeEditedFields = (fields) => {
  if (!fields) return {};
  if (fields instanceof Map) return Object.fromEntries(fields);
  if (typeof fields.toObject === 'function') return fields.toObject();
  return { ...fields };
};

/**
 * Wraps docs so pickCanonicalDoc can inspect top-level rows
 */
const pickCanonicalPureSalt = (docs) => {
  if (!Array.isArray(docs) || docs.length === 0) return null;
  if (docs.length === 1) return docs[0];
  const wrapped = docs.map((d) => {
    const raw = typeof d.toObject === 'function' ? d.toObject() : d;
    return {
      ...raw,
      data: raw.data || { rows: raw.rows || {} },
      _orig: d,
    };
  });
  const best = pickCanonicalDoc(wrapped);
  return best?._orig || best;
};

/**
 * Derives in-memory lock states
 */
const derivePureSaltLocks = (doc) => {
  const lShifts = doc?.lockedShifts || {};
  const s1Saved = Boolean(lShifts.shift1Saved);
  const s2Saved = Boolean(lShifts.shift2Saved);
  const s3Saved = Boolean(lShifts.shift3Saved);
  const s1Corr  = Boolean(lShifts.shift1Edits >= 1 || (lShifts.shift1Locked && !s2Saved));
  const s2Corr  = Boolean(lShifts.shift2Edits >= 1 || (lShifts.shift2Locked && !s3Saved));
  const s3Corr  = Boolean(lShifts.shift3Edits >= 1);

  const s1Lock = Boolean(lShifts.shift1Locked || s2Saved || s1Corr);
  const s2Lock = Boolean(lShifts.shift2Locked || s3Saved || s2Corr);
  const s3Lock = Boolean(lShifts.shift3Locked || s3Corr);

  const rawSaltSaved = Boolean(lShifts.rawSaltSaved || lShifts.rawSalt);
  const rawSaltLocked = Boolean(lShifts.rawSaltLocked || lShifts.rawSalt);

  const compSaved = Boolean(lShifts.compositionSaved || lShifts.composition);
  const compLocked = Boolean(lShifts.compositionLocked || lShifts.composition);

  const allPermanentlyLocked = Boolean(s3Lock && rawSaltLocked && compLocked);

  const lockedShifts = {
    rawSalt: rawSaltLocked,
    rawSaltLocked,
    rawSaltSaved,
    shift1: s1Lock,
    shift1Locked: s1Lock,
    shift1Saved: s1Saved,
    shift1Edits: s1Corr ? 1 : 0,
    shift2: !s1Saved || s2Lock,
    shift2Locked: s2Lock,
    shift2Saved: s2Saved,
    shift2Edits: s2Corr ? 1 : 0,
    shift3: !s2Saved || s3Lock,
    shift3Locked: s3Lock,
    shift3Saved: s3Saved,
    shift3Edits: s3Corr ? 1 : 0,
    composition: compLocked,
    compositionLocked: compLocked,
    compositionSaved: compSaved,
    allPermanentlyLocked,
  };

  const lockedSlots = {
    shift1: { isSaved: s1Saved, isLocked: s1Lock, correctionUsed: s1Corr },
    shift2: { isSaved: s2Saved, isLocked: s2Lock, correctionUsed: s2Corr },
    shift3: { isSaved: s3Saved, isLocked: s3Lock, correctionUsed: s3Corr },
    rawSalt: { isSaved: rawSaltSaved, isLocked: rawSaltLocked, correctionUsed: false },
    composition: { isSaved: compSaved, isLocked: compLocked, correctionUsed: false },
  };

  return { lockedShifts, lockedSlots };
};

/**
 * Router Factory with dependency-injected getNow
 */
function createPureSaltAnalysisRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  // In-memory fallback
  const analysisRecords = [];

  router.use(protect);

  // ── GET ──────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const { date } = req.query;

      let assignedOperatorEmail = null;
      try {
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (uErr) {
        console.warn('[PureSalt GET] Operator lookup warning:', uErr.message);
      }

      if (date) {
        const query = {
          date,
          plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
          analysisType: 'Pure Salt Analysis',
        };
        if (req.user?.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const matchingDocs = await PureSaltAnalysis.find(query);
        let doc = pickCanonicalPureSalt(matchingDocs);

        // Fallback check against PlantAnalysisRecord if not in PureSaltAnalysis collection
        if (!doc && PlantAnalysisRecord) {
          const fallbackQuery = {
            date,
            plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
            analysisType: 'Pure Salt Analysis',
          };
          if (req.user?.company) {
            fallbackQuery.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
          }
          const fallbackDocs = await PlantAnalysisRecord.find(fallbackQuery);
          const fallback = pickCanonicalDoc(fallbackDocs);
          if (fallback) {
            doc = {
              _id: fallback._id,
              date: fallback.date,
              plant: fallback.plantName || 'ACL Plant',
              analysisType: fallback.analysisType,
              shift: fallback.shift || 'All Shifts (I, II, III)',
              rows: fallback.data?.rows || fallback.data || {},
              lockedShifts: fallback.data?.lockedShifts,
              editedFields: fallback.data?.editedFields || {},
              editAuditHistory: fallback.data?.editAuditHistory || [],
              submittedBy: fallback.submittedBy,
              company: fallback.company,
              emailStatus: fallback.emailStatus || 'pending',
              emailRecipient: fallback.emailRecipient || assignedOperatorEmail,
            };
          }
        }

        if (doc) {
          const rawDoc = typeof doc.toObject === 'function' ? doc.toObject() : doc;
          const { lockedShifts, lockedSlots } = derivePureSaltLocks(rawDoc);
          const normEdited = normalizeEditedFields(rawDoc.editedFields);

          return res.status(200).json({
            success: true,
            data: [{ ...rawDoc, lockedShifts, lockedSlots, editedFields: normEdited }],
            lockedShifts,
            lockedSlots,
            editedFields: normEdited,
            editAuditHistory: rawDoc.editAuditHistory || [],
            assignedOperatorEmail,
            emailStatus: rawDoc.emailStatus || 'pending',
            emailRecipient: rawDoc.emailRecipient || assignedOperatorEmail,
          });
        }
      }

      const { lockedShifts, lockedSlots } = derivePureSaltLocks({});
      return res.status(200).json({
        success: true,
        data: [],
        lockedShifts,
        lockedSlots,
        editedFields: {},
        editAuditHistory: [],
        assignedOperatorEmail,
        emailStatus: 'pending',
        emailRecipient: assignedOperatorEmail,
      });
    } catch (error) {
      console.error('[PureSalt GET] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message,
      });
    }
  });

  // ── POST ─────────────────────────────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const payload = req.body || {};

      // ── Enforce Authorization: Only Admins can modify Pure Salt Analysis ──
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Pure Salt Analysis data entry and modification is restricted to Company Admins.',
        });
      }

      const validation = validateAnalysisPayload(payload);
      if (!validation.isValid) {
        return res.status(400).json({ success: false, message: validation.errors[0], errors: validation.errors });
      }

      if (!payload.date) {
        return res.status(400).json({ success: false, message: 'Analysis date is required.' });
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(payload.date)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Expected YYYY-MM-DD.',
        });
      }

      // ── Strict Operating Date Guard (06:00–06:00 IST) ──
      // x-test-mode, x-test-now, x-test-env, payload.isTestMode, payload.now are IGNORED.
      const now = getNow();
      const operatingDate = getOperatingDateIST(now);
      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Pure Salt Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';

      // ── Load Canonical Document ──
      const query = {
        date: payload.date,
        plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: payload.analysisType || 'Pure Salt Analysis',
      };
      if (req.user?.company) {
        query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }

      const matchingDocs = await PureSaltAnalysis.find(query);
      const existingDoc = pickCanonicalPureSalt(matchingDocs);
      const existingDocRaw = existingDoc
        ? (typeof existingDoc.toObject === 'function' ? existingDoc.toObject() : existingDoc)
        : null;

      const existingRows = {
        rawSalt: defaultRow(),
        shift1: defaultRow(),
        shift2: defaultRow(),
        shift3: defaultRow(),
        composition: defaultRow(),
        ...(existingDocRaw?.rows || {}),
      };

      const { lockedShifts: currentLocks, lockedSlots: currentSlots } = derivePureSaltLocks(existingDocRaw);

      // ── Detect Differences Across the 5 Rows ──
      const incomingRows = payload.rows || {};
      const sectionDiffs = [];

      for (const k of TARGET_ROWS) {
        const oldR = existingRows[k] || {};
        const newR = incomingRows[k];
        if (!newR) continue;

        let diffFound = false;
        for (const p of PARAMETERS) {
          const oVal = oldR[p] ?? null;
          let nVal = newR[p] ?? null;
          if (nVal === '') nVal = null;
          if (isValueDifferent(oVal, nVal)) {
            diffFound = true;
            break;
          }
        }
        if (diffFound) {
          sectionDiffs.push(k);
        }
      }

      // Enforce: only one section modified per POST
      if (sectionDiffs.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Shift-wise input locking enforced: Only one shift can be edited and saved at a time.',
        });
      }

      // ── Handle 0 Section Diffs (Identical Re-save or Empty First Save) ──
      if (sectionDiffs.length === 0) {
        const hasAnySaved = TARGET_ROWS.some((k) => currentSlots[k]?.isSaved);
        if (!hasAnySaved) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save empty section shift1. At least one non-empty value is required.',
          });
        }
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No new or modified data found to save.',
        });
      }

      const targetUnit = sectionDiffs[0];
      const targetIncoming = incomingRows[targetUnit] || {};

      // ── Empty Section Check ──
      if (isUnitEmpty(targetIncoming)) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty section ${targetUnit}. At least one non-empty value is required.`,
        });
      }

      let dotPathUpdates = {};
      let isCorrection = false;
      let nextSlots = { ...currentSlots };

      // ── CASE A: Independent Sections (rawSalt / composition) ──
      if (targetUnit === 'rawSalt' || targetUnit === 'composition') {
        const alreadySaved = currentSlots[targetUnit]?.isSaved;
        if (alreadySaved) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[targetUnit] || targetUnit} because it is permanently locked.`,
          });
        }

        // Clean incoming values
        const cleanedRow = {};
        for (const p of PARAMETERS) {
          const v = targetIncoming[p];
          cleanedRow[p] = v !== '' && v !== null && v !== undefined ? Number(v) : null;
        }

        dotPathUpdates[`rows.${targetUnit}`] = cleanedRow;
        dotPathUpdates[`lockedShifts.${targetUnit}`] = true;
        dotPathUpdates[`lockedShifts.${targetUnit}Locked`] = true;
        dotPathUpdates[`lockedShifts.${targetUnit}Saved`] = true;

        nextSlots[targetUnit] = { isSaved: true, isLocked: true, correctionUsed: false };
      }

      // ── CASE B: Sequential Shift Sections (shift1 -> shift2 -> shift3) ──
      if (SHIFT_ITEMS.includes(targetUnit)) {
        const shiftSlotsOnly = {
          shift1: currentSlots.shift1,
          shift2: currentSlots.shift2,
          shift3: currentSlots.shift3,
        };

        const incomingShiftRows = {};
        for (const u of SHIFT_ITEMS) {
          if (u === targetUnit) {
            const cleaned = {};
            for (const p of PARAMETERS) {
              const v = targetIncoming[p];
              cleaned[p] = v !== '' && v !== null && v !== undefined ? Number(v) : null;
            }
            incomingShiftRows[u] = cleaned;
          } else if (shiftSlotsOnly[u]?.isSaved) {
            incomingShiftRows[u] = existingRows[u];
          }
        }

        const transition = computeSlotTransition({
          unitsOrder: SHIFT_ITEMS,
          lockedSlots: shiftSlotsOnly,
          storedRows: existingRows,
          incomingRows: incomingShiftRows,
          now,
        });

        if (transition.noChange) {
          return res.status(200).json({
            success: true,
            noChange: true,
            message: 'No new or modified data found to save.',
          });
        }

        if (!transition.ok) {
          return res.status(transition.status || 400).json({
            success: false,
            message: transition.message,
          });
        }

        isCorrection = transition.isCorrection;

        // Verify sequential start
        if (!existingDoc && targetUnit !== 'shift1') {
          return res.status(400).json({
            success: false,
            message: `Sequential restriction: shift1 must be completed and saved before proceeding to ${targetUnit}.`,
          });
        }

        const shiftSlotsAfter = {};
        SHIFT_ITEMS.forEach((s) => {
          shiftSlotsAfter[s] = { ...(shiftSlotsOnly[s] || { isSaved: false, isLocked: false, correctionUsed: false }) };
        });
        shiftSlotsAfter[targetUnit] = {
          isSaved: true,
          correctionUsed: Boolean(transition.isCorrection),
          isLocked: Boolean(transition.isCorrection),
        };
        const targetIdx = SHIFT_ITEMS.indexOf(targetUnit);
        for (let p = 0; p < targetIdx; p++) {
          shiftSlotsAfter[SHIFT_ITEMS[p]].isLocked = true;
        }

        const s1Saved = Boolean(shiftSlotsAfter.shift1?.isSaved);
        const s2Saved = Boolean(shiftSlotsAfter.shift2?.isSaved);
        const s3Saved = Boolean(shiftSlotsAfter.shift3?.isSaved);
        const s1Corr  = Boolean(shiftSlotsAfter.shift1?.correctionUsed);
        const s2Corr  = Boolean(shiftSlotsAfter.shift2?.correctionUsed);
        const s3Corr  = Boolean(shiftSlotsAfter.shift3?.correctionUsed);
        const s1Lock  = Boolean(shiftSlotsAfter.shift1?.isLocked || s2Saved || s1Corr);
        const s2Lock  = Boolean(shiftSlotsAfter.shift2?.isLocked || s3Saved || s2Corr);
        const s3Lock  = Boolean(shiftSlotsAfter.shift3?.isLocked || s3Corr);

        dotPathUpdates[`rows.${targetUnit}`] = incomingShiftRows[targetUnit];
        dotPathUpdates['lockedShifts.shift1Saved']  = s1Saved;
        dotPathUpdates['lockedShifts.shift2Saved']  = s2Saved;
        dotPathUpdates['lockedShifts.shift3Saved']  = s3Saved;
        dotPathUpdates['lockedShifts.shift1Locked'] = s1Lock;
        dotPathUpdates['lockedShifts.shift2Locked'] = s2Lock;
        dotPathUpdates['lockedShifts.shift3Locked'] = s3Lock;
        dotPathUpdates['lockedShifts.shift1Edits']  = s1Corr ? 1 : 0;
        dotPathUpdates['lockedShifts.shift2Edits']  = s2Corr ? 1 : 0;
        dotPathUpdates['lockedShifts.shift3Edits']  = s3Corr ? 1 : 0;
        dotPathUpdates['lockedShifts.shift1']       = s1Lock;
        dotPathUpdates['lockedShifts.shift2']       = !s1Saved || s2Lock;
        dotPathUpdates['lockedShifts.shift3']       = !s2Saved || s3Lock;

        nextSlots.shift1 = { isSaved: s1Saved, isLocked: s1Lock, correctionUsed: s1Corr };
        nextSlots.shift2 = { isSaved: s2Saved, isLocked: s2Lock, correctionUsed: s2Corr };
        nextSlots.shift3 = { isSaved: s3Saved, isLocked: s3Lock, correctionUsed: s3Corr };
      }

      // ── Audit field edits on correction ──
      let editedFields = normalizeEditedFields(existingDocRaw?.editedFields);
      let editAuditHistory = Array.isArray(existingDocRaw?.editAuditHistory)
        ? [...existingDocRaw.editAuditHistory]
        : [];

      if (isCorrection) {
        const auditResult = recordFieldEdits({
          fields: PARAMETERS,
          oldRows: existingRows[targetUnit] || {},
          newRows: targetIncoming || {},
          editorName: req.user?.name || payload.submittedBy || 'Admin',
          editorId: req.user?._id || null,
          itemKey: targetUnit,
          existingEditedFields: editedFields,
          existingAuditHistory: editAuditHistory,
        });
        editedFields = auditResult.editedFields;
        editAuditHistory = auditResult.editAuditHistory;
        dotPathUpdates['editedFields'] = editedFields;
        dotPathUpdates['editAuditHistory'] = editAuditHistory;
      }

      dotPathUpdates['submittedBy']  = req.user?.name || payload.submittedBy || 'Plant Operator';
      dotPathUpdates['submittedById'] = req.user?._id || null;
      dotPathUpdates['savedAt']       = new Date();

      // ── Conditional Atomic MongoDB Write ──
      let savedRecord = null;

      if (!existingDoc) {
        const insertFilter = {
          date: payload.date,
          plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
          analysisType: payload.analysisType || 'Pure Salt Analysis',
        };
        if (targetUnit === 'rawSalt') {
          insertFilter['lockedShifts.rawSalt'] = { $ne: true };
        } else if (targetUnit === 'composition') {
          insertFilter['lockedShifts.composition'] = { $ne: true };
        } else if (targetUnit === 'shift1') {
          insertFilter['lockedShifts.shift1Saved'] = { $ne: true };
        }
        if (req.user?.company) {
          insertFilter.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const updateDoc = {
          $setOnInsert: {
            date: payload.date,
            plant: 'ACL Plant',
            analysisType: payload.analysisType || 'Pure Salt Analysis',
            shift: 'All Shifts (I, II, III)',
            company: req.user?.company?._id || req.user?.company || null,
            createdAt: new Date(),
          },
          $set: dotPathUpdates,
        };

        try {
          const updateRes = await PureSaltAnalysis.updateOne(insertFilter, updateDoc, { upsert: true, strict: false });
          if (updateRes.upsertedCount === 0 && updateRes.matchedCount === 0) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Section was updated concurrently. Please refresh.',
            });
          }
          savedRecord = await PureSaltAnalysis.findOne(query).lean();
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
        const updateFilter = { _id: existingDoc._id };
        if (targetUnit === 'rawSalt') {
          updateFilter['lockedShifts.rawSalt'] = { $ne: true };
        } else if (targetUnit === 'composition') {
          updateFilter['lockedShifts.composition'] = { $ne: true };
        } else if (targetUnit === 'shift1') {
          if (!currentSlots.shift1.isSaved) {
            updateFilter['lockedShifts.shift1Saved'] = { $ne: true };
          } else {
            updateFilter['lockedShifts.shift2Saved'] = { $ne: true };
            updateFilter['lockedShifts.shift1'] = { $ne: true };
          }
        } else if (targetUnit === 'shift2') {
          if (!currentSlots.shift2.isSaved) {
            updateFilter['lockedShifts.shift2Saved'] = { $ne: true };
          } else {
            updateFilter['lockedShifts.shift3Saved'] = { $ne: true };
            updateFilter['lockedShifts.shift2'] = { $ne: true };
          }
        } else if (targetUnit === 'shift3') {
          if (!currentSlots.shift3.isSaved) {
            updateFilter['lockedShifts.shift3Saved'] = { $ne: true };
          } else {
            updateFilter['lockedShifts.shift3Edits'] = { $ne: 1 };
          }
        }

        const updateRes = await PureSaltAnalysis.updateOne(updateFilter, { $set: dotPathUpdates }, { strict: false });
        if (updateRes.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: Section was updated concurrently. Please refresh.',
          });
        }
        savedRecord = await PureSaltAnalysis.findById(existingDoc._id).lean();
      }

      // ── Mirror Write to PlantAnalysisRecord ──
      try {
        if (PlantAnalysisRecord && savedRecord) {
          const mirrorFilter = {
            plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
            analysisType: 'Pure Salt Analysis',
            date: payload.date,
          };
          if (req.user?.company) {
            mirrorFilter.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
          }

          const mirrorData = savedRecord.toObject ? savedRecord.toObject() : savedRecord;
          await PlantAnalysisRecord.findOneAndUpdate(
            mirrorFilter,
            {
              plantName: 'ACL Plant',
              plantCode: 'ACL',
              analysisType: 'Pure Salt Analysis',
              unit: '',
              date: payload.date,
              data: {
                ...mirrorData,
                rows: savedRecord.rows,
                lockedShifts: savedRecord.lockedShifts,
                editedFields: normalizeEditedFields(savedRecord.editedFields),
                editAuditHistory: savedRecord.editAuditHistory,
              },
              shift: savedRecord.shift || 'All Shifts (I, II, III)',
              submittedBy: savedRecord.submittedBy,
              submittedById: savedRecord.submittedById,
              company: savedRecord.company,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      } catch (syncErr) {
        console.warn('[PureSaltAnalysis] PlantAnalysisRecord mirror warning:', syncErr.message);
      }

      const savedRaw = savedRecord.toObject ? savedRecord.toObject() : savedRecord;
      const { lockedShifts: finalLocks, lockedSlots: finalSlots } = derivePureSaltLocks(savedRaw);
      const finalEdited = normalizeEditedFields(savedRaw.editedFields);

      return res.status(200).json({
        success: true,
        message: `Successfully saved ${SHIFT_DISPLAY_NAMES[targetUnit] || targetUnit} in MongoDB ✓`,
        data: savedRecord,
        lockedShifts: finalLocks,
        lockedSlots: finalSlots,
        editedFields: finalEdited,
        editAuditHistory: savedRaw.editAuditHistory || [],
        emailSent: false,
        emailPending: false,
        emailStatus: 'disabled',
        emailRecipient: '',
        newlySavedShifts: [targetUnit],
      });
    } catch (error) {
      console.error('[PureSaltAnalysis API] Error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Unable to save the data. Please try again.',
        error: error.message,
      });
    }
  });

  // ── Retry Email Route ────────────────────────────────────────────────────────
  router.post('/:id/retry-email', async (req, res) => {
    try {
      const { id } = req.params;

      let record = null;
      if (PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
        record = await PureSaltAnalysis.findById(id);
      }
      if (!record) {
        record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
      }

      if (!record) {
        return res.status(404).json({ success: false, message: 'Analysis record not found.' });
      }

      const result = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'ACL',
        analysisType: record.analysisType || 'Pure Salt Analysis',
        unit: record.unit || '',
        shift: record.shift || 'All Shifts',
        date: record.date,
        data: record.rows || record.data,
        submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
        submittedById: req.user?._id || record.submittedById,
        company: req.user?.company?._id || req.user?.company || record.company,
        explicitRecord: record,
      });

      return res.status(result.success && result.emailSent ? 200 : 400).json(result);
    } catch (error) {
      console.error('[Retry Email] Error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ── Download Excel Route ─────────────────────────────────────────────────────
  router.get('/:id/download-excel', async (req, res) => {
    try {
      const { id } = req.params;
      let record = null;

      if (PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
        record = await PureSaltAnalysis.findById(id);
      }
      if (!record) {
        record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
      }

      if (!record) {
        return res.status(404).json({ success: false, message: 'Analysis record not found.' });
      }

      const excelResult = await generatePureSaltAnalysisExcel(record);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
      return res.send(excelResult.buffer);
    } catch (error) {
      console.error('[PureSaltAnalysis] Error downloading Excel:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

const defaultRouter = createPureSaltAnalysisRouter();
defaultRouter.createPureSaltAnalysisRouter = createPureSaltAnalysisRouter;

module.exports = defaultRouter;
