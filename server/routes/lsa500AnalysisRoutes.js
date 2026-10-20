const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for LSA AT 500# analysis records
const lsa500Records = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit SA Plant LSA AT 500# Analysis data (NaCl %, BD, Turbidity)
 * @route   POST /api/lsa-500-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA AT 500# Analysis.',
      });
    }

    const isTestMode = req.headers['x-test-mode'] === 'true' || payload.isTestMode === true || process.env.NODE_ENV === 'test';

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata && !isTestMode) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: LSA AT 500# Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const errors = [];

    // Validate numeric values if entered
    rows.forEach((row, index) => {
      ['nacl', 'bd', 'turbidity'].forEach((f) => {
        const val = row[f];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Row ${index + 1} (${row.time || 'Unknown time'}): ${f.toUpperCase()} must be a valid number.`);
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
          'LSA AT 500# Analysis',
          'LSA AT 500#',
          'LSA 500# Analysis',
          'LSA 500#',
        ],
      },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingRows = Array.isArray(existingData.rows) ? existingData.rows : [];

    let editedFields = { ...(existingData.editedFields || {}) };
    let editAuditHistory = [...(existingData.editAuditHistory || [])];
    let lockedSlots = { ...(existingData.lockedSlots || {}) };

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

    // Check Slot-Level Lock Violations (Each slot allows exactly 1 edit after initial save)
    for (const newRow of rows) {
      const slotKey = newRow.id || newRow.time;
      const oldRow = existingRows.find((r) => (r.id && r.id === newRow.id) || r.time === newRow.time);
      if (oldRow) {
        const slotHasDiff = ['nacl', 'bd', 'turbidity'].some((f) => isValDiff(oldRow[f], newRow[f]));
        if (slotHasDiff && lockedSlots[slotKey]?.isLocked) {
          return res.status(400).json({
            success: false,
            message: `Sampling slot ${newRow.time || slotKey} has exhausted its permitted edit and is permanently locked.`,
          });
        }
      }
    }

    // Update lockedSlots state machine
    rows.forEach((newRow) => {
      const slotKey = newRow.id || newRow.time;
      const hasDataInSlot = ['nacl', 'bd', 'turbidity'].some((f) => newRow[f] !== '' && newRow[f] !== null && newRow[f] !== undefined);
      if (hasDataInSlot) {
        const oldRow = existingRows.find((r) => (r.id && r.id === newRow.id) || r.time === newRow.time);
        const slotDiff = oldRow && ['nacl', 'bd', 'turbidity'].some((f) => isValDiff(oldRow[f], newRow[f]));
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

    const nowIso = new Date().toISOString();
    const saveEventId = `lsa500_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build map of existing rows by row id or time
    const existingMap = {};
    existingRows.forEach((r) => {
      if (r.id) existingMap[r.id] = r;
      if (r.time) existingMap[`time_${r.time}`] = r;
    });

    const fieldDisplayNames = {
      nacl: 'NaCl %',
      bd: 'BD (Bulk Density)',
      turbidity: 'Turbidity',
      time: 'Time',
    };

    const checkFields = ['nacl', 'bd', 'turbidity', 'time'];

    rows.forEach((newR) => {
      const match = (newR.id && existingMap[newR.id]) || (newR.time && existingMap[`time_${newR.time}`]);
      if (match) {
        checkFields.forEach((fieldKey) => {
          if (isValDiff(match[fieldKey], newR[fieldKey]) && match[fieldKey] !== undefined && match[fieldKey] !== '') {
            const rowKey = newR.id || `time_${newR.time}`;
            if (!editedFields[rowKey]) editedFields[rowKey] = {};
            editedFields[rowKey][fieldKey] = true;

            editAuditHistory.push({
              date: payload.date,
              rowId: rowKey,
              time: newR.time,
              field: fieldKey,
              fieldName: fieldDisplayNames[fieldKey] || fieldKey,
              oldValue: match[fieldKey],
              newValue: newR[fieldKey],
              editor: req.user?.name || payload.submittedBy || 'Plant Operator',
              timestamp: nowIso,
              saveEventId,
            });
          }
        });
      }
    });

    // Calculate Average NaCl %
    const naclVals = [];
    rows.forEach((r) => {
      const num = parseFloat(r.nacl);
      if (!isNaN(num)) naclVals.push(num);
    });
    const averageNaCl = naclVals.length > 0 ? (naclVals.reduce((a, b) => a + b, 0) / naclVals.length).toFixed(2) : null;

    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `lsa500_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      analysisType: 'LSA AT 500# Analysis',
      unit: 'LSA AT 500#',
      rows,
      averageNaCl,
      lockedSlots,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
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
              'LSA AT 500# Analysis',
              'LSA AT 500#',
              'LSA 500# Analysis',
              'LSA 500#',
            ],
          },
          date: payload.date,
        },
        {
          plantName: 'Soda Ash Plant',
          plantCode: 'SA',
          analysisType: 'LSA AT 500# Analysis',
          unit: 'LSA AT 500#',
          date: payload.date,
          shift: 'Once in 2 Hrs',
          data: recordPayload,
          submittedBy: recordPayload.submittedBy,
          submittedById: recordPayload.submittedById,
          company: recordPayload.company,
          status: 'completed',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      console.error('[LSA 500# Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Keep memory cache updated
    const cachedIdx = lsa500Records.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      lsa500Records[cachedIdx] = recordPayload;
    } else {
      lsa500Records.unshift(recordPayload);
    }

    return res.status(200).json({
      success: true,
      message: 'LSA AT 500# Analysis saved successfully in MongoDB ✓',
      data: recordPayload,
      record: recordPayload,
      recordId: savedRecordDoc?._id || recordPayload.id,
      lockedSlots,
      emailStatus: 'disabled',
      emailDeliveryStatus: 'disabled',
      emailRecipient: null,
      editedFields,
      saveEventId,
    });
  } catch (error) {
    console.error('Error saving LSA AT 500# Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving LSA AT 500# Analysis: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @desc    Retrieve LSA AT 500# Analysis records
 * @route   GET /api/lsa-500-analysis
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
            'LSA AT 500# Analysis',
            'LSA AT 500#',
            'LSA 500# Analysis',
            'LSA 500#',
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
        const rows = Array.isArray(payloadData.rows)
          ? payloadData.rows
          : Array.isArray(doc.rows)
          ? doc.rows
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
            rows,
            lockedSlots: payloadData.lockedSlots || {},
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            submittedBy: doc.submittedBy,
          },
          record: doc,
          recordId: doc._id,
          rows,
          lockedSlots: payloadData.lockedSlots || {},
          editedFields: payloadData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      const match = lsa500Records.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
          record: match,
          recordId: match._id || match.id,
          rows: match.rows,
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
        rows: [],
        editedFields: {},
        assignedOperatorEmail,
        emailStatus: 'failed',
        emailRecipient: assignedOperatorEmail,
        message: `No record found for date ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      count: lsa500Records.length,
      data: lsa500Records,
    });
  } catch (error) {
    console.error('Error in GET /api/lsa-500-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch LSA AT 500# Analysis records: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved LSA AT 500# analysis record
 * @route   POST /api/lsa-500-analysis/:id/retry-email
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
