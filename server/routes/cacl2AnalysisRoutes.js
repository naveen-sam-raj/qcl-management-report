const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for CaCl2 Analysis records
const cacl2Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit CaCl2 Analysis data
 * @route   POST /api/cacl2-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save CaCl2 Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: CaCl2 Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    if (readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one sampling row is required to save CaCl2 Analysis.',
      });
    }

    // 3. Validation: Check numeric fields
    const errors = [];
    const numericFields = ['ph', 'conc', 'fnh3', 'cnh3', 'ss'];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      numericFields.forEach((field) => {
        const val = reading[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum}: ${field.toUpperCase()} must be a valid number.`);
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

    const plantTarget = payload.plant || 'ACL';

    // 4. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'CaCl2 Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingReadings = existingData.readings || (Array.isArray(existingData) ? existingData : []);

    let editCount = existingData.editCount !== undefined ? existingData.editCount : (existingData.isSaved ? 1 : 0);
    let isLocked = existingData.isLocked === true;
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    // 5. Locking Check: Enforce edit limit (1 initial save + 1 final permitted edit = max 2 saves total)
    if (isLocked || editCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'This date’s CaCl2 Analysis record is permanently locked. Maximum permitted edits reached.',
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

    // 6. Track Field-Level EDITED Badges & Audit History on subsequent save
    if (!isInitialSave) {
      readings.forEach((newRow, rIdx) => {
        const rowId = newRow.id || `row_${rIdx}`;
        // Find corresponding previous row by ID or index
        const oldRow = existingReadings.find((r) => r.id === rowId) || existingReadings[rIdx];

        if (oldRow) {
          numericFields.forEach((f) => {
            const oVal = oldRow[f];
            const nVal = newRow[f];
            if (isValDiff(oVal, nVal)) {
              editedFields[`${rowId}_${f}`] = true;
              editAuditHistory.push({
                rowId,
                field: f,
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
      });
    }

    // Advance edit counter
    const newEditCount = editCount + 1;
    // Lock record permanently after 2nd save (initial save + 1 edit)
    const newIsLocked = newEditCount >= 2;

    // Generate unique Save Event ID
    const saveEventId = `save_cacl2_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const updatedRecordData = {
      id: existingData.id || `cacl2_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      unit: 'CaCl2',
      frequency: 'Day',
      analysisType: 'CaCl2 Analysis',
      readings,
      isSaved: true,
      editCount: newEditCount,
      isLocked: newIsLocked,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // 7. Persist to MongoDB PlantAnalysisRecord
    const savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
        analysisType: 'CaCl2 Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'CaCl2 Analysis',
        unit: 'CaCl2',
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
    cacl2Records.unshift(updatedRecordData);
    if (cacl2Records.length > 50) cacl2Records.pop();

    // Log Activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          action: 'CACL2_ANALYSIS_SAVED',
          user: req.user._id,
          userName: req.user.name,
          details: `CaCl2 Analysis saved for date: ${payload.date} [Event: ${saveEventId}, Edit #${newEditCount}].`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    // 8. Execute Centralized Save & Email Workflow
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    let lastEmailResult = null;
    let emailTimedOut = false;

    try {
      const emailPromise = executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'CaCl2 Analysis',
        unit: 'CaCl2',
        shift: 'Day',
        date: payload.date,
        data: updatedRecordData,
        submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
        submittedById: req.user?._id || null,
        company: updatedRecordData.company,
        explicitRecord: savedDoc,
        rawBody: payload,
        saveEventId,
      });

      const fastLimit = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 7500));
      const raceResult = await Promise.race([emailPromise, fastLimit]);

      if (raceResult === 'TIMEOUT') {
        emailTimedOut = true;
        emailPromise
          .then((bgRes) => {
            console.log(`[CaCl2 Save] Background email dispatch finished for event ${saveEventId}:`, bgRes?.emailStatus);
          })
          .catch((bgErr) => {
            console.error(`[CaCl2 Save] Background email dispatch error for event ${saveEventId}:`, bgErr.message);
          });
      } else {
        lastEmailResult = raceResult;
      }
    } catch (err) {
      console.warn(`[AutoPlantEmail] Instant workflow note for CaCl2:`, err.message);
      lastEmailResult = { success: false, emailSent: false, emailStatus: 'failed', error: err.message };
    }

    const emailSent = !!(lastEmailResult && (lastEmailResult.emailSent || lastEmailResult.emailStatus === 'sent'));
    const finalEmailStatus = emailTimedOut ? 'pending' : lastEmailResult?.emailStatus || (emailSent ? 'sent' : 'failed');
    const emailRecipient =
      lastEmailResult?.recipient ||
      lastEmailResult?.data?.emailRecipient ||
      savedDoc?.emailRecipient ||
      '';

    return res.status(201).json({
      success: true,
      message: emailSent
        ? `Successfully saved CaCl2 Analysis & email sent ✓`
        : emailTimedOut
        ? `Successfully saved CaCl2 Analysis — Email dispatching immediately 🚀`
        : `Successfully saved CaCl2 Analysis — Email delivery failed: ${lastEmailResult?.error || 'Unknown error'}`,
      data: updatedRecordData,
      recordId: savedDoc?._id || updatedRecordData.id,
      saveEventId,
      emailSent,
      emailPending: emailTimedOut,
      emailStatus: finalEmailStatus,
      emailRecipient,
      emailNotification: lastEmailResult,
    });
  } catch (error) {
    console.error('Error in POST /api/cacl2-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save CaCl2 Analysis record: ' + error.message,
    });
  }
});

/**
 * @desc    Get CaCl2 Analysis data (by date)
 * @route   GET /api/cacl2-analysis
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
        analysisType: 'CaCl2 Analysis',
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
    console.error('[ACL GET CaCl2] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved CaCl2 analysis record
 * @route   POST /api/cacl2-analysis/:id/retry-email
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
      record = cacl2Records.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'CaCl2 analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plantCode || 'ACL',
      analysisType: record.analysisType || 'CaCl2 Analysis',
      unit: 'CaCl2',
      shift: 'Day',
      date: record.date,
      data: record.data || record,
      submittedBy: record.submittedBy || req.user?.name || 'Shift Chemist',
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
    console.error('[CaCl2 Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
