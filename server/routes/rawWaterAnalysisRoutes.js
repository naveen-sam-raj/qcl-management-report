const express = require('express');
const { PlantAnalysisRecord } = require('../models');
const { protect } = require('../middleware/auth');
const {
  computeSlotTransition,
  pickCanonicalDoc,
  isUnitEmpty,
  isValueDifferent,
} = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');
const { getPlantAssignedUser } = require('../services/plantNotificationService');

const CANONICAL_ANALYSIS_TYPE = 'Raw Water Analysis';
const ANALYSIS_TYPES = ['Raw Water Analysis'];
const PLANT_CODES = ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'];
const CANONICAL_PLANT_CODE = 'OFFSITE';
const CANONICAL_PLANT_NAME = 'OFFSITE Plant';
const CANONICAL_UNIT = 'Raw Water';

const PARAM_FIELDS = [
  'ph', 'cond', 'turbidity', 'tds', 'freeCl2', 'fe',
  'sio2', 'mAlk', 'th', 'caH', 'mgH', 'cl', 'so4', 'ema',
];
const NUMERIC_FIELDS = [...PARAM_FIELDS];
const SLOT_KEYS = ['parameters'];

function cleanParamValues(params = {}) {
  const cleaned = {};
  for (const f of PARAM_FIELDS) {
    const v = params[f];
    if (v === '' || v === null || v === undefined) {
      cleaned[f] = '';
    } else {
      cleaned[f] = String(v).trim();
    }
  }
  return cleaned;
}

function deriveRawWaterLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots || {};
  const pObj = existingData.parameters || existingData.data || {};

  const hasData = !isUnitEmpty(pObj);
  const isSaved = Boolean(existingData.initialSaved || storedSlots.parameters?.isSaved || hasData);
  const editCount = existingData.editCount || 0;
  const isLocked = Boolean(existingData.isLocked || storedSlots.parameters?.isLocked || editCount >= 1);
  const correctionUsed = Boolean(storedSlots.parameters?.correctionUsed || editCount >= 1 || isLocked);

  return {
    lockedSlots: {
      parameters: {
        isSaved,
        isLocked,
        correctionUsed,
      },
    },
    initialSaved: isSaved,
    editCount: correctionUsed ? 1 : 0,
    isLocked,
  };
}

function createRawWaterRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();
  router.use(protect);

  /**
   * @desc    Get Raw Water Analysis data
   * @route   GET /api/raw-water-analysis
   * @access  Private (Admin only)
   */
  router.get('/', async (req, res) => {
    try {
      const { date, startDate, endDate } = req.query;

      let assignedOperatorEmail = null;
      try {
        const companyId = req.user?.company?._id || req.user?.company || null;
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('OFFSITE', { company: companyId });
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (recipErr) {
        assignedOperatorEmail = null;
      }

      if (date) {
        if (req.user?.role === 'user') {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Raw Water Analysis data access is restricted to authorized Admins.',
          });
        }

        const query = {
          date,
          analysisType: { $in: ANALYSIS_TYPES },
          plantCode: { $in: PLANT_CODES },
        };
        if (req.user?.company) {
          const companyVal = req.user.company._id || req.user.company;
          query.$or = [{ company: companyVal }, { company: null }];
        }

        const matchingDocs = await PlantAnalysisRecord.find(query).lean();
        const doc = pickCanonicalDoc(matchingDocs);

        if (doc && doc.data) {
          const payloadData = doc.data;
          const currentLocks = deriveRawWaterLocks(doc);
          const params = cleanParamValues(payloadData.parameters || payloadData.data || {});

          return res.status(200).json({
            success: true,
            recordId: doc._id,
            assignedOperatorEmail,
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
            emailStatus: 'disabled',
            emailSent: false,
            parameters: params,
            lockedSlots: currentLocks.lockedSlots,
            initialSaved: currentLocks.initialSaved,
            editCount: currentLocks.editCount,
            isLocked: currentLocks.isLocked,
            editedFields: payloadData.editedFields || {},
            editAuditHistory: payloadData.editAuditHistory || [],
            data: {
              ...payloadData,
              _id: doc._id,
              id: doc._id,
              date: doc.date,
              time: '08:00',
              parameters: params,
              lockedSlots: currentLocks.lockedSlots,
              initialSaved: currentLocks.initialSaved,
              editCount: currentLocks.editCount,
              isLocked: currentLocks.isLocked,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              emailStatus: 'disabled',
              emailRecipient: null,
            },
          });
        }

        const initialLocks = {
          parameters: { isSaved: false, isLocked: false, correctionUsed: false },
        };

        return res.status(200).json({
          success: true,
          assignedOperatorEmail,
          data: null,
          parameters: cleanParamValues({}),
          lockedSlots: initialLocks,
          initialSaved: false,
          editCount: 0,
          isLocked: false,
          editedFields: {},
          editAuditHistory: [],
          message: `No record found for date ${date}`,
        });
      }

      // Listing query
      const query = {
        analysisType: { $in: ANALYSIS_TYPES },
        plantCode: { $in: PLANT_CODES },
      };
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (req.user?.company) {
        const companyVal = req.user.company._id || req.user.company;
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      const results = docs.map((d) => ({
        ...d.data,
        _id: d._id,
        id: d._id,
        date: d.date,
        emailStatus: 'disabled',
        emailRecipient: null,
      }));

      return res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving Raw Water records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Save Raw Water Analysis data
   * @route   POST /api/raw-water-analysis
   * @access  Private (Admin only)
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Raw Water Analysis data entry and modification is restricted to authorized Admins.',
        });
      }

      const payload = req.body || {};

      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save Raw Water Analysis.',
        });
      }

      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Raw Water Analysis records can only be created or modified for today's operating date (${operatingDate}). Historical or future modifications are not permitted.`,
        });
      }

      const rawParams = payload.parameters || payload.data;
      if (!rawParams || (typeof rawParams === 'object' && Object.keys(rawParams).length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'At least one analytical reading row is required.',
        });
      }

      const incomingParameters = cleanParamValues(rawParams);

      // Validate numeric fields
      const errors = [];
      PARAM_FIELDS.forEach((f) => {
        const val = rawParams[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${f.toUpperCase()} must be a valid number.`);
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

      const companyVal = req.user?.company?._id || req.user?.company || null;
      const query = {
        date: payload.date,
        analysisType: { $in: ANALYSIS_TYPES },
        plantCode: { $in: PLANT_CODES },
      };
      if (companyVal) {
        query.$or = [{ company: companyVal }, { company: null }];
      }

      const matchingDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(matchingDocs);
      const existingData = existingDoc?.data || {};
      const existingParameters = cleanParamValues(existingData.parameters || existingData.data || {});

      const currentLocks = deriveRawWaterLocks(existingDoc);
      const currentLockedSlots = currentLocks.lockedSlots;

      if (!currentLockedSlots.parameters?.isSaved && isUnitEmpty(incomingParameters)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot save empty slot parameters. At least one non-empty value is required.',
        });
      }

      // Compute slot transition via Universal Lock Engine
      const transition = computeSlotTransition({
        unitsOrder: SLOT_KEYS,
        lockedSlots: currentLockedSlots,
        storedRows: { parameters: existingParameters },
        incomingRows: { parameters: incomingParameters },
        now,
      });

      if (transition.noChange) {
        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc?._id,
          parameters: existingParameters,
          lockedSlots: currentLockedSlots,
          initialSaved: currentLocks.initialSaved,
          editCount: currentLocks.editCount,
          isLocked: currentLocks.isLocked,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailSent: false,
        });
      }

      if (!transition.ok) {
        return res.status(transition.status || 400).json({
          success: false,
          message: transition.message,
        });
      }

      const isCorrection = transition.isCorrection;
      const targetSlot = transition.targetUnit || 'parameters';
      const editorName = req.user?.name || payload.submittedBy || 'Plant Operator';
      const editorId = req.user?._id || null;
      const nowIso = now.toISOString();

      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (!isCorrection) {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: false,
          correctionUsed: false,
        };
      } else {
        updatedLockedSlots[targetSlot] = {
          isSaved: true,
          isLocked: true,
          correctionUsed: true,
        };
      }

      const updatedEditedFields = { ...(existingData.editedFields || {}) };
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];

      if (isCorrection) {
        const rowId = 'parameters';
        const timeVal = 'parameters';
        const shiftLabel = 'Day';
        const targetExisting = existingParameters || {};
        const targetIncoming = incomingParameters || {};

        PARAM_FIELDS.forEach((f) => {
          const ov = targetExisting[f];
          const nv = targetIncoming[f];
          if (isValueDifferent(ov, nv)) {
            updatedEditedFields[f] = true;
            updatedEditedFields[`parameters_${f}`] = true;
            updatedAuditHistory.push({
              date: payload.date,
              rowId,
              shift: shiftLabel,
              time: timeVal,
              field: f,
              oldValue: ov !== undefined && ov !== null ? String(ov) : '',
              newValue: nv !== undefined && nv !== null ? String(nv) : '',
              editedBy: editorName,
              editedById: editorId,
              timestamp: nowIso,
            });
          }
        });
      }

      const nextInitialSaved = true;
      const nextEditCount = isCorrection ? 1 : 0;
      const nextIsLocked = Boolean(updatedLockedSlots.parameters.isLocked);

      const recordData = {
        id: existingDoc ? String(existingDoc._id) : `rawwater_${Date.now()}`,
        date: payload.date,
        time: '08:00',
        plant: 'OFFSET',
        plantCode: CANONICAL_PLANT_CODE,
        plantName: CANONICAL_PLANT_NAME,
        unit: CANONICAL_UNIT,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        parameters: incomingParameters,
        lockedSlots: updatedLockedSlots,
        initialSaved: nextInitialSaved,
        editCount: nextEditCount,
        isLocked: nextIsLocked,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        submittedBy: editorName,
        submittedById: editorId,
        submittedAt: nowIso,
        company: companyVal,
      };

      const docUpdatePayload = {
        plantName: CANONICAL_PLANT_NAME,
        plantCode: CANONICAL_PLANT_CODE,
        analysisType: CANONICAL_ANALYSIS_TYPE,
        unit: CANONICAL_UNIT,
        date: payload.date,
        shift: 'Day',
        status: 'completed',
        data: recordData,
        submittedBy: editorName,
        submittedById: editorId,
        company: companyVal,
        savedAt: now,
        emailStatus: 'disabled',
        emailRecipient: null,
      };

      let savedDoc = null;
      if (existingDoc?._id) {
        const updateFilter = {
          _id: existingDoc._id,
          ...(isCorrection
            ? {
              $or: [
                {
                  [`data.lockedSlots.${targetSlot}.isSaved`]: true,
                  [`data.lockedSlots.${targetSlot}.correctionUsed`]: false,
                  [`data.lockedSlots.${targetSlot}.isLocked`]: false,
                },
                {
                  [`data.lockedSlots.${targetSlot}`]: { $exists: false },
                  'data.isLocked': { $ne: true },
                  'data.editCount': { $not: { $gte: 1 } },
                },
                {
                  [`data.lockedSlots`]: { $exists: false },
                  'data.isLocked': { $ne: true },
                  'data.editCount': { $not: { $gte: 1 } },
                },
              ],
            }
            : {
              $or: [
                { [`data.lockedSlots.${targetSlot}.isSaved`]: { $ne: true } },
                { [`data.lockedSlots.${targetSlot}`]: { $exists: false } },
                { [`data.lockedSlots`]: { $exists: false } },
              ],
            }),
        };

        const updateRes = await PlantAnalysisRecord.updateOne(updateFilter, {
          $set: docUpdatePayload,
        });

        if (updateRes.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: This shift was locked or updated concurrently by another user.',
          });
        }
        savedDoc = await PlantAnalysisRecord.findById(existingDoc._id).lean();
      } else {
        try {
          const insertDoc = {
            plantName: CANONICAL_PLANT_NAME,
            plantCode: CANONICAL_PLANT_CODE,
            analysisType: CANONICAL_ANALYSIS_TYPE,
            unit: CANONICAL_UNIT,
            date: payload.date,
            shift: 'Day',
            status: 'completed',
            submittedBy: editorName,
            submittedById: editorId,
            company: companyVal,
            emailStatus: 'disabled',
            emailRecipient: null,
            data: recordData,
            savedAt: now,
          };
          const created = await PlantAnalysisRecord.create(insertDoc);
          savedDoc = created ? created.toObject() : insertDoc;
        } catch (insertErr) {
          if (insertErr.code === 11000) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Document for this date was created concurrently.',
            });
          }
          throw insertErr;
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Raw Water Analysis saved successfully in MongoDB ✓',
        recordId: savedDoc?._id || recordData.id,
        emailStatus: 'disabled',
        emailRecipient: null,
        emailSent: false,
        emailPending: false,
        parameters: incomingParameters,
        lockedSlots: updatedLockedSlots,
        initialSaved: nextInitialSaved,
        editCount: nextEditCount,
        isLocked: nextIsLocked,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        data: recordData,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Server error while processing Raw Water analysis: ' + error.message,
      });
    }
  });

  /**
   * @desc    Retry email notification (disabled)
   * @route   POST /api/raw-water-analysis/:id/retry-email
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

  return router;
}

const defaultRouter = createRawWaterRouter();
defaultRouter.createRouter = createRawWaterRouter;
module.exports = defaultRouter;
