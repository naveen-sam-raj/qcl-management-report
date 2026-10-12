const express = require('express');
const router = express.Router();
const { getLogs } = require('../controllers/logController');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);
router.use(authorizeRoles('super_admin', 'company_admin'));

router.get('/', getLogs);

module.exports = router;
