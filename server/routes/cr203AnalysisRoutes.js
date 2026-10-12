const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory fallback
const cr203Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_TIME_SLOTS = {
  shift1: ['t07', 't11'],
  shift2: ['t15', 't19'],
  shift3: ['t23', 't03'],
};

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
 * @desc    Save CR 203 Analysis data (Shift-wise workflow, today date restriction, locking & instant email)
 * @route   POST /api/cr-203-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify CR 203
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: CR 203 Analysis data entry and modification is restricted to Company Admins.',
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
        message: 'Analysis Date is required to save CR 203 Analysis.',
      });
    }

    // 2. Strict Today's Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: CR 203 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const newlySavedShifts = [];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'CR 203 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingTimeRows = existingData.timeRows || {};
    let existingFnh3Row = existingData.fnh3Row || {};
    let existingPclRow = existingData.pclRow || {};

    const incomingTimeRows = payload.timeRows || {};
    const incomingFnh3Row = payload.fnh3Row || {};
    const incomingPclRow = payload.pclRow || {};

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, tRowsSource) => {
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const slot = tRowsSource[sKey];
        return slot && Object.values(slot).some((v) => v !== null && v !== '');
      });
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldTRows, newTRows) => {
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const oldSlot = oldTRows[sKey] || {};
        const newSlot = newTRows[sKey] || {};
        const fieldsToCheck = [...STREAMS, 'avgTcl'];
        return fieldsToCheck.some((f) => {
          let oVal = oldSlot[f] ?? null;
          let nVal = newSlot[f] ?? null;
          if (nVal === '') nVal = null;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            return Number(oVal) !== Number(nVal);
          }
          return oVal !== nVal;
        });
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

    // Check lock violations for time slots
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingTimeRows) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingTimeRows, incomingTimeRows)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is locked.`,
          });
        }
      }
    }

    // Determine which shift has changes and is unlocked
    for (const key of targetShifts) {
      if (hasShiftData(key, incomingTimeRows) && isShiftDiff(key, existingTimeRows, incomingTimeRows) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Also check changes in global FNH3 / PCL rows
    const isRowDiff = (oldR, newR) => {
      const fields = [...STREAMS, 'avgTcl'];
      return fields.some((f) => {
        let oVal = oldR[f] ?? null;
        let nVal = newR[f] ?? null;
        if (nVal === '') nVal = null;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          return Number(oVal) !== Number(nVal);
        }
        return oVal !== nVal;
      });
    };

    const fnh3Changed = isRowDiff(existingFnh3Row, incomingFnh3Row);
    const pclChanged = isRowDiff(existingPclRow, incomingPclRow);

    // If only FNH3 or PCL changed, associate with current active unlocked shift
    const shiftsToSave = targetShifts.filter((k) => willSave[k]);
    if (shiftsToSave.length === 0 && (fnh3Changed || pclChanged)) {
      if (!lockedShifts.shift1Saved || !lockedShifts.shift2Saved) {
        if (!lockedShifts.shift1Saved) shiftsToSave.push('shift1');
        else shiftsToSave.push('shift2');
      } else if (!lockedShifts.shift3Saved || (lockedShifts.shift3Edits || 0) === 0) {
        shiftsToSave.push('shift3');
      } else {
        return res.status(400).json({
          success: false,
          message: 'All shifts for today are permanently locked. Cannot edit FNH₃ or PCl.',
        });
      }
    }

    // Enforce Shift-Wise Locking: Only one shift can be saved at a time
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

    // Merge rows separately without overwriting untouched slots
    const mergedTimeRows = { ...(existingTimeRows || {}) };
    const slotKeysToUpdate = SHIFT_TIME_SLOTS[activeShiftKey] || [];

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    slotKeysToUpdate.forEach((sKey) => {
      const oldSlot = mergedTimeRows[sKey] || {};
      const newSlot = incomingTimeRows[sKey] || {};

      if (isPriorSavedShift) {
        [...STREAMS, 'avgTcl'].forEach((fieldKey) => {
          const oVal = oldSlot[fieldKey] ?? null;
          let nVal = newSlot[fieldKey] ?? null;
          if (nVal === '') nVal = null;

          let isParamChanged = false;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            isParamChanged = Number(oVal) !== Number(nVal);
          } else {
            isParamChanged = oVal !== nVal;
          }

          if (isParamChanged) {
            editedFields[`${sKey}_${fieldKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: sKey,
              paramKey: fieldKey,
              oldValue: oVal !== null ? Number(oVal) : null,
              newValue: nVal !== null ? Number(nVal) : null,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              editedById: req.user?._id || null,
              timestamp: new Date(),
            });
          }
        });
      }

      mergedTimeRows[sKey] = newSlot;
    });

    // Check changes for FNH3 and PCL rows
    const mergedFnh3Row = { ...(existingFnh3Row || {}), ...(incomingFnh3Row || {}) };
    const mergedPclRow = { ...(existingPclRow || {}), ...(incomingPclRow || {}) };

    if (isPriorSavedShift) {
      if (fnh3Changed) {
        [...STREAMS, 'avgTcl'].forEach((fieldKey) => {
          const oVal = existingFnh3Row[fieldKey] ?? null;
          let nVal = incomingFnh3Row[fieldKey] ?? null;
          if (nVal === '') nVal = null;
          if (oVal !== nVal) {
            editedFields[`fnh3_${fieldKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: 'fnh3',
              paramKey: fieldKey,
              oldValue: oVal,
              newValue: nVal,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              timestamp: new Date(),
            });
          }
        });
      }
      if (pclChanged) {
        [...STREAMS, 'avgTcl'].forEach((fieldKey) => {
          const oVal = existingPclRow[fieldKey] ?? null;
          let nVal = incomingPclRow[fieldKey] ?? null;
          if (nVal === '') nVal = null;
          if (oVal !== nVal) {
            editedFields[`pcl_${fieldKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: 'pcl',
              paramKey: fieldKey,
              oldValue: oVal,
              newValue: nVal,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              timestamp: new Date(),
            });
          }
        });
      }
    }

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

    // Package complete data structure
    const updatedRecordData = {
      id: existingData.id || `cr203_${Date.now()}`,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'CR 203 Analysis',
      crystallizer: 'CR 203',
      unit: 'CR 203',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
      timeRows: mergedTimeRows,
      fnh3Row: mergedFnh3Row,
      pclRow: mergedPclRow,
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
        analysisType: 'CR 203 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'CR 203 Analysis',
        unit: 'CR 203',
        date: payload.date,
        shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
        data: updatedRecordData,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update in-memory cache
    cr203Records.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'CR_203_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `CR 203 Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // ── Execute Instant Email Dispatch Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    const emailPromises = newlySavedShifts.map((shiftKey) =>
      executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'CR 203 Analysis',
        unit: 'CR 203',
        shift: SHIFT_DISPLAY_NAMES[shiftKey],
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: payload,
      }).catch((err) => {
        console.warn(`[AutoPlantEmail] Instant workflow note for CR 203 ${shiftKey}:`, err.message);
        return { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
      })
    );

    let lastEmailResult = null;
    let emailTimedOut = false;
    const fastCheck = Promise.all(emailPromises);
    const fastLimit = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 800));

    const raceResult = await Promise.race([fastCheck, fastLimit]);
    if (raceResult === 'TIMEOUT') {
      emailTimedOut = true;
    } else if (Array.isArray(raceResult) && raceResult.length > 0) {
      lastEmailResult = raceResult[raceResult.length - 1];
    }

    const emailSent = !!(lastEmailResult && lastEmailResult.emailSent);
    const finalEmailStatus = emailTimedOut
      ? 'pending'
      : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} & email sent ✓`
        : `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} — Email dispatching immediately 🚀`,
      data: updatedRecordData,
      emailSent,
      emailPending: emailTimedOut,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
      newlySavedShifts,
    });
  } catch (error) {
    console.error('[CR203Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing CR 203 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve CR 203 Analysis records
 * @route   GET /api/cr-203-analysis
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
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'CR 203 Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        return res.status(200).json({
          success: true,
          data: [doc.data],
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
    console.error('[CR203 GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved CR 203 analysis record
 * @route   POST /api/cr-203-analysis/:id/retry-email
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
      record = cr203Records.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'CR 203 analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'ACL Plant',
      analysisType: record.analysisType || 'CR 203 Analysis',
      unit: 'CR 203',
      shift: req.body?.shift || record.shift || 'All Shifts',
      date: record.date,
      data: record.data,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json(result);
  } catch (error) {
    console.error('[CR203 Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
