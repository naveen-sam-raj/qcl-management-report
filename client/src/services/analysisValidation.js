/**
 * Centralized Analysis Limits & Validation Service
 * Defines reference targets, allowed tolerance ranges, and boundary calculators
 * for industrial chemical analysis parameters across plant units.
 */

// ─── Centralized Parameter Limits Registry ────────────────────────────────────
// Target values and allowed tolerances can be updated here without changing UI components.
export const ANALYSIS_LIMITS_REGISTRY = {
  acl: {
    'pure-salt': {
      // Applied to Shift I, II, III rows
      shift: {
        ca:  { target: 0.10, tolerance: 0.05, unit: '%' }, // Allowed: 0.05% - 0.15%
        mg:  { target: 0.04, tolerance: 0.06, unit: '%' }, // Allowed: 0.00% - 0.10%
      },
      // Applied to Daily summary / Composition and Raw Salt rows
      day: {
        nacl: { target: 92.00, tolerance: 0.10, unit: '%' }, // Allowed: 91.90% - 92.10%
        ca:   { target: 0.14,  tolerance: 0.05, unit: '%' }, // Allowed: 0.09% - 0.19%
        mg:   { target: 0.05,  tolerance: 0.05, unit: '%' }, // Allowed: 0.00% - 0.10%
        so4:  { target: 0.46,  tolerance: 0.10, unit: '%' }, // Allowed: 0.36% - 0.56%
        ir:   { target: 0.30,  tolerance: 0.20, unit: '%' }, // Allowed: 0.10% - 0.50%
        h2o:  { target: 7.00,  tolerance: 1.00, unit: '%' }, // Allowed: 6.00% - 8.00%
      },
    },
  },
};

/**
 * Calculates min and max permitted values given target and tolerance
 */
export const calculateRange = (target, tolerance) => {
  const min = Math.max(0, parseFloat((target - tolerance).toFixed(4)));
  const max = parseFloat((target + tolerance).toFixed(4));
  return { min, max };
};

/**
 * Maps a row key to its corresponding limit category ('shift' or 'day')
 * Raw salt has no limits as requested by user.
 */
export const getRowCategory = (rowKey) => {
  if (rowKey === 'rawSalt') {
    return null; // No limit for RAW SALT
  }
  if (['shift1', 'shift2', 'shift3'].includes(rowKey)) {
    return 'shift';
  }
  if (rowKey === 'composition') {
    return 'day';
  }
  return null;
};

// Toggle to enable/disable tolerance limits (currently disabled as requested by user)
export const LIMITS_ENABLED = false;

/**
 * Retrieves the configured limit for a specific plant, analysis type, row, and parameter.
 * Returns null if no specific target/tolerance is defined for that cell.
 */
export const getCellLimit = (plantKey = 'acl', analysisType = 'pure-salt', rowKey, paramKey) => {
  if (!LIMITS_ENABLED) return null;

  const category = getRowCategory(rowKey);
  if (!category) return null;

  const plantLimits = ANALYSIS_LIMITS_REGISTRY[plantKey?.toLowerCase()] || ANALYSIS_LIMITS_REGISTRY.acl;
  const analysisLimits = plantLimits[analysisType] || plantLimits['pure-salt'];
  if (!analysisLimits) return null;

  const categoryLimits = analysisLimits[category];
  const paramConfig = categoryLimits ? categoryLimits[paramKey] : null;

  if (!paramConfig) return null;

  const { min, max } = calculateRange(paramConfig.target, paramConfig.tolerance);
  return {
    ...paramConfig,
    min,
    max,
    category,
    formattedTarget: paramConfig.target.toFixed(2),
    formattedTolerance: `±${paramConfig.tolerance.toFixed(2)}`,
    formattedRange: `${min.toFixed(2)}% - ${max.toFixed(2)}%`,
    formattedLabel: `Limit: ${min.toFixed(2)}% - ${max.toFixed(2)}%`,
  };
};

/**
 * Validates a single cell value against its configured limit.
 *
 * @param {string|number} rawValue - User-entered value
 * @param {object|null} limitConfig - Config returned by getCellLimit
 * @returns {object} { isValid: boolean, status: string, message: string, min, max, target, tolerance }
 */
export const validateCellValue = (rawValue, limitConfig) => {
  // 1. Empty is valid until submitted (optional/pending field)
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return {
      isValid: true,
      status: 'empty',
      message: '',
      limitConfig,
    };
  }

  const str = String(rawValue).trim();

  // 2. Numeric format validation
  if (!/^-?\d*\.?\d+$/.test(str)) {
    return {
      isValid: false,
      status: 'invalid_format',
      message: 'Numeric values only',
      limitConfig,
    };
  }

  const num = parseFloat(str);
  if (isNaN(num)) {
    return {
      isValid: false,
      status: 'invalid_format',
      message: 'Invalid number',
      limitConfig,
    };
  }

  // 3. Limit boundary check if a limit config exists
  if (limitConfig) {
    const { min, max, unit = '%' } = limitConfig;
    if (num < min || num > max) {
      return {
        isValid: false,
        status: 'out_of_range',
        message: `Value must be between ${min.toFixed(2)} and ${max.toFixed(2)}${unit}`,
        min,
        max,
        target: limitConfig.target,
        tolerance: limitConfig.tolerance,
        limitConfig,
      };
    }

    return {
      isValid: true,
      status: 'in_range',
      message: 'In Spec',
      min,
      max,
      target: limitConfig.target,
      tolerance: limitConfig.tolerance,
      limitConfig,
    };
  }

  // General positive number check if no specific limit
  return {
    isValid: true,
    status: 'in_range',
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
      const limit = getCellLimit(plantKey, analysisType, rowKey, paramKey);
      const res = validateCellValue(value, limit);

      const cellKey = `${rowKey}_${paramKey}`;
      if (!res.isValid) {
        errors[cellKey] = res;
        if (res.status === 'out_of_range') outOfRangeCount++;
        if (res.status === 'invalid_format') hasFormatError = true;
      }
    });
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    outOfRangeCount,
    hasFormatError,
  };
};
