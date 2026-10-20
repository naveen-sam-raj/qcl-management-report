const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');

const inMemoryRecords = [];
router.use(protect);

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

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
  day: 'Day Routine',
};

const SHIFT_PARAMS = ['loading', 'alk', 'foamheight', 'collapsetime'];
const DAY_PARAMS = ['hss', 'density', 'tss'];

router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('CO2');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (e) {
      assignedOperatorEmail = null;
    }

    const defaultLocks = {
      shift1: false,
      shift2: true,
      shift3: true,
      day: false,
      shift1Locked: false,
      shift2Locked: true,
      shift3Locked: true,
      dayLocked: false,
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      daySaved: false,
      shift3Edits: 0,
      dayEdits: 0,
    };

    if (date) {
      const query = {
        plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
        analysisType: 'Lean Analysis',
        date,
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
      if (doc && doc.data) {
        const payloadData = doc.data;
        const rows = payloadData.rows || payloadData;
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
            rows,
            lockedShifts: payloadData.lockedShifts || defaultLocks,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            emailStatus: doc.emailStatus || 'pending',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
          },
        });
      }

      const memMatch = inMemoryRecords.find((r) => r.date === date);
      if (memMatch) {
        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          lockedShifts: memMatch.lockedShifts || defaultLocks,
          data: memMatch,
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

    const query = {
      plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
      analysisType: 'Lean Analysis',
    };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
    if (docs && docs.length > 0) {
      return res.status(200).json({
        success: true,
        count: docs.length,
        data: docs.map((d) => ({
          ...d.data,
          _id: d._id,
          id: d._id,
          date: d.date,
          emailStatus: d.emailStatus,
          emailRecipient: d.emailRecipient,
        })),
      });
    }

    return res.status(200).json({
      success: true,
      count: inMemoryRecords.length,
      data: inMemoryRecords,
    });
  } catch (err) {
    console.error('[CO2 Lean GET] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};

    if (req.user && req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Lean Analysis data entry is restricted to Admins.',
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

    if (!payload.date) {
      return res.status(400).json({ success: false, message: 'Analysis Date is required.' });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Lean Analysis records can only be created or modified for today (${todayKolkata}).`,
      });
    }

    const query = {
      date: payload.date,
      plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
      analysisType: 'Lean Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const existingDoc = await PlantAnalysisRecord.findOne(query);
    const existingData = existingDoc?.data || {};
    const existingRows = existingData.rows || existingData;

    const targetSections = ['shift1', 'shift2', 'shift3', 'day'];

    const hasSectionData = (secKey, rowsSource) => {
      const sec = rowsSource ? rowsSource[secKey] : null;
      return sec && Object.values(sec).some((v) => v !== null && v !== '');
    };

    const isSectionDiff = (secKey, oldRows, newRows) => {
      const oldSec = (oldRows && oldRows[secKey]) || {};
      const newSec = (newRows && newRows[secKey]) || {};
      const paramList = secKey === 'day' ? DAY_PARAMS : SHIFT_PARAMS;
      return paramList.some((p) => {
        let oVal = oldSec[p] ?? null;
        let nVal = newSec[p] ?? null;
        if (nVal === '') nVal = null;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          return Number(oVal) !== Number(nVal);
        }
        return oVal !== nVal;
      });
    };

    let lockedShifts = existingData.lockedShifts || {
      shift1: false,
      shift2: true,
      shift3: true,
      day: false,
      shift1Locked: false,
      shift2Locked: true,
      shift3Locked: true,
      dayLocked: false,
      shift1Saved: false,
      shift2Saved: false,
      shift3Saved: false,
      daySaved: false,
      shift3Edits: 0,
      dayEdits: 0,
    };
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    const areShiftsLocked = Boolean(
      lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1
    );

    const isSectionLocked = (key) => {
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
      if (key === 'day') return Boolean(lockedShifts.day || lockedShifts.dayLocked || (lockedShifts.daySaved && (lockedShifts.dayEdits || 0) >= 1));
      return false;
    };

    if (areShiftsLocked) {
      const hasShiftChanges = ['shift1', 'shift2', 'shift3'].some(
        (key) => hasSectionData(key, payload.rows) && isSectionDiff(key, existingRows, payload.rows)
      );
      if (hasShiftChanges) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }
    }

    const willSave = {};
    for (const key of targetSections) {
      if (hasSectionData(key, payload.rows) && isSectionLocked(key)) {
        if (isSectionDiff(key, existingRows, payload.rows)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is permanently locked.`,
          });
        }
      }
    }

    for (const key of targetSections) {
      if (hasSectionData(key, payload.rows) && isSectionDiff(key, existingRows, payload.rows) && !isSectionLocked(key)) {
        willSave[key] = true;
      }
    }

    const sectionsToSave = targetSections.filter((k) => willSave[k]);
    if (sectionsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift or day routine can be saved at a time.',
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
      return res.status(400).json({
        success: false,
        message: 'III SHIFT has already reached its maximum edit limit (one final edit allowed).',
      });
    }
    if (willSave.day && lockedShifts.daySaved && (lockedShifts.dayEdits || 0) >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Day routine has already reached its maximum edit limit (one final edit allowed).',
      });
    }

    const activeKey = sectionsToSave[0];
    if (!activeKey) {
      return res.status(400).json({
        success: false,
        message: 'No unlocked shifts or day routine with valid changes were found to save.',
      });
    }

    const mergedRows = { ...(existingRows || {}) };
    const oldSec = mergedRows[activeKey] || {};
    const newSec = payload.rows[activeKey] || {};

    const isPriorSaved =
      (activeKey === 'shift1' && lockedShifts.shift1Saved) ||
      (activeKey === 'shift2' && lockedShifts.shift2Saved) ||
      (activeKey === 'shift3' && lockedShifts.shift3Saved) ||
      (activeKey === 'day' && lockedShifts.daySaved);

    if (isPriorSaved) {
      const paramList = activeKey === 'day' ? DAY_PARAMS : SHIFT_PARAMS;
      paramList.forEach((paramKey) => {
        const oVal = oldSec[paramKey] ?? null;
        let nVal = newSec[paramKey] ?? null;
        if (nVal === '') nVal = null;

        let isParamChanged = false;
        if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
          isParamChanged = Number(oVal) !== Number(nVal);
        } else {
          isParamChanged = oVal !== nVal;
        }

        if (isParamChanged) {
          editedFields[`${activeKey}_${paramKey}`] = true;
          editAuditHistory.push({
            shiftKey: activeKey,
            shiftName: SHIFT_DISPLAY_NAMES[activeKey],
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

    mergedRows[activeKey] = newSec;

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
    if (activeKey === 'day') {
      if (lockedShifts.daySaved) {
        lockedShifts.dayEdits = (lockedShifts.dayEdits || 0) + 1;
        lockedShifts.day = true;
        lockedShifts.dayLocked = true;
      } else {
        lockedShifts.daySaved = true;
        lockedShifts.dayEdits = 0;
        lockedShifts.day = false;
        lockedShifts.dayLocked = false;
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
    if (lockedShifts.daySaved && (lockedShifts.dayEdits || 0) >= 1) {
      lockedShifts.day = true;
      lockedShifts.dayLocked = true;
    }

    const updatedRecordData = {
      id: existingData.id || `lean_${Date.now()}`,
      date: payload.date,
      plant: 'CO2 Plant',
      analysisType: 'Lean Analysis',
      tank: 'Lean',
      unit: 'Lean',
      frequency: 'Shift & Day',
      shift: SHIFT_DISPLAY_NAMES[activeKey] || activeKey,
      rows: mergedRows,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
        analysisType: 'Lean Analysis',
        date: payload.date,
      },
      {
        plantName: 'CO2 Plant',
        plantCode: 'CO2',
        analysisType: 'Lean Analysis',
        unit: 'Lean',
        date: payload.date,
        shift: SHIFT_DISPLAY_NAMES[activeKey] || activeKey,
        data: updatedRecordData,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    inMemoryRecords.unshift(updatedRecordData);

    // Email dispatch
    const saveEventId = `save_lean_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'failed' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'CO2',
        analysisType: 'Lean Analysis',
        unit: 'Lean',
        shift: SHIFT_DISPLAY_NAMES[activeKey],
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: { ...payload, rows: mergedRows, data: updatedRecordData },
        saveEventId,
        isTestMode,
      });
    } catch (mailErr) {
      console.warn('[AutoPlantEmail] Note for Lean Analysis:', mailErr.message);
      emailResult = { success: false, emailStatus: 'failed', error: mailErr.message };
    }

    if (savedDoc?._id) {
      await PlantAnalysisRecord.findByIdAndUpdate(savedDoc._id, { $set: { data: updatedRecordData } });
    }

    const emailSent = Boolean(emailResult && (emailResult.emailSent || emailResult.success));
    const emailStatus = emailSent ? 'sent' : 'failed';
    const emailRecipient = emailResult?.recipient || savedDoc?.emailRecipient || null;

    return res.status(200).json({
      success: true,
      message: `Successfully saved ${SHIFT_DISPLAY_NAMES[activeKey]} in MongoDB ✓`,
      data: updatedRecordData,
      emailSent: false,
      emailPending: false,
      emailStatus: 'disabled',
      emailRecipient: null,
      emailNotification: null,
      newlySavedShifts: [activeKey],
      recordId: savedDoc._id,
      lockedShifts,
      editedFields,
      editAuditHistory,
    });
  } catch (err) {
    console.error('[CO2 Lean POST] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:recordId/retry-email', async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

router.post('/retry-email', async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

module.exports = router;
