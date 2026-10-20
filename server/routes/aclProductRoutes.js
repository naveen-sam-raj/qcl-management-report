const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for ACL Product records
const aclProductRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit ACL Product Analysis data (Chemical & BSS Sieve specs)
 * @route   POST /api/acl-product
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save ACL Product Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: ACL Product Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const { chemical = {}, bss = {} } = payload;
    const errors = [];

    // Validate chemical values
    Object.entries(chemical).forEach(([key, val]) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Chemical parameter '${key.toUpperCase()}' must be a valid number.`);
      }
    });

    // Validate BSS values
    Object.entries(bss).forEach(([key, val]) => {
      if (val === '' || val === null || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`BSS parameter '${key}' must be a valid number.`);
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    const hasChemData = Object.values(chemical).some((v) => v !== '' && v !== null && v !== undefined);
    const hasBssData = Object.values(bss).some((v) => v !== '' && v !== null && v !== undefined);
    if (!hasChemData && !hasBssData) {
      return res.status(400).json({
        success: false,
        message: 'Please enter at least one measurement value for chemical or sieve parameters.',
      });
    }

    // Calculate Total Sieve Recovery (sum of all 9 mesh values)
    const meshKeys = ['p6', 'p8', 'p12', 'p16', 'p18', 'p44', 'p60', 'p100', 'm100'];
    const totalSieve = meshKeys.reduce((acc, k) => {
      const v = parseFloat(bss[k]);
      return !isNaN(v) ? acc + v : acc;
    }, 0);
    bss.totalSieveRecovery = totalSieve.toFixed(2);

    const plantTarget = payload.plant || 'ACL';

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'ACL Product Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingChem = existingData.chemicalData || existingData.chemical || {};
    let existingBss = existingData.bssData || existingData.bss || {};

    let editCount = existingData.editCount !== undefined ? existingData.editCount : (existingData.isSaved ? 1 : 0);
    let isLocked = existingData.isLocked === true;
    let editedFields = existingData.editedFields || {};
    let editAuditHistory = existingData.editAuditHistory || [];

    // 4. Locking Check: Enforce edit limit (1 initial save + 1 final permitted edit = max 2 saves total)
    if (isLocked || editCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'This date’s ACL Product Analysis record is permanently locked. Maximum permitted edits reached.',
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
      // Check chemical parameters
      Object.keys(chemical).forEach((k) => {
        const oVal = existingChem[k];
        const nVal = chemical[k];
        if (isValDiff(oVal, nVal)) {
          editedFields[`chem_${k}`] = true;
          editAuditHistory.push({
            section: 'chemical',
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

      // Check BSS sieve parameters
      Object.keys(bss).forEach((k) => {
        const oVal = existingBss[k];
        const nVal = bss[k];
        if (isValDiff(oVal, nVal)) {
          editedFields[`bss_${k}`] = true;
          editAuditHistory.push({
            section: 'bss',
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
    const saveEventId = `save_aclprod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const updatedRecordData = {
      id: existingData.id || `acl_prod_${Date.now()}`,
      lastSaveEventId: saveEventId,
      date: payload.date,
      plant: plantTarget,
      unit: 'ACL Product',
      frequency: 'Day',
      analysisType: 'ACL Product Analysis',
      chemical,
      chemicalData: chemical,
      bss,
      bssData: bss,
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
        analysisType: 'ACL Product Analysis',
        date: payload.date,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'ACL Product Analysis',
        unit: 'ACL Product',
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
    aclProductRecords.unshift(updatedRecordData);
    if (aclProductRecords.length > 50) aclProductRecords.pop();

    // Log Activity
    try {
      if (ActivityLog && req.user?._id) {
        await ActivityLog.create({
          action: 'ACL_PRODUCT_ANALYSIS_SAVED',
          user: req.user._id,
          userName: req.user.name,
          details: `ACL Product Analysis saved for date: ${payload.date} [Event: ${saveEventId}, Edit #${newEditCount}].`,
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
        analysisType: 'ACL Product Analysis',
        unit: 'ACL Product',
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
      console.warn(`[AutoPlantEmail] Instant workflow note for ACL Product:`, err.message);
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
      message: `Successfully saved ACL Product Analysis in MongoDB ✓`,
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
    console.error('Error in POST /api/acl-product:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save ACL Product Analysis record: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve ACL Product Analysis records
 * @route   GET /api/acl-product
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
        analysisType: 'ACL Product Analysis',
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
    console.error('[ACL GET ACL Product] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved ACL Product analysis record
 * @route   POST /api/acl-product/:id/retry-email
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
