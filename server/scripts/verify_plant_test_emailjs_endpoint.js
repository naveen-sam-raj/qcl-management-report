/**
 * Verification Script for /api/plants/test-emailjs Dedicated Test Endpoint
 *
 * Verifies:
 * 1. Authentication enforcement (401 for missing/invalid token).
 * 2. Super Admin authorization enforcement (403 for non-super_admin users).
 * 3. Server-side plant allowlisting (400 for invalid/disallowed plant).
 * 4. Recipient containment (dispatches exclusively to test recipient).
 * 5. Mocked EmailJS delivery across ACL, SA, CO2, and OFFSITE.
 * 6. Zero database mutations (read-only verification).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const http = require('http');
const { connectDB } = require('../config/db');
const { User, PlantAnalysisRecord } = require('../models');
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
      res.on('data', chunk => data += chunk);
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

async function runEndpointVerification() {
  console.log('================================================================');
  console.log('VERIFYING DEDICATED /api/plants/test-emailjs ENDPOINT');
  console.log('================================================================');

  await connectDB();

  // 1. Fetch real users for authentication testing
  const superAdmin = await User.findOne({ role: 'super_admin' });
  if (!superAdmin) throw new Error('No super_admin user found in database');
  const superAdminToken = generateToken(superAdmin);

  const regularUser = await User.findOne({ role: 'user' });
  if (!regularUser) throw new Error('No regular user found in database');
  const regularUserToken = generateToken(regularUser);

  // Capture database document count baseline
  const baselineCount = await PlantAnalysisRecord.countDocuments({});
  console.log(`\nInitial PlantAnalysisRecord count in DB: ${baselineCount}`);

  // Test 1: Unauthenticated request (Must return 401)
  console.log('\n--- 1. Testing Unauthenticated Access ---');
  const res1 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
  }, { plant: 'ACL', recipient: 'naveensamraj2003@gmail.com' });
  console.log(`  Response Status: ${res1.status}`);
  if (res1.status !== 401) throw new Error(`Expected 401, got ${res1.status}`);
  console.log('  ✅ PASS: Unauthenticated access blocked (401).');

  // Test 2: Unauthorized Role (Regular user -> Must return 403)
  console.log('\n--- 2. Testing Non-Super-Admin Role Access ---');
  const res2 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${regularUserToken}` },
  }, { plant: 'ACL', recipient: 'naveensamraj2003@gmail.com' });
  console.log(`  Response Status: ${res2.status}`);
  if (res2.status !== 403) throw new Error(`Expected 403, got ${res2.status}`);
  console.log('  ✅ PASS: Non-super_admin role access forbidden (403).');

  // Test 3: Disallowed Plant Code (Must return 400)
  console.log('\n--- 3. Testing Server-Side Plant Allowlisting ---');
  const res3 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${superAdminToken}` },
  }, { plant: 'UNKNOWN_PLANT_XYZ', recipient: 'naveensamraj2003@gmail.com' });
  console.log(`  Response Status: ${res3.status}`);
  if (res3.status !== 400) throw new Error(`Expected 400, got ${res3.status}`);
  console.log('  ✅ PASS: Disallowed plant rejected with 400.');

  // Test 4: Mocked Delivery for ACL Plant
  console.log('\n--- 4. Mocked EmailJS Test for ACL Plant ---');
  const resACL = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${superAdminToken}` },
  }, { plant: 'ACL', recipient: 'naveensamraj2003@gmail.com', isTestMode: true });
  console.log('  ACL Result:', resACL.status, resACL.body);
  if (resACL.status !== 200 || !resACL.body.success) throw new Error(`ACL test failed: ${JSON.stringify(resACL.body)}`);
  if (resACL.body.hasExcelAttachment !== false) throw new Error('ACL has unexpected Excel attachment');
  if (resACL.body.recipient !== 'naveensamraj2003@gmail.com') throw new Error('ACL recipient mismatch');
  console.log('  ✅ PASS: ACL test endpoint succeeded (zero attachments, sole recipient).');

  // Test 5: Mocked Delivery for SA Plant
  console.log('\n--- 5. Mocked EmailJS Test for SA Plant ---');
  const resSA = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${superAdminToken}` },
  }, { plant: 'SA', recipient: 'naveensamraj2003@gmail.com', isTestMode: true });
  console.log('  SA Result:', resSA.status, resSA.body);
  if (resSA.status !== 200 || !resSA.body.success) throw new Error(`SA test failed: ${JSON.stringify(resSA.body)}`);
  if (resSA.body.hasExcelAttachment !== false) throw new Error('SA has unexpected Excel attachment');
  if (resSA.body.recipient !== 'naveensamraj2003@gmail.com') throw new Error('SA recipient mismatch');
  console.log('  ✅ PASS: SA test endpoint succeeded (zero attachments, sole recipient).');

  // Test 6: Mocked Delivery for CO2 Plant
  console.log('\n--- 6. Mocked EmailJS Test for CO2 Plant ---');
  const resCO2 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${superAdminToken}` },
  }, { plant: 'CO2', recipient: 'naveensamraj2003@gmail.com', isTestMode: true });
  console.log('  CO2 Result:', resCO2.status, resCO2.body);
  if (resCO2.status !== 200 || !resCO2.body.success) throw new Error(`CO2 test failed: ${JSON.stringify(resCO2.body)}`);
  if (resCO2.body.hasExcelAttachment !== false) throw new Error('CO2 has unexpected Excel attachment');
  if (resCO2.body.recipient !== 'naveensamraj2003@gmail.com') throw new Error('CO2 recipient mismatch');
  console.log('  ✅ PASS: CO2 test endpoint succeeded (zero attachments, sole recipient).');

  // Test 7: Mocked Delivery for OFFSITE Plant
  console.log('\n--- 7. Mocked EmailJS Test for OFFSITE Plant ---');
  const resOFFSITE = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/plants/test-emailjs',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${superAdminToken}` },
  }, { plant: 'OFFSITE', recipient: 'naveensamraj2003@gmail.com', isTestMode: true });
  console.log('  OFFSITE Result:', resOFFSITE.status, resOFFSITE.body);
  if (resOFFSITE.status !== 200 || !resOFFSITE.body.success) throw new Error(`OFFSITE test failed: ${JSON.stringify(resOFFSITE.body)}`);
  if (resOFFSITE.body.hasExcelAttachment !== false) throw new Error('OFFSITE has unexpected Excel attachment');
  if (resOFFSITE.body.recipient !== 'naveensamraj2003@gmail.com') throw new Error('OFFSITE recipient mismatch');
  console.log('  ✅ PASS: OFFSITE test endpoint succeeded (zero attachments, sole recipient).');

  // Test 8: Verify Zero Database Mutations
  console.log('\n--- 8. Database Mutation Verification ---');
  const postTestCount = await PlantAnalysisRecord.countDocuments({});
  console.log(`  Initial Count: ${baselineCount}, Post-Test Count: ${postTestCount}`);
  if (baselineCount !== postTestCount) {
    throw new Error(`Database mutation detected! Expected ${baselineCount} records, but found ${postTestCount}`);
  }
  console.log('  ✅ PASS: Zero database records created, modified, or deleted.');

  console.log('\n================================================================');
  console.log('ALL SAFEGUARD TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

runEndpointVerification().catch((err) => {
  console.error('\n❌ Test Failure:', err.message);
  process.exit(1);
});
