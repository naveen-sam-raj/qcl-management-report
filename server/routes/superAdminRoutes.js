const express = require('express');
const router = express.Router();
const {
  login,
  changeUsername,
  changePassword,
  getMe,
} = require('../controllers/superAdminController');
const { superAdminAuth } = require('../middleware/authMiddleware');

// Public route: Super Admin Login
router.post('/login', login);

// Protected routes (Requires valid JWT with SUPER_ADMIN role)
router.get('/me', superAdminAuth, getMe);
router.put('/change-username', superAdminAuth, changeUsername);
router.post('/change-password', superAdminAuth, changePassword);
router.put('/change-password', superAdminAuth, changePassword);

module.exports = router;
