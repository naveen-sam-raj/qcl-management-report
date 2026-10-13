const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory fallback
const pclTclRecords = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const STREAMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// Asia/Kolkata date helper
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
 * @desc    Save PCL/TCL Analysis data (Sequential shift workflow, today date restriction, locking & instant email)
 * @route   POST /api/pcl-tcl-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify PCL/TCL
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: PCL/TCL Analysis data entry and modification is restricted to Company Admins.',
      });
    }

    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || 'Validation failed. Enter numeric values only.',
        errors: validation.errors,
      });
    }

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save PCL/TCL Analysis.',
      });
    }

    // 2. Strict Today's Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: PCL/TCL Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const newlySavedShifts = [];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'PCL/TCL Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingRows = existingData.shiftRows || existingData.rows || existingData;

    let incomingRows = payload.shiftRows || payload.rows || {};
    if (payload.shift && payload.shiftData && !payload.shiftRows && !payload.rows) {
      const sKey = payload.shift.toLowerCase().replace(/[\s_]/g, '');
      const mappedKey = sKey === 'ishift' ? 'shift1' : sKey === 'iishift' ? 'shift2' : sKey === 'iiishift' ? 'shift3' : payload.shift;
      incomingRows = { [mappedKey]: payload.shiftData };
    }

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, rowsSource) => {
      const shift = rowsSource ? rowsSource[shiftKey] : null;
      return shift && Object.values(shift).some((v) => v !== null && v !== '');
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldRows, newRows) => {
      const oldShift = (oldRows && oldRows[shiftKey]) || {};
      const newShift = (newRows && newRows[shiftKey]) || {};
      return STREAMS.some((stream) => {
        let oVal = oldShift[stream] ?? null;
        let nVal = newShift[stream] ?? null;
        if (nVal === '') nVal = null;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          return Number(oVal) !== Number(nVal);
        }
        return oVal !== nVal;
      });
    };

    let lockedShifts = existingData.lockedShifts || {
      shift1: false,
      shift2: false,
      shift3: false,
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      shift3Edits: 0,
    };
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    // Helper: check if a shift is locked according to workflow rules
    const isShiftLocked = (key) => {
      if (lockedShifts[key]) return true;
      if (key === 'shift1' && lockedShifts.shift2Saved) return true;
      if (key === 'shift2' && lockedShifts.shift3Saved) return true;
      if (key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    };

    const willSave = {};

    // Check lock violations
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingRows) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingRows, incomingRows)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is locked.`,
          });
        }
      }
    }

    // Determine which shift has changes and is unlocked
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingRows) && isShiftDiff(key, existingRows, incomingRows) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Enforce Shift-Wise Locking: Only one shift can be saved at a time
    const shiftsToSave = targetShifts.filter((k) => willSave[k]);
    if (shiftsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time.',
      });
    }

    let newS1Saved = lockedShifts.shift1Saved || willSave.shift1;
    let newS2Saved = lockedShifts.shift2Saved || willSave.shift2;

    if (willSave.shift2 && !newS1Saved) {
      return res.status(400).json({ success: false, message: 'Cannot save II SHIFT before I SHIFT is saved.' });
    }
    if (willSave.shift3 && !newS2Saved) {
      return res.status(400).json({ success: false, message: 'Cannot save III SHIFT before II SHIFT is saved.' });
    }
    if (willSave.shift3 && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      return res.status(400).json({
        success: false,
        message: 'III SHIFT has already reached its maximum edit limit (one final edit allowed).',
      });
    }

    const activeShiftKey = shiftsToSave[0];
    if (!activeShiftKey) {
      return res.status(400).json({
        success: false,
        message: 'No unlocked shifts with valid new or modified data were found to save.',
      });
    }

    // Merge rows separately without overwriting untouched shifts
    const mergedRows = { ...(existingRows || {}) };
    const oldShift = mergedRows[activeShiftKey] || {};
    const newShift = incomingRows[activeShiftKey] || {};

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    if (isPriorSavedShift) {
      STREAMS.forEach((streamKey) => {
        const oVal = oldShift[streamKey] ?? null;
        let nVal = newShift[streamKey] ?? null;
        if (nVal === '') nVal = null;

        let isParamChanged = false;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          isParamChanged = Number(oVal) !== Number(nVal);
        } else {
          isParamChanged = oVal !== nVal;
        }

        if (isParamChanged) {
          editedFields[`${activeShiftKey}_${streamKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeShiftKey,
            shiftName: SHIFT_DISPLAY_NAMES[activeShiftKey],
            paramKey: streamKey,
            stream: streamKey.toUpperCase(),
            oldValue: oVal !== null ? Number(oVal) : null,
            newValue: nVal !== null ? Number(nVal) : null,
            editedBy: req.user?.name || payload.submittedBy || 'Admin',
            editedById: req.user?._id || null,
            timestamp: new Date(),
          });
        }
      });
    }

    mergedRows[activeShiftKey] = newShift;
    newlySavedShifts.push(activeShiftKey);

    // Update locked status
    if (activeShiftKey === 'shift1') lockedShifts.shift1Saved = true;
    if (activeShiftKey === 'shift2') lockedShifts.shift2Saved = true;
    if (activeShiftKey === 'shift3') {
      if (!lockedShifts.shift3Saved) {
        lockedShifts.shift3Saved = true;
      } else {
        lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
      }
    }

    if (lockedShifts.shift2Saved) lockedShifts.shift1 = true;
    if (lockedShifts.shift3Saved) lockedShifts.shift2 = true;
    if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      lockedShifts.shift3 = true;
    }

    // Generate unique Save Event ID
    const saveEventId = `save_pcltcl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `pcltcl_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'PCL/TCL Analysis',
      unit: 'PCL/TCL',
      frequency: 'Once in a shift',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      shiftRows: mergedRows,
      rows: mergedRows,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Save / Upsert directly to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'PCL/TCL Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'PCL/TCL Analysis',
        unit: 'PCL/TCL',
        date: payload.date,
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
        data: updatedRecordData,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company,
        lastSaveEventId: saveEventId,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update in-memory cache
    pclTclRecords.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'PCL_TCL_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `PCL/TCL Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]} [Event: ${saveEventId}].`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // ── Execute Instant Email Dispatch Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'PCL/TCL Analysis',
        unit: 'PCL/TCL',
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey],
        date: payload.date,
        data: mergedRows,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: payload,
        saveEventId,
      });

      const fastLimit = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 7500));
      const raceResult = await Promise.race([emailPromise, fastLimit]);

      if (raceResult === 'TIMEOUT') {
        emailTimedOut = true;
        emailPromise.then((bgRes) => {
          console.log(`[PclTcl Save] Background email dispatch finished for event ${saveEventId}:`, bgRes?.emailStatus);
        }).catch((bgErr) => {
          console.error(`[PclTcl Save] Background email dispatch error for event ${saveEventId}:`, bgErr.message);
        });
      } else {
        lastEmailResult = raceResult;
      }
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for PCL/TCL ${activeShiftKey}:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailTimedOut
      ? 'pending'
      : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    // Attach saved MongoDB doc _id to returned updatedRecordData
    if (savedDoc && savedDoc._id) {
      updatedRecordData._id = savedDoc._id;
      updatedRecordData.recordId = savedDoc._id;
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} & email sent ✓`
        : emailTimedOut
        ? `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} — Email dispatching immediately 🚀`
        : `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} — Email delivery failed: ${lastEmailResult?.error || 'Unknown error'}`,
      data: updatedRecordData,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      emailSent,
      emailPending: emailTimedOut,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
      newlySavedShifts,
    });
  } catch (error) {
    console.error('[PclTclAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing PCL/TCL analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve PCL/TCL Analysis records
 * @route   GET /api/pcl-tcl-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'PCL/TCL Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const enrichedData = {
          ...doc.data,
          _id: doc._id,
          recordId: doc._id,
        };
        return res.status(200).json({
          success: true,
          data: [enrichedData],
          recordId: doc._id,
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: [],
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[ACL GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved PCL/TCL analysis record
 * @route   POST /api/pcl-tcl-analysis/:id/retry-email
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
      record = pclTclRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'PCL/TCL analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'ACL Plant',
      analysisType: record.analysisType || 'PCL/TCL Analysis',
      unit: 'PCL/TCL',
      shift: req.body?.shift || record.shift || 'All Shifts',
      date: record.date,
      data: record.data?.shiftRows || record.data?.rows || record.data,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json({
      success: result.success,
      emailSent: result.emailSent,
      emailStatus: result.emailStatus,
      emailRecipient: result.recipient || result.data?.emailRecipient || '',
      error: result.error,
    });
  } catch (error) {
    console.error('[PCL/TCL Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
