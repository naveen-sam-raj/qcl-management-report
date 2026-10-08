import { getCellLimit, validateCellValue } from './client/src/services/analysisValidation.js';

const fields = ['nacl', 'ca', 'mg', 'so4', 'ir', 'h2o'];
fields.forEach(f => {
  const limit = getCellLimit('acl', 'pure-salt', 'composition', f);
  console.log(f.toUpperCase(), '-> Target:', limit.target, 'Min:', limit.min, 'Max:', limit.max);
});

