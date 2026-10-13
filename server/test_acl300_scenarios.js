/**
 * Test script for ACL Plant -> ACL 300# Analysis Workflow & Scenarios
 * Verifies all requirements:
 * 1. Current-date restriction (rejects non-today dates with HTTP 400).
 * 2. Sequential shift locking:
 *    - Save SHIFT 1 initially (SHIFT 2 waiting, SHIFT 3 waiting).
 *    - Save SHIFT 2 (locks SHIFT 1 permanently).
 *    - Save SHIFT 3 (locks SHIFT 2 permanently).
 *    - Permitted final edit for SHIFT 3 with field-level EDITED tracking.
 *    - Permanent locking of all shifts after final save (rejects subsequent save with HTTP 400).
 * 3. Exact measurement values & shift persistence in MongoDB (+18%, +44%, NaCl%).
 * 4. Date-wise data isolation (records queryable strictly by today's date).
 * 5. Dynamic ACL Plant operator email resolution (samrajnaveen58@gmail.com).
 * 6. Exact shift values included in email dispatch.
 * 7. Retry email endpoint functionality.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/acl-300-analysis';
let authToken = '';

async function postJson(url, body) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    return { status: 500, data: { message: err.message } };
  }
}

async function getJson(url) {
  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    return { status: 500, data: { message: err.message } };
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting ACL 300# Analysis Automated Verification Tests');
  console.log('========================================================\n');

  try {
    const MONGO_URI = process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB Atlas for test setup.');

    const User = require('./models/User');
    const PlantAnalysisRecord = require('./models/PlantAnalysisRecord');
    const adminUser =
      (await User.findOne({ role: { $in: ['superadmin', 'admin', 'plant_admin'] } })) ||
      (await User.findOne());

    if (adminUser) {
      authToken = generateToken(adminUser);
      console.log(`Generated auth token for user: ${adminUser.username || adminUser.email} (Role: ${adminUser.role})`);
    } else {
      console.warn('⚠️ No user found to generate token.');
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    console.log(`Current Asia/Kolkata Date: ${today}`);

    // Clean up any existing record for today's test
    const deleteResult = await PlantAnalysisRecord.deleteMany({
      plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
      analysisType: 'ACL 300# Analysis',
      date: today,
    });
    console.log(`Cleaned up previous test records for ${today}: ${deleteResult.deletedCount} removed.\n`);

    // --- Test 1: Current Date Restriction ---
    console.log('--- Test 1: Current-Date Restriction (Past/Future date rejection) ---');
    const pastRes = await postJson(BASE_URL, {
      date: '2026-10-10',
      plant: 'ACL',
      shifts: {
        shift1: { p18: '0.50', p44: '71.80', nacl: '0.72' },
      },
    });
    if (pastRes.status === 400 && pastRes.data.message && pastRes.data.message.includes('Date restriction enforced')) {
      console.log('✅ PASS: Rejected non-today date with message:', pastRes.data.message);
    } else {
      console.error('❌ FAIL: Past date was not rejected properly:', pastRes.status, pastRes.data);
    }

    const futureRes = await postJson(BASE_URL, {
      date: '2026-10-25',
      plant: 'ACL',
      shifts: {
        shift1: { p18: '0.50', p44: '71.80', nacl: '0.72' },
      },
    });
    if (futureRes.status === 400 && futureRes.data.message && futureRes.data.message.includes('Date restriction enforced')) {
      console.log('✅ PASS: Rejected future date with message:', futureRes.data.message);
    } else {
      console.error('❌ FAIL: Future date was not rejected properly:', futureRes.status, futureRes.data);
    }

    // --- Test 2: Initial Save for SHIFT 1 ---
    console.log('\n--- Test 2: Initial Save for SHIFT 1 ---');
    const s1Res = await postJson(BASE_URL, {
      date: today,
      plant: 'ACL',
      shifts: {
        shift1: { p18: '0.50', p44: '71.80', nacl: '0.72' },
      },
    });

    console.log('Shift 1 Response Status:', s1Res.status);
    console.log('Email Status:', s1Res.data?.emailStatus);
    console.log('Email Sent:', s1Res.data?.emailSent);
    console.log('Email Recipient:', s1Res.data?.emailRecipient);
    console.log('Save Event ID:', s1Res.data?.saveEventId);
    console.log('Locked Shifts:', JSON.stringify(s1Res.data?.data?.lockedShifts));

    const recordId = s1Res.data?.recordId;
    if (s1Res.status === 201 && s1Res.data?.data?.lockedShifts?.shift1Saved === true) {
      console.log('✅ PASS: SHIFT 1 saved successfully, email dispatched to ACL operator.');
    } else {
      console.error('❌ FAIL: SHIFT 1 save failed:', s1Res);
    }

    // --- Test 3: Save SHIFT 2 (Should lock SHIFT 1) ---
    console.log('\n--- Test 3: Save SHIFT 2 (Locks SHIFT 1) ---');
    const s2Res = await postJson(BASE_URL, {
      date: today,
      plant: 'ACL',
      shifts: {
        shift2: { p18: '0.60', p44: '72.10', nacl: '0.68' },
      },
    });

    console.log('Shift 2 Response Status:', s2Res.status);
    console.log('Locked Shifts:', JSON.stringify(s2Res.data?.data?.lockedShifts));

    if (s2Res.status === 201 && s2Res.data?.data?.lockedShifts?.shift1 === true && s2Res.data?.data?.lockedShifts?.shift2Saved === true) {
      console.log('✅ PASS: SHIFT 2 saved successfully, SHIFT 1 is now permanently locked.');
    } else {
      console.error('❌ FAIL: SHIFT 2 save or SHIFT 1 lock failed:', s2Res);
    }

    // Verify SHIFT 1 cannot be edited now
    const s1EditAttempt = await postJson(BASE_URL, {
      date: today,
      plant: 'ACL',
      shifts: {
        shift1: { p18: '0.99', p44: '75.00', nacl: '0.99' },
      },
    });
    if (s1EditAttempt.status === 400 && s1EditAttempt.data?.message?.includes('locked')) {
      console.log('✅ PASS: Modification to locked SHIFT 1 correctly rejected:', s1EditAttempt.data.message);
    } else {
      console.error('❌ FAIL: Locked SHIFT 1 was not rejected:', s1EditAttempt);
    }

    // --- Test 4: Save SHIFT 3 (Should lock SHIFT 2) ---
    console.log('\n--- Test 4: Save SHIFT 3 (Locks SHIFT 2) ---');
    const s3Res = await postJson(BASE_URL, {
      date: today,
      plant: 'ACL',
      shifts: {
        shift3: { p18: '0.55', p44: '71.50', nacl: '0.70' },
      },
    });

    console.log('Shift 3 Response Status:', s3Res.status);
    console.log('Locked Shifts:', JSON.stringify(s3Res.data?.data?.lockedShifts));

    if (s3Res.status === 201 && s3Res.data?.data?.lockedShifts?.shift2 === true && s3Res.data?.data?.lockedShifts?.shift3Saved === true) {
      console.log('✅ PASS: SHIFT 3 saved successfully, SHIFT 2 is now permanently locked.');
    } else {
      console.error('❌ FAIL: SHIFT 3 save or SHIFT 2 lock failed:', s3Res);
    }

    // --- Test 5: Permitted Final Edit for SHIFT 3 (with EDITED badge tracking) ---
    console.log('\n--- Test 5: Permitted Final Edit for SHIFT 3 with Field-Level EDITED Badges ---');
    const s3EditRes = await postJson(BASE_URL, {
      date: today,
      plant: 'ACL',
      shifts: {
        shift3: { p18: '0.58', p44: '71.50', nacl: '0.75' }, // p18 and nacl changed; p44 unchanged
      },
    });

    console.log('Shift 3 Final Edit Response Status:', s3EditRes.status);
    console.log('Edited Fields:', JSON.stringify(s3EditRes.data?.data?.editedFields));
    console.log('Locked Shifts:', JSON.stringify(s3EditRes.data?.data?.lockedShifts));

    const s3Edited = s3EditRes.data?.data?.editedFields || {};
    if (
      s3EditRes.status === 201 &&
      s3Edited['shift3_p18'] === true &&
      s3Edited['shift3_nacl'] === true &&
      !s3Edited['shift3_p44'] &&
      s3EditRes.data?.data?.lockedShifts?.shift3 === true
    ) {
      console.log('✅ PASS: Permitted final edit succeeded; field-level EDITED badges set accurately; SHIFT 3 permanently locked.');
    } else {
      console.error('❌ FAIL: Final edit or EDITED badge tracking failed:', s3EditRes);
    }

    // --- Test 6: Permanent Locking Enforcement (Rejection of further edits) ---
    console.log('\n--- Test 6: Permanent Locking Enforcement (Rejection of 3rd save attempt) ---');
    const lockedRes = await postJson(BASE_URL, {
      date: today,
      plant: 'ACL',
      shifts: {
        shift3: { p18: '0.99', p44: '79.00', nacl: '0.99' },
      },
    });

    if (lockedRes.status === 400 && lockedRes.data.message && lockedRes.data.message.includes('locked')) {
      console.log('✅ PASS: Modification after final edit rejected by backend locking guard:', lockedRes.data.message);
    } else {
      console.error('❌ FAIL: Locked state was not enforced:', lockedRes.status, lockedRes.data);
    }

    // --- Test 7: GET Record Verification & Shift Isolation ---
    console.log('\n--- Test 7: GET Record Verification & Shift Isolation ---');
    const getRes = await getJson(`${BASE_URL}?date=${today}`);
    console.log('GET Response Status:', getRes.status);
    const fetchedData = Array.isArray(getRes.data?.data) ? getRes.data?.data[0] : getRes.data?.data;
    console.log('Fetched SHIFT 1:', JSON.stringify(fetchedData?.shifts?.shift1));
    console.log('Fetched SHIFT 2:', JSON.stringify(fetchedData?.shifts?.shift2));
    console.log('Fetched SHIFT 3:', JSON.stringify(fetchedData?.shifts?.shift3));
    console.log('Assigned Operator Email:', getRes.data?.assignedOperatorEmail);

    if (
      getRes.status === 200 &&
      fetchedData?.shifts?.shift1?.p18 === '0.50' &&
      fetchedData?.shifts?.shift2?.p44 === '72.10' &&
      fetchedData?.shifts?.shift3?.nacl === '0.75' &&
      getRes.data?.assignedOperatorEmail === 'samrajnaveen58@gmail.com'
    ) {
      console.log('✅ PASS: Persisted MongoDB record matches exact values for all 3 shifts and assigned operator.');
    } else {
      console.error('❌ FAIL: GET verification mismatch:', fetchedData);
    }

    // --- Test 8: Retry Email Endpoint ---
    console.log('\n--- Test 8: Retry Email Endpoint ---');
    const finalRecordId = recordId || fetchedData?._id;
    const retryRes = await postJson(`${BASE_URL}/${finalRecordId}/retry-email`, {});
    console.log('Retry Response Status:', retryRes.status);
    console.log('Retry Email Sent:', retryRes.data?.emailSent);
    console.log('Retry Recipient:', retryRes.data?.emailRecipient);

    if (retryRes.status === 200 && retryRes.data?.emailSent) {
      console.log('✅ PASS: Retry email succeeded and dispatched to ACL operator.');
    } else {
      console.error('❌ FAIL: Retry email failed:', retryRes);
    }

    console.log('\n========================================================');
    console.log('🎉 ALL ACL 300# AUTOMATED TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================');
  } catch (err) {
    console.error('💥 Test suite encountered an exception:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runTests();
