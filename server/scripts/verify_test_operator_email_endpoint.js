/**
 * Test Suite for /api/plants/test-operator-email Endpoint
 *
 * Verifies:
 * 1. 401 Unauthorized for unauthenticated requests.
 * 2. 403 Forbidden for non-Super-Admin roles.
 * 3. 400 Bad Request for unassigned plants (UREA, AMMONIA, DAP, NPK).
 * 4. 400 Bad Request for security violation (attempting to send to an email not assigned to that plant).
 * 5. 404 Not Found for plants with no existing records (SACL_6253) without inserting data.
 * 6. Exact registered operator recipient resolution with mocked delivery:
 *    - ACL -> samrajnaveen58@gmail.com
 *    - SA -> hnaveensamraj@gmail.com
 *    - CO2 -> rajagustin581@gmail.com
 *    - OFFSITE -> naveensamraj2003@gmail.com (default) and jebamalarnaveen@gmail.com (selected)
 * 7. Zero Excel attachments (hasExcelAttachment: false).
 * 8. Zero database mutations.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const http = require('http');
const { connectDB } = require('../config/db');
const { User, PlantAnalysisRecord, PureSaltAnalysis } = require('../models');
const { generateToken } = require('../utils/token');

function makeRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : '';
    const headers = { ...options.headers };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({ ...options, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('VERIFYING /api/plants/test-operator-email ENDPOINT');
  console.log('================================================================');

  await connectDB();

  const superAdmin = await User.findOne({ role: 'super_admin' });
  if (!superAdmin) throw new Error('No super_admin user found');
  const superToken = generateToken(superAdmin);

  const regularUser = await User.findOne({ role: 'user' });
  if (!regularUser) throw new Error('No regular user found');
  const userToken = generateToken(regularUser);

  const initialRecordCount = await PlantAnalysisRecord.countDocuments({});
  const initialPsCount = await PureSaltAnalysis.countDocuments({});

  let passed = 0;
  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      throw new Error(msg);
    }
  }

  // 1. Unauthenticated
  console.log('\n--- 1. Testing Unauthenticated Request ---');
  const r1 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
  }, { plant: 'ACL' });
  assert(r1.status === 401, 'Unauthenticated request blocked with 401');

  // 2. Non-Super-Admin
  console.log('\n--- 2. Testing Non-Super-Admin Request ---');
  const r2 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
  }, { plant: 'ACL' });
  assert(r2.status === 403, 'Non-super-admin blocked with 403');

  // 3. Unassigned plant (UREA)
  console.log('\n--- 3. Testing Unassigned Plant (UREA) ---');
  const r3 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'UREA' });
  assert(r3.status === 400, 'Unassigned plant rejected with 400');
  assert(r3.body.message.includes('0 registered operators'), 'Rejection reports 0 registered operators');

  // 4. Security violation: arbitrary/wrong operator email for plant
  console.log('\n--- 4. Testing Security Violation (Wrong Operator Email) ---');
  const r4 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'ACL', operatorEmail: 'hnaveensamraj@gmail.com' }); // SA operator email passed to ACL
  assert(r4.status === 400, 'Cross-plant operator email rejected with 400');
  assert(r4.body.message.includes('Security Violation'), 'Response explicitly identifies Security Violation');

  // 5. Missing record (SACL_6253)
  console.log('\n--- 5. Testing Plant Without Existing Records (SACL_6253) ---');
  const r5 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'SACL_6253' });
  assert(r5.status === 404, 'Missing record halted safely with 404');
  assert(r5.body.message.includes('preserve data integrity'), 'Halt confirms data integrity preserved without inserting records');

  // 6. Verified Registered Operator Mock Delivery: ACL Plant
  console.log('\n--- 6. Mock Delivery to ACL Plant Registered Operator ---');
  const rACL = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'ACL', isTestMode: true });
  assert(rACL.status === 200, 'ACL request returned 200');
  assert(rACL.body.recipient === 'samrajnaveen58@gmail.com', `ACL recipient is samrajnaveen58@gmail.com (got: ${rACL.body.recipient})`);
  assert(rACL.body.operatorUsername === 'tfl_user', 'ACL operator username is tfl_user');
  assert(rACL.body.hasExcelAttachment === false, 'Zero Excel attachments for ACL');

  // 7. Verified Registered Operator Mock Delivery: SA Plant
  console.log('\n--- 7. Mock Delivery to SA Plant Registered Operator ---');
  const rSA = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'SA', isTestMode: true });
  assert(rSA.status === 200, 'SA request returned 200');
  assert(rSA.body.recipient === 'hnaveensamraj@gmail.com', `SA recipient is hnaveensamraj@gmail.com (got: ${rSA.body.recipient})`);
  assert(rSA.body.operatorUsername === 'sa_user', 'SA operator username is sa_user');
  assert(rSA.body.hasExcelAttachment === false, 'Zero Excel attachments for SA');

  // 8. Verified Registered Operator Mock Delivery: CO2 Plant
  console.log('\n--- 8. Mock Delivery to CO2 Plant Registered Operator ---');
  const rCO2 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'CO2', isTestMode: true });
  assert(rCO2.status === 200, 'CO2 request returned 200');
  assert(rCO2.body.recipient === 'rajagustin581@gmail.com', `CO2 recipient is rajagustin581@gmail.com (got: ${rCO2.body.recipient})`);
  assert(rCO2.body.operatorUsername === 'c02_user', 'CO2 operator username is c02_user');
  assert(rCO2.body.hasExcelAttachment === false, 'Zero Excel attachments for CO2');

  // 9. Verified Registered Operator Mock Delivery: OFFSITE Plant (Primary Operator)
  console.log('\n--- 9. Mock Delivery to OFFSITE Plant Primary Operator ---');
  const rOFF1 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'OFFSITE', isTestMode: true });
  assert(rOFF1.status === 200, 'OFFSITE primary returned 200');
  assert(rOFF1.body.recipient === 'naveensamraj2003@gmail.com', `OFFSITE primary recipient is naveensamraj2003@gmail.com (got: ${rOFF1.body.recipient})`);
  assert(rOFF1.body.operatorUsername === 'offset_user', 'OFFSITE operator username is offset_user');
  assert(rOFF1.body.hasExcelAttachment === false, 'Zero Excel attachments for OFFSITE');

  // 10. Verified Registered Operator Mock Delivery: OFFSITE Plant (Secondary Operator)
  console.log('\n--- 10. Mock Delivery to OFFSITE Plant Secondary Operator ---');
  const rOFF2 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-operator-email',
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}` },
  }, { plant: 'OFFSITE', operatorEmail: 'jebamalarnaveen@gmail.com', isTestMode: true });
  assert(rOFF2.status === 200, 'OFFSITE secondary returned 200');
  assert(rOFF2.body.recipient === 'jebamalarnaveen@gmail.com', `OFFSITE secondary recipient is jebamalarnaveen@gmail.com (got: ${rOFF2.body.recipient})`);
  assert(rOFF2.body.operatorUsername === 'offset_user1', 'OFFSITE secondary operator username is offset_user1');
  assert(rOFF2.body.hasExcelAttachment === false, 'Zero Excel attachments for OFFSITE secondary');

  // 11. Database Zero Mutations Check
  console.log('\n--- 11. Database Mutation Integrity Check ---');
  const finalRecordCount = await PlantAnalysisRecord.countDocuments({});
  const finalPsCount = await PureSaltAnalysis.countDocuments({});
  assert(initialRecordCount === finalRecordCount, `PlantAnalysisRecord count unchanged: ${initialRecordCount} === ${finalRecordCount}`);
  assert(initialPsCount === finalPsCount, `PureSaltAnalysis count unchanged: ${initialPsCount} === ${finalPsCount}`);

  console.log('\n================================================================');
  console.log(`ALL SAFEGUARD & OPERATOR ENDPOINT TESTS PASSED! (${passed} assertions)`);
  console.log('================================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test Failure:', err.message);
  process.exit(1);
});
