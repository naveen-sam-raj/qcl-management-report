const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for Brine records
const brineRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit Brine Analysis data (TK 109 & TK 110: NaCl, Ca, Mg, SO4)
 * @route   POST /api/brine-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Brine Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Brine Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const { rows = {} } = payload;
    const errors = [];

    // Tanks and parameters definition
    const tanks = ['tk109', 'tk110'];
    const paramKeys = ['nacl', 'ca', 'mg', 'so4'];

    // Validate numeric values if entered
    tanks.forEach((tankKey) => {
      const tankObj = rows[tankKey] || {};
      paramKeys.forEach((paramKey) => {
        const val = tankObj[paramKey];
        if (val === '' || val === null || val === undefined) return;
        const num = Number(val);
        if (isNaN(num)) {
          errors.push(`${tankKey.toUpperCase()} - ${paramKey.toUpperCase()} must be a valid number.`);
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

    const hasData = tanks.some((tankKey) => {
      const tankObj = rows[tankKey] || {};
      return paramKeys.some((k) => tankObj[k] !== '' && tankObj[k] !== null && tankObj[k] !== undefined);
    });

    if (!hasData) {
      return res.status(400).json({
        success: false,
        message: 'Please enter at least one measurement value for TK 109 or TK 110.',
      });
    }

    const plantTarget = payload.plant || 'ACL';

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'Brine Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingRows = existingData.rows || existingData || {};

    let editCount = existingData.editCount !== undefined ? existingData.editCount : (existingData.isSaved ? 1 : 0);
    let isLocked = existingData.isLocked === true;
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    // 4. Locking Check: Enforce edit limit (1 initial save + 1 final permitted edit = max 2 saves total)
    if (isLocked || editCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'This date’s Brine Analysis record is permanently locked. Maximum permitted edits reached.',
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

    // Merge rows: preserve tank data if one tank is saved or partial
    const mergedRows = {
      tk109: {
        nacl: '', ca: '', mg: '', so4: '',
        ...(existingRows.tk109 || {}),
        ...(rows.tk109 || {}),
      },
      tk110: {
        nacl: '', ca: '', mg: '', so4: '',
        ...(existingRows.tk110 || {}),
        ...(rows.tk110 || {}),
      },
    };

    // Normalize format to string or ''
    tanks.forEach((t) => {
      paramKeys.forEach((p) => {
        const v = mergedRows[t][p];
        mergedRows[t][p] = v !== undefined && v !== null && v !== '' ? String(v) : '';
      });
    });

    // 5. Track Field-Level EDITED Badges on subsequent save
    if (!isInitialSave) {
      tanks.forEach((tankKey) => {
        const oldTank = existingRows[tankKey] || {};
        const newTank = mergedRows[tankKey] || {};
        paramKeys.forEach((paramKey) => {
          const oVal = oldTank[paramKey];
          const nVal = newTank[paramKey];
          if (isValDiff(oVal, nVal)) {
            editedFields[`${tankKey}_${paramKey}`] = true;
            editAuditHistory.push({
              tank: tankKey,
              field: paramKey,
              oldValue: oVal !== undefined && oVal !== null ? oVal : null,
              newValue: nVal !== undefined && nVal !== null ? nVal : null,
              editor: req.user?.name || payload.submittedBy || 'Plant Operator',
              editorId: req.user?._id || null,
              date: payload.date,
              timestamp: new Date().toISOString(),
            });
          }
        });
      });
    }

    // Advance edit count
    const newEditCount = editCount + 1;
    // Lock permanently after 2nd save
    const newIsLocked = newEditCount >= 2;

    // Generate unique Save Event ID
    const saveEventId = `save_brine_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const updatedRecordData = {
      id: existingData.id || `brine_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      unit: 'Brine',
      frequency: 'WEEK',
      analysisType: 'Brine Analysis',
      rows: mergedRows,
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
        analysisType: 'Brine Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'Brine Analysis',
        unit: 'Brine',
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
    brineRecords.unshift(updatedRecordData);
    if (brineRecords.length > 50) brineRecords.pop();

    // Log Activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          action: 'BRINE_ANALYSIS_SAVED',
          user: req.user._id,
          userName: req.user.name,
          details: `Brine Analysis saved for date: ${payload.date} (TK 109, TK 110) [Event: ${saveEventId}, Edit #${newEditCount}].`,
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
        analysisType: 'Brine Analysis',
        unit: 'Brine',
        shift: 'WEEK',
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
      console.warn(`[AutoPlantEmail] Instant workflow note for Brine:`, err.message);
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
      message: `Successfully saved Brine Analysis in MongoDB ✓`,
      data: updatedRecordData,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      emailSent: false,
      emailPending: false,
      emailStatus: 'disabled',
      emailRecipient: null,
      emailNotification: null,
    });
  } catch (error) {
    console.error('Error in POST /api/brine-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Brine Analysis record: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve Brine Analysis records
 * @route   GET /api/brine-analysis
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
        analysisType: 'Brine Analysis',
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
    console.error('[ACL GET Brine] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved Brine analysis record
 * @route   POST /api/brine-analysis/:id/retry-email
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
