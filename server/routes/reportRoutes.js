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

/**
 * @desc    Generate and download generic Plant Excel report for all 4 plants (ACL, SA, OFFSITE, CO2)
 * @route   GET /api/reports/generic?plant=<ACL|SA|OFFSITE|CO2>&date=YYYY-MM-DD
 * @access  Private (auth required; filtered by user's company and plant)
 */
router.get('/generic', async (req, res) => {
  try {
    const { plant, date } = req.query;

    // 1. Mandatory Parameters and Strict YYYY-MM-DD Date Validation
    if (!plant || !String(plant).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Plant query parameter is required (e.g. plant=ACL, SA, OFFSITE, CO2).',
      });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }

    const normPlant = String(plant).trim().toUpperCase();

    // 2. Normal user authorization: user can only download their own assigned plant report
    if (req.user && req.user.role === 'user') {
      const userPlantCode = req.user.plant?.code?.toUpperCase();
      const userPlantName = req.user.plant?.name?.toUpperCase();
      const { PLANT_ALIASES } = require('../services/genericPlantReportService');
      const plantAliases = PLANT_ALIASES[normPlant] || [normPlant];

      const hasAccess = plantAliases.some(
        (alias) =>
          alias.toUpperCase() === userPlantCode ||
          alias.toUpperCase() === userPlantName ||
          (userPlantCode && userPlantCode.includes(normPlant)) ||
          (userPlantName && userPlantName.includes(normPlant))
      );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied: You are only authorized to access reports for your assigned plant (${userPlantCode || userPlantName || 'None'}).`,
        });
      }
    }

    // 3. Generate generic report workbook (company filtering handled inside service)
    const { generateGenericPlantReportWorkbook } = require('../services/genericPlantReportService');
    const { workbook, recordCount } = await generateGenericPlantReportWorkbook({
      plant: normPlant,
      date: String(date).trim(),
      user: req.user,
    });

    // 4. Return 404 if no records found for that date
    if (!workbook || recordCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No analysis records found for plant "${plant}" on date "${date}".`,
      });
    }

    // 5. Stream download directly to client without saving to disk
    const filename = `${normPlant}_Management_Report_${date}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Generic Plant Report Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate plant report: ' + err.message,
    });
  }
});

/**
 * @desc    Generate and download combined All Plants Master Excel report (ACL, SA, OFFSITE, CO2)
 * @route   GET /api/reports/generic-all?date=YYYY-MM-DD
 * @access  Private (super_admin, company_admin, admin only)
 */
router.get('/generic-all', async (req, res) => {
  try {
    const { date } = req.query;

    // 1. Mandatory date parameter and strict YYYY-MM-DD validation
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Expected YYYY-MM-DD.',
      });
    }

    // 2. Role Authorization: super_admin, company_admin, admin only
    const allowedRoles = ['super_admin', 'company_admin', 'admin'];
    const userRole = req.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Generating the All Plants Master Report requires super_admin, company_admin, or admin privileges.',
      });
    }

    // 3. Generate combined workbook (user company filtering handled inside service)
    const { generateAllPlantsReportWorkbook } = require('../services/genericPlantReportService');
    const { workbook, totalRecordCount } = await generateAllPlantsReportWorkbook({
      date: String(date).trim(),
      user: req.user,
    });

    // 4. Return 404 if no records found across all plants
    if (!workbook || totalRecordCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No analysis records found for any plant on date "${date}".`,
      });
    }

    // 5. Stream download directly to client
    const filename = `ALL_PLANTS_Report_${date}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[All Plants Report Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate all plants report: ' + err.message,
    });
  }
});

router.route('/')
  .get(getReports)
  .post(createReport);

router.get('/:id', getReportById);

module.exports = router;

