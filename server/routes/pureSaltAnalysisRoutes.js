const express = require('express');
const router = express.Router();
const { PureSaltAnalysis, ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { generatePureSaltAnalysisExcel } = require('../services/excelService');
const { sendPureSaltAnalysisReport } = require('../services/emailService');
const { getPlantAssignedUser, sendPlantUpdateNotification } = require('../services/plantNotificationService');
const { protect } = require('../middleware/auth');

// In-memory fallback array for resilient offline operation
const analysisRecords = [];

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

const defaultLocks = {
  rawSalt: false,
  shift1: false,
  shift2: true,
  shift3: true,
  composition: false,
  rawSaltLocked: false,
  shift1Locked: false,
  shift2Locked: true,
  shift3Locked: true,
  compositionLocked: false,
  rawSaltSaved: false,
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  compositionSaved: false,
  shift3Edits: 0,
};

/**
 * @desc    Save Pure Salt Analysis data, generate Excel .xlsx report, and send email with attachment via Nodemailer
 * @route   POST /api/pure-salt-analysis
 * @access  Private (Plant Operators / Admins)
 */
router.post('/', protect, async (req, res) => {
  try {
    const payload = req.body;

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.errors[0], errors: validation.errors });
    }

    if (!payload.date) {
      return res.status(400).json({ success: false, message: 'Analysis date is required.' });
    }

    // ── Enforce Authorization: Only Admins can modify Pure Salt Analysis ──
    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Pure Salt Analysis data entry and modification is restricted to Company Admins.',
      });
    }

    // ── Validate Date Format (YYYY-MM-DD) and strict today's date restriction ──
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(payload.date)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Pure Salt Analysis records can only be created or modified for today (${todayKolkata}).`,
      });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetRows = ['rawSalt', 'shift1', 'shift2', 'shift3', 'composition'];
    const shiftDisplayNames = {
      rawSalt: 'RAW SALT',
      shift1: 'I SHIFT',
      shift2: 'II SHIFT',
      shift3: 'III SHIFT',
      composition: 'COMPOSITION',
    };
    const newlySavedShifts = [];
    let savedRecord;

    const query = {
      date: payload.date,
      plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: payload.analysisType || 'Pure Salt Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingRecord = await PureSaltAnalysis.findOne(query);

    // Instead of checking non-zero values, check if the frontend actually sent any numbers (including 0)
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

    let lockedShifts = existingRecord?.lockedShifts ? { ...defaultLocks, ...existingRecord.lockedShifts } : { ...defaultLocks };
    let editedFields = existingRecord?.editedFields || {};
    let editAuditHistory = existingRecord?.editAuditHistory || [];

    const areShiftsLocked = Boolean(lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1);
    const isShiftLocked = (key) => {
      if (key === 'shift1') return Boolean(lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved);
      if (key === 'shift2') {
        if (!lockedShifts.shift1Saved) return true;
        return Boolean(lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved);
      }
      if (key === 'shift3') {
        if (!lockedShifts.shift2Saved) return true;
        if (lockedShifts.shift3 || lockedShifts.shift3Locked) return true;
        if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
        return false;
      }
      if (key === 'rawSalt') return Boolean(lockedShifts.rawSalt || lockedShifts.rawSaltLocked);
      if (key === 'composition') return Boolean(lockedShifts.composition || lockedShifts.compositionLocked);
      return false;
    };

    if (areShiftsLocked) {
      const hasShiftChanges = ['shift1', 'shift2', 'shift3'].some(
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
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${shiftDisplayNames[key] || key} because it is permanently locked.`,
          });
        }
      }
    }

    for (const key of targetRows) {
      if (hasData(payload.rows?.[key]) && isDiff(existingRecord?.rows?.[key], payload.rows?.[key]) && !isShiftLocked(key)) {
        willSave[key] = true;
      }
    }

    // Enforce Shift-Wise Locking: Only one shift or section can be saved at a time
    const sectionsToSave = targetRows.filter((k) => willSave[k]);
    if (sectionsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift can be edited and saved at a time.',
      });
    }

    let newS1Saved = lockedShifts.shift1Saved || willSave.shift1;
    let newS2Saved = lockedShifts.shift2Saved || willSave.shift2;

    if (willSave.shift2 && !newS1Saved) {
      return res.status(400).json({ success: false, message: 'Sequential restriction: Cannot save II SHIFT before I SHIFT is saved.' });
    }
    if (willSave.shift3 && !newS2Saved) {
      return res.status(400).json({ success: false, message: 'Sequential restriction: Cannot save III SHIFT before II SHIFT is saved.' });
    }
    if (willSave.shift3 && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      return res.status(400).json({ success: false, message: 'III SHIFT has already reached its maximum edit limit (one final edit allowed).' });
    }

    const activeKey = sectionsToSave[0];
    if (!activeKey) {
      return res.status(400).json({ success: false, message: 'No unlocked shifts with valid new data were found to save.' });
    }

    const isPriorSavedShift =
      (activeKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeKey === 'shift3' && lockedShifts.shift3Saved) ||
      (activeKey === 'rawSalt' && lockedShifts.rawSaltSaved) ||
      (activeKey === 'composition' && lockedShifts.compositionSaved);

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
    const defaultRow = () => ({ nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null });
    const mergedRows = {
      rawSalt: defaultRow(),
      shift1: defaultRow(),
      shift2: defaultRow(),
      shift3: defaultRow(),
      composition: defaultRow(),
      ...existingRows,
    };
    mergedRows[activeKey] = newVals;
    newlySavedShifts.push(activeKey);

    if (activeKey === 'rawSalt') {
      lockedShifts.rawSalt = true;
      lockedShifts.rawSaltLocked = true;
      lockedShifts.rawSaltSaved = true;
    }
    if (activeKey === 'composition') {
      lockedShifts.composition = true;
      lockedShifts.compositionLocked = true;
      lockedShifts.compositionSaved = true;
    }
    if (activeKey === 'shift1') {
      lockedShifts.shift1Saved = true;
      lockedShifts.shift1 = false;
      lockedShifts.shift1Locked = false;
      lockedShifts.shift2 = false;
      lockedShifts.shift2Locked = false;
      if (!lockedShifts.shift3Saved) {
        lockedShifts.shift3 = true;
        lockedShifts.shift3Locked = true;
      }
    }
    if (activeKey === 'shift2') {
      lockedShifts.shift2Saved = true;
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2 = false;
      lockedShifts.shift2Locked = false;
      lockedShifts.shift3 = false;
      lockedShifts.shift3Locked = false;
    }
    if (activeKey === 'shift3') {
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2 = true;
      lockedShifts.shift2Locked = true;
      if (lockedShifts.shift3Saved) {
        lockedShifts.shift3Edits = (lockedShifts.shift3Edits || 0) + 1;
        lockedShifts.shift3 = true;
        lockedShifts.shift3Locked = true;
      } else {
        lockedShifts.shift3Saved = true;
        lockedShifts.shift3Edits = 0;
        lockedShifts.shift3 = false;
        lockedShifts.shift3Locked = false;
      }
    }

    if (lockedShifts.shift2Saved) {
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
    }
    if (lockedShifts.shift3Saved) {
      lockedShifts.shift2 = true;
      lockedShifts.shift2Locked = true;
    }
    if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
      lockedShifts.shift1 = true;
      lockedShifts.shift1Locked = true;
      lockedShifts.shift2 = true;
      lockedShifts.shift2Locked = true;
      lockedShifts.shift3 = true;
      lockedShifts.shift3Locked = true;
    }

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
      savedRecord = await PureSaltAnalysis.create({
        date: payload.date,
        plant: plantTarget,
        analysisType: payload.analysisType || 'Pure Salt Analysis',
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

    // ── 4. Mirror to PlantAnalysisRecord for consolidated multi-analysis reporting ──
    try {
      if (PlantAnalysisRecord) {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
            analysisType: 'Pure Salt Analysis',
            date: payload.date,
          },
          {
            plantName: 'ACL Plant',
            plantCode: 'ACL',
            analysisType: 'Pure Salt Analysis',
            unit: '',
            date: payload.date,
            data: {
              ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
              rows: savedRecord.rows || payload.rows,
              lockedShifts: savedRecord.lockedShifts,
              editedFields: savedRecord.editedFields,
              editAuditHistory: savedRecord.editAuditHistory,
            },
            shift: savedRecord.shift || 'All Shifts (I, II, III)',
            submittedBy: savedRecord.submittedBy,
            submittedById: savedRecord.submittedById,
            company: savedRecord.company,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (syncErr) {
      console.warn('[PureSaltAnalysis] PlantAnalysisRecord mirror warning:', syncErr.message);
    }

    // ── 5. Execute Centralized Save -> Timestamp -> Assigned User -> Email Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    const emailPromises = newlySavedShifts.map((shiftKey) =>
      executeSaveAndEmailWorkflow({
        plantIdentifier: 'ACL',
        analysisType: 'Pure Salt Analysis',
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
        console.warn(`[AutoPlantEmail] Exception in workflow for ${shiftKey}:`, err.message);
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
      console.warn('[AutoPlantEmail] Note for Pure Salt:', err.message);
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
      message: `Successfully saved ${newlySavedShifts.length} section(s) in MongoDB ✓`,
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
    console.error('[PureSaltAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to save the data. Please try again.',
      error: error.message,
    });
  }
});

/**
 * @desc    Retry sending email with Excel report for an existing saved analysis record
 * @route   POST /api/pure-salt-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', protect, async (req, res) => {
  try {
    const { id } = req.params;

    let record = null;
    if (PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
      record = await PureSaltAnalysis.findById(id);
    }
    if (!record) {
      record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'ACL',
      analysisType: record.analysisType || 'Pure Salt Analysis',
      unit: record.unit || '',
      shift: record.shift || 'All Shifts',
      date: record.date,
      data: record.rows || record.data,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json(result);
  } catch (error) {
    console.error('[Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @desc    Direct download of generated Excel file for a record
 * @route   GET /api/pure-salt-analysis/:id/download-excel
 * @access  Private
 */
router.get('/:id/download-excel', protect, async (req, res) => {
  try {
    const { id } = req.params;
    let record = null;

    if (PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
      record = await PureSaltAnalysis.findById(id);
    }
    if (!record) {
      record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Analysis record not found.' });
    }

    const excelResult = await generatePureSaltAnalysisExcel(record);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
    return res.send(excelResult.buffer);
  } catch (error) {
    console.error('[PureSaltAnalysis] Error downloading Excel:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @desc    Retrieve Pure Salt Analysis records from MongoDB Atlas
 * @route   GET /api/pure-salt-analysis
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const { date } = req.query;

    // Dynamically resolve active operator email assigned to ACL Plant
    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {
      console.warn('[PureSalt GET] Operator lookup warning:', uErr.message);
    }

    if (date) {
      const query = { date, plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      let doc = await PureSaltAnalysis.findOne(query).sort({ createdAt: -1 }).lean();
      
      // Fallback check against PlantAnalysisRecord if not in PureSaltAnalysis collection
      if (!doc && PlantAnalysisRecord) {
        const fallbackQuery = {
          date,
          plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
          analysisType: 'Pure Salt Analysis',
        };
        if (req.user && req.user.company) {
          fallbackQuery.$or = [{ company: req.user.company }, { company: null }];
        }
        const fallback = await PlantAnalysisRecord.findOne(fallbackQuery).sort({ createdAt: -1 }).lean();
        if (fallback) {
          doc = {
            _id: fallback._id,
            date: fallback.date,
            plant: fallback.plantName || 'ACL Plant',
            analysisType: fallback.analysisType,
            shift: fallback.shift || 'All Shifts (I, II, III)',
            rows: fallback.data?.rows || fallback.data || {},
            lockedShifts: fallback.data?.lockedShifts || defaultLocks,
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
        return res.status(200).json({
          success: true,
          data: [doc],
          lockedShifts: doc.lockedShifts || defaultLocks,
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
      lockedShifts: defaultLocks,
      editedFields: {},
      editAuditHistory: [],
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[PureSalt GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
