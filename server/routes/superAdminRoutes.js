const express = require('express');
const router = express.Router();
const {
  login,
  changeUsername,
  changePassword,
  getMe,
} = require('../controllers/superAdminController');
const { resetCompanyAdminPassword } = require('../controllers/adminController');
const { superAdminAuth } = require('../middleware/authMiddleware');

// Public route: Super Admin Login
router.post('/login', login);

// Protected routes (Requires valid JWT with SUPER_ADMIN role)
router.get('/me', superAdminAuth, getMe);
router.put('/change-username', superAdminAuth, changeUsername);
router.post('/change-password', superAdminAuth, changePassword);
router.put('/change-password', superAdminAuth, changePassword);

// Reset Company Admin Password
router.post('/admins/:id/reset-password', superAdminAuth, resetCompanyAdminPassword);
router.put('/admins/:id/reset-password', superAdminAuth, resetCompanyAdminPassword);

module.exports = router;
