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

module.exports = router;
