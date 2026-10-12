const express = require('express');
const router = express.Router();
const { PureSaltSieveAnalysis, ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { generatePureSaltSieveAnalysisExcel } = require('../services/excelService');
const { getPlantAssignedUser } = require('../services/plantNotificationService');
const { protect } = require('../middleware/auth');

// In-memory fallback array for resilient offline operation
const analysisRecords = [];

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

    // ── Enforce Today's Date Restriction (Asia/Kolkata) for Pure Salt Sieve Analysis ──
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

    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
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

    if (existingRecord) {
      const willSave = {};

      // Helper to check if a shift is locked according to workflow rules
      const isShiftLocked = (key, rec) => {
        if (rec.lockedShifts[key]) return true;
        if (key === 'shift1' && rec.lockedShifts.shift2Saved) return true;
        if (key === 'shift2' && rec.lockedShifts.shift3Saved) return true;
        if (key === 'shift3' && rec.lockedShifts.shift3Saved && (rec.lockedShifts.shift3Edits || 0) >= 1) return true;
        return false;
      };

      // Check if user is trying to edit locked shifts
      for (const key of targetRows) {
        if (hasData(payload.rows[key]) && isShiftLocked(key, existingRecord)) {
          if (isDiff(existingRecord.rows[key], payload.rows[key])) {
            return res.status(400).json({ success: false, message: `Cannot edit ${shiftDisplayNames[key] || key} because it is locked.` });
          }
        }
      }

      for (const key of targetRows) {
        if (hasData(payload.rows[key]) && isDiff(existingRecord.rows[key], payload.rows[key]) && !isShiftLocked(key, existingRecord)) {
          willSave[key] = true;
        }
      }

      // Enforce Shift-Wise Locking: Only one shift can be edited and saved at a time
      const shiftsToSave = ['shift1', 'shift2', 'shift3'].filter((k) => willSave[k]);
      if (shiftsToSave.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Shift-wise input locking enforced: Only one shift can be edited and saved at a time.',
        });
      }

      let newS1Saved = existingRecord.lockedShifts.shift1Saved || willSave.shift1;
      let newS2Saved = existingRecord.lockedShifts.shift2Saved || willSave.shift2;
      let newS3Saved = existingRecord.lockedShifts.shift3Saved || willSave.shift3;

      if (willSave.shift2 && !newS1Saved) {
        return res.status(400).json({ success: false, message: 'Cannot save II SHIFT before I SHIFT is saved.' });
      }
      if (willSave.shift3 && !newS2Saved) {
        return res.status(400).json({ success: false, message: 'Cannot save III SHIFT before II SHIFT is saved.' });
      }
      if (willSave.shift3 && existingRecord.lockedShifts.shift3Saved && (existingRecord.lockedShifts.shift3Edits || 0) >= 1) {
        return res.status(400).json({ success: false, message: 'III SHIFT has already reached its maximum edit limit (one final edit allowed).' });
      }

      if (!existingRecord.editedFields) {
        existingRecord.editedFields = new Map();
      }
      if (!existingRecord.editAuditHistory) {
        existingRecord.editAuditHistory = [];
      }

      for (const key of targetRows) {
        if (willSave[key]) {
          // If this shift was already saved previously, track specifically which parameters were changed
          const isPriorSavedShift =
            (key === 'shift1' && existingRecord.lockedShifts.shift1Saved) ||
            (key === 'shift2' && existingRecord.lockedShifts.shift2Saved) ||
            (key === 'shift3' && existingRecord.lockedShifts.shift3Saved);

          if (isPriorSavedShift) {
            const oldVals = existingRecord.rows[key] || {};
            const newVals = payload.rows[key] || {};
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
                if (existingRecord.editedFields.set) {
                  existingRecord.editedFields.set(`${key}_${paramKey}`, true);
                } else {
                  existingRecord.editedFields[`${key}_${paramKey}`] = true;
                }

                // Append persistent audit history
                existingRecord.editAuditHistory.push({
                  shiftKey: key,
                  paramKey: paramKey,
                  oldValue: oVal !== null ? Number(oVal) : null,
                  newValue: nVal !== null ? Number(nVal) : null,
                  editedBy: req.user?.name || payload.submittedBy || 'Admin',
                  editedById: req.user?._id || null,
                  timestamp: new Date(),
                });
              }
            });
          }

          existingRecord.rows[key] = payload.rows[key];
          newlySavedShifts.push(key);
        }
      }

      if (newlySavedShifts.length === 0) {
        return res.status(400).json({ success: false, message: 'No unlocked shifts with valid new data were found to save.' });
      }

      if (willSave.shift1) existingRecord.lockedShifts.shift1Saved = true;
      if (willSave.shift2) existingRecord.lockedShifts.shift2Saved = true;
      if (willSave.shift3) {
        if (!existingRecord.lockedShifts.shift3Saved) {
          existingRecord.lockedShifts.shift3Saved = true;
        } else {
          existingRecord.lockedShifts.shift3Edits = (existingRecord.lockedShifts.shift3Edits || 0) + 1;
        }
      }

      if (existingRecord.lockedShifts.shift2Saved) existingRecord.lockedShifts.shift1 = true;
      if (existingRecord.lockedShifts.shift3Saved) existingRecord.lockedShifts.shift2 = true;
      if (existingRecord.lockedShifts.shift3Saved && (existingRecord.lockedShifts.shift3Edits || 0) >= 1) {
        existingRecord.lockedShifts.shift3 = true;
      }

      existingRecord.markModified('rows');
      existingRecord.markModified('lockedShifts');
      existingRecord.markModified('editedFields');
      existingRecord.markModified('editAuditHistory');
      existingRecord.submittedBy = req.user?.name || payload.submittedBy || 'Plant Operator';
      existingRecord.submittedById = req.user?._id || null;
      existingRecord.savedAt = new Date();
      savedRecord = await existingRecord.save();
    } else {
      const willSave = {};
      const lockedShifts = {
        shift1: false,
        shift2: false,
        shift3: false,
        shift1Saved: false,
        shift2Saved: false,
        shift3Saved: false,
        shift3Edits: 0,
      };

      for (const key of targetRows) {
        if (hasData(payload.rows[key])) {
          willSave[key] = true;
        }
      }

      // Enforce Shift-Wise Locking: Only one shift can be saved at a time
      const shiftsToSave = ['shift1', 'shift2', 'shift3'].filter((k) => willSave[k]);
      if (shiftsToSave.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time.',
        });
      }

      if (willSave.shift2 && !willSave.shift1) {
        return res.status(400).json({ success: false, message: 'Cannot save II SHIFT before I SHIFT is saved.' });
      }
      if (willSave.shift3 && !willSave.shift2) {
        return res.status(400).json({ success: false, message: 'Cannot save III SHIFT before II SHIFT is saved.' });
      }

      for (const key of targetRows) {
        if (willSave[key]) {
          newlySavedShifts.push(key);
          if (key === 'shift1') lockedShifts.shift1Saved = true;
          if (key === 'shift2') lockedShifts.shift2Saved = true;
          if (key === 'shift3') lockedShifts.shift3Saved = true;
        }
      }

      if (lockedShifts.shift2Saved) lockedShifts.shift1 = true;
      if (lockedShifts.shift3Saved) lockedShifts.shift2 = true;

      if (newlySavedShifts.length === 0) {
        return res.status(400).json({ success: false, message: 'No data provided to save.' });
      }

      savedRecord = await PureSaltSieveAnalysis.create({
        date: payload.date,
        plant: plantTarget,
        analysisType: payload.analysisType || 'Pure Salt Sieve Analysis',
        shift: payload.shift || 'All Shifts (I, II, III)',
        rows: payload.rows,
        company: req.user?.company?._id || req.user?.company || null,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        lockedShifts,
        editedFields: {},
        editAuditHistory: [],
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
            data: savedRecord.toObject ? savedRecord.toObject() : savedRecord,
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

    // ── Execute Centralized Save -> Timestamp -> Assigned User -> Excel -> Nodemailer Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    const runEmailNotification = async () => {
      let emailResult = null;
      for (const shiftKey of newlySavedShifts) {
        try {
          emailResult = await executeSaveAndEmailWorkflow({
            plantIdentifier: plantTarget,
            analysisType: 'Pure Salt Sieve Analysis',
            unit: '',
            shift: shiftDisplayNames[shiftKey],
            date: payload.date,
            data: payload.rows,
            submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
            submittedById: req.user?._id || null,
            company: savedRecord?.company || req.user?.company?._id || req.user?.company || null,
            explicitRecord: savedRecord,
            rawBody: payload,
          });
        } catch (err) {
          console.warn(`[AutoPlantEmail] Exception in workflow for sieve ${shiftKey}:`, err.message);
          emailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
        }
      }
      return emailResult;
    };

    let lastEmailResult = null;
    let emailTimedOut = false;

    // Race email dispatch with a fast timeout (1200ms) so DB save response is never delayed or stuck
    const emailPromise = runEmailNotification();
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 1200));

    const raceResult = await Promise.race([emailPromise, timeoutPromise]);
    if (raceResult === 'TIMEOUT') {
      emailTimedOut = true;
      // Allow background dispatch to complete safely and update DB record
      emailPromise.catch((err) => {
        console.warn('[AutoPlantEmail] Background email execution note:', err.message);
      });
    } else {
      lastEmailResult = raceResult;
    }

    const emailSent = !!(lastEmailResult && lastEmailResult.emailSent);
    const finalEmailStatus = emailTimedOut
      ? 'pending'
      : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedRecord?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved ${newlySavedShifts.length} shift(s) & email sent ✓`
        : emailTimedOut
        ? `Successfully saved ${newlySavedShifts.length} shift(s) — Email delivery in progress ⏳`
        : `Successfully saved ${newlySavedShifts.length} shift(s), email status: ${finalEmailStatus}`,
      data: savedRecord,
      emailSent,
      emailPending: emailTimedOut,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
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

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plant || 'ACL Plant',
      analysisType: record.analysisType || 'Pure Salt Sieve Analysis',
      unit: '',
      shift: req.body?.shift || record.shift || 'All Shifts (I, II, III)',
      date: record.date,
      data: record.rows,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json(result);
  } catch (error) {
    console.error('[PureSaltSieve Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
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

    if (date) {
      const query = { date, plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Sieve Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PureSaltSieveAnalysis.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc) {
        return res.status(200).json({
          success: true,
          data: [doc],
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
    console.error('[PureSaltSieve GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
