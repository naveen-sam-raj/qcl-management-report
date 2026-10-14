const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');

// In-memory fallback
const tk205Records = [];

// Apply authentication middleware
router.use(protect);

const SHIFT_TIME_SLOTS = {
  shift1: ['t07', 't09', 't11', 't13'],
  shift2: ['t15', 't17', 't19', 't21'],
  shift3: ['t23', 't01', 't03', 't05'],
};

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
};

const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl'];

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
 * @desc    Save TK 205 Analysis data (Shift-wise workflow, today date restriction, locking & instant email)
 * @route   POST /api/tk-205-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Authorization: Standard users in View-Only mode cannot modify TK 205
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: TK 205 Analysis data entry and modification is restricted to Company Admins.',
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
        message: 'Analysis Date is required to save TK 205 Analysis.',
      });
    }

    // 2. Strict Today's Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: TK 205 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const newlySavedShifts = [];

    // Query existing record for this date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'TK 205 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingRows = existingData.rows || existingData;

    // Helper: check if a shift has non-empty values
    const hasShiftData = (shiftKey, rowsSource) => {
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const slot = rowsSource[sKey];
        return slot && Object.values(slot).some((v) => v !== null && v !== '');
      });
    };

    // Helper: check if incoming shift data differs from existing
    const isShiftDiff = (shiftKey, oldRows, newRows) => {
      const slotKeys = SHIFT_TIME_SLOTS[shiftKey] || [];
      return slotKeys.some((sKey) => {
        const oldSlot = oldRows[sKey] || {};
        const newSlot = newRows[sKey] || {};
        return PARAMETERS.some((p) => {
          let oVal = oldSlot[p] ?? null;
          let nVal = newSlot[p] ?? null;
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

    // Check lock violations
    for (const key of targetShifts) {
      if (hasShiftData(key, payload.rows) && isShiftLocked(key)) {
        if (isShiftDiff(key, existingRows, payload.rows)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is locked.`,
          });
        }
      }
    }

    // Determine which shift has changes and is unlocked
    for (const key of targetShifts) {
      if (hasShiftData(key, payload.rows) && isShiftDiff(key, existingRows, payload.rows) && !isShiftLocked(key)) {
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

    // Merge rows separately without overwriting untouched slots
    const mergedRows = { ...(existingRows || {}) };
    const slotKeysToUpdate = SHIFT_TIME_SLOTS[activeShiftKey] || [];

    const isPriorSavedShift =
      (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

    slotKeysToUpdate.forEach((sKey) => {
      const oldSlot = mergedRows[sKey] || {};
      const newSlot = payload.rows[sKey] || {};

      if (isPriorSavedShift) {
        PARAMETERS.forEach((paramKey) => {
          const oVal = oldSlot[paramKey] ?? null;
          let nVal = newSlot[paramKey] ?? null;
          if (nVal === '') nVal = null;

          let isParamChanged = false;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            isParamChanged = Number(oVal) !== Number(nVal);
          } else {
            isParamChanged = oVal !== nVal;
          }

          if (isParamChanged) {
            editedFields[`${sKey}_${paramKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              timeSlot: sKey,
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

      mergedRows[sKey] = newSlot;
    });

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
      id: existingData.id || `tk205_${Date.now()}`,
      date: payload.date,
      plant: plantTarget,
      analysisType: 'TK 205 Analysis',
      tank: 'TK 205',
      unit: 'TK 205',
      shift: SHIFT_DISPLAY_NAMES[activeShiftKey] || activeShiftKey,
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
        analysisType: 'TK 205 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'TK 205 Analysis',
        unit: 'TK 205',
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
    tk205Records.unshift(updatedRecordData);

    // Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'TK_205_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `TK 205 Analysis saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // ── Execute Instant Email Dispatch Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    const emailPromises = newlySavedShifts.map((shiftKey) =>
      executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'TK 205 Analysis',
        unit: 'TK 205',
        shift: SHIFT_DISPLAY_NAMES[shiftKey],
        date: payload.date,
        data: mergedRows,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: payload,
      }).catch((err) => {
        console.warn(`[AutoPlantEmail] Instant workflow note for TK 205 ${shiftKey}:`, err.message);
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
      savedDoc?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} & email sent ✓`
        : `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} in MongoDB. Email delivery failed: ${lastEmailResult?.error || 'Rejected by server'}`,
      data: updatedRecordData,
      emailSent,
      emailPending: false,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
      newlySavedShifts,
    });
  } catch (error) {
    console.error('[TK205Analysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing TK 205 analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve TK 205 Analysis records
 * @route   GET /api/tk-205-analysis
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
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'TK 205 Analysis' };
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
    console.error('[ACL GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved TK 205 analysis record
 * @route   POST /api/tk-205-analysis/:id/retry-email
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
      record = tk205Records.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'TK 205 analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'ACL Plant',
      analysisType: record.analysisType || 'TK 205 Analysis',
      unit: 'TK 205',
      shift: req.body?.shift || record.shift || 'All Shifts',
      date: record.date,
      data: record.data?.rows || record.data,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json(result);
  } catch (error) {
    console.error('[TK205 Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
