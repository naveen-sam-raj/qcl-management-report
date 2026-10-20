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
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/', getPlants);
router.post('/retry-email', retryPlantAnalysisEmail);
router.get('/:id', getPlantById);
router.patch('/:id/parameters', authorizeRoles('super_admin', 'company_admin'), updatePlantParameters);
router.post('/:id/notify-update', authorizeRoles('super_admin', 'company_admin'), notifyPlantUpdate);

/**
 * @desc    Dedicated test endpoint (Decommissioned)
 * @route   POST /api/plants/test-emailjs
 * @access  Private (Super Admin Only)
 */
router.post('/test-emailjs', authorizeRoles('super_admin'), async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification test endpoints are disabled.',
  });
});

/**
 * @desc    Dedicated test endpoint (Decommissioned)
 * @route   POST /api/plants/test-operator-email
 * @access  Private (Super Admin Only)
 */
router.post('/test-operator-email', authorizeRoles('super_admin'), async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification test endpoints are disabled.',
  });
});

module.exports = router;
