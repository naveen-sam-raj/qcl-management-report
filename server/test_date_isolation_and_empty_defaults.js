const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { PlantAnalysisRecord, User } = require('./models');

// Test dates
const TEST_DATE_EMPTY = '2026-10-25'; // A date with zero records
const TEST_DATE_USER = '2026-10-16';  // The user's specified date where Distiller Waste had no record
const TEST_DATE_SAVED = '2026-10-24'; // Dedicated date for save/switch test

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING DATE ISOLATION & EMPTY DEFAULTS AUTOMATED TEST SUITE');
  console.log('========================================================================');

  await connectDB();

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      testPassed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      testFailed++;
    }
  }

  try {
    // Clean up any test records from prior runs
    await PlantAnalysisRecord.deleteMany({
      date: { $in: [TEST_DATE_EMPTY, TEST_DATE_SAVED] },
      submittedBy: 'Automated-Test-Runner',
    });

    const mockResGenerator = () => {
      let resStatus = 200;
      let resData = null;
      return {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            },
          };
        },
        getStatus: () => resStatus,
        getData: () => resData,
      };
    };

    const mockReq = {
      query: { date: TEST_DATE_EMPTY },
      user: { _id: 'test_user_id', name: 'Tester', company: null },
    };

    // -------------------------------------------------------------------------
    // TEST 1: New date with no record returns data: null across all routes
    // -------------------------------------------------------------------------
    console.log(`\n--- TEST 1: Verify New Date (${TEST_DATE_EMPTY}) Returns data: null (No Demo Values) ---`);

    const routesToTest = [
      { name: 'Distiller Waste', route: require('./routes/distillerWasteAnalysisRoutes') },
      { name: 'BFW', route: require('./routes/bfwAnalysisRoutes') },
      { name: 'Bottom Ash', route: require('./routes/bottomAshAnalysisRoutes') },
      { name: 'Fly Ash', route: require('./routes/flyAshAnalysisRoutes') },
      { name: 'Sewer Water', route: require('./routes/sewerWaterAnalysisRoutes') },
      { name: 'Vacuum Seal Water', route: require('./routes/vacuumSealWaterRoutes') },
      { name: 'CBD', route: require('./routes/cbdAnalysisRoutes') },
      { name: 'Raw Water', route: require('./routes/rawWaterAnalysisRoutes') },
      { name: 'Gas Conc', route: require('./routes/gasConcRoutes') },
    ];

    for (const item of routesToTest) {
      mockReq.query = { date: TEST_DATE_EMPTY };
      const res = mockResGenerator();
      const getLayer = item.route.stack.find((l) => l.route && l.route.methods.get);
      if (getLayer) {
        await getLayer.route.stack[0].handle(mockReq, res, () => {});
        const data = res.getData();
        assert(res.getStatus() === 200, `${item.name} GET returned HTTP 200`);
        assert(data && data.success === true, `${item.name} GET response success is true`);
        assert(data && data.data === null, `${item.name} GET response data is null (no demo/mock values)`);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 2: User's Date 16/10/2026 Specific Behavior
    // -------------------------------------------------------------------------
    console.log(`\n--- TEST 2: User's Selected Date (${TEST_DATE_USER}) Verification ---`);
    // Distiller Waste had no saved record for 2026-10-16: must return data: null
    mockReq.query = { date: TEST_DATE_USER };
    const dwRes = mockResGenerator();
    const dwRoute = require('./routes/distillerWasteAnalysisRoutes');
    const dwLayer = dwRoute.stack.find((l) => l.route && l.route.methods.get);
    await dwLayer.route.stack[0].handle(mockReq, dwRes, () => {});
    const dwData = dwRes.getData();
    assert(dwData && dwData.data === null, `Distiller Waste Analysis on ${TEST_DATE_USER} returns data: null (Demo values fixed!)`);

    // CBD has an existing saved record for 2026-10-16: must load exact saved values
    const cbdRes = mockResGenerator();
    const cbdRoute = require('./routes/cbdAnalysisRoutes');
    const cbdLayer = cbdRoute.stack.find((l) => l.route && l.route.methods.get);
    await cbdLayer.route.stack[0].handle(mockReq, cbdRes, () => {});
    const cbdData = cbdRes.getData();
    assert(cbdData && cbdData.data !== null, `CBD Analysis on ${TEST_DATE_USER} loads existing saved record`);

    // -------------------------------------------------------------------------
    // TEST 3: Existing Saved Record Returns Exact Saved Values
    // -------------------------------------------------------------------------
    console.log(`\n--- TEST 3: Existing Saved Record Returns Exact Saved Values ---`);
    const testReadings = [
      { id: 't0630', time: '06:30', exCao: '11.22', fnh3: '333', cnh3: '444', tnh3: '777', nahco3: '0' },
      { id: 't0730', time: '07:30', exCao: '12.34', fnh3: '555', cnh3: '666', tnh3: '1221', nahco3: '0' },
    ];

    const savedDoc = await PlantAnalysisRecord.create({
      date: TEST_DATE_SAVED,
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      plant: null,
      analysisType: 'Distiller Waste Analysis',
      submittedBy: 'Automated-Test-Runner',
      data: {
        date: TEST_DATE_SAVED,
        plant: 'OFFSITE',
        analysisType: 'Distiller Waste Analysis',
        readings: testReadings,
      },
    });
    assert(savedDoc && savedDoc._id, `Saved test record created for ${TEST_DATE_SAVED}`);

    mockReq.query = { date: TEST_DATE_SAVED };
    const savedRes = mockResGenerator();
    await dwLayer.route.stack[0].handle(mockReq, savedRes, () => {});
    const savedData = savedRes.getData();
    assert(savedData && savedData.data !== null, `Distiller Waste GET returned non-null data for ${TEST_DATE_SAVED}`);
    assert(savedData.data.readings[0].exCao === '11.22', `Distiller Waste GET returned exact saved exCao: '11.22'`);
    assert(savedData.data.readings[0].fnh3 === '333', `Distiller Waste GET returned exact saved fnh3: '333'`);
    assert(savedData.data.readings[1].exCao === '12.34', `Distiller Waste GET returned exact saved exCao: '12.34'`);

    // -------------------------------------------------------------------------
    // TEST 4: Date Switching Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Date Switching Isolation ---');
    // Switch from saved date to empty date
    mockReq.query = { date: TEST_DATE_EMPTY };
    const emptySwitchRes = mockResGenerator();
    await dwLayer.route.stack[0].handle(mockReq, emptySwitchRes, () => {});
    assert(emptySwitchRes.getData().data === null, `Switching to empty date ${TEST_DATE_EMPTY} returns data: null (no leakage from saved date)`);

    // Switch back to saved date
    mockReq.query = { date: TEST_DATE_SAVED };
    const savedSwitchRes = mockResGenerator();
    await dwLayer.route.stack[0].handle(mockReq, savedSwitchRes, () => {});
    assert(savedSwitchRes.getData().data !== null && savedSwitchRes.getData().data.readings[0].exCao === '11.22', `Switching back to ${TEST_DATE_SAVED} returns exact saved data`);

    // -------------------------------------------------------------------------
    // TEST 5: Cross-Plant Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Cross-Plant Isolation ---');
    // Query SA Gas Conc for the date where OFFSITE has data
    mockReq.query = { date: TEST_DATE_SAVED };
    const saRes = mockResGenerator();
    const gcRoute = require('./routes/gasConcRoutes');
    const gcLayer = gcRoute.stack.find((l) => l.route && l.route.methods.get);
    await gcLayer.route.stack[0].handle(mockReq, saRes, () => {});
    assert(saRes.getData().data === null, `SA Plant query on ${TEST_DATE_SAVED} returns data: null (OFFSITE data never leaks to SA Plant)`);

    // Verify ACL Plant has no records for the OFFSITE date
    const aclDoc = await PlantAnalysisRecord.findOne({
      date: TEST_DATE_SAVED,
      plantCode: { $in: ['ACL', 'ACL Plant'] },
    }).lean();
    assert(aclDoc === null, `ACL Plant has no records for ${TEST_DATE_SAVED} (isolated from OFFSITE record)`);

    // -------------------------------------------------------------------------
    // TEST 6: Frontend Pages Form Initial State & Reset Audit
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Frontend Form Initial State & Date Reset Audit ---');
    const fs = require('fs');
    const dir = path.join(__dirname, '../client/src/pages/company');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx'));

    let pagesChecked = 0;
    let pagesPassing = 0;

    files.forEach((file) => {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      pagesChecked++;

      // Check 1: No demo measurement values in DEFAULT_ROWS or DEFAULT_READINGS
      let hasDemoMeasurement = false;
      if (
        content.includes("fnh3: '272'") ||
        content.includes("cnh3: '1190'") ||
        content.includes("recoveryCo2Con: '80.0'") ||
        content.includes("combustible: '12.5'") ||
        content.includes("bss10: '0.1'")
      ) {
        hasDemoMeasurement = true;
      }

      // Check 2: If file has date fetch with if (response.data && response.data.success && response.data.data),
      // it must have matching outer else or catch reset
      let hasResetHandling = true;
      if (content.includes('if (response.data && response.data.success && response.data.data) {')) {
        const idx = content.indexOf('if (response.data && response.data.success && response.data.data) {');
        let depth = 0;
        let endIdx = -1;
        for (let i = idx; i < content.length; i++) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
        const afterIf = content.substring(endIdx + 1, endIdx + 50).trim();
        hasResetHandling = afterIf.startsWith('else');
      }

      if (!hasDemoMeasurement && hasResetHandling) {
        pagesPassing++;
      } else {
        console.error(`Page ${file} failed audit: demo=${hasDemoMeasurement}, reset=${hasResetHandling}`);
      }
    });

    assert(
      pagesPassing === pagesChecked,
      `All ${pagesChecked} frontend analysis pages initialize cleanly and reset on date changes/null data (${pagesPassing}/${pagesChecked})`
    );

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    await PlantAnalysisRecord.deleteMany({
      date: { $in: [TEST_DATE_EMPTY, TEST_DATE_SAVED] },
      submittedBy: 'Automated-Test-Runner',
    });
    console.log('\nCleaned up automated test artifacts from database.');

  } catch (err) {
    console.error('Test suite encountered an unexpected error:', err);
    testFailed++;
  } finally {
    await mongoose.connection.close();
    console.log('========================================================================');
    console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('========================================================================');
    if (testFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
