/**
 * Ranges are copied from the frontend pages. If a range changes in the page, update it here too.
 */

const ANALYSIS_LABELS = {
  'PCL/TCL Analysis': {
    title: 'PCL/TCL ANALYSIS',
    rowLabels: {
      shift1: 'I SHIFT (06:00 - 14:00)',
      shift2: 'II SHIFT (14:00 - 22:00)',
      shift3: 'III SHIFT (22:00 - 06:00)',
    },
    columns: [
      { key: 'a', label: 'STREAM A', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'b', label: 'STREAM B', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'c', label: 'STREAM C', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'd', label: 'STREAM D', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'e', label: 'STREAM E', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'f', label: 'STREAM F', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'g', label: 'STREAM G', unit: 'Kgm/m³', range: '0.03-0.30' },
      { key: 'h', label: 'STREAM H', unit: 'Kgm/m³', range: '0.03-0.30' },
    ],
  },
  'TK 204 Analysis': {
    title: 'TK 204 ANALYSIS',
    rowLabels: {
      shift1: 'I SHIFT (06:00 - 14:00)',
      shift2: 'II SHIFT (14:00 - 22:00)',
      shift3: 'III SHIFT (22:00 - 06:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '2.99-3.19' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '3.60-3.80' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '4.99-5.19' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '1.29-1.49' },
    ],
  },
  'TK 203 Analysis': {
    title: 'TK 203 ANALYSIS',
    rowLabels: {
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
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '3.04-3.24' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '3.84-4.04' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.05-5.45' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '1.21-1.41' },
      { key: 'co2',  label: 'CO₂',  unit: null,     range: null },
    ],
  },
  'TK 205 Analysis': {
    title: 'TK 205 ANALYSIS',
    rowLabels: {
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
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '3.07-3.27' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.54-5.74' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '3.56-3.76' },
    ],
  },
  'TK 207 Analysis': {
    title: 'TK 207 ANALYSIS',
    rowLabels: {
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
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '3.92-4.12' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '1.82-2.02' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.37-5.57' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '3.45-3.65' },
    ],
  },
  'TK 209 Analysis': {
    title: 'TK 209 ANALYSIS',
    rowLabels: {
      shift1: 'I SHIFT (06:00 - 14:00)',
      shift2: 'II SHIFT (14:00 - 22:00)',
      shift3: 'III SHIFT (22:00 - 06:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '0.58-0.78' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '2.26-2.46' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '2.94-3.14' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '0.58-0.78' },
    ],
  },
  'Brine Analysis': {
    title: 'BRINE ANALYSIS',
    rowLabels: {
      tk109: 'TK 109',
      tk110: 'TK 110',
    },
    columns: [
      { key: 'nacl', label: 'NaCl', unit: 'g/L', range: '270-370' },
      { key: 'ca',   label: 'Ca',   unit: 'g/L', range: '1-3' },
      { key: 'mg',   label: 'Mg',   unit: 'g/L', range: '4-6' },
      { key: 'so4',  label: 'SO₄',  unit: 'g/L', range: '5-15' },
    ],
  },
  'CR 202 Analysis': {
    title: 'CR 202 ANALYSIS',
    rowLabels: {
      t07: '07:00 (I Shift)',
      t11: '11:00 (I Shift)',
      t15: '15:00 (II Shift)',
      t19: '19:00 (II Shift)',
      t23: '23:00 (III Shift)',
      t03: '03:00 (III Shift)',
    },
    columns: [
      { key: 'a',      label: 'A',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'b',      label: 'B',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'c',      label: 'C',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'd',      label: 'D',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'e',      label: 'E',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'f',      label: 'F',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'g',      label: 'G',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'h',      label: 'H',   unit: 'Kgm/m³', range: '2.88-3.08' },
      { key: 'avgTcl', label: 'TCl', unit: 'Kgm/m³', range: '4.55-4.75' },
      { key: 'avgAH',  label: 'A-H', unit: 'Kgm/m³', range: '2.88-3.08' },
    ],
  },
  'CR 203 Analysis': {
    title: 'CR 203 ANALYSIS',
    rowLabels: {
      t07: '07:00 (I Shift)',
      t11: '11:00 (I Shift)',
      t15: '15:00 (II Shift)',
      t19: '19:00 (II Shift)',
      t23: '23:00 (III Shift)',
      t03: '03:00 (III Shift)',
    },
    columns: [
      { key: 'a',      label: 'A',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'b',      label: 'B',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'c',      label: 'C',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'd',      label: 'D',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'e',      label: 'E',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'f',      label: 'F',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'g',      label: 'G',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'h',      label: 'H',   unit: 'Kgm/m³', range: '1.88-2.08' },
      { key: 'avgTcl', label: 'TCl', unit: 'Kgm/m³', range: '5.54-5.74' },
    ],
  },
  'CaCl2 Analysis': {
    title: 'CACL2 ANALYSIS',
    columns: [
      { key: 'ph',   label: 'pH',   unit: null,  range: '6.7-8.7' },
      { key: 'conc', label: 'CONC', unit: '%',   range: '15-25' },
      { key: 'fnh3', label: 'FNH₃', unit: 'PPM', range: '950-1050' },
      { key: 'cnh3', label: 'CNH₃', unit: 'PPM', range: '400-600' },
      { key: 'ss',   label: 'SS',   unit: 'PPM', range: '50-70' },
    ],
  },
  'Raw Salt Analysis': {
    title: 'RAW SALT',
    columns: [
      { key: 'nacl', label: 'NaCl', unit: '%', range: null },
      { key: 'ca',   label: 'Ca',   unit: '%', range: null },
      { key: 'mg',   label: 'Mg',   unit: '%', range: null },
      { key: 'so4',  label: 'SO₄',  unit: '%', range: null },
      { key: 'ir',   label: 'IR',   unit: '%', range: null },
      { key: 'h2o',  label: 'H₂O',  unit: '%', range: null },
    ],
  },
  'ACL 300# Analysis': {
    title: 'ACL 300# ANALYSIS',
    rowLabels: {
      shift1: 'SHIFT 1 (06:00 - 14:00)',
      shift2: 'SHIFT 2 (14:00 - 22:00)',
      shift3: 'SHIFT 3 (22:00 - 06:00)',
    },
    columns: [
      { key: 'p18',  label: '+18',  unit: '%', range: null },
      { key: 'p44',  label: '+44',  unit: '%', range: null },
      { key: 'nacl', label: 'NaCl', unit: '%', range: null },
    ],
  },
  'Pure Salt Analysis': {
    title: 'PURE SALT ANALYSIS',
    rowLabels: {
      rawSalt:     'RAW SALT',
      shift1:      'I SHIFT',
      shift2:      'II SHIFT',
      shift3:      'III SHIFT',
      composition: 'COMPOSITION',
    },
    columns: [
      { key: 'nacl', label: 'NaCl', unit: '%', range: null },
      { key: 'ca',   label: 'Ca',   unit: '%', range: null },
      { key: 'mg',   label: 'Mg',   unit: '%', range: null },
      { key: 'so4',  label: 'SO₄',  unit: '%', range: null },
      { key: 'ir',   label: 'IR',   unit: '%', range: null },
      { key: 'h2o',  label: 'H₂O',  unit: '%', range: null },
    ],
  },
  'Pure Salt Sieve Analysis': {
    title: 'PURE SALT SIEVE ANALYSIS',
    rowLabels: {
      shift1: 'I SHIFT',
      shift2: 'II SHIFT',
      shift3: 'III SHIFT',
    },
    columns: [
      { key: 'p18',  label: 'BSS 18',  unit: '%', range: null },
      { key: 'p44',  label: 'BSS 44',  unit: '%', range: null },
      { key: 'p60',  label: 'BSS 60',  unit: '%', range: null },
      { key: 'p100', label: 'BSS 100', unit: '%', range: null },
      { key: 'm100', label: '-100',    unit: '%', range: null },
    ],
  },
  'TK 401 Analysis': {
    title: 'TK 401 ANALYSIS',
    rowLabels: {
      s1: 'I SHIFT (07:00 – 15:00)',
      s2: 'II SHIFT (15:00 – 23:00)',
      s3: 'III SHIFT (23:00 – 07:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '3.87-4.07' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '1.82-2.02' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.37-5.57' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '3.45-3.65' },
      { key: 'tcao', label: 'TCaO', unit: null,     range: null },
    ],
  },
  'TK 405 Analysis': {
    title: 'TK 405 ANALYSIS',
    rowLabels: {
      s1: 'I SHIFT (07:00 – 15:00)',
      s2: 'II SHIFT (15:00 – 23:00)',
      s3: 'III SHIFT (23:00 – 07:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '3.76-3.96' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '1.79-1.99' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.29-5.49' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '3.40-3.60' },
      { key: 'tcao', label: 'TCaO', unit: null,     range: null },
    ],
  },
  'TK 414 TSC TANK Analysis': {
    title: 'TK 414 TSC TANK ANALYSIS',
    rowLabels: {
      s1: 'I SHIFT (07:00 – 15:00)',
      s2: 'II SHIFT (15:00 – 23:00)',
      s3: 'III SHIFT (23:00 – 07:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '1.30-1.50' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '4.00-4.20' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.36-5.56' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '1.26-1.46' },
    ],
  },
  'P413 WSC TANK Analysis': {
    title: 'P413 WSC TANK ANALYSIS',
    rowLabels: {
      s1: 'I SHIFT (07:00 – 15:00)',
      s2: 'II SHIFT (15:00 – 23:00)',
      s3: 'III SHIFT (23:00 – 07:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '1.48-1.68' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '3.99-4.19' },
      { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', range: '5.35-5.55' },
      { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', range: '1.26-1.46' },
    ],
  },
  'TK 419 SC TANK Analysis': {
    title: 'TK 419 SC TANK ANALYSIS',
    rowLabels: {
      s1: 'I SHIFT (07:00 – 15:00)',
      s2: 'II SHIFT (15:00 – 23:00)',
      s3: 'III SHIFT (23:00 – 07:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '1.98-2.18' },
      { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', range: '3.96-4.16' },
    ],
  },
  'LSA Shift Analysis': {
    title: 'LSA SHIFT ANALYSIS',
    rowLabels: {
      iShift: 'I SHIFT (06:00 – 14:00)',
      iiShift: 'II SHIFT (14:00 – 22:00)',
      iiiShift: 'III SHIFT (22:00 – 06:00)',
      composite: 'COMPOSITE (24-Hour Composite)',
    },
    columns: [
      { key: 'na2co3',    label: 'Na₂CO₃',            unit: '%',   range: '98.5-99.5' },
      { key: 'nacl',      label: 'NaCl',              unit: '%',   range: '0.5-1.0' },
      { key: 'fe',        label: 'Fe',                unit: '%',   range: '0.006-0.008' },
      { key: 'na2so4',    label: 'Na₂SO₄',            unit: '%',   range: '0.079-0.081' },
      { key: 'vm',        label: 'VM',                unit: '%',   range: '0.5-2.1' },
      { key: 'ir',        label: 'IR',                unit: '%',   range: '0.14-0.16' },
      { key: 'bd',        label: 'BD',                unit: 'g/L', range: '500-750' },
      { key: 'turbidity', label: 'TURBIDITY SOLUTION', unit: 'NTU', range: '75-85' },
    ],
  },
  'LSA AT 500# Analysis': {
    title: 'LSA AT 500# ANALYSIS',
    columns: [
      { key: 'nacl',      label: 'NaCl',      unit: '%',   range: '0.5-2.0' },
      { key: 'bd',        label: 'BD',        unit: 'g/L', range: '500-750' },
      { key: 'turbidity', label: 'TURBIDITY', unit: 'NTU', range: '75-85' },
    ],
  },
  'LSA Bagging Sieve Analysis': {
    title: 'LSA BAGGING SIEVE ANALYSIS',
    columns: [
      { key: 'bss10', label: 'BSS 10', unit: '%', range: null },
      { key: 'bss30', label: 'BSS 30', unit: '%', range: '1.5-2.0' },
      { key: 'm30',   label: '-30',    unit: '%', range: null },
      { key: 'bss60', label: 'BSS 60', unit: '%', range: '5.5-6.0' },
    ],
  },
  'P417 Analysis': {
    title: 'P417 ANALYSIS',
    rowLabels: {
      s1: 'I SHIFT (07:00 – 15:00)',
      s2: 'II SHIFT (15:00 – 23:00)',
      s3: 'III SHIFT (23:00 – 07:00)',
    },
    columns: [
      { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', range: '1.98-2.18' },
      { key: 'cnh3', label: 'CNH₃', unit: null,      range: null },
      { key: 'tcl',  label: 'TCl',  unit: null,      range: null },
      { key: 'nacl', label: 'NaCl', unit: null,      range: null },
    ],
  },
  'E 501 / T 501 Analysis': {
    title: 'E 501 / T 501 ANALYSIS',
    columns: [
      { key: 'e501_fnh3',   label: 'E 501 FNH₃',   unit: 'g/L', range: '10-40' },
      { key: 'e501_na2co3', label: 'E 501 Na₂CO₃', unit: 'g/L', range: '2-10' },
      { key: 't501_fnh3',   label: 'T 501 FNH₃',   unit: 'g/L', range: '1-5' },
      { key: 't501_na2co3', label: 'T 501 Na₂CO₃', unit: 'g/L', range: '20-60' },
    ],
  },
  'Bi Carbonate NaCl/Na2CO3 Analysis': {
    title: 'BI CARBONATE NaCl/Na₂CO₃ ANALYSIS',
    columns: [
      { key: 'filter',     label: 'Filter',        unit: null, range: null },
      { key: 'naclNa2co3', label: 'NaCl / Na₂CO₃', unit: '%',  range: null },
    ],
  },
  'Bicarbonate Moisture Analysis': {
    title: 'BICARBONATE MOISTURE ANALYSIS',
    columns: [
      { key: 'm404_a',      label: 'Option A',     unit: '%',  range: '18-22' },
      { key: 'm404_b',      label: 'Option B',     unit: '%',  range: '18-22' },
      { key: 'm404_c',      label: 'Option C',     unit: '%',  range: '18-22' },
      { key: 'm405_outlet', label: 'M 405 OUTLET', unit: null, range: null },
      { key: 'sb_turb1',    label: 'TURB 1',       unit: null, range: null },
      { key: 'sb_turb2',    label: 'TURB 2',       unit: null, range: null },
    ],
  },
};

/**
 * Returns the analysis config if found (case-insensitive, space-trimmed).
 * Returns null (does not throw) if analysisType is unknown or not provided.
 *
 * @param {string} analysisType
 * @returns {object|null}
 */
function getAnalysisConfig(analysisType) {
  if (!analysisType || typeof analysisType !== 'string') {
    return null;
  }
  const clean = analysisType.trim().toLowerCase();
  for (const [key, config] of Object.entries(ANALYSIS_LABELS)) {
    if (key.trim().toLowerCase() === clean) {
      return config;
    }
  }
  return null;
}

module.exports = {
  ANALYSIS_LABELS,
  getAnalysisConfig,
};
