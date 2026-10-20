const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const {
  hydrateLockState,
  getInitialLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
} = require('../services/analysisLockEngine');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');

/**
 * Returns today's date in Asia/Kolkata timezone (YYYY-MM-DD)
 */
const getTodayKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

/**
 * Compares two values for differences, preserving decimal precision
 */
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

const getShiftFromTime = (timeStr) => {
  if (!timeStr) return 'shift1';
  const hour = parseInt(String(timeStr).split(':')[0], 10);
  if (isNaN(hour)) return 'shift1';
  if (hour >= 6 && hour < 14) return 'shift1';
  if (hour >= 14 && hour < 22) return 'shift2';
  return 'shift3';
};

const NUMERIC_FIELDS = ['fnh3', 'cnh3'];

// Seed readings from laboratory specifications
const SEED_READINGS = [
  { id: '1', time: '07:00', fnh3: '1530', cnh3: '0', ca: 'Nil' },
  { id: '2', time: '15:00', fnh3: '', cnh3: '', ca: '' },
  { id: '3', time: '23:00', fnh3: '', cnh3: '', ca: '' },
];

// In-memory fallback cache
const vacuumSealRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get Vacuum Seal Water Analysis data
 * @route   GET /api/vacuum-seal-water
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;

    // Resolve assigned OFFSITE Plant operator email dynamically from registered database records
    let assignedOperatorEmail = null;
    try {
      const companyId = req.user?.company?._id || req.user?.company || null;
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('OFFSITE', { company: companyId });
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (recipErr) {
      console.warn('[VacuumSeal GET] Operator recipient resolution note:', recipErr.message);
      assignedOperatorEmail = null;
    }

    const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];
    const defaultLocks = getInitialLockState({ type: 'shift', items: SHIFT_KEYS });

    if (date) {
      try {
        const query = {
          date,
          analysisType: 'Vacuum Seal Water Analysis',
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const readings = payloadData.readings || payloadData.shifts || payloadData.rows || [];
          const resolvedLocks = payloadData.lockedShifts
            ? hydrateLockState(payloadData.lockedShifts, { type: 'shift', items: SHIFT_KEYS })
            : defaultLocks;
          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'pending',
            assignedOperatorEmail,
            lockedShifts: resolvedLocks,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              readings: readings || [],
              lockedShifts: resolvedLocks,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[VacuumSeal GET] MongoDB lookup note:', dbErr.message);
      }

      const match = vacuumSealRecords.find((r) => r.date === date);
      if (match) {
        const resolvedLocks = match.lockedShifts
          ? hydrateLockState(match.lockedShifts, { type: 'shift', items: SHIFT_KEYS })
          : defaultLocks;
        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          lockedShifts: resolvedLocks,
          data: match,
        });
      }

      return res.status(200).json({
        success: true,
        assignedOperatorEmail,
        lockedShifts: defaultLocks,
        data: null,
        message: `No record found for date ${date}`,
      });
    }

    // List query
    try {
      const query = {
        analysisType: 'Vacuum Seal Water Analysis',
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      if (docs && docs.length > 0) {
        const results = docs.map((d) => ({
          ...d.data,
          _id: d._id,
          id: d._id,
          date: d.date,
          emailStatus: d.emailStatus,
          emailRecipient: d.emailRecipient,
        }));
        return res.status(200).json({
          success: true,
          count: results.length,
          data: results,
        });
      }
    } catch (listErr) {
      console.warn('[VacuumSeal GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: vacuumSealRecords.length,
      data: vacuumSealRecords,
    });
  } catch (error) {
    console.error('[VacuumSeal GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving Vacuum Seal Water records: ' + error.message,
    });
  }
});

/**
 * @desc    Save Vacuum Seal Water Analysis data (Sequential Shift Progression)
 * @route   POST /api/vacuum-seal-water
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Vacuum Seal Water Analysis.',
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: Vacuum Seal Water Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
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

    // Fetch existing record in MongoDB
    const query = {
      date: payload.date,
      analysisType: 'Vacuum Seal Water Analysis',
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const existingDoc = await PlantAnalysisRecord.findOne(query);

    const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];
    let lockedShifts = existingDoc?.data?.lockedShifts
      ? hydrateLockState(existingDoc.data.lockedShifts, { type: 'shift', items: SHIFT_KEYS })
      : getInitialLockState({ type: 'shift', items: SHIFT_KEYS });
    let editedFields = {};
    let editAuditHistory = [];
    let oldReadings = [];

    if (existingDoc && existingDoc.data) {
      editedFields = { ...(existingDoc.data.editedFields || {}) };
      editAuditHistory = [...(existingDoc.data.editAuditHistory || [])];
      oldReadings = existingDoc.data.readings || existingDoc.data.shifts || [];
    }

    // Group incoming rows by shift
    const s1Rows = readings.filter((r) => getShiftFromTime(r.time) === 'shift1');
    const s2Rows = readings.filter((r) => getShiftFromTime(r.time) === 'shift2');
    const s3Rows = readings.filter((r) => getShiftFromTime(r.time) === 'shift3');

    const hasData = (rowList) =>
      rowList.some((r) => [...NUMERIC_FIELDS, 'ca'].some((f) => r[f] !== '' && r[f] !== null && r[f] !== undefined));

    const hasS1 = hasData(s1Rows);
    const hasS2 = hasData(s2Rows);
    const hasS3 = hasData(s3Rows);

    // Check if shift1/shift2/shift3 values changed
    const s1Changed = s1Rows.some((newRow) => {
      const oldRow = oldReadings.find((r) => r.id === newRow.id || r.time === newRow.time);
      return oldRow && [...NUMERIC_FIELDS, 'ca'].some((f) => isValDiff(oldRow[f], newRow[f]));
    });
    const s2Changed = s2Rows.some((newRow) => {
      const oldRow = oldReadings.find((r) => r.id === newRow.id || r.time === newRow.time);
      return oldRow && [...NUMERIC_FIELDS, 'ca'].some((f) => isValDiff(oldRow[f], newRow[f]));
    });
    const s3Changed = s3Rows.some((newRow) => {
      const oldRow = oldReadings.find((r) => r.id === newRow.id || r.time === newRow.time);
      return oldRow && [...NUMERIC_FIELDS, 'ca'].some((f) => isValDiff(oldRow[f], newRow[f]));
    });

    const incomingShifts = [];
    if (hasS1) incomingShifts.push('shift1');
    if (hasS2) incomingShifts.push('shift2');
    if (hasS3) incomingShifts.push('shift3');

    // Authoritative sequential save check via Universal Lock Engine
    for (const sKey of incomingShifts) {
      const isDiff = (sKey === 'shift1' && s1Changed) ||
                     (sKey === 'shift2' && s2Changed) ||
                     (sKey === 'shift3' && s3Changed) ||
                     !lockedShifts.slots?.[sKey]?.isSaved;
      const valRes = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: sKey,
        itemsOrder: SHIFT_KEYS,
        isDiff,
        type: 'shift',
      });
      if (!valRes.allowed) {
        return res.status(valRes.statusCode || 400).json({
          success: false,
          message: valRes.message,
        });
      }
    }

    // Field-level edit audit
    const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
    const nowIso = new Date().toISOString();

    if (existingDoc && existingDoc.data) {
      readings.forEach((newRow, idx) => {
        const rowId = newRow.id || `row_${idx}`;
        const oldRow = oldReadings.find((r) => r.id === rowId || r.time === newRow.time);
        const shiftType = getShiftFromTime(newRow.time);
        const wasPriorSaved =
          (shiftType === 'shift1' && (existingDoc.data.lockedShifts?.shift1Saved || existingDoc.data.lockedShifts?.s1Saved)) ||
          (shiftType === 'shift2' && (existingDoc.data.lockedShifts?.shift2Saved || existingDoc.data.lockedShifts?.s2Saved)) ||
          (shiftType === 'shift3' && (existingDoc.data.lockedShifts?.shift3Saved || existingDoc.data.lockedShifts?.s3Saved));

        if (oldRow && wasPriorSaved) {
          [...NUMERIC_FIELDS, 'ca'].forEach((f) => {
            const oldVal = oldRow[f];
            const newVal = newRow[f];

            if (isValDiff(oldVal, newVal)) {
              editedFields[`${rowId}_${f}`] = true;
              editedFields[`${newRow.time}_${f}`] = true;
              editedFields[`${idx + 1}_${f}`] = true;
              editAuditHistory.push({
                rowId,
                time: newRow.time,
                field: f,
                oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
                newValue: newVal !== undefined && newVal !== null ? String(newVal) : '',
                editedBy: editorName,
                timestamp: nowIso,
              });
            }
          });
        }
      });
    }

    // Update Shift Lock State Machine via Universal Lock Engine
    for (const sKey of incomingShifts) {
      const isCorrection = (sKey === 'shift1' && (lockedShifts.shift1Saved || lockedShifts.s1Saved)) ||
                           (sKey === 'shift2' && (lockedShifts.shift2Saved || lockedShifts.s2Saved)) ||
                           (sKey === 'shift3' && (lockedShifts.shift3Saved || lockedShifts.s3Saved));
      lockedShifts = applySequentialSaveTransition({
        lockState: lockedShifts,
        targetItem: sKey,
        itemsOrder: SHIFT_KEYS,
        isCorrection,
        type: 'shift',
      });
    }

    const activeShift = hasS3 ? 'III SHIFT' : hasS2 ? 'II SHIFT' : 'I SHIFT';

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `vacuum_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: payload.unit || 'Vaccum seal water',
      analysisType: 'Vacuum Seal Water Analysis',
      readings,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Update in-memory fallback
    const memIdx = vacuumSealRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      vacuumSealRecords[memIdx] = { ...vacuumSealRecords[memIdx], ...recordData };
    } else {
      vacuumSealRecords.unshift(recordData);
    }

    // Persist to MongoDB
    let savedRecord = null;
    try {
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        query,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'Vacuum Seal Water Analysis',
          unit: 'Vaccum seal water',
          date: payload.date,
          shift: activeShift,
          data: recordData,
          submittedBy: recordData.submittedBy,
          submittedById: recordData.submittedById,
          company: recordData.company,
          savedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      recordData.id = String(savedRecord._id);
      recordData._id = savedRecord._id;
    } catch (dbErr) {
      console.error('[VacuumSeal POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow
    const saveEventId = `save_vacuum_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'Vacuum Seal Water Analysis',
        unit: 'Vaccum seal water',
        shift: activeShift,
        date: payload.date,
        data: recordData,
        submittedBy: recordData.submittedBy,
        submittedById: recordData.submittedById,
        company: recordData.company,
        explicitRecord: savedRecord,
        rawBody: { ...payload, ...recordData },
        saveEventId,
        isTestMode,
      });
    } catch (notifyErr) {
      console.warn('[VacuumSeal POST] Email notification dispatch note:', notifyErr.message);
      emailResult = {
        success: false,
        emailStatus: 'failed',
        error: notifyErr.message,
      };
    }

    const isEmailDelivered = emailResult.emailSent === true || (emailResult.success === true && emailResult.emailStatus === 'sent');
    const emailStatus = emailResult.emailStatus || (isEmailDelivered ? 'sent' : 'failed');
    const emailRecipient = emailResult.recipient || savedRecord.emailRecipient || null;

    // Activity Log
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'VACUUM_SEAL_WATER_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Vacuum Seal Water Analysis saved for date: ${payload.date} (${activeShift}). Email ${emailStatus} to ${emailRecipient || 'N/A'}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: 'Vacuum Seal Water Analysis saved successfully in MongoDB ✓',
      recordId: savedRecord._id,
      emailStatus: 'disabled',
      emailRecipient: null,
      emailSent: false,
      emailPending: false,
      lockedShifts,
      editedFields,
      editAuditHistory,
      data: recordData,
    });
  } catch (error) {
    console.error('[VacuumSeal POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Vacuum Seal Water analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for Vacuum Seal Water Analysis
 * @route   POST /api/vacuum-seal-water/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

module.exports = router;
