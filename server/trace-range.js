/**
 * server/trace-range.js
 * 
 * Diagnostic script to trace range report generation for a specified plant and date range.
 * Usage:
 *   node trace-range.js <PLANT> <FROM> <TO> [ROLE] [COMPANY_ID]
 * Defaults:
 *   node trace-range.js SA 2026-10-01 2026-10-31 super_admin none
 * 
 * Strictly READ-ONLY on MongoDB (find only, zero writes, no insert/update/delete/drop/bulkWrite).
 * Never prints MONGODB_URI.
 * Output is saved ONLY under reports/, never overwriting existing files.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const { PlantAnalysisRecord } = require('./models');
const {
  generateGenericPlantReportWorkbook,
  PLANT_ALIASES,
} = require('./services/genericPlantReportService');

// ─── Consolidation Helpers & Logic (from server/routes/reportRoutes.js) ───

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
      const headerEndRow = hasSubFirst ? 4 : 3;
      const firstDataRow = headerEndRow + 1;
      const dataEndRow = findDataEndRow(firstSheet, firstDataRow);

      const masterColumns = [];
      const masterColKeyMap = new Map();
      const snapshotColsMap = new Map();

      for (const snap of snapshots) {
        const snapCols = extractSnapshotColumns(snap.sheet, hasSubFirst);
        snapshotColsMap.set(snap, snapCols);

        for (const col of snapCols) {
          if (!masterColKeyMap.has(col.key)) {
            const masterColIdx = 3 + masterColumns.length;
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

      const origMergeWidth = getRow1MergeWidth(firstSheet);
      const masterTotalCols = 2 + masterColumns.length;
      const bannerMergeWidth = Math.max(origMergeWidth + 1, masterTotalCols);
      dstSheet.mergeCells(1, 1, 1, bannerMergeWidth);

      const titleCell = dstSheet.getCell(1, 1);
      titleCell.value = bannerText;
      applyStyleToCell(titleCell, cloneStyle(firstSheet.getCell(1, 1)));
      dstSheet.getRow(1).height = firstSheet.getRow(1).height || 30;
      dstSheet.getRow(2).height = firstSheet.getRow(2).height || 15;

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

            const srcLabelCell = srcRow.getCell(1);
            const dstLabelCell = dstRow.getCell(2);
            dstLabelCell.value = srcLabelCell.value;
            applyStyleToCell(dstLabelCell, cloneStyle(srcLabelCell));

            const dateCell = dstRow.getCell(1);
            dateCell.value = d;
            applyStyleToCell(dateCell, cloneStyle(dstLabelCell));
            dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

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

      dstSheet.getColumn(1).width = 13;
      dstSheet.getColumn(2).width = firstSheet.getColumn(1).width || 25;
      for (const mCol of masterColumns) {
        const mColIdx = masterColKeyMap.get(mCol.key);
        dstSheet.getColumn(mColIdx).width = Math.max(mCol.width || 14, 14);
      }

      dstSheet.views = [{ showGridLines: true, state: 'frozen', xSplit: 2, ySplit: headerEndRow }];
      dstSheet.pageSetup = JSON.parse(JSON.stringify(firstSheet.pageSetup || {}));
      dstSheet.pageSetup.orientation = 'landscape';
      dstSheet.pageSetup.fitToPage = true;
      dstSheet.pageSetup.fitToWidth = 1;
      dstSheet.pageSetup.fitToHeight = 0;
      dstSheet.pageSetup.printTitlesRow = hasSubFirst ? '3:4' : '3:3';
      dstSheet.properties = JSON.parse(JSON.stringify(firstSheet.properties || {}));
    } else {
      fallbackAnalyses.push(analysisName);

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

        currentDstRow = startRow + maxSrcRow + 1;
      }
    }
  }

  return { totalSheets: masterWorkbook.worksheets.length, fallbackAnalyses };
}

// ─── Main Trace Execution ───

(async () => {
  try {
    const [, , argPlant, argFrom, argTo, argRole, argCompany] = process.argv;

    const normPlant = String(argPlant || 'SA').trim().toUpperCase();
    const fromDateStr = String(argFrom || '2026-10-01').trim();
    const toDateStr = String(argTo || '2026-10-31').trim();
    const userRole = String(argRole || 'super_admin').trim();
    const companyId = argCompany && String(argCompany).trim().toLowerCase() !== 'none'
      ? String(argCompany).trim()
      : null;

    // Build the user object the same way the real route/auth does
    const user = {
      role: userRole,
    };
    if (userRole !== 'super_admin' && companyId) {
      user.company = companyId;
      user.plant = { code: normPlant, name: normPlant };
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('======================================================================');
    console.log(`TRACE RANGE REPORT: Plant ${normPlant} | ${fromDateStr} to ${toDateStr}`);
    console.log(`User Context: role="${userRole}", companyId=${companyId ? `"${companyId}"` : 'none'}`);
    console.log('Mode: READ-ONLY (counts and date strings only, no values logged)');
    console.log('======================================================================\n');

    const plantAliases = PLANT_ALIASES[normPlant] || [normPlant, `${normPlant} Plant`, `${normPlant} PLANT`];

    // Build calendar dates array
    const dates = [];
    const curr = new Date(`${fromDateStr}T00:00:00Z`);
    const end = new Date(`${toDateStr}T00:00:00Z`);
    while (curr <= end) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    const perDateSummary = [];
    const analysisSnapshots = new Map();

    console.log('--- 1. Per-Date Processing ---');
    for (const d of dates) {
      // Build raw DB query exactly matching genericPlantReportService filtering
      const rawQuery = {
        plantCode: { $in: plantAliases },
        date: d,
      };
      if (user && user.role !== 'super_admin') {
        const userCompanyId = user.company?._id || user.company;
        if (userCompanyId) {
          rawQuery.$or = [{ company: userCompanyId }, { company: null }];
        }
      }

      // Direct raw DB count for this date (strictly read-only find)
      const rawDocs = await PlantAnalysisRecord.find(rawQuery).lean();

      const rawAnalysisTypes = [...new Set(rawDocs.map((r) => (r.analysisType || 'Unknown').trim()))];

      // Call service function
      const { workbook, recordCount } = await generateGenericPlantReportWorkbook({
        plant: normPlant,
        date: d,
        user,
      });

      const generatedSheetNames = (workbook && Array.isArray(workbook.worksheets))
        ? workbook.worksheets.map((ws) => ws.name)
        : [];

      const hasSnapshots = workbook && recordCount > 0 && generatedSheetNames.length > 0;

      if (hasSnapshots) {
        for (const srcSheet of workbook.worksheets) {
          const name = srcSheet.name;
          if (!analysisSnapshots.has(name)) {
            analysisSnapshots.set(name, []);
          }
          analysisSnapshots.get(name).push({ date: d, sheet: srcSheet });
        }
      }

      perDateSummary.push({
        date: d,
        rawDocsCount: rawDocs.length,
        rawAnalysisTypes: rawAnalysisTypes.join(', ') || '(none)',
        serviceRecordCount: recordCount,
        generatedSheetsCount: generatedSheetNames.length,
        generatedSheets: generatedSheetNames.join(', ') || '(none)',
        hasSnapshots,
      });
    }

    console.table(
      perDateSummary.map((s) => ({
        date: s.date,
        rawDocs: s.rawDocsCount,
        analysesInDB: s.rawAnalysisTypes,
        serviceRecs: s.serviceRecordCount,
        sheetsCount: s.generatedSheetsCount,
      }))
    );

    console.log('\n--- 2. Consolidation into Master Workbook ---');
    console.log(`Total unique analysis snapshot keys collected: ${analysisSnapshots.size}`);
    console.log('Snapshot keys:', Array.from(analysisSnapshots.keys()).join(', '));

    const masterWorkbook = new ExcelJS.Workbook();
    masterWorkbook.creator = 'QCL Management Report System';
    masterWorkbook.created = new Date();

    const consolidationResult = consolidateMultiDateAnalysisSheets({
      masterWorkbook,
      analysisSnapshots,
      dates,
      normPlant,
      fromDateStr,
      toDateStr,
    });

    console.log(`Total Master Sheets created: ${consolidationResult.totalSheets}`);
    console.log(`Fallback analyses: ${consolidationResult.fallbackAnalyses.join(', ') || 'None'}`);

    console.log('\n--- 3. Analysis of Dates in Master Sheets ---');
    const masterSheetAnalysis = [];

    for (const ws of masterWorkbook.worksheets) {
      const sheetName = ws.name;
      const isFallback = consolidationResult.fallbackAnalyses.includes(sheetName);

      // Check dates in column 1 (for single block) or scan rows
      const datesWithRealData = new Set();
      const datesWithTemplateStar = new Set();

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= 3) return; // Banner and headers
        const col1Val = row.getCell(1).value;

        // In single block, Col 1 is DATE
        if (typeof col1Val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(col1Val.trim())) {
          const dStr = col1Val.trim();
          let hasData = false;
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            if (colNumber >= 3) {
              const v = cell.value;
              if (v !== null && v !== undefined && v !== '*' && String(v).trim() !== '') {
                hasData = true;
              }
            }
          });
          if (hasData) {
            datesWithRealData.add(dStr);
          } else {
            datesWithTemplateStar.add(dStr);
          }
        }
      });

      const snapshotList = analysisSnapshots.get(sheetName) || [];
      const snapshotDates = snapshotList.map((s) => s.date).sort();

      masterSheetAnalysis.push({
        analysisSheet: sheetName,
        isFallback,
        snapshotsCount: snapshotList.length,
        snapshotDates: snapshotDates.join(', ') || '(none)',
        datesWithRealDataCount: datesWithRealData.size,
        datesWithRealData: Array.from(datesWithRealData).sort().join(', ') || '(none)',
        datesWithStarOnlyCount: datesWithTemplateStar.size,
      });
    }

    console.table(
      masterSheetAnalysis.map((m) => ({
        sheet: m.analysisSheet,
        fallback: m.isFallback,
        snapshots: m.snapshotsCount,
        realDataDates: m.datesWithRealDataCount,
        starDates: m.datesWithStarOnlyCount,
        realDatesList: m.datesWithRealData,
      }))
    );

    console.log('\n--- 4. Saving Workbook (reports/ only, no overwrite) ---');
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    let xlsxPath = path.join(reportsDir, `trace_range_${normPlant}_${fromDateStr}_to_${toDateStr}.xlsx`);
    let counter = 1;
    while (fs.existsSync(xlsxPath)) {
      xlsxPath = path.join(reportsDir, `trace_range_${normPlant}_${fromDateStr}_to_${toDateStr}_${counter}.xlsx`);
      counter++;
    }

    await masterWorkbook.xlsx.writeFile(xlsxPath);
    console.log(`Saved master workbook copy to: ${xlsxPath}`);

    await mongoose.disconnect();
    console.log('\nTrace completed successfully.');
  } catch (err) {
    console.error('Trace error:', err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
})();
