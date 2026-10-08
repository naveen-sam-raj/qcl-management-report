const express = require('express');
const router = express.Router();
const { getCompanies, getCompanyById, updateCompanyStatus, createCompany } = require('../controllers/companyController');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const { authorizeRoles } = require('../middleware/rbac');

// Public or authenticated access to company list
router.get('/', getCompanies);
router.post('/', protect, authorizeRoles('super_admin'), createCompany);
router.get('/:id', getCompanyById);
router.patch('/:id/status', protect, authorizeRoles('super_admin'), updateCompanyStatus);

module.exports = router;
