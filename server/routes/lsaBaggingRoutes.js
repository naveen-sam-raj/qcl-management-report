const express = require('express');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const CANONICAL_ANALYSIS_TYPE = 'LSA Bagging Analysis';
const ANALYSIS_TYPES = [
  'LSA Bagging Analysis',
  'LSA Bagging',
  'LSA BAGGING ANALYSIS',
  'LSA Bagging Shift Analysis',
  'LSA Bagging Hourly Monitoring',
];
const PLANT_CODES = ['SA', 'SA Plant', 'SA PLANT'];
const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];
const SHIFT_PARAMS = ['na2co3', 'nacl', 'fe', 'na2so4', 'vm', 'ir', 'bd', 'turbidity'];

const SHIFT_DISPLAY_NAMES = {
  shift1: 'SHIFT 1',
  shift2: 'SHIFT 2',
  shift3: 'SHIFT 3',
};

const PARAM_DISPLAY_NAMES = {
  na2co3: 'Na₂CO₃ %',
  nacl: 'NaCl %',
  fe: 'Fe₂O₃ %',
  na2so4: 'Na₂SO₄ %',
  vm: 'VM %',
  ir: 'IR %',
  bd: 'BD (g/L)',
  turbidity: 'Turbidity (NTU)',
};

const DEFAULT_HOURLY_SLOTS = [
  { id: 'h0600', time: '06:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0700', time: '07:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0800', time: '08:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0900', time: '09:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1000', time: '10:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1100', time: '11:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1200', time: '12:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1300', time: '13:00', shift: 'Shift 1', nacl: '', bd: '' },

  { id: 'h1400', time: '14:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1500', time: '15:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1600', time: '16:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1700', time: '17:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1800', time: '18:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1900', time: '19:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2000', time: '20:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2100', time: '21:00', shift: 'Shift 2', nacl: '', bd: '' },

  { id: 'h2200', time: '22:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h2300', time: '23:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0000', time: '00:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0100', time: '01:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0200', time: '02:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0300', time: '03:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0400', time: '04:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0500', time: '05:00', shift: 'Shift 3', nacl: '', bd: '' },
];

/**
 * Determines which shift an hourly time slot belongs to:
 * - SHIFT 1: 06:00 to 13:59
 * - SHIFT 2: 14:00 to 21:59
 * - SHIFT 3: 22:00 to 05:59
 */
const getShiftFromTime = (timeStr) => {
  if (!timeStr) return 'Shift 1';
  const hour = parseInt(String(timeStr).split(':')[0], 10);
  if (isNaN(hour)) return 'Shift 1';
  if (hour >= 6 && hour < 14) return 'Shift 1';
  if (hour >= 14 && hour < 22) return 'Shift 2';
  return 'Shift 3';
};

const normalizeShiftKey = (s) => {
  if (!s) return 'all';
  const str = String(s).toLowerCase().replace(/\s+/g, '');
  if (str === 'shift1' || str === 's1' || str === '1') return 'shift1';
  if (str === 'shift2' || str === 's2' || str === '2') return 'shift2';
  if (str === 'shift3' || str === 's3' || str === '3') return 'shift3';
  return 'all';
};

function deriveBaggingLocks(doc) {
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

  // Progression:
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

function createLSABaggingRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  router.get('/', async (req, res) => {
    try {
      const { date } = req.query;

      let assignedOperatorEmail = null;
      try {
        const { getPlantAssignedUser } = require('../services/plantNotificationService');
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA', { company: req.user?.company });
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (recipErr) {
        console.warn('Operator email resolution note:', recipErr.message);
      }

      const defaultLocks = deriveBaggingLocks(null);

      if (date) {
        const query = {
          date,
          plantCode: { $in: PLANT_CODES },
          analysisType: { $in: ANALYSIS_TYPES },
        };

        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company }, { company: null }];
        }

        let matchingDocs = [];
        try {
          if (PlantAnalysisRecord) {
            matchingDocs = await PlantAnalysisRecord.find(query).lean();
          }
        } catch (e) {
          console.warn('[LSABagging] Mongo lookup fallback:', e.message);
        }

        const doc = pickCanonicalDoc(matchingDocs);

        if (doc) {
          const payloadData = doc.data || {};
          const shiftAnalysis = payloadData.shiftAnalysis || doc.shiftAnalysis || {};
          const hourlyReadings = Array.isArray(payloadData.hourlyReadings)
            ? payloadData.hourlyReadings
            : Array.isArray(doc.hourlyReadings)
            ? doc.hourlyReadings
            : DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s }));

          const { lockedSlots, lockedShifts } = deriveBaggingLocks(doc);

          return res.status(200).json({
            success: true,
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id.toString(),
              date: doc.date,
              plant: doc.plantCode,
              analysisType: doc.analysisType,
              shiftAnalysis,
              hourlyReadings,
              lockedSlots,
              lockedShifts,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              submittedBy: doc.submittedBy,
            },
            record: {
              ...doc,
              shiftAnalysis,
              hourlyReadings,
              lockedSlots,
              lockedShifts,
            },
            recordId: doc._id,
            shiftAnalysis,
            hourlyReadings,
            lockedSlots,
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'disabled',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
          });
        }

        return res.status(200).json({
          success: true,
          data: null,
          record: null,
          shiftAnalysis: null,
          hourlyReadings: DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s })),
          lockedSlots: defaultLocks.lockedSlots,
          lockedShifts: defaultLocks.lockedShifts,
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
        });
      }

      let records = [];
      try {
        if (PlantAnalysisRecord) {
          records = await PlantAnalysisRecord.find({
            plantCode: { $in: PLANT_CODES },
            analysisType: { $in: ANALYSIS_TYPES },
          })
            .sort({ date: -1, createdAt: -1 })
            .limit(30)
            .lean();
        }
      } catch (err) {
        console.warn('Could not fetch LSA Bagging records:', err.message);
      }

      return res.status(200).json({
        success: true,
        count: records.length,
        data: records.map((r) => {
          const derived = deriveBaggingLocks(r);
          return {
            id: r._id,
            _id: r._id,
            date: r.date,
            plant: r.plantCode,
            analysisType: r.analysisType,
            shiftAnalysis: r.data?.shiftAnalysis || r.shiftAnalysis || {},
            hourlyReadings: r.data?.hourlyReadings || r.hourlyReadings || [],
            lockedSlots: derived.lockedSlots,
            lockedShifts: derived.lockedShifts,
            editedFields: r.data?.editedFields || {},
            editAuditHistory: r.data?.editAuditHistory || [],
            submittedBy: r.submittedBy,
          };
        }),
        assignedOperatorEmail,
      });
    } catch (error) {
      console.error('Error fetching LSA Bagging Analysis records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while fetching LSA Bagging Analysis records.',
        error: error.message,
      });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: LSA Bagging data entry and modification is restricted to Company Admins.',
        });
      }

      const payload = req.body;
      if (!payload || !payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save LSA Bagging Analysis.',
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

      const { shiftAnalysis = {}, hourlyReadings = [], saveType = 'all', targetShift = 'all' } = payload;
      const normalizedTarget = normalizeShiftKey(targetShift);

      // Validate numeric parameters
      const errors = [];
      SHIFT_KEYS.forEach((shiftKey) => {
        const shiftData = shiftAnalysis[shiftKey] || {};
        SHIFT_PARAMS.forEach((paramKey) => {
          const val = shiftData[paramKey];
          if (val !== undefined && val !== null && val !== '') {
            const num = Number(val);
            if (isNaN(num)) {
              errors.push(`Shift parameter '${shiftKey}.${paramKey}' must be a valid number.`);
            }
          }
        });
      });

      if (Array.isArray(hourlyReadings)) {
        hourlyReadings.forEach((row, idx) => {
          ['nacl', 'bd'].forEach((param) => {
            const val = row[param];
            if (val !== undefined && val !== null && val !== '') {
              const num = Number(val);
              if (isNaN(num)) {
                errors.push(`Hourly reading row #${idx + 1} (${row.time}): ${param} must be a valid number.`);
              }
            }
          });
        });
      }

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
        if (PlantAnalysisRecord) {
          matchingDocs = await PlantAnalysisRecord.find(query).lean();
        }
      } catch (e) {
        console.warn('[LSABagging] Query warning:', e.message);
      }

      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};
      const existingShiftAnalysis = existingData.shiftAnalysis || existingDoc?.shiftAnalysis || {};
      const existingHourlyReadings = Array.isArray(existingData.hourlyReadings)
        ? existingData.hourlyReadings
        : Array.isArray(existingDoc?.hourlyReadings)
        ? existingDoc.hourlyReadings
        : DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s }));

      const { lockedSlots: currentLockedSlots, lockedShifts: currentFlatLocks } =
        deriveBaggingLocks(existingDoc);

      const editor = req.user?.name || payload.submittedBy || 'Plant Operator';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();
      const saveEventId = payload.saveEventId || `lsa_bagging_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      let editedFields = JSON.parse(JSON.stringify(existingData.editedFields || {}));
      let editAuditHistory = [...(existingData.editAuditHistory || [])];

      // =========================================================================
      // BRANCH A: HOURLY ROUTINE MONITORING SAVE (saveType === 'hourly')
      // =========================================================================
      if (saveType === 'hourly') {
        if (!Array.isArray(hourlyReadings) || hourlyReadings.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Hourly readings array is required for hourly save.',
          });
        }

        // Group incoming and existing hourly readings by shift
        const hourlyChangedShifts = [];
        for (const sk of SHIFT_KEYS) {
          const extRows = existingHourlyReadings.filter((r) => normalizeShiftKey(getShiftFromTime(r.time)) === sk);
          const incRows = hourlyReadings.filter((r) => normalizeShiftKey(getShiftFromTime(r.time)) === sk);

          let hasDiff = false;
          // Row addition or deletion
          if (extRows.length !== incRows.length) {
            hasDiff = true;
          } else {
            for (const ir of incRows) {
              const er = extRows.find((r) => r.time === ir.time);
              if (!er) {
                hasDiff = true;
                break;
              }
              if (isValueDifferent(er.nacl, ir.nacl) || isValueDifferent(er.bd, ir.bd)) {
                hasDiff = true;
                break;
              }
            }
          }

          if (hasDiff) {
            hourlyChangedShifts.push(sk);
          }
        }

        // Identical hourly re-save
        if (hourlyChangedShifts.length === 0) {
          return res.status(200).json({
            success: true,
            noChange: true,
            message: 'No changes',
            data: existingData,
            record: existingData,
            recordId: existingDoc?._id,
            shiftAnalysis: existingShiftAnalysis,
            hourlyReadings: existingHourlyReadings,
            lockedSlots: currentLockedSlots,
            lockedShifts: currentFlatLocks,
            editedFields,
            editAuditHistory,
            emailStatus: 'disabled',
            emailSent: false,
          });
        }

        // Only one shift's hourly readings may change per save
        if (hourlyChangedShifts.length > 1) {
          return res.status(400).json({
            success: false,
            message: `Hourly submission affects multiple shifts (${hourlyChangedShifts.join(', ')}). Only one shift may be modified per save.`,
          });
        }

        const targetHourlyShift = hourlyChangedShifts[0];

        // Check if containing shift is permanently locked
        if (currentLockedSlots[targetHourlyShift]?.isLocked) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit hourly readings for ${targetHourlyShift}: shift is permanently locked.`,
          });
        }

        // Check predecessor sequence: preceding shifts must not be waiting
        const targetIdx = SHIFT_KEYS.indexOf(targetHourlyShift);
        if (targetIdx > 0) {
          for (let p = 0; p < targetIdx; p++) {
            const pKey = SHIFT_KEYS[p];
            if (!currentLockedSlots[pKey]?.isSaved) {
              return res.status(400).json({
                success: false,
                message: `Cannot save hourly readings for ${targetHourlyShift}: preceding shift ${pKey} is not saved.`,
              });
            }
          }
        }

        // Saved hourly row constraints: cannot delete or change time on existing saved custom rows
        for (const er of existingHourlyReadings) {
          const shiftBelonging = normalizeShiftKey(getShiftFromTime(er.time));
          if (shiftBelonging === targetHourlyShift && er.isCustom) {
            const ir = hourlyReadings.find((r) => r.time === er.time || r.id === er.id);
            if (!ir) {
              return res.status(400).json({
                success: false,
                message: `Cannot delete saved custom hourly slot '${er.time}'.`,
              });
            }
            if (ir.time !== er.time) {
              return res.status(400).json({
                success: false,
                message: `Cannot modify sampling time of saved custom hourly slot '${er.time}'.`,
              });
            }
          }
        }

        // Audit changes in hourly readings
        if (!editedFields.hourly) editedFields.hourly = {};

        // Audit row additions
        hourlyReadings.forEach((newRow) => {
          const existingMatch = existingHourlyReadings.find((r) => r.time === newRow.time);
          if (!existingMatch && newRow.isCustom) {
            editAuditHistory.push({
              date: submissionDate,
              section: 'Hourly Routine Monitoring',
              action: 'ROW_ADDED',
              shift: newRow.shift,
              samplingTime: newRow.time,
              details: `Custom hourly slot added for ${newRow.time} (${newRow.shift})`,
              editor,
              timestamp: nowIso,
              saveEventId,
            });
          }
        });

        // Audit field edits
        hourlyReadings.forEach((newRow) => {
          const oldRow = existingHourlyReadings.find((r) => r.time === newRow.time);
          if (oldRow) {
            ['nacl', 'bd'].forEach((param) => {
              const oldVal = oldRow[param];
              const newVal = newRow[param];
              if (isValueDifferent(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
                const rowIdKey = newRow.id || newRow.time;
                if (!editedFields.hourly[rowIdKey]) editedFields.hourly[rowIdKey] = {};
                editedFields.hourly[rowIdKey][param] = true;

                editAuditHistory.push({
                  date: submissionDate,
                  section: 'Hourly Routine Monitoring',
                  shift: newRow.shift,
                  samplingTime: newRow.time,
                  field: param,
                  fieldName: param === 'nacl' ? 'NaCl %' : 'BD (g/L)',
                  oldValue: oldVal,
                  newValue: newVal,
                  editor,
                  timestamp: nowIso,
                  saveEventId,
                });
              }
            });
          }
        });

        // Hourly saves do NOT advance the shift chain (default decision)
        const updatedHourlyDocPayload = {
          'data.hourlyReadings': hourlyReadings,
          'data.editedFields': editedFields,
          'data.editAuditHistory': editAuditHistory,
          'data.submittedBy': editor,
          'data.submittedAt': nowIso,
          'data.saveEventId': saveEventId,
          submittedBy: editor,
          submittedById: editorId,
          status: 'completed',
          emailStatus: 'disabled',
          emailRecipient: null,
        };

        if (existingDoc?._id) {
          const updateFilter = {
            _id: existingDoc._id,
            [`data.lockedSlots.${targetHourlyShift}.isLocked`]: { $ne: true },
          };

          const updateRes = await PlantAnalysisRecord.updateOne(updateFilter, {
            $set: updatedHourlyDocPayload,
          });

          if (updateRes.matchedCount === 0) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: This shift was locked or updated concurrently by another user.',
            });
          }
        } else {
          await PlantAnalysisRecord.create({
            plantName: 'SA Plant',
            plantCode: 'SA',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: 'LSA Bagging',
            date: submissionDate,
            shift: 'All Shifts',
            status: 'completed',
            submittedBy: editor,
            submittedById: editorId,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: {
              id: `lsa_bagging_${Date.now()}`,
              date: submissionDate,
              plant: 'SA',
              plantCode: 'SA',
              unit: 'LSA Bagging',
              analysisType: CANONICAL_ANALYSIS_TYPE,
              shiftAnalysis: existingShiftAnalysis,
              hourlyReadings,
              lockedSlots: currentLockedSlots,
              lockedShifts: currentFlatLocks,
              editedFields,
              editAuditHistory,
              submittedBy: editor,
              submittedById: editorId,
              submittedAt: nowIso,
              company: companyVal,
              saveEventId,
            },
          });
        }

        return res.status(200).json({
          success: true,
          message: `Hourly readings for ${targetHourlyShift} saved successfully.`,
          data: {
            date: submissionDate,
            shiftAnalysis: existingShiftAnalysis,
            hourlyReadings,
            lockedSlots: currentLockedSlots,
            lockedShifts: currentFlatLocks,
            editedFields,
            editAuditHistory,
          },
          record: {
            date: submissionDate,
            shiftAnalysis: existingShiftAnalysis,
            hourlyReadings,
            lockedSlots: currentLockedSlots,
            lockedShifts: currentFlatLocks,
            editedFields,
            editAuditHistory,
          },
          shiftAnalysis: existingShiftAnalysis,
          hourlyReadings,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentFlatLocks,
          editedFields,
          editAuditHistory,
          statusFromApi: 'disabled',
          emailStatus: 'disabled',
          emailSent: false,
          saveEventId,
        });
      }

      // =========================================================================
      // BRANCH B: SHIFT ANALYSIS SAVE (saveType !== 'hourly')
      // =========================================================================
      // Check if an explicitly targeted or single-provided unsaved shift is empty
      const effectiveTarget = (normalizedTarget !== 'all' && SHIFT_KEYS.includes(normalizedTarget))
        ? normalizedTarget
        : (Object.keys(shiftAnalysis).length === 1 && SHIFT_KEYS.includes(Object.keys(shiftAnalysis)[0]))
        ? Object.keys(shiftAnalysis)[0]
        : null;

      if (effectiveTarget) {
        const incTarget = shiftAnalysis[effectiveTarget] || {};
        const isTargetEmpty = SHIFT_PARAMS.every(
          (pk) => incTarget[pk] === '' || incTarget[pk] === null || incTarget[pk] === undefined
        );
        if (isTargetEmpty && !currentLockedSlots[effectiveTarget]?.isSaved) {
          return res.status(400).json({
            success: false,
            message: `Cannot save empty shift ${effectiveTarget}. At least one parameter value is required.`,
          });
        }
      }

      const changedShifts = [];
      for (const sk of SHIFT_KEYS) {
        if (!shiftAnalysis[sk]) {
          continue;
        }
        const ext = existingShiftAnalysis[sk] || {};
        const inc = shiftAnalysis[sk] || {};

        const hasDiff = SHIFT_PARAMS.some((pk) => isValueDifferent(ext[pk], inc[pk]));
        if (hasDiff) {
          changedShifts.push(sk);
        }
      }

      // Identical re-save
      if (changedShifts.length === 0) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          shiftAnalysis: existingShiftAnalysis,
          hourlyReadings: existingHourlyReadings,
          lockedSlots: currentLockedSlots,
          lockedShifts: currentFlatLocks,
          editedFields,
          editAuditHistory,
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

      const targetShiftKey = changedShifts[0];
      const incTargetShift = shiftAnalysis[targetShiftKey] || {};

      // Empty shift check
      const isShiftEmpty = SHIFT_PARAMS.every(
        (pk) => incTargetShift[pk] === '' || incTargetShift[pk] === null || incTargetShift[pk] === undefined
      );

      if (isShiftEmpty) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty shift ${targetShiftKey}. At least one parameter value is required.`,
        });
      }

      // Prepare units for computeSlotTransition
      const storedUnits = {};
      const incomingUnits = {};
      for (const sk of SHIFT_KEYS) {
        storedUnits[sk] = {};
        incomingUnits[sk] = {};
        SHIFT_PARAMS.forEach((pk) => {
          storedUnits[sk][pk] = existingShiftAnalysis[sk]?.[pk];
          if (sk === targetShiftKey) {
            incomingUnits[sk][pk] = incTargetShift[pk];
          } else {
            incomingUnits[sk][pk] = existingShiftAnalysis[sk]?.[pk];
          }
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

      // Update lockedSlots
      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (!isCorrection) {
        updatedLockedSlots[targetShiftKey] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
        const targetIdx = SHIFT_KEYS.indexOf(targetShiftKey);
        for (let p = 0; p < targetIdx; p++) {
          updatedLockedSlots[SHIFT_KEYS[p]].isLocked = true;
        }
        if (targetIdx + 1 < SHIFT_KEYS.length) {
          updatedLockedSlots[SHIFT_KEYS[targetIdx + 1]].isLocked = false;
        }
      } else {
        updatedLockedSlots[targetShiftKey] = {
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

      // Audit correction edits
      if (isCorrection) {
        const oldShift = existingShiftAnalysis[targetShiftKey] || {};
        const newShift = shiftAnalysis[targetShiftKey] || {};

        SHIFT_PARAMS.forEach((pk) => {
          const oldVal = oldShift[pk];
          const newVal = newShift[pk];
          if (isValueDifferent(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
            if (!editedFields[targetShiftKey]) editedFields[targetShiftKey] = {};
            editedFields[targetShiftKey][pk] = true;

            editAuditHistory.push({
              date: submissionDate,
              section: 'Shift Analysis',
              shift: SHIFT_DISPLAY_NAMES[targetShiftKey] || targetShiftKey,
              shiftKey: targetShiftKey,
              field: pk,
              fieldName: PARAM_DISPLAY_NAMES[pk] || pk,
              oldValue: oldVal,
              newValue: newVal,
              editor,
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }

      // Merge shiftAnalysis cleanly
      const mergedShiftAnalysis = {
        shift1: { ...(existingShiftAnalysis.shift1 || {}) },
        shift2: { ...(existingShiftAnalysis.shift2 || {}) },
        shift3: { ...(existingShiftAnalysis.shift3 || {}) },
      };
      mergedShiftAnalysis[targetShiftKey] = { ...incTargetShift };

      const docUpdatePayload = {
        'data.shiftAnalysis': mergedShiftAnalysis,
        'data.hourlyReadings': existingHourlyReadings,
        'data.lockedSlots': updatedLockedSlots,
        'data.lockedShifts': updatedLockedShifts,
        'data.editedFields': editedFields,
        'data.editAuditHistory': editAuditHistory,
        'data.submittedBy': editor,
        'data.submittedAt': nowIso,
        'data.saveEventId': saveEventId,
        'data.unit': 'LSA Bagging',
        'data.section': 'LSA Bagging',
        'data.analysisType': CANONICAL_ANALYSIS_TYPE,
        'data.plant': 'SA',
        'data.plantCode': 'SA',
        'data.plantName': 'SA Plant',
        submittedBy: editor,
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
                [`data.lockedSlots.${targetShiftKey}.isSaved`]: true,
                [`data.lockedSlots.${targetShiftKey}.correctionUsed`]: false,
                [`data.lockedSlots.${targetShiftKey}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetShiftKey}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetShiftKey}`]: { $exists: false } },
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
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: CANONICAL_ANALYSIS_TYPE,
          unit: 'LSA Bagging',
          date: submissionDate,
          shift: 'All Shifts',
          status: 'completed',
          submittedBy: editor,
          submittedById: editorId,
          company: companyVal,
          emailStatus: 'disabled',
          emailRecipient: null,
          data: {
            id: `lsa_bagging_${Date.now()}`,
            date: submissionDate,
            plant: 'SA',
            plantCode: 'SA',
            unit: 'LSA Bagging',
            section: 'LSA Bagging',
            analysisType: CANONICAL_ANALYSIS_TYPE,
            shiftAnalysis: mergedShiftAnalysis,
            hourlyReadings: existingHourlyReadings,
            lockedSlots: updatedLockedSlots,
            lockedShifts: updatedLockedShifts,
            editedFields,
            editAuditHistory,
            submittedBy: editor,
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
          ? `Shift ${targetShiftKey} corrected successfully. Slot is now permanently locked.`
          : `Shift ${targetShiftKey} saved successfully.`,
        data: {
          date: submissionDate,
          shiftAnalysis: mergedShiftAnalysis,
          hourlyReadings: existingHourlyReadings,
          lockedSlots: updatedLockedSlots,
          lockedShifts: updatedLockedShifts,
          editedFields,
          editAuditHistory,
        },
        record: {
          date: submissionDate,
          shiftAnalysis: mergedShiftAnalysis,
          hourlyReadings: existingHourlyReadings,
          lockedSlots: updatedLockedSlots,
          lockedShifts: updatedLockedShifts,
          editedFields,
          editAuditHistory,
        },
        shiftAnalysis: mergedShiftAnalysis,
        hourlyReadings: existingHourlyReadings,
        lockedSlots: updatedLockedSlots,
        lockedShifts: updatedLockedShifts,
        editedFields,
        editAuditHistory,
        statusFromApi: 'disabled',
        emailStatus: 'disabled',
        emailSent: false,
        saveEventId,
      });
    } catch (error) {
      console.error('[LSABagging Save] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while saving LSA Bagging Analysis data: ' + error.message,
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

const defaultRouter = createLSABaggingRouter();
defaultRouter.createRouter = createLSABaggingRouter;
module.exports = defaultRouter;
