const express = require('express');
const router = express.Router();
const {
  getPlants,
  getPlantById,
  updatePlantParameters,
} = require('../controllers/plantController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/', getPlants);
router.get('/:id', getPlantById);
router.patch('/:id/parameters', authorizeRoles('super_admin', 'company_admin'), updatePlantParameters);

module.exports = router;
