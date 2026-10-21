const ExcelJS = require('exceljs');
const { PlantAnalysisRecord, PureSaltAnalysis, PureSaltSieveAnalysis } = require('../models');
const { getAnalysisConfig } = require('../config/analysisLabels');

/**
 * Plant code aliases mapping across all 4 plants
 */
const PLANT_ALIASES = {
  ACL: ['ACL', 'ACL Plant', 'ACL PLANT'],
  SA: ['SA', 'SA Plant', 'SA PLANT'],
  OFFSITE: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant', 'OFFSITE PLANT'],
  CO2: ['CO2', 'CO2 Plant', 'CO2 PLANT'],
};

/**
 * Standard shift display names and sorting weights
 */
const SHIFT_MAP = {
  shift1: { label: 'I Shift', order: 1 },
  s1: { label: 'I Shift', order: 1 },
  ishift: { label: 'I Shift', order: 1 },
  'i shift': { label: 'I Shift', order: 1 },
  shift2: { label: 'II Shift', order: 2 },
  s2: { label: 'II Shift', order: 2 },
  iishift: { label: 'II Shift', order: 2 },
  'ii shift': { label: 'II Shift', order: 2 },
  shift3: { label: 'III Shift', order: 3 },
  s3: { label: 'III Shift', order: 3 },
  iiishift: { label: 'III Shift', order: 3 },
  'iii shift': { label: 'III Shift', order: 3 },
  rawsalt: { label: 'RAW SALT', order: 0 },
  composition: { label: 'COMPOSITION', order: 4 },
  tk109: { label: 'TK 109', order: 10 },
  tk110: { label: 'TK 110', order: 11 },
};

/**
 * Chronological order weights for standard 2-hourly / 4-hourly slots starting at 07:00
 */
const SLOT_TIME_ORDER = {
  t07: 1,
  t09: 2,
  t11: 3,
  t13: 4,
  t15: 5,
  t17: 6,
  t19: 7,
  t21: 8,
  t23: 9,
  t01: 10,
  t03: 11,
  t05: 12,
};

/**
 * Keys to ignore when aggregating data parameter columns
 */
const METADATA_KEYS = new Set([
  '_id',
  'id',
  'date',
  'plant',
  'plantCode',
  'unit',
  'analysisType',
  'frequency',
  'sample',
  'time',
  'shift',
  'isSaved',
  'isLocked',
  'editCount',
  'editedFields',
  'editAuditHistory',
  'lockedShifts',
  'submittedBy',
  'submittedById',
  'submittedAt',
  'lastSaveEventId',
  'savedAt',
  'company',
  'emailStatus',
  'emailRecipient',
  'assignedOperatorEmail',
]);

/**
 * Format cell value safely:
 * - null/undefined/''/NaN -> '*'
 * - number -> Number(val) (preserves raw numeric value in Excel)
 * - object/array -> flattened key: value or '*'
 */
function formatCellValue(val) {
  if (val === null || val === undefined || val === '') {
    return '*';
  }
  if (typeof val === 'number') {
    return isNaN(val) ? '*' : val;
  }
  if (typeof val === 'boolean') {
    return String(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '*';
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
    return trimmed;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '*';
    const flattened = val
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return Object.entries(item)
            .filter(([k]) => !METADATA_KEYS.has(k))
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
        }
        return String(item);
      })
      .filter(Boolean)
      .join('; ');
    return flattened || '*';
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([k, v]) => !METADATA_KEYS.has(k) && v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return '*';
    return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  }
  return String(val);
}

/**
 * Sanitize a string into a valid, unique Excel worksheet name (<= 31 chars, no invalid chars)
 */
function sanitizeSheetName(name, existingNames) {
  let clean = (name || 'Sheet')
    .replace(/[/\\?*[\]:]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);

  if (!existingNames.has(clean.toLowerCase())) {
    existingNames.add(clean.toLowerCase());
    return clean;
  }

  // Ensure uniqueness
  let counter = 1;
  while (true) {
    const suffix = `_${counter}`;
    const base = clean.slice(0, 31 - suffix.length);
    const candidate = `${base}${suffix}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      existingNames.add(candidate.toLowerCase());
      return candidate;
    }
    counter++;
  }
}

/**
 * Format a row key into a user-friendly label (e.g. 'shift1' -> 'I Shift', 't07' -> '07:00')
 */
function formatRowLabel(key, item = null) {
  if (item && item.sample) {
    return item.time ? `${item.sample} (${item.time})` : item.sample;
  }
  const lower = String(key).toLowerCase().trim();
  if (SHIFT_MAP[lower]) {
    return SHIFT_MAP[lower].label;
  }
  const slotMatch = lower.match(/^t(\d{2})$/);
  if (slotMatch) {
    return `${slotMatch[1]}:00`;
  }
  if (key === '0' || key === 0) {
    return 'Reading';
  }
  if (!isNaN(Number(key))) {
    return `Reading ${Number(key) + 1}`;
  }
  return String(key).toUpperCase();
}

/**
 * Get sorting weight for a row key to ensure shifts and time slots are chronologically ordered
 */
function getRowOrderWeight(key) {
  const lower = String(key).toLowerCase().trim();
  if (SHIFT_MAP[lower] !== undefined) {
    return SHIFT_MAP[lower].order;
  }
  if (SLOT_TIME_ORDER[lower] !== undefined) {
    return 100 + SLOT_TIME_ORDER[lower];
  }
  const num = Number(key);
  if (!isNaN(num)) {
    return 200 + num;
  }
  return 500;
}

/**
 * Merges multiple records of the same analysisType into a single unified record
 */
function mergeRecordsForAnalysis(records) {
  if (!records || records.length === 0) return null;
  if (records.length === 1) return records[0];

  const primary = { ...records[0] };
  const mergedData = { ...(primary.data || {}) };

  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const d = rec.data || {};

    // 1. Merge rows
    if (d.rows && typeof d.rows === 'object') {
      mergedData.rows = { ...(mergedData.rows || {}), ...d.rows };
    }
    // 2. Merge shifts
    if (d.shifts && typeof d.shifts === 'object') {
      mergedData.shifts = { ...(mergedData.shifts || {}), ...d.shifts };
    }
    // 3. Merge shiftRows
    if (d.shiftRows && typeof d.shiftRows === 'object') {
      mergedData.shiftRows = { ...(mergedData.shiftRows || {}), ...d.shiftRows };
    }
    // 4. Merge timeRows
    if (d.timeRows && typeof d.timeRows === 'object') {
      mergedData.timeRows = { ...(mergedData.timeRows || {}), ...d.timeRows };
    }
    // 5. Merge readings array
    if (Array.isArray(d.readings)) {
      mergedData.readings = [...(mergedData.readings || []), ...d.readings];
    }
    // 6. Merge parameters
    if (d.parameters && typeof d.parameters === 'object') {
      mergedData.parameters = { ...(mergedData.parameters || {}), ...d.parameters };
    }
    // 7. Merge chemical & bss
    if (d.chemical && typeof d.chemical === 'object') {
      mergedData.chemical = { ...(mergedData.chemical || {}), ...d.chemical };
    }
    if (d.bss && typeof d.bss === 'object') {
      mergedData.bss = { ...(mergedData.bss || {}), ...d.bss };
    }
  }

  primary.data = mergedData;
  return primary;
}

/**
 * Apply consistent Excel table styling
 */
function applyHeaderStyle(cell, hasSubHeader = false) {
  cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: hasSubHeader ? 'thin' : 'medium', color: { argb: hasSubHeader ? 'FFE2E8F0' : 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
}

function applySubHeaderStyle(cell) {
  cell.font = { name: 'Segoe UI', size: 9, bold: false, color: { argb: 'FF475569' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
}

function applyDataCellStyle(cell, isFirstCol = false) {
  cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' }, bold: isFirstCol };
  cell.alignment = { vertical: 'middle', horizontal: isFirstCol ? 'left' : 'center' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };
}

function applyTitleStyle(cell) {
  cell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate-900
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

function applySectionTitleStyle(cell) {
  cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E3A8A' } }; // Blue-900
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' }, // Blue-100
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF93C5FD' } },
    bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
  };
}

/**
 * Builds an Excel table grid from an array of row objects
 */
function renderTableBlock(sheet, startRow, sectionTitle, rowEntries, columnKeys, labelConfig = null) {
  let currentRow = startRow;

  if (sectionTitle) {
    const secRow = sheet.getRow(currentRow);
    secRow.height = 24;
    secRow.getCell(1).value = sectionTitle;
    applySectionTitleStyle(secRow.getCell(1));
    sheet.mergeCells(currentRow, 1, currentRow, Math.max(columnKeys.length + 1, 4));
    currentRow++;
  }

  // Determine effective column list and ordering
  let columns = [];
  if (labelConfig && Array.isArray(labelConfig.columns) && labelConfig.columns.length > 0) {
    const configMap = new Map();
    labelConfig.columns.forEach((c) => {
      configMap.set(String(c.key).toLowerCase(), c);
      columns.push({
        key: c.key,
        label: c.label || String(c.key).toUpperCase(),
        unit: c.unit !== undefined ? c.unit : null,
        range: c.range !== undefined ? c.range : null,
      });
    });

    // Append any extra keys found in data but not in config (preserving all data)
    columnKeys.forEach((k) => {
      if (!configMap.has(String(k).toLowerCase())) {
        columns.push({
          key: k,
          label: String(k).toUpperCase(),
          unit: null,
          range: null,
        });
      }
    });
  } else {
    columns = columnKeys.map((colKey) => ({
      key: colKey,
      label: String(colKey).toUpperCase(),
      unit: null,
      range: null,
    }));
  }

  const hasSubHeader = Boolean(labelConfig && Array.isArray(labelConfig.columns));

  // Header row 1: Parameter labels
  const headerRow = sheet.getRow(currentRow);
  headerRow.height = 24;
  const col1 = headerRow.getCell(1);
  col1.value = 'SHIFT / SAMPLE / TIME';
  applyHeaderStyle(col1, hasSubHeader);

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 2);
    cell.value = col.label;
    applyHeaderStyle(cell, hasSubHeader);
  });
  currentRow++;

  // Header row 2 (Subheader): Unit + Range (as text, never number/formula)
  if (hasSubHeader) {
    const subHeaderRow = sheet.getRow(currentRow);
    subHeaderRow.height = 20;

    const subCol1 = subHeaderRow.getCell(1);
    subCol1.value = 'Unit & Range';
    applySubHeaderStyle(subCol1);

    columns.forEach((col, idx) => {
      const cell = subHeaderRow.getCell(idx + 2);
      let subText = '*';
      if (col.range && col.unit) {
        subText = `${col.range} ${col.unit}`;
      } else if (col.range) {
        subText = `${col.range}`;
      } else if (col.unit) {
        subText = `${col.unit}`;
      }
      cell.value = String(subText);
      cell.numFmt = '@'; // Store strictly as text format
      applySubHeaderStyle(cell);
    });
    currentRow++;
  }

  // Data rows
  rowEntries.forEach(({ rowKey, label, dataObj }) => {
    const dRow = sheet.getRow(currentRow);
    dRow.height = 20;

    const labelCell = dRow.getCell(1);
    let finalLabel = label;
    if (labelConfig && labelConfig.rowLabels && rowKey && labelConfig.rowLabels[rowKey]) {
      finalLabel = labelConfig.rowLabels[rowKey];
    }
    labelCell.value = finalLabel;
    applyDataCellStyle(labelCell, true);

    columns.forEach((col, idx) => {
      const cell = dRow.getCell(idx + 2);
      cell.value = formatCellValue(dataObj ? dataObj[col.key] : null);
      applyDataCellStyle(cell, false);
    });
    currentRow++;
  });

  return currentRow + 1; // Return next available row (with 1 blank line spacing)
}

/**
 * Auto-fits column widths for a worksheet based on content length
 */
function autoFitColumns(sheet) {
  sheet.columns.forEach((col) => {
    let maxLen = 12;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const val = cell.value;
      if (val !== null && val !== undefined) {
        const str = String(val);
        // Avoid header banner skewing column width
        if (!cell.isMerged || cell.address === cell.master.address) {
          if (str.length < 50 && str.length > maxLen) {
            maxLen = str.length;
          }
        }
      }
    });
    col.width = Math.min(Math.max(maxLen + 3, 12), 40);
  });
}

/**
 * Generates an Excel workbook populated with all analyses for a plant and date
 * 
 * @param {Object} options
 * @param {string} options.plant - 'ACL' | 'SA' | 'OFFSITE' | 'CO2'
 * @param {string} options.date - 'YYYY-MM-DD'
 * @param {Object} [options.user] - Logged in req.user object (for multi-company filtering)
 * @returns {Promise<{ workbook: ExcelJS.Workbook, recordCount: number }>}
 */
async function generateGenericPlantReportWorkbook({ plant, date, user = null }) {
  if (!plant || !date) {
    throw new Error('Both plant and date (YYYY-MM-DD) are required.');
  }

  const normPlant = plant.trim().toUpperCase();
  const plantAliases = PLANT_ALIASES[normPlant] || [normPlant, `${normPlant} Plant`, `${normPlant} PLANT`];

  // Build MongoDB query
  const query = {
    plantCode: { $in: plantAliases },
    date,
  };

  // 1. Multi-Company Safety: Filter by req.user.company unless super_admin
  if (user && user.role !== 'super_admin') {
    const userCompanyId = user.company?._id || user.company;
    if (userCompanyId) {
      query.$or = [{ company: userCompanyId }, { company: null }];
    }
  }

  // Fetch all matching records
  const records = await PlantAnalysisRecord.find(query).lean();

  // 2. Fallbacks for ACL Pure Salt and Pure Salt Sieve
  if (normPlant === 'ACL') {
    const hasPureSalt = records.some((r) => (r.analysisType || '').toLowerCase().includes('pure salt analysis'));
    const hasPureSaltSieve = records.some((r) => (r.analysisType || '').toLowerCase().includes('pure salt sieve'));

    const fallbackCompanyQuery = user && user.role !== 'super_admin' && (user.company?._id || user.company)
      ? { $or: [{ company: user.company?._id || user.company }, { company: null }] }
      : {};

    if (!hasPureSalt && PureSaltAnalysis) {
      const pureSaltDoc = await PureSaltAnalysis.findOne({ date, ...fallbackCompanyQuery }).lean();
      if (pureSaltDoc) {
        records.push({
          plantCode: 'ACL',
          analysisType: 'Pure Salt Analysis',
          date,
          data: pureSaltDoc,
        });
      }
    }

    if (!hasPureSaltSieve && PureSaltSieveAnalysis) {
      const sieveDoc = await PureSaltSieveAnalysis.findOne({ date, ...fallbackCompanyQuery }).lean();
      if (sieveDoc) {
        records.push({
          plantCode: 'ACL',
          analysisType: 'Pure Salt Sieve Analysis',
          date,
          data: sieveDoc,
        });
      }
    }
  }

  if (!records || records.length === 0) {
    return { workbook: null, recordCount: 0 };
  }

  // Group records by analysisType and merge shift-wise data
  const groupedByType = {};
  for (const r of records) {
    const at = (r.analysisType || 'Unknown Analysis').trim();
    if (!groupedByType[at]) {
      groupedByType[at] = [];
    }
    groupedByType[at].push(r);
  }

  const mergedRecords = Object.keys(groupedByType).map((at) => mergeRecordsForAnalysis(groupedByType[at]));

  // Sort analyses alphabetically
  mergedRecords.sort((a, b) => (a.analysisType || '').localeCompare(b.analysisType || ''));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QCL Management Report System';
  workbook.created = new Date();

  const usedSheetNames = new Set();

  for (const rec of mergedRecords) {
    const analysisType = rec.analysisType || 'Analysis';
    const labelConfig = getAnalysisConfig(analysisType);
    const sheetName = sanitizeSheetName(analysisType, usedSheetNames);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    // ── Row 1: Title Banner ──
    const titleRow = sheet.getRow(1);
    titleRow.height = 32;
    const titleCell = titleRow.getCell(1);
    const displayTitle = labelConfig?.title || analysisType.toUpperCase();
    titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
    applyTitleStyle(titleCell);
    sheet.mergeCells(1, 1, 1, 8);

    let nextRow = 3;
    const data = rec.data || {};

    // ── Pattern 1: Chemical Specs & BSS Sieves (ACL Product) ──
    if (data.chemical && typeof data.chemical === 'object' && data.bss && typeof data.bss === 'object') {
      const chemKeys = Object.keys(data.chemical).filter((k) => !METADATA_KEYS.has(k));
      nextRow = renderTableBlock(
        sheet,
        nextRow,
        'CHEMICAL & PHYSICAL PARAMETERS',
        [{ rowKey: 'chemical', label: 'Product Specifications', dataObj: data.chemical }],
        chemKeys,
        null
      );

      const bssKeys = Object.keys(data.bss).filter((k) => !METADATA_KEYS.has(k));
      nextRow = renderTableBlock(
        sheet,
        nextRow,
        'BSS SIEVE FRACTIONS',
        [{ rowKey: 'bss', label: 'Mesh Analysis', dataObj: data.bss }],
        bssKeys,
        null
      );
    }
    // ── Pattern 2: Readings Array (BFW, DM Water, CaCl2, Cooling Water, etc.) ──
    else if (Array.isArray(data.readings) && data.readings.length > 0) {
      const allKeys = new Set();
      data.readings.forEach((item) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((k) => {
            if (!METADATA_KEYS.has(k)) allKeys.add(k);
          });
        }
      });
      const columnKeys = Array.from(allKeys);

      const rowEntries = data.readings.map((item, idx) => ({
        rowKey: String(idx),
        label: formatRowLabel(idx, item),
        dataObj: item,
      }));

      nextRow = renderTableBlock(sheet, nextRow, null, rowEntries, columnKeys, labelConfig);
    }
    // ── Pattern 3: Keyed Rows (data.rows, data.shifts, data.shiftRows, data.timeRows) ──
    else {
      const rowContainer = data.rows || data.shifts || data.shiftRows || data.timeRows || null;

      if (rowContainer && typeof rowContainer === 'object' && Object.keys(rowContainer).length > 0) {
        // Collect all column keys
        const allKeys = new Set();
        const sortedRowKeys = Object.keys(rowContainer).sort((a, b) => getRowOrderWeight(a) - getRowOrderWeight(b));

        sortedRowKeys.forEach((rk) => {
          const rowObj = rowContainer[rk];
          if (rowObj && typeof rowObj === 'object') {
            Object.keys(rowObj).forEach((k) => {
              if (!METADATA_KEYS.has(k)) allKeys.add(k);
            });
          }
        });
        const columnKeys = Array.from(allKeys);

        const rowEntries = sortedRowKeys.map((rk) => ({
          rowKey: rk,
          label: formatRowLabel(rk, rowContainer[rk]),
          dataObj: rowContainer[rk],
        }));

        nextRow = renderTableBlock(sheet, nextRow, null, rowEntries, columnKeys, labelConfig);
      }
      // ── Pattern 4: Flat Parameters (Raw Salt) ──
      else if (data.parameters && typeof data.parameters === 'object') {
        const columnKeys = Object.keys(data.parameters).filter((k) => !METADATA_KEYS.has(k));
        const rowEntries = [{ rowKey: 'daily', label: 'Daily Parameters', dataObj: data.parameters }];
        nextRow = renderTableBlock(sheet, nextRow, null, rowEntries, columnKeys, labelConfig);
      }
      // ── Pattern 5: Generic Key-Value Fallback (if data is flat dictionary) ──
      else {
        const flatKeys = Object.keys(data).filter((k) => !METADATA_KEYS.has(k) && typeof data[k] !== 'function');
        if (flatKeys.length > 0) {
          const rowEntries = [{ rowKey: 'recorded', label: 'Recorded Data', dataObj: data }];
          nextRow = renderTableBlock(sheet, nextRow, null, rowEntries, flatKeys, labelConfig);
        } else {
          // Empty or unknown data shape
          const emptyRow = sheet.getRow(nextRow);
          emptyRow.getCell(1).value = 'No data values recorded for this analysis.';
          applyDataCellStyle(emptyRow.getCell(1), true);
        }
      }
    }

    autoFitColumns(sheet);
  }

  return { workbook, recordCount: mergedRecords.length };
}

module.exports = {
  generateGenericPlantReportWorkbook,
  PLANT_ALIASES,
};
