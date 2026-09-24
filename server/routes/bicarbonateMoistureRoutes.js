const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// In-memory cache storage for Bicarbonate Moisture Analysis records
const bicarbonateMoistureRecords = [
  {
    id: 'bicarb_moist_seed_1',
    date: '2026-09-13',
    plant: 'SA',
    unit: 'Bicarbonate Moisture',
    analysisType: 'Bicarbonate Moisture Analysis',
    readings: [
      { id: '1', shift: 'I SHIFT', time: '07:00', m404_a: '', m404_b: '', m404_c: '21.3', m405_outlet: '', sb_turb1: '70', sb_turb2: '74' },
      { id: '2', shift: 'II SHIFT', time: '15:00', m404_a: '', m404_b: '19.8', m404_c: '', m405_outlet: '', sb_turb1: '53', sb_turb2: '72' },
      { id: '3', shift: 'III SHIFT', time: '23:00', m404_a: '', m404_b: '23.7', m404_c: '', m405_outlet: '', sb_turb1: '72', sb_turb2: '122' },
      { id: '4', shift: 'ADDL SAPL1', time: '11:00', m404_a: '', m404_b: '24.2', m404_c: '22.3', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      { id: '5', shift: 'SAMPLE', time: '', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
    ],
    submittedBy: 'Shift Chemist',
    submittedAt: new Date('2026-09-13T06:00:00Z').toISOString(),
  },
];

// Apply authentication middleware
router.use(protect);

/**
 * @desc    Save Bicarbonate Moisture Analysis data
 * @route   POST /api/bicarbonate-moisture
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.date) {
      return res.status(400).json({
        success: false,
        message: 'Analysis Date is required to save Bicarbonate Moisture data.',
      });
    }

    const readings = Array.isArray(payload.readings) ? payload.readings : [];
    const errors = [];

    const numFields = ['m404_a', 'm404_b', 'm404_c', 'm405_outlet', 'sb_turb1', 'sb_turb2'];

    readings.forEach((reading, idx) => {
      const rowNum = idx + 1;
      const label = reading.shift || `Row #${rowNum}`;
      numFields.forEach((f) => {
        const val = reading[f];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            errors.push(`${label}: ${f} must be a valid number.`);
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
      id: `bicarb_moist_${Date.now()}`,
      date: payload.date,
      plant: payload.plant || 'SA',
      unit: payload.unit || 'Bicarbonate Moisture',
      analysisType: 'Bicarbonate Moisture Analysis',
      readings,
      submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company || 'TFL',
    };

    // Upsert by date
    const existingIndex = bicarbonateMoistureRecords.findIndex(
      (r) => r.date === payload.date && (r.plant === record.plant || !r.plant)
    );

    if (existingIndex >= 0) {
      bicarbonateMoistureRecords[existingIndex] = { ...bicarbonateMoistureRecords[existingIndex], ...record };
    } else {
      bicarbonateMoistureRecords.unshift(record);
    }

    if (bicarbonateMoistureRecords.length > 50) {
      bicarbonateMoistureRecords.pop();
    }

    return res.status(200).json({
      success: true,
      message: 'Bicarbonate Moisture Analysis saved successfully!',
      data: record,
    });
  } catch (error) {
    console.error('Error saving Bicarbonate Moisture Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving Bicarbonate Moisture Analysis.',
      error: error.message,
    });
  }
});

/**
 * @desc    Get Bicarbonate Moisture Analysis data by date
 * @route   GET /api/bicarbonate-moisture
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { date, plant } = req.query;

    if (!date) {
      return res.status(200).json({
        success: true,
        data: bicarbonateMoistureRecords.slice(0, 10),
      });
    }

    const record = bicarbonateMoistureRecords.find(
      (r) => r.date === date && (!plant || r.plant === plant)
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `No Bicarbonate Moisture record found for date: ${date}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error('Error fetching Bicarbonate Moisture Analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching Bicarbonate Moisture Analysis.',
      error: error.message,
    });
  }
});

module.exports = router;
