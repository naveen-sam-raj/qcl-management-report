const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');

process.env.PORT = '5098';
process.env.NODE_ENV = 'test';

const app = require('./server');

const TEST_DATE = '2026-10-29'; // Unique future test date
let serverInstance = null;
let authToken = null;

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

const ANALYSES = [
  {
    name: 'Pure Salt Analysis',
    route: '/api/pure-salt-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      rows: {
        [shiftKey]: {
          nacl: String(99.0 + val),
          moisture: '0.1',
          matterInsolubleInWater: '0.02',
          calciumCa: '0.01',
          magnesiumMg: '0.01',
          sulphateSO4: '0.05',
        },
      },
    }),
  },
  {
    name: 'Pure Salt Sieve Analysis',
    route: '/api/pure-salt-sieve-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      rows: {
        [shiftKey]: {
          m16: String(1.0 + val),
          m20: '2.0',
          m30: '10.0',
          m40: '30.0',
          m50: '35.0',
          m70: '15.0',
          m100: '5.0',
          pan: '2.0',
        },
      },
    }),
  },
  {
    name: 'TK 203 Analysis',
    route: '/api/tk-203-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      shiftRows: {
        [shiftKey]: {
          t07: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t09: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t11: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t13: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
          t15: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t17: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t19: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t21: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
          t23: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t01: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t03: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t05: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
        },
      },
    }),
  },
  {
    name: 'TK 204 Analysis',
    route: '/api/tk-204-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      rows: {
        [shiftKey]: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
      },
    }),
  },
  {
    name: 'TK 209 Analysis',
    route: '/api/tk-209-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      rows: {
        [shiftKey]: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
      },
    }),
  },
  {
    name: 'TK 205 Analysis',
    route: '/api/tk-205-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      shiftRows: {
        [shiftKey]: {
          t07: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t09: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t11: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t13: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
          t15: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t17: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t19: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t21: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
          t23: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t01: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t03: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t05: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
        },
      },
    }),
  },
  {
    name: 'TK 207 Analysis',
    route: '/api/tk-207-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      shiftRows: {
        [shiftKey]: {
          t07: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t09: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t11: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t13: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
          t15: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t17: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t19: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t21: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
          t23: { fnh3: String(10 + val), cnh3: '20', tcl: '30', pcl: '40' },
          t01: { fnh3: '11', cnh3: '21', tcl: '31', pcl: '41' },
          t03: { fnh3: '12', cnh3: '22', tcl: '32', pcl: '42' },
          t05: { fnh3: '13', cnh3: '23', tcl: '33', pcl: '43' },
        },
      },
    }),
  },
  {
    name: 'CR 202 Analysis',
    route: '/api/cr-202-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      shiftRows: {
        [shiftKey]: {
          t07: { a: String(1 + val), b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5', avgAH: '4' },
          t11: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5', avgAH: '4' },
          t15: { a: String(1 + val), b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5', avgAH: '4' },
          t19: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5', avgAH: '4' },
          t23: { a: String(1 + val), b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5', avgAH: '4' },
          t03: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5', avgAH: '4' },
          fnh3: '10',
          pcl: '20',
        },
      },
    }),
  },
  {
    name: 'CR 203 Analysis',
    route: '/api/cr-203-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      shiftRows: {
        [shiftKey]: {
          t07: { a: String(1 + val), b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5' },
          t11: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5' },
          t15: { a: String(1 + val), b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5' },
          t19: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5' },
          t23: { a: String(1 + val), b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5' },
          t03: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', avgTcl: '5' },
          fnh3: '10',
          pcl: '20',
        },
      },
    }),
  },
  {
    name: 'Pcl & Tcl Analysis',
    route: '/api/pcl-tcl-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      rows: {
        [shiftKey]: {
          a: String(0.05 + val),
          b: '0.06',
          c: '0.07',
          d: '0.08',
          e: '0.09',
          f: '0.10',
          g: '0.11',
          h: '0.12',
        },
      },
    }),
  },
  {
    name: 'ACL 300# Analysis',
    route: '/api/acl-300-analysis',
    makePayload: (shiftKey, val) => ({
      date: TEST_DATE,
      isTestMode: true,
      shifts: {
        [shiftKey]: { p18: String(0.5 + val), p44: '70', nacl: '0.7' },
      },
    }),
  },
];

async function runTestSuite() {
  console.log('========================================================================');
  console.log('ACL 3-SHIFT STANDARDIZATION AUTOMATED TEST SUITE (11 ANALYSES)');
  console.log('========================================================================\n');

  // Wait for MongoDB connection if not ready
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once('open', resolve));
  }

  const { PlantAnalysisRecord, User, PureSaltAnalysis, PureSaltSieveAnalysis } = require('./models');

  // Clean prior test records across all relevant collections
  await PlantAnalysisRecord.deleteMany({ date: TEST_DATE });
  if (PureSaltAnalysis) await PureSaltAnalysis.deleteMany({ date: TEST_DATE });
  if (PureSaltSieveAnalysis) await PureSaltSieveAnalysis.deleteMany({ date: TEST_DATE });

  const admin = (await User.findOne({ role: 'super_admin' })) || (await User.findOne({}));
  authToken = jwt.sign(
    { _id: admin._id, id: admin._id, username: admin.username, role: 'admin', company: admin.company },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '1d' }
  );

  let totalPass = 0;
  let totalFail = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`    ✓ PASS: ${message}`);
      totalPass++;
    } else {
      console.error(`    ✗ FAIL: ${message}`);
      totalFail++;
    }
  }

  for (const analysis of ANALYSES) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`[TESTING] ${analysis.name} (${analysis.route})`);
    console.log(`------------------------------------------------------------`);

    // Clean record for this test date
    await PlantAnalysisRecord.deleteMany({ date: TEST_DATE });
    if (PureSaltAnalysis) await PureSaltAnalysis.deleteMany({ date: TEST_DATE });
    if (PureSaltSieveAnalysis) await PureSaltSieveAnalysis.deleteMany({ date: TEST_DATE });

    // Step 1: Initial GET - verify defaultLocks
    const initGet = await request({
      hostname: '127.0.0.1',
      port: 5098,
      path: `${analysis.route}?date=${TEST_DATE}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const initLocks = initGet.body.lockedShifts || {};
    assert(
      initLocks.shift1 === false &&
        initLocks.shift2 === true &&
        initLocks.shift3 === true &&
        initLocks.shift1Saved === false,
      'Initial state: Shift 1 open (false), Shift 2 & 3 locked (true)'
    );

    // Step 2: Attempt to save Shift 2 out of order -> Expect 400
    const s2EarlyPayload = analysis.makePayload('shift2', 1);
    const s2EarlyRes = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s2EarlyPayload
    );
    assert(
      s2EarlyRes.status === 400 &&
        (s2EarlyRes.body.message.includes('SHIFT 1') || s2EarlyRes.body.message.includes('I SHIFT')),
      'Sequential order: Shift 2 rejected before Shift 1 is saved (HTTP 400)'
    );

    // Step 3: Save Shift 1 -> Expect Shift 2 unlocked, Shift 1 remains editable
    const s1Payload = analysis.makePayload('shift1', 1);
    const s1Res = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s1Payload
    );
    const s1Locks = s1Res.body.lockedShifts || s1Res.body.data?.lockedShifts || {};
    assert(
      s1Res.status === 200 &&
        s1Locks.shift1Saved === true &&
        s1Locks.shift1 === false &&
        s1Locks.shift2 === false &&
        s1Locks.shift3 === true,
      'Save Shift 1: unlocks Shift 2, keeps Shift 1 editable, Shift 3 locked'
    );

    // Step 4: Save Shift 2 -> Expect Shift 1 locked, Shift 3 unlocked
    const s2Payload = analysis.makePayload('shift2', 1);
    const s2Res = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s2Payload
    );
    const s2Locks = s2Res.body.lockedShifts || s2Res.body.data?.lockedShifts || {};
    assert(
      s2Res.status === 200 &&
        s2Locks.shift2Saved === true &&
        s2Locks.shift1 === true &&
        s2Locks.shift2 === false &&
        s2Locks.shift3 === false,
      'Save Shift 2: permanently locks Shift 1, unlocks Shift 3, Shift 2 remains editable'
    );

    // Step 5: Attempt to modify Shift 1 now that Shift 2 is saved -> Expect 400
    const s1LatePayload = analysis.makePayload('shift1', 5);
    const s1LateRes = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s1LatePayload
    );
    assert(
      s1LateRes.status === 400 &&
        (s1LateRes.body.message.includes('locked') || s1LateRes.body.message.includes('permitted')),
      'Lock violation: Attempting to edit Shift 1 after Shift 2 saved is rejected (HTTP 400)'
    );

    // Step 6: Save Shift 3 (First Save) -> Expect 1 correction edit permitted
    const s3Payload1 = analysis.makePayload('shift3', 1);
    const s3Res1 = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s3Payload1
    );
    const s3Locks1 = s3Res1.body.lockedShifts || s3Res1.body.data?.lockedShifts || {};
    assert(
      s3Res1.status === 200 &&
        s3Locks1.shift3Saved === true &&
        s3Locks1.shift3Edits === 0 &&
        s3Locks1.shift2 === true &&
        s3Locks1.shift3 === false,
      'Save Shift 3 (1st save): locks Shift 2, allows 1 correction edit for Shift 3'
    );

    // Step 7: Save Shift 3 Correction (2nd Save) -> Expect permanent lock on all shifts
    const s3Payload2 = analysis.makePayload('shift3', 2);
    const s3Res2 = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s3Payload2
    );
    const s3Locks2 = s3Res2.body.lockedShifts || s3Res2.body.data?.lockedShifts || {};
    assert(
      s3Res2.status === 200 &&
        s3Locks2.shift3Saved === true &&
        s3Locks2.shift3Edits === 1 &&
        s3Locks2.shift1 === true &&
        s3Locks2.shift2 === true &&
        s3Locks2.shift3 === true,
      'Save Shift 3 (2nd save/correction): permanently locks all 3 shifts (shift3Edits = 1)'
    );

    // Step 8: Attempt 3rd edit on Shift 3 -> Expect 400 rejection
    const s3Payload3 = analysis.makePayload('shift3', 3);
    const s3Res3 = await request(
      {
        hostname: '127.0.0.1',
        port: 5098,
        path: analysis.route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-test-mode': 'true',
        },
      },
      s3Payload3
    );
    assert(
      s3Res3.status === 400 &&
        (s3Res3.body.message.includes('locked') ||
          s3Res3.body.message.includes('maximum edit limit') ||
          s3Res3.body.message.includes('permitted')),
      '3rd edit on Shift 3 rejected: all shifts permanently locked (HTTP 400)'
    );

    // Step 9: GET persistence verification
    const finalGet = await request({
      hostname: '127.0.0.1',
      port: 5098,
      path: `${analysis.route}?date=${TEST_DATE}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const finalLocks = finalGet.body.lockedShifts || finalGet.body.data?.[0]?.lockedShifts || {};
    assert(
      finalLocks.shift1 === true &&
        finalLocks.shift2 === true &&
        finalLocks.shift3 === true &&
        finalLocks.shift3Edits === 1,
      'GET persistence: DB reflects all 3 shifts permanently locked with shift3Edits = 1'
    );
  }

  // Final cleanup
  await PlantAnalysisRecord.deleteMany({ date: TEST_DATE });

  console.log(`\n========================================================================`);
  console.log(`TEST SUMMARY: ${totalPass} PASSED, ${totalFail} FAILED`);
  console.log(`========================================================================`);

  process.exit(totalFail > 0 ? 1 : 0);
}

runTestSuite().catch((err) => {
  console.error('[FATAL ERROR IN TEST SUITE]', err);
  process.exit(1);
});
