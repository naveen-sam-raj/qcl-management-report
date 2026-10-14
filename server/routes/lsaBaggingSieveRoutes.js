const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');

// In-memory cache fallback for LSA Bagging Sieve records
const lsaBaggingSieveRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * Returns current date string formatted as YYYY-MM-DD in Asia/Kolkata timezone
 */
const getTodayKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

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

const SIEVE_FIELDS = [
  { key: 'bss10', legacyKey: 'p10', name: 'BSS 10 (%)' },
  { key: 'bss30', legacyKey: 'p30', name: 'BSS 30 (%)' },
  { key: 'm30',   legacyKey: 'p60', name: '-30 (%)' },
  { key: 'bss60', legacyKey: 'm60', name: 'BSS 60 (%)' },
];

/**
 * @desc    Save LSA Bagging Sieve Analysis data (1 Hour Once frequency)
 * @route   POST /api/lsa-bagging-sieve
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA Bagging Sieve Analysis.',
      });
    }

    // 1. Current-Date Restriction Enforcement (Asia/Kolkata timezone)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Submissions are only permitted for the current date (${todayKolkata} in Asia/Kolkata timezone). Past and future dates cannot be submitted.`,
      });
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const errors = [];

    // 2. Validate sampling times & parameters
    const seenTimes = new Set();
    rows.forEach((row, index) => {
      if (row.time && row.time.trim() !== '') {
        const t = row.time.trim();
        if (seenTimes.has(t)) {
          errors.push(`Duplicate sampling time detected: "${t}". Each time slot must have a unique sampling time.`);
        }
        seenTimes.add(t);
      }

      ['bss10', 'bss30', 'm30', 'bss60', 'p10', 'p30', 'p60', 'm60'].forEach((field) => {
        const val = row[field];
        if (val !== undefined && val !== null && val !== '') {
          if (isNaN(Number(val))) {
            errors.push(`Row ${index + 1} (${row.time || 'Unknown time'}): ${field.toUpperCase()} must be a valid number.`);
          }
        }
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const editor = req.user?.name || payload.submittedBy || 'Plant Operator';
    const nowIso = new Date().toISOString();
    const saveEventId = `lsa_sieve_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 3. Retrieve Existing Record for today to perform field-level diff
    let existingDoc = null;
    try {
      if (PlantAnalysisRecord) {
        existingDoc = await PlantAnalysisRecord.findOne({
          date: payload.date,
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: 'LSA Bagging Sieve Analysis',
        }).sort({ createdAt: -1 });
      }
    } catch (e) {
      console.warn('[LSABaggingSieve Save] Note finding existing doc:', e.message);
    }

    const existingData = existingDoc?.data || lsaBaggingSieveRecords.find((r) => r.date === payload.date) || {};
    const existingRows = Array.isArray(existingData.rows) ? existingData.rows : [];
    const existingEditedFields = existingData.editedFields || {};
    const existingAuditHistory = Array.isArray(existingData.editAuditHistory) ? existingData.editAuditHistory : [];

    const editedFields = JSON.parse(JSON.stringify(existingEditedFields));
    const editAuditHistory = [...existingAuditHistory];

    // 4. Track added and deleted time slots
    const newTimes = new Set(rows.map((r) => r.time).filter(Boolean));
    const oldTimes = new Set(existingRows.map((r) => r.time).filter(Boolean));

    rows.forEach((newRow) => {
      if (newRow.time && !oldTimes.has(newRow.time) && existingRows.length > 0) {
        editAuditHistory.push({
          date: payload.date,
          section: 'LSA Bagging Sieve Analysis',
          samplingTime: newRow.time,
          details: `Custom sieve time slot added for ${newRow.time}`,
          editor,
          timestamp: nowIso,
          saveEventId,
        });
      }
    });

    existingRows.forEach((oldRow) => {
      if (oldRow.time && !newTimes.has(oldRow.time)) {
        editAuditHistory.push({
          date: payload.date,
          section: 'LSA Bagging Sieve Analysis',
          samplingTime: oldRow.time,
          details: `Sieve slot deleted for ${oldRow.time}`,
          editor,
          timestamp: nowIso,
          saveEventId,
        });
      }
    });

    // 5. Track field-level edits for existing slots
    rows.forEach((newRow) => {
      const oldRow = existingRows.find((r) => r.time === newRow.time || (r.id && r.id === newRow.id));
      if (oldRow) {
        SIEVE_FIELDS.forEach(({ key, legacyKey, name }) => {
          const oldVal = oldRow[key] !== undefined && oldRow[key] !== '' ? oldRow[key] : oldRow[legacyKey];
          const newVal = newRow[key] !== undefined && newRow[key] !== '' ? newRow[key] : newRow[legacyKey];

          if (isValDiff(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
            const rowKey = newRow.id || newRow.time;
            if (!editedFields[rowKey]) editedFields[rowKey] = {};
            editedFields[rowKey][key] = true;
            editedFields[rowKey][legacyKey] = true;

            editAuditHistory.push({
              date: payload.date,
              section: 'LSA Bagging Sieve Analysis',
              samplingTime: newRow.time,
              field: key,
              fieldName: name,
              oldValue: oldVal,
              newValue: newVal,
              editor,
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }
    });

    // Normalize row data with both key sets
    const normalizedRows = rows.map((r) => {
      const bss10 = r.bss10 !== undefined && r.bss10 !== '' ? r.bss10 : (r.p10 !== undefined ? r.p10 : '');
      const bss30 = r.bss30 !== undefined && r.bss30 !== '' ? r.bss30 : (r.p30 !== undefined ? r.p30 : '');
      const m30 = r.m30 !== undefined && r.m30 !== '' ? r.m30 : (r.p60 !== undefined ? r.p60 : '');
      const bss60 = r.bss60 !== undefined && r.bss60 !== '' ? r.bss60 : (r.m60 !== undefined ? r.m60 : '');

      return {
        ...r,
        bss10,
        bss30,
        m30,
        bss60,
        p10: bss10,
        p30: bss30,
        p60: m30,
        m60: bss60,
      };
    });

    // 6. Construct Record Payload
    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `lsa_sieve_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      plantId: 'sa',
      unit: 'LSA Bagging Sieve',
      section: 'LSA Bagging Sieve',
      analysisType: 'LSA Bagging Sieve Analysis',
      rows: normalizedRows,
      editedFields,
      editAuditHistory,
      saveEventId,
      submittedBy: editor,
      submittedById: req.user?._id,
      submittedAt: nowIso,
      company: req.user?.company?._id || req.user?.company,
    };

    // 7. Persist to MongoDB PlantAnalysisRecord reliably
    let savedRecordDoc = null;
    try {
      if (PlantAnalysisRecord) {
        savedRecordDoc = await PlantAnalysisRecord.findOneAndUpdate(
          {
            date: payload.date,
            plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
            analysisType: 'LSA Bagging Sieve Analysis',
          },
          {
            plantName: 'SA Plant',
            plantCode: 'SA',
            analysisType: 'LSA Bagging Sieve Analysis',
            unit: 'LSA Bagging Sieve',
            date: payload.date,
            shift: 'All Shifts',
            data: recordPayload,
            submittedBy: recordPayload.submittedBy,
            submittedById: recordPayload.submittedById,
            company: recordPayload.company,
            status: 'completed',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (dbErr) {
      console.error('[LSABaggingSieve Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Update in-memory fallback cache
    const cachedIdx = lsaBaggingSieveRecords.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      lsaBaggingSieveRecords[cachedIdx] = recordPayload;
    } else {
      lsaBaggingSieveRecords.unshift(recordPayload);
    }

    // 8. Dynamic SA Plant Operator Resolution and Email Dispatch
    let emailStatus = 'pending';
    let emailRecipient = null;
    let emailMessage = 'Saved successfully. Email dispatch initiated.';

    try {
      const { getPlantAssignedUser, executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA', { company: req.user?.company });
      emailRecipient = primaryEmail || assignedUser?.email || null;

      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: 'SA',
        analysisType: 'LSA Bagging Sieve Analysis',
        unit: 'LSA Bagging Sieve',
        shift: 'All Shifts',
        date: payload.date,
        data: recordPayload,
        submittedBy: recordPayload.submittedBy,
        submittedById: recordPayload.submittedById,
        explicitRecord: savedRecordDoc,
        saveEventId,
      });

      const workflowResult = await emailPromise;
      emailStatus = workflowResult.emailStatus || (workflowResult.success || workflowResult.emailSent ? 'sent' : 'failed');
        emailRecipient = workflowResult.recipient || emailRecipient;
        emailMessage = workflowResult.emailSent || workflowResult.emailStatus === 'sent'
          ? `Saved and notification dispatched to ${emailRecipient}`
          : `Saved, but email delivery failed: ${workflowResult.emailError || workflowResult.message || 'SMTP delivery rejected'}`;
    } catch (emailWorkflowErr) {
      console.warn('[LSABaggingSieve Email Warning]:', emailWorkflowErr.message);
      emailStatus = 'failed';
      emailMessage = `Saved, but email delivery encountered an error: ${emailWorkflowErr.message}`;
    }

    // 9. Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'SAVE_ANALYSIS',
          module: 'PLANT_ANALYSIS',
          details: `Saved LSA Bagging Sieve Analysis for SA Plant on ${payload.date} (${normalizedRows.length} sampling slots).`,
          user: req.user?._id,
          userName: req.user?.name,
          company: req.user?.company,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA Bagging Sieve activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: emailMessage,
      data: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      rows: normalizedRows,
      emailStatus,
      emailDeliveryStatus: emailStatus === 'sent' ? 'sent' : (emailStatus === 'failed' ? 'failed' : 'pending'),
      emailRecipient,
      editedFields,
      saveEventId,
    });
  } catch (error) {
    console.error('Error saving LSA Bagging Sieve Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving LSA Bagging Sieve Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Retrieve LSA Bagging Sieve records (Historical preservation & Date filtering)
 * @route   GET /api/lsa-bagging-sieve
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    if (date) {
      let recordDoc = null;
      try {
        if (PlantAnalysisRecord) {
          const query = {
            date,
            analysisType: 'LSA Bagging Sieve Analysis',
            plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          };
          if (req.user && req.user.company) {
            query.company = req.user.company._id || req.user.company;
          }
          recordDoc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        }
      } catch (dbErr) {
        console.warn('[LSABaggingSieve GET] DB lookup note:', dbErr.message);
      }

      const cached = lsaBaggingSieveRecords.find((r) => r.date === date);
      const dataPayload = recordDoc?.data || cached || null;

      let assignedOperatorEmail = null;
      try {
        const { getPlantAssignedUser } = require('../services/plantNotificationService');
        const { primaryEmail, assignedUser } = await getPlantAssignedUser('SA', { company: req.user?.company });
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (e) {}

      if (dataPayload) {
        return res.status(200).json({
          success: true,
          data: [dataPayload],
          record: dataPayload,
          recordId: recordDoc?._id || dataPayload.id,
          rows: dataPayload.rows || [],
          editedFields: dataPayload.editedFields || {},
          editAuditHistory: dataPayload.editAuditHistory || [],
          emailStatus: recordDoc?.emailStatus || dataPayload.emailStatus || 'pending',
          emailRecipient: recordDoc?.emailRecipient || dataPayload.emailRecipient || assignedOperatorEmail,
          assignedOperatorEmail,
        });
      }

      return res.status(200).json({
        success: true,
        data: [],
        record: null,
        rows: [],
        assignedOperatorEmail,
      });
    }

    // Range query or all records
    let results = [];
    try {
      if (PlantAnalysisRecord) {
        const query = {
          analysisType: 'LSA Bagging Sieve Analysis',
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        };
        if (startDate && endDate) {
          query.date = { $gte: startDate, $lte: endDate };
        }
        if (req.user && req.user.company) {
          query.company = req.user.company._id || req.user.company;
        }
        const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
        results = docs.map((d) => d.data || d);
      }
    } catch (e) {
      console.warn('[LSABaggingSieve GET range] DB error:', e.message);
    }

    if (results.length === 0) {
      results = [...lsaBaggingSieveRecords];
      if (startDate && endDate) {
        results = results.filter((r) => r.date >= startDate && r.date <= endDate);
      }
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error('[LSABaggingSieve API] Error retrieving records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving LSA Bagging Sieve records: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved LSA Bagging Sieve record
 * @route   POST /api/lsa-bagging-sieve/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;

    let record = null;
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findById === 'function') {
      record = await PlantAnalysisRecord.findById(id);
    }
    if (!record) {
      record = lsaBaggingSieveRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'LSA Bagging Sieve analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'SA',
      analysisType: record.analysisType || 'LSA Bagging Sieve Analysis',
      unit: 'LSA Bagging Sieve',
      shift: record.shift || 'All Shifts',
      date: record.date,
      data: record.data || record,
      submittedBy: record.submittedBy || req.user?.name,
      submittedById: record.submittedById || req.user?._id,
      explicitRecord: record,
      saveEventId: `lsa_sieve_retry_${Date.now()}`,
    });

    const isSuccess = result?.emailSent || result?.emailStatus === 'sent';
    const recipient = result?.recipient || result?.primaryEmail || 'sa_operator@tfl.com';
    return res.status(200).json({
      success: true,
      emailSent: isSuccess,
      emailDeliveryStatus: isSuccess ? 'sent' : 'failed',
      emailRecipient: recipient,
      recipient,
      message: isSuccess
        ? `Notification email successfully re-sent to ${recipient}.`
        : `Email delivery failed: ${result?.emailError || result?.message || 'SMTP delivery rejected'}`,
    });
  } catch (error) {
    console.error('Error in retry email for LSA Bagging Sieve analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to re-send notification email: ' + error.message,
    });
  }
});

module.exports = router;
