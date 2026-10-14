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

// Seed/reference initial parameters
const SEED_PARAMETERS = {
  ph: '7.6',
  cond: '211',
  turbidity: '8',
  tds: '137',
  freeCl2: '0',
  fe: '0.30',
  sio2: '5',
  mAlk: '56',
  th: '60',
  caH: '36',
  mgH: '24',
  cl: '30',
  so4: '15',
  ema: '45',
};

// In-memory fallback cache
const rawWaterRecords = [
  {
    id: 'rawwater_seed_1',
    date: '2026-09-14',
    time: '08:00',
    plant: 'OFFSET',
    plantCode: 'OFFSITE',
    unit: 'Raw Water',
    analysisType: 'Raw Water Analysis',
    parameters: SEED_PARAMETERS,
    editedFields: {},
    editAuditHistory: [],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T08:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get Raw Water Analysis data
 * @route   GET /api/raw-water-analysis
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
          analysisType: 'Raw Water Analysis',
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const params = payloadData.parameters || payloadData.data || payloadData;
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
              time: payloadData.time || '08:00',
              parameters: params || SEED_PARAMETERS,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[RawWater GET] MongoDB lookup note:', dbErr.message);
      }

      const match = rawWaterRecords.find((r) => r.date === date);
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

    // Listing query
    try {
      const query = {
        analysisType: 'Raw Water Analysis',
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
      console.warn('[RawWater GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: rawWaterRecords.length,
      data: rawWaterRecords,
    });
  } catch (error) {
    console.error('[RawWater GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving Raw Water records: ' + error.message,
    });
  }
});

/**
 * @desc    Save Raw Water Analysis data
 * @route   POST /api/raw-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Raw Water Analysis.',
      });
    }

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: Raw Water Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
      });
    }

    const params = payload.parameters || payload.data || {};
    const errors = [];
    const numericKeys = [
      'ph', 'cond', 'turbidity', 'tds', 'freeCl2', 'fe',
      'sio2', 'mAlk', 'th', 'caH', 'mgH', 'cl', 'so4', 'ema'
    ];

    numericKeys.forEach((key) => {
      const val = params[key];
      if (val !== '' && val !== null && val !== undefined) {
        if (isNaN(Number(val))) {
          errors.push(`${key.toUpperCase()} must be a valid number.`);
        }
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
      analysisType: 'Raw Water Analysis',
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

      const oldParams = existingDoc.data.parameters || existingDoc.data.data || {};
      const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
      const nowIso = new Date().toISOString();

      numericKeys.forEach((key) => {
        const oldVal = oldParams[key];
        const newVal = params[key];

        if (isValDiff(oldVal, newVal)) {
          editedFields[key] = true;
          editAuditHistory.push({
            field: key,
            oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
            newValue: newVal !== undefined && newVal !== null ? String(newVal) : '',
            editedBy: editorName,
            timestamp: nowIso,
          });
        }
      });
    }

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `rawwater_${Date.now()}`,
      date: payload.date,
      time: payload.time || '08:00',
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: 'Raw Water',
      analysisType: 'Raw Water Analysis',
      parameters: params,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Update in-memory fallback
    const memIdx = rawWaterRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      rawWaterRecords[memIdx] = { ...rawWaterRecords[memIdx], ...recordData };
    } else {
      rawWaterRecords.unshift(recordData);
    }

    // Persist to MongoDB PlantAnalysisRecord
    let savedRecord = null;
    try {
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        query,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'Raw Water Analysis',
          unit: 'Raw Water',
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
      console.error('[RawWater POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow
    const saveEventId = `save_rawwater_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'Raw Water Analysis',
        unit: 'Raw Water',
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
      console.warn('[RawWater POST] Email notification dispatch note:', notifyErr.message);
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
          action: 'RAW_WATER_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Raw Water Analysis saved for date: ${payload.date}. Email ${emailStatus} to ${emailRecipient}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: emailResult.success
        ? 'Raw Water Analysis saved and email sent successfully.'
        : 'Raw Water Analysis saved in MongoDB. Email delivery failed: ' + (emailResult.error || emailResult.emailError || 'Undeliverable'),
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
    console.error('[RawWater POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Raw Water analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for Raw Water Analysis
 * @route   POST /api/raw-water-analysis/:id/retry-email
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

    const retryEventId = `retry_rawwater_${Date.now()}`;
    const emailResult = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'OFFSITE',
      analysisType: record.analysisType || 'Raw Water Analysis',
      unit: record.unit || 'Raw Water',
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
    console.error('[RawWater Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email retry: ' + error.message,
    });
  }
});

module.exports = router;
