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

/**
 * @desc    Dedicated test endpoint: sends exactly ONE email to the verified registered operator of the plant
 * @route   POST /api/plants/test-operator-email
 * @access  Private (Super Admin Only)
 */
router.post('/test-operator-email', authorizeRoles('super_admin'), async (req, res) => {
  try {
    const plantInput = (req.body?.plant || '').trim().toUpperCase();
    const UNASSIGNED_PLANTS = ['UREA', 'AMMONIA', 'DAP', 'NPK'];

    if (UNASSIGNED_PLANTS.includes(plantInput)) {
      return res.status(400).json({
        success: false,
        message: `Plant ${plantInput} currently has 0 registered operators in MongoDB. Live test blocked.`,
      });
    }

    const ALLOWED_PLANTS = ['ACL', 'SA', 'CO2', 'OFFSITE', 'SACL_6253'];
    if (!ALLOWED_PLANTS.includes(plantInput)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plant specified: "${req.body?.plant}". Allowed plants with operators: ${ALLOWED_PLANTS.join(', ')}`,
      });
    }

    const { Plant, User } = require('../models');
    const { sendPlantAnalysisEmail, resolvePlant } = require('../services/plantNotificationService');

    // 1. Resolve Plant Document
    const plantDoc = await resolvePlant(plantInput);
    if (!plantDoc) {
      return res.status(404).json({
        success: false,
        message: `Plant configuration for ${plantInput} not found in database.`,
      });
    }

    // 2. Query MongoDB users for verified active registered operators assigned to this exact plant
    const registeredOperators = await User.find({
      plant: plantDoc._id,
      role: { $in: ['user', 'operator'] },
      status: { $ne: 'disabled' },
    });

    if (!registeredOperators || registeredOperators.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No active registered operator found for plant ${plantInput} in MongoDB. Test stopped to prevent delivery to invalid recipients.`,
      });
    }

    // 3. Determine target operator
    let targetOperator = registeredOperators[0];
    const requestedEmail = (req.body?.operatorEmail || '').trim().toLowerCase();
    if (requestedEmail) {
      const matched = registeredOperators.find((op) => op.email.toLowerCase() === requestedEmail);
      if (!matched) {
        return res.status(400).json({
          success: false,
          message: `Security Violation: Specified recipient "${requestedEmail}" is not a verified registered operator for plant ${plantInput}. Allowed operators: ${registeredOperators.map((o) => o.email).join(', ')}`,
        });
      }
      targetOperator = matched;
    }

    const targetRecipient = targetOperator.email.trim();

    // 4. Fetch latest existing record for selected plant (Read-Only)
    let latestDoc = await PlantAnalysisRecord.findOne({
      $or: [
        { plant: plantDoc._id },
        { plantCode: plantInput },
        { plantCode: `${plantInput} Plant` },
        { plantCode: `${plantInput} PLANT` },
      ],
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
        message: `No existing analysis record found for plant ${plantInput}. Test stopped to preserve data integrity (zero production records inserted).`,
      });
    }

    // 5. Dispatch through existing EmailJS HTTPS service to ONLY the plant's registered operator
    const isTestMode = req.body?.isTestMode === true || process.env.TEST_MODE === 'true';
    const start = Date.now();

    const result = await sendPlantAnalysisEmail({
      plantDoc,
      assignedUser: { email: targetRecipient, name: targetOperator.name || `${plantInput} Operator` },
      recipientEmails: [targetRecipient],
      analysisType: latestDoc.analysisType,
      shift: latestDoc.shift || 'Day',
      savedRecord: latestDoc,
      excelBuffer: null,
      excelFileName: null,
      saveEventId: `operator_test_${plantInput.toLowerCase()}_${Date.now()}`,
      isTestMode,
    });

    const elapsed = Date.now() - start;

    return res.status(result.success ? 200 : 502).json({
      success: result.success,
      elapsedMs: elapsed,
      plant: plantInput,
      plantName: plantDoc.name,
      company: plantDoc.company,
      analysisType: latestDoc.analysisType,
      analysisDate: latestDoc.date,
      recordId: latestDoc._id,
      operatorId: targetOperator._id,
      operatorName: targetOperator.name,
      operatorUsername: targetOperator.username,
      recipient: targetRecipient,
      provider: result.provider || 'EmailJS HTTPS REST API',
      messageId: result.messageId,
      hasExcelAttachment: false,
      isTestMode,
      error: result.error,
    });
  } catch (err) {
    console.error('[Plant Test Operator Email Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

