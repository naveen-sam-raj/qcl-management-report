const express = require('express');
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { computeSlotTransition, pickCanonicalDoc } = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const SIEVE_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];

const DEFAULT_ROWS = [
  { id: 'r1',  time: '09:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r2',  time: '10:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r3',  time: '11:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r4',  time: '14:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r5',  time: '16:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r6',  time: '18:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r7',  time: '20:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r8',  time: '22:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r9',  time: '00:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r10', time: '02:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r11', time: '04:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r12', time: '06:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
];

const TIME_TO_SLOT = {
  '09:30': 'r1', '10:30': 'r2', '11:30': 'r3', '14:30': 'r4',
  '16:30': 'r5', '18:30': 'r6', '20:30': 'r7', '22:30': 'r8',
  '00:30': 'r9', '02:30': 'r10', '04:30': 'r11', '06:30': 'r12',
};

const SIEVE_FIELDS = [
  { key: 'bss10', legacyKey: 'p10', name: 'BSS 10 (%)' },
  { key: 'bss30', legacyKey: 'p30', name: 'BSS 30 (%)' },
  { key: 'm30',   legacyKey: 'p60', name: '-30 (%)' },
  { key: 'bss60', legacyKey: 'm60', name: 'BSS 60 (%)' },
];

const LOCK_FIELDS = ['bss10', 'bss30', 'm30', 'bss60'];

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

function getValWithFallback(row, key, legacyKey) {
  if (!row) return '';
  if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
    return String(row[key]).trim();
  }
  if (legacyKey && row[legacyKey] !== undefined && row[legacyKey] !== null && String(row[legacyKey]).trim() !== '') {
    return String(row[legacyKey]).trim();
  }
  return '';
}

function getSlotKeyFromRow(row) {
  if (!row) return null;
  const t = String(row.time || '').trim();
  if (TIME_TO_SLOT[t]) return TIME_TO_SLOT[t];
  const idStr = String(row.id || '').trim();
  const defaultRow = DEFAULT_ROWS.find(d => d.id === idStr);
  if (defaultRow && (!row.time || row.time === defaultRow.time)) return idStr;
  return null;
}

function isSlotEmpty(slotObj) {
  if (!slotObj) return true;
  return LOCK_FIELDS.every((k) => {
    const v = slotObj[k];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

function deriveSieveLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots || {};
  const lockedSlots = {};

  for (const sk of SIEVE_SLOTS) {
    const defaultRow = DEFAULT_ROWS.find(r => r.id === sk);
    const s = storedSlots[sk] || (defaultRow?.time ? storedSlots[defaultRow.time] : null);
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
  for (let i = 0; i < SIEVE_SLOTS.length - 1; i++) {
    const cur = SIEVE_SLOTS[i];
    const nxt = SIEVE_SLOTS[i + 1];
    if (lockedSlots[nxt].isSaved) {
      lockedSlots[cur].isLocked = true;
    }
  }

  return lockedSlots;
}

// In-memory cache fallback for LSA Bagging Sieve records
const lsaBaggingSieveRecords = [];

function createLSABaggingSieveRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  // Apply authentication middleware
  router.use(protect);

  /**
   * @desc    Save LSA Bagging Sieve Analysis data (1 Hour Once frequency)
   * @route   POST /api/lsa-bagging-sieve
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
          message: 'Analysis Date is required to save LSA Bagging Sieve Analysis.',
        });
      }

      // 2. Strict Operating Date Enforcement (06:00 to 06:00 IST)
      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Submissions are only permitted for current operating day (${operatingDate}). Received: ${payload.date}`,
        });
      }

      const incomingRows = Array.isArray(payload.rows) ? payload.rows : [];

      // Validate numeric decimal entries
      const errors = [];
      incomingRows.forEach((row, index) => {
        ['bss10', 'bss30', 'm30', 'bss60', 'p10', 'p30', 'p60', 'm60'].forEach((field) => {
          const val = row[field];
          if (val !== undefined && val !== null && val !== '') {
            if (isNaN(Number(val))) {
              errors.push(`Row ${index + 1} (${row.time || 'Unknown time'}): ${field.toUpperCase()} must be a valid number.`);
            }
          }
        });
      });

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: errors[0],
          errors,
        });
      }

      // 3. Retrieve canonical existing record in MongoDB
      const companyId = req.user?.company?._id || req.user?.company || null;
      const query = {
        date: operatingDate,
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: 'LSA Bagging Sieve Analysis',
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
      for (const sk of SIEVE_SLOTS) {
        const row = existingRows.find(r => getSlotKeyFromRow(r) === sk) || DEFAULT_ROWS.find(r => r.id === sk);
        existingSlots[sk] = {};
        SIEVE_FIELDS.forEach(({ key, legacyKey }) => {
          existingSlots[sk][key] = getValWithFallback(row, key, legacyKey);
        });
      }

      // Reconstruct incoming slot readings
      const incomingSlots = {};
      for (const sk of SIEVE_SLOTS) {
        const row = incomingRows.find(r => getSlotKeyFromRow(r) === sk);
        if (row) {
          incomingSlots[sk] = {};
          SIEVE_FIELDS.forEach(({ key, legacyKey }) => {
            incomingSlots[sk][key] = getValWithFallback(row, key, legacyKey);
          });
        } else {
          incomingSlots[sk] = { ...existingSlots[sk] };
        }
      }

      // Identify changed slots
      const changedSlots = [];
      for (const sk of SIEVE_SLOTS) {
        const ex = existingSlots[sk];
        const inc = incomingSlots[sk];
        const hasDiff = LOCK_FIELDS.some(f => isValDiff(ex[f], inc[f]));
        if (hasDiff) {
          changedSlots.push(sk);
        }
      }

      const currentLockedSlots = deriveSieveLocks(existingDoc);
      const hasAnySaved = SIEVE_SLOTS.some(sk => currentLockedSlots[sk].isSaved);

      // Handle 0 changed slots
      if (changedSlots.length === 0) {
        if (!existingDoc || !hasAnySaved) {
          const targetCandidate = payload.targetSlot || (incomingRows.length > 0 ? getSlotKeyFromRow(incomingRows[0]) : 'r1') || 'r1';
          return res.status(400).json({
            success: false,
            message: `Cannot save empty slot ${targetCandidate}. At least one measurement is required.`,
          });
        }

        return res.status(200).json({
          success: true,
          noChange: true,
          message: 'No changes',
          data: existingData,
          record: existingData,
          recordId: existingDoc._id,
          rows: existingRows,
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
      for (const u of SIEVE_SLOTS) {
        if (u === targetSlot) {
          incomingSlotRows[u] = incomingSlots[u] || {};
        } else if (existingSlots[u] !== undefined) {
          incomingSlotRows[u] = existingSlots[u];
        }
      }

      // Predecessor Sequence Check
      const targetIdx = SIEVE_SLOTS.indexOf(targetSlot);
      if (targetIdx > 0) {
        for (let p = 0; p < targetIdx; p++) {
          const prevKey = SIEVE_SLOTS[p];
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
        unitsOrder: SIEVE_SLOTS,
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
        if (targetIdx > 0) {
          const prevSlot = SIEVE_SLOTS[targetIdx - 1];
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
      const saveEventId = `lsa_sieve_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const editor = req.user?.name || payload.submittedBy || 'Plant Operator';

      if (isCorrection) {
        const targetRowObj = incomingRows.find(r => getSlotKeyFromRow(r) === targetSlot) || DEFAULT_ROWS.find(r => r.id === targetSlot);
        for (const { key, legacyKey, name } of SIEVE_FIELDS) {
          if (isValDiff(existingSlots[targetSlot][key], incomingSlots[targetSlot][key])) {
            if (!updatedEditedFields[targetSlot]) updatedEditedFields[targetSlot] = {};
            updatedEditedFields[targetSlot][key] = true;
            updatedEditedFields[targetSlot][legacyKey] = true;

            if (targetRowObj?.time) {
              const timeKey = targetRowObj.time;
              if (!updatedEditedFields[timeKey]) updatedEditedFields[timeKey] = {};
              updatedEditedFields[timeKey][key] = true;
              updatedEditedFields[timeKey][legacyKey] = true;
            }

            updatedAuditHistory.push({
              date: operatingDate,
              section: 'LSA Bagging Sieve Analysis',
              samplingTime: targetRowObj?.time || '',
              field: key,
              fieldName: name,
              oldValue: existingSlots[targetSlot][key],
              newValue: incomingSlots[targetSlot][key],
              editor,
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
        const bss10 = incomingSlots[sk]?.bss10 ?? existingSlots[sk]?.bss10 ?? '';
        const bss30 = incomingSlots[sk]?.bss30 ?? existingSlots[sk]?.bss30 ?? '';
        const m30   = incomingSlots[sk]?.m30   ?? existingSlots[sk]?.m30   ?? '';
        const bss60 = incomingSlots[sk]?.bss60 ?? existingSlots[sk]?.bss60 ?? '';

        updatedRows.push({
          id: sk,
          time: defRow.time,
          bss10,
          bss30,
          m30,
          bss60,
          p10: bss10,
          p30: bss30,
          p60: m30,
          m60: bss60,
          isDefault: true,
        });
      });

      // Preserve legacy extra / custom rows
      const customRows = existingRows.filter(r => !getSlotKeyFromRow(r));
      for (const cr of customRows) {
        if (!updatedRows.some(r => r.id === cr.id || (r.time && cr.time && r.time === cr.time))) {
          updatedRows.push({ ...cr, isDefault: false });
        }
      }

      const recordPayload = {
        id: existingDoc?._id ? existingDoc._id.toString() : `lsa_sieve_${Date.now()}`,
        date: operatingDate,
        plant: 'SA',
        plantCode: 'SA',
        plantId: 'sa',
        unit: 'LSA Bagging Sieve',
        section: 'LSA Bagging Sieve',
        analysisType: 'LSA Bagging Sieve Analysis',
        rows: updatedRows,
        lockedSlots: updatedLockedSlots,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        saveEventId,
        submittedBy: editor,
        submittedById: req.user?._id,
        submittedAt: nowIso,
        company: companyId,
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
          date: operatingDate,
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: 'LSA Bagging Sieve Analysis',
        };
      }

      const updateOp = {
        $set: {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'LSA Bagging Sieve Analysis',
          unit: 'LSA Bagging Sieve',
          date: operatingDate,
          'data.rows': updatedRows,
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
          'data.plantId': 'sa',
          'data.analysisType': 'LSA Bagging Sieve Analysis',
          'data.unit': 'LSA Bagging Sieve',
          'data.section': 'LSA Bagging Sieve',
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
          date: operatingDate,
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: 'LSA Bagging Sieve Analysis',
        }).lean();
      } catch (dbErr) {
        if (dbErr.code === 11000) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: Concurrent creation of LSA Bagging Sieve record detected.',
          });
        }
        console.error('[LSABaggingSieve Save] Database persistence failure:', dbErr);
        return res.status(500).json({
          success: false,
          message: 'Database persistence failed: ' + dbErr.message,
        });
      }

      // Update in-memory fallback cache
      const cachedIdx = lsaBaggingSieveRecords.findIndex((r) => r.date === operatingDate);
      if (cachedIdx >= 0) {
        lsaBaggingSieveRecords[cachedIdx] = recordPayload;
      } else {
        lsaBaggingSieveRecords.unshift(recordPayload);
      }

      return res.status(200).json({
        success: true,
        message: 'LSA Bagging Sieve Analysis saved successfully in MongoDB ✓',
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
      console.error('Error saving LSA Bagging Sieve Analysis:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while saving LSA Bagging Sieve Analysis: ' + error.message,
        error: error.message,
      });
    }
  });

  /**
   * @desc    Retrieve LSA Bagging Sieve records
   * @route   GET /api/lsa-bagging-sieve
   * @access  Private
   */
  router.get('/', async (req, res) => {
    try {
      const now = getNow();
      const operatingDate = req.query.date || getOperatingDateIST(now);

      let assignedOperatorEmail = null;
      try {
        const { getPlantAssignedUser } = require('../services/plantNotificationService');
        const { primaryEmail, assignedUser } = await getPlantAssignedUser('SA', { company: req.user?.company });
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (e) {}

      if (operatingDate) {
        const query = {
          date: operatingDate,
          analysisType: 'LSA Bagging Sieve Analysis',
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
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
          const lockedSlots = deriveSieveLocks(doc);
          const rawRows = Array.isArray(payloadData.rows)
            ? payloadData.rows
            : Array.isArray(doc.rows)
            ? doc.rows
            : [];

          // Merge into template, preserving any extra legacy rows
          const rows = DEFAULT_ROWS.map((defRow) => {
            const sk = defRow.id;
            const match = rawRows.find(r => getSlotKeyFromRow(r) === sk || (r.id === sk && (!r.time || r.time === defRow.time)));
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
          const customRows = rawRows.filter(r => !getSlotKeyFromRow(r));
          for (const cr of customRows) {
            if (!rows.some(r => r.id === cr.id || (r.time && cr.time && r.time === cr.time))) {
              rows.push({
                ...cr,
                isDefault: false,
              });
            }
          }

          return res.status(200).json({
            success: true,
            data: [
              {
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
              }
            ],
            record: {
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
            recordId: doc._id,
            rows,
            lockedSlots,
            editedFields: payloadData.editedFields || {},
            assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'disabled',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
          });
        }

        const match = lsaBaggingSieveRecords.find((r) => r.date === operatingDate);
        if (match) {
          return res.status(200).json({
            success: true,
            data: [match],
            record: match,
            recordId: match._id || match.id,
            rows: match.rows,
            lockedSlots: match.lockedSlots || deriveSieveLocks(null),
            editedFields: match.editedFields || {},
            assignedOperatorEmail,
            emailStatus: 'disabled',
            emailRecipient: assignedOperatorEmail,
          });
        }

        return res.status(200).json({
          success: true,
          data: [],
          record: null,
          recordId: null,
          rows: DEFAULT_ROWS,
          lockedSlots: deriveSieveLocks(null),
          editedFields: {},
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
          message: `No record found for date ${operatingDate}`,
        });
      }

      return res.status(200).json({
        success: true,
        count: lsaBaggingSieveRecords.length,
        data: lsaBaggingSieveRecords,
      });
    } catch (error) {
      console.error('[LSABaggingSieve API] Error retrieving records:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while retrieving LSA Bagging Sieve records: ' + error.message,
      });
    }
  });

  /**
   * @desc    Retry sending email for an existing saved LSA Bagging Sieve record
   * @route   POST /api/lsa-bagging-sieve/:id/retry-email
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

const defaultRouter = createLSABaggingSieveRouter();
defaultRouter.createRouter = createLSABaggingSieveRouter;
module.exports = defaultRouter;
