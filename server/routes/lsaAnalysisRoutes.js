const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

// In-memory cache storage for LSA Shift Analysis records
const lsaShiftRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit SA Plant LSA Shift Analysis data
 * @route   POST /api/lsa-analysis & /api/lsa-shift-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA Shift Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: LSA Shift Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const incomingShifts = payload.shifts || payload.rows || payload.data?.shifts || {};
    const errors = [];
    const numericFields = ['na2co3', 'nacl', 'fe', 'na2so4', 'vm', 'ir', 'bd', 'turbidity'];
    const shiftKeys = ['iShift', 'iiShift', 'iiiShift', 'composite'];

    shiftKeys.forEach((sKey) => {
      const sData = incomingShifts[sKey];
      if (sData && typeof sData === 'object') {
        numericFields.forEach((field) => {
          const val = sData[field];
          if (val !== '' && val !== null && val !== undefined) {
            if (isNaN(Number(val))) {
              errors.push(`${sKey} -> ${field.toUpperCase()} must be a valid number.`);
            }
          }
        });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter valid numbers only.',
        errors,
      });
    }

    // 3. Query existing record in MongoDB for today's date
    const query = {
      date: payload.date,
      plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
      analysisType: {
        $in: [
          'LSA Shift Analysis',
          'LSA Shift',
          'LSA Analysis',
          'LSA SHIFT ANALYSIS',
        ],
      },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingShifts = existingData.shifts || existingDoc?.shifts || {};

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
    const saveEventId = `lsa_shift_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const shiftDisplayNames = {
      iShift: 'I SHIFT',
      iiShift: 'II SHIFT',
      iiiShift: 'III SHIFT',
      composite: 'COMPOSITE',
    };

    const paramDisplayNames = {
      na2co3: 'Na₂CO₃',
      nacl: 'NaCl',
      fe: 'Fe',
      na2so4: 'Na₂SO₄',
      vm: 'VM',
      ir: 'IR',
      bd: 'BD',
      turbidity: 'TURBIDITY',
    };

    // Merged shifts preserving existing shift entries
    const mergedShifts = {
      iShift: { ...(existingShifts.iShift || {}) },
      iiShift: { ...(existingShifts.iiShift || {}) },
      iiiShift: { ...(existingShifts.iiiShift || {}) },
      composite: { ...(existingShifts.composite || {}) },
    };

    shiftKeys.forEach((sKey) => {
      if (incomingShifts[sKey] && typeof incomingShifts[sKey] === 'object') {
        const incData = incomingShifts[sKey];
        const oldData = existingShifts[sKey] || {};

        numericFields.forEach((fieldKey) => {
          if (incData[fieldKey] !== undefined) {
            const oldVal = oldData[fieldKey];
            const newVal = incData[fieldKey];

            if (isValDiff(oldVal, newVal) && oldVal !== undefined && oldVal !== null && oldVal !== '') {
              if (!editedFields[sKey]) editedFields[sKey] = {};
              editedFields[sKey][fieldKey] = true;

              editAuditHistory.push({
                date: payload.date,
                shift: shiftDisplayNames[sKey] || sKey,
                shiftKey: sKey,
                field: fieldKey,
                fieldName: paramDisplayNames[fieldKey] || fieldKey,
                oldValue: oldVal,
                newValue: newVal,
                editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
                timestamp: nowIso,
                saveEventId,
              });
            }

            mergedShifts[sKey][fieldKey] = newVal === '' ? '' : newVal;
          }
        });
      }
    });

    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `lsa_shift_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      unit: 'LSA',
      section: 'Soda Ash Production',
      analysisType: 'LSA Shift Analysis',
      shifts: mergedShifts,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: nowIso,
      company: req.user?.company?._id || (mongoose.Types.ObjectId.isValid(req.user?.company) ? req.user?.company : null),
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
              'LSA Shift Analysis',
              'LSA Shift',
              'LSA Analysis',
              'LSA SHIFT ANALYSIS',
            ],
          },
          date: payload.date,
        },
        {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'LSA Shift Analysis',
          unit: 'LSA',
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
    } catch (dbErr) {
      console.error('[LSA Shift Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Update in-memory cache
    const cachedIdx = lsaShiftRecords.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      lsaShiftRecords[cachedIdx] = recordPayload;
    } else {
      lsaShiftRecords.unshift(recordPayload);
    }

    // 5. Asynchronous Email Dispatch via Centralized Workflow
    // Audit log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'SAVE_ANALYSIS',
          module: 'PLANT_ANALYSIS',
          details: `Saved LSA Shift Analysis for SA Plant on ${payload.date} (I, II, III Shift & Composite).`,
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
      message: 'LSA Shift Analysis saved successfully in MongoDB ✓',
      data: recordPayload,
      record: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      emailStatus: 'disabled',
      emailDeliveryStatus: 'disabled',
      emailRecipient: null,
      editedFields,
      saveEventId,
    });
  } catch (error) {
    console.error('Error saving LSA Shift Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving LSA Shift Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Get LSA Shift Analysis data by date
 * @route   GET /api/lsa-analysis & /api/lsa-shift-analysis
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
            'LSA Shift Analysis',
            'LSA Shift',
            'LSA Analysis',
            'LSA SHIFT ANALYSIS',
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
        const shifts = payloadData.shifts || doc.shifts || {};

        return res.status(200).json({
          success: true,
          data: {
            ...payloadData,
            _id: doc._id,
            id: doc._id.toString(),
            date: doc.date,
            plant: doc.plantCode,
            analysisType: doc.analysisType,
            shifts,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          },
          record: doc,
          recordId: doc._id,
          shifts,
          editedFields: payloadData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      const match = lsaShiftRecords.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
          record: match,
          recordId: match._id || match.id,
          shifts: match.shifts,
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
        shifts: null,
        assignedOperatorEmail,
        emailStatus: null,
        emailRecipient: assignedOperatorEmail,
      });
    }

    // If no date query, return list
    let records = [];
    try {
      if (PlantAnalysisRecord) {
        records = await PlantAnalysisRecord.find({
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: {
            $in: [
              'LSA Shift Analysis',
              'LSA Shift',
              'LSA Analysis',
              'LSA SHIFT ANALYSIS',
            ],
          },
        })
          .sort({ date: -1 })
          .limit(30)
          .lean();
      }
    } catch (e) {
      console.warn('Error querying all records:', e.message);
    }

    if (records.length > 0) {
      return res.status(200).json({
        success: true,
        count: records.length,
        data: records.map((r) => r.data || r),
      });
    }

    return res.status(200).json({
      success: true,
      count: lsaShiftRecords.length,
      data: lsaShiftRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/lsa-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching LSA Shift Analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved LSA Shift analysis record
 * @route   POST /api/lsa-analysis/:id/retry-email & /api/lsa-shift-analysis/:id/retry-email
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
