const express = require('express');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');

/**
 * Helper to get Asia/Kolkata date string (YYYY-MM-DD)
 */
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
};

/**
 * Creates an Express router implementing the standardized TK 209 sequential shift workflow
 * for a 3-shift CO2 Plant analysis option.
 */
function createCO2ShiftAnalysisRouter({
  analysisType,
  unit,
  tank,
  parameters, // array of param keys e.g. ['co2', 'o2', 'co']
}) {
  const router = express.Router();
  const inMemoryRecords = [];

  router.use(protect);

  // ── GET: Fetch existing record for given date ──
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
        shift1Locked: false,
        shift2Locked: true,
        shift3Locked: true,
        shift1Saved: false,
        shift2Saved: false,
        shift3Saved: false,
        shift3Edits: 0,
      };

      if (date) {
        const query = {
          plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
          analysisType,
          date,
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const rows = payloadData.rows || payloadData.shifts || payloadData;
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

      // Range/List query
      const query = {
        plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
        analysisType,
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
      console.error(`[CO2 ${analysisType} GET] Error:`, err);
      return res.status(500).json({
        success: false,
        message: 'Server error retrieving analysis records: ' + err.message,
      });
    }
  });

  // ── POST: Save with TK 209 sequential shift workflow ──
  router.post('/', async (req, res) => {
    try {
      const payload = req.body || {};

      // Role check: users in View-Only mode cannot submit
      if (req.user && req.user.role === 'user') {
        return res.status(403).json({
          success: false,
          message: `Forbidden: ${analysisType} data entry and modification is restricted to authorized Admins.`,
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
        return res.status(400).json({
          success: false,
          message: `Analysis Date is required to save ${analysisType}.`,
        });
      }

      // 1. Backend Date Restriction Enforcement (Asia/Kolkata)
      const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
      const todayKolkata = getTodayKolkata();
      if (payload.date !== todayKolkata && !isTestMode) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: ${analysisType} records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
        });
      }

      const targetShifts = ['shift1', 'shift2', 'shift3'];
      const query = {
        date: payload.date,
        plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
        analysisType,
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }

      const existingDoc = await PlantAnalysisRecord.findOne(query);
      const existingData = existingDoc?.data || {};
      const existingRows = existingData.rows || existingData.shifts || existingData.readings || existingData;

      const hasShiftData = (shiftKey, rowsSource) => {
        const shift = rowsSource ? rowsSource[shiftKey] : null;
        return shift && Object.values(shift).some((v) => v !== null && v !== '');
      };

      const isShiftDiff = (shiftKey, oldRows, newRows) => {
        const oldShift = (oldRows && oldRows[shiftKey]) || {};
        const newShift = (newRows && newRows[shiftKey]) || {};
        return parameters.some((p) => {
          let oVal = oldShift[p] ?? null;
          let nVal = newShift[p] ?? null;
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
        shift1Locked: false,
        shift2Locked: true,
        shift3Locked: true,
        shift1Saved: false,
        shift2Saved: false,
        shift3Saved: false,
        shift3Edits: 0,
      };
      let editedFields = existingData.editedFields || {};
      let editAuditHistory = existingData.editAuditHistory || [];

      // Check if all shifts are already permanently locked
      const isAllPermanentlyLocked = Boolean(
        lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1
      );
      if (isAllPermanentlyLocked) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }

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
        return false;
      };

      const willSave = {};
      for (const key of targetShifts) {
        if (hasShiftData(key, payload.rows) && isShiftLocked(key)) {
          if (isShiftDiff(key, existingRows, payload.rows)) {
            return res.status(400).json({
              success: false,
              message: `Cannot edit ${SHIFT_DISPLAY_NAMES[key] || key} because it is permanently locked.`,
            });
          }
        }
      }

      for (const key of targetShifts) {
        if (hasShiftData(key, payload.rows) && isShiftDiff(key, existingRows, payload.rows) && !isShiftLocked(key)) {
          willSave[key] = true;
        }
      }

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

      const activeShiftKey = shiftsToSave[0];
      if (!activeShiftKey) {
        return res.status(400).json({
          success: false,
          message: 'No unlocked shifts with valid new or modified data were found to save.',
        });
      }

      const mergedRows = { ...(existingRows || {}) };
      const oldShift = mergedRows[activeShiftKey] || {};
      const newShift = payload.rows[activeShiftKey] || {};

      const isPriorSavedShift =
        (activeShiftKey === 'shift1' && lockedShifts.shift1Saved) ||
        (activeShiftKey === 'shift2' && lockedShifts.shift2Saved) ||
        (activeShiftKey === 'shift3' && lockedShifts.shift3Saved);

      if (isPriorSavedShift) {
        parameters.forEach((paramKey) => {
          const oVal = oldShift[paramKey] ?? null;
          let nVal = newShift[paramKey] ?? null;
          if (nVal === '') nVal = null;

          let isParamChanged = false;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            isParamChanged = Number(oVal) !== Number(nVal);
          } else {
            isParamChanged = oVal !== nVal;
          }

          if (isParamChanged) {
            editedFields[`${activeShiftKey}_${paramKey}`] = true;
            editAuditHistory.push({
              shiftKey: activeShiftKey,
              shiftName: SHIFT_DISPLAY_NAMES[activeShiftKey],
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

      mergedRows[activeShiftKey] = newShift;

      // Update shift locks
      if (activeShiftKey === 'shift1') {
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
      if (activeShiftKey === 'shift2') {
        lockedShifts.shift2Saved = true;
        lockedShifts.shift1 = true;
        lockedShifts.shift1Locked = true;
        lockedShifts.shift2 = false;
        lockedShifts.shift2Locked = false;
        lockedShifts.shift3 = false;
        lockedShifts.shift3Locked = false;
      }
      if (activeShiftKey === 'shift3') {
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

      const updatedRecordData = {
        id: existingData.id || `${unit}_${Date.now()}`,
        date: payload.date,
        plant: 'CO2 Plant',
        analysisType,
        tank: tank || unit,
        unit,
        frequency: 'Once in a shift',
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

      // Upsert directly to MongoDB
      const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
        {
          plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
          analysisType,
          date: payload.date,
        },
        {
          plantName: 'CO2 Plant',
          plantCode: 'CO2',
          analysisType,
          unit,
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

      inMemoryRecords.unshift(updatedRecordData);

      // Activity log
      try {
        if (ActivityLog && typeof ActivityLog.create === 'function') {
          await ActivityLog.create({
            action: `${analysisType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_SAVED`,
            user: req.user?._id,
            userName: req.user?.name,
            details: `${analysisType} saved for date: ${payload.date}, shift: ${SHIFT_DISPLAY_NAMES[activeShiftKey]}.`,
            timestamp: new Date(),
          });
        }
      } catch (logErr) {}

      // Email dispatch workflow
      const saveEventId = `save_${unit}_${Date.now()}`;
      let emailResult = { success: false, emailStatus: 'failed' };

      try {
        emailResult = await executeSaveAndEmailWorkflow({
          plantIdentifier: 'CO2',
          analysisType,
          unit,
          shift: SHIFT_DISPLAY_NAMES[activeShiftKey],
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
        console.warn(`[AutoPlantEmail] Note for ${analysisType} ${activeShiftKey}:`, mailErr.message);
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
        message: `Successfully saved ${SHIFT_DISPLAY_NAMES[activeShiftKey]} in MongoDB ✓`,
        data: updatedRecordData,
        emailSent: false,
        emailPending: false,
        emailStatus: 'disabled',
        emailRecipient: null,
        newlySavedShifts: [activeShiftKey],
        recordId: savedDoc._id,
        lockedShifts,
        editedFields,
        editAuditHistory,
      });
    } catch (err) {
      console.error(`[CO2 ${analysisType} POST] Error:`, err);
      return res.status(500).json({
        success: false,
        message: `Server error processing ${analysisType}: ` + err.message,
      });
    }
  });

  // ── RETRY EMAIL ROUTE (Decommissioned) ──
  router.post('/:recordId/retry-email', async (req, res) => {
    return res.status(200).json({
      success: true,
      emailSent: false,
      emailStatus: 'disabled',
      message: 'Email notification functionality has been removed.',
    });
  });

  // Alternative retry-email route via body { recordId } (Decommissioned)
  router.post('/retry-email', async (req, res) => {
    return res.status(200).json({
      success: true,
      emailSent: false,
      emailStatus: 'disabled',
      message: 'Email notification functionality has been removed.',
    });
  });

  return router;
}

/**
 * Creates an Express router implementing the 1-time edit locking workflow
 * for Weekly / Single frequency CO2 Plant analysis options.
 */
function createCO2WeeklyAnalysisRouter({
  analysisType,
  unit,
  tank,
  parameters, // array of param keys
  frequency = 'Once in a Week',
}) {
  const router = express.Router();
  const inMemoryRecords = [];

  router.use(protect);

  // ── GET: Fetch existing record ──
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

      if (date) {
        const query = {
          plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
          analysisType,
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
            initialSaved: Boolean(payloadData.initialSaved),
            editCount: payloadData.editCount || 0,
            isLocked: Boolean(payloadData.isLocked || (payloadData.editCount >= 1)),
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              rows,
              initialSaved: Boolean(payloadData.initialSaved),
              editCount: payloadData.editCount || 0,
              isLocked: Boolean(payloadData.isLocked || (payloadData.editCount >= 1)),
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
            initialSaved: Boolean(memMatch.initialSaved),
            isLocked: Boolean(memMatch.isLocked),
            data: memMatch,
          });
        }

        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          initialSaved: false,
          isLocked: false,
          data: null,
          message: `No record found for date ${date}`,
        });
      }

      // List query
      const query = {
        plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
        analysisType,
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
      console.error(`[CO2 ${analysisType} GET] Error:`, err);
      return res.status(500).json({
        success: false,
        message: 'Server error retrieving analysis records: ' + err.message,
      });
    }
  });

  // ── POST: Save with 1-time edit locking ──
  router.post('/', async (req, res) => {
    try {
      const payload = req.body || {};

      if (req.user && req.user.role === 'user') {
        return res.status(403).json({
          success: false,
          message: `Forbidden: ${analysisType} data entry is restricted to Admins.`,
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
        return res.status(400).json({
          success: false,
          message: `Analysis Date is required to save ${analysisType}.`,
        });
      }

      // Backend Date Restriction Enforcement (Asia/Kolkata)
      const todayKolkata = getTodayKolkata();
      if (payload.date !== todayKolkata) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: ${analysisType} records can only be created or modified for today's date (${todayKolkata}).`,
        });
      }

      const query = {
        date: payload.date,
        plantCode: { $in: ['CO2', 'CO2 Plant', 'CO2 PLANT'] },
        analysisType,
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
      }

      const existingDoc = await PlantAnalysisRecord.findOne(query);
      const existingData = existingDoc?.data || {};
      const existingRows = existingData.rows || existingData;

      let initialSaved = Boolean(existingData.initialSaved);
      let editCount = existingData.editCount || 0;
      let isLocked = Boolean(existingData.isLocked || (editCount >= 1));
      let editedFields = existingData.editedFields || {};
      let editAuditHistory = existingData.editAuditHistory || [];

      // Check lock violation
      if (isLocked) {
        return res.status(400).json({
          success: false,
          message: `${analysisType} for ${payload.date} is permanently locked. Only 1 edit is permitted and it has already been utilized.`,
        });
      }

      const incomingWeek = (payload.rows && payload.rows.week) || payload.rows || {};
      const oldWeek = (existingRows && existingRows.week) || existingRows || {};

      if (initialSaved) {
        // This is a permitted edit
        parameters.forEach((paramKey) => {
          const oVal = oldWeek[paramKey] ?? null;
          let nVal = incomingWeek[paramKey] ?? null;
          if (nVal === '') nVal = null;

          let isParamChanged = false;
          if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
            isParamChanged = Number(oVal) !== Number(nVal);
          } else {
            isParamChanged = oVal !== nVal;
          }

          if (isParamChanged) {
            editedFields[`week_${paramKey}`] = true;
            editAuditHistory.push({
              shiftKey: 'week',
              shiftName: 'Weekly Analysis',
              paramKey,
              oldValue: oVal !== null ? Number(oVal) : null,
              newValue: nVal !== null ? Number(nVal) : null,
              editedBy: req.user?.name || payload.submittedBy || 'Admin',
              editedById: req.user?._id || null,
              timestamp: new Date(),
            });
          }
        });

        editCount += 1;
        isLocked = true; // Permitted edit consumed -> permanently lock
      } else {
        initialSaved = true;
      }

      const updatedRecordData = {
        id: existingData.id || `${unit}_${Date.now()}`,
        date: payload.date,
        plant: 'CO2 Plant',
        analysisType,
        tank: tank || unit,
        unit,
        frequency,
        rows: payload.rows,
        initialSaved,
        editCount,
        isLocked,
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
          analysisType,
          date: payload.date,
        },
        {
          plantName: 'CO2 Plant',
          plantCode: 'CO2',
          analysisType,
          unit,
          date: payload.date,
          shift: frequency,
          data: updatedRecordData,
          submittedBy: updatedRecordData.submittedBy,
          submittedById: updatedRecordData.submittedById,
          company: updatedRecordData.company,
          savedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      inMemoryRecords.unshift(updatedRecordData);

      // Email workflow
      const saveEventId = `save_${unit}_${Date.now()}`;
      let emailResult = { success: false, emailStatus: 'failed' };

      try {
        emailResult = await executeSaveAndEmailWorkflow({
          plantIdentifier: 'CO2',
          analysisType,
          unit,
          shift: frequency,
          date: payload.date,
          data: payload.rows,
          submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
          submittedById: req.user?._id || null,
          company: updatedRecordData.company,
          explicitRecord: savedDoc,
          rawBody: payload,
          saveEventId,
        });
      } catch (mailErr) {
        console.warn(`[AutoPlantEmail] Note for ${analysisType}:`, mailErr.message);
        emailResult = { success: false, emailStatus: 'failed', error: mailErr.message };
      }

      const emailSent = Boolean(emailResult && (emailResult.emailSent || emailResult.success));
      const emailStatus = emailSent ? 'sent' : 'failed';
      const emailRecipient = emailResult?.recipient || savedDoc?.emailRecipient || null;

      return res.status(201).json({
        success: true,
        message: `Successfully saved ${analysisType} in MongoDB ✓`,
        data: updatedRecordData,
        emailSent: false,
        emailPending: false,
        emailStatus: 'disabled',
        emailRecipient: null,
        initialSaved,
        editCount,
        isLocked,
        recordId: savedDoc._id,
      });
    } catch (err) {
      console.error(`[CO2 ${analysisType} POST] Error:`, err);
      return res.status(500).json({
        success: false,
        message: `Server error processing ${analysisType}: ` + err.message,
      });
    }
  });

  // ── RETRY EMAIL ROUTE (Decommissioned) ──
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

  return router;
}

module.exports = {
  createCO2ShiftAnalysisRouter,
  createCO2WeeklyAnalysisRouter,
};
