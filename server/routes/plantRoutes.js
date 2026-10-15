const express = require('express');
const router = express.Router();
const {
  getPlants,
  getPlantById,
  updatePlantParameters,
  notifyPlantUpdate,
  retryPlantAnalysisEmail,
} = require('../controllers/plantController');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/', getPlants);
router.post('/retry-email', retryPlantAnalysisEmail);
router.get('/:id', getPlantById);
router.patch('/:id/parameters', authorizeRoles('super_admin', 'company_admin'), updatePlantParameters);
router.post('/:id/notify-update', authorizeRoles('super_admin', 'company_admin'), notifyPlantUpdate);

/**
 * @desc    Controlled, isolated live test email dispatch for ACL, SA, CO2, and OFFSITE
 * @route   POST /api/plants/test-emailjs
 * @access  Private (Super Admin Only)
 */
router.post('/test-emailjs', authorizeRoles('super_admin'), async (req, res) => {
  try {
    const ALLOWED_PLANTS = ['ACL', 'SA', 'CO2', 'OFFSITE'];
    const plantInput = (req.body?.plant || '').trim().toUpperCase();

    if (!ALLOWED_PLANTS.includes(plantInput)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plant specified: "${req.body?.plant}". Allowed plants: ${ALLOWED_PLANTS.join(', ')}`,
      });
    }

    const targetRecipient = (req.body?.recipient || 'naveensamraj2003@gmail.com').trim();
    if (!targetRecipient || !targetRecipient.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'A valid test recipient email address is required.',
      });
    }

    const { Plant } = require('../models');
    const { sendPlantAnalysisEmail } = require('../services/plantNotificationService');

    // 1. Resolve Plant Document
    const plantDoc = await Plant.findOne({
      $or: [
        { code: plantInput },
        { code: new RegExp(`^${plantInput}$`, 'i') },
        { name: new RegExp(`^${plantInput}`, 'i') },
      ],
    });

    if (!plantDoc) {
      return res.status(404).json({
        success: false,
        message: `Plant configuration for ${plantInput} not found in database.`,
      });
    }

    // 2. Fetch latest existing record for selected plant (Read-Only)
    let latestDoc = await PlantAnalysisRecord.findOne({
      plantCode: { $in: [plantInput, `${plantInput} Plant`, `${plantInput} PLANT`] },
    }).sort({ createdAt: -1 });

    if (!latestDoc && plantInput === 'ACL') {
      const { PureSaltAnalysis } = require('../models');
      const psDoc = await PureSaltAnalysis.findOne({}).sort({ createdAt: -1 });
      if (psDoc) {
        latestDoc = {
          _id: psDoc._id,
          plantCode: 'ACL',
          plantName: 'ACL Plant',
          analysisType: psDoc.analysisType || 'Pure Salt Analysis',
          date: psDoc.date,
          shift: psDoc.shift || 'All Shifts',
          data: psDoc.rows || psDoc.data,
        };
      }
    }

    if (!latestDoc) {
      return res.status(404).json({
        success: false,
        message: `No existing analysis record found for plant ${plantInput}. Test stopped to preserve data integrity.`,
      });
    }

    // 3. Dispatch through existing EmailJS HTTPS service to ONLY the test recipient
    const isTestMode = req.body?.isTestMode === true || process.env.TEST_MODE === 'true';
    const start = Date.now();

    const result = await sendPlantAnalysisEmail({
      plantDoc,
      assignedUser: { email: targetRecipient, name: `${plantInput} Test Operator` },
      recipientEmails: [targetRecipient],
      analysisType: latestDoc.analysisType,
      shift: latestDoc.shift || 'Day',
      savedRecord: latestDoc,
      excelBuffer: null,
      excelFileName: null,
      saveEventId: `controlled_test_${plantInput.toLowerCase()}_${Date.now()}`,
      isTestMode,
    });

    const elapsed = Date.now() - start;

    return res.status(result.success ? 200 : 502).json({
      success: result.success,
      elapsedMs: elapsed,
      plant: plantInput,
      analysisType: latestDoc.analysisType,
      analysisDate: latestDoc.date,
      recordId: latestDoc._id,
      recipient: targetRecipient,
      provider: result.provider || 'EmailJS HTTPS REST API',
      messageId: result.messageId,
      hasExcelAttachment: false,
      isTestMode,
      error: result.error,
    });
  } catch (err) {
    console.error('[Plant Test EmailJS Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

