const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache fallback for LSA Bagging records
const lsaBaggingRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * Returns current date string formatted as YYYY-MM-DD in Asia/Kolkata timezone
 */
const getTodayKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const isValDiff = (o, n) => {
  if (o === undefined || o === null || o === '') o = null;
  if (n === undefined || n === null || n === '') n = null;
  if (o === null && n === null) return false;
  if (o === null || n === null) return true;
  if (!isNaN(Number(o)) && !isNaN(Number(n))) {
    return Number(o) !== Number(n);
  }
  return String(o) !== String(n);
};

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

/**
 * Determines which shift an hourly time slot belongs to:
 * - SHIFT 1: 06:00 to 13:59
 * - SHIFT 2: 14:00 to 21:59
 * - SHIFT 3: 22:00 to 05:59
 */
const getShiftFromTime = (timeStr) => {
  if (!timeStr) return 'Shift 1';
  const hour = parseInt(timeStr.split(':')[0], 10);
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

/**
 * @desc    Save LSA Bagging Analysis data with shift-wise sequential locking
 * @route   POST /api/lsa-bagging & /api/lsa-bagging-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA Bagging Analysis.',
      });
    }

    // 1. Current-Date Restriction Enforcement (Asia/Kolkata timezone)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Submissions are only permitted for the current date (${todayKolkata} in Asia/Kolkata timezone). Past and future dates cannot be submitted.`,
      });
    }

    const { shiftAnalysis = {}, hourlyReadings = [], saveType = 'all', targetShift = 'all' } = payload;
    const errors = [];

    // Validate shift-wise parameters (Na2CO3, NaCl, Fe, Na2SO4, VM, IR, BD, Turbidity)
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

    // Validate hourly parameters (NaCl, BD), check duplicate times, and verify shift alignment
    const seenTimes = new Set();
    if (Array.isArray(hourlyReadings)) {
      hourlyReadings.forEach((reading, idx) => {
        if (reading.time) {
          const t = reading.time.trim();
          if (seenTimes.has(t)) {
            errors.push(`Duplicate sampling time '${t}' detected in hourly routine monitoring.`);
          }
          seenTimes.add(t);

          // Verify time belongs to assigned shift
          const expectedShift = getShiftFromTime(t);
          if (reading.shift && reading.shift !== expectedShift) {
            errors.push(`Sampling time '${t}' belongs to ${expectedShift} (06:00–14:00 for Shift 1, 14:00–22:00 for Shift 2, 22:00–06:00 for Shift 3), but was assigned to ${reading.shift}.`);
          }
        }

        ['nacl', 'bd'].forEach((param) => {
          const val = reading[param];
          if (val !== undefined && val !== null && val !== '') {
            const num = Number(val);
            if (isNaN(num)) {
              errors.push(`Hourly reading at ${reading.time || `row ${idx + 1}`} '${param}' must be a valid number.`);
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

    // 2. Lookup existing document in MongoDB Atlas
    const query = {
      date: payload.date,
      plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
      analysisType: {
        $in: [
          'LSA Bagging Analysis',
          'LSA Bagging',
          'LSA BAGGING ANALYSIS',
        ],
      },
    };

    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = null;
    try {
      if (PlantAnalysisRecord) {
        existingDoc = await PlantAnalysisRecord.findOne(query);
      }
    } catch (e) {
      console.warn('MongoDB existing lookup warning:', e.message);
    }

    const existingData = existingDoc?.data || lsaBaggingRecords.find((r) => r.date === payload.date) || {};
    const existingShiftAnalysis = existingData.shiftAnalysis || existingDoc?.shiftAnalysis || {};
    const existingHourlyReadings = Array.isArray(existingData.hourlyReadings)
      ? existingData.hourlyReadings
      : Array.isArray(existingDoc?.hourlyReadings)
      ? existingDoc.hourlyReadings
      : [];

    let editedFields = { ...(existingData.editedFields || {}) };
    let editAuditHistory = [...(existingData.editAuditHistory || [])];

    // 3. Extract and initialize Sequential Locking State
    const existingLockedShifts = existingData.lockedShifts || {
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      shift1Locked: false,
      shift2Locked: false,
      shift3Locked: false,
      shift3Edits: 0,
    };

    const s1Saved = Boolean(existingLockedShifts.shift1Saved || existingLockedShifts.s1Saved);
    const s2Saved = Boolean(existingLockedShifts.shift2Saved || existingLockedShifts.s2Saved);
    const s3Saved = Boolean(existingLockedShifts.shift3Saved || existingLockedShifts.s3Saved);
    const s3Edits = Number(existingLockedShifts.shift3Edits || existingLockedShifts.s3Edits || 0);

    const s1Locked = Boolean(existingLockedShifts.shift1Locked || existingLockedShifts.s1Locked || s2Saved);
    const s2Locked = Boolean(existingLockedShifts.shift2Locked || existingLockedShifts.s2Locked || s3Saved);
    const s3Locked = Boolean(existingLockedShifts.shift3Locked || existingLockedShifts.s3Locked || (s3Saved && s3Edits >= 1));

    const lockedShifts = {
      shift1Saved: s1Saved,
      shift2Saved: s2Saved,
      shift3Saved: s3Saved,
      shift1Locked: s1Locked,
      shift2Locked: s2Locked,
      shift3Locked: s3Locked,
      shift3Edits: s3Edits,
    };

    const nowIso = new Date().toISOString();
    const saveEventId = payload.saveEventId || `lsa_bagging_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const editor = req.user?.name || payload.submittedBy || 'Plant Operator';

    const normalizedTarget = normalizeShiftKey(targetShift);
    const shouldProcessShifts = saveType !== 'hourly' && (payload.shiftAnalysis || saveType === 'shift' || normalizedTarget !== 'all');
    const shouldProcessHourly = saveType !== 'shift' && (Array.isArray(payload.hourlyReadings) || saveType === 'hourly');

    // 4. Enforce Sequential Shift Locking on Section 1: Shift Analysis
    if (shouldProcessShifts) {
      if (normalizedTarget === 'shift1') {
        if (s1Locked) {
          return res.status(400).json({
            success: false,
            message: 'SHIFT 1 is permanently locked as SHIFT 2 has already been saved.',
          });
        }
      } else if (normalizedTarget === 'shift2') {
        if (!s1Saved) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save SHIFT 2 before SHIFT 1 is saved.',
          });
        }
        if (s2Locked) {
          return res.status(400).json({
            success: false,
            message: 'SHIFT 2 is permanently locked as SHIFT 3 has already been saved.',
          });
        }
      } else if (normalizedTarget === 'shift3') {
        if (!s2Saved) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save SHIFT 3 before SHIFT 2 is saved.',
          });
        }
        if (s3Locked) {
          return res.status(400).json({
            success: false,
            message: 'SHIFT 3 has already reached its maximum edit limit (one final edit allowed) and is permanently locked.',
          });
        }
      } else if (normalizedTarget === 'all') {
        // Saving all shifts: check sequential order and locks
        const hasS2Data = Object.values(shiftAnalysis.shift2 || {}).some((v) => v !== '' && v !== null && v !== undefined);
        const hasS3Data = Object.values(shiftAnalysis.shift3 || {}).some((v) => v !== '' && v !== null && v !== undefined);

        if (hasS2Data && !s1Saved) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save SHIFT 2 before SHIFT 1 is saved.',
          });
        }
        if (hasS3Data && !s2Saved) {
          return res.status(400).json({
            success: false,
            message: 'Cannot save SHIFT 3 before SHIFT 2 is saved.',
          });
        }

        // Check if locked shifts are being modified
        if (s1Locked && Object.keys(shiftAnalysis.shift1 || {}).length > 0) {
          const s1Modified = SHIFT_PARAMS.some((p) => isValDiff(existingShiftAnalysis.shift1?.[p], shiftAnalysis.shift1?.[p]));
          if (s1Modified) {
            return res.status(400).json({
              success: false,
              message: 'Cannot edit SHIFT 1: SHIFT 1 is permanently locked.',
            });
          }
        }

        if (s2Locked && Object.keys(shiftAnalysis.shift2 || {}).length > 0) {
          const s2Modified = SHIFT_PARAMS.some((p) => isValDiff(existingShiftAnalysis.shift2?.[p], shiftAnalysis.shift2?.[p]));
          if (s2Modified) {
            return res.status(400).json({
              success: false,
              message: 'Cannot edit SHIFT 2: SHIFT 2 is permanently locked.',
            });
          }
        }

        if (s3Locked && Object.keys(shiftAnalysis.shift3 || {}).length > 0) {
          const s3Modified = SHIFT_PARAMS.some((p) => isValDiff(existingShiftAnalysis.shift3?.[p], shiftAnalysis.shift3?.[p]));
          if (s3Modified) {
            return res.status(400).json({
              success: false,
              message: 'Cannot edit SHIFT 3: SHIFT 3 is permanently locked.',
            });
          }
        }
      }
    }

    // 5. Enforce Shift Locking on Section 2: Hourly Routine Monitoring
    if (shouldProcessHourly && Array.isArray(hourlyReadings)) {
      // Check each hourly row to ensure its containing shift is editable
      for (const newRow of hourlyReadings) {
        if (!newRow.time) continue;
        const shiftBelonging = getShiftFromTime(newRow.time);
        const oldRow = existingHourlyReadings.find((r) => r.time === newRow.time || (r.id && r.id === newRow.id));

        const isModified = !oldRow
          ? (newRow.nacl !== '' && newRow.nacl !== null && newRow.nacl !== undefined) || (newRow.bd !== '' && newRow.bd !== null && newRow.bd !== undefined)
          : isValDiff(oldRow.nacl, newRow.nacl) || isValDiff(oldRow.bd, newRow.bd);

        if (isModified) {
          if (shiftBelonging === 'Shift 1' && s1Locked) {
            return res.status(400).json({
              success: false,
              message: `Cannot edit hourly reading at '${newRow.time}': Shift 1 is permanently locked.`,
            });
          }
          if (shiftBelonging === 'Shift 2') {
            if (!s1Saved) {
              return res.status(400).json({
                success: false,
                message: `Cannot edit hourly reading at '${newRow.time}': Shift 2 is waiting for Shift 1 to be saved.`,
              });
            }
            if (s2Locked) {
              return res.status(400).json({
                success: false,
                message: `Cannot edit hourly reading at '${newRow.time}': Shift 2 is permanently locked.`,
              });
            }
          }
          if (shiftBelonging === 'Shift 3') {
            if (!s2Saved) {
              return res.status(400).json({
                success: false,
                message: `Cannot edit hourly reading at '${newRow.time}': Shift 3 is waiting for Shift 2 to be saved.`,
              });
            }
            if (s3Locked) {
              return res.status(400).json({
                success: false,
                message: `Cannot edit hourly reading at '${newRow.time}': Shift 3 is permanently locked.`,
              });
            }
          }
        }
      }

      // Check row deletions: cannot delete rows belonging to locked shifts
      for (const oldRow of existingHourlyReadings) {
        if (oldRow.isCustom && !hourlyReadings.some((r) => r.time === oldRow.time)) {
          const shiftBelonging = getShiftFromTime(oldRow.time);
          if (shiftBelonging === 'Shift 1' && s1Locked) {
            return res.status(400).json({
              success: false,
              message: `Cannot delete custom hourly slot '${oldRow.time}': Shift 1 is permanently locked.`,
            });
          }
          if (shiftBelonging === 'Shift 2' && (!s1Saved || s2Locked)) {
            return res.status(400).json({
              success: false,
              message: `Cannot delete custom hourly slot '${oldRow.time}': Shift 2 is locked or waiting.`,
            });
          }
          if (shiftBelonging === 'Shift 3' && (!s2Saved || s3Locked)) {
            return res.status(400).json({
              success: false,
              message: `Cannot delete custom hourly slot '${oldRow.time}': Shift 3 is locked or waiting.`,
            });
          }
        }
      }
    }

    // 6. Merge Shift Analysis cleanly & audit field-level changes
    const mergedShiftAnalysis = {
      shift1: { ...(existingShiftAnalysis.shift1 || {}) },
      shift2: { ...(existingShiftAnalysis.shift2 || {}) },
      shift3: { ...(existingShiftAnalysis.shift3 || {}) },
    };

    if (shouldProcessShifts) {
      const activeShiftKeys = normalizedTarget !== 'all' && SHIFT_KEYS.includes(normalizedTarget)
        ? [normalizedTarget]
        : SHIFT_KEYS;

      activeShiftKeys.forEach((sKey) => {
        if (shiftAnalysis[sKey] && typeof shiftAnalysis[sKey] === 'object') {
          const incData = shiftAnalysis[sKey];
          const oldData = existingShiftAnalysis[sKey] || {};

          SHIFT_PARAMS.forEach((paramKey) => {
            if (incData[paramKey] !== undefined) {
              const oldVal = oldData[paramKey];
              const newVal = incData[paramKey];

              if (isValDiff(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
                if (!editedFields[sKey]) editedFields[sKey] = {};
                editedFields[sKey][paramKey] = true;

                editAuditHistory.push({
                  date: payload.date,
                  section: 'Shift Analysis',
                  shift: SHIFT_DISPLAY_NAMES[sKey] || sKey,
                  shiftKey: sKey,
                  field: paramKey,
                  fieldName: PARAM_DISPLAY_NAMES[paramKey] || paramKey,
                  oldValue: oldVal,
                  newValue: newVal,
                  editor,
                  timestamp: nowIso,
                  saveEventId,
                });
              }

              mergedShiftAnalysis[sKey][paramKey] = newVal === '' ? '' : newVal;
            }
          });
        }
      });
    }

    // 7. Merge Hourly Routine Monitoring cleanly & audit changes
    let mergedHourlyReadings = [...existingHourlyReadings];
    if (shouldProcessHourly && Array.isArray(hourlyReadings)) {
      if (!editedFields.hourly) editedFields.hourly = {};

      // Audit row additions
      hourlyReadings.forEach((newRow) => {
        const existingMatch = existingHourlyReadings.find((r) => r.time === newRow.time);
        if (!existingMatch && newRow.isCustom) {
          editAuditHistory.push({
            date: payload.date,
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

      // Audit row deletions
      existingHourlyReadings.forEach((oldRow) => {
        if (oldRow.isCustom && !hourlyReadings.some((r) => r.time === oldRow.time)) {
          editAuditHistory.push({
            date: payload.date,
            section: 'Hourly Routine Monitoring',
            action: 'ROW_DELETED',
            shift: oldRow.shift,
            samplingTime: oldRow.time,
            details: `Custom hourly slot deleted for ${oldRow.time} (${oldRow.shift})`,
            editor,
            timestamp: nowIso,
            saveEventId,
          });
        }
      });

      // Audit field changes in existing rows
      hourlyReadings.forEach((newRow) => {
        const oldRow = existingHourlyReadings.find((r) => r.time === newRow.time);
        if (oldRow) {
          ['nacl', 'bd'].forEach((param) => {
            const oldVal = oldRow[param];
            const newVal = newRow[param];

            if (isValDiff(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
              const rowIdKey = newRow.id || newRow.time;
              if (!editedFields.hourly[rowIdKey]) editedFields.hourly[rowIdKey] = {};
              editedFields.hourly[rowIdKey][param] = true;

              editAuditHistory.push({
                date: payload.date,
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

      mergedHourlyReadings = hourlyReadings;
    }

    // 8. Update Sequential Shift Locking State on Successful Shift Save
    if (shouldProcessShifts) {
      if (normalizedTarget === 'shift1') {
        lockedShifts.shift1Saved = true;
      } else if (normalizedTarget === 'shift2') {
        lockedShifts.shift2Saved = true;
        lockedShifts.shift1Locked = true;
      } else if (normalizedTarget === 'shift3') {
        lockedShifts.shift2Locked = true;
        if (!lockedShifts.shift3Saved) {
          lockedShifts.shift3Saved = true;
          lockedShifts.shift3Edits = 0;
        } else {
          lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
          lockedShifts.shift3Locked = true;
        }
      } else if (normalizedTarget === 'all') {
        const s1Has = Object.values(shiftAnalysis.shift1 || {}).some((v) => v !== '' && v !== null && v !== undefined);
        const s2Has = Object.values(shiftAnalysis.shift2 || {}).some((v) => v !== '' && v !== null && v !== undefined);
        const s3Has = Object.values(shiftAnalysis.shift3 || {}).some((v) => v !== '' && v !== null && v !== undefined);

        if (s1Has) lockedShifts.shift1Saved = true;
        if (s2Has) {
          lockedShifts.shift2Saved = true;
          lockedShifts.shift1Locked = true;
        }
        if (s3Has) {
          lockedShifts.shift2Locked = true;
          if (!lockedShifts.shift3Saved) {
            lockedShifts.shift3Saved = true;
            lockedShifts.shift3Edits = 0;
          } else {
            lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
            lockedShifts.shift3Locked = true;
          }
        }
      }

      // Re-enforce global locks
      if (lockedShifts.shift2Saved) lockedShifts.shift1Locked = true;
      if (lockedShifts.shift3Saved) lockedShifts.shift2Locked = true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
        lockedShifts.shift3Locked = true;
        lockedShifts.shift2Locked = true;
        lockedShifts.shift1Locked = true;
      }
    }

    // 9. Construct Complete Record Payload
    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `lsa_bagging_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      plantId: 'sa',
      unit: 'LSA Bagging',
      section: 'LSA Bagging',
      analysisType: 'LSA Bagging Analysis',
      shiftAnalysis: mergedShiftAnalysis,
      hourlyReadings: mergedHourlyReadings,
      lockedShifts,
      editedFields,
      editAuditHistory,
      saveType,
      targetShift,
      saveEventId,
      submittedBy: editor,
      submittedById: req.user?._id,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company,
    };

    // 10. Persist to MongoDB PlantAnalysisRecord
    let savedRecordDoc = null;
    try {
      if (PlantAnalysisRecord) {
        savedRecordDoc = await PlantAnalysisRecord.findOneAndUpdate(
          {
            date: payload.date,
            plantCode: 'SA',
            analysisType: 'LSA Bagging Analysis',
          },
          {
            plantName: 'SA Plant',
            plantCode: 'SA',
            analysisType: 'LSA Bagging Analysis',
            unit: 'LSA Bagging',
            date: payload.date,
            shift: targetShift !== 'all' ? targetShift.toUpperCase() : 'All Shifts',
            data: recordPayload,
            submittedBy: recordPayload.submittedBy,
            submittedById: recordPayload.submittedById,
            company: recordPayload.company,
            status: 'completed',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (dbErr) {
      console.error('[LSABagging Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Update in-memory fallback cache
    const cachedIdx = lsaBaggingRecords.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      lsaBaggingRecords[cachedIdx] = recordPayload;
    } else {
      lsaBaggingRecords.unshift(recordPayload);
    }

    // 11. Resolve dynamic SA Plant operator email and execute email workflow
    let emailStatus = 'pending';
    let emailRecipient = null;
    let emailMessage = 'Saved successfully. Email dispatch initiated.';

    try {
      const { getPlantAssignedUser, executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA', { company: req.user?.company });
      emailRecipient = primaryEmail || assignedUser?.email || null;

      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: 'SA',
        analysisType: 'LSA Bagging Analysis',
        unit: 'LSA Bagging',
        shift: targetShift !== 'all' ? targetShift.toUpperCase() : 'All Shifts',
        date: payload.date,
        data: recordPayload,
        submittedBy: recordPayload.submittedBy,
        submittedById: recordPayload.submittedById,
        explicitRecord: savedRecordDoc,
        saveEventId,
      });

      const workflowResult = await emailPromise;
      emailStatus = workflowResult.emailStatus || (workflowResult.success || workflowResult.emailSent ? 'sent' : 'failed');
        emailRecipient = workflowResult.recipient || emailRecipient;
        emailMessage = workflowResult.emailSent || workflowResult.emailStatus === 'sent'
          ? `Saved and notification dispatched to ${emailRecipient}`
          : `Saved, but email delivery failed: ${workflowResult.emailError || workflowResult.message || 'SMTP delivery rejected'}`;
    } catch (emailWorkflowErr) {
      console.warn('[LSABagging Email Warning]:', emailWorkflowErr.message);
      emailStatus = 'failed';
      emailMessage = `Saved, but email delivery encountered an error: ${emailWorkflowErr.message}`;
    }

    // 12. Activity log
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'SAVE_ANALYSIS',
          module: 'PLANT_ANALYSIS',
          details: `Saved LSA Bagging Analysis for SA Plant on ${payload.date} (SaveType: ${saveType}, TargetShift: ${targetShift}).`,
          user: req.user?._id,
          userName: req.user?.name,
          company: req.user?.company,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA Bagging activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: emailMessage,
      data: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      shiftAnalysis: mergedShiftAnalysis,
      hourlyReadings: mergedHourlyReadings,
      lockedShifts,
      emailStatus,
      emailDeliveryStatus: emailStatus === 'sent' ? 'sent' : (emailStatus === 'failed' ? 'failed' : 'pending'),
      emailRecipient,
      editedFields,
      saveEventId,
    });
  } catch (error) {
    console.error('Error saving LSA Bagging Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving LSA Bagging Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Get LSA Bagging Analysis data by date
 * @route   GET /api/lsa-bagging & /api/lsa-bagging-analysis
 * @access  Private
 */
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

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: {
          $in: [
            'LSA Bagging Analysis',
            'LSA Bagging',
            'LSA BAGGING ANALYSIS',
          ],
        },
      };

      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      let doc = null;
      if (PlantAnalysisRecord) {
        doc = await PlantAnalysisRecord.findOne(query).sort({ updatedAt: -1 });
      }

      const defaultLocks = {
        shift1Saved: false,
        shift2Saved: false,
        shift3Saved: false,
        shift1Locked: false,
        shift2Locked: false,
        shift3Locked: false,
        shift3Edits: 0,
      };

      if (doc) {
        const payloadData = doc.data || {};
        const shiftAnalysis = payloadData.shiftAnalysis || doc.shiftAnalysis || {};
        const hourlyReadings = payloadData.hourlyReadings || doc.hourlyReadings || [];
        const lockedShifts = payloadData.lockedShifts || defaultLocks;

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
            lockedShifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          },
          record: doc.toObject ? { ...doc.toObject(), shiftAnalysis, hourlyReadings, lockedShifts } : doc,
          recordId: doc._id,
          shiftAnalysis,
          hourlyReadings,
          lockedShifts,
          editedFields: payloadData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      const match = lsaBaggingRecords.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
          record: match,
          recordId: match._id || match.id,
          shiftAnalysis: match.shiftAnalysis,
          hourlyReadings: match.hourlyReadings,
          lockedShifts: match.lockedShifts || defaultLocks,
          editedFields: match.editedFields || {},
          assignedOperatorEmail,
          emailStatus: 'failed',
          emailRecipient: assignedOperatorEmail,
        });
      }

      return res.status(200).json({
        success: true,
        data: null,
        record: null,
        shiftAnalysis: null,
        hourlyReadings: null,
        lockedShifts: defaultLocks,
        assignedOperatorEmail,
        emailStatus: null,
        emailRecipient: assignedOperatorEmail,
      });
    }

    // If no date query, return recent list
    let records = [];
    try {
      if (PlantAnalysisRecord) {
        records = await PlantAnalysisRecord.find({
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: {
            $in: [
              'LSA Bagging Analysis',
              'LSA Bagging',
              'LSA BAGGING ANALYSIS',
            ],
          },
        })
          .sort({ date: -1 })
          .limit(30)
          .lean();
      }
    } catch (e) {
      console.warn('Error querying all LSA Bagging records:', e.message);
    }

    if (records.length > 0) {
      return res.status(200).json({
        success: true,
        count: records.length,
        data: records.map((r) => r.data || r),
      });
    }

    return res.status(200).json({
      success: true,
      count: lsaBaggingRecords.length,
      data: lsaBaggingRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/lsa-bagging:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching LSA Bagging Analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved LSA Bagging analysis record
 * @route   POST /api/lsa-bagging/:id/retry-email & /api/lsa-bagging-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;

    let record = null;
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findById === 'function') {
      record = await PlantAnalysisRecord.findById(id);
    }
    if (!record) {
      record = lsaBaggingRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'LSA Bagging analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'SA',
      analysisType: record.analysisType || 'LSA Bagging Analysis',
      unit: 'LSA Bagging',
      shift: record.shift || 'All Shifts',
      date: record.date,
      data: record.data || record,
      submittedBy: record.submittedBy || req.user?.name,
      submittedById: record.submittedById || req.user?._id,
      explicitRecord: record,
      saveEventId: `lsa_bagging_retry_${Date.now()}`,
    });

    const isSuccess = result?.emailSent || result?.emailStatus === 'sent';
    const recipient = result?.recipient || result?.primaryEmail || 'sa_operator@tfl.com';
    return res.status(200).json({
      success: true,
      emailSent: isSuccess,
      emailDeliveryStatus: isSuccess ? 'sent' : 'failed',
      emailRecipient: recipient,
      recipient,
      message: isSuccess
        ? `Notification email successfully re-sent to ${recipient}.`
        : `Email delivery failed: ${result?.emailError || result?.message || 'SMTP delivery rejected'}`,
    });
  } catch (error) {
    console.error('Error in retry email for LSA Bagging analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to re-send notification email: ' + error.message,
    });
  }
});

module.exports = router;
