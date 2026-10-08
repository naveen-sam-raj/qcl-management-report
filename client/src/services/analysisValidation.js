/**
 * Centralized Analysis Limits & Validation Service
 * Defines reference targets, allowed tolerance ranges, and boundary calculators
 * for industrial chemical analysis parameters across plant units.
 */

// ─── Centralized Parameter Limits Registry ────────────────────────────────────
// Target values and allowed tolerances can be updated here without changing UI components.
export const ANALYSIS_LIMITS_REGISTRY = {
  tfl: {
    'pure-salt': {
      // Applied to Shift I, II, III rows
      shift: {
        ca: { target: 0.10, tolerance: 0.05, unit: '%' }, // Allowed: 0.05% – 0.15%
        mg: { target: 0.04, tolerance: 0.06, unit: '%' }, // Allowed: 0.00% – 0.10%
      },
      // Applied to Composition / Final row
      composition: {
        nacl: { target: 92.00, tolerance: 0.10, unit: '%' }, // Allowed: 91.90% – 92.10%
        ca: { target: 0.10, tolerance: 0.05, unit: '%' }, // Allowed: 0.05% – 0.15%
        mg: { target: 0.04, tolerance: 0.05, unit: '%' }, // Allowed: 0.00% – 0.09%
        so4: { target: 0.46, tolerance: 0.10, unit: '%' }, // Allowed: 0.36% – 0.56%
        ir: { target: 0.30, tolerance: 0.20, unit: '%' }, // Allowed: 0.10% – 0.50%
        h2o: { target: 7.00, tolerance: 1.00, unit: '%' }, // Allowed: 6.00% – 8.00%
      },
    },
    'brine': {
      // Applied to Brine Analysis (TK 109, TK 110) - Frequency: WEEK
      week: {
        nacl: { target: 320, tolerance: 50, min: 270, max: 370, unit: 'g/L', frequency: 'WEEK' }, // Allowed: 270–370 g/L
        ca: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'g/L', frequency: 'WEEK' }, // Allowed: 1–3 g/L
        mg: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: 'g/L', frequency: 'WEEK' }, // Allowed: 4–6 g/L
        so4: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'g/L', frequency: 'WEEK' }, // Allowed: 5–15 g/L
      },
    },
    'pure-salt-sieve': {
      // Applied to Pure Salt Sieve Analysis — II SHIFT
      shift2: {
        p18: { target: 4, tolerance: 2, min: 2, max: 6, unit: '%', paramName: 'BSS 18', shift: 'II SHIFT' }, // Allowed: 2%–6%
        bss18: { target: 4, tolerance: 2, min: 2, max: 6, unit: '%', paramName: 'BSS 18', shift: 'II SHIFT' },
        p44: { target: 16, tolerance: 5, min: 11, max: 21, unit: '%', paramName: 'BSS 44', shift: 'II SHIFT' }, // Allowed: 11%–21%
        bss44: { target: 16, tolerance: 5, min: 11, max: 21, unit: '%', paramName: 'BSS 44', shift: 'II SHIFT' },
        p60: { target: 27, tolerance: 4, min: 23, max: 31, unit: '%', paramName: 'BSS 60', shift: 'II SHIFT' }, // Allowed: 23%–31%
        bss60: { target: 27, tolerance: 4, min: 23, max: 31, unit: '%', paramName: 'BSS 60', shift: 'II SHIFT' },
        p100: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'BSS 100', shift: 'II SHIFT' }, // Allowed: 25%–35%
        bss100: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'BSS 100', shift: 'II SHIFT' },
        m100: { target: 23, tolerance: 3, min: 20, max: 26, unit: '%', paramName: '-100', shift: 'II SHIFT' }, // Allowed: 20%–26%
        '-100': { target: 23, tolerance: 3, min: 20, max: 26, unit: '%', paramName: '-100', shift: 'II SHIFT' },
      },
    },
    'tk203': {
      // Applied to TK203 Analysis - Frequency: SHIFT TWICE
      shiftTwice: {
        fnh3: { target: 3.14, tolerance: 0.10, min: 3.04, max: 3.24, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'SHIFT TWICE' },
        cnh3: { target: 3.94, tolerance: 0.10, min: 3.84, max: 4.04, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'SHIFT TWICE' },
        tcl: { target: 5.25, tolerance: 0.20, min: 5.05, max: 5.45, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'SHIFT TWICE' },
        pcl: { target: 1.31, tolerance: 0.10, min: 1.21, max: 1.41, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'SHIFT TWICE' },
      },
    },
    'tk204': {
      // Applied to TK204 Analysis - Frequency: Once in a shift (Allowed ranges: 2.99-3.19, 3.60-3.80, 4.99-5.19, 1.29-1.49)
      onceInAShift: {
        fnh3: { target: 3.09, tolerance: 0.10, min: 2.99, max: 3.19, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift' },
        cnh3: { target: 3.70, tolerance: 0.10, min: 3.60, max: 3.80, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift' },
        tcl: { target: 5.09, tolerance: 0.10, min: 4.99, max: 5.19, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift' },
        pcl: { target: 1.39, tolerance: 0.10, min: 1.29, max: 1.49, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift' },
      },
      shift: {
        fnh3: { target: 3.09, tolerance: 0.10, min: 2.99, max: 3.19, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift' },
        cnh3: { target: 3.70, tolerance: 0.10, min: 3.60, max: 3.80, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift' },
        tcl: { target: 5.09, tolerance: 0.10, min: 4.99, max: 5.19, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift' },
        pcl: { target: 1.39, tolerance: 0.10, min: 1.29, max: 1.49, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift' },
      },
    },
    'bl1204-bl1203': {
      // Applied to CO2 Plant - BL1204/BL1203 Analysis - Frequency: Once in a shift
      onceInAShift: {
        co2: { target: 15, tolerance: 1.0, min: 14, max: 16, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 6, tolerance: 1.0, min: 5, max: 7, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 15, tolerance: 1.0, min: 14, max: 16, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 6, tolerance: 1.0, min: 5, max: 7, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
    },
    'absorber-inlet': {
      // Applied to CO2 Plant - Absorber Inlet Analysis - Frequency: Once in a shift
      onceInAShift: {
        co2: { target: 11, tolerance: 1.0, min: 10, max: 12, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 9, tolerance: 1.0, min: 8, max: 10, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 500, tolerance: 50, min: 450, max: 550, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
        no: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NO', frequency: 'Once in a shift' },
        nox: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NOX', frequency: 'Once in a shift' },
        no2: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'NO2', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 11, tolerance: 1.0, min: 10, max: 12, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 9, tolerance: 1.0, min: 8, max: 10, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 500, tolerance: 50, min: 450, max: 550, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
        no: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NO', frequency: 'Once in a shift' },
        nox: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NOX', frequency: 'Once in a shift' },
        no2: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'NO2', frequency: 'Once in a shift' },
      },
    },
    'outlet': {
      // Applied to CO2 Plant - Outlet Analysis - Frequency: Once in a shift
      onceInAShift: {
        co2: { target: 1.0, tolerance: 1.0, min: 0, max: 2, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        co: { target: 300, tolerance: 50, min: 250, max: 350, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 1.0, tolerance: 1.0, min: 0, max: 2, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        co: { target: 300, tolerance: 50, min: 250, max: 350, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
    },
    'lean': {
      // Applied to CO2 Plant - Lean Analysis
      onceInAShift: {
        loading: { target: 0.2000, tolerance: 0.05, min: 0.1500, max: 0.2500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.1500–0.2500 g of CO2 / g of solvent', formattedTarget: '0.2000 g of CO2 / g of solvent', formattedTolerance: '±0.05' },
        alk: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'Alk', frequency: 'Once in a shift', formattedRange: '25–35%', formattedTarget: '30%', formattedTolerance: '±5%' },
        foamheight: { target: 5, tolerance: 2, min: 3, max: 7, unit: 'CM', paramName: 'Foam Height', frequency: 'Once in a shift', formattedRange: '3–7 CM', formattedTarget: '5 CM', formattedTolerance: '±2 CM' },
        collapsetime: { target: 10, tolerance: 2, min: 8, max: 12, unit: 'sec', paramName: 'Collapse Time', frequency: 'Once in a shift', formattedRange: '8–12 sec', formattedTarget: '10 sec', formattedTolerance: '±2 sec' },
      },
      shift: {
        loading: { target: 0.2000, tolerance: 0.05, min: 0.1500, max: 0.2500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.1500–0.2500 g of CO2 / g of solvent', formattedTarget: '0.2000 g of CO2 / g of solvent', formattedTolerance: '±0.05' },
        alk: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'Alk', frequency: 'Once in a shift', formattedRange: '25–35%', formattedTarget: '30%', formattedTolerance: '±5%' },
        foamheight: { target: 5, tolerance: 2, min: 3, max: 7, unit: 'CM', paramName: 'Foam Height', frequency: 'Once in a shift', formattedRange: '3–7 CM', formattedTarget: '5 CM', formattedTolerance: '±2 CM' },
        collapsetime: { target: 10, tolerance: 2, min: 8, max: 12, unit: 'sec', paramName: 'Collapse Time', frequency: 'Once in a shift', formattedRange: '8–12 sec', formattedTarget: '10 sec', formattedTolerance: '±2 sec' },
      },
      day: {
        hss: { target: 2.0, tolerance: 0.1, min: 1.9, max: 2.1, unit: '%', paramName: 'HSS', frequency: 'Day', formattedRange: '1.9–2.1%', formattedTarget: '2.0%', formattedTolerance: '±0.1%' },
        density: { target: 1040, tolerance: 10, min: 1030, max: 1050, unit: 'Kg/cc', paramName: 'Density', frequency: 'Day', formattedRange: '1030–1050 Kg/cc', formattedTarget: '1040 Kg/cc', formattedTolerance: '±10' },
        tss: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'PPM', paramName: 'TSS', frequency: 'Day', formattedRange: '40–60 PPM', formattedTarget: '50 PPM', formattedTolerance: '±10 PPM' },
      },
    },
    'rich': {
      // Applied to CO2 Plant - Rich Analysis - Frequency: Once in a shift
      onceInAShift: {
        loading: { target: 0.6000, tolerance: 0.05, min: 0.5500, max: 0.6500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.5500–0.6500 g of CO2/g of solvent', formattedTarget: '0.6000 g of CO2/g of solvent', formattedTolerance: '±0.05' },
        density: { target: 1080, tolerance: 10, min: 1070, max: 1090, unit: 'Kg/cc', paramName: 'Density', frequency: 'Once in a shift', formattedRange: '1070–1090 Kg/cc', formattedTarget: '1080 Kg/cc', formattedTolerance: '±10' },
      },
      shift: {
        loading: { target: 0.6000, tolerance: 0.05, min: 0.5500, max: 0.6500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.5500–0.6500 g of CO2/g of solvent', formattedTarget: '0.6000 g of CO2/g of solvent', formattedTolerance: '±0.05' },
        density: { target: 1080, tolerance: 10, min: 1070, max: 1090, unit: 'Kg/cc', paramName: 'Density', frequency: 'Once in a shift', formattedRange: '1070–1090 Kg/cc', formattedTarget: '1080 Kg/cc', formattedTolerance: '±10' },
      },
    },
    'washwater': {
      // Applied to CO2 Plant - Washwater Analysis - Frequency: Once in a shift
      // Parameter: ALK (Target: 0.20%, Tolerance: ±0.10%, Allowed range: 0.10%–0.30%, Unit: %)
      onceInAShift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
      shift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
    },
    'p1256': {
      // Applied to CO2 Plant - P1256 Analysis - Frequency: Once in a shift
      // Parameter: ALK (Target: 0.20%, Tolerance: ±0.10%, Allowed range: 0.10%–0.30%, Unit: %)
      onceInAShift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
      shift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
    },
    'reflux': {
      // Applied to CO2 Plant - Reflux Analysis - Frequency: Once in a shift
      // Parameter: ALK (Target: 0.30%, Tolerance: ±0.10%, Allowed range: 0.20%–0.40%, Unit: %)
      onceInAShift: {
        alk: { target: 0.30, tolerance: 0.10, min: 0.20, max: 0.40, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.20–0.40%', formattedTarget: '0.30%', formattedTolerance: '±0.10%' },
      },
      shift: {
        alk: { target: 0.30, tolerance: 0.10, min: 0.20, max: 0.40, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.20–0.40%', formattedTarget: '0.30%', formattedTolerance: '±0.10%' },
      },
    },
    'tk1251': {
      // Applied to CO2 Plant - TK1251 Analysis - Frequency: Once in a shift
      // pH: Allowed range 8.0–9.5 (no unit)
      // ALK: Allowed range 2–5 g/L
      onceInAShift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
      shift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
    },
    'tk1252': {
      // Applied to CO2 Plant - TK1252 Analysis - Frequency: Once in a shift
      // pH: Allowed range 8.0–9.5 (no unit)
      // ALK: Allowed range 2–5 g/L
      onceInAShift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
      shift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
    },
    'dcc-drain-liq': {
      // Applied to CO2 Plant - DCC DRAIN LIQ Analysis - Frequency: Once in a Week
      // Cl: Target: 500 PPM, Tolerance: ±10 PPM, Allowed range: 490–510 PPM
      // SO4: Target: 1500 PPM, Tolerance: ±100 PPM, Allowed range: 1400–1600 PPM
      // Fe: Target: 10 PPM, Tolerance: ±2.0 PPM, Allowed range: 8–12 PPM
      // TSS: Target: 50 PPM, Tolerance: ±10 PPM, Allowed range: 40–60 PPM
      onceInAWeek: {
        cl: { target: 500, tolerance: 10, min: 490, max: 510, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '490–510 PPM', formattedTarget: '500 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 1500, tolerance: 100, min: 1400, max: 1600, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '1400–1600 PPM', formattedTarget: '1500 PPM', formattedTolerance: '±100 PPM' },
        fe: { target: 10, tolerance: 2.0, min: 8, max: 12, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '8–12 PPM', formattedTarget: '10 PPM', formattedTolerance: '±2.0 PPM' },
        tss: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '40–60 PPM', formattedTarget: '50 PPM', formattedTolerance: '±10 PPM' },
      },
      week: {
        cl: { target: 500, tolerance: 10, min: 490, max: 510, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '490–510 PPM', formattedTarget: '500 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 1500, tolerance: 100, min: 1400, max: 1600, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '1400–1600 PPM', formattedTarget: '1500 PPM', formattedTolerance: '±100 PPM' },
        fe: { target: 10, tolerance: 2.0, min: 8, max: 12, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '8–12 PPM', formattedTarget: '10 PPM', formattedTolerance: '±2.0 PPM' },
        tss: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '40–60 PPM', formattedTarget: '50 PPM', formattedTolerance: '±10 PPM' },
      },
    },
    'sox-drain-liq': {
      // Applied to CO2 Plant - SOX DRAIN LIQ Analysis - Frequency: Once in a Week
      // Cl: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM
      // SO4: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM
      // Fe: Target: 2 PPM, Tolerance: ±1.0 PPM, Allowed range: 1–3 PPM
      // TSS: Target: 10 PPM, Tolerance: ±10 PPM, Allowed range: 0–20 PPM
      onceInAWeek: {
        cl: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '1–3 PPM', formattedTarget: '2 PPM', formattedTolerance: '±1.0 PPM' },
        tss: { target: 10, tolerance: 10, min: 0, max: 20, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '0–20 PPM', formattedTarget: '10 PPM', formattedTolerance: '±10 PPM' },
      },
      week: {
        cl: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '1–3 PPM', formattedTarget: '2 PPM', formattedTolerance: '±1.0 PPM' },
        tss: { target: 10, tolerance: 10, min: 0, max: 20, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '0–20 PPM', formattedTarget: '10 PPM', formattedTolerance: '±10 PPM' },
      },
    },
    'lsa': {
      onceInAShift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
      shift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
    },
    'lsa-shift': {
      onceInAShift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
      shift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
    },
  },
  co2: {
    'bl1204-bl1203': {
      // Applied to CO2 Plant - BL1204/BL1203 Analysis - Frequency: Once in a shift
      onceInAShift: {
        co2: { target: 15, tolerance: 1.0, min: 14, max: 16, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 6, tolerance: 1.0, min: 5, max: 7, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 15, tolerance: 1.0, min: 14, max: 16, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 6, tolerance: 1.0, min: 5, max: 7, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
    },
    'absorber-inlet': {
      // Applied to CO2 Plant - Absorber Inlet Analysis - Frequency: Once in a shift
      onceInAShift: {
        co2: { target: 11, tolerance: 1.0, min: 10, max: 12, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 9, tolerance: 1.0, min: 8, max: 10, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 500, tolerance: 50, min: 450, max: 550, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
        no: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NO', frequency: 'Once in a shift' },
        nox: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NOX', frequency: 'Once in a shift' },
        no2: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'NO2', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 11, tolerance: 1.0, min: 10, max: 12, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 9, tolerance: 1.0, min: 8, max: 10, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 500, tolerance: 50, min: 450, max: 550, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
        no: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NO', frequency: 'Once in a shift' },
        nox: { target: 50, tolerance: 20, min: 30, max: 70, unit: 'PPM', paramName: 'NOX', frequency: 'Once in a shift' },
        no2: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'NO2', frequency: 'Once in a shift' },
      },
    },
    'outlet': {
      // Applied to CO2 Plant - Outlet Analysis - Frequency: Once in a shift
      onceInAShift: {
        co2: { target: 1.0, tolerance: 1.0, min: 0, max: 2, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        co: { target: 300, tolerance: 50, min: 250, max: 350, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 1.0, tolerance: 1.0, min: 0, max: 2, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        co: { target: 300, tolerance: 50, min: 250, max: 350, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
    },
    'lean': {
      // Applied to CO2 Plant - Lean Analysis
      onceInAShift: {
        loading: { target: 0.2000, tolerance: 0.05, min: 0.1500, max: 0.2500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.1500–0.2500 g of CO2 / g of solvent', formattedTarget: '0.2000 g of CO2 / g of solvent', formattedTolerance: '±0.05' },
        alk: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'Alk', frequency: 'Once in a shift', formattedRange: '25–35%', formattedTarget: '30%', formattedTolerance: '±5%' },
        foamheight: { target: 5, tolerance: 2, min: 3, max: 7, unit: 'CM', paramName: 'Foam Height', frequency: 'Once in a shift', formattedRange: '3–7 CM', formattedTarget: '5 CM', formattedTolerance: '±2 CM' },
        collapsetime: { target: 10, tolerance: 2, min: 8, max: 12, unit: 'sec', paramName: 'Collapse Time', frequency: 'Once in a shift', formattedRange: '8–12 sec', formattedTarget: '10 sec', formattedTolerance: '±2 sec' },
      },
      shift: {
        loading: { target: 0.2000, tolerance: 0.05, min: 0.1500, max: 0.2500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.1500–0.2500 g of CO2 / g of solvent', formattedTarget: '0.2000 g of CO2 / g of solvent', formattedTolerance: '±0.05' },
        alk: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'Alk', frequency: 'Once in a shift', formattedRange: '25–35%', formattedTarget: '30%', formattedTolerance: '±5%' },
        foamheight: { target: 5, tolerance: 2, min: 3, max: 7, unit: 'CM', paramName: 'Foam Height', frequency: 'Once in a shift', formattedRange: '3–7 CM', formattedTarget: '5 CM', formattedTolerance: '±2 CM' },
        collapsetime: { target: 10, tolerance: 2, min: 8, max: 12, unit: 'sec', paramName: 'Collapse Time', frequency: 'Once in a shift', formattedRange: '8–12 sec', formattedTarget: '10 sec', formattedTolerance: '±2 sec' },
      },
      day: {
        hss: { target: 2.0, tolerance: 0.1, min: 1.9, max: 2.1, unit: '%', paramName: 'HSS', frequency: 'Day', formattedRange: '1.9–2.1%', formattedTarget: '2.0%', formattedTolerance: '±0.1%' },
        density: { target: 1040, tolerance: 10, min: 1030, max: 1050, unit: 'Kg/cc', paramName: 'Density', frequency: 'Day', formattedRange: '1030–1050 Kg/cc', formattedTarget: '1040 Kg/cc', formattedTolerance: '±10' },
        tss: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'PPM', paramName: 'TSS', frequency: 'Day', formattedRange: '40–60 PPM', formattedTarget: '50 PPM', formattedTolerance: '±10 PPM' },
      },
      // Applied to CO2 Plant - LEAN Analysis (Weekly) - Frequency: Once in a Week
      // Cl: 450–550 PPM, SO4: 140–160 PPM, Fe: 28–32 PPM, TSS: 20–40 PPM, Na: 490–510 PPM, K: 950–1050 PPM, NO2: 20–40 PPM, NO3: 590–610 PPM
      onceInAWeek: {
        cl: { target: 500, tolerance: 50, min: 450, max: 550, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '450–550 PPM', formattedTarget: '500 PPM', formattedTolerance: '±50 PPM' },
        so4: { target: 150, tolerance: 10, min: 140, max: 160, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '140–160 PPM', formattedTarget: '150 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 30, tolerance: 2.0, min: 28, max: 32, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '28–32 PPM', formattedTarget: '30 PPM', formattedTolerance: '±2.0 PPM' },
        tss: { target: 30, tolerance: 10, min: 20, max: 40, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '20–40 PPM', formattedTarget: '30 PPM', formattedTolerance: '±10 PPM' },
        na: { target: 500, tolerance: 10, min: 490, max: 510, unit: 'PPM', paramName: 'Na', frequency: 'Once in a Week', formattedRange: '490–510 PPM', formattedTarget: '500 PPM', formattedTolerance: '±10 PPM' },
        k: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'K', frequency: 'Once in a Week', formattedRange: '950–1050 PPM', formattedTarget: '1000 PPM', formattedTolerance: '±50 PPM' },
        no2: { target: 30, tolerance: 10, min: 20, max: 40, unit: 'PPM', paramName: 'NO2', frequency: 'Once in a Week', formattedRange: '20–40 PPM', formattedTarget: '30 PPM', formattedTolerance: '±10 PPM' },
        no3: { target: 600, tolerance: 10, min: 590, max: 610, unit: 'PPM', paramName: 'NO3', frequency: 'Once in a Week', formattedRange: '590–610 PPM', formattedTarget: '600 PPM', formattedTolerance: '±10 PPM' },
      },
      week: {
        cl: { target: 500, tolerance: 50, min: 450, max: 550, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '450–550 PPM', formattedTarget: '500 PPM', formattedTolerance: '±50 PPM' },
        so4: { target: 150, tolerance: 10, min: 140, max: 160, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '140–160 PPM', formattedTarget: '150 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 30, tolerance: 2.0, min: 28, max: 32, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '28–32 PPM', formattedTarget: '30 PPM', formattedTolerance: '±2.0 PPM' },
        tss: { target: 30, tolerance: 10, min: 20, max: 40, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '20–40 PPM', formattedTarget: '30 PPM', formattedTolerance: '±10 PPM' },
        na: { target: 500, tolerance: 10, min: 490, max: 510, unit: 'PPM', paramName: 'Na', frequency: 'Once in a Week', formattedRange: '490–510 PPM', formattedTarget: '500 PPM', formattedTolerance: '±10 PPM' },
        k: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'K', frequency: 'Once in a Week', formattedRange: '950–1050 PPM', formattedTarget: '1000 PPM', formattedTolerance: '±50 PPM' },
        no2: { target: 30, tolerance: 10, min: 20, max: 40, unit: 'PPM', paramName: 'NO2', frequency: 'Once in a Week', formattedRange: '20–40 PPM', formattedTarget: '30 PPM', formattedTolerance: '±10 PPM' },
        no3: { target: 600, tolerance: 10, min: 590, max: 610, unit: 'PPM', paramName: 'NO3', frequency: 'Once in a Week', formattedRange: '590–610 PPM', formattedTarget: '600 PPM', formattedTolerance: '±10 PPM' },
      },
    },
    'rich': {
      // Applied to CO2 Plant - Rich Analysis - Frequency: Once in a shift
      onceInAShift: {
        loading: { target: 0.6000, tolerance: 0.05, min: 0.5500, max: 0.6500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.5500–0.6500 g of CO2/g of solvent', formattedTarget: '0.6000 g of CO2/g of solvent', formattedTolerance: '±0.05' },
        density: { target: 1080, tolerance: 10, min: 1070, max: 1090, unit: 'Kg/cc', paramName: 'Density', frequency: 'Once in a shift', formattedRange: '1070–1090 Kg/cc', formattedTarget: '1080 Kg/cc', formattedTolerance: '±10' },
      },
      shift: {
        loading: { target: 0.6000, tolerance: 0.05, min: 0.5500, max: 0.6500, unit: 'g of CO2/g of solvent', paramName: 'Loading', frequency: 'Once in a shift', formattedRange: '0.5500–0.6500 g of CO2/g of solvent', formattedTarget: '0.6000 g of CO2/g of solvent', formattedTolerance: '±0.05' },
        density: { target: 1080, tolerance: 10, min: 1070, max: 1090, unit: 'Kg/cc', paramName: 'Density', frequency: 'Once in a shift', formattedRange: '1070–1090 Kg/cc', formattedTarget: '1080 Kg/cc', formattedTolerance: '±10' },
      },
    },
    'washwater': {
      // Applied to CO2 Plant - Washwater Analysis - Frequency: Once in a shift
      // Parameter: ALK (Target: 0.20%, Tolerance: ±0.10%, Allowed range: 0.10%–0.30%, Unit: %)
      onceInAShift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
      shift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
    },
    'p1256': {
      // Applied to CO2 Plant - P1256 Analysis - Frequency: Once in a shift
      // Parameter: ALK (Target: 0.20%, Tolerance: ±0.10%, Allowed range: 0.10%–0.30%, Unit: %)
      onceInAShift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
      shift: {
        alk: { target: 0.20, tolerance: 0.10, min: 0.10, max: 0.30, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.10–0.30%', formattedTarget: '0.20%', formattedTolerance: '±0.10%' },
      },
    },
    'reflux': {
      // Applied to CO2 Plant - Reflux Analysis - Frequency: Once in a shift
      // Parameter: ALK (Target: 0.30%, Tolerance: ±0.10%, Allowed range: 0.20%–0.40%, Unit: %)
      onceInAShift: {
        alk: { target: 0.30, tolerance: 0.10, min: 0.20, max: 0.40, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.20–0.40%', formattedTarget: '0.30%', formattedTolerance: '±0.10%' },
      },
      shift: {
        alk: { target: 0.30, tolerance: 0.10, min: 0.20, max: 0.40, unit: '%', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '0.20–0.40%', formattedTarget: '0.30%', formattedTolerance: '±0.10%' },
      },
    },
    'tk1251': {
      // Applied to CO2 Plant - TK1251 Analysis - Frequency: Once in a shift
      // pH: Allowed range 8.0–9.5 (no unit)
      // ALK: Allowed range 2–5 g/L
      onceInAShift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
      shift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
    },
    'tk1252': {
      // Applied to CO2 Plant - TK1252 Analysis - Frequency: Once in a shift
      // pH: Allowed range 8.0–9.5 (no unit)
      // ALK: Allowed range 2–5 g/L
      onceInAShift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
      shift: {
        ph: { min: 8.0, max: 9.5, unit: '', paramName: 'pH', frequency: 'Once in a shift', formattedRange: '8.0–9.5' },
        alk: { min: 2, max: 5, unit: 'g/L', paramName: 'ALK', frequency: 'Once in a shift', formattedRange: '2–5 g/L' },
      },
    },
    'dcc-drain-liq': {
      // Applied to CO2 Plant - DCC DRAIN LIQ Analysis - Frequency: Once in a Week
      // Cl: Target: 500 PPM, Tolerance: ±10 PPM, Allowed range: 490–510 PPM
      // SO4: Target: 1500 PPM, Tolerance: ±100 PPM, Allowed range: 1400–1600 PPM
      // Fe: Target: 10 PPM, Tolerance: ±2.0 PPM, Allowed range: 8–12 PPM
      // TSS: Target: 50 PPM, Tolerance: ±10 PPM, Allowed range: 40–60 PPM
      onceInAWeek: {
        cl: { target: 500, tolerance: 10, min: 490, max: 510, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '490–510 PPM', formattedTarget: '500 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 1500, tolerance: 100, min: 1400, max: 1600, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '1400–1600 PPM', formattedTarget: '1500 PPM', formattedTolerance: '±100 PPM' },
        fe: { target: 10, tolerance: 2.0, min: 8, max: 12, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '8–12 PPM', formattedTarget: '10 PPM', formattedTolerance: '±2.0 PPM' },
        tss: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '40–60 PPM', formattedTarget: '50 PPM', formattedTolerance: '±10 PPM' },
      },
      week: {
        cl: { target: 500, tolerance: 10, min: 490, max: 510, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '490–510 PPM', formattedTarget: '500 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 1500, tolerance: 100, min: 1400, max: 1600, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '1400–1600 PPM', formattedTarget: '1500 PPM', formattedTolerance: '±100 PPM' },
        fe: { target: 10, tolerance: 2.0, min: 8, max: 12, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '8–12 PPM', formattedTarget: '10 PPM', formattedTolerance: '±2.0 PPM' },
        tss: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '40–60 PPM', formattedTarget: '50 PPM', formattedTolerance: '±10 PPM' },
      },
    },
    'sox-drain-liq': {
      // Applied to CO2 Plant - SOX DRAIN LIQ Analysis - Frequency: Once in a Week
      // Cl: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM
      // SO4: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM
      // Fe: Target: 2 PPM, Tolerance: ±1.0 PPM, Allowed range: 1–3 PPM
      // TSS: Target: 10 PPM, Tolerance: ±10 PPM, Allowed range: 0–20 PPM
      onceInAWeek: {
        cl: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '1–3 PPM', formattedTarget: '2 PPM', formattedTolerance: '±1.0 PPM' },
        tss: { target: 10, tolerance: 10, min: 0, max: 20, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '0–20 PPM', formattedTarget: '10 PPM', formattedTolerance: '±10 PPM' },
      },
      week: {
        cl: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '1–3 PPM', formattedTarget: '2 PPM', formattedTolerance: '±1.0 PPM' },
        tss: { target: 10, tolerance: 10, min: 0, max: 20, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '0–20 PPM', formattedTarget: '10 PPM', formattedTolerance: '±10 PPM' },
      },
    },
    'absorber-drain-liq': {
      // Applied to CO2 Plant - ABSORBER DRAIN LIQ Analysis - Frequency: Once in a Week
      // Cl: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM
      // SO4: Target: 100 PPM, Tolerance: ±10 PPM, Allowed range: 90–110 PPM
      // Fe: Target: 2 PPM, Tolerance: ±1.0 PPM, Allowed range: 1–3 PPM
      // TSS: Target: 10 PPM, Tolerance: ±10 PPM, Allowed range: 0–20 PPM
      onceInAWeek: {
        cl: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 100, tolerance: 10, min: 90, max: 110, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '90–110 PPM', formattedTarget: '100 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '1–3 PPM', formattedTarget: '2 PPM', formattedTolerance: '±1.0 PPM' },
        tss: { target: 10, tolerance: 10, min: 0, max: 20, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '0–20 PPM', formattedTarget: '10 PPM', formattedTolerance: '±10 PPM' },
      },
      week: {
        cl: { target: 300, tolerance: 10, min: 290, max: 310, unit: 'PPM', paramName: 'Cl', frequency: 'Once in a Week', formattedRange: '290–310 PPM', formattedTarget: '300 PPM', formattedTolerance: '±10 PPM' },
        so4: { target: 100, tolerance: 10, min: 90, max: 110, unit: 'PPM', paramName: 'SO4', frequency: 'Once in a Week', formattedRange: '90–110 PPM', formattedTarget: '100 PPM', formattedTolerance: '±10 PPM' },
        fe: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'PPM', paramName: 'Fe', frequency: 'Once in a Week', formattedRange: '1–3 PPM', formattedTarget: '2 PPM', formattedTolerance: '±1.0 PPM' },
        tss: { target: 10, tolerance: 10, min: 0, max: 20, unit: 'PPM', paramName: 'TSS', frequency: 'Once in a Week', formattedRange: '0–20 PPM', formattedTarget: '10 PPM', formattedTolerance: '±10 PPM' },
      },
    },
  },
  acl: {
    'pure-salt': {
      shift: {
        ca: { target: 0.10, tolerance: 0.05, unit: '%' }, // Allowed: 0.05% – 0.15%
        mg: { target: 0.04, tolerance: 0.06, unit: '%' }, // Allowed: 0.00% – 0.10%
      },
      composition: {
        nacl: { target: 92.00, tolerance: 0.10, unit: '%' }, // Allowed: 91.90% – 92.10%
        ca: { target: 0.14, tolerance: 0.05, unit: '%' }, // Allowed: 0.09% – 0.19%
        mg: { target: 0.05, tolerance: 0.05, unit: '%' }, // Allowed: 0.00% – 0.10%
        so4: { target: 0.46, tolerance: 0.10, unit: '%' }, // Allowed: 0.36% – 0.56%
        ir: { target: 0.30, tolerance: 0.20, unit: '%' }, // Allowed: 0.10% – 0.50%
        h2o: { target: 7.00, tolerance: 1.00, unit: '%' }, // Allowed: 6.00% – 8.00%
      },
    },
    'brine': {
      week: {
        nacl: { target: 320, tolerance: 50, min: 270, max: 370, unit: 'g/L', frequency: 'WEEK' },
        ca: { target: 2, tolerance: 1.0, min: 1, max: 3, unit: 'g/L', frequency: 'WEEK' },
        mg: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: 'g/L', frequency: 'WEEK' },
        so4: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'g/L', frequency: 'WEEK' },
      },
    },
    'pure-salt-sieve': {
      // Applied to Pure Salt Sieve Analysis — II SHIFT
      shift2: {
        p18: { target: 4, tolerance: 2, min: 2, max: 6, unit: '%', paramName: 'BSS 18', shift: 'II SHIFT' },
        bss18: { target: 4, tolerance: 2, min: 2, max: 6, unit: '%', paramName: 'BSS 18', shift: 'II SHIFT' },
        p44: { target: 16, tolerance: 5, min: 11, max: 21, unit: '%', paramName: 'BSS 44', shift: 'II SHIFT' },
        bss44: { target: 16, tolerance: 5, min: 11, max: 21, unit: '%', paramName: 'BSS 44', shift: 'II SHIFT' },
        p60: { target: 27, tolerance: 4, min: 23, max: 31, unit: '%', paramName: 'BSS 60', shift: 'II SHIFT' },
        bss60: { target: 27, tolerance: 4, min: 23, max: 31, unit: '%', paramName: 'BSS 60', shift: 'II SHIFT' },
        p100: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'BSS 100', shift: 'II SHIFT' },
        bss100: { target: 30, tolerance: 5, min: 25, max: 35, unit: '%', paramName: 'BSS 100', shift: 'II SHIFT' },
        m100: { target: 23, tolerance: 3, min: 20, max: 26, unit: '%', paramName: '-100', shift: 'II SHIFT' },
        '-100': { target: 23, tolerance: 3, min: 20, max: 26, unit: '%', paramName: '-100', shift: 'II SHIFT' },
      },
    },
    'tk203': {
      shiftTwice: {
        fnh3: { target: 3.14, tolerance: 0.10, min: 3.04, max: 3.24, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'SHIFT TWICE' },
        cnh3: { target: 3.94, tolerance: 0.10, min: 3.84, max: 4.04, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'SHIFT TWICE' },
        tcl: { target: 5.25, tolerance: 0.20, min: 5.05, max: 5.45, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'SHIFT TWICE' },
        pcl: { target: 1.31, tolerance: 0.10, min: 1.21, max: 1.41, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'SHIFT TWICE' },
      },
    },
    'tk204': {
      onceInAShift: {
        fnh3: { target: 3.09, tolerance: 0.10, min: 2.99, max: 3.19, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift' },
        cnh3: { target: 3.70, tolerance: 0.10, min: 3.60, max: 3.80, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift' },
        tcl: { target: 5.09, tolerance: 0.10, min: 4.99, max: 5.19, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift' },
        pcl: { target: 1.39, tolerance: 0.10, min: 1.29, max: 1.49, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift' },
      },
      shift: {
        fnh3: { target: 3.09, tolerance: 0.10, min: 2.99, max: 3.19, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift' },
        cnh3: { target: 3.70, tolerance: 0.10, min: 3.60, max: 3.80, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift' },
        tcl: { target: 5.09, tolerance: 0.10, min: 4.99, max: 5.19, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift' },
        pcl: { target: 1.39, tolerance: 0.10, min: 1.29, max: 1.49, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift' },
      },
    },
    'tk209': {
      // Applied strictly to ACL Plant - TK209 Analysis - Frequency: Once in a shift
      // FNH3: 0.58–0.78 Kgm/m³ (Target: 0.68 ±0.10)
      // CNH3: 2.26–2.46 Kgm/m³ (Target: 2.36 ±0.10)
      // TCL:  2.94–3.14 Kgm/m³ (Target: 3.04 ±0.10)
      // PCL:  0.58–0.78 Kgm/m³ (Target: 0.68 ±0.10)
      onceInAShift: {
        fnh3: { target: 0.68, tolerance: 0.10, min: 0.58, max: 0.78, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift', formattedRange: '0.58–0.78 Kgm/m³', formattedTarget: '0.68 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 2.36, tolerance: 0.10, min: 2.26, max: 2.46, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift', formattedRange: '2.26–2.46 Kgm/m³', formattedTarget: '2.36 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 3.04, tolerance: 0.10, min: 2.94, max: 3.14, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift', formattedRange: '2.94–3.14 Kgm/m³', formattedTarget: '3.04 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 0.68, tolerance: 0.10, min: 0.58, max: 0.78, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift', formattedRange: '0.58–0.78 Kgm/m³', formattedTarget: '0.68 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 0.68, tolerance: 0.10, min: 0.58, max: 0.78, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift', formattedRange: '0.58–0.78 Kgm/m³', formattedTarget: '0.68 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 2.36, tolerance: 0.10, min: 2.26, max: 2.46, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift', formattedRange: '2.26–2.46 Kgm/m³', formattedTarget: '2.36 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 3.04, tolerance: 0.10, min: 2.94, max: 3.14, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift', formattedRange: '2.94–3.14 Kgm/m³', formattedTarget: '3.04 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 0.68, tolerance: 0.10, min: 0.58, max: 0.78, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift', formattedRange: '0.58–0.78 Kgm/m³', formattedTarget: '0.68 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'bl1204-bl1203': {
      onceInAShift: {
        co2: { target: 15, tolerance: 1.0, min: 14, max: 16, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 6, tolerance: 1.0, min: 5, max: 7, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
      shift: {
        co2: { target: 15, tolerance: 1.0, min: 14, max: 16, unit: '%', paramName: 'CO2', frequency: 'Once in a shift' },
        o2: { target: 6, tolerance: 1.0, min: 5, max: 7, unit: '%', paramName: 'O2', frequency: 'Once in a shift' },
        co: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'CO', frequency: 'Once in a shift' },
      },
    },
    'tk205': {
      // Applied strictly to ACL Plant - TK205 Analysis - Frequency: SHIFT TWICE
      // FNH3: 3.07–3.27 Kgm/m³ (Target: 3.17 ±0.10)
      // CNH3: 1.88–2.08 Kgm/m³ (Target: 1.98 ±0.10)
      // TCL:  5.54–5.74 Kgm/m³ (Target: 5.64 ±0.10)
      // PCL:  3.56–3.76 Kgm/m³ (Target: 3.66 ±0.10)
      shiftTwice: {
        fnh3: { target: 3.17, tolerance: 0.10, min: 3.07, max: 3.27, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'SHIFT TWICE', formattedRange: '3.07–3.27 Kgm/m³', formattedTarget: '3.17 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.98, tolerance: 0.10, min: 1.88, max: 2.08, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'SHIFT TWICE', formattedRange: '1.88–2.08 Kgm/m³', formattedTarget: '1.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.64, tolerance: 0.10, min: 5.54, max: 5.74, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'SHIFT TWICE', formattedRange: '5.54–5.74 Kgm/m³', formattedTarget: '5.64 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.66, tolerance: 0.10, min: 3.56, max: 3.76, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'SHIFT TWICE', formattedRange: '3.56–3.76 Kgm/m³', formattedTarget: '3.66 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 3.17, tolerance: 0.10, min: 3.07, max: 3.27, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'SHIFT TWICE', formattedRange: '3.07–3.27 Kgm/m³', formattedTarget: '3.17 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.98, tolerance: 0.10, min: 1.88, max: 2.08, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'SHIFT TWICE', formattedRange: '1.88–2.08 Kgm/m³', formattedTarget: '1.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.64, tolerance: 0.10, min: 5.54, max: 5.74, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'SHIFT TWICE', formattedRange: '5.54–5.74 Kgm/m³', formattedTarget: '5.64 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.66, tolerance: 0.10, min: 3.56, max: 3.76, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'SHIFT TWICE', formattedRange: '3.56–3.76 Kgm/m³', formattedTarget: '3.66 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'tk207': {
      // Applied strictly to ACL Plant - TK207 Analysis - Frequency: SHIFT TWICE
      // FNH3: 3.92–4.12 Kgm/m³ (Target: 4.02 ±0.10)
      // CNH3: 1.82–2.02 Kgm/m³ (Target: 1.92 ±0.10)
      // TCL:  5.37–5.57 Kgm/m³ (Target: 5.47 ±0.10)
      // PCL:  3.45–3.65 Kgm/m³ (Target: 3.55 ±0.10)
      shiftTwice: {
        fnh3: { target: 4.02, tolerance: 0.10, min: 3.92, max: 4.12, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'SHIFT TWICE', formattedRange: '3.92–4.12 Kgm/m³', formattedTarget: '4.02 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.92, tolerance: 0.10, min: 1.82, max: 2.02, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'SHIFT TWICE', formattedRange: '1.82–2.02 Kgm/m³', formattedTarget: '1.92 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.47, tolerance: 0.10, min: 5.37, max: 5.57, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'SHIFT TWICE', formattedRange: '5.37–5.57 Kgm/m³', formattedTarget: '5.47 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.55, tolerance: 0.10, min: 3.45, max: 3.65, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'SHIFT TWICE', formattedRange: '3.45–3.65 Kgm/m³', formattedTarget: '3.55 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 4.02, tolerance: 0.10, min: 3.92, max: 4.12, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'SHIFT TWICE', formattedRange: '3.92–4.12 Kgm/m³', formattedTarget: '4.02 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.92, tolerance: 0.10, min: 1.82, max: 2.02, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'SHIFT TWICE', formattedRange: '1.82–2.02 Kgm/m³', formattedTarget: '1.92 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.47, tolerance: 0.10, min: 5.37, max: 5.57, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'SHIFT TWICE', formattedRange: '5.37–5.57 Kgm/m³', formattedTarget: '5.47 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.55, tolerance: 0.10, min: 3.45, max: 3.65, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'SHIFT TWICE', formattedRange: '3.45–3.65 Kgm/m³', formattedTarget: '3.55 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'cr202': {
      // Applied strictly to ACL Plant - CR202 Analysis - Frequency: Once in a shift
      // FNH3: 3.00–3.20 Kgm/m³ (Target: 3.10 ±0.10)
      // CNH3: 2.88–3.08 Kgm/m³ (Target: 2.98 ±0.10)
      // TCL:  4.55–4.75 Kgm/m³ (Target: 4.65 ±0.10)
      // PCL:  1.80–2.00 Kgm/m³ (Target: 1.90 ±0.10)
      onceInAShift: {
        fnh3: { target: 3.10, tolerance: 0.10, min: 3.00, max: 3.20, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift', formattedRange: '3.00–3.20 Kgm/m³', formattedTarget: '3.10 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 2.98, tolerance: 0.10, min: 2.88, max: 3.08, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift', formattedRange: '2.88–3.08 Kgm/m³', formattedTarget: '2.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 4.65, tolerance: 0.10, min: 4.55, max: 4.75, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift', formattedRange: '4.55–4.75 Kgm/m³', formattedTarget: '4.65 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.90, tolerance: 0.10, min: 1.80, max: 2.00, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift', formattedRange: '1.80–2.00 Kgm/m³', formattedTarget: '1.90 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 3.10, tolerance: 0.10, min: 3.00, max: 3.20, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift', formattedRange: '3.00–3.20 Kgm/m³', formattedTarget: '3.10 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 2.98, tolerance: 0.10, min: 2.88, max: 3.08, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift', formattedRange: '2.88–3.08 Kgm/m³', formattedTarget: '2.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 4.65, tolerance: 0.10, min: 4.55, max: 4.75, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift', formattedRange: '4.55–4.75 Kgm/m³', formattedTarget: '4.65 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.90, tolerance: 0.10, min: 1.80, max: 2.00, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift', formattedRange: '1.80–2.00 Kgm/m³', formattedTarget: '1.90 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'cr203': {
      // Applied strictly to ACL Plant - CR203 Analysis - Frequency: Once in a shift
      // FNH3: 3.07–3.27 Kgm/m³ (Target: 3.17 ±0.10)
      // CNH3: 1.88–2.08 Kgm/m³ (Target: 1.98 ±0.10)
      // TCL:  5.54–5.74 Kgm/m³ (Target: 5.64 ±0.10)
      // PCL:  3.56–3.76 Kgm/m³ (Target: 3.66 ±0.10)
      onceInAShift: {
        fnh3: { target: 3.17, tolerance: 0.10, min: 3.07, max: 3.27, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift', formattedRange: '3.07–3.27 Kgm/m³', formattedTarget: '3.17 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.98, tolerance: 0.10, min: 1.88, max: 2.08, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift', formattedRange: '1.88–2.08 Kgm/m³', formattedTarget: '1.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.64, tolerance: 0.10, min: 5.54, max: 5.74, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift', formattedRange: '5.54–5.74 Kgm/m³', formattedTarget: '5.64 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.66, tolerance: 0.10, min: 3.56, max: 3.76, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift', formattedRange: '3.56–3.76 Kgm/m³', formattedTarget: '3.66 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 3.17, tolerance: 0.10, min: 3.07, max: 3.27, unit: 'Kgm/m³', paramName: 'FNH3', frequency: 'Once in a shift', formattedRange: '3.07–3.27 Kgm/m³', formattedTarget: '3.17 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.98, tolerance: 0.10, min: 1.88, max: 2.08, unit: 'Kgm/m³', paramName: 'CNH3', frequency: 'Once in a shift', formattedRange: '1.88–2.08 Kgm/m³', formattedTarget: '1.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.64, tolerance: 0.10, min: 5.54, max: 5.74, unit: 'Kgm/m³', paramName: 'TCL', frequency: 'Once in a shift', formattedRange: '5.54–5.74 Kgm/m³', formattedTarget: '5.64 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.66, tolerance: 0.10, min: 3.56, max: 3.76, unit: 'Kgm/m³', paramName: 'PCL', frequency: 'Once in a shift', formattedRange: '3.56–3.76 Kgm/m³', formattedTarget: '3.66 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'pcl-tcl': {
      // Applied strictly to ACL Plant - PCL/TCL Analysis - Frequency: Once in a shift
      // Parameter: PCL/TCL: 0.05–0.10 Kgm/m³ +0.2 / -0.02
      // Allowed range: 0.03–0.30 Kgm/m³
      onceInAShift: {
        pcltcl: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        a: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        b: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        c: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        d: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        e: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        f: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        g: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        h: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
      },
      shift: {
        pcltcl: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        a: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        b: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        c: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        d: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        e: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        f: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        g: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
        h: { target: 0.10, tolerance: 0.20, min: 0.03, max: 0.30, unit: 'Kgm/m³', paramName: 'PCL/TCL', label: 'PCL/TCL', frequency: 'Once in a shift', formattedRange: '0.03–0.30 Kgm/m³', formattedTarget: '0.05–0.10 Kgm/m³', formattedTolerance: '+0.2 / -0.02', notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02' },
      },
    },
    'acl-product': {
      day: {
        nh4cl: { target: 97.0, tolerance: 0.5, min: 96.5, max: 97.5, unit: '%', paramName: 'NH4Cl', frequency: 'Day' },
        nacl: { target: 2.0, tolerance: 0.1, min: 1.9, max: 2.1, unit: '%', paramName: 'NaCl', frequency: 'Day' },
        fe2o3: { target: 0.013, tolerance: 0.005, min: 0.008, max: 0.018, unit: '%', paramName: 'Fe2O3', frequency: 'Day' },
        h2o: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'H2O', frequency: 'Day' },
        ir: { target: 0.30, tolerance: 0.10, min: 0.20, max: 0.40, unit: '%', paramName: 'IR', frequency: 'Day' },
        bd: { target: 1000, tolerance: 0.10, min: 999.9, max: 1000.1, unit: 'g/L', paramName: 'BD', frequency: 'Day' },
      },
      composition: {
        nh4cl: { target: 97.0, tolerance: 0.5, min: 96.5, max: 97.5, unit: '%', paramName: 'NH4Cl', frequency: 'Day' },
        nacl: { target: 2.0, tolerance: 0.1, min: 1.9, max: 2.1, unit: '%', paramName: 'NaCl', frequency: 'Day' },
        fe2o3: { target: 0.013, tolerance: 0.005, min: 0.008, max: 0.018, unit: '%', paramName: 'Fe2O3', frequency: 'Day' },
        h2o: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'H2O', frequency: 'Day' },
        ir: { target: 0.30, tolerance: 0.10, min: 0.20, max: 0.40, unit: '%', paramName: 'IR', frequency: 'Day' },
        bd: { target: 1000, tolerance: 0.10, min: 999.9, max: 1000.1, unit: 'g/L', paramName: 'BD', frequency: 'Day' },
      },
    },
    'acl-300': {
      onceInAShift: {
        nacl: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'NaCl', frequency: 'Once in a shift' },
        bss18: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: '%', paramName: 'BSS 18', frequency: 'Once in a shift' },
        bss44: { target: 60, tolerance: 5, min: 55, max: 65, unit: '%', paramName: 'BSS 44', frequency: 'Once in a shift' },
      },
      shift: {
        nacl: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'NaCl', frequency: 'Once in a shift' },
        bss18: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: '%', paramName: 'BSS 18', frequency: 'Once in a shift' },
        bss44: { target: 60, tolerance: 5, min: 55, max: 65, unit: '%', paramName: 'BSS 44', frequency: 'Once in a shift' },
      },
      shift1: {
        nacl: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'NaCl', frequency: 'Once in a shift' },
        bss18: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: '%', paramName: 'BSS 18', frequency: 'Once in a shift' },
        bss44: { target: 60, tolerance: 5, min: 55, max: 65, unit: '%', paramName: 'BSS 44', frequency: 'Once in a shift' },
      },
      shift2: {
        nacl: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'NaCl', frequency: 'Once in a shift' },
        bss18: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: '%', paramName: 'BSS 18', frequency: 'Once in a shift' },
        bss44: { target: 60, tolerance: 5, min: 55, max: 65, unit: '%', paramName: 'BSS 44', frequency: 'Once in a shift' },
      },
      shift3: {
        nacl: { target: 2.0, tolerance: 0.10, min: 1.90, max: 2.10, unit: '%', paramName: 'NaCl', frequency: 'Once in a shift' },
        bss18: { target: 5, tolerance: 1.0, min: 4, max: 6, unit: '%', paramName: 'BSS 18', frequency: 'Once in a shift' },
        bss44: { target: 60, tolerance: 5, min: 55, max: 65, unit: '%', paramName: 'BSS 44', frequency: 'Once in a shift' },
      },
    },
    'raw-salt': {
      day: {
        nacl: { target: 91.0, tolerance: 1.0, min: 90.0, max: 92.0, unit: '%', paramName: 'NaCl', frequency: 'Day' },
        ca: { target: 0.24, tolerance: 0.10, min: 0.14, max: 0.34, unit: '%', paramName: 'Ca', frequency: 'Day' },
        mg: { target: 0.45, tolerance: 0.10, min: 0.35, max: 0.55, unit: '%', paramName: 'Mg', frequency: 'Day' },
        so4: { target: 1.00, tolerance: 0.10, min: 0.90, max: 1.10, unit: '%', paramName: 'SO4', frequency: 'Day' },
        ir: { target: 0.60, tolerance: 0.10, min: 0.50, max: 0.70, unit: '%', paramName: 'IR', frequency: 'Day' },
        h2o: { target: 7.0, tolerance: 1.0, min: 6.0, max: 8.0, unit: '%', paramName: 'H2O', frequency: 'Day' },
      },
      composition: {
        nacl: { target: 91.0, tolerance: 1.0, min: 90.0, max: 92.0, unit: '%', paramName: 'NaCl', frequency: 'Day' },
        ca: { target: 0.24, tolerance: 0.10, min: 0.14, max: 0.34, unit: '%', paramName: 'Ca', frequency: 'Day' },
        mg: { target: 0.45, tolerance: 0.10, min: 0.35, max: 0.55, unit: '%', paramName: 'Mg', frequency: 'Day' },
        so4: { target: 1.00, tolerance: 0.10, min: 0.90, max: 1.10, unit: '%', paramName: 'SO4', frequency: 'Day' },
        ir: { target: 0.60, tolerance: 0.10, min: 0.50, max: 0.70, unit: '%', paramName: 'IR', frequency: 'Day' },
        h2o: { target: 7.0, tolerance: 1.0, min: 6.0, max: 8.0, unit: '%', paramName: 'H2O', frequency: 'Day' },
      },
    },
    'cacl2': {
      // Applied strictly to ACL Plant - CaCl2 Analysis - Frequency: Day
      // 1. pH: Reference 7.7, Tolerance ±1, Valid Range: 6.7 – 8.7
      // 2. CONC: Reference 20%, Tolerance ±5.0, Valid Range: 15% – 25%
      // 3. FNH3: Reference 1000 PPM, Tolerance ±50, Valid Range: 950 – 1050 PPM
      // 4. CNH3: Reference 500 PPM, Tolerance ±100, Valid Range: 400 – 600 PPM
      // 5. SS: Reference 60 PPM, Tolerance ±10, Valid Range: 50 – 70 PPM
      day: {
        ph: { target: 7.7, tolerance: 1.0, min: 6.7, max: 8.7, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', formattedRange: '6.7 – 8.7', formattedTarget: '7.7', formattedTolerance: '±1', referenceDisplay: '7.7 ± 1 (6.7 – 8.7)' },
        conc: { target: 20, tolerance: 5.0, min: 15, max: 25, unit: '%', paramName: 'CONC', label: 'CONC', frequency: 'Day', formattedRange: '15% – 25%', formattedTarget: '20%', formattedTolerance: '±5.0%', referenceDisplay: '20% ± 5.0% (15% – 25%)' },
        fnh3: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'FNH3', label: 'FNH₃', frequency: 'Day', formattedRange: '950 – 1050 PPM', formattedTarget: '1000 PPM', formattedTolerance: '±50 PPM', referenceDisplay: '1000 ± 50 PPM (950 – 1050 PPM)' },
        cnh3: { target: 500, tolerance: 100, min: 400, max: 600, unit: 'PPM', paramName: 'CNH3', label: 'CNH₃', frequency: 'Day', formattedRange: '400 – 600 PPM', formattedTarget: '500 PPM', formattedTolerance: '±100 PPM', referenceDisplay: '500 ± 100 PPM (400 – 600 PPM)' },
        ss: { target: 60, tolerance: 10, min: 50, max: 70, unit: 'PPM', paramName: 'SS', label: 'SS', frequency: 'Day', formattedRange: '50 – 70 PPM', formattedTarget: '60 PPM', formattedTolerance: '±10 PPM', referenceDisplay: '60 ± 10 PPM (50 – 70 PPM)' },
      },
    },
  },

  sa: {
    'tk401': {
      // Applied strictly to SA Plant - TK 401 Analysis - Frequency: Once in a shift (I Shift, II Shift, III Shift)
      // Unit: strictly Kgm/m³
      // 1. FNH3: Reference: 3.97 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.87–4.07 Kgm/m³
      // 2. CNH3: Reference: 1.92 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.82–2.02 Kgm/m³
      // 3. TCL:  Reference: 5.47 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.37–5.57 Kgm/m³
      // 4. PCL:  Reference: 3.55 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.45–3.65 Kgm/m³
      // 5. TCAO: Listed parameter without limits. No validation limit applied.
      onceInAShift: {
        fnh3: { target: 3.97, tolerance: 0.10, min: 3.87, max: 4.07, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '3.87–4.07 Kgm/m³', formattedTarget: '3.97 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.92, tolerance: 0.10, min: 1.82, max: 2.02, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '1.82–2.02 Kgm/m³', formattedTarget: '1.92 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.47, tolerance: 0.10, min: 5.37, max: 5.57, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.37–5.57 Kgm/m³', formattedTarget: '5.47 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.55, tolerance: 0.10, min: 3.45, max: 3.65, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '3.45–3.65 Kgm/m³', formattedTarget: '3.55 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 3.97, tolerance: 0.10, min: 3.87, max: 4.07, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '3.87–4.07 Kgm/m³', formattedTarget: '3.97 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.92, tolerance: 0.10, min: 1.82, max: 2.02, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '1.82–2.02 Kgm/m³', formattedTarget: '1.92 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.47, tolerance: 0.10, min: 5.37, max: 5.57, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.37–5.57 Kgm/m³', formattedTarget: '5.47 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.55, tolerance: 0.10, min: 3.45, max: 3.65, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '3.45–3.65 Kgm/m³', formattedTarget: '3.55 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'tk405': {
      // Applied strictly to SA Plant - TK 405 Analysis - Frequency: Once in a shift (I Shift, II Shift, III Shift)
      // Unit: strictly Kgm/m³
      // 1. FNH3: Reference: 3.86 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.76–3.96 Kgm/m³
      // 2. CNH3: Reference: 1.89 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.79–1.99 Kgm/m³
      // 3. TCL:  Reference: 5.39 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.29–5.49 Kgm/m³
      // 4. PCL:  Reference: 3.50 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.40–3.60 Kgm/m³
      // 5. TCAO: Listed parameter without limits. No validation limit applied.
      onceInAShift: {
        fnh3: { target: 3.86, tolerance: 0.10, min: 3.76, max: 3.96, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '3.76–3.96 Kgm/m³', formattedTarget: '3.86 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.89, tolerance: 0.10, min: 1.79, max: 1.99, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '1.79–1.99 Kgm/m³', formattedTarget: '1.89 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.39, tolerance: 0.10, min: 5.29, max: 5.49, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.29–5.49 Kgm/m³', formattedTarget: '5.39 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.50, tolerance: 0.10, min: 3.40, max: 3.60, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '3.40–3.60 Kgm/m³', formattedTarget: '3.50 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 3.86, tolerance: 0.10, min: 3.76, max: 3.96, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '3.76–3.96 Kgm/m³', formattedTarget: '3.86 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 1.89, tolerance: 0.10, min: 1.79, max: 1.99, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '1.79–1.99 Kgm/m³', formattedTarget: '1.89 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.39, tolerance: 0.10, min: 5.29, max: 5.49, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.29–5.49 Kgm/m³', formattedTarget: '5.39 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 3.50, tolerance: 0.10, min: 3.40, max: 3.60, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '3.40–3.60 Kgm/m³', formattedTarget: '3.50 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'tk414': {
      // Applied strictly to SA Plant - TK 414 (TK 414 TSC TANK) Analysis - Frequency: Once in a shift (I Shift, II Shift, III Shift)
      // Unit: strictly Kgm/m³
      // 1. FNH3: Reference: 1.40 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.30–1.50 Kgm/m³
      // 2. CNH3: Reference: 4.10 Kgm/m³, Tolerance: ±0.10, Valid Range: 4.00–4.20 Kgm/m³
      // 3. TCL:  Reference: 5.46 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.36–5.56 Kgm/m³
      // 4. PCL:  Reference: 1.36 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.26–1.46 Kgm/m³
      onceInAShift: {
        fnh3: { target: 1.40, tolerance: 0.10, min: 1.30, max: 1.50, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '1.30–1.50 Kgm/m³', formattedTarget: '1.40 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.10, tolerance: 0.10, min: 4.00, max: 4.20, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '4.00–4.20 Kgm/m³', formattedTarget: '4.10 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.46, tolerance: 0.10, min: 5.36, max: 5.56, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.36–5.56 Kgm/m³', formattedTarget: '5.46 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.36, tolerance: 0.10, min: 1.26, max: 1.46, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '1.26–1.46 Kgm/m³', formattedTarget: '1.36 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 1.40, tolerance: 0.10, min: 1.30, max: 1.50, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '1.30–1.50 Kgm/m³', formattedTarget: '1.40 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.10, tolerance: 0.10, min: 4.00, max: 4.20, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '4.00–4.20 Kgm/m³', formattedTarget: '4.10 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.46, tolerance: 0.10, min: 5.36, max: 5.56, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.36–5.56 Kgm/m³', formattedTarget: '5.46 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.36, tolerance: 0.10, min: 1.26, max: 1.46, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '1.26–1.46 Kgm/m³', formattedTarget: '1.36 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'p413': {
      // Applied strictly to SA Plant - P413 (P413 WSC TANK) Analysis - Frequency: Once in a shift (I Shift, II Shift, III Shift)
      // Unit: strictly Kgm/m³
      // 1. FNH3: Reference: 1.58 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.48–1.68 Kgm/m³
      // 2. CNH3: Reference: 4.09 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.99–4.19 Kgm/m³
      // 3. TCL:  Reference: 5.45 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.35–5.55 Kgm/m³
      // 4. PCL:  Reference: 1.36 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.26–1.46 Kgm/m³
      onceInAShift: {
        fnh3: { target: 1.58, tolerance: 0.10, min: 1.48, max: 1.68, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '1.48–1.68 Kgm/m³', formattedTarget: '1.58 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.09, tolerance: 0.10, min: 3.99, max: 4.19, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '3.99–4.19 Kgm/m³', formattedTarget: '4.09 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.45, tolerance: 0.10, min: 5.35, max: 5.55, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.35–5.55 Kgm/m³', formattedTarget: '5.45 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.36, tolerance: 0.10, min: 1.26, max: 1.46, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '1.26–1.46 Kgm/m³', formattedTarget: '1.36 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 1.58, tolerance: 0.10, min: 1.48, max: 1.68, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '1.48–1.68 Kgm/m³', formattedTarget: '1.58 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.09, tolerance: 0.10, min: 3.99, max: 4.19, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '3.99–4.19 Kgm/m³', formattedTarget: '4.09 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.45, tolerance: 0.10, min: 5.35, max: 5.55, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.35–5.55 Kgm/m³', formattedTarget: '5.45 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.36, tolerance: 0.10, min: 1.26, max: 1.46, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '1.26–1.46 Kgm/m³', formattedTarget: '1.36 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'tk419': {
      // Applied strictly to SA Plant - TK419 (TK 419 SC TANK) Analysis - Frequency: Once in a shift (I Shift, II Shift, III Shift)
      // Unit: strictly Kgm/m³
      // 1. FNH3: Reference: 2.08 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.98–2.18 Kgm/m³
      // 2. CNH3: Reference: 4.06 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.96–4.16 Kgm/m³
      // 3. TCL:  Reference: 5.41 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.31–5.51 Kgm/m³
      // 4. PCL:  Reference: 1.35 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.25–1.45 Kgm/m³
      onceInAShift: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.06, tolerance: 0.10, min: 3.96, max: 4.16, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '3.96–4.16 Kgm/m³', formattedTarget: '4.06 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.41, tolerance: 0.10, min: 5.31, max: 5.51, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.31–5.51 Kgm/m³', formattedTarget: '5.41 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.35, tolerance: 0.10, min: 1.25, max: 1.45, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '1.25–1.45 Kgm/m³', formattedTarget: '1.35 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a shift', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.06, tolerance: 0.10, min: 3.96, max: 4.16, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a shift', formattedRange: '3.96–4.16 Kgm/m³', formattedTarget: '4.06 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.41, tolerance: 0.10, min: 5.31, max: 5.51, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a shift', formattedRange: '5.31–5.51 Kgm/m³', formattedTarget: '5.41 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.35, tolerance: 0.10, min: 1.25, max: 1.45, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a shift', formattedRange: '1.25–1.45 Kgm/m³', formattedTarget: '1.35 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'p417': {
      // Applied strictly to SA Plant - P417 / P417-1 Analysis - Frequency: Shift Twice
      // Unit: strictly Kgm/m³
      // 1. FNH3: Reference: 2.08 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.98–2.18 Kgm/m³
      shiftTwice: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Shift Twice', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Shift Twice', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      onceInAShift: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Shift Twice', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'p417-1': {
      shiftTwice: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Shift Twice', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Shift Twice', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      onceInAShift: {
        fnh3: { target: 2.08, tolerance: 0.10, min: 1.98, max: 2.18, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Shift Twice', formattedRange: '1.98–2.18 Kgm/m³', formattedTarget: '2.08 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    't401': {
      // Applied strictly to SA Plant - T 401 (Tower 401 Units A-F) Analysis - Frequency: Once in a shift
      // Options A, B, C, D, E, F all share the same parameter limits:
      // 1. FNH3: Reference: 0.98 Kgm/m³, Tolerance: ±0.10, Valid Range: 0.88–1.08 Kgm/m³
      // 2. CNH3: Reference: 4.50 Kgm/m³, Tolerance: ±0.10, Valid Range: 4.40–4.60 Kgm/m³
      // 3. TCL:  Reference: 5.80 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.70–5.90 Kgm/m³
      // 4. PCL:  Reference: 1.12 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.02–1.22 Kgm/m³
      onceInAShift: {
        fnh3: { target: 0.98, tolerance: 0.10, min: 0.88, max: 1.08, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '0.88–1.08 Kgm/m³', formattedTarget: '0.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.50, tolerance: 0.10, min: 4.40, max: 4.60, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a Shift', formattedRange: '4.40–4.60 Kgm/m³', formattedTarget: '4.50 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.80, tolerance: 0.10, min: 5.70, max: 5.90, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a Shift', formattedRange: '5.70–5.90 Kgm/m³', formattedTarget: '5.80 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.12, tolerance: 0.10, min: 1.02, max: 1.22, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a Shift', formattedRange: '1.02–1.22 Kgm/m³', formattedTarget: '1.12 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 0.98, tolerance: 0.10, min: 0.88, max: 1.08, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '0.88–1.08 Kgm/m³', formattedTarget: '0.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.50, tolerance: 0.10, min: 4.40, max: 4.60, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a Shift', formattedRange: '4.40–4.60 Kgm/m³', formattedTarget: '4.50 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.80, tolerance: 0.10, min: 5.70, max: 5.90, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a Shift', formattedRange: '5.70–5.90 Kgm/m³', formattedTarget: '5.80 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.12, tolerance: 0.10, min: 1.02, max: 1.22, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a Shift', formattedRange: '1.02–1.22 Kgm/m³', formattedTarget: '1.12 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    't-401': {
      onceInAShift: {
        fnh3: { target: 0.98, tolerance: 0.10, min: 0.88, max: 1.08, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '0.88–1.08 Kgm/m³', formattedTarget: '0.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.50, tolerance: 0.10, min: 4.40, max: 4.60, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a Shift', formattedRange: '4.40–4.60 Kgm/m³', formattedTarget: '4.50 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.80, tolerance: 0.10, min: 5.70, max: 5.90, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a Shift', formattedRange: '5.70–5.90 Kgm/m³', formattedTarget: '5.80 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.12, tolerance: 0.10, min: 1.02, max: 1.22, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a Shift', formattedRange: '1.02–1.22 Kgm/m³', formattedTarget: '1.12 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
      shift: {
        fnh3: { target: 0.98, tolerance: 0.10, min: 0.88, max: 1.08, unit: 'Kgm/m³', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '0.88–1.08 Kgm/m³', formattedTarget: '0.98 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        cnh3: { target: 4.50, tolerance: 0.10, min: 4.40, max: 4.60, unit: 'Kgm/m³', paramName: 'CNH3', label: 'CNH₃', frequency: 'Once in a Shift', formattedRange: '4.40–4.60 Kgm/m³', formattedTarget: '4.50 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        tcl: { target: 5.80, tolerance: 0.10, min: 5.70, max: 5.90, unit: 'Kgm/m³', paramName: 'TCL', label: 'TCl', frequency: 'Once in a Shift', formattedRange: '5.70–5.90 Kgm/m³', formattedTarget: '5.80 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
        pcl: { target: 1.12, tolerance: 0.10, min: 1.02, max: 1.22, unit: 'Kgm/m³', paramName: 'PCL', label: 'PCl', frequency: 'Once in a Shift', formattedRange: '1.02–1.22 Kgm/m³', formattedTarget: '1.12 Kgm/m³', formattedTolerance: '±0.10 Kgm/m³' },
      },
    },
    'bicarbonate-moisture': {
      // Applied strictly to SA Plant - Bi Carbonate Moisture Analysis - Frequency: Once in 4 Hours
      // Parameter: Moisture (Options A, B, C)
      // Reference Value: 20%, Tolerance: ±2.0%, Valid Range: 18% – 22%
      onceIn4Hours: {
        m404_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturea: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moistureb: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturec: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture', label: 'Moisture', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
      },
      shift: {
        m404_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturea: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moistureb: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturec: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture', label: 'Moisture', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
      },
    },
    'bi-carbonate-moisture': {
      onceIn4Hours: {
        m404_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturea: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moistureb: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturec: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture', label: 'Moisture', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
      },
      shift: {
        m404_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        m404c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture_c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturea: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moistureb: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisturec: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        moisture: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture', label: 'Moisture', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        a: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option A', label: 'Option A', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        b: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option B', label: 'Option B', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
        c: { target: 20, tolerance: 2.0, min: 18, max: 22, unit: '%', paramName: 'Moisture Option C', label: 'Option C', frequency: 'Once in 4 Hours', formattedRange: '18% – 22%', formattedTarget: '20%', formattedTolerance: '±2.0%' },
      },
    },
    'lsa': {
      // Applied strictly to SA Plant - LSA Shift Analysis - Frequency: Once in a Shift
      // Parameters: Na2CO3, NaCl, Fe2O3 (Fe), Na2SO4, VM, IR, BD, Turbidity
      onceInAShift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
      shift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
    },
    'lsa-shift': {
      onceInAShift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
      shift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
        trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
    },
    'e501': {
      // Applied strictly to SA Plant - E 501 Analysis - Frequency: Once in a Shift
      // FNH3: Direct valid range: 10 – 40 g/L (NOT a ± tolerance)
      // Na2CO3: Direct valid range: 2 – 10 g/L (NOT a ± tolerance)
      onceInAShift: {
        fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
        na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
      },
      shift: {
        fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
        na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
      },
    },
    't501': {
      // Applied strictly to SA Plant - T 501 Analysis - Frequency: Once in a Shift
      // FNH3: Direct valid range: 1 – 5 g/L (NOT a ± tolerance)
      // Na2CO3: Direct valid range: 20 – 60 g/L (NOT a ± tolerance)
      onceInAShift: {
        fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
        na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
      },
      shift: {
        fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
        na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
      },
    },
    'e501-t501': {
      // Applied to SA Plant - E 501 / T 501 combined view - Frequency: Once in a Shift
      // Option-specific parameter mapping: E501 and T501 are strictly kept separate
      onceInAShift: {
        e501_fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'E501 FNH3', label: 'E501 FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
        e501_na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'E501 Na2CO3', label: 'E501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
        t501_fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'T501 FNH3', label: 'T501 FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
        t501_na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'T501 Na2CO3', label: 'T501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
        e501fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'E501 FNH3', label: 'E501 FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
        e501na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'E501 Na2CO3', label: 'E501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
        t501fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'T501 FNH3', label: 'T501 FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
        t501na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'T501 Na2CO3', label: 'T501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
      },
      shift: {
        e501_fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'E501 FNH3', label: 'E501 FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
        e501_na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'E501 Na2CO3', label: 'E501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
        t501_fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'T501 FNH3', label: 'T501 FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
        t501_na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'T501 Na2CO3', label: 'T501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
        e501fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'E501 FNH3', label: 'E501 FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
        e501na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'E501 Na2CO3', label: 'E501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
        t501fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'T501 FNH3', label: 'T501 FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
        t501na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'T501 Na2CO3', label: 'T501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
      },
    },
    'lsa-bagging': {
      // Applied to SA Plant - LSA Bagging Analysis
      // Frequency 1: Once in a Shift (all 8 parameters)
      onceInAShift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2Co3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'Nacl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2so4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'TURBIDITY', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
      shift: {
        na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2Co3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'Nacl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
        na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2so4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
        vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
        ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
        turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'TURBIDITY', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
      },
      // Frequency 2: Once in 1 Hour (ONLY Nacl and BD)
      onceIn1Hour: {
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'Nacl', label: 'NaCl', frequency: '1 Hour Once', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: '1 Hour Once', formattedRange: '500 – 750 g/L' },
      },
      hourly: {
        nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'Nacl', label: 'NaCl', frequency: '1 Hour Once', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
        bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: '1 Hour Once', formattedRange: '500 – 750 g/L' },
      },
    },
    'lsa-bagging-sieve': {
      // Applied strictly to SA Plant - LSA Bagging Sieve Analysis - Frequency: 1 Hour Once
      // Reference limits provided ONLY for BSS 30 and BSS 60. No limits for BSS 10 or -30.
      onceIn1Hour: {
        bss30: { target: 2, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 1.5, max: 2.0, unit: '%', paramName: 'BSS 30', label: 'BSS 30', frequency: '1 Hour Once', formattedRange: '1.5% – 2.0%', formattedTarget: '2%', formattedTolerance: '+0.0 / -0.5' },
        bss60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
        p30: { target: 2, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 1.5, max: 2.0, unit: '%', paramName: 'BSS 30', label: 'BSS 30', frequency: '1 Hour Once', formattedRange: '1.5% – 2.0%', formattedTarget: '2%', formattedTolerance: '+0.0 / -0.5' },
        p60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
        m60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
      },
      hourly: {
        bss30: { target: 2, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 1.5, max: 2.0, unit: '%', paramName: 'BSS 30', label: 'BSS 30', frequency: '1 Hour Once', formattedRange: '1.5% – 2.0%', formattedTarget: '2%', formattedTolerance: '+0.0 / -0.5' },
        bss60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
        p30: { target: 2, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 1.5, max: 2.0, unit: '%', paramName: 'BSS 30', label: 'BSS 30', frequency: '1 Hour Once', formattedRange: '1.5% – 2.0%', formattedTarget: '2%', formattedTolerance: '+0.0 / -0.5' },
        p60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
        m60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
      },
    },
    'gas-conc': {
      // Applied strictly to SA Plant - Gas Conc. Analysis - Frequency: Once in a Shift
      // Three separate locations with Conc. parameter:
      // 1. RECOVERY GAS: Target 80%, Tolerance ±5.0% -> Valid Range: 75% – 85%
      // 2. BOTTOM GAS: Target 85%, Tolerance ±5.0% -> Valid Range: 80% – 90%
      // 3. CLEANING GAS: Target 10%, Tolerance ±1.0% -> Valid Range: 9% – 11%
      onceInAShift: {
        recoveryco2con: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: '%', paramName: 'Conc.', location: 'Recovery Gas', label: 'Recovery Gas Conc.', frequency: 'Once in a Shift', formattedRange: '75% – 85%', formattedTarget: '80%', formattedTolerance: '±5.0%' },
        recoverygas: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: '%', paramName: 'Conc.', location: 'Recovery Gas', label: 'Recovery Gas Conc.', frequency: 'Once in a Shift', formattedRange: '75% – 85%', formattedTarget: '80%', formattedTolerance: '±5.0%' },
        recoveryco2: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: '%', paramName: 'Conc.', location: 'Recovery Gas', label: 'Recovery Gas Conc.', frequency: 'Once in a Shift', formattedRange: '75% – 85%', formattedTarget: '80%', formattedTolerance: '±5.0%' },
        bottomgas: { target: 85, tolerance: 5.0, min: 80, max: 90, unit: '%', paramName: 'Conc.', location: 'Bottom Gas', label: 'Bottom Gas Conc.', frequency: 'Once in a Shift', formattedRange: '80% – 90%', formattedTarget: '85%', formattedTolerance: '±5.0%' },
        cleaninggas: { target: 10, tolerance: 1.0, min: 9, max: 11, unit: '%', paramName: 'Conc.', location: 'Cleaning Gas', label: 'Cleaning Gas Conc.', frequency: 'Once in a Shift', formattedRange: '9% – 11%', formattedTarget: '10%', formattedTolerance: '±1.0%' },
      },
      shift: {
        recoveryco2con: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: '%', paramName: 'Conc.', location: 'Recovery Gas', label: 'Recovery Gas Conc.', frequency: 'Once in a Shift', formattedRange: '75% – 85%', formattedTarget: '80%', formattedTolerance: '±5.0%' },
        recoverygas: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: '%', paramName: 'Conc.', location: 'Recovery Gas', label: 'Recovery Gas Conc.', frequency: 'Once in a Shift', formattedRange: '75% – 85%', formattedTarget: '80%', formattedTolerance: '±5.0%' },
        recoveryco2: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: '%', paramName: 'Conc.', location: 'Recovery Gas', label: 'Recovery Gas Conc.', frequency: 'Once in a Shift', formattedRange: '75% – 85%', formattedTarget: '80%', formattedTolerance: '±5.0%' },
        bottomgas: { target: 85, tolerance: 5.0, min: 80, max: 90, unit: '%', paramName: 'Conc.', location: 'Bottom Gas', label: 'Bottom Gas Conc.', frequency: 'Once in a Shift', formattedRange: '80% – 90%', formattedTarget: '85%', formattedTolerance: '±5.0%' },
        cleaninggas: { target: 10, tolerance: 1.0, min: 9, max: 11, unit: '%', paramName: 'Conc.', location: 'Cleaning Gas', label: 'Cleaning Gas Conc.', frequency: 'Once in a Shift', formattedRange: '9% – 11%', formattedTarget: '10%', formattedTolerance: '±1.0%' },
      },
    },
  },
  offset: {
    cbd: {
      day: {
        ph: { min: 10.5, max: 11, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '10.5 – 11', referenceDisplay: 'Direct Range: 10.5 – 11' },
        po4: { min: 30, max: 70, unit: 'ppm', paramName: 'PO4', label: 'PO4', frequency: 'Day', isDirectRange: true, formattedRange: '30 – 70 ppm', referenceDisplay: 'Direct Range: 30 – 70 ppm' },
        na2so3: { min: 20, max: 30, unit: 'ppm', paramName: 'Na2SO3', label: 'Na2SO3', frequency: 'Day', isDirectRange: true, formattedRange: '20 – 30 ppm', referenceDisplay: 'Direct Range: 20 – 30 ppm' },
        talk: { target: 200, tolerance: 10, min: 190, max: 210, unit: 'ppm', paramName: 'T.Alk', frequency: 'Day' },
        sio2: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'ppm', paramName: 'SiO2', frequency: 'Day' },
        tfe: { target: 5, tolerance: 5, min: 0, max: 10, unit: 'ppm', paramName: 'T.Fe', frequency: 'Day' },
        tds: { target: 2000, tolerance: 50, min: 1950, max: 2050, unit: 'ppm', paramName: 'TDS', frequency: 'Day' },
        ss: { target: 20, tolerance: 5, min: 15, max: 25, unit: 'ppm', paramName: 'SS', frequency: 'Day' },
      },
    },
    'raw-water': {
      day: {
        ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
        cond: { target: 600, tolerance: 50, min: 550, max: 650, unit: 'umho/cm', paramName: 'Cond', frequency: 'Day' },
        turbidity: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'NTU', paramName: 'Turbidity', frequency: 'Day' },
        fe: { target: 0.10, tolerance: 5, min: -4.90, max: 5.10, unit: 'ppm', paramName: 'Fe', frequency: 'Day', formattedTolerance: '± 5', formattedRange: '0.10 ppm ±5' },
        sio2: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'ppm', paramName: 'SiO2', frequency: 'Day' },
        th: { target: 250, tolerance: 5, min: 245, max: 255, unit: 'ppm', paramName: 'TH', frequency: 'Day' },
        cah: { target: 150, tolerance: 10, min: 140, max: 160, unit: 'ppm', paramName: 'CaH', frequency: 'Day' },
        mgh: { target: 100, tolerance: 10, min: 90, max: 110, unit: 'ppm', paramName: 'MgH', frequency: 'Day' },
        cl: { target: 50, tolerance: 10, min: 40, max: 60, unit: 'ppm', paramName: 'Cl', frequency: 'Day' },
        alk: { target: 130, tolerance: 10, min: 120, max: 140, unit: 'ppm', paramName: 'Alk', frequency: 'Day' },
        so4: { target: 40, tolerance: 5, min: 35, max: 45, unit: 'ppm', paramName: 'SO4', frequency: 'Day' },
        ema: { target: 100, tolerance: 10, min: 90, max: 110, unit: 'ppm', paramName: 'EMA', frequency: 'Day' },
        tds: { target: 350, tolerance: 50, min: 300, max: 400, unit: 'ppm', paramName: 'TDS', frequency: 'Day' },
      },
    },
    'dm-water': {
      // Applied strictly to Offset Plant - DM Water Analysis - Frequency: Day
      // 1. pH: Direct Valid Range 7.0 – 9.5 (NOT a ± tolerance)
      // 2. Cond: Target 10 umho/cm, Tolerance ±5 -> Valid Range: 5 – 15 umho/cm
      // 3. TH: Limit Nil (Do NOT invent numerical range or tolerance)
      // 4. Alk: Target 5 ppm, Tolerance ±4 -> Valid Range: 1 – 9 ppm
      // 5. SiO2: Target 0.20 ppm, Tolerance ±5 (Preserved exactly as given)
      day: {
        ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
        cond: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'umho/cm', paramName: 'Cond', label: 'Cond', frequency: 'Day', formattedRange: '5 – 15 umho/cm', formattedTarget: '10 umho/cm', formattedTolerance: '±5', referenceDisplay: '10 ± 5 umho/cm (5 – 15 umho/cm)' },
        th: { isNil: true, hasNumericLimit: false, unit: 'ppm', paramName: 'TH', label: 'TH', frequency: 'Day', formattedRange: 'Nil', referenceDisplay: 'Nil' },
        alk: { target: 5, tolerance: 4, min: 1, max: 9, unit: 'ppm', paramName: 'Alk', label: 'Alk', frequency: 'Day', formattedRange: '1 – 9 ppm', formattedTarget: '5 ppm', formattedTolerance: '±4', referenceDisplay: '5 ± 4 ppm (1 – 9 ppm)' },
        sio2: { target: 0.20, tolerance: 5, min: -4.8, max: 5.2, unit: 'ppm', paramName: 'SiO2', label: 'SiO₂', frequency: 'Day', formattedRange: '0.20 ± 5 ppm', formattedTarget: '0.20 ppm', formattedTolerance: '±5', referenceDisplay: '0.20 ± 5 ppm' },
      },
    },
    'bfw': {
      // Applied strictly to Offset Plant - BFW (Boiler Feed Water) Analysis - Frequency: Day
      // 1. pH: Direct Valid Range 7.0 – 9.5
      // 2. Cond: Target 10 umho/cm, Tolerance ±5 -> Valid Range: 5 – 15 umho/cm
      // 3. TH: Limit Nil (Do NOT invent numerical range or tolerance)
      // 4. Alk: Target 5 ppm, Tolerance ±4 -> Valid Range: 1 – 9 ppm
      // 5. SiO2: Target 0.20 ppm, Tolerance ±5 (Preserved exactly as given)
      day: {
        ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
        cond: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'umho/cm', paramName: 'Cond', label: 'Cond', frequency: 'Day', formattedRange: '5 – 15 umho/cm', formattedTarget: '10 umho/cm', formattedTolerance: '±5', referenceDisplay: '10 ± 5 umho/cm (5 – 15 umho/cm)' },
        th: { isNil: true, hasNumericLimit: false, unit: 'ppm', paramName: 'TH', label: 'TH', frequency: 'Day', formattedRange: 'Nil', referenceDisplay: 'Nil' },
        alk: { target: 5, tolerance: 4, min: 1, max: 9, unit: 'ppm', paramName: 'Alk', label: 'Alk', frequency: 'Day', formattedRange: '1 – 9 ppm', formattedTarget: '5 ppm', formattedTolerance: '±4', referenceDisplay: '5 ± 4 ppm (1 – 9 ppm)' },
        sio2: { target: 0.20, tolerance: 5, min: -4.8, max: 5.2, unit: 'ppm', paramName: 'SiO2', label: 'SiO₂', frequency: 'Day', formattedRange: '0.20 ± 5 ppm', formattedTarget: '0.20 ppm', formattedTolerance: '±5', referenceDisplay: '0.20 ± 5 ppm' },
      },
    },
    'shs': {
      // Applied strictly to Offset Plant - SHS (Super Heated Steam) Analysis - Frequency: Day
      // Exactly the same parameters and limits as BFW
      day: {
        ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
        cond: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'umho/cm', paramName: 'Cond', label: 'Cond', frequency: 'Day', formattedRange: '5 – 15 umho/cm', formattedTarget: '10 umho/cm', formattedTolerance: '±5', referenceDisplay: '10 ± 5 umho/cm (5 – 15 umho/cm)' },
        th: { isNil: true, hasNumericLimit: false, unit: 'ppm', paramName: 'TH', label: 'TH', frequency: 'Day', formattedRange: 'Nil', referenceDisplay: 'Nil' },
        alk: { target: 5, tolerance: 4, min: 1, max: 9, unit: 'ppm', paramName: 'Alk', label: 'Alk', frequency: 'Day', formattedRange: '1 – 9 ppm', formattedTarget: '5 ppm', formattedTolerance: '±4', referenceDisplay: '5 ± 4 ppm (1 – 9 ppm)' },
        sio2: { target: 0.20, tolerance: 5, min: -4.8, max: 5.2, unit: 'ppm', paramName: 'SiO2', label: 'SiO₂', frequency: 'Day', formattedRange: '0.20 ± 5 ppm', formattedTarget: '0.20 ppm', formattedTolerance: '±5', referenceDisplay: '0.20 ± 5 ppm' },
      },
    },
  },
};

export const SA_LSA_LIMITS = {
  na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
  nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'NaCl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
  fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
  fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
  na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2SO4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
  ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
  bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
  vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
  turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
  trubidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'Turbidity', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
};
export const LSA_LIMITS = SA_LSA_LIMITS;

export const SA_LSA_BAGGING_SHIFT_LIMITS = {
  na2co3: { target: 98.5, tolerancePlus: 1.0, toleranceMinus: 0.0, min: 98.5, max: 99.5, unit: '%', paramName: 'Na2Co3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '98.5% – 99.5%', formattedTarget: '98.5%', formattedTolerance: '+1.0 / -0.0' },
  nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'Nacl', label: 'NaCl', frequency: 'Once in a Shift', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
  fe: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
  fe2o3: { target: 0.007, tolerance: 0.001, min: 0.006, max: 0.008, unit: '%', paramName: 'Fe2O3', label: 'Fe₂O₃', frequency: 'Once in a Shift', formattedRange: '0.006% – 0.008%', formattedTarget: '0.007%', formattedTolerance: '±0.001%' },
  na2so4: { target: 0.08, tolerance: 0.001, min: 0.079, max: 0.081, unit: '%', paramName: 'Na2so4', label: 'Na₂SO₄', frequency: 'Once in a Shift', formattedRange: '0.079% – 0.081%', formattedTarget: '0.08%', formattedTolerance: '±0.001%' },
  vm: { target: 2.0, tolerancePlus: 0.1, toleranceMinus: 1.5, min: 0.5, max: 2.1, unit: '%', paramName: 'VM', label: 'VM', frequency: 'Once in a Shift', formattedRange: '0.5% – 2.1%', formattedTarget: '2.0%', formattedTolerance: '+0.1 / -1.5' },
  ir: { target: 0.15, tolerance: 0.01, min: 0.14, max: 0.16, unit: '%', paramName: 'IR', label: 'IR', frequency: 'Once in a Shift', formattedRange: '0.14% – 0.16%', formattedTarget: '0.15%', formattedTolerance: '±0.01%' },
  bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: 'Once in a Shift', formattedRange: '500 – 750 g/L' },
  turbidity: { target: 80, tolerance: 5.0, min: 75, max: 85, unit: 'NTU', paramName: 'TURBIDITY', label: 'Turbidity', frequency: 'Once in a Shift', formattedRange: '75 – 85 NTU', formattedTarget: '80 NTU', formattedTolerance: '±5.0 NTU' },
};
export const LSA_BAGGING_SHIFT_LIMITS = SA_LSA_BAGGING_SHIFT_LIMITS;

export const SA_LSA_BAGGING_HOURLY_LIMITS = {
  nacl: { target: 1.0, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 0.5, max: 1.0, unit: '%', paramName: 'Nacl', label: 'NaCl', frequency: '1 Hour Once', formattedRange: '0.5% – 1.0%', formattedTarget: '1.0%', formattedTolerance: '+0.0 / -0.5' },
  bd: { min: 500, max: 750, unit: 'g/L', paramName: 'BD', label: 'BD', frequency: '1 Hour Once', formattedRange: '500 – 750 g/L' },
};
export const LSA_BAGGING_HOURLY_LIMITS = SA_LSA_BAGGING_HOURLY_LIMITS;

export const SA_LSA_BAGGING_LIMITS = {
  shift: SA_LSA_BAGGING_SHIFT_LIMITS,
  hourly: SA_LSA_BAGGING_HOURLY_LIMITS,
};
export const LSA_BAGGING_LIMITS = SA_LSA_BAGGING_LIMITS;

export const SA_LSA_BAGGING_SIEVE_LIMITS = {
  bss30: { target: 2, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 1.5, max: 2.0, unit: '%', paramName: 'BSS 30', label: 'BSS 30', frequency: '1 Hour Once', formattedRange: '1.5% – 2.0%', formattedTarget: '2%', formattedTolerance: '+0.0 / -0.5' },
  bss60: { target: 6, tolerancePlus: 0.0, toleranceMinus: 0.5, min: 5.5, max: 6.0, unit: '%', paramName: 'BSS 60', label: 'BSS 60', frequency: '1 Hour Once', formattedRange: '5.5% – 6.0%', formattedTarget: '6%', formattedTolerance: '+0.0 / -0.5' },
};
export const LSA_BAGGING_SIEVE_LIMITS = SA_LSA_BAGGING_SIEVE_LIMITS;

export const SA_GAS_CONC_LIMITS = {
  recoveryGas: {
    target: 80,
    tolerance: 5.0,
    min: 75,
    max: 85,
    unit: '%',
    paramName: 'Conc.',
    location: 'Recovery Gas',
    label: 'Recovery Gas Conc.',
    frequency: 'Once in a Shift',
    formattedRange: '75% – 85%',
    formattedTarget: '80%',
    formattedTolerance: '±5.0%',
  },
  bottomGas: {
    target: 85,
    tolerance: 5.0,
    min: 80,
    max: 90,
    unit: '%',
    paramName: 'Conc.',
    location: 'Bottom Gas',
    label: 'Bottom Gas Conc.',
    frequency: 'Once in a Shift',
    formattedRange: '80% – 90%',
    formattedTarget: '85%',
    formattedTolerance: '±5.0%',
  },
  cleaningGas: {
    target: 10,
    tolerance: 1.0,
    min: 9,
    max: 11,
    unit: '%',
    paramName: 'Conc.',
    location: 'Cleaning Gas',
    label: 'Cleaning Gas Conc.',
    frequency: 'Once in a Shift',
    formattedRange: '9% – 11%',
    formattedTarget: '10%',
    formattedTolerance: '±1.0%',
  },
};
export const GAS_CONC_LIMITS = SA_GAS_CONC_LIMITS;

export const SA_E501_LIMITS = {
  fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
  na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
};
export const E501_LIMITS = SA_E501_LIMITS;

export const SA_T501_LIMITS = {
  fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'FNH3', label: 'FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
  na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'Na2CO3', label: 'Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
};
export const T501_LIMITS = SA_T501_LIMITS;

export const SA_E501_T501_LIMITS = {
  e501_fnh3: { min: 10, max: 40, unit: 'g/L', paramName: 'E501 FNH3', label: 'E501 FNH₃', frequency: 'Once in a Shift', formattedRange: '10 – 40 g/L' },
  e501_na2co3: { min: 2, max: 10, unit: 'g/L', paramName: 'E501 Na2CO3', label: 'E501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '2 – 10 g/L' },
  t501_fnh3: { min: 1, max: 5, unit: 'g/L', paramName: 'T501 FNH3', label: 'T501 FNH₃', frequency: 'Once in a Shift', formattedRange: '1 – 5 g/L' },
  t501_na2co3: { min: 20, max: 60, unit: 'g/L', paramName: 'T501 Na2CO3', label: 'T501 Na₂CO₃', frequency: 'Once in a Shift', formattedRange: '20 – 60 g/L' },
};
export const E501_T501_LIMITS = SA_E501_T501_LIMITS;

export const OFFSET_DM_WATER_LIMITS = {
  ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
  cond: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'umho/cm', paramName: 'Cond', label: 'Cond', frequency: 'Day', formattedRange: '5 – 15 umho/cm', formattedTarget: '10 umho/cm', formattedTolerance: '±5', referenceDisplay: '10 ± 5 umho/cm (5 – 15 umho/cm)' },
  th: { isNil: true, hasNumericLimit: false, unit: 'ppm', paramName: 'TH', label: 'TH', frequency: 'Day', formattedRange: 'Nil', referenceDisplay: 'Nil' },
  alk: { target: 5, tolerance: 4, min: 1, max: 9, unit: 'ppm', paramName: 'Alk', label: 'Alk', frequency: 'Day', formattedRange: '1 – 9 ppm', formattedTarget: '5 ppm', formattedTolerance: '±4', referenceDisplay: '5 ± 4 ppm (1 – 9 ppm)' },
  sio2: { target: 0.20, tolerance: 5, min: -4.8, max: 5.2, unit: 'ppm', paramName: 'SiO2', label: 'SiO₂', frequency: 'Day', formattedRange: '0.20 ± 5 ppm', formattedTarget: '0.20 ppm', formattedTolerance: '±5', referenceDisplay: '0.20 ± 5 ppm' },
};
export const DM_WATER_LIMITS = OFFSET_DM_WATER_LIMITS;

export const OFFSET_BFW_LIMITS = {
  ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
  cond: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'umho/cm', paramName: 'Cond', label: 'Cond', frequency: 'Day', formattedRange: '5 – 15 umho/cm', formattedTarget: '10 umho/cm', formattedTolerance: '±5', referenceDisplay: '10 ± 5 umho/cm (5 – 15 umho/cm)' },
  th: { isNil: true, hasNumericLimit: false, unit: 'ppm', paramName: 'TH', label: 'TH', frequency: 'Day', formattedRange: 'Nil', referenceDisplay: 'Nil' },
  alk: { target: 5, tolerance: 4, min: 1, max: 9, unit: 'ppm', paramName: 'Alk', label: 'Alk', frequency: 'Day', formattedRange: '1 – 9 ppm', formattedTarget: '5 ppm', formattedTolerance: '±4', referenceDisplay: '5 ± 4 ppm (1 – 9 ppm)' },
  sio2: { target: 0.20, tolerance: 5, min: -4.8, max: 5.2, unit: 'ppm', paramName: 'SiO2', label: 'SiO₂', frequency: 'Day', formattedRange: '0.20 ± 5 ppm', formattedTarget: '0.20 ppm', formattedTolerance: '±5', referenceDisplay: '0.20 ± 5 ppm' },
};
export const BFW_LIMITS = OFFSET_BFW_LIMITS;

export const OFFSET_SHS_LIMITS = {
  ph: { min: 7.0, max: 9.5, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', isDirectRange: true, formattedRange: '7.0 – 9.5', referenceDisplay: 'Direct Range: 7.0 – 9.5' },
  cond: { target: 10, tolerance: 5, min: 5, max: 15, unit: 'umho/cm', paramName: 'Cond', label: 'Cond', frequency: 'Day', formattedRange: '5 – 15 umho/cm', formattedTarget: '10 umho/cm', formattedTolerance: '±5', referenceDisplay: '10 ± 5 umho/cm (5 – 15 umho/cm)' },
  th: { isNil: true, hasNumericLimit: false, unit: 'ppm', paramName: 'TH', label: 'TH', frequency: 'Day', formattedRange: 'Nil', referenceDisplay: 'Nil' },
  alk: { target: 5, tolerance: 4, min: 1, max: 9, unit: 'ppm', paramName: 'Alk', label: 'Alk', frequency: 'Day', formattedRange: '1 – 9 ppm', formattedTarget: '5 ppm', formattedTolerance: '±4', referenceDisplay: '5 ± 4 ppm (1 – 9 ppm)' },
  sio2: { target: 0.20, tolerance: 5, min: -4.8, max: 5.2, unit: 'ppm', paramName: 'SiO2', label: 'SiO₂', frequency: 'Day', formattedRange: '0.20 ± 5 ppm', formattedTarget: '0.20 ppm', formattedTolerance: '±5', referenceDisplay: '0.20 ± 5 ppm' },
};
export const SHS_LIMITS = OFFSET_SHS_LIMITS;

export const ACL_CACL2_LIMITS = {
  ph: { target: 7.7, tolerance: 1.0, min: 6.7, max: 8.7, unit: '', paramName: 'pH', label: 'pH', frequency: 'Day', formattedRange: '6.7 – 8.7', formattedTarget: '7.7', formattedTolerance: '±1', referenceDisplay: '7.7 ± 1 (6.7 – 8.7)' },
  conc: { target: 20, tolerance: 5.0, min: 15, max: 25, unit: '%', paramName: 'CONC', label: 'CONC', frequency: 'Day', formattedRange: '15% – 25%', formattedTarget: '20%', formattedTolerance: '±5.0%', referenceDisplay: '20% ± 5.0% (15% – 25%)' },
  fnh3: { target: 1000, tolerance: 50, min: 950, max: 1050, unit: 'PPM', paramName: 'FNH3', label: 'FNH₃', frequency: 'Day', formattedRange: '950 – 1050 PPM', formattedTarget: '1000 PPM', formattedTolerance: '±50 PPM', referenceDisplay: '1000 ± 50 PPM (950 – 1050 PPM)' },
  cnh3: { target: 500, tolerance: 100, min: 400, max: 600, unit: 'PPM', paramName: 'CNH3', label: 'CNH₃', frequency: 'Day', formattedRange: '400 – 600 PPM', formattedTarget: '500 PPM', formattedTolerance: '±100 PPM', referenceDisplay: '500 ± 100 PPM (400 – 600 PPM)' },
  ss: { target: 60, tolerance: 10, min: 50, max: 70, unit: 'PPM', paramName: 'SS', label: 'SS', frequency: 'Day', formattedRange: '50 – 70 PPM', formattedTarget: '60 PPM', formattedTolerance: '±10 PPM', referenceDisplay: '60 ± 10 PPM (50 – 70 PPM)' },
};
export const CACL2_LIMITS = ACL_CACL2_LIMITS;

/**
 * Calculates min and max permitted values given target and tolerance
 */
export const calculateRange = (target, tolerance) => {
  const min = Math.max(0, parseFloat((target - tolerance).toFixed(4)));
  const max = parseFloat((target + tolerance).toFixed(4));
  return { min, max };
};

/**
 * Maps a row key to its corresponding limit category ('shift', 'composition', 'week', 'shift2', 'shiftTwice', or 'onceInAShift')
 * RAW SALT has no limits as requested by user.
 */
export const getRowCategory = (rowKeyOrAnalysis, maybeRowKey) => {
  let analysisType = 'pure-salt';
  let rowKey = rowKeyOrAnalysis;
  if (maybeRowKey !== undefined) {
    analysisType = rowKeyOrAnalysis;
    rowKey = maybeRowKey;
  }
  const cleanAnalysis = (analysisType || 'pure-salt').toLowerCase().replace(/\s+/g, '-');
  if (
    cleanAnalysis === 'tk203' || cleanAnalysis === 'tk-203' || cleanAnalysis === 'tk-203-analysis' || cleanAnalysis === 'tk203-analysis' ||
    cleanAnalysis === 'tk205' || cleanAnalysis === 'tk-205' || cleanAnalysis === 'tk-205-analysis' || cleanAnalysis === 'tk205-analysis' ||
    cleanAnalysis === 'tk207' || cleanAnalysis === 'tk-207' || cleanAnalysis === 'tk-207-analysis' || cleanAnalysis === 'tk207-analysis' ||
    cleanAnalysis === 'p417' || cleanAnalysis === 'p-417' || cleanAnalysis === 'p417-1' || cleanAnalysis === 'p-417-1' || cleanAnalysis === 'p4171' ||
    cleanAnalysis === 'p417-analysis' || cleanAnalysis === 'p417-1-analysis' || cleanAnalysis === 'sa-p417' || cleanAnalysis === 'sa-p-417' ||
    cleanAnalysis === 'sa-p417-1' || cleanAnalysis === 'sa-p-417-1' || cleanAnalysis === 'sa-p417-analysis' || cleanAnalysis === 'sa-p417-1-analysis'
  ) {
    return 'shiftTwice';
  }
  if (cleanAnalysis === 'tk204' || cleanAnalysis === 'tk-204' || cleanAnalysis === 'tk-204-analysis' || cleanAnalysis === 'tk204-analysis') {
    return 'onceInAShift';
  }
  if (cleanAnalysis === 'tk209' || cleanAnalysis === 'tk-209' || cleanAnalysis === 'tk-209-analysis' || cleanAnalysis === 'tk209-analysis') {
    return 'onceInAShift';
  }
  if (cleanAnalysis === 'cr202' || cleanAnalysis === 'cr-202' || cleanAnalysis === 'cr-202-analysis' || cleanAnalysis === 'cr202-analysis') {
    return 'onceInAShift';
  }
  if (cleanAnalysis === 'cr203' || cleanAnalysis === 'cr-203' || cleanAnalysis === 'cr-203-analysis' || cleanAnalysis === 'cr203-analysis') {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'pcl-tcl' ||
    cleanAnalysis === 'pcl/tcl' ||
    cleanAnalysis === 'pcltcl' ||
    cleanAnalysis === 'pcl-tcl-analysis' ||
    cleanAnalysis === 'pcl/tcl-analysis'
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'bicarbonate-moisture' ||
    cleanAnalysis === 'bi-carbonate-moisture' ||
    cleanAnalysis === 'bicarbonate-moisture-analysis' ||
    cleanAnalysis === 'bi-carbonate-moisture-analysis' ||
    cleanAnalysis === 'sa-bicarbonate-moisture' ||
    cleanAnalysis === 'sa-bi-carbonate-moisture'
  ) {
    return 'onceIn4Hours';
  }
  if (
    cleanAnalysis === 'lsa-bagging-sieve' ||
    cleanAnalysis === 'lsa-bagging-sieve-analysis' ||
    cleanAnalysis === 'sa-lsa-bagging-sieve' ||
    cleanAnalysis === 'sa-lsa-bagging-sieve-analysis' ||
    cleanAnalysis === 'lsa-bagging-seive' ||
    cleanAnalysis === 'lsa-bagging-seive-analysis' ||
    (cleanAnalysis.includes('bagging') && (cleanAnalysis.includes('sieve') || cleanAnalysis.includes('seive')))
  ) {
    return 'onceIn1Hour';
  }
  if (
    cleanAnalysis === 'gas-conc' ||
    cleanAnalysis === 'gas-conc-analysis' ||
    cleanAnalysis === 'gas-concentration' ||
    cleanAnalysis === 'gas-concentration-analysis' ||
    cleanAnalysis === 'sa-gas-conc' ||
    cleanAnalysis === 'sa-gas-conc-analysis'
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'lsa-bagging' ||
    cleanAnalysis === 'lsa-bagging-analysis' ||
    cleanAnalysis === 'sa-lsa-bagging' ||
    cleanAnalysis === 'sa-lsa-bagging-analysis'
  ) {
    const cleanRow = String(rowKey || '').toLowerCase();
    if (cleanRow.includes('hour') || cleanRow.startsWith('h') || cleanRow === '1hour' || cleanRow === 'hourly') {
      return 'onceIn1Hour';
    }
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'lsa' ||
    cleanAnalysis === 'lsa-shift' ||
    cleanAnalysis === 'lsa-shift-analysis' ||
    cleanAnalysis === 'lsa-analysis' ||
    cleanAnalysis === 'sa-lsa' ||
    cleanAnalysis === 'sa-lsa-shift' ||
    cleanAnalysis === 'sa-lsa-analysis' ||
    cleanAnalysis === 'e501' ||
    cleanAnalysis === 'e-501' ||
    cleanAnalysis === 't501' ||
    cleanAnalysis === 't-501' ||
    cleanAnalysis === 'e501-t501' ||
    cleanAnalysis === 'e501/t501' ||
    cleanAnalysis === 'e-501-t-501' ||
    cleanAnalysis === 'e-501-/-t-501' ||
    cleanAnalysis === 'e501-analysis' ||
    cleanAnalysis === 't501-analysis' ||
    cleanAnalysis === 'e501-t501-analysis'
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'tk401' ||
    cleanAnalysis === 'tk-401' ||
    cleanAnalysis === 'tk-401-analysis' ||
    cleanAnalysis === 'tk401-analysis' ||
    cleanAnalysis === 'sa-tk-401' ||
    cleanAnalysis === 'sa-tk-401-analysis'
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'tk405' ||
    cleanAnalysis === 'tk-405' ||
    cleanAnalysis === 'tk-405-analysis' ||
    cleanAnalysis === 'tk405-analysis' ||
    cleanAnalysis === 'sa-tk-405' ||
    cleanAnalysis === 'sa-tk-405-analysis'
  ) {
    return 'onceInAShift';
  }
  if (
    (cleanAnalysis === 't401' ||
      cleanAnalysis === 't-401' ||
      cleanAnalysis === 't-401-analysis' ||
      cleanAnalysis === 't401-analysis' ||
      cleanAnalysis === 'sa-t-401' ||
      cleanAnalysis === 'sa-t-401-analysis' ||
      cleanAnalysis === 'sa-t401' ||
      cleanAnalysis === 'sa-t401-analysis') &&
    !cleanAnalysis.includes('tk')
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'tk414' ||
    cleanAnalysis === 'tk-414' ||
    cleanAnalysis === 'tk-414-analysis' ||
    cleanAnalysis === 'tk414-analysis' ||
    cleanAnalysis === 'sa-tk-414' ||
    cleanAnalysis === 'sa-tk-414-analysis' ||
    cleanAnalysis.includes('tk-414-tsc') ||
    cleanAnalysis.includes('tk414-tsc') ||
    cleanAnalysis.includes('tk414')
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'p413' ||
    cleanAnalysis === 'p-413' ||
    cleanAnalysis === 'p-413-analysis' ||
    cleanAnalysis === 'p413-analysis' ||
    cleanAnalysis === 'sa-p413' ||
    cleanAnalysis === 'sa-p413-analysis' ||
    cleanAnalysis.includes('p-413-wsc') ||
    cleanAnalysis.includes('p413-wsc') ||
    cleanAnalysis.includes('p413wsc') ||
    cleanAnalysis.includes('p413')
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'tk419' ||
    cleanAnalysis === 'tk-419' ||
    cleanAnalysis === 'tk-419-analysis' ||
    cleanAnalysis === 'tk419-analysis' ||
    cleanAnalysis === 'sa-tk-419' ||
    cleanAnalysis === 'sa-tk-419-analysis' ||
    cleanAnalysis.includes('tk-419-sc') ||
    cleanAnalysis.includes('tk419-sc') ||
    cleanAnalysis.includes('tk419sc') ||
    cleanAnalysis.includes('tk419')
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis.includes('dcc-drain-liq') ||
    cleanAnalysis.includes('dcc-drain') ||
    cleanAnalysis.includes('dcc') ||
    cleanAnalysis.includes('sox-drain-liq') ||
    cleanAnalysis.includes('sox-drain') ||
    cleanAnalysis.includes('sox') ||
    cleanAnalysis.includes('absorber-drain-liq') ||
    cleanAnalysis.includes('absorber-drain')
  ) {
    return 'onceInAWeek';
  }
  if (
    cleanAnalysis.includes('bl1204') ||
    cleanAnalysis.includes('bl1203') ||
    cleanAnalysis === 'bl1204-bl1203' ||
    cleanAnalysis === 'bl1204-analysis' ||
    cleanAnalysis.includes('absorber') ||
    cleanAnalysis.includes('outlet') ||
    cleanAnalysis.includes('rich') ||
    cleanAnalysis.includes('washwater') ||
    cleanAnalysis.includes('wash-water') ||
    cleanAnalysis.includes('p1256') ||
    cleanAnalysis.includes('p-1256') ||
    cleanAnalysis.includes('reflux') ||
    cleanAnalysis.includes('tk1251') ||
    cleanAnalysis.includes('tk-1251') ||
    cleanAnalysis.includes('tk1252') ||
    cleanAnalysis.includes('tk-1252')
  ) {
    return 'onceInAShift';
  }
  if (
    cleanAnalysis === 'dm-water' ||
    cleanAnalysis === 'dmwater' ||
    cleanAnalysis === 'dm-water-analysis' ||
    cleanAnalysis === 'dmwater-analysis' ||
    cleanAnalysis.includes('dm-water') ||
    cleanAnalysis.includes('dmwater') ||
    cleanAnalysis === 'bfw' ||
    cleanAnalysis === 'bfw-analysis' ||
    cleanAnalysis.includes('boiler-feed-water') ||
    cleanAnalysis.includes('boiled-feed-water') ||
    cleanAnalysis === 'shs' ||
    cleanAnalysis === 'shs-analysis' ||
    cleanAnalysis.includes('super-heated-steam') ||
    cleanAnalysis === 'cacl2' ||
    cleanAnalysis === 'cacl2-analysis' ||
    cleanAnalysis === 'acl-cacl2' ||
    cleanAnalysis === 'acl-cacl2-analysis' ||
    cleanAnalysis.includes('cacl2')
  ) {
    return 'day';
  }
  if (cleanAnalysis.includes('lean')) {
    if (rowKey && ['week', 'weekly', 'onceinaweek', 'once_in_a_week'].includes(String(rowKey).toLowerCase())) {
      return 'onceInAWeek';
    }
    if (cleanAnalysis.includes('week') || cleanAnalysis.includes('weekly') || cleanAnalysis.includes('ppm')) {
      return 'onceInAWeek';
    }
    if (rowKey && ['day', 'dayanalysis', 'daily', 'composition', 'comp'].includes(String(rowKey).toLowerCase())) {
      return 'day';
    }
    return 'onceInAShift';
  }
  if (cleanAnalysis === 'pure-salt-sieve' || cleanAnalysis === 'pure-salt-sieve-analysis') {
    if (rowKey && ['shift2', 'shift_2', 'iishift', 'ii_shift', 'shift-2'].includes(String(rowKey).toLowerCase())) {
      return 'shift2';
    }
    return null; // Only II SHIFT has limits for Pure Salt Sieve Analysis
  }
  if (cleanAnalysis === 'brine' || cleanAnalysis === 'brine-analysis') {
    return 'week';
  }
  if (rowKey && ['tk109', 'tk110', 'week'].includes(String(rowKey).toLowerCase())) {
    return 'week';
  }
  if (rowKey === 'rawSalt') {
    return null; // No limit for RAW SALT
  }
  if (['shift1', 'shift2', 'shift3', 'shift_1', 'shift_2', 'shift_3', 'iShift', 'iiShift', 'iiiShift'].includes(rowKey)) {
    return 'shift';
  }
  if (['composition', 'comp', 'day'].includes(rowKey)) {
    return 'composition';
  }
  return null;
};

// ── Feature Flags: Tolerance Limits Validation ───────────────────────────────
export const PURE_SALT_LIMIT_VALIDATION_ENABLED = true;
export const BRINE_LIMIT_VALIDATION_ENABLED = true;
export const PURE_SALT_SIEVE_LIMIT_VALIDATION_ENABLED = true;
export const TK203_LIMIT_VALIDATION_ENABLED = true;
export const TK204_LIMIT_VALIDATION_ENABLED = true;
export const TK205_LIMIT_VALIDATION_ENABLED = true;
export const TK207_LIMIT_VALIDATION_ENABLED = true;
export const TK209_LIMIT_VALIDATION_ENABLED = true;
export const CR202_LIMIT_VALIDATION_ENABLED = true;
export const CR203_LIMIT_VALIDATION_ENABLED = true;
export const PCL_TCL_LIMIT_VALIDATION_ENABLED = true;
export const BL1204_LIMIT_VALIDATION_ENABLED = true;
export const ABSORBER_INLET_LIMIT_VALIDATION_ENABLED = true;
export const OUTLET_LIMIT_VALIDATION_ENABLED = true;
export const LEAN_LIMIT_VALIDATION_ENABLED = true;
export const RICH_LIMIT_VALIDATION_ENABLED = true;
export const WASHWATER_LIMIT_VALIDATION_ENABLED = true;
export const P1256_LIMIT_VALIDATION_ENABLED = true;
export const REFLUX_LIMIT_VALIDATION_ENABLED = true;
export const TK1251_LIMIT_VALIDATION_ENABLED = true;
export const TK1252_LIMIT_VALIDATION_ENABLED = true;
export const DCC_DRAIN_LIQ_LIMIT_VALIDATION_ENABLED = true;
export const SOX_DRAIN_LIQ_LIMIT_VALIDATION_ENABLED = true;
export const ABSORBER_DRAIN_LIQ_LIMIT_VALIDATION_ENABLED = true;
export const SA_TK401_LIMIT_VALIDATION_ENABLED = true;
export const SA_TK405_LIMIT_VALIDATION_ENABLED = true;
export const SA_TK414_LIMIT_VALIDATION_ENABLED = true;
export const SA_P413_LIMIT_VALIDATION_ENABLED = true;
export const SA_TK419_LIMIT_VALIDATION_ENABLED = true;
export const SA_P417_LIMIT_VALIDATION_ENABLED = true;
export const SA_T401_LIMIT_VALIDATION_ENABLED = true;
export const SA_BICARBONATE_MOISTURE_LIMIT_VALIDATION_ENABLED = true;
export const SA_LSA_LIMIT_VALIDATION_ENABLED = true;
export const LSA_LIMIT_VALIDATION_ENABLED = true;
export const SA_E501_LIMIT_VALIDATION_ENABLED = true;
export const E501_LIMIT_VALIDATION_ENABLED = true;
export const SA_T501_LIMIT_VALIDATION_ENABLED = true;
export const T501_LIMIT_VALIDATION_ENABLED = true;
export const SA_E501_T501_LIMIT_VALIDATION_ENABLED = true;
export const E501_T501_LIMIT_VALIDATION_ENABLED = true;
export const SA_LSA_BAGGING_LIMIT_VALIDATION_ENABLED = true;
export const LSA_BAGGING_LIMIT_VALIDATION_ENABLED = true;
export const SA_LSA_BAGGING_SIEVE_LIMIT_VALIDATION_ENABLED = true;
export const LSA_BAGGING_SIEVE_LIMIT_VALIDATION_ENABLED = true;
export const SA_LSA_BAGGING_SIEVE_LIMITS_ENABLED = true;
export const SA_GAS_CONC_LIMIT_VALIDATION_ENABLED = true;
export const GAS_CONC_LIMIT_VALIDATION_ENABLED = true;
export const OFFSET_DM_WATER_LIMIT_VALIDATION_ENABLED = true;
export const DM_WATER_LIMIT_VALIDATION_ENABLED = true;
export const OFFSET_BFW_LIMIT_VALIDATION_ENABLED = true;
export const BFW_LIMIT_VALIDATION_ENABLED = true;
export const OFFSET_SHS_LIMIT_VALIDATION_ENABLED = true;
export const SHS_LIMIT_VALIDATION_ENABLED = true;
export const ACL_CACL2_LIMIT_VALIDATION_ENABLED = true;
export const CACL2_LIMIT_VALIDATION_ENABLED = true;
export const LIMITS_ENABLED = true;

/**
 * Retrieves the configured limit for a specific plant, analysis type, row, and parameter.
 * Returns null if no specific target/tolerance is defined for that cell.
 */
export const getCellLimit = (plantKey = 'acl', analysisType = 'pure-salt', rowKey, paramKey) => {
  const cleanPlant = (plantKey || 'acl').toLowerCase();
  const cleanAnalysis = (analysisType || 'pure-salt').toLowerCase().replace(/\s+/g, '-');

  const isPureSalt = cleanAnalysis === 'pure-salt' || cleanAnalysis === 'pure-salt-analysis';
  const isAclProduct = cleanAnalysis === 'acl-product' || cleanAnalysis === 'acl-product-analysis';
  const isAcl300 = cleanAnalysis === 'acl-300' || cleanAnalysis === 'acl-300#' || cleanAnalysis === 'acl-300#-analysis' || cleanAnalysis === 'acl-300-analysis';
  const isRawSalt = cleanAnalysis === 'raw-salt' || cleanAnalysis === 'raw-salt-analysis';
  const isBrine = cleanAnalysis === 'brine' || cleanAnalysis === 'brine-analysis';
  const isPureSaltSieve = cleanAnalysis === 'pure-salt-sieve' || cleanAnalysis === 'pure-salt-sieve-analysis';
  const isTK203 = cleanAnalysis === 'tk203' || cleanAnalysis === 'tk-203' || cleanAnalysis === 'tk-203-analysis' || cleanAnalysis === 'tk203-analysis';
  const isTK204 = cleanAnalysis === 'tk204' || cleanAnalysis === 'tk-204' || cleanAnalysis === 'tk-204-analysis' || cleanAnalysis === 'tk204-analysis';
  const isTK205 = cleanAnalysis === 'tk205' || cleanAnalysis === 'tk-205' || cleanAnalysis === 'tk-205-analysis' || cleanAnalysis === 'tk205-analysis';
  const isTK207 = cleanAnalysis === 'tk207' || cleanAnalysis === 'tk-207' || cleanAnalysis === 'tk-207-analysis' || cleanAnalysis === 'tk207-analysis';
  const isTK209 = cleanAnalysis === 'tk209' || cleanAnalysis === 'tk-209' || cleanAnalysis === 'tk-209-analysis' || cleanAnalysis === 'tk209-analysis';
  const isCR202 = cleanAnalysis === 'cr202' || cleanAnalysis === 'cr-202' || cleanAnalysis === 'cr-202-analysis' || cleanAnalysis === 'cr202-analysis';
  const isCR203 = cleanAnalysis === 'cr203' || cleanAnalysis === 'cr-203' || cleanAnalysis === 'cr-203-analysis' || cleanAnalysis === 'cr203-analysis';
  const isPclTcl = cleanAnalysis === 'pcl-tcl' || cleanAnalysis === 'pcl/tcl' || cleanAnalysis === 'pcltcl' || cleanAnalysis === 'pcl-tcl-analysis' || cleanAnalysis === 'pcl/tcl-analysis';
  const isSATK401 =
    cleanAnalysis === 'tk401' ||
    cleanAnalysis === 'tk-401' ||
    cleanAnalysis === 'tk-401-analysis' ||
    cleanAnalysis === 'tk401-analysis' ||
    cleanAnalysis === 'sa-tk-401' ||
    cleanAnalysis === 'sa-tk-401-analysis';
  const isSATK405 =
    cleanAnalysis === 'tk405' ||
    cleanAnalysis === 'tk-405' ||
    cleanAnalysis === 'tk-405-analysis' ||
    cleanAnalysis === 'tk405-analysis' ||
    cleanAnalysis === 'sa-tk-405' ||
    cleanAnalysis === 'sa-tk-405-analysis';
  const isSATK414 =
    cleanAnalysis === 'tk414' ||
    cleanAnalysis === 'tk-414' ||
    cleanAnalysis === 'tk-414-analysis' ||
    cleanAnalysis === 'tk414-analysis' ||
    cleanAnalysis === 'sa-tk-414' ||
    cleanAnalysis === 'sa-tk-414-analysis' ||
    cleanAnalysis.includes('tk-414-tsc') ||
    cleanAnalysis.includes('tk414-tsc') ||
    cleanAnalysis.includes('tk414');
  const isSAP413 =
    cleanAnalysis === 'p413' ||
    cleanAnalysis === 'p-413' ||
    cleanAnalysis === 'p-413-analysis' ||
    cleanAnalysis === 'p413-analysis' ||
    cleanAnalysis === 'sa-p413' ||
    cleanAnalysis === 'sa-p413-analysis' ||
    cleanAnalysis.includes('p-413-wsc') ||
    cleanAnalysis.includes('p413-wsc') ||
    cleanAnalysis.includes('p413wsc') ||
    cleanAnalysis.includes('p413');
  const isSATK419 =
    cleanAnalysis === 'tk419' ||
    cleanAnalysis === 'tk-419' ||
    cleanAnalysis === 'tk-419-analysis' ||
    cleanAnalysis === 'tk419-analysis' ||
    cleanAnalysis === 'sa-tk-419' ||
    cleanAnalysis === 'sa-tk-419-analysis' ||
    cleanAnalysis.includes('tk-419-sc') ||
    cleanAnalysis.includes('tk419-sc') ||
    cleanAnalysis.includes('tk419sc') ||
    cleanAnalysis.includes('tk419');
  const isSAP417 =
    cleanAnalysis === 'p417' ||
    cleanAnalysis === 'p-417' ||
    cleanAnalysis === 'p417-1' ||
    cleanAnalysis === 'p-417-1' ||
    cleanAnalysis === 'p4171' ||
    cleanAnalysis === 'p-417-analysis' ||
    cleanAnalysis === 'p417-analysis' ||
    cleanAnalysis === 'p417-1-analysis' ||
    cleanAnalysis === 'sa-p417' ||
    cleanAnalysis === 'sa-p-417' ||
    cleanAnalysis === 'sa-p417-1' ||
    cleanAnalysis === 'sa-p417-analysis' ||
    cleanAnalysis === 'sa-p417-1-analysis' ||
    cleanAnalysis === 'sa-p-417-1-analysis';
  const isSAT401 =
    (cleanAnalysis === 't401' ||
      cleanAnalysis === 't-401' ||
      cleanAnalysis === 't-401-analysis' ||
      cleanAnalysis === 't401-analysis' ||
      cleanAnalysis === 'sa-t-401' ||
      cleanAnalysis === 'sa-t-401-analysis' ||
      cleanAnalysis === 'sa-t401' ||
      cleanAnalysis === 'sa-t401-analysis' ||
      cleanAnalysis.includes('t-401') ||
      cleanAnalysis.includes('t401')) &&
    !cleanAnalysis.includes('tk');
  const isSABicarbonateMoisture =
    cleanAnalysis === 'bicarbonate-moisture' ||
    cleanAnalysis === 'bi-carbonate-moisture' ||
    cleanAnalysis === 'sa-bicarbonate-moisture' ||
    cleanAnalysis === 'sa-bi-carbonate-moisture' ||
    cleanAnalysis === 'bicarbonate-moisture-analysis' ||
    cleanAnalysis === 'bi-carbonate-moisture-analysis';
  const isSALSA =
    cleanAnalysis === 'lsa' ||
    cleanAnalysis === 'lsa-shift' ||
    cleanAnalysis === 'lsa-shift-analysis' ||
    cleanAnalysis === 'lsa-analysis' ||
    cleanAnalysis === 'sa-lsa' ||
    cleanAnalysis === 'sa-lsa-shift' ||
    cleanAnalysis === 'sa-lsa-analysis';
  const isLSABaggingSieve =
    cleanAnalysis === 'lsa-bagging-sieve' ||
    cleanAnalysis === 'lsa-bagging-sieve-analysis' ||
    cleanAnalysis === 'sa-lsa-bagging-sieve' ||
    cleanAnalysis === 'sa-lsa-bagging-sieve-analysis' ||
    cleanAnalysis === 'lsa-bagging-seive' ||
    cleanAnalysis === 'lsa-bagging-seive-analysis' ||
    (cleanAnalysis.includes('bagging') && (cleanAnalysis.includes('sieve') || cleanAnalysis.includes('seive')));
  const isLSABagging =
    !isLSABaggingSieve &&
    (cleanAnalysis === 'lsa-bagging' ||
      cleanAnalysis === 'lsa-bagging-analysis' ||
      cleanAnalysis === 'sa-lsa-bagging' ||
      cleanAnalysis === 'sa-lsa-bagging-analysis');
  const isE501 =
    cleanAnalysis === 'e501' ||
    cleanAnalysis === 'e-501' ||
    cleanAnalysis === 'e501-analysis' ||
    cleanAnalysis === 'e-501-analysis' ||
    cleanAnalysis === 'sa-e501' ||
    cleanAnalysis === 'sa-e-501';
  const isT501 =
    cleanAnalysis === 't501' ||
    cleanAnalysis === 't-501' ||
    cleanAnalysis === 't501-analysis' ||
    cleanAnalysis === 't-501-analysis' ||
    cleanAnalysis === 'sa-t501' ||
    cleanAnalysis === 'sa-t-501';
  const isE501T501 =
    cleanAnalysis === 'e501-t501' ||
    cleanAnalysis === 'e501/t501' ||
    cleanAnalysis === 'e-501-t-501' ||
    cleanAnalysis === 'e-501-/-t-501' ||
    cleanAnalysis === 'e501-t501-analysis' ||
    cleanAnalysis === 'sa-e501-t501' ||
    cleanAnalysis === 'sa-e501-t501-analysis' ||
    (!isE501 && !isT501 && (cleanAnalysis.includes('e501') || cleanAnalysis.includes('e-501')) && (cleanAnalysis.includes('t501') || cleanAnalysis.includes('t-501')));
  const isBL1204 = cleanAnalysis.includes('bl1204') || cleanAnalysis.includes('bl1203');
  const isOutlet = cleanAnalysis.includes('outlet');
  const isLean = cleanAnalysis.includes('lean');
  const isRich = cleanAnalysis.includes('rich');
  const isWashwater = cleanAnalysis.includes('washwater') || cleanAnalysis.includes('wash-water');
  const isP1256 = cleanAnalysis.includes('p1256') || cleanAnalysis.includes('p-1256');
  const isReflux = cleanAnalysis.includes('reflux');
  const isTK1251 = cleanAnalysis.includes('tk1251') || cleanAnalysis.includes('tk-1251');
  const isTK1252 = cleanAnalysis.includes('tk1252') || cleanAnalysis.includes('tk-1252');
  const isDccDrainLiq = cleanAnalysis.includes('dcc-drain-liq') || cleanAnalysis.includes('dcc-drain') || cleanAnalysis === 'dcc';
  const isSoxDrainLiq = cleanAnalysis.includes('sox-drain-liq') || cleanAnalysis.includes('sox-drain') || cleanAnalysis === 'sox';
  const isAbsorberDrainLiq = cleanAnalysis.includes('absorber-drain-liq') || cleanAnalysis.includes('absorber-drain') || cleanAnalysis === 'absorber-drain';
  const isAbsorberInlet = !isAbsorberDrainLiq && (cleanAnalysis.includes('absorber-inlet') || cleanAnalysis.includes('absorber'));
  const isSAGasConc =
    cleanAnalysis === 'gas-conc' ||
    cleanAnalysis === 'gas-conc-analysis' ||
    cleanAnalysis === 'gas-concentration' ||
    cleanAnalysis === 'gas-concentration-analysis' ||
    cleanAnalysis === 'sa-gas-conc' ||
    cleanAnalysis === 'sa-gas-conc-analysis';
  const isOffsetCBD =
    cleanAnalysis === 'cbd' ||
    cleanAnalysis === 'cbd-analysis' ||
    cleanAnalysis === 'offset-cbd';
  const isOffsetRawWater =
    cleanAnalysis === 'raw-water' ||
    cleanAnalysis === 'rawwater' ||
    cleanAnalysis === 'raw-water-analysis' ||
    cleanAnalysis === 'rawwater-analysis' ||
    cleanAnalysis === 'offset-raw-water';
  const isOffsetDMWater =
    cleanAnalysis === 'dm-water' ||
    cleanAnalysis === 'dmwater' ||
    cleanAnalysis === 'dm-water-analysis' ||
    cleanAnalysis === 'dmwater-analysis' ||
    cleanAnalysis === 'offset-dm-water';
  const isOffsetBFW =
    cleanAnalysis === 'bfw' ||
    cleanAnalysis === 'bfw-analysis' ||
    cleanAnalysis === 'offset-bfw' ||
    cleanAnalysis.includes('boiler-feed-water') ||
    cleanAnalysis.includes('boiled-feed-water');
  const isOffsetSHS =
    cleanAnalysis === 'shs' ||
    cleanAnalysis === 'shs-analysis' ||
    cleanAnalysis === 'offset-shs' ||
    cleanAnalysis.includes('super-heated-steam');
  const isACLCaCl2 =
    cleanAnalysis === 'cacl2' ||
    cleanAnalysis === 'cacl2-analysis' ||
    cleanAnalysis === 'acl-cacl2' ||
    cleanAnalysis === 'acl-cacl2-analysis' ||
    cleanAnalysis.includes('cacl2');

  if (!isPureSalt && !isAclProduct && !isAcl300 && !isRawSalt && !isBrine && !isPureSaltSieve && !isTK203 && !isTK204 && !isTK205 && !isTK207 && !isTK209 && !isCR202 && !isCR203 && !isPclTcl && !isSATK401 && !isSATK405 && !isSATK414 && !isSAP413 && !isSATK419 && !isSAP417 && !isSAT401 && !isSABicarbonateMoisture && !isSALSA && !isLSABagging && !isLSABaggingSieve && !isE501 && !isT501 && !isE501T501 && !isBL1204 && !isAbsorberInlet && !isOutlet && !isLean && !isRich && !isWashwater && !isP1256 && !isReflux && !isTK1251 && !isTK1252 && !isDccDrainLiq && !isSoxDrainLiq && !isAbsorberDrainLiq && !isSAGasConc && !isOffsetCBD && !isOffsetRawWater && !isOffsetDMWater && !isOffsetBFW && !isOffsetSHS && !isACLCaCl2) {
    return null;
  }

  if (isPureSalt && !PURE_SALT_LIMIT_VALIDATION_ENABLED) return null;
  if (isBrine && !BRINE_LIMIT_VALIDATION_ENABLED) return null;
  if (isPureSaltSieve && !PURE_SALT_SIEVE_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK203 && !TK203_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK204 && !TK204_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK205 && !TK205_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK207 && !TK207_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK209 && !TK209_LIMIT_VALIDATION_ENABLED) return null;
  if (isCR202 && !CR202_LIMIT_VALIDATION_ENABLED) return null;
  if (isCR203 && !CR203_LIMIT_VALIDATION_ENABLED) return null;
  if (isPclTcl && !PCL_TCL_LIMIT_VALIDATION_ENABLED) return null;
  if (isSATK401 && !SA_TK401_LIMIT_VALIDATION_ENABLED) return null;
  if (isSATK405 && !SA_TK405_LIMIT_VALIDATION_ENABLED) return null;
  if (isSATK414 && !SA_TK414_LIMIT_VALIDATION_ENABLED) return null;
  if (isSAP413 && !SA_P413_LIMIT_VALIDATION_ENABLED) return null;
  if (isSATK419 && !SA_TK419_LIMIT_VALIDATION_ENABLED) return null;
  if (isSAP417 && !SA_P417_LIMIT_VALIDATION_ENABLED) return null;
  if (isSAT401 && !SA_T401_LIMIT_VALIDATION_ENABLED) return null;
  if (isSABicarbonateMoisture && !SA_BICARBONATE_MOISTURE_LIMIT_VALIDATION_ENABLED) return null;
  if (isSALSA && !SA_LSA_LIMIT_VALIDATION_ENABLED) return null;
  if (isLSABagging && !SA_LSA_BAGGING_LIMIT_VALIDATION_ENABLED) return null;
  if (isLSABaggingSieve && !SA_LSA_BAGGING_SIEVE_LIMIT_VALIDATION_ENABLED) return null;
  if (isE501 && !SA_E501_LIMIT_VALIDATION_ENABLED) return null;
  if (isT501 && !SA_T501_LIMIT_VALIDATION_ENABLED) return null;
  if (isE501T501 && !SA_E501_T501_LIMIT_VALIDATION_ENABLED) return null;
  if (isBL1204 && !BL1204_LIMIT_VALIDATION_ENABLED) return null;
  if (isAbsorberInlet && !ABSORBER_INLET_LIMIT_VALIDATION_ENABLED) return null;
  if (isOutlet && !OUTLET_LIMIT_VALIDATION_ENABLED) return null;
  if (isLean && !LEAN_LIMIT_VALIDATION_ENABLED) return null;
  if (isRich && !RICH_LIMIT_VALIDATION_ENABLED) return null;
  if (isWashwater && !WASHWATER_LIMIT_VALIDATION_ENABLED) return null;
  if (isP1256 && !P1256_LIMIT_VALIDATION_ENABLED) return null;
  if (isReflux && !REFLUX_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK1251 && !TK1251_LIMIT_VALIDATION_ENABLED) return null;
  if (isTK1252 && !TK1252_LIMIT_VALIDATION_ENABLED) return null;
  if (isDccDrainLiq && !DCC_DRAIN_LIQ_LIMIT_VALIDATION_ENABLED) return null;
  if (isSoxDrainLiq && !SOX_DRAIN_LIQ_LIMIT_VALIDATION_ENABLED) return null;
  if (isAbsorberDrainLiq && !ABSORBER_DRAIN_LIQ_LIMIT_VALIDATION_ENABLED) return null;
  if (isSAGasConc && !SA_GAS_CONC_LIMIT_VALIDATION_ENABLED) return null;
  if (isOffsetDMWater && !OFFSET_DM_WATER_LIMIT_VALIDATION_ENABLED) return null;
  if (isOffsetBFW && !OFFSET_BFW_LIMIT_VALIDATION_ENABLED) return null;
  if (isOffsetSHS && !OFFSET_SHS_LIMIT_VALIDATION_ENABLED) return null;
  if (isACLCaCl2 && !ACL_CACL2_LIMIT_VALIDATION_ENABLED) return null;

  // Strict: Limits apply to TFL, ACL, CO2, SA, or Offset Plant
  if (cleanPlant !== 'tfl' && cleanPlant !== 'acl' && cleanPlant !== 'plant_acl' && cleanPlant !== 'co2' && cleanPlant !== 'sa' && cleanPlant !== 'plant_sa' && cleanPlant !== 'offset' && cleanPlant !== 'plant_offset') {
    return null;
  }
  if ((isTK205 || isTK207 || isTK209 || isCR202 || isCR203 || isPclTcl || isACLCaCl2) && cleanPlant !== 'acl' && cleanPlant !== 'plant_acl' && cleanPlant !== 'tfl') {
    return null;
  }
  if ((isSATK401 || isSATK405 || isSATK414 || isSAP413 || isSATK419 || isSAP417 || isSAT401 || isSABicarbonateMoisture || isSALSA || isLSABagging || isLSABaggingSieve || isE501 || isT501 || isE501T501 || isSAGasConc) && cleanPlant !== 'sa' && cleanPlant !== 'plant_sa' && cleanPlant !== 'tfl') {
    return null;
  }
  if ((isOffsetCBD || isOffsetRawWater || isOffsetDMWater || isOffsetBFW || isOffsetSHS) && cleanPlant !== 'offset' && cleanPlant !== 'plant_offset' && cleanPlant !== 'tfl') {
    return null;
  }

  const plantLimits =
    ANALYSIS_LIMITS_REGISTRY[cleanPlant] ||
    (cleanPlant === 'plant_sa' ? ANALYSIS_LIMITS_REGISTRY['sa'] : null) ||
    (cleanPlant === 'plant_offset' ? ANALYSIS_LIMITS_REGISTRY['offset'] : null) ||
    ANALYSIS_LIMITS_REGISTRY['offset'] ||
    ANALYSIS_LIMITS_REGISTRY['co2'] ||
    ANALYSIS_LIMITS_REGISTRY['tfl'];
  if (!plantLimits) return null;

  const analysisKey = isAclProduct
    ? 'acl-product'
    : isAcl300
      ? 'acl-300'
      : isRawSalt
        ? 'raw-salt'
        : isAbsorberDrainLiq
          ? 'absorber-drain-liq'
          : isSoxDrainLiq
            ? 'sox-drain-liq'
            : isDccDrainLiq
              ? 'dcc-drain-liq'
              : isTK1252
                ? 'tk1252'
                : isTK1251
                  ? 'tk1251'
                  : isReflux
                    ? 'reflux'
                    : isP1256
                      ? 'p1256'
                      : isWashwater
                        ? 'washwater'
                        : isRich
                          ? 'rich'
                          : isLean
                            ? 'lean'
                            : isOutlet
                              ? 'outlet'
                              : isAbsorberInlet
                                ? 'absorber-inlet'
                                : isBL1204
                                  ? 'bl1204-bl1203'
                                  : isTK204
                                    ? 'tk204'
                                    : isTK205
                                      ? 'tk205'
                                      : isTK207
                                        ? 'tk207'
                                        : isTK209
                                          ? 'tk209'
                                          : isCR202
                                            ? 'cr202'
                                            : isCR203
                                              ? 'cr203'
                                              : isPclTcl
                                                ? 'pcl-tcl'
                                                : isSATK401
                                                  ? 'tk401'
                                                  : isSATK405
                                                    ? 'tk405'
                                                    : isSATK414
                                                      ? 'tk414'
                                                      : isSAP413
                                                        ? 'p413'
                                                        : isSATK419
                                                          ? 'tk419'
                                                          : isSAP417
                                                      ? 'p417'
                                                      : isSAT401
                                                        ? 't401'
                                                        : isSABicarbonateMoisture
                                                          ? 'bicarbonate-moisture'
                                                          : isLSABaggingSieve
                                                            ? 'lsa-bagging-sieve'
                                                            : isLSABagging
                                                              ? 'lsa-bagging'
                                                              : isSALSA
                                                                ? 'lsa'
                                                                : isE501
                                                                  ? 'e501'
                                                                  : isT501
                                                                    ? 't501'
                                                                    : isE501T501
                                                                      ? 'e501-t501'
                                                                      : isSAGasConc
                                                                        ? 'gas-conc'
                                                                        : isOffsetCBD
                                                                          ? 'cbd'
                                                                          : isOffsetRawWater
                                                                            ? 'raw-water'
                                                                          : isOffsetDMWater
                                                                            ? 'dm-water'
                                                                          : isOffsetBFW
                                                                            ? 'bfw'
                                                                            : isOffsetSHS
                                                                              ? 'shs'
                                                                              : isACLCaCl2
                                                                                ? 'cacl2'
                                                                                : isTK203
                                                                                  ? 'tk203'
                                                                                  : isPureSaltSieve
                                                                                    ? 'pure-salt-sieve'
                                                                                    : isBrine
                                                                                      ? 'brine'
                                                                                      : 'pure-salt';
  const analysisLimits = plantLimits[analysisKey];
  if (!analysisLimits) return null;

  const category = getRowCategory(cleanAnalysis, rowKey);
  const categoryLimits = (category && analysisLimits[category]) || analysisLimits['day'] || analysisLimits['onceIn1Hour'] || analysisLimits['onceIn4Hours'] || analysisLimits['shiftTwice'] || analysisLimits['onceInAShift'] || analysisLimits['shift'] || analysisLimits['onceInAWeek'] || analysisLimits['week'];
  if (!categoryLimits) return null;

  const normalizedParamKey = String(paramKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const paramConfig = categoryLimits ? (
    categoryLimits[normalizedParamKey] ||
    categoryLimits[paramKey] ||
    (normalizedParamKey === 'talk' ? categoryLimits['alk'] : null) ||
    (isPclTcl ? categoryLimits['pcltcl'] : null)
  ) : null;
  if (!paramConfig) return null;

  const min = paramConfig.min !== undefined ? paramConfig.min : calculateRange(paramConfig.target, paramConfig.tolerance).min;
  const max = paramConfig.max !== undefined ? paramConfig.max : calculateRange(paramConfig.target, paramConfig.tolerance).max;
  const isKgPerM3 = isTK203 || isTK204 || isTK205 || isTK207 || isTK209 || isCR202 || isCR203 || isPclTcl || isSATK401 || isSATK405 || isSATK414 || isSAP413 || isSATK419 || isSAP417 || isSAT401;
  const unit = paramConfig.unit !== undefined ? paramConfig.unit : (isKgPerM3 ? 'Kgm/m³' : isBrine ? 'g/L' : '%');

  const formattedMin = Number.isInteger(min) ? String(min) : min.toFixed(2);
  const formattedMax = Number.isInteger(max) ? String(max) : max.toFixed(2);
  const formattedTarget = paramConfig.target !== undefined
    ? (Number.isInteger(paramConfig.target) ? String(paramConfig.target) : paramConfig.target.toFixed(2))
    : undefined;
  const formattedTolerance = paramConfig.tolerance !== undefined
    ? (Number.isInteger(paramConfig.tolerance) ? String(paramConfig.tolerance) : paramConfig.tolerance.toFixed(2))
    : undefined;

  const formattedRange = paramConfig.formattedRange || (
    (isBL1204 || isAbsorberInlet || isOutlet || isLean || isRich || isWashwater || isP1256 || isReflux) && unit === '%'
      ? `${formattedMin}–${formattedMax}%`
      : unit === 'PPM'
        ? `${formattedMin}–${formattedMax} PPM`
        : unit === 'CM'
          ? `${formattedMin}–${formattedMax} CM`
          : unit === 'sec'
            ? `${formattedMin}–${formattedMax} sec`
            : unit === 'Kg/cc'
              ? `${formattedMin}–${formattedMax} Kg/cc`
              : isKgPerM3
                ? `${formattedMin}–${formattedMax} Kgm/m³`
                : unit === 'g/L'
                  ? `${formattedMin}–${formattedMax} g/L`
                  : unit === ''
                    ? `${formattedMin}–${formattedMax}`
                    : `${formattedMin}–${formattedMax} ${unit}`
  );

  const formattedLabel = `Limit: ${formattedRange}`;

  return {
    ...paramConfig,
    min,
    max,
    unit,
    category: category || (isDccDrainLiq || isSoxDrainLiq || isAbsorberDrainLiq ? 'onceInAWeek' : undefined),
    shift: paramConfig.shift,
    frequency: paramConfig.frequency || (isOffsetDMWater ? 'Day' : isDccDrainLiq || isSoxDrainLiq || isAbsorberDrainLiq ? 'Once in a Week' : isLean ? (category === 'day' ? 'Day' : category === 'onceInAWeek' ? 'Once in a Week' : 'Once in a shift') : (isBL1204 || isAbsorberInlet || isOutlet || isRich || isWashwater || isP1256 || isReflux || isTK1251 || isTK1252) ? 'Once in a shift' : (isTK204 || isTK209) ? 'Once in a shift' : isSAP417 ? 'Shift Twice' : (isTK203 || isTK205 || isTK207) ? 'SHIFT TWICE' : isSAT401 ? 'Once in a Shift' : isSABicarbonateMoisture ? 'Once in 4 Hours' : isLSABaggingSieve ? '1 Hour Once' : isLSABagging ? (category === 'onceIn1Hour' ? '1 Hour Once' : 'Once in a Shift') : isSALSA ? 'Once in a Shift' : (isE501 || isT501 || isE501T501) ? 'Once in a Shift' : isSAGasConc ? 'Once in a Shift' : isBrine ? 'WEEK' : undefined),
    formattedTarget: paramConfig.formattedTarget || (formattedTarget !== undefined ? `${formattedTarget}${unit === '%' ? '%' : ' ' + unit}` : undefined),
    formattedTolerance: paramConfig.formattedTolerance || (formattedTolerance !== undefined ? `± ${formattedTolerance}${unit === '%' ? '%' : ' ' + unit}` : undefined),
    formattedRange,
    formattedLabel,
  };
};

/**
 * Validates a single cell value against its configured limit.
 *
 * @param {string|number} rawValue - User-entered value
 * @param {object|null} limitConfig - Config returned by getCellLimit
 * @returns {object} { isValid: boolean, status: string, message: string, min, max, target, tolerance, isNormal, isOutOfLimit }
 */
export const validateCellValue = (rawValue, limitConfig) => {
  // 1. Empty is valid until submitted (optional/pending field)
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return {
      isValid: true,
      status: 'empty',
      message: '',
      limitConfig,
      isNormal: true,
      isOutOfLimit: false,
    };
  }

  const str = String(rawValue).trim();

  // Special check: If limit is "Nil" (e.g. TH in Offset DM Water) or non-numerical limit
  if (limitConfig && (limitConfig.isNil || limitConfig.hasNumericLimit === false || (limitConfig.min === undefined && limitConfig.max === undefined))) {
    return {
      isValid: true,
      status: 'normal',
      isNormal: true,
      isOutOfLimit: false,
      message: limitConfig.formattedRange || 'Nil',
      target: limitConfig.target,
      tolerance: limitConfig.tolerance,
      limitConfig,
    };
  }

  // 2. Numeric format validation
  if (!/^-?\d*\.?\d+$/.test(str)) {
    return {
      isValid: false,
      status: 'invalid_format',
      message: 'Numeric values only',
      limitConfig,
      isNormal: false,
      isOutOfLimit: false,
    };
  }

  const num = parseFloat(str);
  if (isNaN(num)) {
    return {
      isValid: false,
      status: 'invalid_format',
      message: 'Invalid number',
      limitConfig,
      isNormal: false,
      isOutOfLimit: false,
    };
  }

  // 3. Limit boundary check if a limit config exists
  if (limitConfig) {
    const { min, max, unit = '%' } = limitConfig;
    const EPSILON = 0.000001; // Avoid floating point rounding issues at exact boundaries
    const isBelowMin = min !== undefined && num < min - EPSILON;
    const isAboveMax = max !== undefined && num > max + EPSILON;

    const formattedRange = limitConfig.formattedRange || (unit === 'g/L' ? `${min}–${max} g/L` : unit === '' ? `${min}–${max}` : `${min.toFixed(2)}% – ${max.toFixed(2)}%`);

    if (isBelowMin || isAboveMax) {
      return {
        isValid: false,
        status: 'out_of_limit',
        isOutOfLimit: true,
        isNormal: false,
        message: `Out of limit: ${formattedRange}`,
        min,
        max,
        unit,
        target: limitConfig.target,
        tolerance: limitConfig.tolerance,
        limitConfig,
      };
    }

    return {
      isValid: true,
      status: 'normal',
      isOutOfLimit: false,
      isNormal: true,
      message: 'Normal',
      min,
      max,
      unit,
      target: limitConfig.target,
      tolerance: limitConfig.tolerance,
      limitConfig,
    };
  }

  // General positive number check if no specific limit
  return {
    isValid: true,
    status: 'normal',
    isOutOfLimit: false,
    isNormal: true,
    message: 'Valid',
    limitConfig: null,
  };
};

/**
 * Validates an entire analysis data grid.
 *
 * @param {object} gridData - { [rowKey]: { [paramKey]: value } }
 * @param {string} plantKey
 * @param {string} analysisType
 * @returns {object} { isValid: boolean, errors: { [cellKey]: errorObj }, outOfRangeCount: number }
 */
export const validateFullDataset = (gridData, plantKey = 'acl', analysisType = 'pure-salt') => {
  const errors = {};
  let outOfRangeCount = 0;
  let hasFormatError = false;

  Object.entries(gridData || {}).forEach(([rowKey, rowValues]) => {
    Object.entries(rowValues || {}).forEach(([paramKey, value]) => {
      // Basic numeric validation
      if (value !== '' && value !== null && value !== undefined) {
        const str = String(value).trim();
        if (!/^-?\d*\.?\d+$/.test(str) || isNaN(parseFloat(str))) {
          errors[`${rowKey}_${paramKey}`] = {
            isValid: false,
            status: 'invalid_format',
            message: 'Must be a valid number',
          };
          hasFormatError = true;
          return;
        }
      }

      // Tolerance limits validation (ONLY when feature flag is enabled)
      if (PURE_SALT_LIMIT_VALIDATION_ENABLED) {
        const limit = getCellLimit(plantKey, analysisType, rowKey, paramKey);
        const res = validateCellValue(value, limit);

        const cellKey = `${rowKey}_${paramKey}`;
        if (!res.isValid) {
          errors[cellKey] = res;
          if (res.isOutOfLimit || res.status === 'out_of_limit' || res.status === 'out_of_range') {
            outOfRangeCount++;
          }
        }
      }
    });
  });

  return {
    isValid: !hasFormatError,
    hasFormatError,
    errors,
    outOfRangeCount,
    outOfLimitCount: outOfRangeCount,
  };
};
