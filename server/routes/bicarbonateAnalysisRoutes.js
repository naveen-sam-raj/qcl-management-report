const express = require('express');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const { computeSlotTransition, pickCanonicalDoc } = require('../services/analysisLockEngine');
const { getOperatingDateIST } = require('../utils/operatingDate');

const BICARB_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];

const DEFAULT_READINGS = [
  { id: 'r1',  time: '06:30', filter: 'F-1', naclNa2co3: '', isDefault: true },
  { id: 'r2',  time: '08:30', filter: 'F-1', naclNa2co3: '', isDefault: true },
  { id: 'r3',  time: '10:30', filter: '',    naclNa2co3: '', isDefault: true },
  { id: 'r4',  time: '12:30', filter: 'F-2', naclNa2co3: '', isDefault: true },
  { id: 'r5',  time: '14:30', filter: 'F-2', naclNa2co3: '', isDefault: true },
  { id: 'r6',  time: '16:30', filter: 'F-3', naclNa2co3: '', isDefault: true },
  { id: 'r7',  time: '18:30', filter: 'F-3', naclNa2co3: '', isDefault: true },
  { id: 'r8',  time: '20:30', filter: 'F-4', naclNa2co3: '', isDefault: true },
  { id: 'r9',  time: '22:30', filter: 'F-4', naclNa2co3: '', isDefault: true },
  { id: 'r10', time: '00:30', filter: 'F-5', naclNa2co3: '', isDefault: true },
  { id: 'r11', time: '02:30', filter: 'F-5', naclNa2co3: '', isDefault: true },
  { id: 'r12', time: '04:30', filter: '',    naclNa2co3: '', isDefault: true },
];

const LOCK_FIELDS = ['filter', 'naclNa2co3'];

const fieldDisplayNames = {
  filter: 'Filter',
  naclNa2co3: 'NaCl / Na₂CO₃ (%)',
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
  const idStr = String(row.id || '').trim();
  if (BICARB_SLOTS.includes(idStr)) return idStr;
  if (/^\d+$/.test(idStr)) {
    const num = parseInt(idStr, 10);
    if (num >= 1 && num <= 12) return `r${num}`;
  }
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
  const filterEmpty = !slotObj.filter || String(slotObj.filter).trim() === '';
  const naclEmpty = slotObj.naclNa2co3 === undefined || slotObj.naclNa2co3 === null || String(slotObj.naclNa2co3).trim() === '';
  return filterEmpty && naclEmpty;
}

function deriveBicarbonateLocks(existingDoc) {
  const existingData = existingDoc?.data || {};
  const storedSlots = existingData.lockedSlots || {};
  const lockedSlots = {};

  for (let i = 0; i < BICARB_SLOTS.length; i++) {
    const sk = BICARB_SLOTS[i];
    const numKey = String(i + 1);
    const defaultRow = DEFAULT_READINGS[i];
    const s = storedSlots[sk] || storedSlots[numKey] || (defaultRow?.time ? storedSlots[defaultRow.time] : null);
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
  for (let i = 0; i < BICARB_SLOTS.length - 1; i++) {
    const cur = BICARB_SLOTS[i];
    const nxt = BICARB_SLOTS[i + 1];
    if (lockedSlots[nxt].isSaved) {
      lockedSlots[cur].isLocked = true;
    }
  }

  return lockedSlots;
}

// In-memory cache storage for Bi Carbonate Analysis records
const bicarbonateRecords = [];

function createBicarbonateRouter({ getNow = () => new Date() } = {}) {
  const router = express.Router();

  // Apply authentication middleware
  router.use(protect);

  /**
   * @desc    Save or edit SA Plant Bi Carbonate NaCl/Na2CO3 Analysis data
   * @route   POST /api/bicarbonate-analysis
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
          message: 'Analysis Date is required to save Bi Carbonate Analysis.',
        });
      }

      // 2. Strict Operating Date Enforcement (06:00 to 06:00 IST)
      const now = getNow();
      const operatingDate = getOperatingDateIST(now);

      if (payload.date !== operatingDate) {
        return res.status(400).json({
          success: false,
          message: `Date restriction enforced: Bi Carbonate Analysis records can only be created or modified for current operating day (${operatingDate}). Received: ${payload.date}`,
        });
      }

      const incomingReadings = Array.isArray(payload.readings) ? payload.readings : [];

      // Validate numeric values if entered
      const errors = [];
      incomingReadings.forEach((reading, idx) => {
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

      // 3. Query existing record in MongoDB using pickCanonicalDoc
      const companyId = req.user?.company?._id || req.user?.company || null;
      const query = {
        plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
        analysisType: {
          $in: [
            'Bi Carbonate NaCl/Na2CO3 Analysis',
            'Bi Carbonate NaCl/Na₂CO₃ Analysis',
            'Bi Carbonate Analysis',
            'Bicarbonate Analysis',
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
      const existingReadings = Array.isArray(existingData.readings) ? existingData.readings : [];

      // Reconstruct existing slot readings
      const existingSlots = {};
      for (const sk of BICARB_SLOTS) {
        const row = existingReadings.find(r => getSlotKeyFromRow(r) === sk) || DEFAULT_READINGS.find(r => r.id === sk);
        existingSlots[sk] = {
          filter: row?.filter ?? '',
          naclNa2co3: row?.naclNa2co3 ?? '',
        };
      }

      // Reconstruct incoming slot readings
      const incomingSlots = {};
      for (const sk of BICARB_SLOTS) {
        const row = incomingReadings.find(r => getSlotKeyFromRow(r) === sk);
        if (row) {
          incomingSlots[sk] = {
            filter: row.filter ?? '',
            naclNa2co3: row.naclNa2co3 ?? '',
          };
        } else {
          incomingSlots[sk] = { ...existingSlots[sk] };
        }
      }

      // Identify changed slots
      const changedSlots = [];
      for (const sk of BICARB_SLOTS) {
        const ex = existingSlots[sk];
        const inc = incomingSlots[sk];
        const hasDiff = LOCK_FIELDS.some(f => isValDiff(ex[f], inc[f]));
        if (hasDiff) {
          changedSlots.push(sk);
        }
      }

      const currentLockedSlots = deriveBicarbonateLocks(existingDoc);
      const hasAnySaved = BICARB_SLOTS.some(sk => currentLockedSlots[sk].isSaved);

      // Handle 0 changed slots
      if (changedSlots.length === 0) {
        if (!existingDoc || !hasAnySaved) {
          const targetCandidate = payload.targetSlot || (incomingReadings.length > 0 ? getSlotKeyFromRow(incomingReadings[0]) : 'r1') || 'r1';
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
          readings: existingReadings,
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
      for (const u of BICARB_SLOTS) {
        if (u === targetSlot) {
          incomingSlotRows[u] = incomingSlots[u] || {};
        } else if (existingSlots[u] !== undefined) {
          incomingSlotRows[u] = existingSlots[u];
        }
      }

      // Predecessor Sequence Check
      const targetIdx = BICARB_SLOTS.indexOf(targetSlot);
      if (targetIdx > 0) {
        for (let p = 0; p < targetIdx; p++) {
          const prevKey = BICARB_SLOTS[p];
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
        unitsOrder: BICARB_SLOTS,
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
          readings: existingReadings,
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
          const prevSlot = BICARB_SLOTS[targetIdx - 1];
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
      const saveEventId = `bicarb_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (isCorrection) {
        const targetRowObj = incomingReadings.find(r => getSlotKeyFromRow(r) === targetSlot) || DEFAULT_READINGS.find(r => r.id === targetSlot);
        for (const pk of LOCK_FIELDS) {
          if (isValDiff(existingSlots[targetSlot][pk], incomingSlots[targetSlot][pk])) {
            if (!updatedEditedFields[targetSlot]) updatedEditedFields[targetSlot] = {};
            updatedEditedFields[targetSlot][pk] = true;

            const originalId = targetRowObj?.id || String(targetIdx + 1);
            if (!updatedEditedFields[originalId]) updatedEditedFields[originalId] = {};
            updatedEditedFields[originalId][pk] = true;

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
              editor: req.user?.name || payload.submittedBy || 'Shift Chemist',
              timestamp: nowIso,
              saveEventId,
            });
          }
        }
      }

      // Reconstruct updated readings array
      const updatedReadings = [];
      DEFAULT_READINGS.forEach((defRow, idx) => {
        const sk = defRow.id;
        const incRow = incomingReadings.find(r => getSlotKeyFromRow(r) === sk);
        const exRow = existingReadings.find(r => getSlotKeyFromRow(r) === sk);
        const idToStore = incRow?.id || exRow?.id || defRow.id;
        updatedReadings.push({
          id: idToStore,
          time: defRow.time,
          filter: incomingSlots[sk]?.filter ?? exRow?.filter ?? defRow.filter ?? '',
          naclNa2co3: incomingSlots[sk]?.naclNa2co3 ?? exRow?.naclNa2co3 ?? '',
          isDefault: true,
        });
      });

      // Preserve legacy extra / custom readings
      const customReadings = existingReadings.filter(r => !DEFAULT_READINGS.some(d => d.id === r.id || getSlotKeyFromRow(d) === getSlotKeyFromRow(r)));
      for (const cr of customReadings) {
        if (!updatedReadings.some(r => r.id === cr.id)) {
          updatedReadings.push(cr);
        }
      }

      const recordPayload = {
        id: existingDoc?._id ? existingDoc._id.toString() : `bicarb_${Date.now()}`,
        date: operatingDate,
        plant: 'SA',
        plantCode: 'SA',
        unit: 'Bi carbonate',
        section: 'Soda Ash Production',
        analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
        readings: updatedReadings,
        lockedSlots: updatedLockedSlots,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        submittedBy: req.user?.name || payload.submittedBy || 'Shift Chemist',
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
              'Bi Carbonate NaCl/Na2CO3 Analysis',
              'Bi Carbonate NaCl/Na₂CO₃ Analysis',
              'Bi Carbonate Analysis',
              'Bicarbonate Analysis',
            ],
          },
          date: operatingDate,
        };
      }

      const updateOp = {
        $set: {
          plantName: 'SA Plant',
          plantCode: 'SA',
          analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
          unit: 'Bi carbonate',
          date: operatingDate,
          'data.readings': updatedReadings,
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
          shift: 'Hourly / Time Slots',
          company: companyId,
          'data.date': operatingDate,
          'data.plant': 'SA',
          'data.plantCode': 'SA',
          'data.analysisType': 'Bi Carbonate NaCl/Na2CO3 Analysis',
          'data.unit': 'Bi carbonate',
          'data.section': 'Soda Ash Production',
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
              'Bi Carbonate NaCl/Na2CO3 Analysis',
              'Bi Carbonate NaCl/Na₂CO₃ Analysis',
              'Bi Carbonate Analysis',
              'Bicarbonate Analysis',
            ],
          },
          date: operatingDate,
        }).lean();
      } catch (dbErr) {
        if (dbErr.code === 11000) {
          return res.status(409).json({
            success: false,
            message: 'Conflict: Concurrent creation of Bi Carbonate record detected.',
          });
        }
        console.error('[Bi Carbonate Save] Database persistence failure:', dbErr);
        return res.status(500).json({
          success: false,
          message: 'Database persistence failed: ' + dbErr.message,
        });
      }

      // Keep memory cache updated
      const cachedIdx = bicarbonateRecords.findIndex((r) => r.date === operatingDate);
      if (cachedIdx >= 0) {
        bicarbonateRecords[cachedIdx] = recordPayload;
      } else {
        bicarbonateRecords.unshift(recordPayload);
      }

      return res.status(200).json({
        success: true,
        message: 'Bi Carbonate Analysis saved successfully in MongoDB ✓',
        data: recordPayload,
        record: recordPayload,
        recordId: savedRecordDoc?._id || recordPayload.id,
        readings: updatedReadings,
        lockedSlots: updatedLockedSlots,
        emailStatus: 'disabled',
        emailDeliveryStatus: 'disabled',
        emailRecipient: null,
        editedFields: updatedEditedFields,
        editAuditHistory: updatedAuditHistory,
        saveEventId,
      });
    } catch (error) {
      console.error('Error in POST /api/bicarbonate-analysis:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save Bi Carbonate Analysis record: ' + error.message,
        error: error.message,
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
      const now = getNow();
      const operatingDate = req.query.date || getOperatingDateIST(now);

      let assignedOperatorEmail = null;
      try {
        const { getPlantAssignedUser } = require('../services/plantNotificationService');
        const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA');
        assignedOperatorEmail = primaryEmail || assignedUser?.email || null;
      } catch (uErr) {}

      if (operatingDate) {
        const query = {
          date: operatingDate,
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

        let doc = null;
        if (PlantAnalysisRecord) {
          const docs = await PlantAnalysisRecord.find(query).lean();
          doc = pickCanonicalDoc(docs);
        }

        if (doc) {
          const payloadData = doc.data || {};
          const lockedSlots = deriveBicarbonateLocks(doc);
          const rawReadings = Array.isArray(payloadData.readings)
            ? payloadData.readings
            : Array.isArray(doc.readings)
            ? doc.readings
            : [];

          // Merge into template, preserving any extra legacy rows
          const readings = DEFAULT_READINGS.map((defRow, idx) => {
            const sk = defRow.id;
            const match = rawReadings.find(r => getSlotKeyFromRow(r) === sk || r.id === sk || r.id === String(idx + 1));
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
          const customReadings = rawReadings.filter(r => !DEFAULT_READINGS.some(d => d.id === r.id || getSlotKeyFromRow(d) === getSlotKeyFromRow(r)));
          for (const cr of customReadings) {
            if (!readings.some(r => r.id === cr.id)) {
              readings.push(cr);
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
              readings,
              lockedSlots,
              editedFields: payloadData.editedFields || {},
              editAuditHistory: payloadData.editAuditHistory || [],
              submittedBy: doc.submittedBy,
            },
            record: doc,
            recordId: doc._id,
            readings,
            lockedSlots,
            editedFields: payloadData.editedFields || {},
            assignedOperatorEmail,
            emailStatus: doc.emailStatus || 'disabled',
            emailRecipient: doc.emailRecipient || assignedOperatorEmail,
          });
        }

        const match = bicarbonateRecords.find((r) => r.date === operatingDate);
        if (match) {
          return res.status(200).json({
            success: true,
            data: match,
            record: match,
            recordId: match._id || match.id,
            readings: match.readings,
            lockedSlots: match.lockedSlots || deriveBicarbonateLocks(null),
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
          readings: DEFAULT_READINGS,
          lockedSlots: deriveBicarbonateLocks(null),
          editedFields: {},
          assignedOperatorEmail,
          emailStatus: 'disabled',
          emailRecipient: assignedOperatorEmail,
          message: `No record found for date ${operatingDate}`,
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

  return router;
}

const defaultRouter = createBicarbonateRouter();
defaultRouter.createRouter = createBicarbonateRouter;
module.exports = defaultRouter;
