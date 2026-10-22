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
  if (item && item.stream != null && String(item.stream).trim() !== '') {
    return String(item.stream).trim();
  }
  if (item && item.time != null && String(item.time).trim() !== '') {
    return String(item.time).trim();
  }
  const lower = String(key).toLowerCase().trim();
  if (SHIFT_MAP[lower]) {
    return SHIFT_MAP[lower].label;
  }
  const slotMatch = lower.match(/^t(\d{2})$/);
  if (slotMatch) {
    return `${slotMatch[1]}:00`;
  }
  if (item && item.unit != null && String(item.unit).trim() !== '') {
    return String(item.unit).trim();
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

    // 8. Merge editedFields safely
    if (d.editedFields && typeof d.editedFields === 'object') {
      if (Array.isArray(d.editedFields)) {
        mergedData.editedFields = [
          ...(Array.isArray(mergedData.editedFields) ? mergedData.editedFields : []),
          ...d.editedFields,
        ];
      } else {
        mergedData.editedFields = { ...(mergedData.editedFields || {}), ...d.editedFields };
      }
    }
    // 9. Merge editAuditHistory safely
    if (Array.isArray(d.editAuditHistory)) {
      mergedData.editAuditHistory = [...(mergedData.editAuditHistory || []), ...d.editAuditHistory];
    }
  }

  // Also pull edited fields/audit history from primary record root if present
  if (primary.editedFields && !mergedData.editedFields) {
    mergedData.editedFields = primary.editedFields;
  }
  if (primary.editAuditHistory && !mergedData.editAuditHistory) {
    mergedData.editAuditHistory = primary.editAuditHistory;
  }

  primary.data = mergedData;
  return primary;
}

const THIN_BLACK_BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

/**
 * EPSILON tolerance for boundary comparisons, matching client/src/services/analysisValidation.js (Line 2392)
 */
const EPSILON = 0.000001;

/**
 * Parses min-max range string (e.g. "0.03-0.30", "0.03–0.30").
 * Returns { min: number, max: number } or null if unparseable/null.
 */
function parseColumnRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  const match = rangeStr.match(/^\s*(-?\d+(?:\.\d+)?)\s*[\u2013\-–]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const min = parseFloat(match[1]);
  const max = parseFloat(match[2]);
  if (isNaN(min) || isNaN(max)) return null;
  return { min, max };
}

/**
 * Checks if a value is out of limit using EPSILON tolerance
 */
function checkOutOfLimit(val, limit) {
  if (!limit) return false;
  if (val === null || val === undefined || val === '' || val === '*') return false;
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) return false;
  return num < limit.min - EPSILON || num > limit.max + EPSILON;
}

/**
 * Formats a timestamp into IST string: "DD-MM-YYYY HH:mm IST"
 */
function formatTimestampIST(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const p = {};
    parts.forEach(({ type, value }) => {
      p[type] = value;
    });
    return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute} IST`;
  } catch {
    return '';
  }
}

/**
 * Safely inspects editedFields across various data structures (Object, Map, Array, Set, nested)
 */
function isFieldMarkedEdited(editedFields, candidateKeys) {
  if (!editedFields) return false;
  try {
    // 1. If Map (ES6 Map or Mongoose Map)
    if (typeof editedFields.get === 'function') {
      for (const key of candidateKeys) {
        if (editedFields.get(key) || editedFields.get(key.toLowerCase())) {
          return true;
        }
      }
    }

    // 2. If Array
    if (Array.isArray(editedFields)) {
      for (const item of editedFields) {
        if (typeof item === 'string') {
          const itemLower = item.toLowerCase();
          if (candidateKeys.some((k) => k.toLowerCase() === itemLower)) {
            return true;
          }
        } else if (item && typeof item === 'object') {
          const itemKey = String(item.field || item.key || item.paramKey || item.fieldKey || '').toLowerCase();
          if (itemKey && candidateKeys.some((k) => k.toLowerCase() === itemKey)) {
            return true;
          }
        }
      }
      return false;
    }

    // 3. If Set
    if (editedFields instanceof Set) {
      for (const key of candidateKeys) {
        if (editedFields.has(key) || editedFields.has(key.toLowerCase())) {
          return true;
        }
      }
    }

    // 4. If plain or nested object
    if (typeof editedFields === 'object') {
      // Direct flat check
      for (const key of candidateKeys) {
        if (editedFields[key] || editedFields[key.toLowerCase()]) {
          return true;
        }
      }
      // Nested check e.g. editedFields[rowKey][colKey]
      for (const key of candidateKeys) {
        const parts = key.split('_');
        if (parts.length >= 2) {
          const rKey = parts[0];
          const cKey = parts.slice(1).join('_');
          const nestedRow = editedFields[rKey] || editedFields[rKey.toLowerCase()];
          if (nestedRow && typeof nestedRow === 'object') {
            if (typeof nestedRow.get === 'function') {
              if (nestedRow.get(cKey) || nestedRow.get(cKey.toLowerCase())) return true;
            } else if (nestedRow[cKey] || nestedRow[cKey.toLowerCase()]) {
              return true;
            }
          }
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Finds all audit history entries for a given cell
 */
function getCellAuditEntries(editAuditHistory, rowKey, colKey, dataObj = null) {
  if (!Array.isArray(editAuditHistory) || editAuditHistory.length === 0) {
    return [];
  }
  try {
    const rLower = String(rowKey || '').toLowerCase().trim();
    const cLower = String(colKey || '').toLowerCase().trim();

    const candidateRowIds = new Set([rLower]);
    if (dataObj && typeof dataObj === 'object') {
      if (dataObj.time) candidateRowIds.add(String(dataObj.time).toLowerCase().trim());
      if (dataObj.id) candidateRowIds.add(String(dataObj.id).toLowerCase().trim());
      if (dataObj.sample) candidateRowIds.add(String(dataObj.sample).toLowerCase().trim());
      if (dataObj.shift) candidateRowIds.add(String(dataObj.shift).toLowerCase().trim());
    }

    return editAuditHistory.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;

      const pKey = String(entry.paramKey || entry.stream || entry.parameter || entry.field || entry.key || '')
        .toLowerCase()
        .trim();
      if (pKey !== cLower) return false;

      const sKey = String(entry.shiftKey || entry.shiftName || entry.rowKey || entry.timeKey || entry.time || entry.rowId || '')
        .toLowerCase()
        .trim();
      if (!sKey) return true;

      for (const cand of candidateRowIds) {
        if (!cand) continue;
        if (sKey === cand || sKey.includes(cand) || cand.includes(sKey)) {
          return true;
        }
      }
      return false;
    });
  } catch {
    return [];
  }
}

/**
 * Determines whether a cell is edited and builds its multi-entry audit note
 */
function getCellEditInfo(data, rowKey, colKey, dataObj = null) {
  if (!data || typeof data !== 'object') {
    return { isEdited: false, note: null };
  }

  const rStr = String(rowKey || '').trim();
  const cStr = String(colKey || '').trim();

  const candidateKeys = [
    `${rStr}_${cStr}`,
    `${rStr.toLowerCase()}_${cStr.toLowerCase()}`,
    `${cStr}`,
    `${cStr.toLowerCase()}`,
  ];
  if (dataObj && typeof dataObj === 'object') {
    if (dataObj.time) candidateKeys.push(`${dataObj.time}_${cStr}`);
    if (dataObj.id) candidateKeys.push(`${dataObj.id}_${cStr}`);
  }

  const editedFields = data.editedFields || null;
  const isMarked = isFieldMarkedEdited(editedFields, candidateKeys);

  const auditHistory = data.editAuditHistory || null;
  const matchingEntries = getCellAuditEntries(auditHistory, rowKey, colKey, dataObj);

  const isEdited = isMarked || matchingEntries.length > 0;
  if (!isEdited) {
    return { isEdited: false, note: null };
  }

  if (matchingEntries.length > 0) {
    const lines = matchingEntries.map((e) => {
      const oldStr = e.oldValue !== undefined && e.oldValue !== null ? e.oldValue : '*';
      const newStr = e.newValue !== undefined && e.newValue !== null ? e.newValue : '*';
      const byStr = e.editedBy ? ` by ${e.editedBy}` : '';
      const timeStr = e.timestamp ? `, ${formatTimestampIST(e.timestamp)}` : '';
      return `Edited (old ${oldStr} -> new ${newStr})${byStr}${timeStr}`;
    });
    return { isEdited: true, note: lines.join('\n') };
  }

  return { isEdited: true, note: 'Edited' };
}

/**
 * Resolves standard column objects from columnKeys and labelConfig
 */
function resolveColumns(columnKeys, labelConfig = null) {
  const columns = [];
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

    if (labelConfig.strictColumns === true) {
      return columns;
    }

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
    columnKeys.forEach((colKey) => {
      columns.push({
        key: colKey,
        label: String(colKey).toUpperCase(),
        unit: null,
        range: null,
      });
    });
  }
  return columns;
}

/**
 * Analyzes all cells in a table block to detect out-of-limit and edited cells
 */
function analyzeTableMarkedCells(data, rowEntries, columns) {
  let hasMarkedCells = false;
  const rowMarksMap = new Map();

  for (const row of rowEntries) {
    const cellMarks = {};

    for (const col of columns) {
      const val = row.dataObj ? row.dataObj[col.key] : null;
      const limit = parseColumnRange(col.range);
      const isOutOfLimit = checkOutOfLimit(val, limit);
      const editInfo = getCellEditInfo(data, row.rowKey, col.key, row.dataObj);
      const isEdited = editInfo.isEdited;

      if (isOutOfLimit || isEdited) {
        hasMarkedCells = true;
      }

      cellMarks[col.key] = {
        isOutOfLimit,
        isEdited,
        note: editInfo.note,
      };
    }

    rowMarksMap.set(row.rowKey, cellMarks);
  }

  return { hasMarkedCells, rowMarksMap };
}

/**
 * Apply consistent Excel table styling (Classic ACL Master Template Design)
 */
function applyHeaderStyle(cell) {
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC4D79B' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = THIN_BLACK_BORDER;
}

function applySubHeaderStyle(cell) {
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = THIN_BLACK_BORDER;
}

function applyDataCellStyle(cell, isFirstCol = false, isMissing = false, isOutOfLimit = false, isEdited = false) {
  if (isFirstCol) {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF660066' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC000' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  } else if (isOutOfLimit && isEdited) {
    // Both: red fill #FFC7CE and blue bold font #0000FF
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0000FF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC7CE' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  } else if (isOutOfLimit) {
    // Out of limit: fill #FFC7CE, font bold color #9C0006
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF9C0006' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC7CE' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  } else if (isEdited) {
    // Edited: font bold color #0000FF
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0000FF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  } else {
    cell.font = {
      name: 'Calibri',
      size: 11,
      color: { argb: isMissing ? 'FF7F7F7F' : 'FF000000' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  cell.border = THIN_BLACK_BORDER;
}

function applyTitleStyle(cell) {
  cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF660066' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC000' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
  cell.border = THIN_BLACK_BORDER;
}

function applySectionTitleStyle(cell) {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF660066' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC000' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = THIN_BLACK_BORDER;
}

/**
 * Adds a small legend 2 rows below the table
 */
function renderLegend(sheet, rowIdx) {
  const leg1 = sheet.getRow(rowIdx).getCell(1);
  leg1.value = 'Red = Out of limit';
  leg1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF9C0006' } };
  leg1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
  leg1.alignment = { vertical: 'middle', horizontal: 'center' };
  leg1.border = THIN_BLACK_BORDER;

  const leg2 = sheet.getRow(rowIdx).getCell(2);
  leg2.value = 'Blue = Edited';
  leg2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0000FF' } };
  leg2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  leg2.alignment = { vertical: 'middle', horizontal: 'center' };
  leg2.border = THIN_BLACK_BORDER;

  sheet.getRow(rowIdx).height = 20;
}

/**
 * Builds an Excel table grid from an array of row objects
 */
function renderTableBlock(
  sheet,
  startRow,
  sectionTitle,
  rowEntries,
  columns,
  labelConfig = null,
  totalMergeCols = null,
  rowMarksMap = null
) {
  let currentRow = startRow;

  if (sectionTitle) {
    const secRow = sheet.getRow(currentRow);
    secRow.height = 28;
    secRow.getCell(1).value = sectionTitle;
    applySectionTitleStyle(secRow.getCell(1));
    const mergeWidth = totalMergeCols || Math.max(columns.length + 1, 6);
    sheet.mergeCells(currentRow, 1, currentRow, mergeWidth);
    currentRow++;
  }

  // Only show subheader row if at least one column has a unit or range configured
  const hasSubHeader = Boolean(
    labelConfig &&
    Array.isArray(labelConfig.columns) &&
    labelConfig.columns.some((c) => (c.unit !== null && c.unit !== undefined && c.unit !== '') || (c.range !== null && c.range !== undefined && c.range !== ''))
  );

  // Header row 1: Parameter labels
  const headerRow = sheet.getRow(currentRow);
  headerRow.height = 30;
  const col1 = headerRow.getCell(1);
  col1.value = 'SHIFT / SAMPLE / TIME';
  applyHeaderStyle(col1);

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 2);
    cell.value = col.label;
    applyHeaderStyle(cell);
  });
  currentRow++;

  // Header row 2 (Subheader): Unit + Range (as text, never number/formula)
  if (hasSubHeader) {
    const subHeaderRow = sheet.getRow(currentRow);
    subHeaderRow.height = 34;

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
    dRow.height = 22;
    const cellMarks = rowMarksMap ? rowMarksMap.get(rowKey) : null;

    const labelCell = dRow.getCell(1);
    let finalLabel = label;
    if (labelConfig && labelConfig.rowLabels && rowKey && labelConfig.rowLabels[rowKey]) {
      finalLabel = labelConfig.rowLabels[rowKey];
    }
    labelCell.value = finalLabel;
    applyDataCellStyle(labelCell, true);

    columns.forEach((col, idx) => {
      const cell = dRow.getCell(idx + 2);
      const val = formatCellValue(dataObj ? dataObj[col.key] : null);
      cell.value = val;
      const isMissing = val === '*';

      const mark = cellMarks ? cellMarks[col.key] : null;
      const isOol = Boolean(mark?.isOutOfLimit);
      const isEd = Boolean(mark?.isEdited);

      applyDataCellStyle(cell, false, isMissing, isOol, isEd);

      if (isEd && mark?.note) {
        cell.note = mark.note;
      }
    });

    currentRow++;
  });

  return { nextRow: currentRow + 1, colsCount: columns.length + 1 };
}

/**
 * Auto-fits column widths for a worksheet based on content length
 */
function autoFitColumns(sheet, totalColumns = 1) {
  for (let c = 1; c <= totalColumns; c++) {
    const col = sheet.getColumn(c);
    if (c === 1) {
      let maxLen = 0;
      col.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.row !== 1 && cell.value !== null && cell.value !== undefined) {
          const s = String(cell.value);
          if (s.length > maxLen) maxLen = s.length;
        }
      });
      col.width = Math.min(Math.max(maxLen + 3, 22), 34);
    } else {
      let maxLen = 0;
      col.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.row !== 1 && cell.value !== null && cell.value !== undefined) {
          const s = String(cell.value);
          const parts = s.split(/[\s/]+/);
          const maxPart = parts.reduce((acc, p) => Math.max(acc, p.length), 0);
          const effectiveLen = Math.min(s.length, Math.max(maxPart, 8));
          if (effectiveLen > maxLen) maxLen = effectiveLen;
        }
      });
      col.width = Math.min(Math.max(maxLen + 3, 14), 20);
    }
  }
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

    if (!hasPureSalt && PureSaltAnalysis && typeof PureSaltAnalysis.findOne === 'function') {
      const queryRes = PureSaltAnalysis.findOne({ date, ...fallbackCompanyQuery });
      const pureSaltDoc = queryRes && typeof queryRes.lean === 'function' ? await queryRes.lean() : await queryRes;
      if (pureSaltDoc) {
        records.push({
          plantCode: 'ACL',
          analysisType: 'Pure Salt Analysis',
          date,
          data: pureSaltDoc,
        });
      }
    }

    if (!hasPureSaltSieve && PureSaltSieveAnalysis && typeof PureSaltSieveAnalysis.findOne === 'function') {
      const sieveQueryRes = PureSaltSieveAnalysis.findOne({ date, ...fallbackCompanyQuery });
      const sieveDoc = sieveQueryRes && typeof sieveQueryRes.lean === 'function' ? await sieveQueryRes.lean() : await sieveQueryRes;
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
    const baseConfig = getAnalysisConfig(at);
    let groupKey = at;
    if (baseConfig?.splitByUnit === true) {
      const normUnit = String(r.unit || '').toLowerCase().includes('200') ? 'cooling water 200#' : 'cooling water';
      groupKey = `${at}::${normUnit}`;
      r.unit = normUnit;
    }
    if (!groupedByType[groupKey]) {
      groupedByType[groupKey] = [];
    }
    groupedByType[groupKey].push(r);
  }

  const mergedRecords = Object.keys(groupedByType).map((gk) => mergeRecordsForAnalysis(groupedByType[gk]));

  // Sort analyses alphabetically by analysisType, tie-break by unit
  mergedRecords.sort((a, b) => {
    const atCompare = (a.analysisType || '').localeCompare(b.analysisType || '');
    if (atCompare !== 0) return atCompare;
    return (a.unit || '').localeCompare(b.unit || '');
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QCL Management Report System';
  workbook.created = new Date();

  const usedSheetNames = new Set();

  for (const rec of mergedRecords) {
    const analysisType = rec.analysisType || 'Analysis';
    const baseConfig = getAnalysisConfig(analysisType);
    const unitToPass = baseConfig?.splitByUnit === true ? rec.unit : null;
    const labelConfig = getAnalysisConfig(analysisType, unitToPass);
    const hasSubHeader = Boolean(
      labelConfig &&
      Array.isArray(labelConfig.columns) &&
      labelConfig.columns.some((c) => (c.unit !== null && c.unit !== undefined && c.unit !== '') || (c.range !== null && c.range !== undefined && c.range !== ''))
    );
    const sheetName = sanitizeSheetName(labelConfig?.sheetName || analysisType, usedSheetNames);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    let nextRow = 3;
    const data = rec.data || {};
    let isDualBlock = false;
    let sheetMaxCols = 1;

    const displayTitle = labelConfig?.title || analysisType.toUpperCase();

    // ── Pattern 1: Chemical Specs & BSS Sieves (ACL Product) ──
    if (data.chemical && typeof data.chemical === 'object' && data.bss && typeof data.bss === 'object') {
      isDualBlock = true;
      const chemKeys = Object.keys(data.chemical).filter((k) => !METADATA_KEYS.has(k));
      const bssKeys = Object.keys(data.bss).filter((k) => !METADATA_KEYS.has(k));

      const chemColumns = resolveColumns(chemKeys, null);
      const bssColumns = resolveColumns(bssKeys, null);
      const chemRows = [{ rowKey: 'chemical', label: 'Product Specifications', dataObj: data.chemical }];
      const bssRows = [{ rowKey: 'bss', label: 'Mesh Analysis', dataObj: data.bss }];

      const resChem = analyzeTableMarkedCells(data, chemRows, chemColumns);
      const resBss = analyzeTableMarkedCells(data, bssRows, bssColumns);
      const hasMarkedCells = resChem.hasMarkedCells || resBss.hasMarkedCells;

      sheetMaxCols = Math.max(chemColumns.length + 1, bssColumns.length + 1);
      const titleMergeCols = Math.max(sheetMaxCols, 6);

      // Title Banner
      const titleRow = sheet.getRow(1);
      titleRow.height = 30;
      const titleCell = titleRow.getCell(1);
      titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
      applyTitleStyle(titleCell);
      sheet.mergeCells(1, 1, 1, titleMergeCols);

      const res1 = renderTableBlock(
        sheet,
        nextRow,
        'CHEMICAL & PHYSICAL PARAMETERS',
        chemRows,
        chemColumns,
        null,
        titleMergeCols,
        resChem.rowMarksMap
      );
      nextRow = res1.nextRow;

      const res2 = renderTableBlock(
        sheet,
        nextRow,
        'BSS SIEVE FRACTIONS',
        bssRows,
        bssColumns,
        null,
        titleMergeCols,
        resBss.rowMarksMap
      );
      nextRow = res2.nextRow;

      if (hasMarkedCells) {
        renderLegend(sheet, nextRow);
        nextRow += 2;
      }
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
      const columns = resolveColumns(columnKeys, labelConfig);

      const rowEntries = data.readings.map((item, idx) => ({
        rowKey: String(idx),
        label: formatRowLabel(idx, item),
        dataObj: item,
      }));

      const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
      sheetMaxCols = columns.length + 1;
      const titleMergeCols = Math.max(sheetMaxCols, 6);

      const titleRow = sheet.getRow(1);
      titleRow.height = 30;
      const titleCell = titleRow.getCell(1);
      titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
      applyTitleStyle(titleCell);
      sheet.mergeCells(1, 1, 1, titleMergeCols);

      const res = renderTableBlock(
        sheet,
        nextRow,
        null,
        rowEntries,
        columns,
        labelConfig,
        titleMergeCols,
        analysisRes.rowMarksMap
      );
      sheetMaxCols = Math.max(sheetMaxCols, res.colsCount);
      nextRow = res.nextRow;

      if (analysisRes.hasMarkedCells) {
        renderLegend(sheet, nextRow);
        nextRow += 2;
      }
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
        const columns = resolveColumns(columnKeys, labelConfig);

        const rowEntries = sortedRowKeys.map((rk) => ({
          rowKey: rk,
          label: formatRowLabel(rk, rowContainer[rk]),
          dataObj: rowContainer[rk],
        }));

        const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
        sheetMaxCols = columns.length + 1;
        const titleMergeCols = Math.max(sheetMaxCols, 6);

        const titleRow = sheet.getRow(1);
        titleRow.height = 30;
        const titleCell = titleRow.getCell(1);
        titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
        applyTitleStyle(titleCell);
        sheet.mergeCells(1, 1, 1, titleMergeCols);

        const res = renderTableBlock(
          sheet,
          nextRow,
          null,
          rowEntries,
          columns,
          labelConfig,
          titleMergeCols,
          analysisRes.rowMarksMap
        );
        sheetMaxCols = Math.max(sheetMaxCols, res.colsCount);
        nextRow = res.nextRow;

        if (analysisRes.hasMarkedCells) {
          renderLegend(sheet, nextRow);
          nextRow += 2;
        }
      }
      // ── Pattern 4: Flat Parameters (Raw Salt) ──
      else if (data.parameters && typeof data.parameters === 'object') {
        const columnKeys = Object.keys(data.parameters).filter((k) => !METADATA_KEYS.has(k));
        const columns = resolveColumns(columnKeys, labelConfig);
        const rowEntries = [{ rowKey: 'daily', label: 'Daily Parameters', dataObj: data.parameters }];

        const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
        sheetMaxCols = columns.length + 1;
        const titleMergeCols = Math.max(sheetMaxCols, 6);

        const titleRow = sheet.getRow(1);
        titleRow.height = 30;
        const titleCell = titleRow.getCell(1);
        titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
        applyTitleStyle(titleCell);
        sheet.mergeCells(1, 1, 1, titleMergeCols);

        const res = renderTableBlock(
          sheet,
          nextRow,
          null,
          rowEntries,
          columns,
          labelConfig,
          titleMergeCols,
          analysisRes.rowMarksMap
        );
        sheetMaxCols = Math.max(sheetMaxCols, res.colsCount);
        nextRow = res.nextRow;

        if (analysisRes.hasMarkedCells) {
          renderLegend(sheet, nextRow);
          nextRow += 2;
        }
      }
      // ── Pattern 5: Generic Key-Value Fallback (if data is flat dictionary) ──
      else {
        const flatKeys = Object.keys(data).filter((k) => !METADATA_KEYS.has(k) && typeof data[k] !== 'function');
        if (flatKeys.length > 0) {
          const columns = resolveColumns(flatKeys, labelConfig);
          const rowEntries = [{ rowKey: 'recorded', label: 'Recorded Data', dataObj: data }];

          const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
          sheetMaxCols = columns.length + 1;
          const titleMergeCols = Math.max(sheetMaxCols, 6);

          const titleRow = sheet.getRow(1);
          titleRow.height = 30;
          const titleCell = titleRow.getCell(1);
          titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
          applyTitleStyle(titleCell);
          sheet.mergeCells(1, 1, 1, titleMergeCols);

          const res = renderTableBlock(
            sheet,
            nextRow,
            null,
            rowEntries,
            columns,
            labelConfig,
            titleMergeCols,
            analysisRes.rowMarksMap
          );
          sheetMaxCols = Math.max(sheetMaxCols, res.colsCount);
          nextRow = res.nextRow;

          if (analysisRes.hasMarkedCells) {
            renderLegend(sheet, nextRow);
            nextRow += 2;
          }
        } else {
          sheetMaxCols = 6;
          const titleMergeCols = 6;
          const titleRow = sheet.getRow(1);
          titleRow.height = 30;
          const titleCell = titleRow.getCell(1);
          titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
          applyTitleStyle(titleCell);
          sheet.mergeCells(1, 1, 1, titleMergeCols);

          const emptyRow = sheet.getRow(nextRow);
          emptyRow.height = 22;
          emptyRow.getCell(1).value = 'No data values recorded for this analysis.';
          applyDataCellStyle(emptyRow.getCell(1), true);
        }
      }
    }

    // Freeze panes:
    // - Two-block sheets: no freeze
    // - Single-block sheets:
    //   - More than 10 columns: freeze first column (xSplit: 1) and header rows (ySplit)
    //   - 10 columns or fewer: freeze rows only (xSplit: 0), no column freeze
    if (isDualBlock) {
      sheet.views = [{ showGridLines: true }];
    } else {
      const splitRow = hasSubHeader ? 4 : 3;
      const xSplit = sheetMaxCols > 10 ? 1 : 0;
      sheet.views = [{ showGridLines: true, state: 'frozen', xSplit, ySplit: splitRow }];
    }

    // Page setup: landscape, fit to 1 page wide, repeat headers, narrow margins
    sheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
      printTitlesRow: isDualBlock ? undefined : (hasSubHeader ? '3:4' : '3:3'),
    };

    autoFitColumns(sheet, Math.max(sheetMaxCols, 6));
  }

  return { workbook, recordCount: mergedRecords.length };
}

module.exports = {
  generateGenericPlantReportWorkbook,
  PLANT_ALIASES,
};
