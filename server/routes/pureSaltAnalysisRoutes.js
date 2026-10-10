const express = require('express');
const router = express.Router();
const { PureSaltAnalysis, ActivityLog } = require('../models');
const { validateAnalysisPayload } = require('../services/analysisValidation');
const { generatePureSaltAnalysisExcel } = require('../services/excelService');
const { sendPureSaltAnalysisReport } = require('../services/emailService');
const { getPlantAssignedUser, sendPlantUpdateNotification } = require('../services/plantNotificationService');
const { protect } = require('../middleware/auth');

// In-memory fallback array for resilient offline operation
const analysisRecords = [];

/**
 * @desc    Save Pure Salt Analysis data, generate Excel .xlsx report, and send email with attachment via Nodemailer
 * @route   POST /api/pure-salt-analysis
 * @access  Private (Plant Operators / Admins)
 */
router.post('/', protect, async (req, res) => {
  try {
    const payload = req.body;

    // ── 1. Validate payload (respects PURE_SALT_LIMIT_VALIDATION_ENABLED feature flag) ──
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || 'Validation failed. Please verify submitted data.',
        errors: validation.errors,
        errorDetails: validation.errorDetails,
      });
    }

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis date is required.',
      });
    }

    // ── 2. Format filename & document structure ───────────────────────────
    const formattedDate = payload.date.includes('-')
      ? payload.date.split('-').length === 3 && payload.date.split('-')[0].length === 4
        ? `${payload.date.split('-')[2]}-${payload.date.split('-')[1]}-${payload.date.split('-')[0]}`
        : payload.date
      : payload.date;

    const reportFileName = `ACL_Plant_Pure_Salt_Analysis_${formattedDate}.xlsx`;

    // ── Dynamic Plant-Wise User Resolution from MongoDB ──
    const plantTarget = payload.plant || 'ACL Plant';
    const { primaryEmail: assignedEmail } = await getPlantAssignedUser(plantTarget, { analysisType: 'Pure Salt Analysis' });

    const newAnalysisData = {
      date: payload.date,
      plant: payload.plant || 'ACL Plant',
      analysisType: payload.analysisType || 'Pure Salt Analysis',
      shift: payload.shift || 'All Shifts (I, II, III)',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      company: req.user?.company?._id || req.user?.company || null,
      emailRecipient: assignedEmail || '',
      emailStatus: 'pending',
      savedAt: new Date(),
    };

    // ── 3. Save to MongoDB Atlas First (MANDATORY BEFORE EMAIL) ───────────
    let savedRecord = null;
    try {
      if (PureSaltAnalysis && typeof PureSaltAnalysis.create === 'function') {
        savedRecord = await PureSaltAnalysis.create(newAnalysisData);
      } else {
        savedRecord = {
          _id: 'psa_' + Date.now(),
          ...newAnalysisData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } catch (dbErr) {
      console.error('[PureSaltAnalysis] Database Save Failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Unable to save the data. Please try again.',
        error: dbErr.message,
      });
    }

    // Cache in memory array as well
    analysisRecords.unshift(savedRecord.toObject ? savedRecord.toObject() : savedRecord);

    // ── 4. Execute Centralized Save -> Timestamp -> Assigned User -> Excel -> Nodemailer Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    
    // Fire and forget - do not await!
    executeSaveAndEmailWorkflow({
      plantIdentifier: plantTarget,
      analysisType: 'Pure Salt Analysis',
      unit: '',
      shift: payload.shift || 'All Shifts (I, II, III)',
      date: payload.date,
      data: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      company: req.user?.company?._id || req.user?.company || null,
      explicitRecord: savedRecord,
      rawBody: payload,
    }).catch(err => console.warn('[AutoPlantEmail] Exception in background workflow:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Analysis data saved successfully',
      data: savedRecord,
      emailStatus: 'processing'
    });
  } catch (error) {
    console.error('[PureSaltAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to save the data. Please try again.',
      error: error.message,
    });
  }
});

/**
 * @desc    Retry sending email with Excel report for an existing saved analysis record
 * @route   POST /api/pure-salt-analysis/:id/retry-email
 * @access  Private
 */
router.post('/:id/retry-email', protect, async (req, res) => {
  try {
    const { id } = req.params;

    let record = null;
    if (PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
      record = await PureSaltAnalysis.findById(id);
    }
    if (!record) {
      record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Analysis record not found.' });
    }

    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: record.plant || 'ACL Plant',
      analysisType: record.analysisType || 'Pure Salt Analysis',
      unit: record.unit || '',
      shift: record.shift || 'All Shifts',
      date: record.date,
      data: record.rows || record.data,
      submittedBy: record.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: req.user?._id || record.submittedById,
      company: req.user?.company?._id || req.user?.company || record.company,
      explicitRecord: record,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json(result);
  } catch (error) {
    console.error('[Retry Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @desc    Direct download of generated Excel file for a record
 * @route   GET /api/pure-salt-analysis/:id/download-excel
 * @access  Private
 */
router.get('/:id/download-excel', protect, async (req, res) => {
  try {
    const { id } = req.params;
    let record = null;

    if (PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
      record = await PureSaltAnalysis.findById(id);
    }
    if (!record) {
      record = analysisRecords.find((r) => (r._id || r.id).toString() === id.toString());
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Analysis record not found.' });
    }

    const excelResult = await generatePureSaltAnalysisExcel(record);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
    return res.send(excelResult.buffer);
  } catch (error) {
    console.error('[PureSaltAnalysis] Error downloading Excel:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @desc    Retrieve Pure Salt Analysis records from MongoDB Atlas
 * @route   GET /api/pure-salt-analysis
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const { date } = req.query;
    const { PureSaltAnalysis } = require('../models');

    if (date) {
      const query = { date, plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Analysis' };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PureSaltAnalysis.findOne(query).sort({ createdAt: -1 }).lean();
      
      if (doc) {
        return res.status(200).json({
          success: true,
          data: [doc]
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('[PureSalt GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
