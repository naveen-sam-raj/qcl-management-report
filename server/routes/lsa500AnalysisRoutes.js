const express = require('express');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const { computeSlotTransition, pickCanonicalDoc } = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const LSA500_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];

const DEFAULT_ROWS = [
  { id: 'r1',  time: '06:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r2',  time: '08:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r3',  time: '10:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r4',  time: '12:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r5',  time: '14:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r6',  time: '16:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r7',  time: '18:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r8',  time: '20:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r9',  time: '22:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r10', time: '00:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r11', time: '02:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r12', time: '04:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r13', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
  { id: 'r14', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
  { id: 'r15', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
];

const LOCK_FIELDS = ['nacl', 'bd', 'turbidity'];

const fieldDisplayNames = {
  nacl: 'NaCl %',
  bd: 'BD (Bulk Density)',
  turbidity: 'Turbidity',
};

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

function getSlotKeyFromRow(row) {
  if (!row) return null;
  if (row.id && LSA500_SLOTS.includes(row.id)) return row.id;
  const t = String(row.time || '').trim();
  if (t === '06:30') return 'r1';
  if (t === '08:30') return 'r2';
  if (t === '10:00' || t === '10:30') return 'r3';
  if (t === '12:00' || t === '12:30') return 'r4';
  if (t === '14:30') return 'r5';
  if (t === '16:00' || t === '16:30') return 'r6';
  if (t === '18:00' || t === '18:30') return 'r7';
  if (t === '20:00' || t === '20:30') return 'r8';
  if (t === '22:30') return 'r9';
  if (t === '00:30') return 'r10';
  if (t === '02:00' || t === '02:30') return 'r11';
  if (t === '04:00' || t === '04:30') return 'r12';
  return null;
}

function isSlotEmpty(slotObj) {
  if (!slotObj) return true;
  return LOCK_FIELDS.every((f) => {
    const v = slotObj[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

function deriveLsa500Locks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots || {};
  const lockedSlots = {};

  for (const sk of LSA500_SLOTS) {
    const defaultRow = DEFAULT_ROWS.find(r => r.id === sk);
    const s = storedSlots[sk] || (defaultRow && defaultRow.time ? storedSlots[defaultRow.time] : null);
    if (s) {
      const isSaved = Boolean(s.isSaved || s.initialSaved);
      const correctionUsed = Boolean(s.correctionUsed || (s.editCount && s.editCount >= 1));
      const isLocked = Boolean(s.isLocked || correctionUsed);
      lockedSlots[sk] = {
        isSaved,
        isLocked,
        correctionUsed,
        initialSaved: isSaved,
        editCount: correctionUsed ? 1 : 0,
      };
    } else {
      lockedSlots[sk] = {
        isSaved: false,
        isLocked: false,
        correctionUsed: false,
        initialSaved: false,
        editCount: 0,
      };
    }
  }

  // Chain rules: saving k+1 permanently locks k
  for (let i = 0; i < LSA500_SLOTS.length - 1; i++) {
    const cur = LSA500_SLOTS[i];
    const nxt = LSA500_SLOTS[i + 1];
    if (lockedSlots[nxt].isSaved) {
      lockedSlots[cur].isLocked = true;
    }
  }

  return lockedSlots;
}

// In-memory cache storage for LSA AT 500# analysis records
const lsa500Records = [];

function createLSA500Router({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  // Apply authentication middleware
  router.use(protect);

  /**
   * @desc    Save or edit SA Plant LSA AT 500# Analysis data
   * @route   POST /api/lsa-500-analysis
   * @access  Private
   */
  router.post('/', async (req, res) => {
    try {
      if (req.user?.role === 'user') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Insufficient privileges to perform this action.',
        });
      }

      const payload = req.body || {};

      // 1. Mandatory Date Check
      if (!payload.date) {
        return res.status(400).json({
          success: false,
          message: 'Analysis Date is required to save LSA AT 500# Analysis.',
        });
      }

      // 2. Strict Operating Date Enforcement (06:00 to 06:00 IST)
      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: LSA AT 500# Analysis records can only be created or modified for current operating day (${operatingDate}). Received: ${payload.date}`,
        });
      }

      const incomingRows = Array.isArray(payload.rows) ? payload.rows : [];

      // Validate numeric values if entered
      const errors = [];
      incomingRows.forEach((row, index) => {
        LOCK_FIELDS.forEach((f) => {
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

      // 3. Query existing record in MongoDB using pickCanonicalDoc
      const companyId = req.user?.company?._id || req.user?.company || null;
      const query = {
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: {
          $in: [
            'LSA AT 500# Analysis',
            'LSA AT 500#',
            'LSA 500# Analysis',
            'LSA 500#',
          ],
        },
        date: operatingDate,
      };
      if (companyId) {
        query.$or = [{ company: companyId }, { company: null }];
      }

      const existingDocs = await PlantAnalysisRecord.find(query).lean();
      const existingDoc = pickCanonicalDoc(existingDocs);
      const existingData = existingDoc?.data || {};
      const existingRows = Array.isArray(existingData.rows) ? existingData.rows : [];

      // Reconstruct existing slot readings
      const existingSlots = {};
      for (const sk of LSA500_SLOTS) {
        const row = existingRows.find(r => getSlotKeyFromRow(r) === sk) || DEFAULT_ROWS.find(r => r.id === sk);
        existingSlots[sk] = {
          nacl: row?.nacl ?? '',
          bd: row?.bd ?? '',
          turbidity: row?.turbidity ?? '',
        };
      }

      // Reconstruct incoming slot readings
      const incomingSlots = {};
      for (const sk of LSA500_SLOTS) {
        const row = incomingRows.find(r => getSlotKeyFromRow(r) === sk);
        if (row) {
          incomingSlots[sk] = {
            nacl: row.nacl ?? '',
            bd: row.bd ?? '',
            turbidity: row.turbidity ?? '',
          };
        } else {
          incomingSlots[sk] = { ...existingSlots[sk] };
        }
      }

      // Identify changed slots
      const changedSlots = [];
      for (const sk of LSA500_SLOTS) {
        const ex = existingSlots[sk];
        const inc = incomingSlots[sk];
        const hasDiff = LOCK_FIELDS.some(f => isValDiff(ex[f], inc[f]));
        if (hasDiff) {
          changedSlots.push(sk);
        }
      }

      const currentLockedSlots = deriveLsa500Locks(existingDoc);
      const hasAnySaved = LSA500_SLOTS.some(sk => currentLockedSlots[sk].isSaved);

      // Handle 0 changed slots
      if (changedSlots.length === 0) {
        // If fresh document without any saved slot, check if user tried to save an empty slot
        if (!existingDoc || !hasAnySaved) {
          const targetSlotCandidate = payload.targetSlot || (incomingRows.length > 0 ? getSlotKeyFromRow(incomingRows[0]) : 'r1') || 'r1';
          return res.status(400).json({
            success: false,
            message: `Cannot save empty slot ${targetSlotCandidate}. At least one measurement is required.`,
          });
        }

        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc._id,
          lockedSlots: currentLockedSlots,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailDeliveryStatus: 'disabled',
        });
      }

      // Handle >1 changed slots
      if (changedSlots.length > 1) {
        return res.status(400).json({
          success: false,
          message: 'Multiple slot edits are not permitted in a single save. Save one slot at a time.',
        });
      }

      const targetSlot = changedSlots[0];

      // Empty slot check
      if (isSlotEmpty(incomingSlots[targetSlot])) {
        return res.status(400).json({
          success: false,
          message: `Cannot save empty slot ${targetSlot}. At least one measurement is required.`,
        });
      }

      // Build incomingSlotRows for computeSlotTransition: preserve saved slots, include target
      const incomingSlotRows = {};
      for (const u of LSA500_SLOTS) {
        if (u === targetSlot) {
          incomingSlotRows[u] = incomingSlots[u] || {};
        } else if (existingSlots[u] !== undefined) {
          incomingSlotRows[u] = existingSlots[u];
        }
      }

      // Predecessor Sequence Check if targetSlot > 0
      const targetIdx = LSA500_SLOTS.indexOf(targetSlot);
      if (targetIdx > 0) {
        for (let p = 0; p < targetIdx; p++) {
          const prevKey = LSA500_SLOTS[p];
          if (!currentLockedSlots[prevKey]?.isSaved) {
            return res.status(400).json({
              success: false,
              message: `Sequential restriction: ${prevKey} must be completed and saved before proceeding to ${targetSlot}.`,
            });
          }
        }
      }

      // Compute slot transition using shared engine
      const transition = computeSlotTransition({
        unitsOrder: LSA500_SLOTS,
        lockedSlots: currentLockedSlots,
        storedRows: existingSlots,
        incomingRows: incomingSlotRows,
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
          rows: existingRows,
          lockedSlots: currentLockedSlots,
          editedFields: existingData.editedFields || {},
          editAuditHistory: existingData.editAuditHistory || [],
          emailStatus: 'disabled',
          emailDeliveryStatus: 'disabled',
        });
      }

      if (!transition.ok) {
        return res.status(transition.status || 400).json({
          success: false,
          message: transition.message,
        });
      }

      const isFirstSave = !currentLockedSlots[targetSlot].isSaved;
      const isCorrection = transition.isCorrection;

      // Update state dictionary for lockedSlots
      const updatedLockedSlots = JSON.parse(JSON.stringify(currentLockedSlots));
      if (isFirstSave) {
        updatedLockedSlots[targetSlot].isSaved = true;
        updatedLockedSlots[targetSlot].initialSaved = true;
        const targetIdx = LSA500_SLOTS.indexOf(targetSlot);
        if (targetIdx > 0) {
          const prevSlot = LSA500_SLOTS[targetIdx - 1];
          updatedLockedSlots[prevSlot].isLocked = true;
        }
      } else if (isCorrection) {
        updatedLockedSlots[targetSlot].correctionUsed = true;
        updatedLockedSlots[targetSlot].isLocked = true;
        updatedLockedSlots[targetSlot].editCount = 1;
      }

      // Build updated editedFields and editAuditHistory
      const updatedEditedFields = JSON.parse(JSON.stringify(existingData.editedFields || {}));
      const updatedAuditHistory = [...(existingData.editAuditHistory || [])];
      const nowIso = new Date().toISOString();
      const saveEventId = `lsa500_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (isCorrection) {
        const targetRowObj = incomingRows.find(r => getSlotKeyFromRow(r) === targetSlot) || DEFAULT_ROWS.find(r => r.id === targetSlot);
        for (const pk of LOCK_FIELDS) {
          if (isValDiff(existingSlots[targetSlot][pk], incomingSlots[targetSlot][pk])) {
            if (!updatedEditedFields[targetSlot]) updatedEditedFields[targetSlot] = {};
            updatedEditedFields[targetSlot][pk] = true;

            if (targetRowObj?.time) {
              const timeKey = `time_${targetRowObj.time}`;
              if (!updatedEditedFields[timeKey]) updatedEditedFields[timeKey] = {};
              updatedEditedFields[timeKey][pk] = true;
            }

            updatedAuditHistory.push({
              date: operatingDate,
              rowId: targetSlot,
              time: targetRowObj?.time || '',
              field: pk,
              fieldName: fieldDisplayNames[pk] || pk,
              oldValue: existingSlots[targetSlot][pk],
              newValue: incomingSlots[targetSlot][pk],
              editor: req.user?.name || payload.submittedBy || 'Plant Operator',
              timestamp: nowIso,
              saveEventId,
            });
          }
        }
      }

      // Reconstruct updated rows array
      const updatedRows = [];
      DEFAULT_ROWS.forEach((defRow) => {
        const sk = defRow.id;
        if (LSA500_SLOTS.includes(sk)) {
          const incRow = incomingRows.find(r => getSlotKeyFromRow(r) === sk);
          const exRow = existingRows.find(r => getSlotKeyFromRow(r) === sk);
          updatedRows.push({
            id: sk,
            time: defRow.time,
            nacl: incomingSlots[sk]?.nacl ?? exRow?.nacl ?? '',
            bd: incomingSlots[sk]?.bd ?? exRow?.bd ?? '',
            turbidity: incomingSlots[sk]?.turbidity ?? exRow?.turbidity ?? '',
            sampleSource: incRow?.sampleSource ?? exRow?.sampleSource ?? defRow.sampleSource ?? '',
            isDefault: true,
          });
        } else {
          // r13..r15
          const exRow = existingRows.find(r => r.id === sk);
          updatedRows.push({
            id: sk,
            time: exRow?.time ?? defRow.time ?? '',
            nacl: exRow?.nacl ?? defRow.nacl ?? '',
            bd: exRow?.bd ?? defRow.bd ?? '',
            turbidity: exRow?.turbidity ?? defRow.turbidity ?? '',
            sampleSource: exRow?.sampleSource ?? defRow.sampleSource ?? '',
            isDefault: false,
          });
        }
      });

      // Preserve legacy extra / custom rows
      const customRows = existingRows.filter(r => !DEFAULT_ROWS.some(d => d.id === r.id));
      for (const cr of customRows) {
        if (!updatedRows.some(r => r.id === cr.id)) {
          updatedRows.push(cr);
        }
      }

      // Calculate Average NaCl %
      const naclVals = [];
      updatedRows.forEach((r) => {
        const num = parseFloat(r.nacl);
        if (!isNaN(num)) naclVals.push(num);
      });
      const averageNaCl = naclVals.length > 0 ? (naclVals.reduce((a, b) => a + b, 0) / naclVals.length).toFixed(2) : null;

      const recordPayload = {
        id: existingDoc?._id ? existingDoc._id.toString() : `lsa500_${Date.now()}`,
        date: operatingDate,
        plant: 'SA',
        plantCode: 'SA',
        analysisType: 'LSA AT 500# Analysis',
        unit: 'LSA AT 500#',
        rows: updatedRows,
        averageNaCl,
        lockedSlots: updatedLockedSlots,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
        submittedById: req.user?._id,
        submittedAt: nowIso,
        company: companyId,
        saveEventId,
      };

      // Atomic Mongo persistence with optimistic concurrency lock condition
      let updateFilter;
      if (existingDoc?._id) {
        updateFilter = {
          _id: existingDoc._id,
          ...(isCorrection
            ? {
                [`data.lockedSlots.${targetSlot}.isSaved`]: true,
                [`data.lockedSlots.${targetSlot}.correctionUsed`]: false,
                [`data.lockedSlots.${targetSlot}.isLocked`]: false,
              }
            : {
                $or: [
                  { [`data.lockedSlots.${targetSlot}.isSaved`]: { $ne: true } },
                  { [`data.lockedSlots.${targetSlot}`]: { $exists: false } },
                  { [`data.lockedSlots`]: { $exists: false } },
                ],
              }),
        };
      } else {
        updateFilter = {
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: {
            $in: [
              'LSA AT 500# Analysis',
              'LSA AT 500#',
              'LSA 500# Analysis',
              'LSA 500#',
            ],
          },
          date: operatingDate,
        };
      }

      const updateOp = {
        $set: {
          plantName: 'Soda Ash Plant',
          plantCode: 'SA',
          analysisType: 'LSA AT 500# Analysis',
          unit: 'LSA AT 500#',
          date: operatingDate,
          'data.rows': updatedRows,
          'data.averageNaCl': averageNaCl,
          'data.lockedSlots': updatedLockedSlots,
          'data.editedFields': updatedEditedFields,
          'data.editAuditHistory': updatedAuditHistory,
          'data.submittedBy': recordPayload.submittedBy,
          'data.submittedById': recordPayload.submittedById,
          'data.submittedAt': nowIso,
          'data.saveEventId': saveEventId,
          submittedBy: recordPayload.submittedBy,
          submittedById: recordPayload.submittedById,
          status: 'completed',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          shift: 'All Shifts',
          company: companyId,
          'data.date': operatingDate,
          'data.plant': 'SA',
          'data.plantCode': 'SA',
          'data.analysisType': 'LSA AT 500# Analysis',
          'data.unit': 'LSA AT 500#',
        },
      };

      let savedRecordDoc = null;
      try {
        const updateResult = await PlantAnalysisRecord.updateOne(updateFilter, updateOp, { upsert: !existingDoc });
        if (existingDoc && updateResult.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: Slot was modified concurrently by another transaction.',
          });
        }
        savedRecordDoc = await PlantAnalysisRecord.findOne({
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: {
            $in: [
              'LSA AT 500# Analysis',
              'LSA AT 500#',
              'LSA 500# Analysis',
              'LSA 500#',
            ],
          },
          date: operatingDate,
        }).lean();
      } catch (dbErr) {
        if (dbErr.code === 11000) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: Concurrent creation of LSA AT 500# record detected.',
          });
        }
        console.error('[LSA 500# Save] Database persistence failure:', dbErr);
        return res.status(500).json({
          success: false,
          message: 'Database persistence failed: ' + dbErr.message,
        });
      }

      // Keep memory cache updated
      const cachedIdx = lsa500Records.findIndex((r) => r.date === operatingDate);
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
        rows: updatedRows,
        lockedSlots: updatedLockedSlots,
        emailStatus: 'disabled',
        emailDeliveryStatus: 'disabled',
        emailRecipient: null,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
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
      const now = getNow();
      const operatingDate = req.query.date || getOperatingDateIST(now);

      let assignedOperatorEmail = null;
      try {
        const { getPlantAssignedUser } = require('../services/plantNotificationService');
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (recipErr) {
        console.warn('Operator email resolution note:', recipErr.message);
      }

      if (operatingDate) {
        const query = {
          date: operatingDate,
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
          const docs = await PlantAnalysisRecord.find(query).lean();
          doc = pickCanonicalDoc(docs);
        }

        if (doc) {
          const payloadData = doc.data || {};
          const lockedSlots = deriveLsa500Locks(doc);
          const rawRows = Array.isArray(payloadData.rows)
            ? payloadData.rows
            : Array.isArray(doc.rows)
            ? doc.rows
            : [];

          // Merge into template, preserving any extra legacy rows
          const rows = DEFAULT_ROWS.map((defRow) => {
            const sk = defRow.id;
            const match = rawRows.find(r => (LSA500_SLOTS.includes(sk) && getSlotKeyFromRow(r) === sk) || r.id === sk);
            if (match) {
              return {
                ...defRow,
                ...match,
                id: defRow.id,
                time: defRow.time || match.time,
              };
            }
            return { ...defRow };
          });

          // Append legacy extra rows
          const customRows = rawRows.filter(r => !DEFAULT_ROWS.some(d => d.id === r.id));
          for (const cr of customRows) {
            if (!rows.some(r => r.id === cr.id)) {
              rows.push(cr);
            }
          }

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
              lockedSlots,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              submittedBy: doc.submittedBy,
            },
            record: doc,
            recordId: doc._id,
            rows,
            lockedSlots,
            editedFields: payloadData.editedFields || {},
            assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'disabled',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
          });
        }

        const match = lsa500Records.find((r) => r.date === operatingDate);
        if (match) {
          return res.status(200).json({
            success: true,
            data: match,
            record: match,
            recordId: match._id || match.id,
            rows: match.rows,
            lockedSlots: match.lockedSlots || deriveLsa500Locks(null),
            editedFields: match.editedFields || {},
            assignedOperatorEmail,
            emailStatus: 'disabled',
            emailRecipient: assignedOperatorEmail,
          });
        }

        return res.status(200).json({
          success: true,
          data: null,
          record: null,
          recordId: null,
          rows: DEFAULT_ROWS,
          lockedSlots: deriveLsa500Locks(null),
          editedFields: {},
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
          message: `No record found for date ${operatingDate}`,
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

  return router;
}

const defaultRouter = createLSA500Router();
defaultRouter.createRouter = createLSA500Router;
module.exports = defaultRouter;
