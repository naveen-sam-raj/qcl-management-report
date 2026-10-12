const express = require('express');
const router = express.Router();
const {
  getTFLOverallAnalytics,
  getTFLOverallReportData,
  getTFLPlantAnalytics,
} = require('../controllers/tflController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/overall-analytics', authorizeRoles('super_admin', 'company_admin'), getTFLOverallAnalytics);
router.get('/overall-report', authorizeRoles('super_admin', 'company_admin'), getTFLOverallReportData);
router.get('/plant-analytics/:plantId', authorizeRoles('super_admin', 'company_admin', 'user'), getTFLPlantAnalytics);

module.exports = router;
