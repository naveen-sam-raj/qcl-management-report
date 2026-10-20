const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord, Plant } = require('../models');

// Helper: Get today's date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// In-memory cache storage for Bi Carbonate Analysis records
const bicarbonateRecords = [];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save or edit SA Plant Bi Carbonate NaCl/Na2CO3 Analysis data
 * @route   POST /api/bicarbonate-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    // 1. Mandatory Date Check
    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Bi Carbonate Analysis.',
      });
    }

    // 2. Strict Current-Date Restriction (Asia/Kolkata)
    const todayKolkata = getTodayKolkata();
    if (payload.date !== todayKolkata) {
      return res.status(400).json({
        success: false,
        message: `Date restriction enforced: Bi Carbonate Analysis records can only be created or modified for today's date (${todayKolkata}). Historical or future modifications are not permitted.`,
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      const val = reading.naclNa2co3;
      if (val !== '' && val !== null && val !== undefined) {
        if (isNaN(Number(val))) {
          errors.push(`Row #${rowNum} (${reading.time || ''}): NaCl / Na₂CO₃ (%) must be a valid number.`);
        }
      }
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
          'Bi Carbonate NaCl/Na2CO3 Analysis',
          'Bi Carbonate NaCl/Na₂CO₃ Analysis',
          'Bi Carbonate Analysis',
          'Bicarbonate Analysis',
        ],
      },
    };
    if (req.user && req.user.company) {
      query.$or = [{ company: req.user.company }, { company: null }];
    }

    let existingDoc = await PlantAnalysisRecord.findOne(query);
    let existingData = existingDoc?.data || {};
    let existingReadings = Array.isArray(existingData.readings) ? existingData.readings : [];

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
    const saveEventId = `bicarb_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build map of existing readings by row id or time
    const existingMap = {};
    existingReadings.forEach((r) => {
      if (r.id) existingMap[r.id] = r;
      if (r.time) existingMap[`time_${r.time}`] = r;
    });

    // Detect field edits
    readings.forEach((newR) => {
      const match = (newR.id && existingMap[newR.id]) || (newR.time && existingMap[`time_${newR.time}`]);
      if (match) {
        // Compare naclNa2co3
        if (isValDiff(match.naclNa2co3, newR.naclNa2co3) && match.naclNa2co3 !== undefined && match.naclNa2co3 !== '') {
          const rowKey = newR.id || `time_${newR.time}`;
          if (!editedFields[rowKey]) editedFields[rowKey] = {};
          editedFields[rowKey].naclNa2co3 = true;

          editAuditHistory.push({
            date: payload.date,
            rowId: rowKey,
            time: newR.time,
            field: 'naclNa2co3',
            fieldName: 'NaCl / Na₂CO₃ (%)',
            oldValue: match.naclNa2co3,
            newValue: newR.naclNa2co3,
            editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
            timestamp: nowIso,
            saveEventId,
          });
        }
        // Compare filter
        if (isValDiff(match.filter, newR.filter) && match.filter !== undefined && match.filter !== '') {
          const rowKey = newR.id || `time_${newR.time}`;
          if (!editedFields[rowKey]) editedFields[rowKey] = {};
          editedFields[rowKey].filter = true;

          editAuditHistory.push({
            date: payload.date,
            rowId: rowKey,
            time: newR.time,
            field: 'filter',
            fieldName: 'Filter',
            oldValue: match.filter,
            newValue: newR.filter,
            editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
            timestamp: nowIso,
            saveEventId,
          });
        }
      }
    });

    const recordPayload = {
      id: existingDoc?._id ? existingDoc._id.toString() : `bicarb_${Date.now()}`,
      date: payload.date,
      plant: 'SA',
      plantCode: 'SA',
      unit: 'Bi carbonate',
      section: 'Soda Ash Production',
      analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
      readings,
      editedFields,
      editAuditHistory,
      submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
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
              'Bi Carbonate NaCl/Na2CO3 Analysis',
              'Bi Carbonate NaCl/Na₂CO₃ Analysis',
              'Bi Carbonate Analysis',
              'Bicarbonate Analysis',
            ],
          },
          date: payload.date,
        },
        {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
          unit: 'Bi carbonate',
          date: payload.date,
          shift: 'Hourly / Time Slots',
          data: recordPayload,
          submittedBy: recordPayload.submittedBy,
          submittedById: recordPayload.submittedById,
          company: recordPayload.company,
          status: 'completed',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      console.error('[Bi Carbonate Save] Database persistence failure:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database persistence failed: ' + dbErr.message,
      });
    }

    // Keep memory cache updated
    const cachedIdx = bicarbonateRecords.findIndex((r) => r.date === payload.date);
    if (cachedIdx >= 0) {
      bicarbonateRecords[cachedIdx] = recordPayload;
    } else {
      bicarbonateRecords.unshift(recordPayload);
    }

    // 5. Asynchronous Email Dispatch via Centralized Workflow
    return res.status(200).json({
      success: true,
      message: 'Bi Carbonate Analysis saved successfully in MongoDB ✓',
      data: {
        ...recordPayload,
        _id: savedRecordDoc._id,
        id: savedRecordDoc._id,
      },
      recordId: savedRecordDoc._id,
      analysis: {
        _id: savedRecordDoc._id,
        recordSummary: {
          date: payload.date,
          readings,
          editedFields,
          editAuditHistory,
        },
      },
      editedFields,
      emailStatus: 'disabled',
      emailSent: false,
      emailDeliveryStatus: 'disabled',
      emailRecipient: null,
      saveEventId,
    });
  } catch (error) {
    console.error('Error in POST /api/bicarbonate-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Bi Carbonate Analysis record: ' + error.message,
    });
  }
});

/**
 * @desc    Get Bi Carbonate Analysis data (by date or latest)
 * @route   GET /api/bicarbonate-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { getPlantAssignedUser } = require('../services/plantNotificationService');

    let assignedOperatorEmail = null;
    try {
      const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
      assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
    } catch (uErr) {}

    if (date) {
      const query = {
        date,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: {
          $in: [
            'Bi Carbonate NaCl/Na2CO3 Analysis',
            'Bi Carbonate NaCl/Na₂CO₃ Analysis',
            'Bi Carbonate Analysis',
            'Bicarbonate Analysis',
          ],
        },
      };
      if (req.user && req.user.company) {
        query.$or = [{ company: req.user.company }, { company: null }];
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();

      if (doc && doc.data) {
        const docData = doc.data || {};
        const enrichedData = {
          ...docData,
          _id: doc._id,
          id: doc._id,
          recordId: doc._id,
          readings: Array.isArray(docData.readings) ? docData.readings : [],
          editedFields: docData.editedFields || {},
          editAuditHistory: docData.editAuditHistory || [],
        };
        return res.status(200).json({
          success: true,
          data: enrichedData,
          record: enrichedData,
          recordId: doc._id,
          editedFields: docData.editedFields || {},
          assignedOperatorEmail,
          emailStatus: doc.emailStatus || 'pending',
          emailRecipient: doc.emailRecipient || assignedOperatorEmail,
        });
      }

      const match = bicarbonateRecords.find((r) => r.date === date);
      if (match) {
        return res.status(200).json({
          success: true,
          data: match,
          record: match,
          recordId: match._id || match.id,
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
        editedFields: {},
        assignedOperatorEmail,
        emailStatus: 'failed',
        emailRecipient: assignedOperatorEmail,
        message: `No record found for date ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      count: bicarbonateRecords.length,
      data: bicarbonateRecords,
    });
  } catch (error) {
    console.error('Error in GET /api/bicarbonate-analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Bi Carbonate Analysis records: ' + error.message,
    });
  }
});

/**
 * @desc    Retry sending email for an existing saved Bi Carbonate analysis record
 * @route   POST /api/bicarbonate-analysis/:id/retry-email
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
