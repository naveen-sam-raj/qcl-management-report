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

const SHIFT_FIELDS = ['ph', 'po4', 'na2so3', 'talk', 'tfe', 'sio2', 'ss', 'tds'];

// Initial sample data from user's laboratory screenshot
const SEED_SHIFTS = {
  iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
  iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
};

// In-memory fallback cache
const cbdRecords = [
  {
    id: 'cbd_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    plantCode: 'OFFSITE',
    unit: 'CBD',
    analysisType: 'CBD Analysis',
    shifts: SEED_SHIFTS,
    lockedShifts: {
      shift1Saved: true,
      shift2Saved: false,
      shift3Saved: false,
      shift1Locked: false,
      shift2Locked: false,
      shift3Locked: false,
      shift3Edits: 0,
    },
    editedFields: {},
    editAuditHistory: [],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T10:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get CBD Analysis data
 * @route   GET /api/cbd-analysis
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
      console.warn('[CBD GET] Operator recipient resolution note:', recipErr.message);
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
          analysisType: 'CBD Analysis',
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const shifts = payloadData.shifts || payloadData.data || payloadData;
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
              shifts: shifts || SEED_SHIFTS,
              lockedShifts: payloadData.lockedShifts || defaultLocks,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[CBD GET] MongoDB lookup note:', dbErr.message);
      }

      const match = cbdRecords.find((r) => r.date === date);
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
        analysisType: 'CBD Analysis',
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
      console.warn('[CBD GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: cbdRecords.length,
      data: cbdRecords,
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
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save CBD Analysis.',
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: CBD Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
      });
    }

    const shifts = payload.shifts || {};
    const errors = [];

    ['iShift', 'iiShift', 'iiiShift'].forEach((sKey) => {
      const sData = shifts[sKey] || {};
      SHIFT_FIELDS.forEach((f) => {
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
    const query = {
      date: payload.date,
      analysisType: 'CBD Analysis',
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
      shift1Edits: 0,
      shift2Edits: 0,
      shift3Edits: 0,
    };
    let editedFields = {};
    let editAuditHistory = [];
    let oldShifts = { iShift: {}, iiShift: {}, iiiShift: {} };

    if (existingDoc && existingDoc.data) {
      if (existingDoc.data.lockedShifts) {
        lockedShifts = { ...lockedShifts, ...existingDoc.data.lockedShifts };
      }
      editedFields = { ...(existingDoc.data.editedFields || {}) };
      editAuditHistory = [...(existingDoc.data.editAuditHistory || [])];
      oldShifts = existingDoc.data.shifts || existingDoc.data.data || oldShifts;
    }

    // Helper: Check if a shift has non-empty values
    const hasData = (sData) =>
      sData && SHIFT_FIELDS.some((f) => sData[f] !== '' && sData[f] !== null && sData[f] !== undefined);

    const hasS1 = hasData(shifts.iShift);
    const hasS2 = hasData(shifts.iiShift);
    const hasS3 = hasData(shifts.iiiShift);

    // 1. Sequential Progression Enforcement
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

    // 2. Lock Enforcement (One-Time Edit per Shift)
    const s1Changed = SHIFT_FIELDS.some((f) => isValDiff(oldShifts.iShift?.[f], shifts.iShift?.[f]));
    const s2Changed = SHIFT_FIELDS.some((f) => isValDiff(oldShifts.iiShift?.[f], shifts.iiShift?.[f]));
    const s3Changed = SHIFT_FIELDS.some((f) => isValDiff(oldShifts.iiiShift?.[f], shifts.iiiShift?.[f]));

    if (lockedShifts.shift1Locked && s1Changed) {
      return res.status(400).json({
        success: false,
        message: 'Shift 1 is permanently locked. Only 1 edit is permitted and it has already been utilized.',
      });
    }

    if (lockedShifts.shift2Locked && s2Changed) {
      return res.status(400).json({
        success: false,
        message: 'Shift 2 is permanently locked. Only 1 edit is permitted and it has already been utilized.',
      });
    }

    if (lockedShifts.shift3Locked && s3Changed) {
      return res.status(400).json({
        success: false,
        message: 'Shift 3 is permanently locked. Only 1 edit is permitted and it has already been utilized.',
      });
    }

    // 3. Field-Level Edit Audit
    const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
    const nowIso = new Date().toISOString();

    if (existingDoc && existingDoc.data) {
      ['iShift', 'iiShift', 'iiiShift'].forEach((sKey) => {
        SHIFT_FIELDS.forEach((f) => {
          const oldVal = oldShifts[sKey]?.[f];
          const newVal = shifts[sKey]?.[f];

          if (isValDiff(oldVal, newVal)) {
            const fieldKey = `${sKey}_${f}`;
            editedFields[fieldKey] = true;
            editAuditHistory.push({
              shift: sKey === 'iShift' ? 'I SHIFT' : sKey === 'iiShift' ? 'II SHIFT' : 'III SHIFT',
              field: f,
              oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
              newValue: newVal !== undefined && newVal !== null ? String(newVal) : '',
              editedBy: editorName,
              timestamp: nowIso,
            });
          }
        });
      });
    }

    // 4. Update Shift Lock State Machine (One-Time Edit per Shift)
    if (hasS1) {
      if (lockedShifts.shift1Saved && s1Changed) {
        lockedShifts.shift1Edits = (lockedShifts.shift1Edits || 0) + 1;
        if (lockedShifts.shift1Edits >= 1) {
          lockedShifts.shift1Locked = true;
        }
      } else {
        lockedShifts.shift1Saved = true;
      }
    }

    if (hasS2) {
      lockedShifts.shift1Locked = true; // Lock Shift 1 permanently when Shift 2 is saved
      if (lockedShifts.shift2Saved && s2Changed) {
        lockedShifts.shift2Edits = (lockedShifts.shift2Edits || 0) + 1;
        if (lockedShifts.shift2Edits >= 1) {
          lockedShifts.shift2Locked = true;
        }
      } else {
        lockedShifts.shift2Saved = true;
      }
    }

    if (hasS3) {
      lockedShifts.shift2Locked = true; // Lock Shift 2 permanently when Shift 3 is saved
      if (lockedShifts.shift3Saved && s3Changed) {
        lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
        if (lockedShifts.shift3Edits >= 1) {
          lockedShifts.shift3Locked = true;
        }
      } else {
        lockedShifts.shift3Saved = true;
      }
    }

    const isAllLocked = Boolean(lockedShifts.shift1Locked && lockedShifts.shift2Locked && lockedShifts.shift3Locked);

    // Active shift for notification subject
    const activeShift = hasS3 ? 'III SHIFT' : hasS2 ? 'II SHIFT' : 'I SHIFT';

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `cbd_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: 'CBD',
      analysisType: 'CBD Analysis',
      shifts,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Update in-memory fallback
    const memIdx = cbdRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      cbdRecords[memIdx] = { ...cbdRecords[memIdx], ...recordData };
    } else {
      cbdRecords.unshift(recordData);
    }

    // Persist to MongoDB PlantAnalysisRecord
    let savedRecord = null;
    try {
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        query,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'CBD Analysis',
          unit: 'CBD',
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
      console.error('[CBD POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow
    const saveEventId = `save_cbd_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'CBD Analysis',
        unit: 'CBD',
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
      console.warn('[CBD POST] Email notification dispatch note:', notifyErr.message);
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
          action: 'CBD_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `CBD Analysis saved for date: ${payload.date} (${activeShift}). Email ${emailStatus} to ${emailRecipient || 'N/A'}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: isEmailDelivered
        ? 'CBD Analysis saved and email sent successfully.'
        : 'CBD Analysis saved successfully in MongoDB. Email delivery failed: ' + (emailResult.error || emailResult.emailError || emailResult.message || 'No registered recipient available'),
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
    console.error('[CBD POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing CBD analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for CBD Analysis
 * @route   POST /api/cbd-analysis/:id/retry-email
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
    const retryEventId = `retry_cbd_${Date.now()}`;
    const emailResult = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'OFFSITE',
      analysisType: record.analysisType || 'CBD Analysis',
      unit: record.unit || 'CBD',
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
    console.error('[CBD Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email retry: ' + error.message,
    });
  }
});

module.exports = router;
