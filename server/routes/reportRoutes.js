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
 * Helper to build unique sheet names for multi-date plant workbooks
 * Format: `${baseName.slice(0,25).trim()} ${dd-MM}` (max 31 chars)
 */
function formatMultiDateSheetName(baseName, dateStr, existingNames) {
  const parts = dateStr.split('-');
  const ddMM = parts.length === 3 ? `${parts[2]}-${parts[1]}` : dateStr.slice(-5);
  let cleanBase = (baseName || 'Sheet')
    .replace(/[/\\?*[\]:]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25)
    .trim();

  let candidate = `${cleanBase} ${ddMM}`.slice(0, 31).trim();

  if (!existingNames.has(candidate.toLowerCase())) {
    existingNames.add(candidate.toLowerCase());
    return candidate;
  }

  let counter = 1;
  while (true) {
    const suffix = `_${counter}`;
    const base = candidate.slice(0, 31 - suffix.length);
    const withSuffix = `${base}${suffix}`;
    if (!existingNames.has(withSuffix.toLowerCase())) {
      existingNames.add(withSuffix.toLowerCase());
      return withSuffix;
    }
    counter++;
  }
}

/**
 * Copies all elements of a worksheet into a target worksheet across ExcelJS workbooks
 */
function copyWorksheet(srcSheet, dstSheet) {
  dstSheet.properties = JSON.parse(JSON.stringify(srcSheet.properties || {}));
  dstSheet.pageSetup = JSON.parse(JSON.stringify(srcSheet.pageSetup || {}));
  dstSheet.views = JSON.parse(JSON.stringify(srcSheet.views || []));

  if (srcSheet.columns && Array.isArray(srcSheet.columns)) {
    dstSheet.columns = srcSheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
      style: col.style ? JSON.parse(JSON.stringify(col.style)) : undefined,
    }));
  }

  srcSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const dstRow = dstSheet.getRow(rowNumber);
    dstRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const dstCell = dstRow.getCell(colNumber);
      dstCell.value = cell.value;
      if (cell.numFmt) dstCell.numFmt = cell.numFmt;
      if (cell.font) dstCell.font = JSON.parse(JSON.stringify(cell.font));
      if (cell.alignment) dstCell.alignment = JSON.parse(JSON.stringify(cell.alignment));
      if (cell.border) dstCell.border = JSON.parse(JSON.stringify(cell.border));
      if (cell.fill) dstCell.fill = JSON.parse(JSON.stringify(cell.fill));
      if (cell.note) dstCell.note = cell.note;
    });
  });

  if (srcSheet.model && Array.isArray(srcSheet.model.merges)) {
    for (const merge of srcSheet.model.merges) {
      try {
        dstSheet.mergeCells(merge);
      } catch (mergeErr) {
        // Ignore duplicate merge collision
      }
    }
  }
}

/**
 * @desc    Generate and download multi-date generic Plant Excel report (one .xlsx with separate sheets per date)
 * @route   GET /api/reports/generic-range?plant=<ACL|SA|OFFSITE|CO2>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * @access  Private (auth required; filtered by user's company and plant)
 */
router.get('/generic-range', async (req, res) => {
  try {
    const { plant, from, to } = req.query;

    // 1. Mandatory Parameters and Strict YYYY-MM-DD Date Validation
    if (!plant || !String(plant).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Plant query parameter is required (e.g. plant=ACL, SA, OFFSITE, CO2).',
      });
    }

    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(String(from).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing "from" date. Expected YYYY-MM-DD.',
      });
    }

    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing "to" date. Expected YYYY-MM-DD.',
      });
    }

    const fromDateStr = String(from).trim();
    const toDateStr = String(to).trim();

    if (fromDateStr > toDateStr) {
      return res.status(400).json({
        success: false,
        message: '"from" date must be earlier than or equal to "to" date.',
      });
    }

    const diffDays = Math.ceil((new Date(toDateStr) - new Date(fromDateStr)) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      return res.status(400).json({
        success: false,
        message: 'Date range cannot exceed 31 days.',
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

    // 3. Build array of sequential dates [from..to]
    const dates = [];
    const curr = new Date(`${fromDateStr}T00:00:00Z`);
    const end = new Date(`${toDateStr}T00:00:00Z`);
    while (curr <= end) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // 4. Create Master ExcelJS Workbook
    const ExcelJS = require('exceljs');
    const masterWorkbook = new ExcelJS.Workbook();
    masterWorkbook.creator = 'QCL Management Report System';
    masterWorkbook.created = new Date();

    const { generateGenericPlantReportWorkbook } = require('../services/genericPlantReportService');
    const usedSheetNames = new Set();
    let totalCopiedSheets = 0;

    for (const d of dates) {
      const { workbook, recordCount } = await generateGenericPlantReportWorkbook({
        plant: normPlant,
        date: d,
        user: req.user,
      });

      if (workbook && recordCount > 0 && Array.isArray(workbook.worksheets) && workbook.worksheets.length > 0) {
        for (const srcSheet of workbook.worksheets) {
          const sheetName = formatMultiDateSheetName(srcSheet.name, d, usedSheetNames);
          const dstSheet = masterWorkbook.addWorksheet(sheetName);
          copyWorksheet(srcSheet, dstSheet);
          totalCopiedSheets++;
        }
      }
    }

    // 5. If no date had records, return 404 before sending headers
    if (totalCopiedSheets === 0) {
      return res.status(404).json({
        success: false,
        message: `No analysis records found for plant "${plant}" between "${fromDateStr}" and "${toDateStr}".`,
      });
    }

    // 6. Stream workbook directly to response
    const filename = `${normPlant}_Report_${fromDateStr}_to_${toDateStr}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await masterWorkbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Generic Plant Range Report Error]:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate plant report range: ' + err.message,
      });
    }
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

/**
 * @desc    Generate and download multi-day Overall Report (manager shift sheet) for all plants
 * @route   GET /api/reports/generic-overall?from=YYYY-MM-DD&to=YYYY-MM-DD
 * @access  Private (super_admin, company_admin, admin only)
 */
router.get('/generic-overall', async (req, res) => {
  try {
    const { from, to } = req.query;

    // 1. Mandatory date parameters and strict YYYY-MM-DD validation
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(String(from).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing "from" date. Expected YYYY-MM-DD.',
      });
    }

    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing "to" date. Expected YYYY-MM-DD.',
      });
    }

    const fromDateStr = String(from).trim();
    const toDateStr = String(to).trim();

    if (fromDateStr > toDateStr) {
      return res.status(400).json({
        success: false,
        message: '"from" date must be earlier than or equal to "to" date.',
      });
    }

    const diffDays = Math.ceil((new Date(toDateStr) - new Date(fromDateStr)) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      return res.status(400).json({
        success: false,
        message: 'Date range cannot exceed 31 days.',
      });
    }

    // 2. Role Authorization: super_admin, company_admin, admin only
    const allowedRoles = ['super_admin', 'company_admin', 'admin'];
    const userRole = req.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Generating the Overall Report requires super_admin, company_admin, or admin privileges.',
      });
    }

    // 3. Generate Overall Report workbook
    const { generateOverallReportWorkbook } = require('../services/genericPlantReportService');
    const { workbook, totalRecordCount } = await generateOverallReportWorkbook({
      from: fromDateStr,
      to: toDateStr,
      user: req.user,
    });

    if (!workbook || totalRecordCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No analysis records found for any plant between "${fromDateStr}" and "${toDateStr}".`,
      });
    }

    // 4. Stream download directly to client
    const filename = `OVERALL_Report_${fromDateStr}_${toDateStr}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Overall Report Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate overall report: ' + err.message,
    });
  }
});

router.route('/')
  .get(getReports)
  .post(createReport);

router.get('/:id', getReportById);

module.exports = router;

