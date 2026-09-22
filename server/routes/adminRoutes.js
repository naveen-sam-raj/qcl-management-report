const express = require('express');
const router = express.Router();
const {
  createCompanyAdmin,
  getCompanyAdmins,
  getSuperAdminStats,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// All admin routes strictly require Super Admin authorization
router.use(protect);
router.use(authorizeRoles('super_admin'));

router.post('/company-admins', createCompanyAdmin);
router.get('/company-admins', getCompanyAdmins);
router.get('/overview-stats', getSuperAdminStats);

module.exports = router;
