/**
 * Exact mapping of plant codes and UI names to the 4 canonical backend plant codes:
 * 'ACL' | 'SA' | 'OFFSITE' | 'CO2'
 */
const EXACT_PLANT_MAP = {
  // Exact Codes
  ACL: 'ACL',
  SA: 'SA',
  OFFSITE: 'OFFSITE',
  OFFSET: 'OFFSITE',
  CO2: 'CO2',
  C02: 'CO2',

  // Names with 'PLANT' / Slug forms
  'ACL PLANT': 'ACL',
  'PLANT ACL': 'ACL',
  'PLANT_ACL': 'ACL',
  'PLANT-ACL': 'ACL',

  'SA PLANT': 'SA',
  'PLANT SA': 'SA',
  'PLANT_SA': 'SA',
  'PLANT-SA': 'SA',

  'OFFSITE PLANT': 'OFFSITE',
  'OFFSET PLANT': 'OFFSITE',
  'PLANT OFFSITE': 'OFFSITE',
  'PLANT OFFSET': 'OFFSITE',
  'PLANT_OFFSITE': 'OFFSITE',
  'PLANT_OFFSET': 'OFFSITE',
  'PLANT-OFFSITE': 'OFFSITE',
  'PLANT-OFFSET': 'OFFSITE',

  'CO2 PLANT': 'CO2',
  'C02 PLANT': 'CO2',
  'PLANT CO2': 'CO2',
  'PLANT_CO2': 'CO2',
  'PLANT-CO2': 'CO2',
};

/**
 * Normalizes a single raw value into an exact plant code ('ACL'|'SA'|'OFFSITE'|'CO2') or null.
 * Strictly uses exact matching against known codes and names.
 */
function matchExactCode(val) {
  if (!val) return null;
  const str = String(val).trim().toUpperCase();
  if (EXACT_PLANT_MAP[str]) {
    return EXACT_PLANT_MAP[str];
  }
  return null;
}

/**
 * Normalizes plant identifier from a sequence of candidate sources.
 * Inspects each candidate in order and returns { plantCode, source } on first match.
 *
 * @param {Array<{ source: string, value: any }>} candidatesWithSource
 * @returns {{ plantCode: 'ACL' | 'SA' | 'OFFSITE' | 'CO2' | null, source: string | null }}
 */
export function resolvePlantCode(candidatesWithSource = []) {
  for (const { source, value } of candidatesWithSource) {
    if (!value) continue;

    if (typeof value === 'object') {
      // Check code, name, title in order
      const codeMatch = matchExactCode(value.code);
      if (codeMatch) return { plantCode: codeMatch, source: `${source}.code` };

      const nameMatch = matchExactCode(value.name);
      if (nameMatch) return { plantCode: nameMatch, source: `${source}.name` };

      const titleMatch = matchExactCode(value.title);
      if (titleMatch) return { plantCode: titleMatch, source: `${source}.title` };

      const idMatch = matchExactCode(value.id);
      if (idMatch) return { plantCode: idMatch, source: `${source}.id` };
    } else {
      const directMatch = matchExactCode(value);
      if (directMatch) return { plantCode: directMatch, source };
    }
  }

  return { plantCode: null, source: null };
}

/**
 * Convenience helper returning just the plantCode ('ACL' | 'SA' | 'OFFSITE' | 'CO2' | null)
 */
export function normalizePlantCode(...candidates) {
  const wrapped = candidates.map((c, i) => ({ source: `candidate[${i}]`, value: c }));
  const { plantCode } = resolvePlantCode(wrapped);
  return plantCode;
}
