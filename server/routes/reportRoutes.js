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
const { getOperatingDateIST } = require('../utils/operatingDate');
const { authorizeRoles } = require('../middleware/rbac');

router.use(protect);

router.get('/export/excel', authorizeRoles('super_admin', 'company_admin'), exportReportsExcel);

/**
 * @desc    Generate and download Master ACL Plant Shift Report Excel (.xlsx) using SHIFT REPORT -2026.xlsx template
 * 
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
 * Constants & Helpers for Multi-Date Analysis Consolidation
 */
const THIN_BLACK_BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const NO_DATA_CELL_STYLE = {
  font: { name: 'Calibri', size: 11, color: { argb: 'FF7F7F7F' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: THIN_BLACK_BORDER,
};

function cloneStyle(cell) {
  if (!cell) return {};
  return {
    numFmt: cell.numFmt,
    font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : undefined,
    alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : undefined,
    border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
    fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : undefined,
  };
}

function applyStyleToCell(dstCell, style) {
  if (!style) return;
  if (style.numFmt) dstCell.numFmt = style.numFmt;
  if (style.font) dstCell.font = JSON.parse(JSON.stringify(style.font));
  if (style.alignment) dstCell.alignment = JSON.parse(JSON.stringify(style.alignment));
  if (style.border) dstCell.border = JSON.parse(JSON.stringify(style.border));
  if (style.fill) dstCell.fill = JSON.parse(JSON.stringify(style.fill));
}

function colLetterToNumber(letters) {
  let col = 0;
  const str = String(letters).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    col = col * 26 + (str.charCodeAt(i) - 64);
  }
  return col;
}

function getRow1MergeWidth(sheet) {
  if (sheet.model && Array.isArray(sheet.model.merges)) {
    for (const m of sheet.model.merges) {
      if (typeof m === 'string') {
        const match = m.match(/^([A-Z]+)1:([A-Z]+)1$/i);
        if (match && match[1].toUpperCase() === 'A') {
          return colLetterToNumber(match[2]);
        }
      } else if (m && typeof m === 'object' && m.top === 1 && m.bottom === 1 && m.left === 1) {
        return m.right;
      }
    }
  }
  let maxCol = 6;
  if (sheet.columnCount && sheet.columnCount > maxCol) {
    maxCol = sheet.columnCount;
  }
  return maxCol;
}

function findDataEndRow(sheet, firstDataRow) {
  let scanRow = firstDataRow;
  while (scanRow <= sheet.rowCount) {
    const val = sheet.getCell(scanRow, 1).value;
    if (val === null || val === undefined || String(val).trim() === '') {
      break;
    }
    scanRow++;
  }
  return scanRow - 1;
}

function offsetMergeRange(range, rowOffset) {
  if (rowOffset === 0) return range;
  if (typeof range === 'string') {
    return range.replace(/([A-Z]+)(\d+)/g, (match, colLetters, rowNum) => {
      const newRowNum = parseInt(rowNum, 10) + rowOffset;
      return `${colLetters}${newRowNum}`;
    });
  } else if (range && typeof range === 'object') {
    return {
      top: range.top + rowOffset,
      left: range.left,
      bottom: range.bottom + rowOffset,
      right: range.right,
    };
  }
  return range;
}

/**
 * Helper to extract parameter columns from a single-block snapshot sheet (row 3, cols 2..N)
 */
function extractSnapshotColumns(sheet, hasSub) {
  const labelOccurrences = new Map();
  const columns = [];
  const row3 = sheet.getRow(3);
  let lastCol = 1;
  row3.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber > lastCol) lastCol = colNumber;
  });

  for (let c = 2; c <= lastCol; c++) {
    const cell = sheet.getCell(3, c);
    const rawLabel = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
    const count = (labelOccurrences.get(rawLabel) || 0) + 1;
    labelOccurrences.set(rawLabel, count);
    const key = `${rawLabel}#${count}`;

    const colWidth = sheet.getColumn(c).width;
    const cellStyle = cloneStyle(cell);

    let unitVal = '';
    let unitStyle = null;
    if (hasSub) {
      const uCell = sheet.getCell(4, c);
      unitVal = uCell.value !== null && uCell.value !== undefined ? uCell.value : '';
      unitStyle = cloneStyle(uCell);
    }

    columns.push({
      srcColIndex: c,
      key,
      label: rawLabel,
      unitVal,
      unitStyle,
      headerStyle: cellStyle,
      width: colWidth,
    });
  }
  return columns;
}

/**
 * Consolidate per-date analysis snapshots into one worksheet per analysis
 */
function consolidateMultiDateAnalysisSheets({
  masterWorkbook,
  analysisSnapshots,
  dates,
  normPlant,
  fromDateStr,
  toDateStr,
}) {
  const fallbackAnalyses = [];

  for (const [analysisName, snapshots] of analysisSnapshots.entries()) {
    if (!snapshots || snapshots.length === 0) continue;

    const firstSnapshot = snapshots[0];
    const firstSheet = firstSnapshot.sheet;
    const dstSheet = masterWorkbook.addWorksheet(analysisName);

    const r3c1Val = firstSheet.getCell(3, 1).value;
    const isSingleBlock = String(r3c1Val || '').trim() === 'SHIFT / SAMPLE / TIME';
    const hasSubFirst = String(firstSheet.getCell(4, 1).value || '').trim() === 'Unit & Range';

    // ─── 7. Layout Consistency Check ───
    let layoutMismatch = false;
    if (isSingleBlock) {
      for (let i = 1; i < snapshots.length; i++) {
        const sSheet = snapshots[i].sheet;
        const sR3C1 = String(sSheet.getCell(3, 1).value || '').trim();
        const sHasSub = String(sSheet.getCell(4, 1).value || '').trim() === 'Unit & Range';
        if (sR3C1 !== 'SHIFT / SAMPLE / TIME' || sHasSub !== hasSubFirst) {
          layoutMismatch = true;
          break;
        }
      }
    }

    if (isSingleBlock && !layoutMismatch) {
      // ─── 3a. Single-Block Layout ───
      const headerEndRow = hasSubFirst ? 4 : 3;
      const firstDataRow = headerEndRow + 1;
      const dataEndRow = findDataEndRow(firstSheet, firstDataRow);

      // ─── 1 & 2. Master Columns: Union of keys in first-appearance order across snapshots ───
      const masterColumns = [];
      const masterColKeyMap = new Map();
      const snapshotColsMap = new Map();

      for (const snap of snapshots) {
        const snapCols = extractSnapshotColumns(snap.sheet, hasSubFirst);
        snapshotColsMap.set(snap, snapCols);

        for (const col of snapCols) {
          if (!masterColKeyMap.has(col.key)) {
            const masterColIdx = 3 + masterColumns.length; // Col 1 = DATE, Col 2 = label, Col 3+ = params
            masterColKeyMap.set(col.key, masterColIdx);
            masterColumns.push({
              key: col.key,
              label: col.label,
              unitVal: col.unitVal,
              unitStyle: col.unitStyle,
              headerStyle: col.headerStyle,
              width: col.width || 14,
            });
          } else {
            const existing = masterColumns.find((m) => m.key === col.key);
            if (existing && col.width && col.width > existing.width) {
              existing.width = col.width;
            }
          }
        }
      }

      // ─── 3b. Row 1 Banner ───
      const origBanner = String(firstSheet.getCell(1, 1).value || '');
      const bannerParts = origBanner.split(' | DATE:');
      const leftPart = bannerParts[0] || origBanner;
      let titlePart = leftPart;
      if (leftPart.includes(' — ')) {
        titlePart = leftPart.split(' — ').slice(1).join(' — ').trim();
      } else if (leftPart.includes(' - ')) {
        titlePart = leftPart.split(' - ').slice(1).join(' - ').trim();
      } else {
        titlePart = leftPart.replace(new RegExp(`^${normPlant}\\s*PLANT\\s*`, 'i'), '').trim();
      }
      const bannerText = `${normPlant} PLANT — ${titlePart} | DATE: ${fromDateStr} to ${toDateStr}`;

      // ─── 6. Banner Merge Width ───
      const origMergeWidth = getRow1MergeWidth(firstSheet);
      const masterTotalCols = 2 + masterColumns.length;
      const bannerMergeWidth = Math.max(origMergeWidth + 1, masterTotalCols);
      dstSheet.mergeCells(1, 1, 1, bannerMergeWidth);

      const titleCell = dstSheet.getCell(1, 1);
      titleCell.value = bannerText;
      applyStyleToCell(titleCell, cloneStyle(firstSheet.getCell(1, 1)));
      dstSheet.getRow(1).height = firstSheet.getRow(1).height || 30;
      dstSheet.getRow(2).height = firstSheet.getRow(2).height || 15;

      // ─── 3c. Header Rows (3..headerEndRow) ───
      dstSheet.getRow(3).height = firstSheet.getRow(3).height;
      const hDateCell = dstSheet.getCell(3, 1);
      hDateCell.value = 'DATE';
      applyStyleToCell(hDateCell, cloneStyle(firstSheet.getCell(3, 1)));

      const hLabelCell = dstSheet.getCell(3, 2);
      hLabelCell.value = firstSheet.getCell(3, 1).value;
      applyStyleToCell(hLabelCell, cloneStyle(firstSheet.getCell(3, 1)));

      for (const mCol of masterColumns) {
        const mColIdx = masterColKeyMap.get(mCol.key);
        const cell = dstSheet.getCell(3, mColIdx);
        cell.value = mCol.label;
        applyStyleToCell(cell, mCol.headerStyle);
      }

      if (hasSubFirst) {
        dstSheet.getRow(4).height = firstSheet.getRow(4).height;
        const subDateCell = dstSheet.getCell(4, 1);
        subDateCell.value = '';
        applyStyleToCell(subDateCell, cloneStyle(firstSheet.getCell(4, 1)));

        const subLabelCell = dstSheet.getCell(4, 2);
        subLabelCell.value = firstSheet.getCell(4, 1).value;
        applyStyleToCell(subLabelCell, cloneStyle(firstSheet.getCell(4, 1)));

        for (const mCol of masterColumns) {
          const mColIdx = masterColKeyMap.get(mCol.key);
          const cell = dstSheet.getCell(4, mColIdx);
          cell.value = mCol.unitVal;
          applyStyleToCell(cell, mCol.unitStyle);
        }
      }

      // ─── 4. Template Rows from First Snapshot ───
      const templateRows = [];
      for (let r = firstDataRow; r <= dataEndRow; r++) {
        const labelCell = firstSheet.getCell(r, 1);
        templateRows.push({
          label: labelCell.value,
          style: cloneStyle(labelCell),
          height: firstSheet.getRow(r).height,
        });
      }

      const dateSnapshotMap = new Map();
      for (const snap of snapshots) {
        dateSnapshotMap.set(snap.date, snap);
      }

      let currentDstRow = firstDataRow;

      for (const d of dates) {
        if (dateSnapshotMap.has(d)) {
          const snap = dateSnapshotMap.get(d);
          const snapSheet = snap.sheet;
          const snapCols = snapshotColsMap.get(snap) || [];
          const snapKeyColMap = new Map();
          for (const sc of snapCols) {
            snapKeyColMap.set(sc.key, sc.srcColIndex);
          }

          const snapDataEnd = findDataEndRow(snapSheet, firstDataRow);

          for (let r = firstDataRow; r <= snapDataEnd; r++) {
            const srcRow = snapSheet.getRow(r);
            const dstRow = dstSheet.getRow(currentDstRow);
            dstRow.height = srcRow.height;

            // Col 2: row label from source col 1
            const srcLabelCell = srcRow.getCell(1);
            const dstLabelCell = dstRow.getCell(2);
            dstLabelCell.value = srcLabelCell.value;
            applyStyleToCell(dstLabelCell, cloneStyle(srcLabelCell));

            // Col 1: DATE, style from dst col 2, center aligned
            const dateCell = dstRow.getCell(1);
            dateCell.value = d;
            applyStyleToCell(dateCell, cloneStyle(dstLabelCell));
            dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

            // ─── 3. Write each source value into the master column for its key ───
            for (const mCol of masterColumns) {
              const mColIdx = masterColKeyMap.get(mCol.key);
              const dstCell = dstRow.getCell(mColIdx);

              if (snapKeyColMap.has(mCol.key)) {
                const srcColIdx = snapKeyColMap.get(mCol.key);
                const srcCell = srcRow.getCell(srcColIdx);
                dstCell.value = srcCell.value;
                applyStyleToCell(dstCell, cloneStyle(srcCell));
                if (srcCell.note) dstCell.note = srcCell.note;
              } else {
                dstCell.value = '*';
                applyStyleToCell(dstCell, NO_DATA_CELL_STYLE);
              }
            }
            currentDstRow++;
          }
        } else {
          // No-data date: emit template rows
          for (const tpl of templateRows) {
            const dstRow = dstSheet.getRow(currentDstRow);
            if (tpl.height) dstRow.height = tpl.height;

            const dstLabelCell = dstRow.getCell(2);
            dstLabelCell.value = tpl.label;
            applyStyleToCell(dstLabelCell, cloneStyle(tpl.style));

            const dateCell = dstRow.getCell(1);
            dateCell.value = d;
            applyStyleToCell(dateCell, cloneStyle(tpl.style));
            dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

            for (const mCol of masterColumns) {
              const mColIdx = masterColKeyMap.get(mCol.key);
              const cell = dstRow.getCell(mColIdx);
              cell.value = '*';
              applyStyleToCell(cell, NO_DATA_CELL_STYLE);
            }
            currentDstRow++;
          }
        }
      }

      // ─── Legend & Extra Rows ───
      let extraRowsSnapshot = null;
      for (const snap of snapshots) {
        const sDataEnd = findDataEndRow(snap.sheet, firstDataRow);
        let hasExtras = false;
        for (let r = sDataEnd + 1; r <= snap.sheet.rowCount; r++) {
          const row = snap.sheet.getRow(r);
          row.eachCell({ includeEmpty: false }, (cell) => {
            if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
              hasExtras = true;
            }
          });
          if (hasExtras) break;
        }
        if (hasExtras) {
          extraRowsSnapshot = { sheet: snap.sheet, dataEndRow: sDataEnd };
          break;
        }
      }

      if (extraRowsSnapshot) {
        currentDstRow++; // 1 blank row gap
        const sSheet = extraRowsSnapshot.sheet;
        for (let r = extraRowsSnapshot.dataEndRow + 1; r <= sSheet.rowCount; r++) {
          const srcRow = sSheet.getRow(r);
          let rowHasContent = false;
          srcRow.eachCell({ includeEmpty: false }, (cell) => {
            if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
              rowHasContent = true;
            }
          });
          if (!rowHasContent) continue;

          const dstRow = dstSheet.getRow(currentDstRow);
          dstRow.height = srcRow.height;
          srcRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const dstCell = dstRow.getCell(colNumber + 1);
            dstCell.value = cell.value;
            applyStyleToCell(dstCell, cloneStyle(cell));
            if (cell.note) dstCell.note = cell.note;
          });
          currentDstRow++;
        }
      }

      // ─── 5. Column Widths ───
      dstSheet.getColumn(1).width = 13;
      dstSheet.getColumn(2).width = firstSheet.getColumn(1).width || 25;
      for (const mCol of masterColumns) {
        const mColIdx = masterColKeyMap.get(mCol.key);
        dstSheet.getColumn(mColIdx).width = Math.max(mCol.width || 14, 14);
      }

      // ─── Views & PageSetup ───
      dstSheet.views = [{ showGridLines: true, state: 'frozen', xSplit: 2, ySplit: headerEndRow }];
      dstSheet.pageSetup = JSON.parse(JSON.stringify(firstSheet.pageSetup || {}));
      dstSheet.pageSetup.orientation = 'landscape';
      dstSheet.pageSetup.fitToPage = true;
      dstSheet.pageSetup.fitToWidth = 1;
      dstSheet.pageSetup.fitToHeight = 0;
      dstSheet.pageSetup.printTitlesRow = hasSubFirst ? '3:4' : '3:3';
      dstSheet.properties = JSON.parse(JSON.stringify(firstSheet.properties || {}));
    } else {
      // ─── 4 / 7. Dual-Block / Unrecognised Layout Fallback ───
      fallbackAnalyses.push(analysisName);
      console.log(`[Generic Plant Range Report] Dual-block/unrecognised layout fallback used for: "${analysisName}"`);

      dstSheet.properties = JSON.parse(JSON.stringify(firstSheet.properties || {}));
      dstSheet.pageSetup = JSON.parse(JSON.stringify(firstSheet.pageSetup || {}));
      dstSheet.views = JSON.parse(JSON.stringify(firstSheet.views || []));

      for (let c = 1; c <= firstSheet.columnCount; c++) {
        const col = firstSheet.getColumn(c);
        if (col && col.width) {
          dstSheet.getColumn(c).width = col.width;
        }
      }

      let currentDstRow = 1;
      for (const snap of snapshots) {
        const srcSheet = snap.sheet;
        const startRow = currentDstRow;
        let maxSrcRow = 0;

        srcSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          if (rowNumber > maxSrcRow) maxSrcRow = rowNumber;
          const dstRow = dstSheet.getRow(startRow + (rowNumber - 1));
          dstRow.height = row.height;
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const dstCell = dstRow.getCell(colNumber);
            dstCell.value = cell.value;
            applyStyleToCell(dstCell, cloneStyle(cell));
            if (cell.note) dstCell.note = cell.note;
          });
        });

        if (srcSheet.model && Array.isArray(srcSheet.model.merges)) {
          const rowOffset = startRow - 1;
          for (const merge of srcSheet.model.merges) {
            try {
              const offsetMerge = offsetMergeRange(merge, rowOffset);
              dstSheet.mergeCells(offsetMerge);
            } catch (mergeErr) {
              // Ignore duplicate merge collision
            }
          }
        }

        currentDstRow = startRow + maxSrcRow + 1; // 1 blank row between dates
      }
    }
  }

  if (fallbackAnalyses.length > 0) {
    console.log('[Generic Plant Range Report] Analyses rendered via fallback:', fallbackAnalyses);
  }

  return { totalSheets: masterWorkbook.worksheets.length, fallbackAnalyses };
}

/**
 * @desc    Generate and download multi-date generic Plant Excel report (one .xlsx with one sheet per analysis)
 * @route   GET /api/reports/generic-range?plant=<ACL|SA|OFFSITE|CO2>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * @access  Private (auth required; filtered by user's company and plant)
 */
const MAX_REPORT_DAYS = 366;

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

    const todayIST = getOperatingDateIST(new Date());
    if (toDateStr > todayIST || fromDateStr > todayIST) {
      return res.status(400).json({
        success: false,
        message: 'Future dates are not allowed',
      });
    }

    const diffDays = Math.ceil((new Date(toDateStr) - new Date(fromDateStr)) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > MAX_REPORT_DAYS) {
      return res.status(400).json({
        success: false,
        message: `Date range cannot exceed ${MAX_REPORT_DAYS} days.`,
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

    // 4. Create Master ExcelJS Workbook & Collect Snapshots across dates
    const ExcelJS = require('exceljs');
    const masterWorkbook = new ExcelJS.Workbook();
    masterWorkbook.creator = 'QCL Management Report System';
    masterWorkbook.created = new Date();

    const { generateGenericPlantReportWorkbook } = require('../services/genericPlantReportService');
    const analysisSnapshots = new Map();

    for (const d of dates) {
      const { workbook, recordCount } = await generateGenericPlantReportWorkbook({
        plant: normPlant,
        date: d,
        user: req.user,
      });

      if (workbook && recordCount > 0 && Array.isArray(workbook.worksheets) && workbook.worksheets.length > 0) {
        for (const srcSheet of workbook.worksheets) {
          const name = srcSheet.name;
          if (!analysisSnapshots.has(name)) {
            analysisSnapshots.set(name, []);
          }
          analysisSnapshots.get(name).push({ date: d, sheet: srcSheet });
        }
      }
    }

    // 5. If no snapshot at all across all dates, return 404 before sending headers
    if (analysisSnapshots.size === 0) {
      return res.status(404).json({
        success: false,
        message: `No analysis records found for plant "${plant}" between "${fromDateStr}" and "${toDateStr}".`,
      });
    }

    // 6. Consolidate into Master Sheets (one sheet per analysis)
    try {
      consolidateMultiDateAnalysisSheets({
        masterWorkbook,
        analysisSnapshots,
        dates,
        normPlant,
        fromDateStr,
        toDateStr,
      });
    } catch (consolidationErr) {
      console.error('[Generic Plant Range Report Consolidation Error]:', consolidationErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to consolidate plant report sheets: ' + consolidationErr.message,
      });
    }

    // 7. Stream workbook directly to response
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

