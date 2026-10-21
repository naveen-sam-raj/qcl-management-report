/**
 * cleanTemplate.js
 * One-time: clear demo data from master Excel template.
 * Preserves formatting, borders, column widths, merged cells, header rows.
 */
const path = require('path');
const ExcelJS = require('exceljs');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'SHIFT REPORT -2026.xlsx');

function clearDataRows(sheet, firstDataRow) {
  let cleared = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < firstDataRow) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        cell.value = null;
        cleared++;
      }
    });
    row.commit();
  });
  return cleared;
}

async function main() {
  console.log('Reading:', TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  const sep26 = workbook.getWorksheet('SEP-26');
  if (!sep26) { console.error('Sheet SEP-26 not found'); process.exit(1); }
  console.log('SEP-26: cleared', clearDataRows(sep26, 5), 'cells');

  const tcao = workbook.getWorksheet('T.CAO');
  if (tcao) console.log('T.CAO: cleared', clearDataRows(tcao, 6), 'cells');
  else console.warn('T.CAO not found, skipping');

  const feed = workbook.getWorksheet('FEED BIOMASS TM &BD');
  if (feed) console.log('FEED BIOMASS: cleared', clearDataRows(feed, 3), 'cells');
  else console.warn('FEED BIOMASS not found, skipping');

  await workbook.xlsx.writeFile(TEMPLATE_PATH);
  console.log('Saved:', TEMPLATE_PATH);
}
main().catch(e => { console.error(e.message); process.exit(1); });
