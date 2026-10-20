const express = require('express');
const router = express.Router();
const { PureSaltSieveAnalysis, ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { generatePureSaltSieveAnalysisExcel } = require('../services/excelService');
const { getPlantAssignedUser } = require('../services/plantNotificationService');
const { protect } = require('../middleware/auth');
const {
  hydrateLockState,
  getInitialLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
} = require('../services/analysisLockEngine');

// In-memory fallback array for resilient offline operation
const analysisRecords = [];

const defaultLocks = {
  shift1: false,
  shift2: true,
  shift3: true,
  shift1Locked: false,
  shift2Locked: true,
  shift3Locked: true,
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift3Edits: 0,
};

const getTodayKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

/**
 * @desc    Save Pure Salt Sieve Analysis data, generate Excel .xlsx report, and send email via Nodemailer
 * @route   POST /api/pure-salt-sieve-analysis
 * @access  Private (Admins / Plant Operators)
 */
router.post('/', protect, async (req, res) => {
  try {
    const payload = req.body;

    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.errors[0], errors: validation.errors });
    }

    if (!payload.date) {
      return res.status(400).json({ success: false, message: 'Analysis date is required.' });
    }

    // ── Enforce Authorization: Standard users in View-Only mode cannot modify Pure Salt Sieve Analysis ──
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Pure Salt Sieve Analysis data entry and modification is restricted to Company Admins.',
      });
    }

    // ── Enforce Today's Date Restriction (Asia/Kolkata) with test mode bypass ──
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Pure Salt Sieve Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetRows = ['shift1', 'shift2', 'shift3'];
    const shiftDisplayNames = {
      shift1: 'I SHIFT',
      shift2: 'II SHIFT',
      shift3: 'III SHIFT',
    };
    const newlySavedShifts = [];
    let savedRecord;

    const query = {
      date: payload.date,
      plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: payload.analysisType || 'Pure Salt Sieve Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingRecord = await PureSaltSieveAnalysis.findOne(query);

    const hasData = (rowObj) => rowObj && Object.values(rowObj).some((val) => val !== null && val !== '');

    const isDiff = (oldRow, newRow) => {
      if (!oldRow && newRow) return true;
      if (oldRow && !newRow) return false;
      return Object.keys(newRow).some((k) => {
        let oldVal = oldRow[k] ?? null;
        let newVal = newRow[k] ?? null;
        if (newVal === '') newVal = null;
        if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
          return Number(oldVal) !== Number(newVal);
        }
        return oldVal !== newVal;
      });
    };

    let lockedShifts = existingRecord?.lockedShifts
      ? hydrateLockState(existingRecord.lockedShifts, { type: 'shift', items: targetRows })
      : getInitialLockState({ type: 'shift', items: targetRows });
    let editedFields = existingRecord?.editedFields || {};
    let editAuditHistory = existingRecord?.editAuditHistory || [];

    const isShiftLocked = (key) => {
      const check = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: key,
        itemsOrder: targetRows,
        isDiff: true,
        type: 'shift',
      });
      return !check.allowed;
    };

    if (lockedShifts.allPermanentlyLocked) {
      const hasShiftChanges = targetRows.some(
        (key) => hasData(payload.rows?.[key]) && isDiff(existingRecord?.rows?.[key], payload.rows?.[key])
      );
      if (hasShiftChanges) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }
    }

    const willSave = {};

    // Check if user is trying to edit locked shifts
    for (const key of targetRows) {
      if (hasData(payload.rows?.[key]) && isShiftLocked(key)) {
        if (isDiff(existingRecord?.rows?.[key], payload.rows?.[key])) {
          const check = validateSequentialSave({
            lockState: lockedShifts,
            targetItem: key,
            itemsOrder: targetRows,
            isDiff: true,
            type: 'shift',
          });
          return res.status(400).json({
            success: false,
            message: check.message || `Cannot edit ${shiftDisplayNames[key] || key} because it is permanently locked.`,
          });
        }
      }
    }

    for (const key of targetRows) {
      if (hasData(payload.rows?.[key]) && isDiff(existingRecord?.rows?.[key], payload.rows?.[key]) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Enforce Shift-Wise Locking: Only one shift can be edited and saved at a time
    const shiftsToSave = targetRows.filter((k) => willSave[k]);
    if (shiftsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift can be edited and saved at a time.',
      });
    }

    const activeKey = shiftsToSave[0];
    if (!activeKey) {
      return res.status(400).json({ success: false, message: 'No unlocked shifts with valid new data were found to save.' });
    }

    // Authoritative sequential save check
    const saveValidation = validateSequentialSave({
      lockState: lockedShifts,
      targetItem: activeKey,
      itemsOrder: targetRows,
      isDiff: true,
      type: 'shift',
    });
    if (!saveValidation.allowed) {
      return res.status(saveValidation.statusCode || 400).json({
        success: false,
        message: saveValidation.message,
      });
    }

    const isPriorSavedShift =
      (activeKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeKey === 'shift3' && lockedShifts.shift3Saved);

    const oldVals = (existingRecord?.rows && existingRecord.rows[activeKey]) || {};
    const newVals = payload.rows[activeKey] || {};

    if (isPriorSavedShift) {
      Object.keys(newVals).forEach((paramKey) => {
        const oVal = oldVals[paramKey] ?? null;
        let nVal = newVals[paramKey] ?? null;
        if (nVal === '') nVal = null;

        let isParamChanged = false;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          isParamChanged = Number(oVal) !== Number(nVal);
        } else {
          isParamChanged = oVal !== nVal;
        }

        if (isParamChanged) {
          const fieldKey = `${activeKey}_${paramKey}`;
          if (editedFields.set) {
            editedFields.set(fieldKey, true);
          } else {
            editedFields[fieldKey] = true;
          }

          editAuditHistory.push({
            shiftKey: activeKey,
            paramKey,
            oldValue: oVal !== null ? Number(oVal) : null,
            newValue: nVal !== null ? Number(nVal) : null,
            editedBy: req.user?.name || payload.submittedBy || 'Admin',
            editedById: req.user?._id || null,
            timestamp: new Date(),
          });
        }
      });
    }

    const existingRows = existingRecord?.rows && typeof existingRecord.rows.toObject === 'function'
      ? existingRecord.rows.toObject()
      : (existingRecord?.rows || {});
    const defaultRow = () => ({ m16: null, m20: null, m30: null, m40: null, m50: null, m70: null, m100: null, pan: null });
    const mergedRows = {
      shift1: defaultRow(),
      shift2: defaultRow(),
      shift3: defaultRow(),
      ...existingRows,
    };
    mergedRows[activeKey] = newVals;
    newlySavedShifts.push(activeKey);

    // Update locked status via universal locking engine
    lockedShifts = applySequentialSaveTransition({
      lockState: lockedShifts,
      targetItem: activeKey,
      itemsOrder: targetRows,
      isCorrection: saveValidation.isCorrection,
      type: 'shift',
    });

    if (existingRecord) {
      existingRecord.rows = mergedRows;
      existingRecord.lockedShifts = lockedShifts;
      existingRecord.editedFields = editedFields;
      existingRecord.editAuditHistory = editAuditHistory;
      existingRecord.markModified('rows');
      existingRecord.markModified('lockedShifts');
      existingRecord.markModified('editedFields');
      existingRecord.markModified('editAuditHistory');
      existingRecord.submittedBy = req.user?.name || payload.submittedBy || 'Plant Operator';
      existingRecord.submittedById = req.user?._id || null;
      existingRecord.savedAt = new Date();
      savedRecord = await existingRecord.save();
    } else {
      savedRecord = await PureSaltSieveAnalysis.create({
        date: payload.date,
        plant: plantTarget,
        analysisType: payload.analysisType || 'Pure Salt Sieve Analysis',
        shift: payload.shift || shiftDisplayNames[activeKey] || 'All Shifts (I, II, III)',
        rows: mergedRows,
        company: req.user?.company?._id || req.user?.company || null,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        lockedShifts,
        editedFields,
        editAuditHistory,
      });
    }
    // Mirror to PlantAnalysisRecord for global multi-analysis reporting
    try {
      if (PlantAnalysisRecord) {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
            analysisType: 'Pure Salt Sieve Analysis',
            date: payload.date,
          },
          {
            plantName: 'ACL Plant',
            plantCode: 'ACL',
            analysisType: 'Pure Salt Sieve Analysis',
            unit: '',
            date: payload.date,
            data: {
              ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
              rows: savedRecord.rows || payload.rows,
              lockedShifts: savedRecord.lockedShifts,
              editedFields: savedRecord.editedFields,
              editAuditHistory: savedRecord.editAuditHistory,
            },
            submittedBy: savedRecord.submittedBy,
            submittedById: savedRecord.submittedById,
            company: savedRecord.company,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (dbErr) {
      console.warn('[PureSaltSieveAnalysis] PlantAnalysisRecord sync note:', dbErr.message);
    }

    analysisRecords.unshift(savedRecord.toObject ? savedRecord.toObject() : savedRecord);

    // ── Execute Centralized Save -> Timestamp -> Assigned User -> Email Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    const emailPromises = newlySavedShifts.map((shiftKey) =>
      executeSaveAndEmailWorkflow({
        plantIdentifier: 'ACL',
        analysisType: 'Pure Salt Sieve Analysis',
        unit: '',
        shift: shiftDisplayNames[shiftKey],
        date: payload.date,
        data: mergedRows,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: savedRecord?.company || req.user?.company?._id || req.user?.company || null,
        explicitRecord: savedRecord,
        rawBody: { ...payload, rows: mergedRows },
        isTestMode,
      }).catch((err) => {
        console.warn(`[AutoPlantEmail] Instant workflow note for sieve ${shiftKey}:`, err.message);
        return { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
      })
    );

    let lastEmailResult = null;
    try {
      const emailResults = await Promise.all(emailPromises);
      if (Array.isArray(emailResults) && emailResults.length > 0) {
        lastEmailResult = emailResults[emailResults.length - 1];
      }
    } catch (err) {
      console.warn('[AutoPlantEmail] Note:', err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.success));
    const finalEmailStatus = emailSent ? 'sent' : 'failed';
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedRecord?.emailRecipient ||
      '';

    return res.status(200).json({
      success: true,
      message: `Successfully saved in MongoDB ✓`,
      data: savedRecord,
      lockedShifts,
      editedFields,
      editAuditHistory,
      emailSent: false,
      emailPending: false,
      emailStatus: 'disabled',
      emailRecipient: '',
      newlySavedShifts,
    });
  } catch (error) {
    console.error('[PureSaltSieveAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to save the sieve analysis data. Please try again.',
      error: error.message,
    });
  }
});

/**
 * @desc    Direct download of generated Excel file for a Pure Salt Sieve record
 * @route   GET /api/pure-salt-sieve-analysis/:id/download-excel
 * @access  Private
 */
router.get('/:id/download-excel', protect, async (req, res) => {
  try {
    const { id } = req.params;
    let record = null;

    if (PureSaltSieveAnalysis && typeof PureSaltSieveAnalysis.findById === 'function') {
      record = await PureSaltSieveAnalysis.findById(id);
    }
    if (!record) {
      record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Sieve analysis record not found.' });
    }

    const excelResult = await generatePureSaltSieveAnalysisExcel(record);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
    return res.send(excelResult.buffer);
  } catch (error) {
    console.error('[PureSaltSieveAnalysis] Error downloading Excel:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @desc    Retry sending email with Excel report for an existing saved Sieve analysis record
 * @route   POST /api/pure-salt-sieve-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', protect, async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

/**
 * @desc    Retrieve Pure Salt Sieve Analysis records from MongoDB Atlas
 * @route   GET /api/pure-salt-sieve-analysis
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const { date } = req.query;

    // Dynamically resolve the active User assigned to ACL Plant under the company
    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {
      console.warn('[PureSaltSieve GET] Operator lookup warning:', uErr.message);
    }

    const targetRows = ['shift1', 'shift2', 'shift3'];

    if (date) {
      const query = { date, plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Sieve Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      let doc = await PureSaltSieveAnalysis.findOne(query).sort({ createdAt: -1 }).lean();

      if (!doc && PlantAnalysisRecord) {
        const fallback = await PlantAnalysisRecord.findOne({
          date,
          plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
          analysisType: 'Pure Salt Sieve Analysis',
        }).sort({ createdAt: -1 }).lean();
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
        const resolvedLocks = doc.lockedShifts
          ? hydrateLockState(doc.lockedShifts, { type: 'shift', items: targetRows })
          : getInitialLockState({ type: 'shift', items: targetRows });
        return res.status(200).json({
          success: true,
          data: [{ ...doc, lockedShifts: resolvedLocks }],
          lockedShifts: resolvedLocks,
          editedFields: doc.editedFields || {},
          editAuditHistory: doc.editAuditHistory || [],
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: [],
      lockedShifts: getInitialLockState({ type: 'shift', items: targetRows }),
      editedFields: {},
      editAuditHistory: [],
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[PureSaltSieve GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
