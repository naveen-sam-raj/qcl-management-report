const express = require('express');
const { PlantAnalysisRecord } = require('../models');
const { protect } = require('../middleware/auth');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isUnitEmpty,
  isValueDifferent,
  getInitialLockState,
  hydrateLockState,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { getPlantAssignedUser } = require('../services/plantNotificationService');

const CANONICAL_ANALYSIS_TYPE = 'CBD Analysis';
const ANALYSIS_TYPES = ['CBD Analysis'];
const PLANT_CODES = ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'];
const CANONICAL_PLANT_CODE = 'OFFSITE';
const CANONICAL_PLANT_NAME = 'OFFSITE Plant';
const CANONICAL_UNIT = 'CBD';

const PARAM_FIELDS = ['ph', 'po4', 'na2so3', 'talk', 'tfe', 'sio2', 'ss', 'tds'];
const NUMERIC_FIELDS = ['ph', 'po4', 'na2so3', 'talk', 'tfe', 'sio2', 'ss', 'tds'];
const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];

const SLOT_META = {
  shift1: { id: 'iShift', shift: 'I SHIFT', defaultTime: '06:00 - 14:00', label: 'I SHIFT' },
  shift2: { id: 'iiShift', shift: 'II SHIFT', defaultTime: '14:00 - 22:00', label: 'II SHIFT' },
  shift3: { id: 'iiiShift', shift: 'III SHIFT', defaultTime: '22:00 - 06:00', label: 'III SHIFT' },
};

const DEFAULT_SHIFTS_TEMPLATE = {
  iShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
};

function getSlotKeyFromInput(val) {
  if (!val) return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'shift1' || s === 's1' || s === '1' || s === 'i' || s === 'i shift' || s === 'ishift') return 'shift1';
  if (s === 'shift2' || s === 's2' || s === '2' || s === 'ii' || s === 'ii shift' || s === 'iishift') return 'shift2';
  if (s === 'shift3' || s === 's3' || s === '3' || s === 'iii' || s === 'iii shift' || s === 'iiishift') return 'shift3';
  return null;
}

function cleanParamValues(shiftData = {}) {
  const cleaned = {};
  for (const f of PARAM_FIELDS) {
    const v = shiftData[f];
    if (v === '' || v === null || v === undefined) {
      cleaned[f] = '';
    } else {
      cleaned[f] = String(v).trim();
    }
  }
  return cleaned;
}

function extractSlotsFromRecordData(data = {}) {
  const shifts = data.shifts || {};
  const readings = Array.isArray(data.readings) ? data.readings : [];

  const s1Obj = shifts.iShift || shifts.shift1 || readings.find((r) => getSlotKeyFromInput(r.shift || r.id || r.time) === 'shift1') || {};
  const s2Obj = shifts.iiShift || shifts.shift2 || readings.find((r) => getSlotKeyFromInput(r.shift || r.id || r.time) === 'shift2') || {};
  const s3Obj = shifts.iiiShift || shifts.shift3 || readings.find((r) => getSlotKeyFromInput(r.shift || r.id || r.time) === 'shift3') || {};

  return {
    shift1: cleanParamValues(s1Obj),
    shift2: cleanParamValues(s2Obj),
    shift3: cleanParamValues(s3Obj),
  };
}

function deriveCbdLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots;
  const legacyShifts = existingData.lockedShifts || {};
  const extractedSlots = extractSlotsFromRecordData(existingData);

  const s1HasData = !isUnitEmpty(extractedSlots.shift1);
  const s2HasData = !isUnitEmpty(extractedSlots.shift2);
  const s3HasData = !isUnitEmpty(extractedSlots.shift3);

  const s1Saved = Boolean(storedSlots?.shift1?.isSaved || legacyShifts.shift1Saved || legacyShifts.s1Saved || s1HasData);
  const s2Saved = Boolean(storedSlots?.shift2?.isSaved || legacyShifts.shift2Saved || legacyShifts.s2Saved || s2HasData);
  const s3Saved = Boolean(storedSlots?.shift3?.isSaved || legacyShifts.shift3Saved || legacyShifts.s3Saved || s3HasData);

  const s1Corr = Boolean(storedSlots?.shift1?.correctionUsed || (legacyShifts.shift1Edits || 0) >= 1 || (legacyShifts.s1Edits || 0) >= 1 || (legacyShifts.shift1Locked && !s2Saved));
  const s2Corr = Boolean(storedSlots?.shift2?.correctionUsed || (legacyShifts.shift2Edits || 0) >= 1 || (legacyShifts.s2Edits || 0) >= 1 || (legacyShifts.shift2Locked && !s3Saved));
  const s3Corr = Boolean(storedSlots?.shift3?.correctionUsed || (legacyShifts.shift3Edits || 0) >= 1 || (legacyShifts.s3Edits || 0) >= 1 || legacyShifts.shift3Locked);

  const lockedSlots = {};
  for (const sk of SHIFT_KEYS) {
    if (storedSlots && storedSlots[sk]) {
      lockedSlots[sk] = {
        isSaved: Boolean(storedSlots[sk].isSaved || storedSlots[sk].initialSaved),
        isLocked: Boolean(storedSlots[sk].isLocked),
        correctionUsed: Boolean(storedSlots[sk].correctionUsed),
      };
    } else {
      const isSaved = (sk === 'shift1' && s1Saved) || (sk === 'shift2' && s2Saved) || (sk === 'shift3' && s3Saved);
      const isLocked = (sk === 'shift1' && s2Saved) || (sk === 'shift2' && s3Saved) || (sk === 'shift3' && s3Corr);
      const corr = (sk === 'shift1' && s1Corr) || (sk === 'shift2' && s2Corr) || (sk === 'shift3' && s3Corr);
      lockedSlots[sk] = {
        isSaved,
        isLocked: Boolean(isLocked || corr),
        correctionUsed: corr,
      };
    }
  }

  const hydratedState = hydrateLockState({ slots: lockedSlots }, { type: 'shift', items: SHIFT_KEYS });
  return {
    lockedSlots,
    lockedShifts: hydratedState,
  };
}

function createCbdRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  router.use(protect);

  /**
   * @desc    Get CBD Analysis data
   * @route   GET /api/cbd-analysis
   * @access  Private (Admin only)
   */
  router.get('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: CBD Analysis data access is restricted to authorized Admins.',
        });
      }

      const { date, startDate, endDate } = req.query;

      let assignedOperatorEmail = null;
      try {
        const companyId = req.user?.company?._id || req.user?.company || null;
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('OFFSITE', { company: companyId });
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (recipErr) {
        assignedOperatorEmail = null;
      }

      const defaultLockedSlots = {
        shift1: { isSaved: false, isLocked: false, correctionUsed: false },
        shift2: { isSaved: false, isLocked: false, correctionUsed: false },
        shift3: { isSaved: false, isLocked: false, correctionUsed: false },
      };
      const defaultLockedShifts = getInitialLockState({ type: 'shift', items: SHIFT_KEYS });

      if (date) {
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
          const { lockedSlots, lockedShifts } = deriveCbdLocks(doc);
          const extractedSlots = extractSlotsFromRecordData(payloadData);

          const shiftsObj = {
            iShift: cleanParamValues(extractedSlots.shift1),
            iiShift: cleanParamValues(extractedSlots.shift2),
            iiiShift: cleanParamValues(extractedSlots.shift3),
          };

          const recordData = {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode || 'OFFSET',
            plantCode: doc.plantCode || 'OFFSITE',
            plantName: CANONICAL_PLANT_NAME,
            unit: CANONICAL_UNIT,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            shifts: shiftsObj,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
            emailStatus: 'disabled',
            emailRecipient: null,
          };

          return res.status(200).json({
            success: true,
            data: recordData,
            record: recordData,
            recordId: doc._id,
            shifts: shiftsObj,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            assignedOperatorEmail,
            emailStatus: 'disabled',
            emailRecipient: null,
          });
        }

        return res.status(200).json({
          success: true,
          data: null,
          record: null,
          recordId: null,
          shifts: JSON.parse(JSON.stringify(DEFAULT_SHIFTS_TEMPLATE)),
          lockedSlots: defaultLockedSlots,
          lockedShifts: defaultLockedShifts,
          editedFields: {},
          editAuditHistory: [],
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: null,
          message: `No record found for date ${date}`,
        });
      }

      // List query
      const companyVal = req.user?.company?._id || req.user?.company || null;
      const query = {
        analysisType: { $in: ANALYSIS_TYPES },
        plantCode: { $in: PLANT_CODES },
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      const results = (docs || []).map((d) => {
        const dData = d.data || {};
        const { lockedSlots, lockedShifts } = deriveCbdLocks(d);
        const extracted = extractSlotsFromRecordData(dData);
        const shiftsObj = {
          iShift: cleanParamValues(extracted.shift1),
          iiShift: cleanParamValues(extracted.shift2),
          iiiShift: cleanParamValues(extracted.shift3),
        };
        return {
          ...dData,
          _id: d._id,
          id: d._id.toString(),
          date: d.date,
          shifts: shiftsObj,
          lockedSlots,
          lockedShifts,
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
      console.error('[CBD GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving CBD records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Save CBD Analysis data (Shift-based with Sequential Locking)
   * @route   POST /api/cbd-analysis
   * @access  Private (Admin only)
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: CBD Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save CBD Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: CBD Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const rawShifts = payload.shifts;
      const rawReadings = payload.readings;

      if (!rawShifts && !rawReadings) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      if (rawShifts && typeof rawShifts === 'object' && Object.keys(rawShifts).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      if (Array.isArray(rawReadings) && rawReadings.length === 0 && !rawShifts) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      const incomingSlots = extractSlotsFromRecordData(payload);

      // Validate numeric fields
      const errors = [];
      ['iShift', 'iiShift', 'iiiShift'].forEach((sKey) => {
        const slotKey = sKey === 'iShift' ? 'shift1' : (sKey === 'iiShift' ? 'shift2' : 'shift3');
        const sData = rawShifts ? (rawShifts[sKey] || rawShifts[slotKey] || {}) : (incomingSlots[slotKey] || {});
        PARAM_FIELDS.forEach((f) => {
          const val = sData[f];
          if (val !== '' && val !== null && val !== undefined) {
            if (isNaN(Number(val))) {
              errors.push(`${sKey} -> ${f.toUpperCase()} must be a valid number.`);
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

      // Fetch existing record in MongoDB
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
      const existingSlots = extractSlotsFromRecordData(existingData);

      const { lockedSlots: currentLockedSlots } = deriveCbdLocks(existingDoc);

      const explicitUnitKey = payload.targetSlot
        ? getSlotKeyFromInput(payload.targetSlot)
        : (payload.shift ? getSlotKeyFromInput(payload.shift) : null);

      const hasAnySaved = SHIFT_KEYS.some((u) => currentLockedSlots[u]?.isSaved);
      const nonEmptyUnsaved = SHIFT_KEYS.filter(
        (u) => !currentLockedSlots[u]?.isSaved && incomingSlots[u] && !isUnitEmpty(incomingSlots[u])
      );

      if (explicitUnitKey) {
        if (!currentLockedSlots[explicitUnitKey]?.isSaved && isUnitEmpty(incomingSlots[explicitUnitKey])) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save empty slot ' + explicitUnitKey + '. At least one non-empty value is required.',
          });
        }
      }

      if (!hasAnySaved) {
        if (explicitUnitKey) {
          const explicitVal = incomingSlots[explicitUnitKey] || {};
          if (isUnitEmpty(explicitVal)) {
            return res.status(400).json({
              success: false,
              message: 'Cannot save empty slot ' + explicitUnitKey + '. At least one non-empty value is required.',
            });
          }
        } else if (nonEmptyUnsaved.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save empty slot ' + SHIFT_KEYS[0] + '. At least one non-empty value is required.',
          });
        }
      }

      // Normalize incomingShiftRows for computeSlotTransition:
      const incomingShiftRows = {};
      if (explicitUnitKey) {
        for (const u of SHIFT_KEYS) {
          if (u === explicitUnitKey) {
            incomingShiftRows[u] = incomingSlots[u] || {};
          } else if (existingSlots[u] !== undefined) {
            incomingShiftRows[u] = existingSlots[u];
          }
        }
      } else {
        for (const u of SHIFT_KEYS) {
          if (currentLockedSlots[u]?.isSaved) {
            if (incomingSlots[u] !== undefined) {
              incomingShiftRows[u] = incomingSlots[u];
            } else if (existingSlots[u] !== undefined) {
              incomingShiftRows[u] = existingSlots[u];
            }
          } else {
            if (incomingSlots[u] !== undefined && !isUnitEmpty(incomingSlots[u])) {
              incomingShiftRows[u] = incomingSlots[u];
            }
          }
        }
      }

      // Compute sequential transition via Universal Lock Engine
      const transition = computeSlotTransition({
        unitsOrder: SHIFT_KEYS,
        lockedSlots: currentLockedSlots,
        storedRows: existingSlots,
        incomingRows: incomingShiftRows,
        now,
      });

      if (transition.noChange) {
        const { lockedShifts: currentFlatLocks } = deriveCbdLocks(existingDoc);
        const finalShiftsObj = {
          iShift: cleanParamValues(existingSlots.shift1),
          iiShift: cleanParamValues(existingSlots.shift2),
          iiiShift: cleanParamValues(existingSlots.shift3),
        };
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          shifts: finalShiftsObj,
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
      const targetSlot = transition.targetUnit;
      const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();

      // Compute next lockedSlots
      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (!isCorrection) {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        const targetIdx = SHIFT_KEYS.indexOf(targetSlot);
        for (let p = 0; p < targetIdx; p++) {
          updatedLockedSlots[SHIFT_KEYS[p]].isLocked = true;
        }
      } else {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: true,
          correctionUsed: true,
        };
      }

      const updatedLockedShifts = hydrateLockState({ slots: updatedLockedSlots }, { type: 'shift', items: SHIFT_KEYS });

      // Field-level flat edit audit on corrections
      const updatedEditedFields = { ...(existingData.editedFields || {}) };
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        const rowId = SLOT_META[targetSlot].id;
        const timeVal = rowId;
        const shiftLabel = SLOT_META[targetSlot].label;
        const targetExisting = existingSlots[targetSlot] || {};
        const targetIncoming = incomingSlots[targetSlot] || {};

        PARAM_FIELDS.forEach((f) => {
          const ov = targetExisting[f];
          const nv = targetIncoming[f];
          if (isValueDifferent(ov, nv)) {
            updatedEditedFields[`${rowId}_${f}`] = true;
            updatedEditedFields[`${targetSlot}_${f}`] = true;
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

      const mergedSlots = { ...existingSlots, [targetSlot]: incomingSlots[targetSlot] };
      const updatedShifts = {
        iShift: cleanParamValues(mergedSlots.shift1),
        iiShift: cleanParamValues(mergedSlots.shift2),
        iiiShift: cleanParamValues(mergedSlots.shift3),
      };

      const docUpdatePayload = {
        'data.shifts': updatedShifts,
        'data.lockedSlots': updatedLockedSlots,
        'data.lockedShifts': updatedLockedShifts,
        'data.editedFields': updatedEditedFields,
        'data.editAuditHistory': updatedAuditHistory,
        'data.submittedBy': editorName,
        'data.submittedById': editorId,
        'data.submittedAt': nowIso,
        'data.unit': CANONICAL_UNIT,
        'data.analysisType': CANONICAL_ANALYSIS_TYPE,
        'data.plant': 'OFFSET',
        'data.plantCode': CANONICAL_PLANT_CODE,
        'data.plantName': CANONICAL_PLANT_NAME,
        date: payload.date,
        shift: 'All Shifts',
        plantCode: CANONICAL_PLANT_CODE,
        plantName: CANONICAL_PLANT_NAME,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        unit: CANONICAL_UNIT,
        submittedBy: editorName,
        submittedById: editorId,
        savedAt: now,
        company: companyVal,
        emailStatus: 'disabled',
        emailRecipient: null,
      };

      if (Array.isArray(existingData.readings)) {
        docUpdatePayload['data.readings'] = existingData.readings;
      }

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
            plantName: CANONICAL_PLANT_NAME,
            plantCode: CANONICAL_PLANT_CODE,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: CANONICAL_UNIT,
            date: payload.date,
            shift: 'All Shifts',
            status: 'completed',
            submittedBy: editorName,
            submittedById: editorId,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: {
              id: `cbd_${Date.now()}`,
              date: payload.date,
              plant: 'OFFSET',
              plantCode: CANONICAL_PLANT_CODE,
              plantName: CANONICAL_PLANT_NAME,
              unit: CANONICAL_UNIT,
              analysisType: CANONICAL_ANALYSIS_TYPE,
              shifts: updatedShifts,
              lockedSlots: updatedLockedSlots,
              lockedShifts: updatedLockedShifts,
              editedFields: updatedEditedFields,
              editAuditHistory: updatedAuditHistory,
              submittedBy: editorName,
              submittedById: editorId,
              submittedAt: nowIso,
              company: companyVal,
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
        shifts: updatedShifts,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
      };

      return res.status(200).json({
        success: true,
        message: 'CBD Analysis saved successfully in MongoDB ✓',
        recordId: savedDoc._id,
        data: finalRecordData,
        record: finalRecordData,
        shifts: updatedShifts,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        emailStatus: 'disabled',
        emailRecipient: null,
        emailSent: false,
      });
    } catch (error) {
      console.error('[CBD POST] Uncaught error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing CBD analysis: ' + error.message,
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

const defaultRouter = createCbdRouter();
defaultRouter.createRouter = createCbdRouter;
defaultRouter.createCbdRouter = createCbdRouter;

module.exports = defaultRouter;
