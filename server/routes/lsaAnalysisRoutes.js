const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ActivityLog } = require('../models');

// In-memory cache storage for LSA Shift Analysis records
const lsaShiftRecords = [
  // Seed with sample matching screenshot for demonstration if table is empty
  {
    id: 'lsa_shift_seed_1',
    date: '2026-06-20',
    plant: 'SA',
    unit: 'LSA',
    analysisType: 'LSA Shift Analysis',
    userId: '231',
    shifts: {
      iShift: {
        na2co3: '99.1',
        nacl: '0.71',
        fe: '0.0030',
        na2so4: '0.000',
        vm: '0.14',
        ir: '',
        bd: '635',
        turbidity: '63',
      },
      iiShift: {
        na2co3: '99.1',
        nacl: '0.71',
        fe: '0.0029',
        na2so4: '0.000',
        vm: '0.16',
        ir: '',
        bd: '641',
        turbidity: '66',
      },
      iiiShift: {
        na2co3: '99.0',
        nacl: '0.81',
        fe: '0.0032',
        na2so4: '0.000',
        vm: '0.12',
        ir: '',
        bd: '628',
        turbidity: '66',
      },
      composite: {
        na2co3: '99.1',
        nacl: '0.74',
        fe: '0.0030',
        na2so4: '0.064',
        vm: '0.14',
        ir: '0.100',
        bd: '635',
        turbidity: '65',
      },
    },
    submittedBy: 'Shift Chemist (231)',
    submittedAt: new Date('2026-06-20T08:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save LSA Shift Analysis data
 * @route   POST /api/lsa-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save LSA Shift Analysis.',
      });
    }

    const shifts = payload.shifts || {};
    const errors = [];

    // Optional validation for decimal fields
    const numericFields = ['na2co3', 'nacl', 'fe', 'na2so4', 'vm', 'ir', 'bd', 'turbidity'];
    const shiftKeys = ['iShift', 'iiShift', 'iiiShift', 'composite'];

    shiftKeys.forEach((sKey) => {
      const shiftData = shifts[sKey] || {};
      numericFields.forEach((field) => {
        const val = shiftData[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${sKey} -> ${field.toUpperCase()} must be a valid number.`);
          }
        }
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Enter valid numbers only.',
        errors,
      });
    }

    const record = {
      id: `lsa_shift_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      unit: 'LSA',
      analysisType: 'LSA Shift Analysis',
      userId: payload.userId || req.user?.empId || req.user?.userId || '231',
      shifts,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Update existing if same date, or insert new
    const existingIndex = lsaShiftRecords.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      lsaShiftRecords[existingIndex] = { ...lsaShiftRecords[existingIndex], ...record };
    } else {
      lsaShiftRecords.unshift(record);
    }

    // Activity log entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'LSA_SHIFT_ANALYSIS_SAVED',
          user: req.user?._id,
          userName: req.user?.name,
          details: `LSA Shift Analysis saved for date: ${payload.date} (Na2CO3, NaCl, Fe, Na2SO4, VM, IR, BD, Turbidity).`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[ActivityLog] Could not log LSA Shift activity:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'LSA Shift Analysis data saved successfully.',
      data: record,
    });
  } catch (error) {
    console.error('[LSAShiftAnalysis API] Error saving data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing LSA Shift analysis: ' + error.message,
    });
  }
});

/**
 * @desc    Retrieve LSA Shift Analysis records
 * @route   GET /api/lsa-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let results = [...lsaShiftRecords];

    if (date) {
      results = results.filter((r) => r.date === date);
    } else if (startDate && endDate) {
      results = results.filter((r) => r.date >= startDate && r.date <= endDate);
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error('[LSAShiftAnalysis API] Error fetching records:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving LSA Shift analysis records.',
    });
  }
});

module.exports = router;
