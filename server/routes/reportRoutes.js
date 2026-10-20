const express = require('express');
const router = express.Router();
const {
  getReports,
  getReportById,
  exportReportsExcel,
  createReport,
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { PlantAnalysisRecord } = require('../models');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/export/excel', authorizeRoles('super_admin', 'company_admin'), exportReportsExcel);

/**
 * @desc    Generate and download Master ACL Plant Shift Report Excel (.xlsx) using SHIFT REPORT -2026.xlsx template
 * @route   GET /api/reports/acl/download
 * @access  Private
 */
router.get('/acl/download', async (req, res) => {
  try {
    const { date, shift = 'all' } = req.query;
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Reporting date (YYYY-MM-DD) is required to generate ACL report.',
      });
    }

    const { generateACLShiftReportWorkbook } = require('../services/aclExcelReportService');
    const workbook = await generateACLShiftReportWorkbook({ date, shift });

    const filename = `ACL_Master_Shift_Report_${date}_${shift}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[ACL Report Download Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate ACL Excel report: ' + err.message,
    });
  }
});

router.route('/')
  .get(getReports)
  .post(createReport);

router.get('/:id', getReportById);

module.exports = router;

