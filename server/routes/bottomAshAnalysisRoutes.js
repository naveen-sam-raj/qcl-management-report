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

const CANONICAL_ANALYSIS_TYPE = 'Bottom Ash Analysis';
const ANALYSIS_TYPES = ['Bottom Ash Analysis', 'Bottom Ash'];
const PLANT_CODES = ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'];
const CANONICAL_PLANT_CODE = 'OFFSITE';
const CANONICAL_PLANT_NAME = 'OFFSITE Plant';
const CANONICAL_UNIT = 'Bottom ash';

const NUMERIC_FIELDS = ['combustible', 'gcv', 'moisture'];
const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];

const SLOT_META = {
  shift1: { id: '1', shift: 'I SHIFT', defaultTime: '07:00', label: 'I SHIFT' },
  shift2: { id: '2', shift: 'II SHIFT', defaultTime: '15:00', label: 'II SHIFT' },
  shift3: { id: '3', shift: 'III SHIFT', defaultTime: '23:00', label: 'III SHIFT' },
};

const DEFAULT_READINGS_TEMPLATE = [
  { id: '1', time: '07:00', combustible: '', gcv: '', moisture: '' },
  { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
];

function getSlotKeyFromRow(r) {
  if (!r) return null;
  const idStr = String(r.id || '').trim();
  const timeStr = String(r.time || '').trim();
  const shiftStr = String(r.shift || '').trim().toUpperCase();

  if (idStr === '1' || timeStr === '07:00' || shiftStr.includes('I SHIFT') || shiftStr === 'I' || shiftStr === 'SHIFT1') return 'shift1';
  if (idStr === '2' || timeStr === '15:00' || shiftStr.includes('II SHIFT') || shiftStr === 'II' || shiftStr === 'SHIFT2') return 'shift2';
  if (idStr === '3' || timeStr === '23:00' || shiftStr.includes('III SHIFT') || shiftStr === 'III' || shiftStr === 'SHIFT3') return 'shift3';


  return null;
}

function getSlotKeyFromInput(val) {
  if (!val) return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'shift1' || s === 's1' || s === '1' || s === 'i' || s === 'i shift') return 'shift1';
  if (s === 'shift2' || s === 's2' || s === '2' || s === 'ii' || s === 'ii shift') return 'shift2';
  if (s === 'shift3' || s === 's3' || s === '3' || s === 'iii' || s === 'iii shift') return 'shift3';
  return null;
}

function cleanParamValues(row = {}) {
  const cleaned = {};
  for (const f of NUMERIC_FIELDS) {
    const v = row[f];
    if (v === '' || v === null || v === undefined) {
      cleaned[f] = '';
    } else {
      const num = Number(v);
      cleaned[f] = !isNaN(num) ? String(num) : String(v).trim();
    }
  }
  return cleaned;
}

function deriveBottomAshLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots;
  const legacyShifts = existingData.lockedShifts || {};
  const readings = Array.isArray(existingData.readings) ? existingData.readings : [];

  const s1Row = readings.find((r) => getSlotKeyFromRow(r) === 'shift1');
  const s2Row = readings.find((r) => getSlotKeyFromRow(r) === 'shift2');
  const s3Row = readings.find((r) => getSlotKeyFromRow(r) === 'shift3');

  const s1HasData = s1Row && !isUnitEmpty(s1Row);
  const s2HasData = s2Row && !isUnitEmpty(s2Row);
  const s3HasData = s3Row && !isUnitEmpty(s3Row);

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

function createBottomAshRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  router.use(protect);

  /**
   * @desc    Get Bottom Ash Analysis data
   * @route   GET /api/bottom-ash-analysis
   * @access  Private (Admin only)
   */
  router.get('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Bottom Ash Analysis data access is restricted to authorized Admins.',
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
          const { lockedSlots, lockedShifts } = deriveBottomAshLocks(doc);
          const rawReadings = Array.isArray(payloadData.readings)
            ? payloadData.readings
            : (payloadData.shifts || payloadData.rows || []);

          const matchedSlotKeys = new Set();
          const mergedReadings = DEFAULT_READINGS_TEMPLATE.map((defRow) => {
            const slotKey = getSlotKeyFromRow(defRow);
            const found = rawReadings.find((r) => getSlotKeyFromRow(r) === slotKey);
            if (found) {
              matchedSlotKeys.add(found.id || found.time);
              return {
                id: defRow.id,
                time: defRow.time,
                combustible: found.combustible !== undefined && found.combustible !== null ? String(found.combustible) : '',
                gcv: found.gcv !== undefined && found.gcv !== null ? String(found.gcv) : '',
                moisture: found.moisture !== undefined && found.moisture !== null ? String(found.moisture) : '',
              };
            }
            return { ...defRow };
          });

          // Append legacy extra rows
          rawReadings.forEach((r) => {
            const k = r.id || r.time;
            if (!matchedSlotKeys.has(k) && !getSlotKeyFromRow(r)) {
              mergedReadings.push(r);
            }
          });

          const recordData = {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode || 'OFFSET',
            plantCode: doc.plantCode || 'OFFSITE',
            plantName: 'OFFSITE Plant',
            unit: 'Bottom ash',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            readings: mergedReadings,
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
            readings: mergedReadings,
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
          readings: DEFAULT_READINGS_TEMPLATE.map((r) => ({ ...r })),
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
      console.error('[BottomAsh GET] Error fetching records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving Bottom Ash records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Save Bottom Ash Analysis data (Sequential Shift Progression)
   * @route   POST /api/bottom-ash-analysis
   * @access  Private (Admin only)
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Bottom Ash Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Bottom Ash Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Bottom Ash Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
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

      // Prevent duplicate time slots
      const timeSlots = readings.map((r) => String(r.time || '').trim()).filter(Boolean);
      const uniqueSlots = new Set(timeSlots);
      if (timeSlots.length !== uniqueSlots.size) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate sampling time slots detected. Each observation must have a unique time slot.',
        });
      }

      // Parse incoming readings by slotKey
      const incomingSlots = {};
      const incomingExtraRows = [];
      readings.forEach((r) => {
        const sk = getSlotKeyFromRow(r);
        if (sk) {
          incomingSlots[sk] = cleanParamValues(r);
        } else {
          incomingExtraRows.push(r);
        }
      });

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
      const existingReadings = Array.isArray(existingData.readings)
        ? existingData.readings
        : (existingData.shifts || existingData.rows || []);

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

      const { lockedSlots: currentLockedSlots } = deriveBottomAshLocks(existingDoc);

      const explicitUnitKey = payload.targetSlot || (payload.shift ? getSlotKeyFromInput(payload.shift) : null);

      // Check if any unit is currently saved in this document
      const hasAnySaved = SHIFT_KEYS.some((u) => currentLockedSlots[u]?.isSaved);
      const nonEmptyUnsaved = SHIFT_KEYS.filter(
        (u) => !currentLockedSlots[u]?.isSaved && incomingSlots[u] && !isUnitEmpty(incomingSlots[u])
      );

      // If explicitUnitKey is provided, check if saving an unsaved slot as empty
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
        const { lockedShifts: currentFlatLocks } = deriveBottomAshLocks(existingDoc);
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          readings: existingReadings.length > 0 ? existingReadings : DEFAULT_READINGS_TEMPLATE.map((r) => ({ ...r })),
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
        const timeVal = SLOT_META[targetSlot].defaultTime;
        const shiftLabel = SLOT_META[targetSlot].label;
        const targetExisting = existingSlots[targetSlot] || {};
        const targetIncoming = incomingSlots[targetSlot] || {};

        NUMERIC_FIELDS.forEach((f) => {
          const ov = targetExisting[f];
          const nv = targetIncoming[f];
          if (isValueDifferent(ov, nv)) {
            updatedEditedFields[`${rowId}_${f}`] = true;
            updatedEditedFields[`${timeVal}_${f}`] = true;
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

      // Rebuild updated readings array preserving template rows and legacy extra rows
      const mergedSlots = { ...existingSlots, [targetSlot]: incomingSlots[targetSlot] };
      const updatedReadings = DEFAULT_READINGS_TEMPLATE.map((defRow) => {
        const sk = getSlotKeyFromRow(defRow);
        const slotVals = mergedSlots[sk] || {};
        const existingRow = existingReadings.find((r) => getSlotKeyFromRow(r) === sk) || {};
        const incomingRow = readings.find((r) => getSlotKeyFromRow(r) === sk) || {};
        return {
          id: defRow.id,
          time: existingRow.time || incomingRow.time || defRow.time,
          combustible: slotVals.combustible !== undefined && slotVals.combustible !== null ? String(slotVals.combustible) : '',
          gcv: slotVals.gcv !== undefined && slotVals.gcv !== null ? String(slotVals.gcv) : '',
          moisture: slotVals.moisture !== undefined && slotVals.moisture !== null ? String(slotVals.moisture) : '',
        };
      });

      // Preserve legacy extra rows
      const existingExtra = existingReadings.filter((r) => !getSlotKeyFromRow(r));
      existingExtra.forEach((extraRow) => {
        updatedReadings.push(extraRow);
      });

      const docUpdatePayload = {
        'data.readings': updatedReadings,
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
              id: `bottomash_${Date.now()}`,
              date: payload.date,
              plant: 'OFFSET',
              plantCode: CANONICAL_PLANT_CODE,
              plantName: CANONICAL_PLANT_NAME,
              unit: CANONICAL_UNIT,
              analysisType: CANONICAL_ANALYSIS_TYPE,
              readings: updatedReadings,
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
        readings: updatedReadings,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
      };

      return res.status(200).json({
        success: true,
        message: 'Bottom Ash Analysis saved successfully in MongoDB ✓',
        recordId: savedDoc._id,
        data: finalRecordData,
        record: finalRecordData,
        readings: updatedReadings,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        emailStatus: 'disabled',
        emailRecipient: null,
        emailSent: false,
      });
    } catch (error) {
      console.error('[BottomAsh POST] Uncaught error saving data:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while processing Bottom Ash analysis: ' + error.message,
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

const defaultRouter = createBottomAshRouter();
defaultRouter.createRouter = createBottomAshRouter;
defaultRouter.createBottomAshRouter = createBottomAshRouter;

module.exports = defaultRouter;
