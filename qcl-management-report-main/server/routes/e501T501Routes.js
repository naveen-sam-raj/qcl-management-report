const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// In-memory cache storage for E 501 / T 501 Analysis records
const e501T501Records = [
  {
    id: 'e501_t501_seed_1',
    date: '2026-09-13',
    plant: 'SA',
    unit: 'E 501 / T 501',
    analysisType: 'E 501 / T 501 Analysis',
    readings: [
      { id: '1', shift: 'I', e501_fnh3: '29.9', e501_na2co3: '03.7', t501_fnh3: '04.8', t501_na2co3: '18.6' },
      { id: '2', shift: 'II', e501_fnh3: '', e501_na2co3: '', t501_fnh3: '03.4', t501_na2co3: '70.5' },
      { id: '3', shift: 'III', e501_fnh3: '', e501_na2co3: '', t501_fnh3: '04.1', t501_na2co3: '44.5' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T06:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save E 501 / T 501 Analysis data
 * @route   POST /api/e501-t501-analysis
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save E 501 / T 501 Analysis.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];
    const numFields = ['e501_fnh3', 'e501_na2co3', 't501_fnh3', 't501_na2co3'];

    readings.forEach((reading, idx) => {
      const rowLabel = reading.shift ? `Shift ${reading.shift}` : `Row #${idx + 1}`;
      numFields.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${rowLabel}: ${f} must be a valid number.`);
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

    const record = {
      id: `e501_t501_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      unit: payload.unit || 'E 501 / T 501',
      analysisType: 'E 501 / T 501 Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = e501T501Records.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      e501T501Records[existingIndex] = { ...e501T501Records[existingIndex], ...record };
    } else {
      e501T501Records.unshift(record);
    }

    if (e501T501Records.length > 50) {
      e501T501Records.pop();
    }

    return res.status(200).json({
      success: true,
      message: 'E 501 / T 501 Analysis saved successfully!',
      data: record,
    });
  } catch (error) {
    console.error('Error saving E 501 / T 501 Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving E 501 / T 501 Analysis.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get E 501 / T 501 Analysis data by date
 * @route   GET /api/e501-t501-analysis
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    if (!date) {
      return res.status(200).json({
        success: true,
        data: e501T501Records.slice(0, 10),
      });
    }

    const record = e501T501Records.find(
      (r) => r.date === date && (!plant || r.plant === plant)
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `No E 501 / T 501 record found for date: ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error('Error fetching E 501 / T 501 Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching E 501 / T 501 Analysis.',
      error: error.message,
    });
  }
});

module.exports = router;
