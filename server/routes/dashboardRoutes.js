const express = require('express');
const router = express.Router();
const { getLiveDashboardData } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

/**
 * @route   GET /api/dashboard/live?from=YYYY-MM-DD&to=YYYY-MM-DD
 * @desc    Get live operational parameter time-series, limit bands, and compliance status
 * @access  Private (super_admin, company_admin, admin, user)
 */
router.get(
  '/live',
  authorizeRoles('super_admin', 'company_admin', 'admin', 'user'),
  getLiveDashboardData
);

module.exports = router;
