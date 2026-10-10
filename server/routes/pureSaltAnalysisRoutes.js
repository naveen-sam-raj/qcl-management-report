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

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.errors[0], errors: validation.errors });
    }

    if (!payload.date) {
      return res.status(400).json({ success: false, message: 'Analysis date is required.' });
    }

    const plantTarget = payload.plant || 'ACL Plant';
    const targetRows = ['rawSalt', 'shift1', 'shift2', 'shift3', 'composition'];
    const newlySavedShifts = [];
    let savedRecord;

    const query = {
      date: payload.date,
      plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: payload.analysisType || 'Pure Salt Analysis',
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingRecord = await PureSaltAnalysis.findOne(query);

    // Instead of checking non-zero values, check if the frontend actually sent any numbers (including 0)
    const hasData = (rowObj) => rowObj && Object.values(rowObj).some(val => val !== null && val !== '');
    
    const isDiff = (oldRow, newRow) => {
      if (!oldRow && newRow) return true;
      if (oldRow && !newRow) return false;
      return Object.keys(newRow).some(k => {
        let oldVal = oldRow[k] ?? null;
        let newVal = newRow[k] ?? null;
        if (newVal === '') newVal = null;
        return oldVal !== newVal;
      });
    };

    if (existingRecord) {
      const willSave = {};
      
      // Check if user is trying to edit locked shifts
      for (const key of targetRows) {
        if (hasData(payload.rows[key]) && existingRecord.lockedShifts[key]) {
          if (isDiff(existingRecord.rows[key], payload.rows[key])) {
             return res.status(400).json({ success: false, message: `Cannot edit ${key} because it is locked.` });
          }
        }
      }

      for (const key of targetRows) {
        if (hasData(payload.rows[key]) && isDiff(existingRecord.rows[key], payload.rows[key]) && !existingRecord.lockedShifts[key]) {
          willSave[key] = true;
        }
      }

      let newS1Saved = existingRecord.lockedShifts.shift1Saved || willSave.shift1;
      let newS2Saved = existingRecord.lockedShifts.shift2Saved || willSave.shift2;
      let newS3Saved = existingRecord.lockedShifts.shift3Saved || willSave.shift3;

      if (willSave.shift2 && !newS1Saved) {
        return res.status(400).json({ success: false, message: 'Cannot save II SHIFT before I SHIFT is saved.' });
      }
      if (willSave.shift3 && !newS2Saved) {
        return res.status(400).json({ success: false, message: 'Cannot save III SHIFT before II SHIFT is saved.' });
      }
      if (willSave.shift3 && existingRecord.lockedShifts.shift3Saved && (existingRecord.lockedShifts.shift3Edits || 0) >= 1) {
        return res.status(400).json({ success: false, message: 'III SHIFT has already reached its maximum edit limit.' });
      }

      for (const key of targetRows) {
        if (willSave[key]) {
          existingRecord.rows[key] = payload.rows[key];
          newlySavedShifts.push(key);
        }
      }

      if (newlySavedShifts.length === 0) {
        return res.status(400).json({ success: false, message: 'No unlocked shifts with valid new data were found to save.' });
      }

      if (willSave.rawSalt) existingRecord.lockedShifts.rawSalt = true;
      if (willSave.composition) existingRecord.lockedShifts.composition = true;
      
      if (willSave.shift1) existingRecord.lockedShifts.shift1Saved = true;
      if (willSave.shift2) existingRecord.lockedShifts.shift2Saved = true;
      if (willSave.shift3) {
         if (!existingRecord.lockedShifts.shift3Saved) {
           existingRecord.lockedShifts.shift3Saved = true;
         } else {
           existingRecord.lockedShifts.shift3Edits = (existingRecord.lockedShifts.shift3Edits || 0) + 1;
         }
      }

      if (existingRecord.lockedShifts.shift2Saved) existingRecord.lockedShifts.shift1 = true;
      if (existingRecord.lockedShifts.shift3Saved) existingRecord.lockedShifts.shift2 = true;
      if (existingRecord.lockedShifts.shift3Saved && (existingRecord.lockedShifts.shift3Edits || 0) >= 1) {
        existingRecord.lockedShifts.shift3 = true;
      }

      existingRecord.markModified('rows');
      existingRecord.markModified('lockedShifts');
      existingRecord.submittedBy = req.user?.name || payload.submittedBy || 'Plant Operator';
      existingRecord.submittedById = req.user?._id || null;
      existingRecord.savedAt = new Date();
      savedRecord = await existingRecord.save();
    } else {
      const willSave = {};
      const lockedShifts = {
        rawSalt: false, shift1: false, shift2: false, shift3: false, composition: false,
        shift1Saved: false, shift2Saved: false, shift3Saved: false, shift3Edits: 0
      };

      for (const key of targetRows) {
        if (hasData(payload.rows[key])) {
          willSave[key] = true;
        }
      }

      if (willSave.shift2 && !willSave.shift1) {
        return res.status(400).json({ success: false, message: 'Cannot save II SHIFT before I SHIFT is saved.' });
      }
      if (willSave.shift3 && !willSave.shift2) {
        return res.status(400).json({ success: false, message: 'Cannot save III SHIFT before II SHIFT is saved.' });
      }

      for (const key of targetRows) {
        if (willSave[key]) {
          newlySavedShifts.push(key);
          if (key === 'rawSalt') lockedShifts.rawSalt = true;
          if (key === 'composition') lockedShifts.composition = true;
          if (key === 'shift1') lockedShifts.shift1Saved = true;
          if (key === 'shift2') lockedShifts.shift2Saved = true;
          if (key === 'shift3') lockedShifts.shift3Saved = true;
        }
      }

      if (lockedShifts.shift2Saved) lockedShifts.shift1 = true;
      if (lockedShifts.shift3Saved) lockedShifts.shift2 = true;

      if (newlySavedShifts.length === 0) {
        return res.status(400).json({ success: false, message: 'No data provided to save.' });
      }

      savedRecord = await PureSaltAnalysis.create({
        date: payload.date,
        plant: plantTarget,
        analysisType: payload.analysisType || 'Pure Salt Analysis',
        shift: payload.shift || 'All Shifts (I, II, III)',
        rows: payload.rows,
        company: req.user?.company?._id || req.user?.company || null,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        lockedShifts
      });
    }

    analysisRecords.unshift(savedRecord.toObject ? savedRecord.toObject() : savedRecord);

    // ── 4. Execute Centralized Save -> Timestamp -> Assigned User -> Excel -> Nodemailer Workflow ──
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
    
    // Fire and forget - do not await! Dispatch one email per newly saved shift.
    newlySavedShifts.forEach(shiftKey => {
      executeSaveAndEmailWorkflow({
        plantIdentifier: plantTarget,
        analysisType: 'Pure Salt Analysis',
        unit: '',
        shift: shiftDisplayNames[shiftKey],
        date: payload.date,
        data: payload.rows,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id || null,
        company: req.user?.company?._id || req.user?.company || null,
        explicitRecord: savedRecord,
        rawBody: payload,
      }).catch(err => console.warn(`[AutoPlantEmail] Exception in background workflow for ${shiftKey}:`, err.message));
    });

    return res.status(201).json({
      success: true,
      message: `Successfully saved ${newlySavedShifts.length} shift(s)`,
      data: savedRecord,
      emailStatus: 'processing',
      newlySavedShifts
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
