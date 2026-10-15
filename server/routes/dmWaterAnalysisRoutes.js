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

// Zero initial rows for DM Water and Anion unit
const ZERO_READINGS = [
  {
    id: 'r_dm_water',
    unit: 'DM WATER',
    time: '',
    ph: '0',
    cond: '0',
    p: '0',
    m: '0',
    alk: '0',
    th: '0',
    sio2: '0',
    isDefault: true,
  },
  {
    id: 'r_anion_unit',
    unit: 'A.UNIT',
    time: '',
    ph: '0',
    cond: '0',
    p: '0',
    m: '0',
    alk: '0',
    th: '0',
    sio2: '0',
    isDefault: true,
  },
];

// In-memory fallback cache (no hardcoded demo/sample records)
const dmWaterRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get DM Water / Anion Unit Analysis data
 * @route   GET /api/dm-water-analysis
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
          analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          let readings = payloadData.readings || payloadData.shifts || payloadData.rows || [];
          if (readings.length === 0 && (payloadData.ph !== undefined || payloadData.conductivity !== undefined || payloadData.silica !== undefined)) {
            readings = [
              {
                id: 'r_dm_water',
                unit: 'DM WATER',
                time: payloadData.time || '',
                ph: payloadData.ph !== undefined ? String(payloadData.ph) : '0',
                cond: (payloadData.cond || payloadData.conductivity) !== undefined ? String(payloadData.cond || payloadData.conductivity) : '0',
                th: payloadData.th !== undefined ? String(payloadData.th) : '0',
                alk: payloadData.alk !== undefined ? String(payloadData.alk) : '0',
                sio2: (payloadData.sio2 || payloadData.silica) !== undefined ? String(payloadData.sio2 || payloadData.silica) : '0',
                p: payloadData.p !== undefined ? String(payloadData.p) : '0',
                m: payloadData.m !== undefined ? String(payloadData.m) : '0',
                isDefault: true,
              },
              {
                id: 'r_anion_unit',
                unit: 'A.UNIT',
                time: '',
                ph: '0',
                cond: '0',
                th: '0',
                alk: '0',
                sio2: '0',
                p: '0',
                m: '0',
                isDefault: true,
              },
            ];
          }
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
              readings: readings.length > 0 ? readings : ZERO_READINGS,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[DMWater GET] MongoDB lookup note:', dbErr.message);
      }

      // Check in-memory fallback
      const match = dmWaterRecords.find((r) => r.date === date);
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

    // Date range or listing query
    try {
      const query = {
        analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
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
      console.warn('[DMWater GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: dmWaterRecords.length,
      data: dmWaterRecords,
    });
  } catch (error) {
    console.error('[DMWater GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving DM Water records: ' + error.message,
    });
  }
});

/**
 * @desc    Save DM Water / Anion Unit Analysis data
 * @route   POST /api/dm-water-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save DM Water Analysis.',
      });
    }

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: DM Water Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    if (readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one analytical reading row is required.',
      });
    }

    const numericFields = ['ph', 'cond', 'alk', 'p', 'm', 'th', 'sio2'];
    const errors = [];

    readings.forEach((reading, index) => {
      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (field === 'th' && (String(val).toLowerCase() === 'nil' || String(val).toLowerCase() === '0')) {
            return;
          }
          if (isNaN(Number(val))) {
            errors.push(`Row ${index + 1} (${reading.unit || 'Sample'}) -> ${field.toUpperCase()} must be a valid number.`);
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

    // Query existing record in MongoDB to perform field-level diff and audit
    const query = {
      date: payload.date,
      analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const existingDoc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 });

    // Check one-time edit restriction policy
    if (existingDoc && existingDoc.data) {
      const isLockedAlready = Boolean(existingDoc.data.isLocked || (existingDoc.data.editCount || 0) >= 1);
      if (isLockedAlready) {
        return res.status(400).json({
          success: false,
          message: 'One-time edit restriction policy: This DM Water record has already utilized its single permitted edit and is permanently LOCKED.',
        });
      }
    }

    const isEdit = Boolean(existingDoc && existingDoc.data?.initialSaved);
    const editCount = isEdit ? (existingDoc.data.editCount || 0) + 1 : 0;
    const isLocked = isEdit && editCount >= 1;
    const initialSaved = true;

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
          numericFields.forEach((field) => {
            const oldVal = oldRow[field];
            const newVal = newRow[field];

            if (isValDiff(oldVal, newVal)) {
              const fieldKey = `${rowId}_${field}`;
              editedFields[fieldKey] = true;
              editAuditHistory.push({
                rowId,
                unit: newRow.unit || 'Sample',
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

    const cleanedReadings = readings.map((r) => ({
      ...r,
      p: r.p !== undefined && r.p !== '' ? r.p : '0',
      m: r.alk !== undefined && r.alk !== '' ? r.alk : (r.m || '0'),
    }));

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `dm_water_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: payload.unit || 'DM Water',
      analysisType: 'Analysis For DM Water / Anion unit',
      readings: cleanedReadings,
      editedFields,
      editAuditHistory,
      initialSaved,
      editCount,
      isLocked,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Update in-memory fallback
    const memIdx = dmWaterRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      dmWaterRecords[memIdx] = { ...dmWaterRecords[memIdx], ...recordData };
    } else {
      dmWaterRecords.unshift(recordData);
    }

    // Persist to MongoDB PlantAnalysisRecord
    let savedRecord = null;
    try {
      const updateQuery = existingDoc ? { _id: existingDoc._id } : query;
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        updateQuery,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'Analysis For DM Water / Anion unit',
          unit: 'DM Water',
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
      console.error('[DMWater POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow decoupled from DB persistence
    const saveEventId = `save_dmwater_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'Analysis For DM Water / Anion unit',
        unit: 'DM Water',
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
      console.warn('[DMWater POST] Email notification dispatch note:', notifyErr.message);
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
          action: 'DM_WATER_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `DM Water Analysis saved for date: ${payload.date}. Email ${emailStatus} to ${emailRecipient}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: emailResult.success
        ? 'DM Water Analysis saved and email sent successfully.'
        : 'DM Water Analysis saved successfully in MongoDB. Email delivery failed: ' + (emailResult.error || emailResult.emailError || 'Undeliverable'),
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
    console.error('[DMWater POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing DM Water analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for DM Water Analysis
 * @route   POST /api/dm-water-analysis/:id/retry-email
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

    const retryEventId = `retry_dmwater_${Date.now()}`;
    const emailResult = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'OFFSITE',
      analysisType: record.analysisType || 'Analysis For DM Water / Anion unit',
      unit: record.unit || 'DM Water',
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
    console.error('[DMWater Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email retry: ' + error.message,
    });
  }
});

module.exports = router;
