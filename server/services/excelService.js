const ExcelJS = require('exceljs');
const { getCellLimit } = require('./analysisValidation');

/**
 * Formats a date string (YYYY-MM-DD or ISO) into DD-MM-YYYY format for filenames
 */
const formatDateForFilename = (dateStr) => {
  if (!dateStr) {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}-${m}-${y}`;
  }
  // If in YYYY-MM-DD format
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr.replace(/[^a-zA-Z0-9_-]/g, '_');
};

/**
 * Generates an authentic .xlsx Excel workbook using ExcelJS.
 * Sheet Name: "Pure Salt Analysis"
 * Title: "PURE SALT ANALYSIS"
 * Subtitle: "Tuticorin Alkali Chemicals and Fertilizers Limited - ACL Plant"
 *
 * @param {Object} data - Analysis data containing date, plant, shift, rows, submittedBy
 * @returns {Promise<{ filename: string, buffer: Buffer, base64: string }>}
 */
const generatePureSaltAnalysisExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tuticorin Alkali Chemicals and Fertilizers Limited - ACL Plant';
  workbook.lastModifiedBy = data.submittedBy || 'Plant Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  const formattedDate = formatDateForFilename(data.date);
  const filename = `ACL_Plant_Pure_Salt_Analysis_${formattedDate}.xlsx`;

  // Worksheet name: Pure Salt Analysis
  const worksheet = workbook.addWorksheet('Pure Salt Analysis', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ showGridLines: true }],
  });

  // ── Column Definitions & Proper Widths ──
  worksheet.columns = [
    { key: 'paramShift', width: 28 }, // PARAMETER / SCHEDULE
    { key: 'nacl', width: 17 },       // NaCl %
    { key: 'ca', width: 17 },         // Ca %
    { key: 'mg', width: 17 },         // Mg %
    { key: 'so4', width: 17 },        // SO4 %
    { key: 'ir', width: 17 },         // IR %
    { key: 'h2o', width: 17 },        // H2O %
  ];

  // ── Borders ──
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  const metaBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // Helper for numeric cell formatting - empty or missing input cells strictly display '*'
  const formatCellValue = (val) => {
    if (
      val === null ||
      val === undefined ||
      String(val).trim() === '' ||
      String(val).trim() === '—' ||
      String(val).trim() === '-' ||
      String(val).trim() === 'null' ||
      String(val).trim() === 'undefined'
    ) {
      return '*';
    }
    const n = parseFloat(val);
    return isNaN(n) ? val : n;
  };

  // ── 1. TITLE: Merge A1:G1, Bold, Large Font, Center Aligned ──
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'PURE SALT ANALYSIS';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 32;

  // ── 2. SUBTITLE: Merge A2:G2, Center Aligned ──
  worksheet.mergeCells('A2:G2');
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = 'Tuticorin Alkali Chemicals and Fertilizers Limited - ACL Plant';
  subtitleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 24;

  // ── 3. Metadata Section (Rows 4-5) ──
  const addMetaRow = (rowNum, label1, val1, label2, val2) => {
    worksheet.getCell(`A${rowNum}`).value = label1;
    worksheet.getCell(`A${rowNum}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
    worksheet.getCell(`A${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

    worksheet.getCell(`B${rowNum}`).value = val1;
    worksheet.getCell(`B${rowNum}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    worksheet.getCell(`D${rowNum}`).value = label2;
    worksheet.getCell(`D${rowNum}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
    worksheet.getCell(`D${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

    worksheet.mergeCells(`E${rowNum}:G${rowNum}`);
    const mergedCell = worksheet.getCell(`E${rowNum}`);
    mergedCell.value = val2;
    mergedCell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } };

    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
      worksheet.getCell(`${col}${rowNum}`).border = metaBorder;
    });
    worksheet.getRow(rowNum).height = 20;
  };

  const savedDateStr = data.savedDateFormatted || formatDateForFilename(data.date);
  const savedTimeStr = data.savedTimeFormatted || '';
  const savedDateTimeDisplay = savedTimeStr ? `${savedDateStr} ${savedTimeStr} IST` : savedDateStr;
  addMetaRow(4, 'Plant:', data.plant || 'ACL Plant', 'Saved At:', savedDateTimeDisplay);
  addMetaRow(5, 'Analysis:', data.analysisType || 'Pure Salt Analysis', 'Date / Shift:', `${data.date || formattedDate} (${data.shift || 'All Shifts'})`);

  // ── 4. Main Table Header (Row 7) ──
  const headers = [
    'PARAMETER / SCHEDULE',
    'NaCl %',
    'Ca %',
    'Mg %',
    'SO4 %',
    'IR %',
    'H2O %',
  ];

  const headerRow = worksheet.getRow(7);
  headerRow.values = headers;
  headerRow.height = 26;

  headers.forEach((_, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF091E3A' } },
      bottom: { style: 'medium', color: { argb: 'FF091E3A' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };
  });
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // Helper to extract a row data object from payload
  const getRowData = (key, altLabel) => {
    if (!data.rows) return {};
    if (data.rows[key]) return data.rows[key];
    if (Array.isArray(data.rows)) {
      const found = data.rows.find(
        (r) =>
          r.key === key ||
          (r.shift && r.shift.toLowerCase().includes(key.toLowerCase())) ||
          (altLabel && r.label && r.label.toLowerCase().includes(altLabel.toLowerCase()))
      );
      if (found) return found;
    }
    return {};
  };

  const colKeys = ['nacl', 'ca', 'mg', 'so4', 'ir', 'h2o'];
  const EPSILON = 0.000001;

  // ── 5. Row 8: RAW SALT (Input Stream - No Limits) ──
  const rawSaltData = getRowData('rawSalt', 'RAW SALT');
  const rawSaltRow = worksheet.getRow(8);
  rawSaltRow.values = [
    'RAW SALT (Input Stream)',
    formatCellValue(rawSaltData.nacl),
    formatCellValue(rawSaltData.ca),
    formatCellValue(rawSaltData.mg),
    formatCellValue(rawSaltData.so4),
    formatCellValue(rawSaltData.ir),
    formatCellValue(rawSaltData.h2o),
  ];
  rawSaltRow.height = 24;
  for (let c = 1; c <= 7; c++) {
    const cell = rawSaltRow.getCell(c);
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    if (c === 1) {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0369A1' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    } else {
      cell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0369A1' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (typeof cell.value === 'number') cell.numFmt = '0.00';
    }
  }

  // ── 6. Row 9: SHIFT SECTION HEADER (Distinct Section Banner) ──
  worksheet.mergeCells('A9:G9');
  const shiftHeaderCell = worksheet.getCell('A9');
  shiftHeaderCell.value = 'SHIFT ANALYSIS — Only Ca & Mg have limits (Ca = 0.10% ± 0.05 | Mg = 0.04% ± 0.06)';
  shiftHeaderCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  shiftHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  shiftHeaderCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
    worksheet.getCell(`${col}9`).border = thinBorder;
  });
  worksheet.getRow(9).height = 22;

  // ── 7. Rows 10-12: SHIFT DATA (I SHIFT, II SHIFT, III SHIFT) ──
  const shiftConfigs = [
    { rowNum: 10, key: 'shift1', label: 'I SHIFT',   fillColor: 'FFF8FAFC' },
    { rowNum: 11, key: 'shift2', label: 'II SHIFT',  fillColor: 'FFF1F5F9' },
    { rowNum: 12, key: 'shift3', label: 'III SHIFT', fillColor: 'FFF8FAFC' },
  ];

  shiftConfigs.forEach((cfg) => {
    const sData = getRowData(cfg.key, cfg.label);
    const row = worksheet.getRow(cfg.rowNum);
    row.values = [
      cfg.label,
      formatCellValue(sData.nacl),
      formatCellValue(sData.ca),
      formatCellValue(sData.mg),
      formatCellValue(sData.so4),
      formatCellValue(sData.ir),
      formatCellValue(sData.h2o),
    ];
    row.height = 24;

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cfg.fillColor } };

      if (c === 1) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      } else {
        const colKey = colKeys[c - 2];
        const cellNum = typeof cell.value === 'number' ? cell.value : parseFloat(cell.value);

        // SHIFT: ONLY Ca and Mg have limits
        // Ca = 0.10% ± 0.05 (Allowed: 0.05% to 0.15%)
        // Mg = 0.04% ± 0.06 (Allowed: 0.00% to 0.10%)
        let isShiftOutOfLimit = false;
        let limitInfo = null;

        if (colKey === 'ca') {
          limitInfo = { target: 0.10, tolerance: 0.05, min: 0.05, max: 0.15, display: 'Ca = 0.10% ± 0.05' };
          if (!isNaN(cellNum) && (cellNum < limitInfo.min - EPSILON || cellNum > limitInfo.max + EPSILON)) {
            isShiftOutOfLimit = true;
          }
        } else if (colKey === 'mg') {
          limitInfo = { target: 0.04, tolerance: 0.06, min: 0.00, max: 0.10, display: 'Mg = 0.04% ± 0.06' };
          if (!isNaN(cellNum) && (cellNum < limitInfo.min - EPSILON || cellNum > limitInfo.max + EPSILON)) {
            isShiftOutOfLimit = true;
          }
        }
        // NaCl, SO4, IR, H2O have NO limits for Shift rows!

        if (isShiftOutOfLimit && limitInfo) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } };
          cell.note = `OUT OF SHIFT LIMIT: ${cellNum}%\nOfficial Limit: ${limitInfo.display}\nAllowed Range: ${limitInfo.min.toFixed(2)}% – ${limitInfo.max.toFixed(2)}%`;
        } else {
          cell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF1E293B' } };
        }

        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (typeof cell.value === 'number') cell.numFmt = '0.00';
      }
    }
  });

  // ── 8. Row 13: SHIFT SPECIFICATION LIMITS REFERENCE ROW ──
  const shiftSpecRow = worksheet.getRow(13);
  shiftSpecRow.values = [
    'SHIFT LIMITS (SPEC)',
    'No Limit',
    '0.10% ± 0.05',
    '0.04% ± 0.06',
    'No Limit',
    'No Limit',
    'No Limit',
  ];
  shiftSpecRow.height = 22;
  for (let c = 1; c <= 7; c++) {
    const cell = shiftSpecRow.getCell(c);
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    if (c === 1) {
      cell.font = { name: 'Calibri', size: 9.5, bold: true, italic: true, color: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    } else if (c === 3 || c === 4) {
      // Ca & Mg have active shift limits
      cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1D4ED8' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      // No limits for shift
      cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // ── 9. Row 14: DAY SECTION HEADER (Distinct Section Banner) ──
  worksheet.mergeCells('A14:G14');
  const dayHeaderCell = worksheet.getCell('A14');
  dayHeaderCell.value = 'DAY ANALYSIS — All 6 Parameters have limits (NaCl, Ca, Mg, SO4, IR, H2O)';
  dayHeaderCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  dayHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  dayHeaderCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
    worksheet.getCell(`${col}14`).border = thinBorder;
  });
  worksheet.getRow(14).height = 22;

  // ── 10. Row 15: DAY DATA (DAY / COMPOSITION) ──
  const dayData = getRowData('composition', 'COMPOSITION');
  const dayRow = worksheet.getRow(15);
  dayRow.values = [
    'DAY (COMPOSITION)',
    formatCellValue(dayData.nacl),
    formatCellValue(dayData.ca),
    formatCellValue(dayData.mg),
    formatCellValue(dayData.so4),
    formatCellValue(dayData.ir),
    formatCellValue(dayData.h2o),
  ];
  dayRow.height = 24;

  const DAY_LIMITS_MAP = {
    nacl: { target: 92.00, tolerance: 0.10, min: 91.90, max: 92.10, display: 'NaCl = 92.0% ± 0.10', range: '91.90% – 92.10%' },
    ca:   { target: 0.10,  tolerance: 0.05, min: 0.05,  max: 0.15,  display: 'Ca = 0.10% ± 0.05',   range: '0.05% – 0.15%' },
    mg:   { target: 0.04,  tolerance: 0.05, min: 0.00,  max: 0.09,  display: 'Mg = 0.04% ± 0.05',   range: '0.00% – 0.09%' },
    so4:  { target: 0.46,  tolerance: 0.10, min: 0.36,  max: 0.56,  display: 'SO4 = 0.46% ± 0.10',  range: '0.36% – 0.56%' },
    ir:   { target: 0.30,  tolerance: 0.20, min: 0.10,  max: 0.50,  display: 'IR = 0.30% ± 0.2',    range: '0.10% – 0.50%' },
    h2o:  { target: 7.00,  tolerance: 1.00, min: 6.00,  max: 8.00,  display: 'H2O = 7.0% ± 1.0',    range: '6.0% – 8.0%' },
  };

  for (let c = 1; c <= 7; c++) {
    const cell = dayRow.getCell(c);
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };

    if (c === 1) {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF065F46' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    } else {
      const colKey = colKeys[c - 2];
      const cellNum = typeof cell.value === 'number' ? cell.value : parseFloat(cell.value);
      const dayLimit = DAY_LIMITS_MAP[colKey];

      const isDayOutOfLimit =
        dayLimit &&
        !isNaN(cellNum) &&
        (cellNum < dayLimit.min - EPSILON || cellNum > dayLimit.max + EPSILON);

      if (isDayOutOfLimit) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        cell.note = `OUT OF DAY LIMIT: ${cellNum}%\nOfficial Limit: ${dayLimit.display}\nAllowed Range: ${dayLimit.range}`;
      } else {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF065F46' } };
      }

      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (typeof cell.value === 'number') cell.numFmt = '0.00';
    }
  }

  // ── 11. Row 16: DAY SPECIFICATION LIMITS REFERENCE ROW ──
  const daySpecRow = worksheet.getRow(16);
  daySpecRow.values = [
    'DAY LIMITS (SPEC)',
    '92.0% ± 0.10',
    '0.10% ± 0.05',
    '0.04% ± 0.05',
    '0.46% ± 0.10',
    '0.30% ± 0.2',
    '7.0% ± 1.0',
  ];
  daySpecRow.height = 22;
  for (let c = 1; c <= 7; c++) {
    const cell = daySpecRow.getCell(c);
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    if (c === 1) {
      cell.font = { name: 'Calibri', size: 9.5, bold: true, italic: true, color: { argb: 'FF065F46' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    } else {
      cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF065F46' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // Blank separator row
  worksheet.getRow(17).height = 14;

  // ── 12. OFFICIAL SPECIFICATIONS REFERENCE TABLE (Rows 18-28) ──
  worksheet.mergeCells('A18:G18');
  const specTitleCell = worksheet.getCell('A18');
  specTitleCell.value = 'OFFICIAL QUALITY SPECIFICATIONS REFERENCE (TFL ACL PLANT)';
  specTitleCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  specTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
  specTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(18).height = 24;

  // Table Column Headers (Row 19)
  worksheet.mergeCells('A19:B19');
  worksheet.getCell('A19').value = 'SCHEDULE / LEVEL';
  worksheet.getCell('C19').value = 'PARAMETER';
  worksheet.getCell('D19').value = 'OFFICIAL LIMIT';
  worksheet.getCell('E19').value = 'ALLOWED RANGE';
  worksheet.getCell('F19').value = 'APPLICABILITY';
  worksheet.getCell('G19').value = 'STATUS';

  const specHeaderCells = ['A19', 'B19', 'C19', 'D19', 'E19', 'F19', 'G19'];
  specHeaderCells.forEach((addr) => {
    const c = worksheet.getCell(addr);
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thinBorder;
  });
  worksheet.getRow(19).height = 22;

  // Specification reference rows
  const specRows = [
    // SHIFT SPECIFICATIONS (Only Ca and Mg have limits)
    {
      level: 'SHIFT',
      param: 'Ca %',
      limit: '0.10% ± 0.05',
      range: '0.05% – 0.15%',
      applicability: 'I, II, III Shift',
      status: 'Enforced Limit',
      fill: 'FFF8FAFC',
      textColor: 'FF1E3A8A',
      bold: true,
    },
    {
      level: 'SHIFT',
      param: 'Mg %',
      limit: '0.04% ± 0.06',
      range: '0.00% – 0.10%',
      applicability: 'I, II, III Shift',
      status: 'Enforced Limit',
      fill: 'FFF8FAFC',
      textColor: 'FF1E3A8A',
      bold: true,
    },
    {
      level: 'SHIFT',
      param: 'NaCl, SO4, IR, H2O',
      limit: 'No Limit',
      range: 'No Range Defined',
      applicability: 'I, II, III Shift',
      status: 'No Shift Limit (Day Only)',
      fill: 'FFF8FAFC',
      textColor: 'FF94A3B8',
      bold: false,
    },
    // DAY SPECIFICATIONS (All 6 parameters have limits)
    {
      level: 'DAY',
      param: 'NaCl %',
      limit: '92.0% ± 0.10',
      range: '91.90% – 92.10%',
      applicability: 'Day / Composition',
      status: 'Enforced Limit',
      fill: 'FFECFDF5',
      textColor: 'FF065F46',
      bold: true,
    },
    {
      level: 'DAY',
      param: 'Ca %',
      limit: '0.10% ± 0.05',
      range: '0.05% – 0.15%',
      applicability: 'Day / Composition',
      status: 'Enforced Limit',
      fill: 'FFECFDF5',
      textColor: 'FF065F46',
      bold: true,
    },
    {
      level: 'DAY',
      param: 'Mg %',
      limit: '0.04% ± 0.05',
      range: '0.00% – 0.09%',
      applicability: 'Day / Composition',
      status: 'Enforced Limit',
      fill: 'FFECFDF5',
      textColor: 'FF065F46',
      bold: true,
    },
    {
      level: 'DAY',
      param: 'SO4 %',
      limit: '0.46% ± 0.10',
      range: '0.36% – 0.56%',
      applicability: 'Day / Composition',
      status: 'Enforced Limit',
      fill: 'FFECFDF5',
      textColor: 'FF065F46',
      bold: true,
    },
    {
      level: 'DAY',
      param: 'IR %',
      limit: '0.30% ± 0.2',
      range: '0.10% – 0.50%',
      applicability: 'Day / Composition',
      status: 'Enforced Limit',
      fill: 'FFECFDF5',
      textColor: 'FF065F46',
      bold: true,
    },
    {
      level: 'DAY',
      param: 'H2O %',
      limit: '7.0% ± 1.0',
      range: '6.0% – 8.0%',
      applicability: 'Day / Composition',
      status: 'Enforced Limit',
      fill: 'FFECFDF5',
      textColor: 'FF065F46',
      bold: true,
    },
  ];

  let currentSpecRow = 20;
  specRows.forEach((sr) => {
    worksheet.mergeCells(`A${currentSpecRow}:B${currentSpecRow}`);
    worksheet.getCell(`A${currentSpecRow}`).value = sr.level;
    worksheet.getCell(`C${currentSpecRow}`).value = sr.param;
    worksheet.getCell(`D${currentSpecRow}`).value = sr.limit;
    worksheet.getCell(`E${currentSpecRow}`).value = sr.range;
    worksheet.getCell(`F${currentSpecRow}`).value = sr.applicability;
    worksheet.getCell(`G${currentSpecRow}`).value = sr.status;

    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
      const cell = worksheet.getCell(`${col}${currentSpecRow}`);
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sr.fill } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = {
        name: 'Calibri',
        size: 9.5,
        bold: sr.bold,
        color: { argb: sr.textColor },
      };
    });

    worksheet.getRow(currentSpecRow).height = 20;
    currentSpecRow++;
  });

  // ── 13. Explanatory Note & Footer ──
  const noteRowNum = currentSpecRow + 1;
  worksheet.mergeCells(`A${noteRowNum}:G${noteRowNum}`);
  const noteCell = worksheet.getCell(`A${noteRowNum}`);
  noteCell.value = '• OFFICIAL STRUCTURE NOTE: Shift quality control monitors Ca (0.10% ± 0.05) and Mg (0.04% ± 0.06) only. Day composite quality control enforces full chemical analysis across all six parameters: NaCl (92.0% ± 0.10), Ca (0.10% ± 0.05), Mg (0.04% ± 0.05), SO4 (0.46% ± 0.10), IR (0.30% ± 0.2), and H2O (7.0% ± 1.0). Day limits are strictly not applied to Shift batches.';
  noteCell.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: 'FF475569' } };
  noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  worksheet.getRow(noteRowNum).height = 28;

  const footerRowNum = noteRowNum + 1;
  worksheet.mergeCells(`A${footerRowNum}:G${footerRowNum}`);
  const footerCell = worksheet.getCell(`A${footerRowNum}`);
  footerCell.value = 'Report Generated By: SPIC / TFL Plant Management System (Pure Salt Analysis)';
  footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
  worksheet.getRow(footerRowNum).height = 20;

  // Write workbook to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  return {
    filename,
    buffer,
    base64,
  };
};

/**
 * Friendly label dictionary for industrial chemical parameters & operational measurements
 */
const PARAMETER_DISPLAY_NAMES = {
  na2co3: 'Na₂CO₃ %',
  nacl: 'NaCl %',
  fe: 'Fe %',
  na2so4: 'Na₂SO₄ %',
  insoluble: 'Insoluble %',
  moisture: 'Moisture %',
  bicarbonate: 'Bicarbonate %',
  co2: 'CO₂ (%)',
  o2: 'O₂ (%)',
  co: 'CO (PPM)',
  no: 'NO (PPM)',
  nox: 'NOx (PPM)',
  no2: 'NO₂ (PPM)',
  fnh3: 'FNH₃ (Kgm/m³)',
  cnh3: 'CNH₃ (Kgm/m³)',
  tcl: 'TCl (Kgm/m³)',
  pcl: 'PCl (Kgm/m³)',
  ca: 'Ca %',
  mg: 'Mg %',
  so4: 'SO₄ %',
  ir: 'IR %',
  h2o: 'H₂O %',
  ph: 'pH',
  cond: 'Cond (µS/cm)',
  p: 'P-Alk (ppm)',
  m: 'M-Alk (ppm)',
  th: 'Total Hardness (ppm)',
  sio2: 'SiO2 (ppm)',
  tds: 'TDS (ppm)',
  cl: 'Chloride (ppm)',
  n2h4: 'N2H4 (ppm)',
  po4: 'PO4 (ppm)',
  turbidity: 'Turbidity (NTU)',
  alk: 'ALK (%)',
  loading: 'Loading (g CO2/g solvent)',
  unit: 'Unit / Sample Point',
  sample: 'Sample Point',
  time: 'Time',
  date: 'Date',
  shift: 'Shift',
  remarks: 'Remarks',
};

const SHIFT_DISPLAY_NAMES = {
  ishift: 'I SHIFT (06:00 – 14:00)',
  iishift: 'II SHIFT (14:00 – 22:00)',
  iiishift: 'III SHIFT (22:00 – 06:00)',
  composite: '24-HOUR COMPOSITE',
  shift1: 'I SHIFT (06:00 – 14:00)',
  shift2: 'II SHIFT (14:00 – 22:00)',
  shift3: 'III SHIFT (22:00 – 06:00)',
  rawsalt: 'RAW SALT',
  composition: 'COMPOSITION',
  t07: '07:00 (I Shift)',
  t09: '09:00 (I Shift)',
  t11: '11:00 (I Shift)',
  t13: '13:00 (I Shift)',
  t15: '15:00 (II Shift)',
  t17: '17:00 (II Shift)',
  t19: '19:00 (II Shift)',
  t21: '21:00 (II Shift)',
  t23: '23:00 (III Shift)',
  t01: '01:00 (III Shift)',
  t03: '03:00 (III Shift)',
  t05: '05:00 (III Shift)',
};

/**
 * Generates an authentic .xlsx Excel report for any plant (SA Plant, Offsite Plant, CO2 Plant, etc.)
 * using ExcelJS. Follows the exact visual and structural excellence established by ACL Plant.
 *
 * @param {Object} options
 * @param {string} [options.plantName] - e.g. "SA Plant", "OFFSITE Plant"
 * @param {string} [options.plantCode] - e.g. "SA", "OFFSITE", "CO2"
 * @param {string} [options.analysisType] - e.g. "LSA Shift Analysis", "DM Water Analysis"
 * @param {string} [options.unit] - e.g. "LSA", "DM Water", "T 401"
 * @param {string} [options.date] - Date string (e.g. "2026-09-30")
 * @param {string} [options.shift] - Shift string (e.g. "All Shifts")
 * @param {string} [options.submittedBy] - Name of submitting admin/user
 * @param {Object|Array} [options.data] - Main payload data (shifts, readings, units, or rows)
 * @param {Object} [options.rawBody] - Complete request body as fallback
 * @returns {Promise<{ filename: string, buffer: Buffer, base64: string }>}
 */
const generatePlantReportExcel = async ({
  plantName = 'Industrial Plant',
  plantCode = 'PLANT',
  analysisType = 'Operational Analysis Report',
  unit = '',
  date = '',
  shift = 'All Shifts',
  submittedBy = 'Plant Administrator',
  data = {},
  rawBody = {},
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Southern Petrochemical Industries Corporation (SPIC / TFL)';
  workbook.lastModifiedBy = submittedBy || 'Plant Administrator';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 1. Filename construction
  const formattedDate = formatDateForFilename(date);
  const cleanCode = (plantCode || 'PLANT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanType = (analysisType || 'Analysis_Report')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const filename = `${cleanCode}_Plant_${cleanType}_${formattedDate}.xlsx`;

  // 2. Worksheet creation
  const safeSheetName = (analysisType || `${cleanCode} Report`)
    .replace(/[*?:/\\\[\]]/g, ' ')
    .substring(0, 31)
    .trim();

  const worksheet = workbook.addWorksheet(safeSheetName || 'Plant Analysis', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ showGridLines: true }],
  });

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  const metaBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // Missing, empty or unentered parameter cells strictly display '*'
  const formatCellValue = (val) => {
    if (
      val === null ||
      val === undefined ||
      String(val).trim() === '' ||
      String(val).trim() === '—' ||
      String(val).trim() === '-' ||
      String(val).trim() === 'null' ||
      String(val).trim() === 'undefined'
    ) {
      return '*';
    }
    if (typeof val === 'number') return val;
    const n = parseFloat(val);
    if (!isNaN(n) && String(n) === String(val).trim()) return n;
    return val;
  };

  // Determine Data Format
  // ── Case A: Array of readings (Offsite Plant: DM Water, BFW, Cooling Water, etc.) ──
  let readingsArray = null;
  if (Array.isArray(data)) {
    readingsArray = data;
  } else if (data && Array.isArray(data.readings)) {
    readingsArray = data.readings;
  } else if (rawBody && Array.isArray(rawBody.readings)) {
    readingsArray = rawBody.readings;
  } else if (data && Array.isArray(data.rows)) {
    readingsArray = data.rows;
  } else if (rawBody && Array.isArray(rawBody.rows)) {
    readingsArray = rawBody.rows;
  }

  // ── Case B: Shifts object (SA Plant: LSA Shift, LSA 500, TK 203, TK 204, TK 209, etc.) ──
  let shiftsObj = null;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.shifts && typeof data.shifts === 'object') {
      shiftsObj = data.shifts;
    } else if (data.rows && typeof data.rows === 'object' && !Array.isArray(data.rows)) {
      shiftsObj = data.rows;
    } else if (
      data.iShift ||
      data.iiShift ||
      data.iiiShift ||
      data.composite ||
      data.shift1 ||
      data.shift2
    ) {
      shiftsObj = data;
    } else if (rawBody && rawBody.shifts && typeof rawBody.shifts === 'object') {
      shiftsObj = rawBody.shifts;
    } else if (rawBody && rawBody.rows && typeof rawBody.rows === 'object' && !Array.isArray(rawBody.rows)) {
      shiftsObj = rawBody.rows;
    } else if (
      Object.keys(data).length > 0 &&
      Object.values(data).every((v) => v && typeof v === 'object' && !Array.isArray(v))
    ) {
      shiftsObj = data;
    }
  }

  // ── Case C: Units object (SA Plant: T-401 Analysis) ──
  let unitsObj = null;
  if (data && typeof data.units === 'object' && !Array.isArray(data.units)) {
    unitsObj = data.units;
  } else if (rawBody && typeof rawBody.units === 'object' && !Array.isArray(rawBody.units)) {
    unitsObj = rawBody.units;
  }

  let tableHeaders = [];
  let tableRows = [];

  if (readingsArray && readingsArray.length > 0) {
    // Extract column keys from readings
    const excludedKeys = new Set(['id', '_id', 'isDefault', 'createdAt', 'updatedAt', '__v', 'status']);
    const allKeys = [];
    readingsArray.forEach((r) => {
      if (r && typeof r === 'object') {
        Object.keys(r).forEach((k) => {
          if (!excludedKeys.has(k) && !allKeys.includes(k)) {
            allKeys.push(k);
          }
        });
      }
    });

    // Sort to place unit/sample/time first if present
    const priority = ['unit', 'sample', 'time'];
    const sortedKeys = [
      ...priority.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !priority.includes(k)),
    ];

    tableHeaders = sortedKeys.map((k) => PARAMETER_DISPLAY_NAMES[k.toLowerCase()] || k.toUpperCase());

    readingsArray.forEach((rowObj) => {
      const rowValues = sortedKeys.map((k) => formatCellValue(rowObj[k]));
      tableRows.push({
        values: rowValues,
        isBold: false,
        fillColor: null, // default alternating
      });
    });
  } else if (shiftsObj) {
    // Extract parameters
    const paramKeys = [];
    Object.values(shiftsObj).forEach((sObj) => {
      if (sObj && typeof sObj === 'object') {
        Object.keys(sObj).forEach((pk) => {
          if (!paramKeys.includes(pk)) paramKeys.push(pk);
        });
      }
    });

    tableHeaders = [
      'SHIFT / TIME',
      ...paramKeys.map((pk) => PARAMETER_DISPLAY_NAMES[pk.toLowerCase()] || pk.toUpperCase()),
    ];

    Object.entries(shiftsObj).forEach(([shiftKey, sData]) => {
      const label = SHIFT_DISPLAY_NAMES[shiftKey.toLowerCase()] || shiftKey.toUpperCase();
      const isComp = shiftKey.toLowerCase().includes('comp');
      const rowVals = [
        label,
        ...paramKeys.map((pk) => formatCellValue(sData ? sData[pk] : '')),
      ];

      tableRows.push({
        values: rowVals,
        isBold: isComp,
        fillColor: isComp ? 'FFD1FAE5' : null,
      });
    });
  } else if (unitsObj) {
    // SA T 401 format (units A-F, shifts 1-3, params CNH3, TCl, PCl)
    tableHeaders = ['UNIT / TOWER', 'SHIFT', 'C-NH3 (ppm)', 'T-Cl (ppm)', 'P-Cl (ppm)'];

    Object.entries(unitsObj).forEach(([uKey, shiftMap]) => {
      if (shiftMap && typeof shiftMap === 'object') {
        Object.entries(shiftMap).forEach(([sKey, pMap]) => {
          const uLabel = `UNIT ${uKey.toUpperCase()}`;
          const sLabel = SHIFT_DISPLAY_NAMES[sKey.toLowerCase()] || sKey.toUpperCase();
          tableRows.push({
            values: [
              uLabel,
              sLabel,
              formatCellValue(pMap?.cnh3),
              formatCellValue(pMap?.tcl),
              formatCellValue(pMap?.pcl),
            ],
            isBold: false,
            fillColor: null,
          });
        });
      }
    });
  } else {
    // Generic Key-Value fallback
    tableHeaders = ['PARAMETER / ITEM', 'RECORDED VALUE'];
    const payloadSource = typeof data === 'object' && Object.keys(data).length > 0 ? data : rawBody;
    const ignored = new Set(['plant', 'plantCode', 'analysisType', 'submittedBy', 'date', 'shift', 'unit']);

    Object.entries(payloadSource || {}).forEach(([k, v]) => {
      if (!ignored.has(k)) {
        if (typeof v !== 'object') {
          tableHeaders = ['PARAMETER / ITEM', 'RECORDED VALUE'];
          tableRows.push({
            values: [PARAMETER_DISPLAY_NAMES[k.toLowerCase()] || k, formatCellValue(v)],
            isBold: false,
            fillColor: null,
          });
        }
      }
    });

    if (tableRows.length === 0) {
      tableRows.push({
        values: ['Plant Data', 'Data recorded successfully in MongoDB'],
        isBold: false,
        fillColor: null,
      });
    }
  }

  // Number of columns in table
  const colCount = Math.max(tableHeaders.length, 6);

  // Column letters helper
  const getColLetter = (index) => {
    let letter = '';
    let temp = index;
    while (temp > 0) {
      let mod = (temp - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      temp = Math.floor((temp - mod) / 26);
    }
    return letter;
  };

  const lastColLetter = getColLetter(colCount);

  // Set column widths
  const cols = [];
  for (let i = 1; i <= colCount; i++) {
    cols.push({
      width: i === 1 ? 26 : 18,
    });
  }
  worksheet.columns = cols;

  // ── 1. TITLE: Row 1 Merged ──
  worksheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${cleanCode ? cleanCode + ' PLANT – ' : ''}${analysisType.toUpperCase()}`;
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 32;

  // ── 2. SUBTITLE: Row 2 Merged ──
  worksheet.mergeCells(`A2:${lastColLetter}2`);
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = `Southern Petrochemical Industries Corporation (SPIC / TFL) – ${plantName}`;
  subtitleCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 24;

  // ── 3. METADATA SECTION: Rows 4 & 5 ──
  const midColIndex = Math.max(3, Math.floor(colCount / 2));
  const midColLetter = getColLetter(midColIndex);
  const midPlusOneLetter = getColLetter(midColIndex + 1);

  // Row 4: Plant & Date
  worksheet.getCell('A4').value = 'Plant:';
  worksheet.getCell('A4').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  worksheet.getCell('B4').value = `${plantName} (${cleanCode})`;
  worksheet.getCell('B4').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

  worksheet.getCell(`${midColLetter}4`).value = 'Analysis Date:';
  worksheet.getCell(`${midColLetter}4`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`${midColLetter}4`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  if (midColIndex + 1 <= colCount) {
    if (midColIndex + 1 < colCount) {
      worksheet.mergeCells(`${midPlusOneLetter}4:${lastColLetter}4`);
    }
    const dateCell = worksheet.getCell(`${midPlusOneLetter}4`);
    dateCell.value = date || formattedDate;
    dateCell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } };
  }

  // Row 5: Shift / Unit & Saved Date/Time
  worksheet.getCell('A5').value = 'Unit / Shift:';
  worksheet.getCell('A5').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  worksheet.getCell('B5').value = unit ? `${unit} – ${shift}` : shift || 'All Shifts';
  worksheet.getCell('B5').font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } };

  worksheet.getCell(`${midColLetter}5`).value = 'Saved At:';
  worksheet.getCell(`${midColLetter}5`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`${midColLetter}5`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  const savedTimeDisplay = data?.savedTimeFormatted || '';
  const savedDateDisplay = data?.savedDateFormatted || formattedDate;
  const savedFull = savedTimeDisplay ? `${savedDateDisplay} ${savedTimeDisplay} IST` : savedDateDisplay;

  if (midColIndex + 1 <= colCount) {
    if (midColIndex + 1 < colCount) {
      worksheet.mergeCells(`${midPlusOneLetter}5:${lastColLetter}5`);
    }
    const userCell = worksheet.getCell(`${midPlusOneLetter}5`);
    userCell.value = savedFull;
    userCell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } };
  }

  // Apply borders to metadata rows
  for (let c = 1; c <= colCount; c++) {
    worksheet.getCell(`${getColLetter(c)}4`).border = metaBorder;
    worksheet.getCell(`${getColLetter(c)}5`).border = metaBorder;
  }
  worksheet.getRow(4).height = 20;
  worksheet.getRow(5).height = 20;

  // ── 4. MAIN TABLE HEADERS: Row 7 ──
  const headerRow = worksheet.getRow(7);
  headerRow.height = 26;
  tableHeaders.forEach((hText, idx) => {
    const colNum = idx + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = hText;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
    cell.alignment = { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle', indent: idx === 0 ? 1 : 0 };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF091E3A' } },
      bottom: { style: 'medium', color: { argb: 'FF091E3A' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };
  });

  // ── 5. MAIN TABLE ROWS: Row 8+ ──
  let currentRow = 8;
  tableRows.forEach((rObj, rIdx) => {
    const row = worksheet.getRow(currentRow);
    row.height = 22;
    const zebraBg = rIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    const bgToUse = rObj.fillColor || zebraBg;

    rObj.values.forEach((val, cIdx) => {
      const colNum = cIdx + 1;
      const cell = row.getCell(colNum);
      cell.value = val;
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgToUse } };

      if (cIdx === 0) {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: rObj.isBold || rObj.values.length === 2,
          color: { argb: rObj.isBold ? 'FF065F46' : 'FF1E293B' },
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      } else {
        cell.font = { name: 'Calibri', size: 10, bold: rObj.isBold, color: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (typeof val === 'number') {
          cell.numFmt = Number.isInteger(val) ? '0' : '0.00';
        }
      }
    });

    currentRow++;
  });

  // ── 6. FOOTER ROW ──
  const footerRow = currentRow + 1;
  const footerCell = worksheet.getCell(`A${footerRow}`);
  footerCell.value = `Official Report generated by SPIC / TFL Plant Operations Management System | Recorded: ${new Date().toLocaleString('en-IN')}`;
  footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };

  // Write workbook to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  return {
    filename,
    buffer,
    base64,
  };
};

/**
 * Generates an Excel report buffer for analytics/reports module.
 * Missing or null values strictly output '*' in their cells.
 *
 * @param {Array} reports - List of report objects
 * @param {Object} options - Metadata options
 * @returns {Promise<Buffer>}
 */
const generateReportsExcel = async (reports = [], options = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Southern Petrochemical Industries Corporation (SPIC / TFL)';
  workbook.lastModifiedBy = options.exportedBy || 'Administrator';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Analytics Reports', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ showGridLines: true }],
  });

  worksheet.columns = [
    { key: 'title', width: 28 },
    { key: 'type', width: 20 },
    { key: 'company', width: 25 },
    { key: 'plant', width: 20 },
    { key: 'period', width: 14 },
    { key: 'status', width: 14 },
    { key: 'generatedBy', width: 22 },
    { key: 'date', width: 16 },
  ];

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  const formatVal = (v) => {
    if (v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '-' || String(v).trim() === '—') {
      return '*';
    }
    return v;
  };

  // Header row
  const headers = ['Report Title', 'Report Type', 'Company', 'Plant', 'Period', 'Status', 'Generated By', 'Date'];
  const headerRow = worksheet.getRow(1);
  headerRow.values = headers;
  headerRow.height = 26;
  headers.forEach((_, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // Data rows
  let rowIdx = 2;
  reports.forEach((r, idx) => {
    const row = worksheet.getRow(rowIdx);
    row.height = 22;
    const bg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    const rowVals = [
      formatVal(r.title),
      formatVal(r.reportType),
      formatVal(r.company?.name || r.companyName),
      formatVal(r.plant?.name || r.plantName),
      formatVal(r.period),
      formatVal(r.status),
      formatVal(r.generatedByName || r.generatedBy?.name || r.generatedBy),
      formatVal(r.date ? new Date(r.date).toLocaleDateString('en-IN') : null),
    ];
    rowVals.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: cIdx === 0 ? 'left' : 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
    });
    rowIdx++;
  });

  return await workbook.xlsx.writeBuffer();
};

/**
 * Generates an Excel workbook (.xlsx) for Gas Conc. Analysis (SA Plant)
 * Exact columns:
 * DATE | TIME | SEAL | RECOVERY CO2 CON | CLEANING GAS | BOTTOM GAS
 *
 * @param {Object} data - Contains rows/readings, date, submittedBy, plant
 * @returns {Promise<{ filename: string, buffer: Buffer, base64: string }>}
 */
const generateGasConcExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SPIC / TFL - Soda Ash Plant (SA)';
  workbook.lastModifiedBy = data.submittedBy || 'Plant Operator';
  workbook.created = new Date();
  workbook.modified = new Date();

  const formattedDate = formatDateForFilename(data.date);
  const filename = `SA_Plant_Gas_Conc_Analysis_${formattedDate}.xlsx`;

  const worksheet = workbook.addWorksheet('Gas Conc. Analysis', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    views: [{ showGridLines: true }],
  });

  // Column definitions & widths
  worksheet.columns = [
    { key: 'date', width: 18 },           // DATE
    { key: 'time', width: 14 },           // TIME
    { key: 'seal', width: 16 },           // SEAL
    { key: 'recoveryCo2Con', width: 22 }, // RECOVERY CO2 CON
    { key: 'cleaningGas', width: 18 },    // CLEANING GAS
    { key: 'bottomGas', width: 18 },      // BOTTOM GAS
  ];

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // 1. Title Banner
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SOUTHERN PETROCHEMICAL INDUSTRIES CORPORATION LTD (SPIC / TFL)';
  titleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F2E5A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 24;

  // 2. Subtitle
  worksheet.mergeCells('A2:F2');
  const subTitleCell = worksheet.getCell('A2');
  subTitleCell.value = 'SODA ASH PLANT (SA) — GAS CONC. ANALYSIS REPORT';
  subTitleCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 20;

  // 3. Metadata
  worksheet.mergeCells('A3:C3');
  const metaLeft = worksheet.getCell('A3');
  metaLeft.value = `Analysis: Gas Conc. | Plant: SA Plant`;
  metaLeft.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
  metaLeft.alignment = { horizontal: 'left', vertical: 'middle' };

  worksheet.mergeCells('D3:F3');
  const metaRight = worksheet.getCell('D3');
  metaRight.value = `Generated: ${new Date().toLocaleString('en-IN')} | By: ${data.submittedBy || 'Plant Operator'}`;
  metaRight.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
  metaRight.alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getRow(3).height = 18;

  // Blank row
  worksheet.getRow(4).height = 8;

  // 4. Table Headers (Row 5)
  const headers = ['DATE', 'TIME', 'SEAL', 'RECOVERY CO2 CON', 'CLEANING GAS', 'BOTTOM GAS'];
  const headerRow = worksheet.getRow(5);
  headerRow.height = 26;

  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // 5. Data rows
  const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data.readings) ? data.readings : []);
  let currentRowNum = 6;
  let prevDate = '';

  rows.forEach((r, idx) => {
    const row = worksheet.getRow(currentRowNum);
    row.height = 20;
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    // Format display date: show date only if changed or explicit, else blank/empty like reference format
    const rawDate = r.date || r.displayDate || '';
    let cellDateVal = '';
    if (rawDate && rawDate !== prevDate) {
      cellDateVal = rawDate;
      prevDate = rawDate;
    } else if (rawDate && idx === 0) {
      cellDateVal = rawDate;
      prevDate = rawDate;
    } else {
      cellDateVal = ''; // visually blank for subsequent rows of the same date
    }

    const rowValues = [
      cellDateVal,
      r.time || '',
      r.seal || '',
      r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined
        ? Number(r.recoveryCo2Con)
        : '',
      r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined
        ? Number(r.cleaningGas)
        : '',
      r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined
        ? Number(r.bottomGas)
        : '',
    ];

    rowValues.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };

      if (colIdx === 2) {
        // SEAL column
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (val === 'OK') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF065F46' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        } else if (val === 'NOT OK') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF991B1B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
        }
      } else if (colIdx === 0 || colIdx === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (colIdx === 0 && val) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        }
      } else {
        // Numeric parameter columns
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        if (typeof val === 'number') {
          cell.numFmt = '#,##0.0#';
        }
      }
    });

    currentRowNum++;
  });

  // Footer note
  currentRowNum++;
  worksheet.mergeCells(`A${currentRowNum}:F${currentRowNum}`);
  const footerCell = worksheet.getCell(`A${currentRowNum}`);
  footerCell.value = 'Report Generated by SPIC / TFL Plant Management System (Gas Conc. Analysis)';
  footerCell.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: 'FF94A3B8' } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(currentRowNum).height = 18;

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  return {
    filename,
    buffer,
    base64,
  };
};

module.exports = {
  generatePureSaltAnalysisExcel,
  generatePureSaltExcel: generatePureSaltAnalysisExcel,
  generatePlantExcel: generatePlantReportExcel,
  generatePlantReportExcel,
  generateReportsExcel,
  generateGasConcExcel,
};
