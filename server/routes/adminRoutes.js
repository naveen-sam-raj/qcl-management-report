const express = require('express');
const router = express.Router();
const {
  createCompanyAdmin,
  getCompanyAdmins,
  updateCompanyAdmin,
  getSuperAdminStats,
  resetCompanyAdminPassword,
  deleteCompanyAdmin,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// All admin routes strictly require Super Admin authorization
router.use(protect);
router.use(authorizeRoles('super_admin'));

router.post('/company-admins', createCompanyAdmin);
router.get('/company-admins', getCompanyAdmins);
router.put('/company-admins/:id', updateCompanyAdmin);
router.post('/company-admins/:id/reset-password', resetCompanyAdminPassword);
router.delete('/company-admins/:id', deleteCompanyAdmin);
router.get('/overview-stats', getSuperAdminStats);

module.exports = router;

