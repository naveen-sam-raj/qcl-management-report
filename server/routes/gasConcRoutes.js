const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { generateGasConcExcel } = require('../services/excelService');
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

// Seed/reference initial rows provided by user specifications
const SEED_ROWS = [
  // 26.05.2022 block
  { id: 'gc-1', date: '2022-05-26', displayDate: '26.05.2022', time: '10:00', seal: 'NOT OK', recoveryCo2Con: '46',   cleaningGas: '5',    bottomGas: '63' },
  { id: 'gc-2', date: '2022-05-26', displayDate: '',           time: '12:00', seal: 'NOT OK', recoveryCo2Con: '37.5', cleaningGas: '8',    bottomGas: '' },
  { id: 'gc-3', date: '2022-05-26', displayDate: '',           time: '16:00', seal: 'NOT OK', recoveryCo2Con: '38',   cleaningGas: '12',   bottomGas: '75' },
  { id: 'gc-4', date: '2022-05-26', displayDate: '',           time: '18:00', seal: 'NOT OK', recoveryCo2Con: '42',   cleaningGas: '11.5', bottomGas: '62' },
  { id: 'gc-5', date: '2022-05-26', displayDate: '',           time: '20:00', seal: 'NOT OK', recoveryCo2Con: '41',   cleaningGas: '11',   bottomGas: '69' },

  // 27-05-2022 block
  { id: 'gc-6', date: '2022-05-27', displayDate: '27-05-2022', time: '06:30', seal: 'NOT OK', recoveryCo2Con: '50.5', cleaningGas: '10',   bottomGas: '67.5' },
  { id: 'gc-7', date: '2022-05-27', displayDate: '',           time: '10:00', seal: 'NOT OK', recoveryCo2Con: '51.5', cleaningGas: '23',   bottomGas: '69' },
  { id: 'gc-8', date: '2022-05-27', displayDate: '',           time: '15:30', seal: 'NOT OK', recoveryCo2Con: '49.5', cleaningGas: '20.5', bottomGas: '64.5' },
  { id: 'gc-9', date: '2022-05-27', displayDate: '',           time: '21:00', seal: 'NOT OK', recoveryCo2Con: '48',   cleaningGas: '17.5', bottomGas: '60.5' },
];

// In-memory fallback cache
const gasConcRecords = [];

// Apply auth middleware
router.use(protect);

/**
 * @desc    Get Gas Conc. Analysis records
 * @route   GET /api/gas-conc
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    // Resolve assigned SA Plant operator email
    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (recipErr) {
      console.warn('[GasConc] Operator email resolution note:', recipErr.message);
      assignedOperatorEmail = null;
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

    if (date) {
      // Find document for this exact date
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      let doc = null;
      try {
        if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOne === 'function') {
          doc = await PlantAnalysisRecord.findOne(query).sort({ updatedAt: -1 }).lean();
        }
      } catch (e) {
        console.warn('[GasConc] Mongo lookup fallback:', e.message);
      }

      if (doc) {
        const payloadData = doc.data || {};
        const rows = Array.isArray(payloadData.rows) ? payloadData.rows : [];
        const lockedShifts = payloadData.lockedShifts || defaultLocks;
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
            lockedShifts,
            editedFields,
            editAuditHistory,
            assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'pending',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            submittedBy: doc.submittedBy,
            submittedAt: doc.updatedAt || doc.createdAt,
          },
          record: doc,
          recordId: doc._id,
          rows,
          lockedShifts,
          editedFields,
          editAuditHistory,
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      // Check in-memory cache
      const cached = gasConcRecords.find((r) => r.date === date);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: cached,
          record: cached,
          recordId: cached.id,
          rows: cached.rows || [],
          lockedShifts: cached.lockedShifts || defaultLocks,
          editedFields: cached.editedFields || {},
          editAuditHistory: cached.editAuditHistory || [],
          assignedOperatorEmail,
          emailStatus: 'failed',
          emailRecipient: assignedOperatorEmail,
        });
      }

      // No record found for this date
      return res.status(200).json({
        success: true,
        data: null,
        record: null,
        rows: [],
        lockedShifts: defaultLocks,
        editedFields: {},
        editAuditHistory: [],
        assignedOperatorEmail,
        emailStatus: null,
        emailRecipient: assignedOperatorEmail,
      });
    }

    // No date parameter: return recent records
    let mongoRecords = [];
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
        const query = {
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
        };
        mongoRecords = await PlantAnalysisRecord.find(query).sort({ date: -1, createdAt: -1 }).limit(30).lean();
      }
    } catch (e) {
      console.warn('[GasConc] Mongo lookup fallback:', e.message);
    }

    if (mongoRecords && mongoRecords.length > 0) {
      return res.status(200).json({
        success: true,
        count: mongoRecords.length,
        data: mongoRecords.map((r) => ({
          id: r._id,
          _id: r._id,
          date: r.date,
          plant: r.plantCode || 'SA',
          unit: r.unit || 'Gas Conc.',
          analysisType: r.analysisType,
          rows: r.data?.rows || [],
          lockedShifts: r.data?.lockedShifts || defaultLocks,
          editedFields: r.data?.editedFields || {},
          editAuditHistory: r.data?.editAuditHistory || [],
          submittedBy: r.submittedBy,
          submittedAt: r.createdAt || r.updatedAt,
          emailStatus: r.emailStatus,
          emailRecipient: r.emailRecipient || assignedOperatorEmail,
          assignedOperatorEmail,
        })),
        assignedOperatorEmail,
      });
    }

    return res.status(200).json({
      success: true,
      count: gasConcRecords.length,
      data: gasConcRecords,
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

/**
 * @desc    Save Gas Conc. Analysis records with sequential shift-wise locking
 * @route   POST /api/gas-conc
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload) {
      return res.status(400).json({
        success: false,
        message: 'Payload is required.',
      });
    }

    // 1. Mandatory Date Check & Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    const submissionDate = payload.date ? String(payload.date).trim() : '';

    if (!submissionDate) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Gas Conc. Analysis.',
      });
    }

    if (submissionDate !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Submissions are only permitted for the current date (${todayKolkata} in Asia/Kolkata timezone). Past and future dates cannot be submitted.`,
      });
    }

    const rawRows = Array.isArray(payload.rows) ? payload.rows : (Array.isArray(payload.readings) ? payload.readings : []);
    if (rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one row of Gas Conc. readings is required.',
      });
    }

    // 2. Validate Rows, Resolve Inherited Dates, Detect Shifts, and Check Duplicate Times
    const errors = [];
    let lastValidDate = submissionDate;
    const seenTimesByDate = new Map();

    const validatedRows = rawRows.map((r, idx) => {
      const rowNum = idx + 1;
      let rowDate = (r.date || '').trim();

      if (rowDate) {
        lastValidDate = rowDate;
      } else if (lastValidDate) {
        rowDate = lastValidDate; // inherit from previous row
      }

      // Check sampling time
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
      const shiftName = shiftKey === 'shift1' ? 'Shift 1' : shiftKey === 'shift2' ? 'Shift 2' : 'Shift 3';

      // Numeric validations (Recovery CO2, Cleaning Gas, Bottom Gas)
      ['recoveryCo2Con', 'cleaningGas', 'bottomGas'].forEach((field) => {
        const val = r[field];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Row ${rowNum}: ${field} must be a valid number.`);
          }
        }
      });

      // SEAL validation (OK or NOT OK)
      let seal = (r.seal || '').trim().toUpperCase();
      if (seal && seal !== 'OK' && seal !== 'NOT OK') {
        errors.push(`Row ${rowNum}: SEAL must be either OK or NOT OK.`);
      }
      if (!seal) seal = 'NOT OK';

      return {
        id: r.id || `gc_${Date.now()}_${idx}`,
        date: r.date ? r.date.trim() : '', // preserve empty if inherited
        resolvedDate: rowDate,
        displayDate: r.displayDate || (r.date ? r.date.trim() : ''),
        time: timeStr,
        shift: shiftName,
        shiftKey,
        seal,
        recoveryCo2Con: r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined ? String(r.recoveryCo2Con) : '',
        cleaningGas: r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined ? String(r.cleaningGas) : '',
        bottomGas: r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined ? String(r.bottomGas) : '',
      };
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: submissionDate,
      plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
      analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = null;
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOne === 'function') {
        existingDoc = await PlantAnalysisRecord.findOne(query);
      }
    } catch (e) {
      console.warn('[GasConc] MongoDB existing lookup warning:', e.message);
    }

    const existingData = existingDoc?.data || gasConcRecords.find((r) => r.date === submissionDate) || {};
    const existingRows = Array.isArray(existingData.rows) ? existingData.rows : [];

    let editedFields = { ...(existingData.editedFields || {}) };
    let editAuditHistory = [...(existingData.editAuditHistory || [])];

    // 4. Extract and initialize Sequential Shift-Locking State
    const existingLockedShifts = existingData.lockedShifts || {
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      shift1Locked: false,
      shift2Locked: false,
      shift3Locked: false,
      shift3Edits: 0,
    };

    const s1Saved = Boolean(existingLockedShifts.shift1Saved);
    const s2Saved = Boolean(existingLockedShifts.shift2Saved);
    const s3Saved = Boolean(existingLockedShifts.shift3Saved);
    const s3Edits = Number(existingLockedShifts.shift3Edits || 0);

    const s1Locked = Boolean(existingLockedShifts.shift1Locked || s2Saved);
    const s2Locked = Boolean(existingLockedShifts.shift2Locked || s3Saved);
    const s3Locked = Boolean(existingLockedShifts.shift3Locked || (s3Saved && s3Edits >= 1));

    const targetShift = payload.targetShift ? String(payload.targetShift).toLowerCase().replace(/\s+/g, '') : 'all';

    // Group incoming rows by shift
    const rowsByShift = {
      shift1: validatedRows.filter((r) => r.shiftKey === 'shift1'),
      shift2: validatedRows.filter((r) => r.shiftKey === 'shift2'),
      shift3: validatedRows.filter((r) => r.shiftKey === 'shift3'),
    };

    // Determine which shifts are being submitted/modified
    const hasS1Incoming = rowsByShift.shift1.length > 0;
    const hasS2Incoming = rowsByShift.shift2.length > 0;
    const hasS3Incoming = rowsByShift.shift3.length > 0;

    // 5. Enforce Sequential Shift Locking
    if (targetShift === 'shift1') {
      if (s1Locked) {
        return res.status(400).json({
          success: false,
          message: 'SHIFT 1 is permanently locked as SHIFT 2 has already been saved.',
        });
      }
    } else if (targetShift === 'shift2') {
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
    } else if (targetShift === 'shift3') {
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
    } else {
      // General/all save: enforce sequential submission and locked-shift edit protection
      if (hasS2Incoming && !s1Saved) {
        return res.status(400).json({
          success: false,
          message: 'Cannot save SHIFT 2 before SHIFT 1 is saved.',
        });
      }
      if (hasS3Incoming && !s2Saved) {
        return res.status(400).json({
          success: false,
          message: 'Cannot save SHIFT 3 before SHIFT 2 is saved.',
        });
      }

      // Check if locked shifts are being modified
      if (s1Locked && hasS1Incoming) {
        const s1Modified = rowsByShift.shift1.some((newRow) => {
          const oldRow = existingRows.find((r) => r.id === newRow.id || (r.time === newRow.time && r.resolvedDate === newRow.resolvedDate));
          if (!oldRow) return true; // added new row to locked shift
          return isValDiff(oldRow.seal, newRow.seal) ||
                 isValDiff(oldRow.recoveryCo2Con, newRow.recoveryCo2Con) ||
                 isValDiff(oldRow.cleaningGas, newRow.cleaningGas) ||
                 isValDiff(oldRow.bottomGas, newRow.bottomGas);
        });
        if (s1Modified) {
          return res.status(400).json({
            success: false,
            message: 'SHIFT 1 is permanently locked as SHIFT 2 has already been saved.',
          });
        }
      }

      if (s2Locked && hasS2Incoming) {
        const s2Modified = rowsByShift.shift2.some((newRow) => {
          const oldRow = existingRows.find((r) => r.id === newRow.id || (r.time === newRow.time && r.resolvedDate === newRow.resolvedDate));
          if (!oldRow) return true;
          return isValDiff(oldRow.seal, newRow.seal) ||
                 isValDiff(oldRow.recoveryCo2Con, newRow.recoveryCo2Con) ||
                 isValDiff(oldRow.cleaningGas, newRow.cleaningGas) ||
                 isValDiff(oldRow.bottomGas, newRow.bottomGas);
        });
        if (s2Modified) {
          return res.status(400).json({
            success: false,
            message: 'SHIFT 2 is permanently locked as SHIFT 3 has already been saved.',
          });
        }
      }

      if (s3Locked && hasS3Incoming) {
        const s3Modified = rowsByShift.shift3.some((newRow) => {
          const oldRow = existingRows.find((r) => r.id === newRow.id || (r.time === newRow.time && r.resolvedDate === newRow.resolvedDate));
          if (!oldRow) return true;
          return isValDiff(oldRow.seal, newRow.seal) ||
                 isValDiff(oldRow.recoveryCo2Con, newRow.recoveryCo2Con) ||
                 isValDiff(oldRow.cleaningGas, newRow.cleaningGas) ||
                 isValDiff(oldRow.bottomGas, newRow.bottomGas);
        });
        if (s3Modified) {
          return res.status(400).json({
            success: false,
            message: 'SHIFT 3 has already reached its maximum edit limit (one final edit allowed) and is permanently locked.',
          });
        }
      }
    }

    // 6. Track Field-Level Edit History & Generate Save Event ID
    const nowIso = new Date().toISOString();
    const saveEventId = payload.saveEventId || `gc_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const editor = req.user?.name || payload.submittedBy || 'Plant Operator';

    validatedRows.forEach((newRow) => {
      const oldRow = existingRows.find((r) => r.id === newRow.id || (r.time === newRow.time && r.resolvedDate === newRow.resolvedDate));
      if (oldRow) {
        ['seal', 'recoveryCo2Con', 'cleaningGas', 'bottomGas'].forEach((field) => {
          const oldVal = oldRow[field];
          const newVal = newRow[field];
          if (isValDiff(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
            if (!editedFields[newRow.id]) editedFields[newRow.id] = {};
            editedFields[newRow.id][field] = true;

            editAuditHistory.push({
              date: submissionDate,
              rowId: newRow.id,
              time: newRow.time,
              shift: newRow.shift,
              field,
              fieldName: PARAM_DISPLAY_NAMES[field] || field,
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

    // 7. Advance Shift Locking State Machine
    let nextS1Saved = s1Saved;
    let nextS2Saved = s2Saved;
    let nextS3Saved = s3Saved;
    let nextS1Locked = s1Locked;
    let nextS2Locked = s2Locked;
    let nextS3Locked = s3Locked;
    let nextS3Edits = s3Edits;

    const targetIsS1 = targetShift === 'shift1' || (targetShift === 'all' && hasS1Incoming);
    const targetIsS2 = targetShift === 'shift2' || (targetShift === 'all' && hasS2Incoming);
    const targetIsS3 = targetShift === 'shift3' || (targetShift === 'all' && hasS3Incoming);

    if (targetIsS1) {
      nextS1Saved = true;
    }
    if (targetIsS2) {
      nextS2Saved = true;
      nextS1Locked = true; // Shift 1 locks when Shift 2 is saved
    }
    if (targetIsS3) {
      nextS2Locked = true; // Shift 2 locks when Shift 3 is saved
      if (!s3Saved) {
        nextS3Saved = true;
        nextS3Edits = 0; // initial save of Shift 3
      } else {
        nextS3Edits = s3Edits + 1;
        if (nextS3Edits >= 1) {
          nextS3Locked = true; // Shift 3 locked after final edit
        }
      }
    }

    const updatedLockedShifts = {
      shift1Saved: nextS1Saved,
      shift2Saved: nextS2Saved,
      shift3Saved: nextS3Saved,
      shift1Locked: nextS1Locked,
      shift2Locked: nextS2Locked,
      shift3Locked: nextS3Locked,
      shift3Edits: nextS3Edits,
    };

    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `gas_conc_${Date.now()}`,
      date: submissionDate,
      plant: 'SA',
      plantName: 'Soda Ash Plant',
      plantCode: 'SA',
      unit: 'Gas Conc.',
      analysisType: 'Gas Conc. Analysis',
      rows: validatedRows,
      lockedShifts: updatedLockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: editor,
      submittedById: req.user?._id || null,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company || null,
      saveEventId,
    };

    // 8. Atomic Database Persistence via PlantAnalysisRecord
    let savedRecordDoc = null;
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        savedRecordDoc = await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
            analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
            date: submissionDate,
          },
          {
            plantName: 'Soda Ash Plant',
            plantCode: 'SA',
            analysisType: 'Gas Conc. Analysis',
            unit: 'Gas Conc.',
            date: submissionDate,
            shift: targetShift !== 'all' ? SHIFT_DISPLAY_NAMES[targetShift] || targetShift : 'All Shifts',
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
      console.error('[GasConc] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // 9. Cache in memory
    const existingIdx = gasConcRecords.findIndex((r) => r.date === submissionDate);
    if (existingIdx >= 0) {
      gasConcRecords[existingIdx] = recordPayload;
    } else {
      gasConcRecords.unshift(recordPayload);
    }

    // 10. Audit Activity Log
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'GAS_CONC_SAVED',
          user: req.user?._id,
          userName: editor,
          details: `Gas Conc. Analysis saved for date: ${submissionDate} (${validatedRows.length} observations). Target: ${targetShift}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[GasConc] Activity log warning:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Gas Conc. Analysis saved successfully in MongoDB ✓',
      data: recordPayload,
      record: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      lockedShifts: updatedLockedShifts,
      editedFields,
      editAuditHistory,
      emailStatus: 'disabled',
      emailDeliveryStatus: 'disabled',
      emailRecipient: null,
      saveEventId,
    });
  } catch (error) {
    console.error('[GasConc] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving Gas Conc. Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved Gas Conc. Analysis record
 * @route   POST /api/gas-conc/:id/retry-email
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

/**
 * @desc    Export Gas Conc. Analysis to Excel (.xlsx) file download
 * @route   GET /api/gas-conc/export
 * @access  Private
 */
router.get('/export', async (req, res) => {
  try {
    const { date } = req.query;

    let targetRows = [];
    if (date) {
      const doc = await PlantAnalysisRecord.findOne({
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
        date,
      }).lean();
      if (doc && doc.data?.rows) {
        targetRows = doc.data.rows;
      } else {
        const found = gasConcRecords.find((r) => r.date === date);
        if (found && found.rows) targetRows = found.rows;
      }
    } else if (gasConcRecords.length > 0) {
      targetRows = gasConcRecords[0]?.rows || [];
    }

    const excelResult = await generateGasConcExcel({
      date: date || '2022-05-26',
      plant: 'SA',
      submittedBy: req.user?.name || 'Shift Chemist',
      rows: targetRows,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
    return res.send(excelResult.buffer);
  } catch (err) {
    console.error('[GasConc] Export download error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate Excel export file.',
      error: err.message,
    });
  }
});

module.exports = router;
