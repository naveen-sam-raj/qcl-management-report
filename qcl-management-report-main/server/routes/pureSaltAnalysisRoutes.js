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
    const { primaryEmail: assignedEmail, assignedUser } = await getPlantAssignedUser(plantTarget, { analysisType: 'Pure Salt Analysis' });
    const recipientEmail = assignedEmail || payload.email || payload.recipientEmail || '';

    const newAnalysisData = {
      date: payload.date,
      plant: payload.plant || 'ACL Plant',
      analysisType: payload.analysisType || 'Pure Salt Analysis',
      shift: payload.shift || 'All Shifts (I, II, III)',
      rows: payload.rows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      company: req.user?.company?._id || req.user?.company || null,
      emailRecipient: recipientEmail,
      emailStatus: 'Pending',
      reportFileName,
    };

    // ── 3. Save to MongoDB Atlas First (MANDATORY BEFORE EMAIL) ───────────
    let savedRecord = null;
    try {
      if (PureSaltAnalysis && typeof PureSaltAnalysis.create === 'function') {
        savedRecord = await PureSaltAnalysis.create(newAnalysisData);
        if (savedRecord && typeof savedRecord.toObject === 'function') {
          savedRecord = savedRecord.toObject();
        }
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
    analysisRecords.unshift(savedRecord);

    // ── 4. Generate Real Excel (.xlsx) Report via ExcelJS ─────────────────
    let excelResult = null;
    try {
      excelResult = await generatePureSaltAnalysisExcel({
        ...savedRecord,
        date: payload.date,
        plant: payload.plant || 'ACL Plant',
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedAt: new Date().toLocaleString('en-IN'),
        rows: payload.rows,
      });
    } catch (excelErr) {
      console.error('[PureSaltAnalysis] Excel generation error:', excelErr);
      // MongoDB record is preserved!
      return res.status(200).json({
        success: true,
        emailSent: false,
        message: 'Data saved, but report generation failed.',
        data: savedRecord,
        excelError: excelErr.message,
      });
    }

    // ── 5. Send Email with .xlsx Attachment via Nodemailer ─────────────────
    let emailSent = false;
    let emailErrorMessage = null;

    if (recipientEmail && excelResult?.buffer) {
      try {
        const emailSendResult = await sendPureSaltAnalysisReport({
          recipientEmail,
          date: payload.date,
          plant: payload.plant || 'ACL Plant',
          shift: payload.shift || 'All Shifts (I, II, III)',
          reportType: 'Pure Salt Analysis',
          excelBuffer: excelResult.buffer,
          excelFileName: excelResult.filename,
        });

        if (emailSendResult.success) {
          emailSent = true;
          // Update email status in MongoDB
          if (savedRecord._id && PureSaltAnalysis.findByIdAndUpdate) {
            await PureSaltAnalysis.findByIdAndUpdate(savedRecord._id, { emailStatus: 'Sent' });
            savedRecord.emailStatus = 'Sent';
          }
        } else {
          emailErrorMessage = emailSendResult.error || 'Nodemailer dispatch failed';
          if (savedRecord._id && PureSaltAnalysis.findByIdAndUpdate) {
            await PureSaltAnalysis.findByIdAndUpdate(savedRecord._id, { emailStatus: 'Failed' });
            savedRecord.emailStatus = 'Failed';
          }
        }
      } catch (mailErr) {
        console.error('[PureSaltAnalysis] Email sending exception:', mailErr);
        emailErrorMessage = mailErr.message;
        if (savedRecord._id && PureSaltAnalysis.findByIdAndUpdate) {
          await PureSaltAnalysis.findByIdAndUpdate(savedRecord._id, { emailStatus: 'Failed' });
          savedRecord.emailStatus = 'Failed';
        }
      }
    }

    // ── 6. Log Activity ──────────────────────────────────────────────────
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'PURE_SALT_ANALYSIS_SAVED',
          user: req.user?._id || null,
          userName: req.user?.name || 'Plant Operator',
          userEmail: req.user?.email || '',
          role: req.user?.role || 'company_admin',
          company: req.user?.company?._id || req.user?.company || null,
          details: `Pure Salt Analysis saved for date: ${payload.date}. Excel report generated: ${excelResult.filename}. Email recipient: ${recipientEmail || 'N/A'}. Emailed: ${emailSent}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log activity:', logErr.message);
    }

    // ── 7. Return Result to Frontend ─────────────────────────────────────
    if (emailSent) {
      return res.status(201).json({
        success: true,
        emailSent: true,
        message: 'Saved & Emailed Successfully ✓',
        data: savedRecord,
        excel: {
          fileName: excelResult.filename,
          base64: excelResult.base64,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: excelResult.buffer.length,
        },
      });
    } else {
      // MongoDB save succeeded and Excel generated, but email sending failed
      return res.status(201).json({
        success: true,
        emailSent: false,
        message: 'Data saved and Excel generated, but email sending failed.',
        data: savedRecord,
        emailError: emailErrorMessage,
        excel: {
          fileName: excelResult.filename,
          base64: excelResult.base64,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: excelResult.buffer.length,
        },
      });
    }
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
    const { recipientEmail } = req.body;

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
    const plantTarget = record.plant || 'ACL Plant';
    const { primaryEmail: assignedEmail } = await getPlantAssignedUser(plantTarget, { analysisType: 'Pure Salt Analysis' });
    const targetEmail = assignedEmail || recipientEmail || record.emailRecipient;

    const emailSendResult = await sendPureSaltAnalysisReport({
      recipientEmail: targetEmail,
      date: record.date,
      plant: record.plant,
      shift: record.shift,
      reportType: 'Pure Salt Analysis',
      excelBuffer: excelResult.buffer,
      excelFileName: excelResult.filename,
    });

    if (emailSendResult.success) {
      if (PureSaltAnalysis.findByIdAndUpdate) {
        await PureSaltAnalysis.findByIdAndUpdate(id, {
          emailStatus: 'Sent',
          emailRecipient: targetEmail,
        });
      }
      return res.status(200).json({
        success: true,
        emailSent: true,
        message: 'Saved & Emailed Successfully ✓',
      });
    } else {
      return res.status(400).json({
        success: false,
        emailSent: false,
        message: 'Data saved and Excel generated, but email sending failed.',
        error: emailSendResult.error,
      });
    }
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
    const { date, startDate, endDate } = req.query;
    let records = [];

    if (PureSaltAnalysis && typeof PureSaltAnalysis.find === 'function') {
      const query = {};
      if (date) query.date = date;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
      }
      records = await PureSaltAnalysis.find(query).sort({ createdAt: -1 }).limit(100);
    }

    // Merge or fallback with in-memory records
    if (!records || records.length === 0) {
      records = [...analysisRecords];
      if (date) {
        records = records.filter((r) => r.date === date);
      } else if (startDate || endDate) {
        if (startDate) records = records.filter((r) => r.date >= startDate);
        if (endDate) records = records.filter((r) => r.date <= endDate);
      }
    }

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
