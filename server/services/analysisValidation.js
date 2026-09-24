/**
 * Server-Side Analysis Validation Service
 * Enforces parameter target values and allowed tolerance ranges before saving data to database.
 */

const ANALYSIS_LIMITS_REGISTRY = {
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

const calculateRange = (target, tolerance) => {
  const min = Math.max(0, parseFloat((target - tolerance).toFixed(4)));
  const max = parseFloat((target + tolerance).toFixed(4));
  return { min, max };
};

const getRowCategory = (rowKey) => {
  if (rowKey === 'rawSalt') {
    return null; // Raw salt has no limits as requested by user
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
const LIMITS_ENABLED = false;

const getCellLimit = (plantKey = 'acl', analysisType = 'pure-salt', rowKey, paramKey) => {
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
  };
};

/**
 * Validates the full analysis payload sent to the backend.
 *
 * @param {object} payload - { plant, analysisType, date, rows: { [rowKey]: { [paramKey]: number } } }
 * @returns {object} { isValid: boolean, errors: string[], errorDetails: object }
 */
const validateAnalysisPayload = (payload) => {
  const errors = [];
  const errorDetails = {};

  if (!payload) {
    return { isValid: false, errors: ['Payload cannot be empty'], errorDetails: {} };
  }

  if (!payload.date) {
    errors.push('Analysis Date is required.');
    errorDetails.date = 'Date is required.';
  }

  const plantKey = (payload.plant || 'acl').toLowerCase();
  const analysisType = (payload.analysisType || 'pure-salt').toLowerCase().replace(/\s+/g, '-');
  const rows = payload.rows || {};

  Object.entries(rows).forEach(([rowKey, paramValues]) => {
    if (typeof paramValues !== 'object' || paramValues === null) return;

    Object.entries(paramValues).forEach(([paramKey, val]) => {
      // If empty string or null or undefined, treat as blank (allowed unless mandatory)
      if (val === '' || val === null || val === undefined) return;

      const num = Number(val);
      if (isNaN(num)) {
        const msg = `Row '${rowKey}', parameter '${paramKey}' must be a valid number. Received: ${val}`;
        errors.push(msg);
        errorDetails[`${rowKey}_${paramKey}`] = msg;
        return;
      }

      const limit = getCellLimit(plantKey, analysisType, rowKey, paramKey);
      if (limit) {
        if (num < limit.min || num > limit.max) {
          const msg = `${rowKey.toUpperCase()} - ${paramKey.toUpperCase()}: Value ${num} is out of permitted range [${limit.min.toFixed(2)} - ${limit.max.toFixed(2)}${limit.unit}]. (Target: ${limit.target.toFixed(2)}, Tolerance: ±${limit.tolerance.toFixed(2)})`;
          errors.push(msg);
          errorDetails[`${rowKey}_${paramKey}`] = {
            value: num,
            min: limit.min,
            max: limit.max,
            target: limit.target,
            tolerance: limit.tolerance,
            message: `Value must be between ${limit.min.toFixed(2)} and ${limit.max.toFixed(2)}${limit.unit}`,
          };
        }
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
    errorDetails,
  };
};

module.exports = {
  ANALYSIS_LIMITS_REGISTRY,
  calculateRange,
  getRowCategory,
  getCellLimit,
  validateAnalysisPayload,
};
