const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for E 501 / T 501 Analysis records
const e501T501Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit SA Plant E 501 / T 501 Analysis data
 * @route   POST /api/e501-t501-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save E 501 / T 501 Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: E 501 / T 501 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings)
      ? payload.readings
      : Array.isArray(payload.rows)
      ? payload.rows
      : [];
    const errors = [];
    const numFields = ['e501_fnh3', 'e501_na2co3', 't501_fnh3', 't501_na2co3'];

    readings.forEach((reading, idx) => {
      const rowLabel = reading.shift ? `Shift ${reading.shift}` : `Row #${idx + 1}`;
      numFields.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${rowLabel}: ${f} must be a valid number.`);
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
          'E 501 / T 501 Analysis',
          'E 501 / T 501',
          'E501 / T501 Analysis',
          'E501 / T501',
        ],
      },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingReadings = Array.isArray(existingData.readings) ? existingData.readings : [];

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

    const nowIso = new Date().toISOString();
    const saveEventId = `e501_t501_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build map of existing readings by row id or shift label
    const existingMap = {};
    existingReadings.forEach((r) => {
      if (r.id) existingMap[r.id] = r;
      if (r.shift) existingMap[`shift_${r.shift}`] = r;
    });

    const fieldDisplayNames = {
      e501_fnh3: 'E 501 FNH₃',
      e501_na2co3: 'E 501 Na₂CO₃',
      t501_fnh3: 'T 501 FNH₃',
      t501_na2co3: 'T 501 Na₂CO₃',
      shift: 'Shift',
    };

    const checkFields = ['e501_fnh3', 'e501_na2co3', 't501_fnh3', 't501_na2co3', 'shift'];

    readings.forEach((newR) => {
      const match = (newR.id && existingMap[newR.id]) || (newR.shift && existingMap[`shift_${newR.shift}`]);
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

    // Calculate Averages
    const calcAvg = (f) => {
      const vals = readings.map((r) => parseFloat(r[f])).filter((n) => !isNaN(n));
      return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    };

    const calculatedAverages = {
      e501_fnh3: calcAvg('e501_fnh3'),
      e501_na2co3: calcAvg('e501_na2co3'),
      t501_fnh3: calcAvg('t501_fnh3'),
      t501_na2co3: calcAvg('t501_na2co3'),
    };

    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `e501_t501_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      unit: 'E 501 / T 501',
      section: 'Soda Ash Production',
      analysisType: 'E 501 / T 501 Analysis',
      readings,
      averages: calculatedAverages,
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
              'E 501 / T 501 Analysis',
              'E 501 / T 501',
              'E501 / T501 Analysis',
              'E501 / T501',
            ],
          },
          date: payload.date,
        },
        {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'E 501 / T 501 Analysis',
          unit: 'E 501 / T 501',
          date: payload.date,
          shift: 'Once in a Shift',
          data: recordPayload,
          submittedBy: recordPayload.submittedBy,
          submittedById: recordPayload.submittedById,
          company: recordPayload.company,
          status: 'completed',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      console.error('[E 501 / T 501 Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Keep memory cache updated
    const cachedIdx = e501T501Records.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      e501T501Records[cachedIdx] = recordPayload;
    } else {
      e501T501Records.unshift(recordPayload);
    }

    // 5. Asynchronous Email Dispatch via Centralized Workflow
    let emailStatus = 'pending';
    let emailRecipient = null;
    let emailMessage = 'Saved successfully. Email dispatch initiated.';

    try {
      const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: 'SA',
        analysisType: 'E 501 / T 501 Analysis',
        unit: 'E 501 / T 501',
        shift: 'All Shifts',
        date: payload.date,
        data: recordPayload,
        submittedBy: recordPayload.submittedBy,
        submittedById: recordPayload.submittedById,
        explicitRecord: savedRecordDoc,
        saveEventId,
      });

      const workflowResult = await emailPromise;
      emailStatus = workflowResult.emailStatus || (workflowResult.success ? 'sent' : 'failed');
        emailRecipient = workflowResult.recipient || null;
        emailMessage = workflowResult.emailSent
          ? `Saved and notification dispatched to ${emailRecipient}`
          : `Saved, but email delivery failed: ${workflowResult.emailError || workflowResult.message || 'SMTP delivery rejected'}`;
    } catch (emailWorkflowErr) {
      console.warn('[E 501 / T 501 Email Warning]:', emailWorkflowErr.message);
      emailStatus = 'failed';
      emailMessage = `Saved, but email delivery encountered an error: ${emailWorkflowErr.message}`;
    }

    // Audit log
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'SAVE_ANALYSIS',
          module: 'PLANT_ANALYSIS',
          details: `Saved E 501 / T 501 Analysis for SA Plant on ${payload.date}`,
          user: req.user?._id,
          company: req.user?.company,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('ActivityLog note:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: emailMessage,
      data: recordPayload,
      record: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      emailStatus,
      emailDeliveryStatus: emailStatus === 'sent' ? 'sent' : (emailStatus === 'failed' ? 'failed' : 'pending'),
      emailRecipient,
      editedFields,
      saveEventId,
    });
  } catch (error) {
    console.error('Error saving E 501 / T 501 Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving E 501 / T 501 Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Get E 501 / T 501 Analysis data by date
 * @route   GET /api/e501-t501-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;

    let assignedOperatorEmail = null;
    try {
      const { getPlantAssignedUser } = require('../services/plantNotificationService');
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (recipErr) {
      console.warn('Operator email resolution note:', recipErr.message);
    }

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: {
          $in: [
            'E 501 / T 501 Analysis',
            'E 501 / T 501',
            'E501 / T501 Analysis',
            'E501 / T501',
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
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          },
          record: doc,
          recordId: doc._id,
          readings,
          editedFields: payloadData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      const match = e501T501Records.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
          record: match,
          recordId: match._id || match.id,
          readings: match.readings,
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
        editedFields: {},
        assignedOperatorEmail,
        emailStatus: 'failed',
        emailRecipient: assignedOperatorEmail,
        message: `No record found for date ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      count: e501T501Records.length,
      data: e501T501Records,
    });
  } catch (error) {
    console.error('Error in GET /api/e501-t501-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch E 501 / T 501 Analysis records: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved E 501 / T 501 analysis record
 * @route   POST /api/e501-t501-analysis/:id/retry-email
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
      record = e501T501Records.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'E 501 / T 501 analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'SA',
      analysisType: record.analysisType || 'E 501 / T 501 Analysis',
      unit: 'E 501 / T 501',
      shift: 'All Shifts',
      date: record.date,
      data: record.data || record,
      submittedBy: record.submittedBy || req.user?.name,
      submittedById: record.submittedById || req.user?._id,
      explicitRecord: record,
      saveEventId: `e501_t501_retry_${Date.now()}`,
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
        ? `Notification email successfully re-sent to ${result?.recipient}.`
        : `Email delivery failed: ${result?.emailError || result?.message || 'SMTP delivery rejected'}`,
      emailError: result?.emailError,
    });
  } catch (err) {
    console.error('[E 501 / T 501 Retry Email] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry email delivery: ' + err.message,
    });
  }
});

module.exports = router;
