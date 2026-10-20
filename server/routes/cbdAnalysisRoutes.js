const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');
const {
  getInitialLockState,
  hydrateLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
} = require('../services/analysisLockEngine');

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
const cbdRecords = [];

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

    const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];
    const defaultLocks = getInitialLockState({ type: 'shift', items: SHIFT_KEYS });

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
          const hydratedLocks = payloadData.lockedShifts
            ? hydrateLockState(payloadData.lockedShifts, { type: 'shift', items: SHIFT_KEYS })
            : defaultLocks;
          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'pending',
            assignedOperatorEmail,
            lockedShifts: hydratedLocks,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              shifts: shifts || {},
              lockedShifts: hydratedLocks,
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
        const hydratedMatchLocks = match.lockedShifts
          ? hydrateLockState(match.lockedShifts, { type: 'shift', items: SHIFT_KEYS })
          : defaultLocks;
        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          lockedShifts: hydratedMatchLocks,
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

    const SHIFT_MAPPING = [
      { shiftKey: 'iShift', itemKey: 'shift1', name: 'I SHIFT' },
      { shiftKey: 'iiShift', itemKey: 'shift2', name: 'II SHIFT' },
      { shiftKey: 'iiiShift', itemKey: 'shift3', name: 'III SHIFT' },
    ];
    const SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];

    let lockedShifts = existingDoc?.data?.lockedShifts
      ? hydrateLockState(existingDoc.data.lockedShifts, { type: 'shift', items: SHIFT_KEYS })
      : getInitialLockState({ type: 'shift', items: SHIFT_KEYS });
    let editedFields = {};
    let editAuditHistory = [];
    let oldShifts = { iShift: {}, iiShift: {}, iiiShift: {} };

    if (existingDoc && existingDoc.data) {
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

    const s1Changed = SHIFT_FIELDS.some((f) => isValDiff(oldShifts.iShift?.[f], shifts.iShift?.[f]));
    const s2Changed = SHIFT_FIELDS.some((f) => isValDiff(oldShifts.iiShift?.[f], shifts.iiShift?.[f]));
    const s3Changed = SHIFT_FIELDS.some((f) => isValDiff(oldShifts.iiiShift?.[f], shifts.iiiShift?.[f]));

    const incomingShifts = [];
    if (hasS1) incomingShifts.push({ itemKey: 'shift1', changed: s1Changed, shiftKey: 'iShift' });
    if (hasS2) incomingShifts.push({ itemKey: 'shift2', changed: s2Changed, shiftKey: 'iiShift' });
    if (hasS3) incomingShifts.push({ itemKey: 'shift3', changed: s3Changed, shiftKey: 'iiiShift' });

    // Authoritative sequential save check via Universal Lock Engine
    for (const { itemKey, changed } of incomingShifts) {
      const isDiff = changed || !lockedShifts.slots?.[itemKey]?.isSaved;
      const valRes = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: itemKey,
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

    // Field-Level Edit Audit
    const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
    const nowIso = new Date().toISOString();

    if (existingDoc && existingDoc.data) {
      SHIFT_MAPPING.forEach(({ shiftKey: sKey, itemKey, name: sName }) => {
        const wasSaved = Boolean(
          existingDoc.data.lockedShifts?.[`${itemKey}Saved`] ||
          existingDoc.data.lockedShifts?.slots?.[itemKey]?.isSaved ||
          (itemKey === 'shift1' && existingDoc.data.lockedShifts?.s1Saved) ||
          (itemKey === 'shift2' && existingDoc.data.lockedShifts?.s2Saved) ||
          (itemKey === 'shift3' && existingDoc.data.lockedShifts?.s3Saved)
        );

        if (wasSaved) {
          SHIFT_FIELDS.forEach((f) => {
            const oldVal = oldShifts[sKey]?.[f];
            const newVal = shifts[sKey]?.[f];

            if (isValDiff(oldVal, newVal)) {
              const fieldKey = `${sKey}_${f}`;
              editedFields[fieldKey] = true;
              editAuditHistory.push({
                shift: sName,
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
    for (const { itemKey } of incomingShifts) {
      const isCorrection = Boolean(
        lockedShifts[`${itemKey}Saved`] ||
        lockedShifts.slots?.[itemKey]?.isSaved ||
        (itemKey === 'shift1' && lockedShifts.s1Saved) ||
        (itemKey === 'shift2' && lockedShifts.s2Saved) ||
        (itemKey === 'shift3' && lockedShifts.s3Saved)
      );
      lockedShifts = applySequentialSaveTransition({
        lockState: lockedShifts,
        targetItem: itemKey,
        itemsOrder: SHIFT_KEYS,
        isCorrection,
        type: 'shift',
      });
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
      message: 'CBD Analysis saved successfully in MongoDB ✓',
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
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

module.exports = router;
