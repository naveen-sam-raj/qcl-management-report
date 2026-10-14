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
  return String(o) !== String(n);
};

// Seed/reference initial rows provided by laboratory specifications
const SEED_READINGS = [
  {
    id: 'r1',
    stream: 'Boiler Feed Water (BFW)',
    frequency: 'Day',
    time: '15:00',
    ph: '9',
    cond: '36.8',
    tAlk: '10',
    alk: '10',
    sio2: '0.26',
    fe2o3: '',
    th: '0',
  },
  {
    id: 'r2',
    stream: 'Super Heated Steam (SHS)',
    frequency: 'Day',
    time: '15:00',
    ph: '7.6',
    cond: '7.3',
    tAlk: '6',
    alk: '6',
    sio2: '0.14',
    fe2o3: '',
    th: '',
  },
];

// In-memory fallback cache
const bfwRecords = [
  {
    id: 'bfw_seed_1',
    date: '2026-09-13',
    plant: 'OFFSET',
    plantCode: 'OFFSITE',
    unit: 'BFW',
    analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
    readings: SEED_READINGS,
    editedFields: {},
    editAuditHistory: [],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T15:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get BFW / SHS Analysis data
 * @route   GET /api/bfw-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;

    // Resolve assigned OFFSITE Plant operator email
    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('OFFSITE');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || 'offsite_operator@tfl.com';
    } catch (recipErr) {
      assignedOperatorEmail = 'offsite_operator@tfl.com';
    }

    if (date) {
      try {
        const query = {
          date,
          analysisType: { $in: ['Boiler Feed Water / Super Heated Steam Analysis', 'BFW Analysis', 'Boiler Feed Water (BFW) Analysis'] },
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
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
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              readings: readings.length > 0 ? readings : SEED_READINGS,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[BFW GET] MongoDB lookup note:', dbErr.message);
      }

      const match = bfwRecords.find((r) => r.date === date);
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
        message: `No record found for date ${date}`,
      });
    }

    // List query
    try {
      const query = {
        analysisType: { $in: ['Boiler Feed Water / Super Heated Steam Analysis', 'BFW Analysis', 'Boiler Feed Water (BFW) Analysis'] },
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
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
      console.warn('[BFW GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: bfwRecords.length,
      data: bfwRecords,
    });
  } catch (error) {
    console.error('[BFW GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving BFW records: ' + error.message,
    });
  }
});

/**
 * @desc    Save BFW / SHS Analysis data
 * @route   POST /api/bfw-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save BFW Analysis.',
      });
    }

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: Boiler Feed Water / SHS Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    if (readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one analytical reading row is required.',
      });
    }

    const numericFields = ['ph', 'cond', 'tAlk', 'alk', 'sio2', 'fe2o3'];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      if (reading.th !== '' && reading.th !== null && reading.th !== undefined) {
        const thStr = String(reading.th).trim().toLowerCase();
        if (thStr !== 'nil' && thStr !== 'n' && thStr !== 'none' && thStr !== '-' && isNaN(Number(reading.th))) {
          errors.push(`Row #${rowNum} (${reading.stream || 'Reading'}): TH must be a valid number or 'Nil'.`);
        }
      }

      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.stream || 'Reading'}): ${field.toUpperCase()} must be a valid number.`);
          }
        }
      });

      if (reading.alk !== undefined && reading.tAlk === undefined) {
        reading.tAlk = reading.alk;
      } else if (reading.tAlk !== undefined && reading.alk === undefined) {
        reading.alk = reading.tAlk;
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    // Query existing record in MongoDB to perform field-level diff and audit
    const query = {
      date: payload.date,
      analysisType: { $in: ['Boiler Feed Water / Super Heated Steam Analysis', 'BFW Analysis', 'Boiler Feed Water (BFW) Analysis'] },
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const existingDoc = await PlantAnalysisRecord.findOne(query);

    let editedFields = {};
    let editAuditHistory = [];

    if (existingDoc && existingDoc.data) {
      editedFields = { ...(existingDoc.data.editedFields || {}) };
      editAuditHistory = [...(existingDoc.data.editAuditHistory || [])];

      const oldReadings = existingDoc.data.readings || existingDoc.data.shifts || [];
      const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
      const nowIso = new Date().toISOString();

      readings.forEach((newRow, idx) => {
        const rowId = newRow.id || `row_${idx}`;
        const oldRow = oldReadings.find((r) => r.id === rowId) || oldReadings[idx];

        if (oldRow) {
          [...numericFields, 'th'].forEach((field) => {
            const oldVal = oldRow[field];
            const newVal = newRow[field];

            if (isValDiff(oldVal, newVal)) {
              const fieldKey = `${rowId}_${field}`;
              editedFields[fieldKey] = true;
              editAuditHistory.push({
                rowId,
                stream: newRow.stream || 'Reading',
                field,
                oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
                newValue: newVal !== undefined && newVal !== null ? String(newVal) : '',
                editedBy: editorName,
                timestamp: nowIso,
              });
            }
          });
        }
      });
    }

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `bfw_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: payload.unit || 'BFW',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
      readings,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Update in-memory fallback
    const memIdx = bfwRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      bfwRecords[memIdx] = { ...bfwRecords[memIdx], ...recordData };
    } else {
      bfwRecords.unshift(recordData);
    }

    // Persist to MongoDB PlantAnalysisRecord
    let savedRecord = null;
    try {
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        query,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
          unit: 'BFW',
          date: payload.date,
          shift: 'Day',
          data: recordData,
          submittedBy: recordData.submittedBy,
          submittedById: recordData.submittedById,
          company: recordData.company,
          savedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      recordData.id = String(savedRecord._id);
      recordData._id = savedRecord._id;
    } catch (dbErr) {
      console.error('[BFW POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow
    const saveEventId = `save_bfw_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
        unit: 'BFW',
        shift: 'Day',
        date: payload.date,
        data: recordData,
        submittedBy: recordData.submittedBy,
        submittedById: recordData.submittedById,
        company: recordData.company,
        explicitRecord: savedRecord,
        rawBody: { ...payload, ...recordData },
        saveEventId,
      });
    } catch (notifyErr) {
      console.warn('[BFW POST] Email notification dispatch note:', notifyErr.message);
      emailResult = {
        success: false,
        emailStatus: 'failed',
        error: notifyErr.message,
      };
    }

    const emailStatus = emailResult.emailStatus || (emailResult.success ? 'sent' : 'failed');
    const emailRecipient = emailResult.recipient || savedRecord.emailRecipient || 'offsite_operator@tfl.com';

    // Activity Log
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'BFW_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `BFW & SHS Analysis saved for date: ${payload.date}. Email ${emailStatus} to ${emailRecipient}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: emailResult.success
        ? 'Boiler Feed Water / SHS Analysis saved and email sent successfully.'
        : 'Boiler Feed Water / SHS Analysis saved in MongoDB. Email delivery failed: ' + (emailResult.error || emailResult.emailError || 'Undeliverable'),
      recordId: savedRecord._id,
      emailStatus,
      emailRecipient,
      emailMessageId: emailResult.messageId || '',
      emailError: emailResult.error || emailResult.emailError,
      editedFields,
      editAuditHistory,
      data: recordData,
    });
  } catch (error) {
    console.error('[BFW POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing BFW analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for BFW / SHS Analysis
 * @route   POST /api/bfw-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Valid Record ID is required for email retry.' });
    }

    const record = await PlantAnalysisRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found for email retry.' });
    }

    const retryEventId = `retry_bfw_${Date.now()}`;
    const emailResult = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'OFFSITE',
      analysisType: record.analysisType || 'Boiler Feed Water / Super Heated Steam Analysis',
      unit: record.unit || 'BFW',
      shift: record.shift || 'Day',
      date: record.date,
      data: record.data,
      submittedBy: req.user?.name || record.submittedBy,
      submittedById: req.user?._id || record.submittedById,
      company: record.company,
      explicitRecord: record,
      rawBody: record.data,
      saveEventId: retryEventId,
    });

    const status = emailResult.success ? 'sent' : 'failed';
    record.emailStatus = status;
    if (emailResult.recipient) record.emailRecipient = emailResult.recipient;
    await record.save();

    return res.status(200).json({
      success: true,
      emailSent: emailResult.success,
      emailStatus: status,
      emailRecipient: record.emailRecipient,
      emailError: emailResult.error || emailResult.emailError,
      message: emailResult.success
        ? `Notification email successfully sent to ${record.emailRecipient}.`
        : `Email retry failed: ${emailResult.error || emailResult.emailError || 'Delivery rejected'}.`,
    });
  } catch (error) {
    console.error('[BFW Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email retry: ' + error.message,
    });
  }
});

module.exports = router;
