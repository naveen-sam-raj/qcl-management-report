const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for Raw Salt records
const rawSaltRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit Raw Salt Analysis data (NaCl %, Ca %, Mg %, SO4 %, IR %, H2O %)
 * @route   POST /api/raw-salt-analysis and /api/raw-salt
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Raw Salt Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Raw Salt Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const { parameters = {} } = payload;
    const errors = [];

    // Validate parameters
    const paramKeys = ['nacl', 'ca', 'mg', 'so4', 'ir', 'h2o'];
    paramKeys.forEach((key) => {
      const val = parameters[key];
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Parameter '${key.toUpperCase()}' must be a valid number.`);
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    const hasData = paramKeys.some((k) => {
      const val = parameters[k];
      return val !== '' && val !== null && val !== undefined;
    });

    if (!hasData) {
      return res.status(400).json({
        success: false,
        message: 'Please enter at least one measurement value for Raw Salt parameters.',
      });
    }

    const plantTarget = payload.plant || 'ACL';

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'Raw Salt Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingParams = existingData.parameters || existingData || {};

    let editCount = existingData.editCount !== undefined ? existingData.editCount : (existingData.isSaved ? 1 : 0);
    let isLocked = existingData.isLocked === true;
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    // 4. Locking Check: Enforce edit limit (1 initial save + 1 final permitted edit = max 2 saves total)
    if (isLocked || editCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'This date’s Raw Salt Analysis record is permanently locked. Maximum permitted edits reached.',
      });
    }

    const isInitialSave = editCount === 0 && !existingData.isSaved;

    // Helper: Compare values numerically or as strings
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

    // 5. Track Field-Level EDITED Badges on subsequent save
    if (!isInitialSave) {
      paramKeys.forEach((k) => {
        const oVal = existingParams[k];
        const nVal = parameters[k];
        if (isValDiff(oVal, nVal)) {
          editedFields[`param_${k}`] = true;
          editAuditHistory.push({
            section: 'parameters',
            field: k,
            oldValue: oVal !== undefined && oVal !== null ? oVal : null,
            newValue: nVal !== undefined && nVal !== null ? nVal : null,
            editor: req.user?.name || payload.submittedBy || 'Plant Operator',
            editorId: req.user?._id || null,
            date: payload.date,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    // Advance edit count
    const newEditCount = editCount + 1;
    // Lock permanently after 2nd save
    const newIsLocked = newEditCount >= 2;

    // Generate unique Save Event ID
    const saveEventId = `save_rawsalt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const formattedParameters = {
      nacl: parameters.nacl !== '' && parameters.nacl !== null && parameters.nacl !== undefined ? String(parameters.nacl) : '',
      ca: parameters.ca !== '' && parameters.ca !== null && parameters.ca !== undefined ? String(parameters.ca) : '',
      mg: parameters.mg !== '' && parameters.mg !== null && parameters.mg !== undefined ? String(parameters.mg) : '',
      so4: parameters.so4 !== '' && parameters.so4 !== null && parameters.so4 !== undefined ? String(parameters.so4) : '',
      ir: parameters.ir !== '' && parameters.ir !== null && parameters.ir !== undefined ? String(parameters.ir) : '',
      h2o: parameters.h2o !== '' && parameters.h2o !== null && parameters.h2o !== undefined ? String(parameters.h2o) : '',
    };

    const updatedRecordData = {
      id: existingData.id || `raw_salt_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      unit: 'Raw Salt',
      frequency: 'Day',
      analysisType: 'Raw Salt Analysis',
      parameters: formattedParameters,
      isSaved: true,
      editCount: newEditCount,
      isLocked: newIsLocked,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // 6. Persist to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'Raw Salt Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'Raw Salt Analysis',
        unit: 'Raw Salt',
        date: payload.date,
        data: updatedRecordData,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company,
        lastSaveEventId: saveEventId,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update in-memory storage
    rawSaltRecords.unshift(updatedRecordData);
    if (rawSaltRecords.length > 50) rawSaltRecords.pop();

    // Log Activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          action: 'RAW_SALT_ANALYSIS_SAVED',
          user: req.user._id,
          userName: req.user.name,
          details: `Raw Salt Analysis saved for date: ${payload.date} [Event: ${saveEventId}, Edit #${newEditCount}].`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // 7. Execute Centralized Save & Email Workflow
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'Raw Salt Analysis',
        unit: 'Raw Salt',
        shift: 'Day',
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: payload,
        saveEventId,
      });

      lastEmailResult = await emailPromise;
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for Raw Salt:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailSent ? 'sent' : 'failed';
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved Raw Salt Analysis & email sent ✓`
        : `Successfully saved Raw Salt Analysis — Email delivery failed: ${lastEmailResult?.error || 'Unknown error'}`,
      data: updatedRecordData,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      emailSent,
      emailPending: false,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
    });
  } catch (error) {
    console.error('Error in POST /api/raw-salt-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Raw Salt Analysis record: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Raw Salt Analysis records
 * @route   GET /api/raw-salt-analysis and /api/raw-salt
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('ACL');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'Raw Salt Analysis',
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const enrichedData = {
          ...doc.data,
          _id: doc._id,
          recordId: doc._id,
        };
        return res.status(200).json({
          success: true,
          data: [enrichedData],
          recordId: doc._id,
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: [],
      assignedOperatorEmail,
      emailStatus: 'pending',
      emailRecipient: assignedOperatorEmail,
    });
  } catch (error) {
    console.error('[ACL GET Raw Salt] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved Raw Salt analysis record
 * @route   POST /api/raw-salt-analysis/:id/retry-email
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
      record = rawSaltRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Raw Salt analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'ACL',
      analysisType: record.analysisType || 'Raw Salt Analysis',
      unit: 'Raw Salt',
      shift: 'Day',
      date: record.date,
      data: record.data || record,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json({
      success: result.success,
      emailSent: result.emailSent,
      emailStatus: result.emailStatus,
      emailRecipient: result.recipient || result.data?.emailRecipient || '',
      error: result.error,
    });
  } catch (error) {
    console.error('[Raw Salt Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
