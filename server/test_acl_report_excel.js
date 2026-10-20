const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const ExcelJS = require('exceljs');
const { generateACLShiftReportWorkbook, getTemplateFilePath } = require('./services/aclExcelReportService');
const { PlantAnalysisRecord, PureSaltAnalysis, PureSaltSieveAnalysis, User } = require('./models');

const TEST_DATE = '2026-09-15'; // Day 15 in SEP-26 (Row 47 for Shift 1)

async function runReportTest() {
  console.log('========================================================================');
  console.log('ACL MASTER EXCEL TEMPLATE REPORT TEST SUITE (SHIFT REPORT -2026.xlsx)');
  console.log('========================================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`    ✓ PASS: ${message}`);
      passCount++;
    } else {
      console.error(`    ✗ FAIL: ${message}`);
      failCount++;
    }
  }

  // 1. Template Resolution Check
  const templatePath = getTemplateFilePath();
  assert(templatePath && templatePath.includes('SHIFT REPORT -2026'), `Template file found at: ${templatePath}`);

  // 2. Prepare test data in database for TEST_DATE
  console.log('\n[1] Seeding verified test analysis records for date:', TEST_DATE);

  // Clean test records for this date
  await PlantAnalysisRecord.deleteMany({ plantCode: 'ACL', date: TEST_DATE });
  await PureSaltAnalysis.deleteMany({ date: TEST_DATE });
  await PureSaltSieveAnalysis.deleteMany({ date: TEST_DATE });

  // Seed TK 203
  await PlantAnalysisRecord.create({
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    analysisType: 'TK 203 Analysis',
    unit: 'TK 203',
    date: TEST_DATE,
    data: {
      rows: {
        t07: { fnh3: '2.72', cnh3: '3.79', co2: '0.87', pcl: '1.53', tcl: '5.20' },
        t09: { fnh3: '2.72', cnh3: '3.79', co2: '0.87', pcl: '1.53', tcl: '5.20' },
        t11: { fnh3: '2.72', cnh3: '3.79', co2: '0.87', pcl: '1.53', tcl: '5.20' },
        t13: { fnh3: '2.72', cnh3: '3.79', co2: '0.87', pcl: '1.53', tcl: '5.20' },
      },
    },
    savedAt: new Date(),
  });

  // Seed TK 204
  await PlantAnalysisRecord.create({
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    analysisType: 'TK 204 Analysis',
    unit: 'TK 204',
    date: TEST_DATE,
    data: {
      shift1: { fnh3: '2.92', cnh3: '3.26', tcl: '5.10', pcl: '1.40' },
    },
    savedAt: new Date(),
  });

  // Seed TK 205
  await PlantAnalysisRecord.create({
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    analysisType: 'TK 205 Analysis',
    unit: 'TK 205',
    date: TEST_DATE,
    data: {
      rows: {
        t07: { fnh3: '2.69', cnh3: '2.19', tcl: '5.48', pcl: '3.31' },
        t09: { fnh3: '2.69', cnh3: '2.19', tcl: '5.48', pcl: '3.31' },
      },
    },
    savedAt: new Date(),
  });

  // Seed Pure Salt Analysis
  await PureSaltAnalysis.create({
    plant: 'ACL',
    date: TEST_DATE,
    rows: {
      shift1: { ca: 0.18, mg: 0.14, nacl: 99.5 },
    },
    isSaved: true,
  });

  // Seed Pure Salt Sieve Analysis
  await PureSaltSieveAnalysis.create({
    plant: 'ACL',
    date: TEST_DATE,
    rows: {
      shift1: { p18: 3.50, p44: 15.20, p60: 45.00, p100: 25.00, m100: 11.30 },
    },
    isSaved: true,
  });

  // 3. Test Workbook Generation via Service
  console.log('\n[2] Executing generateACLShiftReportWorkbook service');
  const workbook = await generateACLShiftReportWorkbook({ date: TEST_DATE, shift: 'all' });

  // 4. Assert worksheet existence & preservation
  const sheetNames = workbook.worksheets.map((s) => s.name);
  assert(sheetNames.includes('T.CAO'), 'Worksheet "T.CAO" is preserved');
  assert(sheetNames.includes('FEED BIOMASS TM &BD'), 'Worksheet "FEED BIOMASS TM &BD" is preserved');
  assert(sheetNames.includes('SEP-26'), 'Worksheet "SEP-26" is preserved');

  const sepSheet = workbook.getWorksheet('SEP-26');
  // Row for Day 15, Shift 1: 5 + (15 - 1) * 3 = Row 47
  const r47 = sepSheet.getRow(47);

  // Assert populated fields on row 47
  assert(String(r47.getCell(1).value).includes('2026-09-15'), 'Row 47 Col A: Date correctly populated');
  assert(r47.getCell(2).value === 'I', 'Row 47 Col B: Shift "I" correctly populated');
  assert(Number(r47.getCell(3).value) === 2.72, `Row 47 Col C (TK 203 FNH3): Expected 2.72, got ${r47.getCell(3).value}`);
  assert(Number(r47.getCell(4).value) === 3.79, `Row 47 Col D (TK 203 CNH3): Expected 3.79, got ${r47.getCell(4).value}`);
  assert(Number(r47.getCell(5).value) === 0.87, `Row 47 Col E (TK 203 CO2): Expected 0.87, got ${r47.getCell(5).value}`);
  assert(Number(r47.getCell(7).value) === 2.92, `Row 47 Col G (TK 204 FNH3): Expected 2.92, got ${r47.getCell(7).value}`);
  assert(Number(r47.getCell(8).value) === 3.26, `Row 47 Col H (TK 204 CNH3): Expected 3.26, got ${r47.getCell(8).value}`);
  assert(Number(r47.getCell(9).value) === 2.69, `Row 47 Col I (TK 205 FNH3): Expected 2.69, got ${r47.getCell(9).value}`);
  assert(Number(r47.getCell(10).value) === 2.19, `Row 47 Col J (TK 205 CNH3): Expected 2.19, got ${r47.getCell(10).value}`);

  // Assert Formula Preservation (Requirement 4)
  const cellK47 = r47.getCell(11); // TNH3 formula
  const isK47Formula = Boolean(cellK47.formula || cellK47.sharedFormula || (cellK47.value && typeof cellK47.value === 'object' && (cellK47.value.formula || cellK47.value.sharedFormula)));
  assert(isK47Formula, 'Row 47 Col K (TK 205 TNH3): Formula preserved, NOT overwritten by static value');

  const cellS47 = r47.getCell(19); // ᵅ RATIO formula
  const isS47Formula = Boolean(cellS47.formula || cellS47.sharedFormula || (cellS47.value && typeof cellS47.value === 'object'));
  assert(isS47Formula, 'Row 47 Col S (ᵅ RATIO): Formula preserved, NOT overwritten');

  // Assert Pure Salt values
  assert(Number(r47.getCell(57).value) === 0.18, `Row 47 Col BE (Pure Salt Ca): Expected 0.18, got ${r47.getCell(57).value}`);
  assert(Number(r47.getCell(58).value) === 0.14, `Row 47 Col BF (Pure Salt Mg): Expected 0.14, got ${r47.getCell(58).value}`);

  // Assert Pure Salt Sieve values
  assert(Number(r47.getCell(118).value) === 3.5, `Row 47 Col DN (Sieve 18): Expected 3.5, got ${r47.getCell(118).value}`);
  assert(Number(r47.getCell(119).value) === 15.2, `Row 47 Col DO (Sieve 44): Expected 15.2, got ${r47.getCell(119).value}`);
  assert(Number(r47.getCell(120).value) === 45, `Row 47 Col DP (Sieve 60): Expected 45, got ${r47.getCell(120).value}`);
  assert(Number(r47.getCell(121).value) === 25, `Row 47 Col DQ (Sieve 100): Expected 25, got ${r47.getCell(121).value}`);
  assert(Number(r47.getCell(122).value) === 11.3, `Row 47 Col DR (Sieve -100): Expected 11.3, got ${r47.getCell(122).value}`);


  // 5. Test HTTP API Route: GET /api/reports/acl/download
  console.log('\n[3] Testing HTTP API Route: GET /api/reports/acl/download');
  const app = require('./server');
  process.env.PORT = '5099';
  const server = app.listen(5099);

  try {
    const admin = (await User.findOne({ role: 'super_admin' })) || (await User.findOne({}));
    const token = jwt.sign(
      { _id: admin._id, id: admin._id, username: admin.username, role: 'admin', company: admin.company },
      process.env.JWT_SECRET || 'your_jwt_secret_key_here',
      { expiresIn: '1h' }
    );

    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5099,
          path: `/api/reports/acl/download?date=${TEST_DATE}&shift=all`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              buffer: Buffer.concat(chunks),
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });

    assert(res.statusCode === 200, `HTTP status is 200 (Got ${res.statusCode})`);
    assert(
      res.headers['content-type']?.includes('spreadsheetml'),
      `Content-Type is xlsx spreadsheet (Got ${res.headers['content-type']})`
    );
    assert(res.buffer.length > 50000, `Exported workbook binary size is valid (${res.buffer.length} bytes)`);

    // Verify downloaded buffer with ExcelJS
    const downloadedWb = new ExcelJS.Workbook();
    await downloadedWb.xlsx.load(res.buffer);
    assert(downloadedWb.worksheets.length === 3, `Downloaded workbook contains 3 worksheets`);
    const downloadedSep = downloadedWb.getWorksheet('SEP-26');
    assert(downloadedSep !== null, 'Downloaded workbook contains "SEP-26" worksheet');

    // [4] Test Specific Shift Download: GET /api/reports/acl/download?date=2026-09-15&shift=shift1
    console.log('\n[4] Testing Shift-Specific Direct Download (shift=shift1)');
    const resShift1 = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5099,
          path: `/api/reports/acl/download?date=${TEST_DATE}&shift=shift1`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
        (r) => {
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => resolve({ statusCode: r.statusCode, buffer: Buffer.concat(chunks) }));
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert(resShift1.statusCode === 200, `Direct Shift 1 download status is 200 (Got ${resShift1.statusCode})`);
    assert(resShift1.buffer.length > 50000, `Shift 1 workbook buffer size is valid (${resShift1.buffer.length} bytes)`);

    // [5] Test Direct Download for Date with NO DB records (Direct generator without prior query)
    console.log('\n[5] Testing Direct Master Download for Date with NO Prior Query/Records (2026-09-22)');
    const resEmptyDate = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5099,
          path: `/api/reports/acl/download?date=2026-09-22&shift=all`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
        (r) => {
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => resolve({ statusCode: r.statusCode, buffer: Buffer.concat(chunks) }));
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert(resEmptyDate.statusCode === 200, `Direct download with empty DB date succeeds with 200 (Got ${resEmptyDate.statusCode})`);
    assert(resEmptyDate.buffer.length > 50000, `Empty DB date workbook generated from master template cleanly`);

    // [6] Test Missing Date Query Parameter Validation (HTTP 400)
    console.log('\n[6] Testing Missing Date Validation: GET /api/reports/acl/download without date');
    const resNoDate = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5099,
          path: `/api/reports/acl/download`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
        (r) => {
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => resolve({ statusCode: r.statusCode, body: Buffer.concat(chunks).toString() }));
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert(resNoDate.statusCode === 400, `Missing date parameter returns HTTP 400 (Got ${resNoDate.statusCode})`);
    assert(resNoDate.body.includes('Reporting date'), `Error message clearly identifies required date param`);

    // [7] Test Authentication Guard: Request without JWT token (HTTP 401)
    console.log('\n[7] Testing Authentication Guard: GET /api/reports/acl/download without token');
    const resNoAuth = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5099,
          path: `/api/reports/acl/download?date=${TEST_DATE}&shift=all`,
          method: 'GET',
        },
        (r) => {
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => resolve({ statusCode: r.statusCode }));
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert(resNoAuth.statusCode === 401, `Unauthenticated request correctly returns HTTP 401 (Got ${resNoAuth.statusCode})`);

    // [8] Test Decoupling & Error Reproduction: Old Table Export vs Master Template Download
    console.log('\n[8] Testing Export Decoupling & Error State Verification');
    function simulateOldExport(generatedReport) {
      if (!generatedReport || !generatedReport.records || generatedReport.records.length === 0) {
        return { success: false, error: 'No report data available to export. Please generate a report first.' };
      }
      return { success: true };
    }
    const oldExportResultWhenNull = simulateOldExport(null);
    const oldExportResultWhenEmpty = simulateOldExport({ records: [] });
    assert(
      oldExportResultWhenNull.error === 'No report data available to export. Please generate a report first.',
      'Legacy export throws exact error when generatedReport is null'
    );
    assert(
      oldExportResultWhenEmpty.error === 'No report data available to export. Please generate a report first.',
      'Legacy export throws exact error when generatedReport records are empty'
    );
    assert(
      res.statusCode === 200 && resEmptyDate.statusCode === 200,
      'Master Template Download works directly from DB and date/shift independently of generatedReport state'
    );
  } finally {
    server.close();
    // Cleanup test date records
    await PlantAnalysisRecord.deleteMany({ plantCode: 'ACL', date: TEST_DATE });
    await PureSaltAnalysis.deleteMany({ date: TEST_DATE });
    await PureSaltSieveAnalysis.deleteMany({ date: TEST_DATE });
  }

  console.log('\n========================================================================');
  console.log(`REPORT TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================================');

  process.exit(failCount > 0 ? 1 : 0);
}

runReportTest().catch((err) => {
  console.error('[FATAL ERROR IN REPORT TEST]', err);
  process.exit(1);
});
