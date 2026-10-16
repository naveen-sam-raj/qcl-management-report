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

const NUMERIC_FIELDS = ['exCao', 'fnh3', 'cnh3', 'tnh3', 'nahco3'];

// Seed readings from laboratory specifications
const SEED_READINGS = [
  { id: 't0630', time: '06:30', exCao: '00.00', fnh3: '272', cnh3: '1190', tnh3: '1462', nahco3: '0' },
  { id: 't0730', time: '07:30', exCao: '00.00', fnh3: '340', cnh3: '1870', tnh3: '2210', nahco3: '0' },
  { id: 't0830', time: '08:30', exCao: '00.00', fnh3: '425', cnh3: '8330', tnh3: '8755', nahco3: '0' },
  { id: 't0930', time: '09:30', exCao: '00.00', fnh3: '510', cnh3: '4420', tnh3: '4930', nahco3: '0' },
  { id: 't1030', time: '10:30', exCao: '00.00', fnh3: '238', cnh3: '13090', tnh3: '13328', nahco3: '0' },
  { id: 't1130', time: '11:30', exCao: '00.00', fnh3: '442', cnh3: '21250', tnh3: '21692', nahco3: '0' },
];

// In-memory fallback cache
const distillerWasteRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Get Distiller Waste Analysis data
 * @route   GET /api/distiller-waste-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, plant } = req.query;

    // Resolve assigned OFFSITE Plant operator email dynamically from registered database records
    let assignedOperatorEmail = null;
    try {
      const companyId = req.user?.company?._id || req.user?.company || null;
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('OFFSITE', { company: companyId });
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (recipErr) {
      console.warn('[DistillerWaste GET] Operator recipient resolution note:', recipErr.message);
      assignedOperatorEmail = null;
    }

    if (date) {
      try {
        const query = {
          date,
          analysisType: 'Distiller Waste Analysis',
          plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
        };
        if (req.user && req.user.company) {
          query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
        }

        const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
        if (doc && doc.data) {
          const payloadData = doc.data;
          const readings = payloadData.readings || payloadData.shifts || payloadData.rows || [];
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
              readings: readings || [],
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: doc.emailStatus || 'pending',
              emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[DistillerWaste GET] MongoDB lookup note:', dbErr.message);
      }

      const match = distillerWasteRecords.find((r) => r.date === date);
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

    // List query
    try {
      const query = {
        analysisType: 'Distiller Waste Analysis',
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
      console.warn('[DistillerWaste GET list] MongoDB note:', listErr.message);
    }

    return res.status(200).json({
      success: true,
      count: distillerWasteRecords.length,
      data: distillerWasteRecords,
    });
  } catch (error) {
    console.error('[DistillerWaste GET] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving Distiller Waste records: ' + error.message,
    });
  }
});

/**
 * @desc    Save Distiller Waste Analysis data (Hourly Monitoring)
 * @route   POST /api/distiller-waste-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const todayKolkata = getTodayKolkata();

    if (!payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Distiller Waste Analysis.',
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';

    // Backend Date Restriction Enforcement (Asia/Kolkata)
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction policy: Distiller Waste Analysis can only be submitted for today (${todayKolkata}). Historical or future date entry (${payload.date}) is not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    if (readings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one analytical reading row is required.',
      });
    }

    const errors = [];
    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      NUMERIC_FIELDS.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`Row #${rowNum} (${reading.time || ''}): ${f.toUpperCase()} must be a valid number.`);
          }
        }
      });

      // Auto-calculate TNH3 = FNH3 + CNH3 if modifying FNH3 or CNH3
      if (reading.fnh3 !== '' && reading.cnh3 !== '' && !isNaN(Number(reading.fnh3)) && !isNaN(Number(reading.cnh3))) {
        reading.tnh3 = String(Number(reading.fnh3) + Number(reading.cnh3));
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter numeric values only.',
        errors,
      });
    }

    // Prevent duplicate time slots
    const timeSlots = readings.map((r) => String(r.time || '').trim()).filter(Boolean);
    const uniqueSlots = new Set(timeSlots);
    if (timeSlots.length !== uniqueSlots.size) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate sampling time slots detected. Each observation must have a unique time slot.',
      });
    }

    // Fetch existing record in MongoDB
    const query = {
      date: payload.date,
      analysisType: 'Distiller Waste Analysis',
      plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company._id || req.user.company }, { company: null }];
    }

    const existingDoc = await PlantAnalysisRecord.findOne(query);

    let editedFields = {};
    let editAuditHistory = [];
    let oldReadings = [];
    let lockedSlots = {};

    if (existingDoc && existingDoc.data) {
      editedFields = { ...(existingDoc.data.editedFields || {}) };
      editAuditHistory = [...(existingDoc.data.editAuditHistory || [])];
      oldReadings = existingDoc.data.readings || existingDoc.data.shifts || [];
      lockedSlots = { ...(existingDoc.data.lockedSlots || {}) };
    }

    // Check Slot-Level Lock Violations (Each slot allows exactly 1 edit after initial save)
    for (const newRow of readings) {
      const slotKey = newRow.id || newRow.time;
      const oldRow = oldReadings.find((r) => (r.id && r.id === newRow.id) || r.time === newRow.time);
      if (oldRow) {
        const slotHasDiff = NUMERIC_FIELDS.some((f) => isValDiff(oldRow[f], newRow[f]));
        if (slotHasDiff && lockedSlots[slotKey]?.isLocked) {
          return res.status(400).json({
            success: false,
            message: `Sampling slot ${newRow.time} has exhausted its permitted edit and is permanently locked.`,
          });
        }
      }
    }

    // Field-level edit audit
    const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
    const nowIso = new Date().toISOString();

    if (existingDoc && existingDoc.data) {
      readings.forEach((newRow, idx) => {
        const rowId = newRow.id || `row_${idx}`;
        const oldRow = oldReadings.find((r) => r.id === rowId || r.time === newRow.time);

        if (oldRow) {
          NUMERIC_FIELDS.forEach((f) => {
            const oldVal = oldRow[f];
            const newVal = newRow[f];

            if (isValDiff(oldVal, newVal)) {
              const fieldKey = `${rowId}_${f}`;
              editedFields[fieldKey] = true;
              editAuditHistory.push({
                rowId,
                time: newRow.time,
                field: f,
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

    // Update lockedSlots state machine
    readings.forEach((newRow) => {
      const slotKey = newRow.id || newRow.time;
      const hasDataInSlot = NUMERIC_FIELDS.some((f) => newRow[f] !== '' && newRow[f] !== null && newRow[f] !== undefined);
      if (hasDataInSlot) {
        const oldRow = oldReadings.find((r) => (r.id && r.id === newRow.id) || r.time === newRow.time);
        const slotDiff = oldRow && NUMERIC_FIELDS.some((f) => isValDiff(oldRow[f], newRow[f]));
        const prevSlot = lockedSlots[slotKey] || { initialSaved: false, editCount: 0, isLocked: false };

        if (prevSlot.initialSaved && slotDiff) {
          const nextEdits = (prevSlot.editCount || 0) + 1;
          lockedSlots[slotKey] = {
            initialSaved: true,
            editCount: nextEdits,
            isLocked: nextEdits >= 1,
          };
        } else if (!prevSlot.initialSaved) {
          lockedSlots[slotKey] = {
            initialSaved: true,
            editCount: 0,
            isLocked: false,
          };
        }
      }
    });

    const recordData = {
      id: existingDoc ? String(existingDoc._id) : `distiller_${Date.now()}`,
      date: payload.date,
      plant: 'OFFSET',
      plantCode: 'OFFSITE',
      plantName: 'OFFSITE Plant',
      unit: payload.unit || 'Distiller waste',
      analysisType: 'Distiller Waste Analysis',
      readings,
      lockedSlots,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // Update in-memory fallback
    const memIdx = distillerWasteRecords.findIndex((r) => r.date === payload.date);
    if (memIdx >= 0) {
      distillerWasteRecords[memIdx] = { ...distillerWasteRecords[memIdx], ...recordData };
    } else {
      distillerWasteRecords.unshift(recordData);
    }

    // Persist to MongoDB
    let savedRecord = null;
    try {
      savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
        query,
        {
          plantName: 'OFFSITE Plant',
          plantCode: 'OFFSITE',
          analysisType: 'Distiller Waste Analysis',
          unit: 'Distiller waste',
          date: payload.date,
          shift: '1 Hour Once',
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
      console.error('[DistillerWaste POST] MongoDB save error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Execute Email Workflow
    const saveEventId = `save_distiller_${Date.now()}`;
    let emailResult = { success: false, emailStatus: 'pending' };

    try {
      emailResult = await executeSaveAndEmailWorkflow({
        plantIdentifier: 'OFFSITE',
        analysisType: 'Distiller Waste Analysis',
        unit: 'Distiller waste',
        shift: '1 Hour Once',
        date: payload.date,
        data: recordData,
        submittedBy: recordData.submittedBy,
        submittedById: recordData.submittedById,
        company: recordData.company,
        explicitRecord: savedRecord,
        rawBody: { ...payload, ...recordData },
        saveEventId,
        isTestMode,
      });
    } catch (notifyErr) {
      console.warn('[DistillerWaste POST] Email notification dispatch note:', notifyErr.message);
      emailResult = {
        success: false,
        emailStatus: 'failed',
        error: notifyErr.message,
      };
    }

    const isEmailDelivered = emailResult.emailSent === true || (emailResult.success === true && emailResult.emailStatus === 'sent');
    const emailStatus = emailResult.emailStatus || (isEmailDelivered ? 'sent' : 'failed');
    const emailRecipient = emailResult.recipient || savedRecord.emailRecipient || null;

    // Activity Log
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'DISTILLER_WASTE_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `Distiller Waste Analysis saved for date: ${payload.date}. Email ${emailStatus} to ${emailRecipient || 'N/A'}.`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {}

    return res.status(200).json({
      success: true,
      message: isEmailDelivered
        ? 'Distiller Waste Analysis saved and email sent successfully.'
        : 'Distiller Waste Analysis saved successfully in MongoDB. Email delivery failed: ' + (emailResult.error || emailResult.emailError || emailResult.message || 'No registered recipient available'),
      recordId: savedRecord._id,
      emailStatus,
      emailRecipient,
      emailMessageId: emailResult.messageId || '',
      emailError: isEmailDelivered ? undefined : (emailResult.error || emailResult.emailError || emailResult.message),
      editedFields,
      editAuditHistory,
      data: recordData,
    });
  } catch (error) {
    console.error('[DistillerWaste POST] Uncaught error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing Distiller Waste analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry email notification for Distiller Waste Analysis
 * @route   POST /api/distiller-waste-analysis/:id/retry-email
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

    // Do not resend duplicate notifications if already confirmed successful
    if (record.emailStatus === 'sent') {
      return res.status(200).json({
        success: true,
        alreadySent: true,
        emailSent: true,
        emailStatus: 'sent',
        emailRecipient: record.emailRecipient || null,
        message: `Notification email has already been successfully sent to ${record.emailRecipient}.`,
      });
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || req.headers['x-test-mode'] === 'true';
    const retryEventId = `retry_distiller_${Date.now()}`;
    const emailResult = await executeSaveAndEmailWorkflow({
      plantIdentifier: 'OFFSITE',
      analysisType: record.analysisType || 'Distiller Waste Analysis',
      unit: record.unit || 'Distiller waste',
      shift: record.shift || '1 Hour Once',
      date: record.date,
      data: record.data,
      submittedBy: req.user?.name || record.submittedBy,
      submittedById: req.user?._id || record.submittedById,
      company: record.company,
      explicitRecord: record,
      rawBody: record.data,
      saveEventId: retryEventId,
      isTestMode,
    });

    const isEmailDelivered = emailResult.emailSent === true || (emailResult.success === true && emailResult.emailStatus === 'sent');
    const status = isEmailDelivered ? 'sent' : 'failed';
    record.emailStatus = status;
    if (emailResult.recipient) record.emailRecipient = emailResult.recipient;
    await record.save();

    return res.status(200).json({
      success: true,
      emailSent: isEmailDelivered,
      emailStatus: status,
      emailRecipient: record.emailRecipient || null,
      emailError: isEmailDelivered ? undefined : (emailResult.error || emailResult.emailError || emailResult.message),
      message: isEmailDelivered
        ? `Notification email successfully sent to ${record.emailRecipient}.`
        : `Email retry failed: ${emailResult.error || emailResult.emailError || emailResult.message || 'Delivery rejected'}.`,
    });
  } catch (error) {
    console.error('[DistillerWaste Retry Email] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during email retry: ' + error.message,
    });
  }
});

module.exports = router;
