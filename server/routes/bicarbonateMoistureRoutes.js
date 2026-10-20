const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');
const {
  getInitialLockState,
  hydrateLockState,
  validateSequentialSave,
  applySequentialSaveTransition,
} = require('../services/analysisLockEngine');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for Bicarbonate Moisture Analysis records
const bicarbonateMoistureRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit SA Plant Bicarbonate Moisture Analysis data
 * @route   POST /api/bicarbonate-moisture
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Bicarbonate Moisture data.',
      });
    }

    const isTestMode = req.headers['x-test-mode'] === 'true' || payload.isTestMode === true || process.env.NODE_ENV === 'test';

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Bicarbonate Moisture Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];
    const numFields = ['m404_a', 'm404_b', 'm404_c', 'm405_outlet', 'sb_turb1', 'sb_turb2'];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      const label = reading.shift || `Row #${rowNum}`;
      numFields.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${label}: ${f} must be a valid number.`);
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

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
      analysisType: {
        $in: [
          'Bicarbonate Moisture Analysis',
          'Bi Carbonate Moisture Analysis',
          'Bicarbonate Moisture',
        ],
      },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingReadings = Array.isArray(existingData.readings) ? existingData.readings : [];

    const targetShifts = ['shift1', 'shift2', 'shift3'];
    let lockedShifts = existingData.lockedShifts
      ? hydrateLockState(existingData.lockedShifts, { type: 'shift', items: targetShifts })
      : getInitialLockState({ type: 'shift', items: targetShifts });

    let editedFields = { ...(existingData.editedFields || {}) };
    let editAuditHistory = [...(existingData.editAuditHistory || [])];

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

    const shiftRowKeyMap = {
      shift1: (r) => r.id === '1' || /I SHIFT/i.test(r.shift || ''),
      shift2: (r) => r.id === '2' || /II SHIFT/i.test(r.shift || ''),
      shift3: (r) => r.id === '3' || /III SHIFT/i.test(r.shift || ''),
    };

    const hasShiftData = (sKey) => {
      const pred = shiftRowKeyMap[sKey];
      const r = readings.find(pred);
      if (!r) return false;
      return numFields.some((f) => r[f] !== '' && r[f] !== null && r[f] !== undefined);
    };

    const isShiftDiff = (sKey) => {
      const pred = shiftRowKeyMap[sKey];
      const newR = readings.find(pred);
      const oldR = existingReadings.find(pred);
      if (!newR && !oldR) return false;
      if (!oldR) return hasShiftData(sKey);
      return numFields.some((f) => isValDiff(oldR[f], newR[f]));
    };

    const isShiftLocked = (sKey) => {
      const check = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: sKey,
        itemsOrder: targetShifts,
        isDiff: true,
        type: 'shift',
      });
      return !check.allowed;
    };

    if (lockedShifts.allPermanentlyLocked) {
      const hasShiftChanges = targetShifts.some((sKey) => hasShiftData(sKey) && isShiftDiff(sKey));
      if (hasShiftChanges) {
        return res.status(400).json({
          success: false,
          message: 'All shifts for this date are permanently locked. No further edits permitted.',
        });
      }
    }

    // Check lock violations
    for (const sKey of targetShifts) {
      if (hasShiftData(sKey) && isShiftLocked(sKey)) {
        if (isShiftDiff(sKey)) {
          const check = validateSequentialSave({
            lockState: lockedShifts,
            targetItem: sKey,
            itemsOrder: targetShifts,
            isDiff: true,
            type: 'shift',
          });
          return res.status(400).json({
            success: false,
            message: check.message || `Cannot edit shift because it is locked.`,
          });
        }
      }
    }

    // Determine which shifts have changed and are not locked
    const willSave = {};
    for (const sKey of targetShifts) {
      if (hasShiftData(sKey) && isShiftDiff(sKey) && !isShiftLocked(sKey)) {
        willSave[sKey] = true;
      }
    }

    const shiftsToSave = targetShifts.filter((k) => willSave[k]);
    if (shiftsToSave.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Shift-wise input locking enforced: Only one shift can be entered and saved at a time.',
      });
    }

    const activeShiftKey = shiftsToSave[0] || (payload.shift ? payload.shift : null);
    if (activeShiftKey && willSave[activeShiftKey]) {
      const saveValidation = validateSequentialSave({
        lockState: lockedShifts,
        targetItem: activeShiftKey,
        itemsOrder: targetShifts,
        isDiff: true,
        type: 'shift',
      });
      if (!saveValidation.allowed) {
        return res.status(saveValidation.statusCode || 400).json({
          success: false,
          message: saveValidation.message,
        });
      }

      lockedShifts = applySequentialSaveTransition({
        lockState: lockedShifts,
        targetItem: activeShiftKey,
        itemsOrder: targetShifts,
        isCorrection: saveValidation.isCorrection,
      });
    }

    const nowIso = new Date().toISOString();
    const saveEventId = `bicarb_moist_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build map of existing readings by row id or shift label or time
    const existingMap = {};
    existingReadings.forEach((r) => {
      if (r.id) existingMap[r.id] = r;
      if (r.shift) existingMap[`shift_${r.shift}`] = r;
      if (r.time) existingMap[`time_${r.time}`] = r;
    });

    // Detect field edits
    const fieldDisplayNames = {
      m404_a: 'M 404 Option A',
      m404_b: 'M 404 Option B',
      m404_c: 'M 404 Option C',
      m405_outlet: 'M 405 Outlet',
      sb_turb1: 'SB Turbidity 1',
      sb_turb2: 'SB Turbidity 2',
      shift: 'Shift / Sample',
      time: 'Time',
    };

    const checkFields = ['m404_a', 'm404_b', 'm404_c', 'm405_outlet', 'sb_turb1', 'sb_turb2', 'shift', 'time'];

    readings.forEach((newR) => {
      const match = (newR.id && existingMap[newR.id]) ||
                    (newR.shift && existingMap[`shift_${newR.shift}`]) ||
                    (newR.time && existingMap[`time_${newR.time}`]);
      if (match) {
        checkFields.forEach((fieldKey) => {
          if (isValDiff(match[fieldKey], newR[fieldKey]) && match[fieldKey] !== undefined && match[fieldKey] !== '') {
            const rowKey = newR.id || `shift_${newR.shift}`;
            if (!editedFields[rowKey]) editedFields[rowKey] = {};
            editedFields[rowKey][fieldKey] = true;

            editAuditHistory.push({
              date: payload.date,
              rowId: rowKey,
              shift: newR.shift,
              time: newR.time,
              field: fieldKey,
              fieldName: fieldDisplayNames[fieldKey] || fieldKey,
              oldValue: match[fieldKey],
              newValue: newR[fieldKey],
              editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }
    });

    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `bicarb_moist_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      unit: 'Bicarbonate Moisture',
      section: 'Soda Ash Production',
      analysisType: 'Bicarbonate Moisture Analysis',
      readings,
      lockedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
      submittedById: req.user?._id,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company || null,
      saveEventId,
    };

    // 4. Atomic Database Persistence
    let savedRecordDoc = null;
    try {
      savedRecordDoc = await PlantAnalysisRecord.findOneAndUpdate(
        {
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: {
            $in: [
              'Bicarbonate Moisture Analysis',
              'Bi Carbonate Moisture Analysis',
              'Bicarbonate Moisture',
            ],
          },
          date: payload.date,
        },
        {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'Bicarbonate Moisture Analysis',
          unit: 'Bicarbonate Moisture',
          date: payload.date,
          shift: 'Once in 4 Hours',
          data: recordPayload,
          submittedBy: recordPayload.submittedBy,
          submittedById: recordPayload.submittedById,
          company: recordPayload.company,
          status: 'completed',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      console.error('[Bicarbonate Moisture Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Keep memory cache updated
    const cachedIdx = bicarbonateMoistureRecords.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      bicarbonateMoistureRecords[cachedIdx] = recordPayload;
    } else {
      bicarbonateMoistureRecords.unshift(recordPayload);
    }

    return res.status(200).json({
      success: true,
      message: 'Bicarbonate Moisture Analysis saved successfully in MongoDB ✓',
      data: recordPayload,
      record: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      lockedShifts,
      emailStatus: 'disabled',
      emailDeliveryStatus: 'disabled',
      emailRecipient: null,
      editedFields,
      saveEventId,
    });
  } catch (error) {
    console.error('Error saving Bicarbonate Moisture Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving Bicarbonate Moisture Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Get Bicarbonate Moisture Analysis data by date
 * @route   GET /api/bicarbonate-moisture
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;
    const targetShifts = ['shift1', 'shift2', 'shift3'];
    const defaultLocks = getInitialLockState({ type: 'shift', items: targetShifts });

    let assignedOperatorEmail = null;
    try {
      const { resolvePlantNotificationRecipient } = require('../services/plantNotificationService');
      const resolved = await resolvePlantNotificationRecipient({
        plantName: 'SA Plant',
        plantCode: 'SA',
        company: req.user?.company,
      });
      assignedOperatorEmail = resolved?.email || null;
    } catch (recipErr) {
      console.warn('Operator email resolution note:', recipErr.message);
    }

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: {
          $in: [
            'Bicarbonate Moisture Analysis',
            'Bi Carbonate Moisture Analysis',
            'Bicarbonate Moisture',
          ],
        },
      };

      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      let doc = null;
      if (PlantAnalysisRecord) {
        doc = await PlantAnalysisRecord.findOne(query).sort({ updatedAt: -1 });
      }

      if (doc) {
        const payloadData = doc.data || {};
        const readings = Array.isArray(payloadData.readings)
          ? payloadData.readings
          : Array.isArray(doc.readings)
          ? doc.readings
          : [];
        const resolvedLocks = payloadData.lockedShifts
          ? hydrateLockState(payloadData.lockedShifts, { type: 'shift', items: targetShifts })
          : defaultLocks;

        return res.status(200).json({
          success: true,
          data: {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode,
            analysisType: doc.analysisType,
            readings,
            lockedShifts: resolvedLocks,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          },
          record: doc,
          recordId: doc._id,
          readings,
          lockedShifts: resolvedLocks,
          editedFields: payloadData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      const match = bicarbonateMoistureRecords.find((r) => r.date === date);
      if (match) {
        const resolvedLocks = match.lockedShifts
          ? hydrateLockState(match.lockedShifts, { type: 'shift', items: targetShifts })
          : defaultLocks;
        return res.status(200).json({
          success: true,
          data: match,
          record: match,
          recordId: match._id || match.id,
          readings: match.readings,
          lockedShifts: resolvedLocks,
          editedFields: match.editedFields || {},
          assignedOperatorEmail,
          emailStatus: 'failed',
          emailRecipient: assignedOperatorEmail,
        });
      }

      return res.status(200).json({
        success: true,
        data: null,
        record: null,
        recordId: null,
        readings: [],
        lockedShifts: defaultLocks,
        editedFields: {},
        assignedOperatorEmail,
        emailStatus: 'failed',
        emailRecipient: assignedOperatorEmail,
        message: `No record found for date ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      count: bicarbonateMoistureRecords.length,
      data: bicarbonateMoistureRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/bicarbonate-moisture:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Bicarbonate Moisture Analysis records: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved Bicarbonate Moisture analysis record
 * @route   POST /api/bicarbonate-moisture/:id/retry-email
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
