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
