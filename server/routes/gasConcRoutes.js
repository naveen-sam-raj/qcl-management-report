const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog, PlantAnalysisRecord } = require('../models');
const { generateGasConcExcel } = require('../services/excelService');
const { sendPlantUpdateNotification } = require('../services/plantNotificationService');

// Seed/reference initial rows provided by user specifications
const SEED_ROWS = [
  // 26.05.2022 block
  { id: 'gc-1', date: '2022-05-26', displayDate: '26.05.2022', time: '10:00', seal: 'NOT OK', recoveryCo2Con: '46',   cleaningGas: '5',    bottomGas: '63' },
  { id: 'gc-2', date: '2022-05-26', displayDate: '',           time: '12:00', seal: 'NOT OK', recoveryCo2Con: '37.5', cleaningGas: '8',    bottomGas: '' },
  { id: 'gc-3', date: '2022-05-26', displayDate: '',           time: '16:00', seal: 'NOT OK', recoveryCo2Con: '38',   cleaningGas: '12',   bottomGas: '75' },
  { id: 'gc-4', date: '2022-05-26', displayDate: '',           time: '18:00', seal: 'NOT OK', recoveryCo2Con: '42',   cleaningGas: '11.5', bottomGas: '62' },
  { id: 'gc-5', date: '2022-05-26', displayDate: '',           time: '20:00', seal: 'NOT OK', recoveryCo2Con: '41',   cleaningGas: '11',   bottomGas: '69' },

  // 27-05-2022 block
  { id: 'gc-6', date: '2022-05-27', displayDate: '27-05-2022', time: '06:30', seal: 'NOT OK', recoveryCo2Con: '50.5', cleaningGas: '10',   bottomGas: '67.5' },
  { id: 'gc-7', date: '2022-05-27', displayDate: '',           time: '10:00', seal: 'NOT OK', recoveryCo2Con: '51.5', cleaningGas: '23',   bottomGas: '69' },
  { id: 'gc-8', date: '2022-05-27', displayDate: '',           time: '15:30', seal: 'NOT OK', recoveryCo2Con: '49.5', cleaningGas: '20.5', bottomGas: '64.5' },
  { id: 'gc-9', date: '2022-05-27', displayDate: '',           time: '21:00', seal: 'NOT OK', recoveryCo2Con: '48',   cleaningGas: '17.5', bottomGas: '60.5' },
];

// In-memory fallback cache
const gasConcRecords = [
  {
    id: 'gas_conc_seed_1',
    date: '2022-05-26',
    endDate: '2022-05-27',
    plant: 'SA',
    plantName: 'Soda Ash Plant',
    plantCode: 'SA',
    unit: 'Gas Conc.',
    analysisType: 'Gas Conc. Analysis',
    rows: SEED_ROWS,
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2022-05-27T22:00:00Z').toISOString(),
  },
];

// Apply auth middleware
router.use(protect);

/**
 * @desc    Get Gas Conc. Analysis records
 * @route   GET /api/gas-conc
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    // Check MongoDB first
    let mongoRecords = [];
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.find === 'function') {
        const query = { analysisType: 'Gas Conc. Analysis' };
        if (date) query.date = date;
        mongoRecords = await PlantAnalysisRecord.find(query).sort({ createdAt: -1 }).limit(20).lean();
      }
    } catch (e) {
      console.warn('[GasConc] Mongo lookup fallback:', e.message);
    }

    if (mongoRecords && mongoRecords.length > 0) {
      return res.status(200).json({
        success: true,
        data: mongoRecords.map((r) => ({
          id: r._id,
          date: r.date,
          plant: r.plantCode || 'SA',
          unit: r.unit || 'Gas Conc.',
          analysisType: r.analysisType,
          rows: r.data?.rows || [],
          submittedBy: r.submittedBy,
          submittedAt: r.createdAt || r.updatedAt,
        })),
      });
    }

    // Return in-memory cached records
    let result = gasConcRecords;
    if (date) {
      result = gasConcRecords.filter((r) => r.date === date || r.rows?.some((row) => row.date === date));
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[GasConc] Error fetching data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching Gas Conc. Analysis data.',
      error: error.message,
    });
  }
});

/**
 * @desc    Save Gas Conc. Analysis records
 * @route   POST /api/gas-conc
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const { sendAnalysisNotification } = require('../services/emailService');
    payload.plant = 'SA';
    payload.analysisType = 'Gas Conc';
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }
  

    if (!payload) {
      return res.status(400).json({
        success: false,
        message: 'Payload is required.',
      });
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : (Array.isArray(payload.readings) ? payload.readings : []);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one row of Gas Conc. readings is required.',
      });
    }

    // Resolve date inheritance and perform basic input validation
    // Removed cache
    let lastValidDate = payload.date || '';

    const validatedRows = rows.map((r, idx) => {
      const rowNum = idx + 1;
      let rowDate = (r.date || '').trim();

      if (rowDate) {
        lastValidDate = rowDate;
      } else if (lastValidDate) {
        rowDate = lastValidDate; // inherit from previous row
      }

      // Numeric validations (No limits checking - basic number formatting only)
      ['recoveryCo2Con', 'cleaningGas', 'bottomGas'].forEach((field) => {
        const val = r[field];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Row ${rowNum}: ${field} must be a valid number.`);
          }
        }
      });

      // SEAL validation (OK or NOT OK)
      const seal = (r.seal || '').trim().toUpperCase();
      if (seal && seal !== 'OK' && seal !== 'NOT OK') {
        errors.push(`Row ${rowNum}: SEAL must be either OK or NOT OK.`);
      }

      return {
        id: r.id || `gc_${Date.now()}_${idx}`,
        date: rowDate,
        displayDate: r.displayDate || (r.date ? r.date : ''),
        time: r.time || '',
        seal: seal || 'NOT OK',
        recoveryCo2Con: r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined ? String(r.recoveryCo2Con) : '',
        cleaningGas: r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined ? String(r.cleaningGas) : '',
        bottomGas: r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined ? String(r.bottomGas) : '',
      };
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please verify numeric and format entries.',
        errors,
      });
    }

    const recordDate = payload.date || validatedRows[0]?.date || new Date().toISOString().split('T')[0];

    const record = {
      id: `gas_conc_${Date.now()}`,
      date: recordDate,
      plant: 'SA',
      plantName: 'Soda Ash Plant',
      plantCode: 'SA',
      unit: 'Gas Conc.',
      analysisType: 'Gas Conc. Analysis',
      rows: validatedRows,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id || null,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || null,
    };

    // 1. Save to MongoDB via PlantAnalysisRecord
    let savedToMongo = false;
    try {
      if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findOneAndUpdate === 'function') {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: 'SA',
            analysisType: 'Gas Conc. Analysis',
            date: recordDate,
          },
          {
            plantName: 'Soda Ash Plant',
            plantCode: 'SA',
            analysisType: 'Gas Conc. Analysis',
            unit: 'Gas Conc.',
            date: recordDate,
            data: { rows: validatedRows },
            submittedBy: record.submittedBy,
            submittedById: record.submittedById,
            company: record.company,
          },
          { upsert: true, new: true }
        );
        savedToMongo = true;
      }
    } catch (dbErr) {
      console.warn('[GasConc] MongoDB save warning (using memory cache):', dbErr.message);
    }

    // 2. Cache in memory
    const existingIdx = gasConcRecords.findIndex((r) => r.date === recordDate);
    if (existingIdx >= 0) {
      gasConcRecords[existingIdx] = { ...gasConcRecords[existingIdx], ...record };
    } else {
      
    let savedRecord;
    try {
      if (PlantAnalysisRecord) {
        savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: 'SA',
            analysisType: 'Gas Conc',
            date: payload.date,
            shift: payload.shift || ''
          },
          {
            $set: {
              plantName: 'SA Plant',
              plantCode: 'SA',
              analysisType: 'Gas Conc',
              date: payload.date,
              shift: payload.shift || '',
              data: record,
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              company: req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending'
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else { throw new Error("Model missing"); }
    } catch (dbErr) {
      console.error('DB Save Error:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed' });
    }
    try {
      if (savedRecord) sendAnalysisNotification(savedRecord).catch(e => console.error(e));
    } catch(e) {}
  
    }

    // 3. Log Activity
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'GAS_CONC_SAVED',
          user: req.user?._id,
          userName: req.user?.name || record.submittedBy,
          details: `Gas Conc. Analysis saved for date: ${recordDate} (${validatedRows.length} rows recorded).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[GasConc] Activity log error:', logErr.message);
    }

    // 4. Generate Excel Report via ExcelJS
    let excelResult = null;
    try {
      excelResult = await generateGasConcExcel({
        ...record,
        rows: validatedRows,
      });
    } catch (excelErr) {
      console.error('[GasConc] Excel generation error:', excelErr);
    }

    // 5. Trigger Plant Update Email Notification
    let notificationResult = null;
    try {
      notificationResult = await sendPlantUpdateNotification({
        plant: 'SA',
        whatUpdated: 'Gas Conc. Analysis',
        updatedBy: record.submittedBy,
        dateTime: new Date(),
        details: `Gas Conc. Analysis updated for ${recordDate} with ${validatedRows.length} observations.`,
        excelBuffer: excelResult?.buffer,
        excelFileName: excelResult?.filename,
      });
    } catch (notifErr) {
      console.warn('[GasConc] Plant notification email error:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Gas Conc. Analysis saved successfully!',
      data: record,
      savedToMongo,
      excel: excelResult ? { filename: excelResult.filename, base64: excelResult.base64 } : null,
      emailSent: notificationResult?.success || false,
    });
  } catch (error) {
    console.error('[GasConc] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving Gas Conc. Analysis.',
      error: error.message,
    });
  }
});

/**
 * @desc    Export Gas Conc. Analysis to Excel (.xlsx) file download
 * @route   GET /api/gas-conc/export
 * @access  Private
 */
router.get('/export', async (req, res) => {
  try {
    const { date } = req.query;

    let targetRows = SEED_ROWS;
    if (gasConcRecords.length > 0) {
      if (date) {
        const found = gasConcRecords.find((r) => r.date === date);
        if (found && found.rows) targetRows = found.rows;
      } else {
        targetRows = gasConcRecords[0]?.rows || SEED_ROWS;
      }
    }

    const excelResult = await generateGasConcExcel({
      date: date || '2022-05-26',
      plant: 'SA',
      submittedBy: req.user?.name || 'Shift Chemist',
      rows: targetRows,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
    return res.send(excelResult.buffer);
  } catch (err) {
    console.error('[GasConc] Export download error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate Excel export file.',
      error: err.message,
    });
  }
});

module.exports = router;
