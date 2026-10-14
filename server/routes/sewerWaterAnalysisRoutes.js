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
  return String(o).trim().toLowerCase() !== String(n).trim().toLowerCase();
};

const SEED_READINGS = [
  {
    id: 't11',
    time: '11:00',
    sec200: { fnh3: '3', cnh3: '0' },
    sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't13',
    time: '13:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't15',
    time: '15:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't17',
    time: '17:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't19',
    time: '19:00',
    sec200: { fnh3: '1020', cnh3: '2244' },
    sec400: { fnh3: '5780', cnh3: '2720', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '38.5' },
  },
  {
    id: 't21',
    time: '21:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
];

// In-memory fallback cache
const sewerWaterRecords = [
  {
    id: 'sewer_seed_1',
    date: '2026-09-14',
    plant: 'OFFSET',
    plantCode: 'OFFSITE',
    unit: 'Sewer Water',
    analysisType: 'Sewer Water Analysis',
    readings: SEED_READINGS,
    editedFields: {},
    editAuditHistory: [],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-14T21:30:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get Sewer Water Analysis data (by date or query)
 * @route   GET /api/sewer-water-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;

    // Resolve assigned OFFSITE operator
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
          analysisType: 'Sewer Water Analysis',
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
        console.warn('[SewerWater GET] MongoDB lookup note:', dbErr.message);
      }

      const match = sewerWaterRecords.find((r) => r.date === date);
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
        analysisType: 'Sewer Water Analysis',
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
      console.warn('[SewerWater GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: sewerWaterRecords.length,
      data: sewerWaterRecords,
    });
  } catch (error) {
    console.error('[SewerWater GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving Sewer Water records: ' + error.message,
    });
  }
});

/**
 * @desc    Save Sewer Water Analysis data (Time-Slot Hourly Sampling)
 * @route   POST /api/sewer-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Sewer Water Analysis.',
      });
    }

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: Sewer Water Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
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
    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      const checkVal = (section, key) => {
        const val = reading[section]?.[key];
        if (val !== '' && val !== null && val !== undefined) {
          if (key === 'pcl') {
            const isNil = ['nil', 'n', 'ni', 'none', '-'].includes(String(val).toLowerCase().trim());
            if (!isNil && isNaN(Number(val))) {
              errors.push(`Row #${rowNum} (${reading.time || ''}) [${section}.${key}]: must be a valid number or 'NIL'.`);
            }
          } else if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}) [${section}.${key}]: must be a valid number.`);
          }
        }
      };

      checkVal('sec200', 'fnh3');
      checkVal('sec200', 'cnh3');
      checkVal('sec400', 'fnh3');
      checkVal('sec400', 'cnh3');
      checkVal('sec400', 'hco3');
      checkVal('finalOutlet', 'fnh3');
      checkVal('finalOutlet', 'cnh3');
      checkVal('finalOutlet', 'hco3');
      checkVal('finalOutlet', 'pcl');
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    // Prevent duplicate sampling time slots
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
      analysisType: 'Sewer Water Analysis',
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);

    let editedFields = existingDoc?.data?.editedFields || {};
    let editAuditHistory = Array.isArray(existingDoc?.data?.editAuditHistory) ? existingDoc.data.editAuditHistory : [];
    const isEdit = Boolean(existingDoc);
    const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
    const editorId = req.user?._id;
    const nowIso = new Date().toISOString();

    // Field-level edit detection
    if (isEdit && existingDoc?.data?.readings) {
      const prevReadings = existingDoc.data.readings;
      const compareField = (rowId, time, section, key, oldVal, newVal) => {
        if (isValDiff(oldVal, newVal)) {
          const fieldKey = `${rowId || time}_${section}_${key}`;
          editedFields[fieldKey] = true;
          editAuditHistory.push({
            field: `${section}.${key}`,
            rowId: rowId || time,
            time,
            previousValue: oldVal ?? '',
            newValue: newVal ?? '',
            editedBy: editorName,
            editedById: editorId,
            timestamp: nowIso,
          });
        }
      };

      readings.forEach((newR) => {
        const oldR = prevReadings.find((r) => (r.id && r.id === newR.id) || r.time === newR.time);
        if (oldR) {
          compareField(newR.id, newR.time, 'sec200', 'fnh3', oldR.sec200?.fnh3, newR.sec200?.fnh3);
          compareField(newR.id, newR.time, 'sec200', 'cnh3', oldR.sec200?.cnh3, newR.sec200?.cnh3);
          compareField(newR.id, newR.time, 'sec400', 'fnh3', oldR.sec400?.fnh3, newR.sec400?.fnh3);
          compareField(newR.id, newR.time, 'sec400', 'cnh3', oldR.sec400?.cnh3, newR.sec400?.cnh3);
          compareField(newR.id, newR.time, 'sec400', 'hco3', oldR.sec400?.hco3, newR.sec400?.hco3);
          compareField(newR.id, newR.time, 'finalOutlet', 'fnh3', oldR.finalOutlet?.fnh3, newR.finalOutlet?.fnh3);
          compareField(newR.id, newR.time, 'finalOutlet', 'cnh3', oldR.finalOutlet?.cnh3, newR.finalOutlet?.cnh3);
          compareField(newR.id, newR.time, 'finalOutlet', 'hco3', oldR.finalOutlet?.hco3, newR.finalOutlet?.hco3);
          compareField(newR.id, newR.time, 'finalOutlet', 'pcl', oldR.finalOutlet?.pcl, newR.finalOutlet?.pcl);
        }
      });
    }

    const saveCount = (existingDoc?.data?.saveCount || 0) + 1;

    const recordData = {
      id: existingDoc?.data?.id || `sewer_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      unit: 'Sewer Water',
      analysisType: 'Sewer Water Analysis',
      readings,
      editedFields,
      editAuditHistory,
      saveCount,
      submittedBy: editorName,
      submittedById: editorId,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Update in-memory fallback
    const memIdx = sewerWaterRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      sewerWaterRecords[memIdx] = recordData;
    } else {
      sewerWaterRecords.unshift(recordData);
    }

    // Persist to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        analysisType: 'Sewer Water Analysis',
        date: payload.date,
        ...(req.user && req.user.company ? { company: req.user.company } : {}),
      },
      {
        plantName: 'OFFSET Plant',
        plantCode: 'OFFSITE',
        analysisType: 'Sewer Water Analysis',
        unit: 'Sewer Water',
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
            message: `${isEdit ? 'Updated' : 'Recorded'} Sewer Water Analysis for date ${payload.date}`,
            plant: 'OFFSET',
            unit: 'Sewer Water',
          },
        });
      }
    } catch (logErr) {
      console.warn('[SewerWater ActivityLog] note:', logErr.message);
    }

    // Decoupled Email Notification Dispatch to OFFSITE Plant Operator
    let emailResult = { emailStatus: 'pending', recipient: null };
    try {
      emailResult = await executeSaveAndEmailWorkflow({
        recordId: savedDoc._id,
        plantName: 'OFFSET Plant',
        plantCode: 'OFFSITE',
        analysisType: 'Sewer Water Analysis',
        unit: 'Sewer Water',
        date: payload.date,
        readings,
        submittedBy: editorName,
        company: req.user?.company?._id || req.user?.company,
        isRetry: false,
      });
    } catch (mailErr) {
      console.error('[SewerWater Email] Dispatch error:', mailErr);
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
      message: `Sewer Water Analysis for ${payload.date} saved successfully! ${
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
    console.error('Error in POST /api/sewer-water-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Sewer Water Analysis record: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Retry email notification for a previously saved Sewer Water record
 * @route   POST /api/sewer-water-analysis/:id/retry-email
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
        analysisType: 'Sewer Water Analysis',
      });
    }

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Analysis record not found for email retry.',
      });
    }

    const emailResult = await executeSaveAndEmailWorkflow({
      recordId: doc._id,
      plantName: 'OFFSET Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Sewer Water Analysis',
      unit: doc.unit || 'Sewer Water',
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
    console.error('Error in POST /api/sewer-water-analysis/:id/retry-email:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry email: ' + err.message,
    });
  }
});

module.exports = router;
