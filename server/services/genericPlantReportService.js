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
  'plantName',
  'unit',
  'tank',
  'analysisType',
  'frequency',
  'sample',
  'time',
  'shift',
  'status',
  'isSaved',
  'isLocked',
  'initialSaved',
  'editCount',
  'editedFields',
  'editAuditHistory',
  'lockedShifts',
  'lockedSlots',
  'submittedBy',
  'submittedById',
  'submittedAt',
  'lastSaveEventId',
  'savedAt',
  'company',
  'emailStatus',
  'emailRecipient',
  'assignedOperatorEmail',
  'resolvedDate',
  'displayDate',
  'shiftKey',
]);

/**
 * Format cell value safely:
 * - null/undefined/''/NaN -> '*'
 * - number -> Number(val) (preserves raw numeric value in Excel)
 * - object/array -> '*' with console warning (never prints [object Object] or key: value text)
 */
function formatCellValue(val, context = null) {
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
  if (typeof val === 'object') {
    const at = context?.analysisType || 'Analysis';
    const key = context?.key || 'unknown';
    console.warn(`[Report Service] Unexpected nested object in cell for ${at} key: ${key}`, val);
    return '*';
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
 * Check if a value is a plain row object containing measurements (not an array, primitive, or boolean map)
 */
function isPlainRowObject(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    return false;
  }
  const vals = Object.values(val);
  if (vals.length === 0) return true;
  // If all values are booleans, it is a boolean state map (e.g. lockedShifts, editedFields)
  const isBooleanMap = vals.every((v) => typeof v === 'boolean');
  if (isBooleanMap) return false;
  return true;
}

/**
 * Resolves the row container from analysis data:
 * 1. Checks explicit containers (data.rows, data.shifts, data.shiftRows, data.timeRows)
 * 2. Checks data itself if it contains plain row objects (excluding metadata keys)
 */
function findRowContainer(data) {
  if (!data || typeof data !== 'object') return null;

  // 1. Explicit container candidates
  const explicitCandidates = [data.rows, data.shifts, data.shiftRows, data.timeRows];
  for (const cand of explicitCandidates) {
    if (cand && typeof cand === 'object') {
      if (Array.isArray(cand) && cand.length > 0) {
        return cand;
      }
      const keys = Object.keys(cand).filter((k) => !METADATA_KEYS.has(k) && typeof cand[k] !== 'function');
      if (keys.length > 0 && keys.some((k) => isPlainRowObject(cand[k]))) {
        return cand;
      }
    }
  }

  // 2. Data itself as container (e.g. data = { week: { cl, so4, ... } } or data = { day: { ... } })
  const validDataKeys = Object.keys(data).filter(
    (k) => !METADATA_KEYS.has(k) && typeof data[k] !== 'function' && isPlainRowObject(data[k])
  );
  if (validDataKeys.length > 0) {
    const directContainer = {};
    validDataKeys.forEach((k) => {
      directContainer[k] = data[k];
    });
    return directContainer;
  }

  return null;
}

/**
 * Format a row key into a user-friendly label:
 * 1. config.rowLabels[key] (case-insensitive priority)
 * 2. item metadata (sample, stream, time)
 * 3. SHIFT_MAP or SLOT_TIME_ORDER
 * 4. Key uppercased fallback
 */
function formatRowLabel(key, item = null, labelConfig = null) {
  // 1. Config rowLabels priority (case-insensitive)
  if (labelConfig && labelConfig.rowLabels && typeof labelConfig.rowLabels === 'object') {
    const kStr = String(key || '').trim().toLowerCase();
    for (const [rk, rLabel] of Object.entries(labelConfig.rowLabels)) {
      if (String(rk).trim().toLowerCase() === kStr && rLabel) {
        return String(rLabel).trim();
      }
    }
  }

  // 2. Item metadata properties
  if (item && item.sample) {
    return item.time ? `${item.sample} (${item.time})` : item.sample;
  }
  if (item && item.stream != null && String(item.stream).trim() !== '') {
    return String(item.stream).trim();
  }
  if (item && item.time != null && String(item.time).trim() !== '') {
    return String(item.time).trim();
  }

  // 3. Known shift / time slot maps
  const lower = String(key || '').toLowerCase().trim();
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

  // 4. Uppercase fallback
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
 * Safely inspects a nested object path using segments (supports Map or Object at each level)
 */
function checkNestedPath(obj, segments) {
  if (!obj || typeof obj !== 'object' || segments.length === 0) return false;
  let curr = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!curr || typeof curr !== 'object') return false;
    let next = undefined;
    if (typeof curr.get === 'function') {
      next = curr.get(seg) !== undefined ? curr.get(seg) : curr.get(seg.toLowerCase());
    } else {
      next = curr[seg] !== undefined ? curr[seg] : curr[seg.toLowerCase()];
    }
    if (i === segments.length - 1) {
      return Boolean(next);
    }
    curr = next;
  }
  return false;
}

/**
 * Safely inspects editedFields across various data structures (Object, Map, Array, Set, nested up to 3 levels)
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
      // Deep path checks
      for (const key of candidateKeys) {
        if (key.includes('.')) {
          const segments = key.split('.');
          if (checkNestedPath(editedFields, segments)) return true;
        }
        if (key.includes('_')) {
          const parts = key.split('_');
          if (checkNestedPath(editedFields, parts)) return true;
          if (checkNestedPath(editedFields, [parts[0], parts.slice(1).join('_')])) return true;
          if (parts.length >= 3 && checkNestedPath(editedFields, [parts[0], parts[1], parts.slice(2).join('_')])) {
            return true;
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
      if (dataObj.unitKey) candidateRowIds.add(String(dataObj.unitKey).toLowerCase().trim());
    }

    const candidateParamKeys = new Set([cLower]);
    if (cLower.includes('__')) {
      const [grpLower, pLower] = cLower.split('__');
      candidateParamKeys.add(pLower);
      candidateParamKeys.add(`${grpLower}_${pLower}`);
    }

    return editAuditHistory.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;

      const pKey = String(entry.paramKey || entry.stream || entry.parameter || entry.field || entry.key || '')
        .toLowerCase()
        .trim();
      if (!candidateParamKeys.has(pKey)) return false;

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
    if (dataObj.time) {
      candidateKeys.push(`${dataObj.time}_${cStr}`);
      candidateKeys.push(`${dataObj.time.toLowerCase()}_${cStr.toLowerCase()}`);
      candidateKeys.push(`hourly.${dataObj.time}_${cStr}`);
      candidateKeys.push(`hourly.${dataObj.time.toLowerCase()}_${cStr.toLowerCase()}`);
    }
    if (dataObj.id) {
      candidateKeys.push(`${dataObj.id}_${cStr}`);
      candidateKeys.push(`${dataObj.id.toLowerCase()}_${cStr.toLowerCase()}`);
      candidateKeys.push(`hourly.${dataObj.id}_${cStr}`);
      candidateKeys.push(`hourly.${dataObj.id.toLowerCase()}_${cStr.toLowerCase()}`);
    }
    if (dataObj.unitKey) {
      const uStr = String(dataObj.unitKey).trim();
      candidateKeys.push(`${uStr}_${rStr}_${cStr}`);
      candidateKeys.push(`${uStr.toLowerCase()}_${rStr.toLowerCase()}_${cStr.toLowerCase()}`);
      candidateKeys.push(`${uStr}.${rStr}.${cStr}`);
      candidateKeys.push(`${uStr.toLowerCase()}.${rStr.toLowerCase()}.${cStr.toLowerCase()}`);
      candidateKeys.push(`${uStr}_${cStr}`);
      candidateKeys.push(`${uStr.toLowerCase()}_${cStr.toLowerCase()}`);
    }
  }

  // Handle compound group columns (e.g. Sewer Water: sec200__fnh3)
  if (cStr.includes('__')) {
    const [grp, pKey] = cStr.split('__');
    candidateKeys.push(`${grp}_${pKey}`);
    candidateKeys.push(`${grp.toLowerCase()}_${pKey.toLowerCase()}`);
    candidateKeys.push(`${grp}.${pKey}`);
    candidateKeys.push(`${grp.toLowerCase()}.${pKey.toLowerCase()}`);
    candidateKeys.push(`${rStr}_${grp}_${pKey}`);
    candidateKeys.push(`${rStr.toLowerCase()}_${grp.toLowerCase()}_${pKey.toLowerCase()}`);
    candidateKeys.push(`${rStr}.${grp}.${pKey}`);
    candidateKeys.push(`${rStr.toLowerCase()}.${grp.toLowerCase()}.${pKey.toLowerCase()}`);
    if (dataObj && typeof dataObj === 'object') {
      if (dataObj.time) {
        candidateKeys.push(`${dataObj.time}_${grp}_${pKey}`);
        candidateKeys.push(`${dataObj.time.toLowerCase()}_${grp.toLowerCase()}_${pKey.toLowerCase()}`);
        candidateKeys.push(`${dataObj.time}.${grp}.${pKey}`);
        candidateKeys.push(`${dataObj.time.toLowerCase()}.${grp.toLowerCase()}.${pKey.toLowerCase()}`);
      }
      if (dataObj.id) {
        candidateKeys.push(`${dataObj.id}_${grp}_${pKey}`);
        candidateKeys.push(`${dataObj.id.toLowerCase()}_${grp.toLowerCase()}_${pKey.toLowerCase()}`);
        candidateKeys.push(`${dataObj.id}.${grp}.${pKey}`);
        candidateKeys.push(`${dataObj.id.toLowerCase()}.${grp.toLowerCase()}.${pKey.toLowerCase()}`);
      }
    }
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
 * Formats compound keys like "finalOutlet__pcl" -> "FINAL OUTLET PCL"
 */
function formatCompoundLabel(key) {
  if (typeof key !== 'string') return String(key).toUpperCase();
  if (key.includes('__')) {
    const parts = key.split('__');
    const groupFormatted = parts[0]
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .toUpperCase();
    const paramFormatted = parts.slice(1).join(' ').trim().toUpperCase();
    return `${groupFormatted} ${paramFormatted}`;
  }
  return key.toUpperCase();
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
        label: c.label || formatCompoundLabel(c.key),
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
          label: formatCompoundLabel(k),
          unit: null,
          range: null,
        });
      }
    });
  } else {
    columnKeys.forEach((colKey) => {
      columns.push({
        key: colKey,
        label: formatCompoundLabel(colKey),
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
  let oolCount = 0;
  let edCount = 0;
  const rowMarksMap = new Map();

  for (const row of rowEntries) {
    const cellMarks = {};

    for (const col of columns) {
      const val = row.dataObj ? row.dataObj[col.key] : null;
      const limit = parseColumnRange(col.range);
      const isOutOfLimit = checkOutOfLimit(val, limit);
      const editInfo = getCellEditInfo(data, row.rowKey, col.key, row.dataObj);
      const isEdited = editInfo.isEdited;

      if (isOutOfLimit) oolCount++;
      if (isEdited) edCount++;

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

  return { hasMarkedCells, rowMarksMap, oolCount, edCount };
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
      const val = formatCellValue(dataObj ? dataObj[col.key] : null, {
        analysisType: sectionTitle || 'Analysis',
        key: col.key,
      });
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
 * Renders a single analysis sheet onto a workbook.
 * Returns { sheetName, fullAnalysisName, unit, oolCount, edCount, hasConfiguredRanges, hasMarkedCells }
 */
function renderAnalysisSheet({
  workbook,
  rec,
  normPlant,
  date,
  usedSheetNames,
  sheetNameOverride = null,
  tabColor = null,
}) {
  const analysisType = rec.analysisType || 'Analysis';
  const baseConfig = getAnalysisConfig(analysisType);
  const unitToPass = baseConfig?.splitByUnit === true ? rec.unit : null;
  const labelConfig = getAnalysisConfig(analysisType, unitToPass);
  const hasSubHeader = Boolean(
    labelConfig &&
    Array.isArray(labelConfig.columns) &&
    labelConfig.columns.some((c) => (c.unit !== null && c.unit !== undefined && c.unit !== '') || (c.range !== null && c.range !== undefined && c.range !== ''))
  );

  const rawSheetName = sheetNameOverride || labelConfig?.sheetName || analysisType;
  const sheetName = sanitizeSheetName(rawSheetName, usedSheetNames);
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  if (tabColor) {
    sheet.properties.tabColor = { argb: tabColor };
  }

  let nextRow = 3;
  const data = rec.data || {};
  let isDualBlock = false;
  let sheetMaxCols = 1;
  let totalOol = 0;
  let totalEd = 0;
  let hasMarked = false;
  let anyRangeConfigured = Boolean(
    labelConfig &&
    Array.isArray(labelConfig.columns) &&
    labelConfig.columns.some((c) => c && c.range && String(c.range).trim() !== '' && parseColumnRange(c.range) !== null)
  );

  const displayTitle = labelConfig?.title || analysisType.toUpperCase();

  const checkColsRanges = (cols) => {
    if (Array.isArray(cols) && cols.some((c) => c && c.range && String(c.range).trim() !== '' && parseColumnRange(c.range) !== null)) {
      anyRangeConfigured = true;
    }
  };

  // ── Pattern 1: Chemical Specs & BSS Sieves (ACL Product) ──
  if (data.chemical && typeof data.chemical === 'object' && data.bss && typeof data.bss === 'object') {
    isDualBlock = true;
    const chemKeys = Object.keys(data.chemical).filter((k) => !METADATA_KEYS.has(k));
    const bssKeys = Object.keys(data.bss).filter((k) => !METADATA_KEYS.has(k));

    const chemColumns = resolveColumns(chemKeys, null);
    const bssColumns = resolveColumns(bssKeys, null);
    checkColsRanges(chemColumns);
    checkColsRanges(bssColumns);

    const chemRows = [{ rowKey: 'chemical', label: 'Product Specifications', dataObj: data.chemical }];
    const bssRows = [{ rowKey: 'bss', label: 'Mesh Analysis', dataObj: data.bss }];

    const resChem = analyzeTableMarkedCells(data, chemRows, chemColumns);
    const resBss = analyzeTableMarkedCells(data, bssRows, bssColumns);
    totalOol += resChem.oolCount + resBss.oolCount;
    totalEd += resChem.edCount + resBss.edCount;
    const hasMarkedCells = resChem.hasMarkedCells || resBss.hasMarkedCells;
    if (hasMarkedCells) hasMarked = true;

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
  // ── Pattern 1B: Shift Analysis & Hourly Readings (LSA Bagging) ──
  else if (
    data.shiftAnalysis &&
    typeof data.shiftAnalysis === 'object' &&
    (Array.isArray(data.hourlyReadings) || Array.isArray(data.hourly))
  ) {
    isDualBlock = true;
    const hourlyList = Array.isArray(data.hourlyReadings) ? data.hourlyReadings : data.hourly;

    // 1. Shift Analysis Block
    const shiftKeys = ['shift1', 'shift2', 'shift3'].filter((k) => data.shiftAnalysis[k]);
    const shiftParamKeys = [];
    shiftKeys.forEach((sk) => {
      const sObj = data.shiftAnalysis[sk];
      if (sObj && typeof sObj === 'object') {
        Object.keys(sObj).forEach((pk) => {
          if (!METADATA_KEYS.has(pk) && !shiftParamKeys.includes(pk)) {
            shiftParamKeys.push(pk);
          }
        });
      }
    });
    const shiftColumns = resolveColumns(shiftParamKeys, labelConfig);
    checkColsRanges(shiftColumns);
    const shiftRows = shiftKeys.map((sk) => ({
      rowKey: sk,
      label: formatRowLabel(sk, data.shiftAnalysis[sk], labelConfig),
      dataObj: data.shiftAnalysis[sk],
    }));

    // 2. Hourly Readings Block (keep order of hourlyReadings as stored)
    const hourlyParamKeys = [];
    hourlyList.forEach((item) => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach((pk) => {
          if (!METADATA_KEYS.has(pk) && !['id', 'time', 'shift'].includes(pk) && !hourlyParamKeys.includes(pk)) {
            hourlyParamKeys.push(pk);
          }
        });
      }
    });
    const hourlyColumns = resolveColumns(hourlyParamKeys, labelConfig);
    checkColsRanges(hourlyColumns);
    const hourlyRows = hourlyList.map((item, idx) => ({
      rowKey: item.time || item.id || String(idx),
      label: item.time || item.id || `Reading ${idx + 1}`,
      dataObj: item,
    }));

    const resShift = analyzeTableMarkedCells(data, shiftRows, shiftColumns);
    const resHourly = analyzeTableMarkedCells(data, hourlyRows, hourlyColumns);
    totalOol += resShift.oolCount + resHourly.oolCount;
    totalEd += resShift.edCount + resHourly.edCount;
    const hasMarkedCells = resShift.hasMarkedCells || resHourly.hasMarkedCells;
    if (hasMarkedCells) hasMarked = true;

    sheetMaxCols = Math.max(shiftColumns.length + 1, hourlyColumns.length + 1);
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
      'SHIFT ANALYSIS',
      shiftRows,
      shiftColumns,
      labelConfig,
      titleMergeCols,
      resShift.rowMarksMap
    );
    nextRow = res1.nextRow;

    const res2 = renderTableBlock(
      sheet,
      nextRow,
      'HOURLY READINGS',
      hourlyRows,
      hourlyColumns,
      labelConfig,
      titleMergeCols,
      resHourly.rowMarksMap
    );
    nextRow = res2.nextRow;

    if (hasMarkedCells) {
      renderLegend(sheet, nextRow);
      nextRow += 2;
    }
  }
  // ── Pattern 1C: Nested Unit Towers (T 401 Analysis) ──
  else if (
    (data.units || (!data.units && data.towers)) &&
    typeof (data.units || data.towers) === 'object' &&
    !Array.isArray(data.units || data.towers) &&
    Object.values(data.units || data.towers).some(
      (u) => u && typeof u === 'object' && !Array.isArray(u) && Object.values(u).some((s) => s && typeof s === 'object' && !Array.isArray(s))
    )
  ) {
    isDualBlock = true;
    const unitContainer = data.units || data.towers;
    const unitKeys = Object.keys(unitContainer).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Collect all parameter keys across all units & shifts in first-seen order
    const allParamKeys = [];
    unitKeys.forEach((uk) => {
      const uObj = unitContainer[uk];
      if (uObj && typeof uObj === 'object') {
        Object.values(uObj).forEach((sObj) => {
          if (sObj && typeof sObj === 'object') {
            Object.keys(sObj).forEach((pk) => {
              if (!METADATA_KEYS.has(pk) && !allParamKeys.includes(pk)) {
                allParamKeys.push(pk);
              }
            });
          }
        });
      }
    });
    const unitColumns = resolveColumns(allParamKeys, labelConfig);
    checkColsRanges(unitColumns);

    let anyMarked = false;
    const unitBlocksData = [];

    unitKeys.forEach((uk) => {
      const uObj = unitContainer[uk] || {};
      const shiftKeys = Object.keys(uObj).sort((a, b) => getRowOrderWeight(a) - getRowOrderWeight(b));
      const unitRowEntries = shiftKeys.map((sk) => ({
        rowKey: sk,
        label: formatRowLabel(sk, uObj[sk], labelConfig),
        dataObj: { ...(uObj[sk] || {}), unitKey: uk },
      }));

      const resUnit = analyzeTableMarkedCells(data, unitRowEntries, unitColumns);
      totalOol += resUnit.oolCount;
      totalEd += resUnit.edCount;
      if (resUnit.hasMarkedCells) {
        anyMarked = true;
        hasMarked = true;
      }

      unitBlocksData.push({
        unitKey: uk,
        unitTitle: `UNIT ${uk.toUpperCase()}`,
        rowEntries: unitRowEntries,
        rowMarksMap: resUnit.rowMarksMap,
      });
    });

    sheetMaxCols = unitColumns.length + 1;
    const titleMergeCols = Math.max(sheetMaxCols, 6);

    // Title Banner
    const titleRow = sheet.getRow(1);
    titleRow.height = 30;
    const titleCell = titleRow.getCell(1);
    titleCell.value = `${normPlant} PLANT — ${displayTitle} | DATE: ${date}`;
    applyTitleStyle(titleCell);
    sheet.mergeCells(1, 1, 1, titleMergeCols);

    unitBlocksData.forEach((ub) => {
      const resBlock = renderTableBlock(
        sheet,
        nextRow,
        ub.unitTitle,
        ub.rowEntries,
        unitColumns,
        labelConfig,
        titleMergeCols,
        ub.rowMarksMap
      );
      nextRow = resBlock.nextRow;
    });

    if (anyMarked) {
      renderLegend(sheet, nextRow);
      nextRow += 2;
    }
  }
  // ── Pattern 2: Readings Array (Sewer Water, BFW, DM Water, CaCl2, Cooling Water, etc.) ──
  else if (Array.isArray(data.readings) && data.readings.length > 0) {
    const hasNestedGroups = data.readings.some(
      (item) => item && typeof item === 'object' && Object.entries(item).some(
        ([k, v]) => !METADATA_KEYS.has(k) && v && typeof v === 'object' && !Array.isArray(v)
      )
    );

    let columns = [];
    let rowEntries = [];

    if (hasNestedGroups) {
      // Sewer Water Analysis: group order as first appear (sec200, sec400, finalOutlet), params in first-seen order
      const orderedGroups = [];
      const groupParamsMap = new Map();

      data.readings.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        Object.entries(item).forEach(([k, v]) => {
          if (METADATA_KEYS.has(k)) return;
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            if (!groupParamsMap.has(k)) {
              orderedGroups.push(k);
              groupParamsMap.set(k, []);
            }
            const existingParams = groupParamsMap.get(k);
            Object.keys(v).forEach((pk) => {
              if (!METADATA_KEYS.has(pk) && !existingParams.includes(pk)) {
                existingParams.push(pk);
              }
            });
          }
        });
      });

      orderedGroups.forEach((grp) => {
        const params = groupParamsMap.get(grp);
        params.forEach((pk) => {
          const colKey = `${grp}__${pk}`;
          columns.push({
            key: colKey,
            label: formatCompoundLabel(colKey),
            unit: null,
            range: null,
          });
        });
      });

      rowEntries = data.readings.map((item, idx) => {
        const flatDataObj = { id: item.id, time: item.time };
        orderedGroups.forEach((grp) => {
          const grpObj = item[grp] || {};
          groupParamsMap.get(grp).forEach((pk) => {
            flatDataObj[`${grp}__${pk}`] = (grpObj[pk] !== undefined && grpObj[pk] !== null && grpObj[pk] !== '')
              ? grpObj[pk]
              : '*';
          });
        });

        return {
          rowKey: item.time || item.id || String(idx),
          label: item.time || formatRowLabel(idx, item, labelConfig),
          dataObj: flatDataObj,
        };
      });
    } else {
      const allKeys = new Set();
      data.readings.forEach((item) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((k) => {
            if (!METADATA_KEYS.has(k)) allKeys.add(k);
          });
        }
      });
      const columnKeys = Array.from(allKeys);
      columns = resolveColumns(columnKeys, labelConfig);

      rowEntries = data.readings.map((item, idx) => ({
        rowKey: String(idx),
        label: formatRowLabel(idx, item, labelConfig),
        dataObj: item,
      }));
    }

    checkColsRanges(columns);
    const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
    totalOol += analysisRes.oolCount;
    totalEd += analysisRes.edCount;
    if (analysisRes.hasMarkedCells) hasMarked = true;

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
  // ── Pattern 4: Flat Parameters Priority (Raw Salt) ──
  else if (data.parameters && typeof data.parameters === 'object') {
    const columnKeys = Object.keys(data.parameters).filter((k) => !METADATA_KEYS.has(k));
    const columns = resolveColumns(columnKeys, labelConfig);
    checkColsRanges(columns);
    const rowEntries = [{ rowKey: 'daily', label: 'Daily Parameters', dataObj: data.parameters }];

    const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
    totalOol += analysisRes.oolCount;
    totalEd += analysisRes.edCount;
    if (analysisRes.hasMarkedCells) hasMarked = true;

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
  // ── Pattern 3: Generalized Keyed Rows (Lean Analysis, SA Tanks, CO2 Weekly, TK 204, Brine, etc.) ──
  else {
    const rowContainer = findRowContainer(data);

    if (rowContainer && typeof rowContainer === 'object' && Object.keys(rowContainer).length > 0) {
      const rowKeys = Object.keys(rowContainer);
      const hasDay = rowKeys.some((k) => k.toLowerCase() === 'day');
      const hasShift = rowKeys.some((k) => ['shift1', 'shift2', 'shift3', 's1', 's2', 's3'].includes(k.toLowerCase()));
      const isLeanShiftDay = hasDay && hasShift;

      if (isLeanShiftDay) {
        isDualBlock = true;
        const shiftOrder = ['shift1', 'shift2', 'shift3', 's1', 's2', 's3'];
        const shiftKeys = shiftOrder.filter((k) => rowContainer[k]);
        const dayKeys = rowKeys.filter((k) => k.toLowerCase() === 'day');
        const otherKeys = rowKeys.filter((k) => !shiftKeys.includes(k) && !dayKeys.includes(k));

        // 1. Shift Analysis Block
        const shiftParamKeys = [];
        shiftKeys.forEach((sk) => {
          const sObj = rowContainer[sk];
          if (sObj && typeof sObj === 'object') {
            Object.keys(sObj).forEach((pk) => {
              if (!METADATA_KEYS.has(pk) && !shiftParamKeys.includes(pk)) {
                shiftParamKeys.push(pk);
              }
            });
          }
        });
        const shiftColumns = resolveColumns(shiftParamKeys, labelConfig);
        checkColsRanges(shiftColumns);
        const shiftRows = shiftKeys.map((sk) => ({
          rowKey: sk,
          label: formatRowLabel(sk, rowContainer[sk], labelConfig),
          dataObj: rowContainer[sk],
        }));

        // 2. Day Routine Block
        const dayParamKeys = [];
        dayKeys.forEach((dk) => {
          const dObj = rowContainer[dk];
          if (dObj && typeof dObj === 'object') {
            Object.keys(dObj).forEach((pk) => {
              if (!METADATA_KEYS.has(pk) && !dayParamKeys.includes(pk)) {
                dayParamKeys.push(pk);
              }
            });
          }
        });
        const dayColumns = resolveColumns(dayParamKeys, labelConfig);
        checkColsRanges(dayColumns);
        const dayRows = dayKeys.map((dk) => ({
          rowKey: dk,
          label: formatRowLabel(dk, rowContainer[dk], labelConfig),
          dataObj: rowContainer[dk],
        }));

        const resShift = analyzeTableMarkedCells(data, shiftRows, shiftColumns);
        const resDay = analyzeTableMarkedCells(data, dayRows, dayColumns);
        totalOol += resShift.oolCount + resDay.oolCount;
        totalEd += resShift.edCount + resDay.edCount;
        let hasMarkedCells = resShift.hasMarkedCells || resDay.hasMarkedCells;
        if (hasMarkedCells) hasMarked = true;

        sheetMaxCols = Math.max(shiftColumns.length + 1, dayColumns.length + 1);
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
          'SHIFT ANALYSIS',
          shiftRows,
          shiftColumns,
          labelConfig,
          titleMergeCols,
          resShift.rowMarksMap
        );
        nextRow = res1.nextRow;

        const res2 = renderTableBlock(
          sheet,
          nextRow,
          'DAY ROUTINE',
          dayRows,
          dayColumns,
          labelConfig,
          titleMergeCols,
          resDay.rowMarksMap
        );
        nextRow = res2.nextRow;

        // 3. Other Blocks if any other keys exist
        otherKeys.forEach((ok) => {
          const oParamKeys = [];
          const oObj = rowContainer[ok];
          if (oObj && typeof oObj === 'object') {
            Object.keys(oObj).forEach((pk) => {
              if (!METADATA_KEYS.has(pk) && !oParamKeys.includes(pk)) {
                oParamKeys.push(pk);
              }
            });
          }
          const oColumns = resolveColumns(oParamKeys, labelConfig);
          checkColsRanges(oColumns);
          const oRows = [{
            rowKey: ok,
            label: formatRowLabel(ok, rowContainer[ok], labelConfig),
            dataObj: rowContainer[ok],
          }];
          const resOther = analyzeTableMarkedCells(data, oRows, oColumns);
          totalOol += resOther.oolCount;
          totalEd += resOther.edCount;
          if (resOther.hasMarkedCells) {
            hasMarkedCells = true;
            hasMarked = true;
          }
          const resO = renderTableBlock(
            sheet,
            nextRow,
            ok.toUpperCase(),
            oRows,
            oColumns,
            labelConfig,
            titleMergeCols,
            resOther.rowMarksMap
          );
          nextRow = resO.nextRow;
        });

        if (hasMarkedCells) {
          renderLegend(sheet, nextRow);
          nextRow += 2;
        }
      } else {
        // Standard Single-Block Keyed Rows
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
        checkColsRanges(columns);

        const rowEntries = sortedRowKeys.map((rk) => ({
          rowKey: rk,
          label: formatRowLabel(rk, rowContainer[rk], labelConfig),
          dataObj: rowContainer[rk],
        }));

        const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
        totalOol += analysisRes.oolCount;
        totalEd += analysisRes.edCount;
        if (analysisRes.hasMarkedCells) hasMarked = true;

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
    }
    // ── Pattern 5: Generic Key-Value Fallback (if data is flat dictionary of primitive parameters) ──
    else {
      const flatKeys = Object.keys(data).filter((k) => !METADATA_KEYS.has(k) && typeof data[k] !== 'function' && !isPlainRowObject(data[k]));
      if (flatKeys.length > 0) {
        const columns = resolveColumns(flatKeys, labelConfig);
        checkColsRanges(columns);
        const rowEntries = [{ rowKey: 'recorded', label: 'Recorded Data', dataObj: data }];

        const analysisRes = analyzeTableMarkedCells(data, rowEntries, columns);
        totalOol += analysisRes.oolCount;
        totalEd += analysisRes.edCount;
        if (analysisRes.hasMarkedCells) hasMarked = true;

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

  return {
    sheetName,
    fullAnalysisName: analysisType,
    unit: rec.unit || null,
    oolCount: totalOol,
    edCount: totalEd,
    hasConfiguredRanges: anyRangeConfigured,
    hasMarkedCells: hasMarked,
  };
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
    renderAnalysisSheet({
      workbook,
      rec,
      normPlant,
      date,
      usedSheetNames,
    });
  }

  return { workbook, recordCount: mergedRecords.length };
}

// ─── All Plants Master Report Configuration ───────────────────────────────────

const ALL_PLANTS_ORDER = ['ACL', 'SA', 'OFFSITE', 'CO2'];

const PLANT_TAB_COLORS = {
  ACL: 'FF2E7D32',      // Emerald Green
  SA: 'FFE65100',       // Amber / Orange
  OFFSITE: 'FF0288D1',  // Sky Blue
  CO2: 'FF6A1B9A',      // Purple
};

const SUMMARY_TAB_COLOR = 'FF455A64'; // Dark Slate Gray

/**
 * Shorten analysis names deterministically with <PLANT> prefix:
 * Rule:
 * 1. Prefix is strictly `<plant> ` (from current plant loop variable).
 * 2. Strip redundant words ("Analysis", "Routine", "Report", "Reports").
 * 3. Abbreviate "Weekly" -> "Wkly", "Absorber" -> "Abs", "C.W Water" -> "CW".
 * 4. Max length <= 31 chars.
 */
function getShortAnalysisName(plant, analysisType, unit = null) {
  let name = String(analysisType || '').trim();
  name = name.replace(/\s+(Analysis|Routine|Reports?)\b/gi, '').trim();
  name = name.replace(/^Analysis\s+(for\s+)?/i, '').trim();
  name = name.replace(/\s*\(C\.W Water\)/gi, '').trim();
  name = name.replace(/\bBoiler Feed Water\b/gi, 'BFW').trim();

  // If name already starts with plant prefix, remove it to avoid "ACL ACL Product"
  if (name.toUpperCase().startsWith(`${plant} `)) {
    name = name.slice(plant.length).trim();
  }

  if (unit) {
    const uStr = String(unit).toLowerCase();
    if (uStr.includes('200')) {
      name = `${name} 200#`;
    }
  }

  name = name.replace(/\bWeekly\b/gi, 'Wkly').trim();
  name = name.replace(/\bAbsorber\b/gi, 'Abs').trim();
  name = name.replace(/\s+/g, ' ').trim();

  const prefix = `${plant} `;
  const maxShortLen = 31 - prefix.length;
  const shortName = name.slice(0, maxShortLen).trim();
  return `${prefix}${shortName}`.slice(0, 31);
}

/**
 * Generates an Excel workbook containing all 4 plants (ACL, SA, OFFSITE, CO2)
 * with a comprehensive SUMMARY front sheet.
 * 
 * @param {Object} options
 * @param {string} options.date - 'YYYY-MM-DD'
 * @param {Object} [options.user] - Logged in req.user object
 * @returns {Promise<{ workbook: ExcelJS.Workbook, totalRecordCount: number }>}
 */
async function generateAllPlantsReportWorkbook({ date, user = null }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) {
    throw new Error('Valid date (YYYY-MM-DD) is required.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QCL Management Report System';
  workbook.created = new Date();

  const usedSheetNames = new Set();

  // 1. First sheet: SUMMARY
  const summarySheet = workbook.addWorksheet('SUMMARY', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 0, ySplit: 3 }],
  });
  summarySheet.properties.tabColor = { argb: SUMMARY_TAB_COLOR };
  usedSheetNames.add('summary');

  let totalRecordCount = 0;
  const plantSummaries = [];
  const renderWarnings = [];

  // 2. Fetch and render each plant in strict order: ACL, SA, OFFSITE, CO2
  for (const p of ALL_PLANTS_ORDER) {
    try {
      const plantAliases = PLANT_ALIASES[p] || [p, `${p} Plant`, `${p} PLANT`];
      const query = {
        plantCode: { $in: plantAliases },
        date,
      };

      if (user && user.role !== 'super_admin') {
        const userCompanyId = user.company?._id || user.company;
        if (userCompanyId) {
          query.$or = [{ company: userCompanyId }, { company: null }];
        }
      }

      // Single database query per plant using lean()
      const records = await PlantAnalysisRecord.find(query).lean();

      // Legacy fallback for ACL Pure Salt & Sieve
      if (p === 'ACL') {
        const hasPureSalt = records.some((r) => (r.analysisType || '').toLowerCase().includes('pure salt analysis'));
        const hasPureSaltSieve = records.some((r) => (r.analysisType || '').toLowerCase().includes('pure salt sieve'));

        const fallbackCompanyQuery = user && user.role !== 'super_admin' && (user.company?._id || user.company)
          ? { $or: [{ company: user.company?._id || user.company }, { company: null }] }
          : {};

        if (!hasPureSalt && PureSaltAnalysis && typeof PureSaltAnalysis.findOne === 'function') {
          const queryRes = PureSaltAnalysis.findOne({ date, ...fallbackCompanyQuery });
          const pureSaltDoc = queryRes && typeof queryRes.lean === 'function' ? await queryRes.lean() : await queryRes;
          if (pureSaltDoc) {
            records.push({ plantCode: 'ACL', analysisType: 'Pure Salt Analysis', date, data: pureSaltDoc });
          }
        }

        if (!hasPureSaltSieve && PureSaltSieveAnalysis && typeof PureSaltSieveAnalysis.findOne === 'function') {
          const sieveQueryRes = PureSaltSieveAnalysis.findOne({ date, ...fallbackCompanyQuery });
          const sieveDoc = sieveQueryRes && typeof sieveQueryRes.lean === 'function' ? await sieveQueryRes.lean() : await sieveQueryRes;
          if (sieveDoc) {
            records.push({ plantCode: 'ACL', analysisType: 'Pure Salt Sieve Analysis', date, data: sieveDoc });
          }
        }
      }

      totalRecordCount += records.length;

      if (!records || records.length === 0) {
        plantSummaries.push({
          plant: p,
          hasData: false,
          sheets: [],
        });
        continue;
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
      mergedRecords.sort((a, b) => {
        const atCompare = (a.analysisType || '').localeCompare(b.analysisType || '');
        if (atCompare !== 0) return atCompare;
        return (a.unit || '').localeCompare(b.unit || '');
      });

      const plantSheets = [];
      for (const rec of mergedRecords) {
        try {
          const sheetNameOverride = getShortAnalysisName(p, rec.analysisType, rec.unit);
          const sheetInfo = renderAnalysisSheet({
            workbook,
            rec,
            normPlant: p,
            date,
            usedSheetNames,
            sheetNameOverride,
            tabColor: PLANT_TAB_COLORS[p],
          });
          plantSheets.push(sheetInfo);
        } catch (sheetErr) {
          console.error(`[All Plants Report Error] Plant ${p} analysis ${rec.analysisType}:`, sheetErr);
          renderWarnings.push(`Plant ${p}: could not render ${rec.analysisType} (${sheetErr.message})`);
        }
      }

      plantSummaries.push({
        plant: p,
        hasData: plantSheets.length > 0,
        sheets: plantSheets,
      });
    } catch (plantErr) {
      console.error(`[All Plants Report Error] Plant ${p} failed:`, plantErr);
      renderWarnings.push(`Plant ${p}: error processing plant (${plantErr.message})`);
      plantSummaries.push({
        plant: p,
        hasData: false,
        error: plantErr.message,
        sheets: [],
      });
    }
  }

  if (totalRecordCount === 0) {
    return { workbook: null, totalRecordCount: 0 };
  }

  // 3. Render SUMMARY Sheet Content
  // Title Row
  const titleRow = summarySheet.getRow(1);
  titleRow.height = 30;
  const titleCell = titleRow.getCell(1);
  titleCell.value = `ALL PLANTS REPORT | DATE: ${date}`;
  applyTitleStyle(titleCell);
  summarySheet.mergeCells(1, 1, 1, 5);

  // Headers (Row 3)
  const headerRow = summarySheet.getRow(3);
  headerRow.height = 28;
  const headerCols = [
    { text: 'PLANT', col: 1 },
    { text: 'FULL ANALYSIS NAME', col: 2 },
    { text: 'SHEET NAME', col: 3 },
    { text: 'OUT-OF-LIMIT CELLS', col: 4 },
    { text: 'EDITED CELLS', col: 5 },
  ];
  headerCols.forEach(({ text, col }) => {
    const c = headerRow.getCell(col);
    c.value = text;
    applyHeaderStyle(c);
  });

  let sumRowIdx = 4;
  plantSummaries.forEach((ps) => {
    if (ps.hasData && ps.sheets.length > 0) {
      ps.sheets.forEach((sh) => {
        const row = summarySheet.getRow(sumRowIdx);
        row.height = 22;

        // Col 1: Plant
        const c1 = row.getCell(1);
        c1.value = ps.plant;
        applyDataCellStyle(c1, true);

        // Col 2: Full Analysis Name
        const c2 = row.getCell(2);
        c2.value = sh.fullAnalysisName + (sh.unit ? ` (${sh.unit})` : '');
        applyDataCellStyle(c2, false);

        // Col 3: Sheet Name
        const c3 = row.getCell(3);
        c3.value = sh.sheetName;
        applyDataCellStyle(c3, false);

        // Col 4: Out-of-Limit Cells
        const c4 = row.getCell(4);
        if (!sh.hasConfiguredRanges) {
          c4.value = 'range not configured';
          applyDataCellStyle(c4, false, true); // gray text
        } else {
          c4.value = sh.oolCount;
          const isOol = sh.oolCount > 0;
          applyDataCellStyle(c4, false, false, isOol, false);
        }

        // Col 5: Edited Cells
        const c5 = row.getCell(5);
        c5.value = sh.edCount;
        const isEd = sh.edCount > 0;
        applyDataCellStyle(c5, false, false, false, isEd);

        sumRowIdx++;
      });
    } else {
      // Plant with no records or error
      const row = summarySheet.getRow(sumRowIdx);
      row.height = 22;

      const c1 = row.getCell(1);
      c1.value = ps.plant;
      applyDataCellStyle(c1, true);

      const c2 = row.getCell(2);
      c2.value = ps.error ? `Error: ${ps.error}` : 'No data';
      applyDataCellStyle(c2, false, !ps.error, Boolean(ps.error), false);

      const c3 = row.getCell(3);
      c3.value = '—';
      applyDataCellStyle(c3, false, true);

      const c4 = row.getCell(4);
      c4.value = '—';
      applyDataCellStyle(c4, false, true);

      const c5 = row.getCell(5);
      c5.value = '—';
      applyDataCellStyle(c5, false, true);

      sumRowIdx++;
    }
  });

  // Render warnings/errors note if any occurred
  if (renderWarnings.length > 0) {
    sumRowIdx += 1;
    const noteHeaderRow = summarySheet.getRow(sumRowIdx);
    noteHeaderRow.getCell(1).value = 'Render Warnings & Notes:';
    noteHeaderRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF9C0006' } };
    sumRowIdx++;

    renderWarnings.forEach((warnMsg) => {
      const wRow = summarySheet.getRow(sumRowIdx);
      wRow.getCell(1).value = `• ${warnMsg}`;
      wRow.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: 'FF9C0006' } };
      sumRowIdx++;
    });
  }

  // Page setup & autofit for SUMMARY
  summarySheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: '3:3',
  };
  autoFitColumns(summarySheet, 5);

  return { workbook, totalRecordCount };
}

module.exports = {
  generateGenericPlantReportWorkbook,
  generateAllPlantsReportWorkbook,
  PLANT_ALIASES,
};

