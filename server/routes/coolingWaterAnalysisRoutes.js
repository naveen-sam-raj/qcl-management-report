const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { executeSaveAndEmailWorkflow, getPlantAssignedUser } = require('../services/plantNotificationService');

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
  return String(o).trim() !== String(n).trim();
};

const emptyRow = { time: '07:00', ph: '', frc: '', cl: '', opo4: '', turbidity: '', tds: '', fe: '', sio2: '', alk: '', so4: '', th: '', cah: '', mgh: '', ammn: '' };
const emptyRow200 = { time: '07:00', ph: '', frc: '', opo4: '', cl: '' };

const DEFAULT_READINGS_DAY = [
  { id: 't07', ...emptyRow, time: '07:00' },
  { id: 't09', ...emptyRow, time: '09:00' },
  { id: 't11', ...emptyRow, time: '11:00' },
  { id: 't13', ...emptyRow, time: '13:00' },
  { id: 't15', ...emptyRow, time: '15:00' },
  { id: 't17', ...emptyRow, time: '17:00' },
];

const DEFAULT_READINGS_200 = [
  { id: 't07', ...emptyRow200, time: '07:00' },
  { id: 't19', ...emptyRow200, time: '19:00' },
];

const CW_NUMERIC_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh'];
const CW200_NUMERIC_FIELDS = ['ph', 'frc', 'opo4', 'cl'];

// In-memory fallback caches
const coolingWaterRecords = [];
const coolingWater200Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get Cooling Water Analysis data (by date & unit)
 * @route   GET /api/cooling-water-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant, unit = 'cooling water' } = req.query;
    const is200 = String(unit).toLowerCase().includes('200');
    const normalizedUnit = is200 ? 'cooling water 200#' : 'cooling water';

    // Resolve assigned OFFSITE operator
    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('OFFSITE');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || 'offsite_operator@tfl.com';
    } catch (recipErr) {
      assignedOperatorEmail = 'offsite_operator@tfl.com';
    }

    const defaultLocks200 = {
      shift1Saved: false,
      shift2Saved: false,
      shift1Locked: false,
      shift2Locked: false,
      shift2Edits: 0,
    };

    if (date) {
      try {
        const query = {
          date,
          analysisType: 'Cooling Water (C.W Water) Analysis',
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
          unit: normalizedUnit,
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const readings = payloadData.readings || payloadData.shifts || payloadData.rows || [];
          return res.status(200).json({
            success: true,
            recordId: doc._id,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'pending',
            assignedOperatorEmail,
            lockedShifts: payloadData.lockedShifts || (is200 ? defaultLocks200 : {}),
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              unit: normalizedUnit,
              readings: readings.length > 0 ? readings : (is200 ? DEFAULT_READINGS_200 : DEFAULT_READINGS_DAY),
              lockedShifts: payloadData.lockedShifts || (is200 ? defaultLocks200 : {}),
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[CoolingWater GET] MongoDB lookup note:', dbErr.message);
      }

      const cache = is200 ? coolingWater200Records : coolingWaterRecords;
      const match = cache.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          data: match,
        });
      }

      return res.status(200).json({
        success: true,
        assignedOperatorEmail,
        data: null,
        message: `No record found for date ${date} and unit ${normalizedUnit}`,
      });
    }

    // List query
    try {
      const query = {
        analysisType: 'Cooling Water (C.W Water) Analysis',
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        unit: normalizedUnit,
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
          unit: d.unit,
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
      console.warn('[CoolingWater GET list] MongoDB note:', listErr.message);
    }

    const cache = is200 ? coolingWater200Records : coolingWaterRecords;
    return res.status(200).json({
      success: true,
      count: cache.length,
      data: cache,
    });
  } catch (error) {
    console.error('[CoolingWater GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving Cooling Water records: ' + error.message,
    });
  }
});

/**
 * @desc    Save Cooling Water Analysis data (Supports Cooling Water & Cooling Water 200#)
 * @route   POST /api/cooling-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Cooling Water Analysis.',
      });
    }

    const is200 = String(payload.unit || '').toLowerCase().includes('200');
    const normalizedUnit = is200 ? 'cooling water 200#' : 'cooling water';

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: ${is200 ? 'Cooling Water / 200#' : 'Cooling Water'} Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    if (readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one analytical reading row is required.',
      });
    }

    const errors = [];
    const fieldsToValidate = is200 ? CW200_NUMERIC_FIELDS : CW_NUMERIC_FIELDS;

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      fieldsToValidate.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}): ${f.toUpperCase()} must be a valid number.`);
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

    // Prevent duplicate time slots
    const timeSlots = readings.map((r) => String(r.time || '').trim()).filter(Boolean);
    const uniqueSlots = new Set(timeSlots);
    if (timeSlots.length !== uniqueSlots.size) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate sampling time slots detected. Each observation must have a unique time slot.',
      });
    }

    // Fetch existing record in MongoDB
    const query = {
      date: payload.date,
      analysisType: 'Cooling Water (C.W Water) Analysis',
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
      unit: normalizedUnit,
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);

    let editedFields = existingDoc?.data?.editedFields || {};
    let editAuditHistory = Array.isArray(existingDoc?.data?.editAuditHistory) ? existingDoc.data.editAuditHistory : [];
    let lockedShifts = existingDoc?.data?.lockedShifts || {
      shift1Saved: false,
      shift2Saved: false,
      shift1Locked: false,
      shift2Locked: false,
      shift2Edits: 0,
    };

    const isEdit = Boolean(existingDoc);
    const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
    const editorId = req.user?._id;
    const nowIso = new Date().toISOString();

    // Cooling Water 200# Sequential Shift Lock Handling (Shift 1 = 07:00, Shift 2 = 19:00)
    if (is200) {
      const s1Reading = readings.find((r) => r.time === '07:00') || readings[0];
      const s2Reading = readings.find((r) => r.time === '19:00') || readings[1];

      const s1HasData = s1Reading && CW200_NUMERIC_FIELDS.some((f) => s1Reading[f] !== '' && s1Reading[f] !== null);
      const s2HasData = s2Reading && CW200_NUMERIC_FIELDS.some((f) => s2Reading[f] !== '' && s2Reading[f] !== null);

      if (s2HasData && !lockedShifts.shift1Saved && !s1HasData) {
        return res.status(400).json({
          success: false,
          message: 'Sequential shift violation: Shift 1 (07:00) must be saved before Shift 2 (19:00) can be entered.',
        });
      }

      // Check if Shift 1 values changed
      const oldS1 = existingDoc?.data?.readings?.find((r) => r.time === '07:00') || existingDoc?.data?.readings?.[0];
      const s1Changed = oldS1 && CW200_NUMERIC_FIELDS.some((f) => isValDiff(oldS1[f], s1Reading[f]));

      if (s1HasData) {
        if (lockedShifts.shift1Locked) {
          if (s1Changed) {
            return res.status(400).json({
              success: false,
              message: 'Shift 1 (07:00) is locked. Edits to Shift 1 are prohibited.',
            });
          }
        }
        if (lockedShifts.shift1Saved && s1Changed) {
          lockedShifts.shift1Edits = (lockedShifts.shift1Edits || 0) + 1;
          if (lockedShifts.shift1Edits >= 1) {
            lockedShifts.shift1Locked = true;
          }
        } else {
          lockedShifts.shift1Saved = true;
        }
      }

      if (s2HasData) {
        if (lockedShifts.shift2Locked) {
          return res.status(400).json({
            success: false,
            message: 'Shift 2 (19:00) has reached the maximum permitted edit limit (1 edit) and is permanently locked.',
          });
        }
        lockedShifts.shift1Locked = true; // Lock Shift 1 permanently when Shift 2 is saved
        const oldS2 = existingDoc?.data?.readings?.find((r) => r.time === '19:00') || existingDoc?.data?.readings?.[1];
        const s2Changed = oldS2 && CW200_NUMERIC_FIELDS.some((f) => isValDiff(oldS2[f], s2Reading[f]));

        if (lockedShifts.shift2Saved && s2Changed) {
          lockedShifts.shift2Edits = (lockedShifts.shift2Edits || 0) + 1;
          if (lockedShifts.shift2Edits >= 1) {
            lockedShifts.shift2Locked = true;
          }
        } else {
          lockedShifts.shift2Saved = true;
        }
      }
    } else {
      // Day Routine Cooling Water: Record-level one-time edit lock
      if (existingDoc && existingDoc.data) {
        const docData = existingDoc.data;
        if (docData.isLocked || (docData.editCount || 0) >= 1) {
          return res.status(400).json({
            success: false,
            message: 'One-time edit restriction: Cooling Water Analysis has already been edited once and is now permanently locked.',
          });
        }
      }
    }

    // Field-level edit tracking
    if (isEdit && existingDoc?.data?.readings) {
      const prevReadings = existingDoc.data.readings;
      readings.forEach((newR) => {
        const oldR = prevReadings.find((r) => (r.id && r.id === newR.id) || r.time === newR.time);
        if (oldR) {
          fieldsToValidate.forEach((f) => {
            if (isValDiff(oldR[f], newR[f])) {
              const fieldKey = `${newR.id || newR.time}_${f}`;
              editedFields[fieldKey] = true;
              editAuditHistory.push({
                field: f,
                rowId: newR.id || newR.time,
                time: newR.time,
                previousValue: oldR[f] ?? '',
                newValue: newR[f] ?? '',
                editedBy: editorName,
                editedById: editorId,
                timestamp: nowIso,
              });
            }
          });
        }
      });
    }

    const saveCount = (existingDoc?.data?.saveCount || 0) + 1;
    const initialSaved = true;
    const editCount = isEdit ? (existingDoc?.data?.editCount || 0) + 1 : 0;
    const isLocked = !is200 ? editCount >= 1 : undefined;

    const recordData = {
      id: existingDoc?.data?.id || `cw_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      unit: normalizedUnit,
      analysisType: 'Cooling Water (C.W Water) Analysis',
      readings,
      lockedShifts: is200 ? lockedShifts : undefined,
      initialSaved: !is200 ? initialSaved : undefined,
      editCount: !is200 ? editCount : undefined,
      isLocked: !is200 ? isLocked : undefined,
      editedFields,
      editAuditHistory,
      saveCount,
      submittedBy: editorName,
      submittedById: editorId,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Update in-memory fallback
    const cache = is200 ? coolingWater200Records : coolingWaterRecords;
    const memIdx = cache.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      cache[memIdx] = recordData;
    } else {
      cache.unshift(recordData);
    }

    // Persist to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        analysisType: 'Cooling Water (C.W Water) Analysis',
        date: payload.date,
        unit: normalizedUnit,
        ...(req.user && req.user.company ? { company: req.user.company } : {}),
      },
      {
        plantName: 'OFFSET Plant',
        plantCode: 'OFFSITE',
        analysisType: 'Cooling Water (C.W Water) Analysis',
        unit: normalizedUnit,
        date: payload.date,
        data: recordData,
        submittedBy: editorName,
        submittedById: editorId,
        company: req.user?.company?._id || req.user?.company,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Optional user activity log
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          user: req.user._id,
          action: isEdit ? 'UPDATE' : 'CREATE',
          entity: 'ANALYSIS',
          details: {
            message: `${isEdit ? 'Updated' : 'Recorded'} ${is200 ? 'Cooling Water / 200#' : 'Cooling Water'} Analysis for date ${payload.date}`,
            plant: 'OFFSET',
            unit: normalizedUnit,
          },
        });
      }
    } catch (logErr) {
      console.warn('[CoolingWater ActivityLog] note:', logErr.message);
    }

    // Decoupled Email Notification Dispatch to OFFSITE Plant Operator
    let emailResult = { emailStatus: 'pending', recipient: null };
    try {
      emailResult = await executeSaveAndEmailWorkflow({
        recordId: savedDoc._id,
        plantName: 'OFFSET Plant',
        plantCode: 'OFFSITE',
        analysisType: is200 ? 'Cooling Water / 200#' : 'Cooling Water (C.W Water) Analysis',
        unit: normalizedUnit,
        date: payload.date,
        readings,
        submittedBy: editorName,
        company: req.user?.company?._id || req.user?.company,
        isRetry: false,
      });
    } catch (mailErr) {
      console.error('[CoolingWater Email] Dispatch error:', mailErr);
      emailResult = {
        emailStatus: 'failed',
        emailError: mailErr.message,
      };
      await PlantAnalysisRecord.findByIdAndUpdate(savedDoc._id, {
        emailStatus: 'failed',
        emailError: mailErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${is200 ? 'Cooling Water / 200#' : 'Cooling Water'} Analysis for ${payload.date} saved successfully! ${
        emailResult.emailStatus === 'sent'
          ? `Notification dispatched to registered operator (${emailResult.recipient}).`
          : emailResult.emailStatus === 'failed'
          ? `(Note: Email dispatch failed: ${emailResult.emailError || 'SMTP Error'})`
          : 'Email notification pending.'
      }`,
      data: {
        ...recordData,
        _id: savedDoc._id,
        id: savedDoc._id,
        emailStatus: emailResult.emailStatus,
        emailRecipient: emailResult.recipient,
        emailError: emailResult.emailError,
      },
      emailStatus: emailResult.emailStatus,
      emailRecipient: emailResult.recipient,
      emailError: emailResult.emailError,
    });
  } catch (error) {
    console.error('Error in POST /api/cooling-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Cooling Water Analysis record: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Retry email notification for a previously saved Cooling Water record
 * @route   POST /api/cooling-water-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;
    let doc = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      doc = await PlantAnalysisRecord.findById(id);
    }
    if (!doc) {
      doc = await PlantAnalysisRecord.findOne({
        'data.id': id,
        analysisType: 'Cooling Water (C.W Water) Analysis',
      });
    }

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Analysis record not found for email retry.',
      });
    }

    const is200 = String(doc.unit || '').toLowerCase().includes('200');

    const emailResult = await executeSaveAndEmailWorkflow({
      recordId: doc._id,
      plantName: 'OFFSET Plant',
      plantCode: 'OFFSITE',
      analysisType: is200 ? 'Cooling Water / 200#' : 'Cooling Water (C.W Water) Analysis',
      unit: doc.unit || (is200 ? 'cooling water 200#' : 'cooling water'),
      date: doc.date,
      readings: doc.data?.readings || [],
      submittedBy: req.user?.name || doc.submittedBy,
      company: doc.company,
      isRetry: true,
    });

    return res.status(200).json({
      success: emailResult.emailStatus === 'sent',
      message:
        emailResult.emailStatus === 'sent'
          ? `Email successfully sent to ${emailResult.recipient}`
          : `Email dispatch failed: ${emailResult.emailError || 'SMTP Error'}`,
      emailStatus: emailResult.emailStatus,
      emailRecipient: emailResult.recipient,
      emailError: emailResult.emailError,
    });
  } catch (err) {
    console.error('Error in POST /api/cooling-water-analysis/:id/retry-email:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry email: ' + err.message,
    });
  }
});

module.exports = router;
