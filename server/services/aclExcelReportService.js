const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { PlantAnalysisRecord, PureSaltAnalysis, PureSaltSieveAnalysis } = require('../models');

/**
 * Path to master Excel template
 */
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'SHIFT REPORT -2026.xlsx');
const FALLBACK_TEMPLATE_PATH = path.join('C:', 'Users', 'IFMS3', 'Downloads', 'SHIFT REPORT -2026 (1).xlsx');

/**
 * Resolves the master template path
 */
function getTemplateFilePath() {
  if (fs.existsSync(TEMPLATE_PATH)) {
    return TEMPLATE_PATH;
  }
  if (fs.existsSync(FALLBACK_TEMPLATE_PATH)) {
    return FALLBACK_TEMPLATE_PATH;
  }
  throw new Error(`Master template file not found at ${TEMPLATE_PATH} or ${FALLBACK_TEMPLATE_PATH}`);
}

/**
 * Calculates average of valid numeric values
 */
function calcAverage(values) {
  const nums = values
    .map((v) => (v !== null && v !== undefined && v !== '' ? Number(v) : NaN))
    .filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Number((sum / nums.length).toFixed(3));
}

/**
 * Extracts average parameter value across specified time slots
 */
function getSlotsAverage(slotContainer, slotKeys, paramKey) {
  if (!slotContainer || typeof slotContainer !== 'object') return null;
  const vals = [];
  for (const sKey of slotKeys) {
    const slot = slotContainer[sKey];
    if (slot && slot[paramKey] !== undefined && slot[paramKey] !== null && slot[paramKey] !== '') {
      vals.push(slot[paramKey]);
    }
  }
  return calcAverage(vals);
}

/**
 * Safely writes a value to a cell, strictly preserving existing formulas
 */
function safeSetCell(row, colIndex, value) {
  if (value === null || value === undefined || value === '') return;
  const cell = row.getCell(colIndex);
  
  // Requirement 4: Strictly preserve existing formulas
  if (cell.formula || cell.sharedFormula) {
    return;
  }

  const num = Number(value);
  if (!isNaN(num) && String(value).trim() !== '') {
    cell.value = num;
  } else {
    cell.value = String(value);
  }
}

/**
 * Shift mapping: slot keys per shift
 */
const TIME_SLOTS_BY_SHIFT = {
  shift1: {
    fourSlots: ['t07', 't09', 't11', 't13'],
    twoSlots: ['t07', 't11'],
    name: 'I',
  },
  shift2: {
    fourSlots: ['t15', 't17', 't19', 't21'],
    twoSlots: ['t15', 't19'],
    name: 'II',
  },
  shift3: {
    fourSlots: ['t23', 't01', 't03', 't05'],
    twoSlots: ['t23', 't03'],
    name: 'III',
  },
};

/**
 * Generates an Excel workbook populated with ACL analysis data using the exact master template.
 *
 * @param {Object} options
 * @param {string} options.date - Target date in YYYY-MM-DD format
 * @param {string} [options.shift='all'] - 'all', 'shift1', 'shift2', or 'shift3'
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function generateACLShiftReportWorkbook({ date, shift = 'all' }) {
  if (!date) {
    throw new Error('Reporting date is required to generate ACL report.');
  }

  const templateFile = getTemplateFilePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templateFile);

  const sepSheet = workbook.getWorksheet('SEP-26');
  if (!sepSheet) {
    throw new Error('Worksheet "SEP-26" not found in master template.');
  }

  // Parse day of month (1..31)
  const dayOfMonth = parseInt(date.split('-')[2], 10);
  if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Invalid date format "${date}". Expected YYYY-MM-DD.`);
  }

  // Fetch all ACL plant analysis records for the date from MongoDB
  const [aclRecords, pureSaltDoc, pureSaltSieveDoc] = await Promise.all([
    PlantAnalysisRecord.find({
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      date,
    }).lean(),
    PureSaltAnalysis.findOne({ date }).lean(),
    PureSaltSieveAnalysis.findOne({ date }).lean(),
  ]);

  // Index records by analysisType
  const recordMap = {};
  for (const r of aclRecords) {
    recordMap[r.analysisType] = r.data || {};
  }

  const tk203Data = recordMap['TK 203 Analysis']?.rows || recordMap['TK 203 Analysis']?.shiftRows || {};
  const tk204Data = recordMap['TK 204 Analysis']?.rows || recordMap['TK 204 Analysis'] || {};
  const tk205Data = recordMap['TK 205 Analysis']?.rows || recordMap['TK 205 Analysis']?.shiftRows || recordMap['TK 205 Analysis'] || {};
  const tk207Data = recordMap['TK 207 Analysis']?.rows || recordMap['TK 207 Analysis']?.shiftRows || recordMap['TK 207 Analysis'] || {};
  const cr202Data = recordMap['CR 202 Analysis']?.timeRows || recordMap['CR 202 Analysis']?.shiftRows || {};
  const cr203Data = recordMap['CR 203 Analysis']?.timeRows || recordMap['CR 203 Analysis']?.shiftRows || {};
  const pclTclData = recordMap['Pcl & Tcl Analysis']?.rows || recordMap['Pcl & Tcl Analysis']?.shifts || {};
  const aclProductData = recordMap['ACL Product Analysis'] || {};
  const acl300Data = recordMap['ACL 300# Analysis']?.shifts || recordMap['ACL 300# Analysis']?.shiftRows || {};
  const brineData = recordMap['Brine Analysis']?.rows || {};

  const pureSaltRows = pureSaltDoc?.rows || {};
  const pureSaltSieveRows = pureSaltSieveDoc?.rows || {};

  // Shifts to populate
  const normShift = String(shift || 'all').trim().toLowerCase();
  const targetShiftKeys =
    normShift === 'all'
      ? ['shift1', 'shift2', 'shift3']
      : [normShift];

  // Base row calculation: Day D starts at row 5 + (D - 1) * 3
  const dayBaseRow = 5 + (dayOfMonth - 1) * 3;

  for (const shiftKey of targetShiftKeys) {
    const shiftInfo = TIME_SLOTS_BY_SHIFT[shiftKey];
    if (!shiftInfo) continue;

    const shiftOffset = shiftKey === 'shift1' ? 0 : shiftKey === 'shift2' ? 1 : 2;
    const rowNumber = dayBaseRow + shiftOffset;
    const row = sepSheet.getRow(rowNumber);

    // Col 1 (A): Date (Set on Shift 1 or current shift row)
    safeSetCell(row, 1, date);
    // Col 2 (B): Shift ('I', 'II', 'III')
    safeSetCell(row, 2, shiftInfo.name);

    // ── 1. TK 203 Analysis (Cols 3..6: C, D, E, F) ──
    const tk203_fnh3 = getSlotsAverage(tk203Data, shiftInfo.fourSlots, 'fnh3');
    const tk203_cnh3 = getSlotsAverage(tk203Data, shiftInfo.fourSlots, 'cnh3');
    const tk203_co2  = getSlotsAverage(tk203Data, shiftInfo.fourSlots, 'co2');
    const tk203_pcl  = getSlotsAverage(tk203Data, shiftInfo.fourSlots, 'pcl');
    safeSetCell(row, 3, tk203_fnh3);
    safeSetCell(row, 4, tk203_cnh3);
    safeSetCell(row, 5, tk203_co2);
    safeSetCell(row, 6, tk203_pcl);

    // ── 2. TK 204 Analysis (Cols 7..8: G, H) ──
    const tk204Shift = tk204Data[shiftKey] || {};
    safeSetCell(row, 7, tk204Shift.fnh3);
    safeSetCell(row, 8, tk204Shift.cnh3);

    // ── 3. TK 205 Analysis (Cols 9..13: I, J, K[formula], L, M) ──
    const tk205_fnh3 = getSlotsAverage(tk205Data, shiftInfo.fourSlots, 'fnh3');
    const tk205_cnh3 = getSlotsAverage(tk205Data, shiftInfo.fourSlots, 'cnh3');
    const tk205_tcl  = getSlotsAverage(tk205Data, shiftInfo.fourSlots, 'tcl');
    const tk205_pcl  = getSlotsAverage(tk205Data, shiftInfo.fourSlots, 'pcl');
    safeSetCell(row, 9, tk205_fnh3);
    safeSetCell(row, 10, tk205_cnh3);
    // Col 11 (K) is FORMULA: =J{r}+I{r} (strictly preserved by safeSetCell)
    safeSetCell(row, 12, tk205_tcl);
    safeSetCell(row, 13, tk205_pcl);

    // ── 4. TK 207 Analysis (Cols 14..18: N, O, P[formula], Q, R) ──
    const tk207_fnh3 = getSlotsAverage(tk207Data, shiftInfo.fourSlots, 'fnh3');
    const tk207_cnh3 = getSlotsAverage(tk207Data, shiftInfo.fourSlots, 'cnh3');
    const tk207_tcl  = getSlotsAverage(tk207Data, shiftInfo.fourSlots, 'tcl');
    const tk207_pcl  = getSlotsAverage(tk207Data, shiftInfo.fourSlots, 'pcl');
    safeSetCell(row, 14, tk207_fnh3);
    safeSetCell(row, 15, tk207_cnh3);
    // Col 16 (P) is FORMULA: =N{r}+O{r} (strictly preserved by safeSetCell)
    safeSetCell(row, 17, tk207_tcl);
    safeSetCell(row, 18, tk207_pcl);

    // ── Cols 19..23 (S, T, U, V, W): Formulas preserved (S=C/E, T=N/R, U=M/J, V=2*E/C, W=P/Q) ──

    // ── 5. CR 202 Analysis (EB CN) (Cols 24..32: X..AF) ──
    const cr202_a = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'a');
    const cr202_b = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'b');
    const cr202_c = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'c');
    const cr202_d = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'd');
    const cr202_e = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'e');
    const cr202_f = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'f');
    const cr202_g = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'g');
    const cr202_h = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'h');
    const cr202_avgAH = getSlotsAverage(cr202Data, shiftInfo.twoSlots, 'avgAH') ||
      calcAverage([cr202_a, cr202_b, cr202_c, cr202_d, cr202_e, cr202_f, cr202_g, cr202_h]);
    safeSetCell(row, 24, cr202_a);
    safeSetCell(row, 25, cr202_b);
    safeSetCell(row, 26, cr202_c);
    safeSetCell(row, 27, cr202_d);
    safeSetCell(row, 28, cr202_e);
    safeSetCell(row, 29, cr202_f);
    safeSetCell(row, 30, cr202_g);
    safeSetCell(row, 31, cr202_h);
    safeSetCell(row, 32, cr202_avgAH);
    // Col 33 (AG) is FORMULA: Salting out % in EB (preserved)

    // ── 6. CR 203 Analysis (EC CN) (Cols 34..42: AH..AP) ──
    const cr203_a = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'a');
    const cr203_b = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'b');
    const cr203_c = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'c');
    const cr203_d = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'd');
    const cr203_e = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'e');
    const cr203_f = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'f');
    const cr203_g = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'g');
    const cr203_h = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'h');
    const cr203_avgTcl = getSlotsAverage(cr203Data, shiftInfo.twoSlots, 'avgTcl') ||
      calcAverage([cr203_a, cr203_b, cr203_c, cr203_d, cr203_e, cr203_f, cr203_g, cr203_h]);
    safeSetCell(row, 34, cr203_a);
    safeSetCell(row, 35, cr203_b);
    safeSetCell(row, 36, cr203_c);
    safeSetCell(row, 37, cr203_d);
    safeSetCell(row, 38, cr203_e);
    safeSetCell(row, 39, cr203_f);
    safeSetCell(row, 40, cr203_g);
    safeSetCell(row, 41, cr203_h);
    safeSetCell(row, 42, cr203_avgTcl);
    // Col 43 (AQ) is FORMULA: Salting out % in EC (preserved)

    // ── 7. PCL / TCL Analysis (Cols 44..51: AR..AY) ──
    const pclTclShift = pclTclData[shiftKey] || {};
    safeSetCell(row, 44, pclTclShift.a);
    safeSetCell(row, 45, pclTclShift.b);
    safeSetCell(row, 46, pclTclShift.c);
    safeSetCell(row, 47, pclTclShift.d);
    safeSetCell(row, 48, pclTclShift.e);
    safeSetCell(row, 49, pclTclShift.f);
    safeSetCell(row, 50, pclTclShift.g);
    safeSetCell(row, 51, pclTclShift.h);

    // ── 8. ACL Product Analysis (Cols 52..53: AZ, BA) ──
    const prodBss = aclProductData.bss || {};
    const prodChem = aclProductData.chemical || {};
    safeSetCell(row, 52, prodBss.p44 || prodChem.p44);
    safeSetCell(row, 53, prodChem.gypsum);

    // ── 9. Pure Salt Analysis (Cols 57..58: BE, BF) ──
    const pureSaltShift = pureSaltRows[shiftKey] || {};
    const pureSaltCa = pureSaltShift.ca !== undefined ? pureSaltShift.ca : pureSaltShift.calciumCa;
    const pureSaltMg = pureSaltShift.mg !== undefined ? pureSaltShift.mg : pureSaltShift.magnesiumMg;
    safeSetCell(row, 57, pureSaltCa);
    safeSetCell(row, 58, pureSaltMg);

    // ── 10. Purified Brine Analysis (Cols 59..62: BG..BJ) ──
    const brineTk109 = brineData.tk109 || {};
    const brineTk110 = brineData.tk110 || {};
    const brineCa = calcAverage([brineTk109.ca, brineTk110.ca]);
    const brineMg = calcAverage([brineTk109.mg, brineTk110.mg]);
    const brineSo4 = calcAverage([brineTk109.so4, brineTk110.so4]);
    const brineNacl = calcAverage([brineTk109.nacl, brineTk110.nacl]);
    safeSetCell(row, 59, brineCa);
    safeSetCell(row, 60, brineMg);
    safeSetCell(row, 61, brineSo4);
    safeSetCell(row, 62, brineNacl);

    // ── 11. ACL 300# Analysis / PCD (Col 63: BK) ──
    const acl300Shift = acl300Data[shiftKey] || {};
    safeSetCell(row, 63, acl300Shift.p18 || acl300Shift.p44);

    // ── 12. Pure Salt Sieve Analysis (Cols 118..123: DN..DS) ──
    const sieveShift = pureSaltSieveRows[shiftKey] || {};
    safeSetCell(row, 118, sieveShift.p18 ?? sieveShift.m16);
    safeSetCell(row, 119, sieveShift.p44 ?? sieveShift.m40);
    safeSetCell(row, 120, sieveShift.p60 ?? sieveShift.m50);
    safeSetCell(row, 121, sieveShift.p100);
    safeSetCell(row, 122, sieveShift.m100 ?? sieveShift.pan);
    if (sieveShift.meanDia !== undefined && sieveShift.meanDia !== null) {
      safeSetCell(row, 123, sieveShift.meanDia);
    }


    // Ensure formula cells on newly populated rows beyond template pre-fills have their formulas intact
    if (!row.getCell(11).formula && !row.getCell(11).sharedFormula && (tk205_fnh3 || tk205_cnh3)) {
      row.getCell(11).value = { formula: `J${rowNumber}+I${rowNumber}` };
    }
    if (!row.getCell(16).formula && !row.getCell(16).sharedFormula && (tk207_fnh3 || tk207_cnh3)) {
      row.getCell(16).value = { formula: `N${rowNumber}+O${rowNumber}` };
    }
    if (!row.getCell(19).formula && !row.getCell(19).sharedFormula && tk203_fnh3 && tk203_co2) {
      row.getCell(19).value = { formula: `C${rowNumber}/E${rowNumber}` };
    }
    if (!row.getCell(20).formula && !row.getCell(20).sharedFormula && tk207_fnh3 && tk207_pcl) {
      row.getCell(20).value = { formula: `N${rowNumber}/R${rowNumber}` };
    }
    if (!row.getCell(21).formula && !row.getCell(21).sharedFormula && tk205_pcl && tk205_cnh3) {
      row.getCell(21).value = { formula: `M${rowNumber}/J${rowNumber}` };
    }

    row.commit();
  }

  return workbook;
}

module.exports = {
  generateACLShiftReportWorkbook,
  getTemplateFilePath,
};
