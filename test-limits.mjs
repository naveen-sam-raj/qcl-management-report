import { getCellLimit, validateCellValue } from './client/src/services/analysisValidation.js';

console.log("--- SHIFT Ca ---");
const shiftCaLimit = getCellLimit('acl', 'pure-salt', 'shift1', 'ca');
console.log(shiftCaLimit);
console.log("0.05:", validateCellValue('0.05', shiftCaLimit));
console.log("0.15:", validateCellValue('0.15', shiftCaLimit));
console.log("0.04:", validateCellValue('0.04', shiftCaLimit));
console.log("0.16:", validateCellValue('0.16', shiftCaLimit));

console.log("--- DAY NaCl ---");
const dayNaclLimit = getCellLimit('acl', 'pure-salt', 'composition', 'nacl');
console.log(dayNaclLimit);
console.log("91.90:", validateCellValue('91.90', dayNaclLimit));
console.log("92.10:", validateCellValue('92.10', dayNaclLimit));
console.log("91.89:", validateCellValue('91.89', dayNaclLimit));
console.log("92.11:", validateCellValue('92.11', dayNaclLimit));

console.log("--- DAY Ca ---");
const dayCaLimit = getCellLimit('acl', 'pure-salt', 'composition', 'ca');
console.log(dayCaLimit);
console.log("0.09:", validateCellValue('0.09', dayCaLimit));
console.log("0.19:", validateCellValue('0.19', dayCaLimit));
console.log("0.08:", validateCellValue('0.08', dayCaLimit));
console.log("0.20:", validateCellValue('0.20', dayCaLimit));

