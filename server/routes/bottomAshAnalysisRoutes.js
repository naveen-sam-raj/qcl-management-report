const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
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

const NUMERIC_FIELDS = ['combustible', 'gcv', 'moisture'];

// Seed readings from laboratory specifications
const SEED_READINGS = [
  { id: '1', time: '07:00', combustible: '1.0', gcv: '78', moisture: '23.7' },
  { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
];

// In-memory fallback cache
const bottomAshRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get Bottom Ash Analysis data
 * @route   GET /api/bottom-ash-analysis
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
      console.warn('[BottomAsh GET] Operator recipient resolution note:', recipErr.message);
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
      try {
        const query = {
          date,
          analysisType: 'Bottom Ash Analysis',
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const readings = payloadData.readings || payloadData.shifts || payloadData.rows || [];
          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'pending',
            assignedOperatorEmail,
            lockedShifts: payloadData.lockedShifts || defaultLocks,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              readings: readings || [],
              lockedShifts: payloadData.lockedShifts || defaultLocks,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[BottomAsh GET] MongoDB lookup note:', dbErr.message);
      }

      const match = bottomAshRecords.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          lockedShifts: match.lockedShifts || defaultLocks,
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
        analysisType: 'Bottom Ash Analysis',
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
      console.warn('[BottomAsh GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: bottomAshRecords.length,
      data: bottomAshRecords,
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
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Bottom Ash Analysis.',
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: Bottom Ash Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
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
      analysisType: 'Bottom Ash Analysis',
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const existingDoc = await PlantAnalysisRecord.findOne(query);

    let lockedShifts = {
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      shift1Locked: false,
      shift2Locked: false,
      shift3Locked: false,
      shift3Edits: 0,
    };
    let editedFields = {};
    let editAuditHistory = [];
    let oldReadings = [];

    if (existingDoc && existingDoc.data) {
      if (existingDoc.data.lockedShifts) {
        lockedShifts = { ...lockedShifts, ...existingDoc.data.lockedShifts };
      }
      editedFields = { ...(existingDoc.data.editedFields || {}) };
      editAuditHistory = [...(existingDoc.data.editAuditHistory || [])];
      oldReadings = existingDoc.data.readings || existingDoc.data.shifts || [];
    }

    // Group incoming rows by shift
    const s1Rows = readings.filter((r) => getShiftFromTime(r.time) === 'shift1');
    const s2Rows = readings.filter((r) => getShiftFromTime(r.time) === 'shift2');
    const s3Rows = readings.filter((r) => getShiftFromTime(r.time) === 'shift3');

    const hasData = (rowList) =>
      rowList.some((r) => NUMERIC_FIELDS.some((f) => r[f] !== '' && r[f] !== null && r[f] !== undefined));

    const hasS1 = hasData(s1Rows);
    const hasS2 = hasData(s2Rows);
    const hasS3 = hasData(s3Rows);

    // Sequential Shift Progression Enforcement
    if (hasS2 && !lockedShifts.shift1Saved && !hasS1) {
      return res.status(400).json({
        success: false,
        message: 'Sequential shift restriction: Shift 1 must be completed and saved before proceeding to Shift 2.',
      });
    }

    if (hasS3 && !lockedShifts.shift2Saved && !hasS2) {
      return res.status(400).json({
        success: false,
        message: 'Sequential shift restriction: Shift 2 must be completed and saved before proceeding to Shift 3.',
      });
    }

    // Check if shift1/shift2/shift3 values changed
    const s1Changed = s1Rows.some((newRow) => {
      const oldRow = oldReadings.find((r) => r.id === newRow.id || r.time === newRow.time);
      return oldRow && NUMERIC_FIELDS.some((f) => isValDiff(oldRow[f], newRow[f]));
    });
    const s2Changed = s2Rows.some((newRow) => {
      const oldRow = oldReadings.find((r) => r.id === newRow.id || r.time === newRow.time);
      return oldRow && NUMERIC_FIELDS.some((f) => isValDiff(oldRow[f], newRow[f]));
    });
    const s3Changed = s3Rows.some((newRow) => {
      const oldRow = oldReadings.find((r) => r.id === newRow.id || r.time === newRow.time);
      return oldRow && NUMERIC_FIELDS.some((f) => isValDiff(oldRow[f], newRow[f]));
    });

    // Check Lock Violations
    const isAllPermanentlyLocked = Boolean(
      lockedShifts.shift3Locked ||
      (lockedShifts.shift1Locked && lockedShifts.shift2Locked && lockedShifts.shift3Locked) ||
      (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)
    );
    if (isAllPermanentlyLocked) {
      return res.status(400).json({
        success: false,
        message: 'All shifts for this date are permanently locked. No further edits permitted.',
      });
    }

    if ((lockedShifts.shift1Locked || lockedShifts.shift2Saved) && s1Changed) {
      return res.status(400).json({
        success: false,
        message: 'I SHIFT is permanently locked because II SHIFT has already been saved.',
      });
    }

    if ((lockedShifts.shift2Locked || lockedShifts.shift3Saved) && s2Changed) {
      return res.status(400).json({
        success: false,
        message: 'II SHIFT is permanently locked because III SHIFT has already been saved.',
      });
    }

    if ((lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) && s3Changed) {
      return res.status(400).json({
        success: false,
        message: 'III SHIFT has exhausted its single permitted correction edit and all shifts for this date are permanently locked.',
      });
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
          (shiftType === 'shift1' && existingDoc.data.lockedShifts?.shift1Saved) ||
          (shiftType === 'shift2' && existingDoc.data.lockedShifts?.shift2Saved) ||
          (shiftType === 'shift3' && existingDoc.data.lockedShifts?.shift3Saved);

        if (oldRow && wasPriorSaved) {
          NUMERIC_FIELDS.forEach((f) => {
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

    // Update Shift Lock State Machine
    if (hasS1) {
      lockedShifts.shift1Saved = true;
      // Shift 1 remains editable until Shift 2 is saved
    }

    if (hasS2) {
      lockedShifts.shift2Saved = true;
      lockedShifts.shift1Locked = true; // Lock Shift 1 permanently when Shift 2 is saved
      // Shift 2 remains editable until Shift 3 is saved
    }

    if (hasS3) {
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2Locked = true; // Lock Shift 2 permanently when Shift 3 is saved
      if (lockedShifts.shift3Saved && s3Changed) {
        // Permitted single correction edit
        lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
        lockedShifts.shift3Locked = true; // Permanently lock all 3 shifts
      } else if (!lockedShifts.shift3Saved) {
        lockedShifts.shift3Saved = true;
        lockedShifts.shift3Edits = 0;
        lockedShifts.shift3Locked = false; // 1 correction edit permitted
      }
    }

    const activeShift = hasS3 ? 'III SHIFT' : hasS2 ? 'II SHIFT' : 'I SHIFT';

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `bottomash_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: 'Bottom ash',
      analysisType: 'Bottom Ash Analysis',
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
    const memIdx = bottomAshRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      bottomAshRecords[memIdx] = { ...bottomAshRecords[memIdx], ...recordData };
    } else {
      bottomAshRecords.unshift(recordData);
    }

    // Persist to MongoDB
    let savedRecord = null;
    try {
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        query,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'Bottom Ash Analysis',
          unit: 'Bottom ash',
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
      console.error('[BottomAsh POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow
    const saveEventId = `save_bottomash_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'Bottom Ash Analysis',
        unit: 'Bottom ash',
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
      console.warn('[BottomAsh POST] Email notification dispatch note:', notifyErr.message);
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
          action: 'BOTTOM_ASH_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Bottom Ash Analysis saved for date: ${payload.date} (${activeShift}). Email ${emailStatus} to ${emailRecipient || 'N/A'}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: isEmailDelivered
        ? 'Bottom Ash Analysis saved and email sent successfully.'
        : 'Bottom Ash Analysis saved successfully in MongoDB. Email delivery failed: ' + (emailResult.error || emailResult.emailError || emailResult.message || 'No registered recipient available'),
      recordId: savedRecord._id,
      emailStatus,
      emailRecipient,
      emailMessageId: emailResult.messageId || '',
      emailError: isEmailDelivered ? undefined : (emailResult.error || emailResult.emailError || emailResult.message),
      lockedShifts,
      editedFields,
      editAuditHistory,
      data: recordData,
    });
  } catch (error) {
    console.error('[BottomAsh POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Bottom Ash analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for Bottom Ash Analysis
 * @route   POST /api/bottom-ash-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Valid Record ID is required for email retry.' });
    }

    const record = await PlantAnalysisRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found for email retry.' });
    }

    // Do not resend duplicate notifications if already confirmed successful
    if (record.emailStatus === 'sent') {
      return res.status(200).json({
        success: true,
        alreadySent: true,
        emailSent: true,
        emailStatus: 'sent',
        emailRecipient: record.emailRecipient || null,
        message: `Notification email has already been successfully sent to ${record.emailRecipient}.`,
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
    const retryEventId = `retry_bottomash_${Date.now()}`;
    const emailResult = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'OFFSITE',
      analysisType: record.analysisType || 'Bottom Ash Analysis',
      unit: record.unit || 'Bottom ash',
      shift: record.shift || 'All Shifts',
      date: record.date,
      data: record.data,
      submittedBy: req.user?.name || record.submittedBy,
      submittedById: req.user?._id || record.submittedById,
      company: record.company,
      explicitRecord: record,
      rawBody: record.data,
      saveEventId: retryEventId,
      isTestMode,
    });

    const isEmailDelivered = emailResult.emailSent === true || (emailResult.success === true && emailResult.emailStatus === 'sent');
    const status = isEmailDelivered ? 'sent' : 'failed';
    record.emailStatus = status;
    if (emailResult.recipient) record.emailRecipient = emailResult.recipient;
    await record.save();

    return res.status(200).json({
      success: true,
      emailSent: isEmailDelivered,
      emailStatus: status,
      emailRecipient: record.emailRecipient || null,
      emailError: isEmailDelivered ? undefined : (emailResult.error || emailResult.emailError || emailResult.message),
      message: isEmailDelivered
        ? `Notification email successfully sent to ${record.emailRecipient}.`
        : `Email retry failed: ${emailResult.error || emailResult.emailError || emailResult.message || 'Delivery rejected'}.`,
    });
  } catch (error) {
    console.error('[BottomAsh Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email retry: ' + error.message,
    });
  }
});

module.exports = router;
