const express = require('express');
const router = express.Router();
const {
  getReports,
  getReportById,
  exportReportsExcel,
  createReport,
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/export/excel', authorizeRoles('super_admin', 'company_admin'), exportReportsExcel);
router.route('/')
  .get(getReports)
  .post(createReport);

router.get('/:id', getReportById);

module.exports = router;
