const express = require('express');
const router = express.Router();
const { getCompanies, getCompanyById, updateCompanyStatus } = require('../controllers/companyController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Public or authenticated access to company list
router.get('/', getCompanies);
router.get('/:id', getCompanyById);
router.patch('/:id/status', protect, authorizeRoles('super_admin'), updateCompanyStatus);

module.exports = router;
