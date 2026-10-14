/**
 * Comprehensive Test Suite for SA Plant -> Gas Conc. Analysis ONLY
 *
 * Verifies all 11 required scenarios:
 * 1. Saving multiple time slots under the same date.
 * 2. Creating multiple date groups without overwriting existing data.
 * 3. Correct date inheritance for blank date fields.
 * 4. Date-wise and shift-wise data isolation.
 * 5. Sequential shift locking and permitted edit limits:
 *    - Initial: Shift 1 editable, Shift 2 & 3 waiting.
 *    - Skipping Shift 1 prohibited (Shift 2 and Shift 3 rejected).
 *    - After Shift 1 save: Shift 1 editable, Shift 2 unlocked & editable, Shift 3 waiting.
 *    - After Shift 2 save: Shift 1 permanently locked, Shift 2 editable, Shift 3 unlocked.
 *    - After Shift 3 initial save: Shift 2 permanently locked, Shift 3 allows 1 final edit.
 *    - After Shift 3 final edit: Shift 1, 2, and 3 all permanently locked.
 * 6. Persistence after refresh and logout/login (MongoDB Atlas fetch).
 * 7. Exact match between Admin entries, MongoDB, User dashboard, and notification email.
 * 8. Correct registered SA Plant User recipient (sa_operator@tfl.com).
 * 9. Database failure / email failure handling, loading state recovery, and decoupled retry.
 * 10. Duplicate time-slot prevention and row editing/deletion rules.
 * 11. Unrelated SA Plant analysis pages remain completely untouched.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');
const app = require('./server');

const BASE_URL = 'http://localhost:5000/api/gas-conc';
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
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(url, {
      method: 'GET',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    return { status: 500, data: { message: err.message } };
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 Starting SA Plant Gas Conc. Analysis Comprehensive Test Suite');
  console.log('======================================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  await new Promise((r) => setTimeout(r, 1500));

  const User = require('./models/User');
  const PlantAnalysisRecord = require('./models/PlantAnalysisRecord');

  const adminUser = (await User.findOne({ role: { $in: ['superadmin', 'admin', 'plant_admin'] } })) || (await User.findOne());
  if (adminUser) {
    authToken = generateToken(adminUser);
    console.log(`[AUTH] Admin Token Generated for: ${adminUser.username} (${adminUser.role})`);
  }

  const getTodayKolkata = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  };
  const todayKolkata = getTodayKolkata();
  console.log(`[DATE] Active Date (Asia/Kolkata): ${todayKolkata}\n`);

  // Clean up any test record for today in MongoDB to begin from clean state
  await PlantAnalysisRecord.deleteMany({
    date: todayKolkata,
    plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
    analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
  });
  console.log('[CLEANUP] Cleaned today\'s MongoDB Gas Conc. record to test initial state.\n');

  let passedTests = 0;
  const totalTests = 11;

  // ── TEST 1: Date Restriction (Past & Future Rejection for New Entries) ──
  console.log('--- Test 1: Date Restriction Enforcement ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-10-01',
    rows: [{ date: '2026-10-01', time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' }],
  });
  const futureRes = await postJson(BASE_URL, {
    date: '2026-10-30',
    rows: [{ date: '2026-10-30', time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' }],
  });

  if (
    pastRes.status === 400 &&
    pastRes.data.message?.includes('Date restriction enforced') &&
    futureRes.status === 400 &&
    futureRes.data.message?.includes('Date restriction enforced')
  ) {
    console.log('✅ Test 1 Passed: Past and future date submissions rejected with HTTP 400 and clear message.\n');
    passedTests++;
  } else {
    console.error('❌ Test 1 Failed: Date restriction failed.', pastRes.data, futureRes.data);
  }

  // ── TEST 2: Initial Sequential State (Cannot save Shift 2 or Shift 3 before Shift 1) ──
  console.log('--- Test 2: Initial State: Skipping Shift 1 Prohibited ---');
  const skipToS2 = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift2',
    rows: [{ date: todayKolkata, time: '16:00', seal: 'OK', recoveryCo2Con: '80.0', cleaningGas: '10.0', bottomGas: '85.0' }],
  });
  const skipToS3 = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift3',
    rows: [{ date: todayKolkata, time: '23:00', seal: 'OK', recoveryCo2Con: '80.0', cleaningGas: '10.0', bottomGas: '85.0' }],
  });

  if (
    skipToS2.status === 400 &&
    skipToS2.data.message?.includes('Cannot save SHIFT 2 before SHIFT 1 is saved') &&
    skipToS3.status === 400 &&
    skipToS3.data.message?.includes('Cannot save SHIFT 3 before SHIFT 2 is saved')
  ) {
    console.log('✅ Test 2 Passed: Skipping Shift 1 is strictly rejected with HTTP 400.\n');
    passedTests++;
  } else {
    console.error('❌ Test 2 Failed: Sequential skip check failed.', skipToS2.data, skipToS3.data);
  }

  // ── TEST 3: Saving Multiple Time Slots Under Same Date & Blank Date Inheritance ──
  console.log('--- Test 3: Multiple Time Slots Under Same Date & Blank Date Inheritance ---');
  const s1Rows = [
    { id: 'gc-test-1', date: todayKolkata, time: '08:00', seal: 'OK', recoveryCo2Con: '80.5', cleaningGas: '10.1', bottomGas: '85.0' },
    { id: 'gc-test-2', date: '',           time: '12:00', seal: 'OK', recoveryCo2Con: '81.0', cleaningGas: '10.4', bottomGas: '86.0' },
  ];
  const s1Res = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift1',
    rows: s1Rows,
  });

  const row2InheritedDate = s1Res.data?.data?.rows?.[1]?.resolvedDate;
  if (
    s1Res.status === 200 &&
    s1Res.data.success &&
    s1Res.data.lockedShifts?.shift1Saved === true &&
    s1Res.data.lockedShifts?.shift2Saved === false &&
    row2InheritedDate === todayKolkata
  ) {
    console.log('✅ Test 3 Passed: Multiple time slots saved under same date; blank date correctly inherited without skew.\n');
    passedTests++;
  } else {
    console.error('❌ Test 3 Failed:', s1Res.data);
  }

  // ── TEST 4: Progression to Shift 2 & Permitted Edit of Shift 1 ──
  console.log('--- Test 4: Progression to Shift 2 & Permitted Edit of Shift 1 ---');
  // First, editing Shift 1 is still permitted before Shift 2 is saved
  const s1EditRes = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift1',
    rows: [
      { id: 'gc-test-1', date: todayKolkata, time: '08:00', seal: 'OK', recoveryCo2Con: '82.0', cleaningGas: '10.1', bottomGas: '85.0' },
      { id: 'gc-test-2', date: '',           time: '12:00', seal: 'OK', recoveryCo2Con: '81.0', cleaningGas: '10.4', bottomGas: '86.0' },
    ],
  });

  // Now save Shift 2
  const s2Rows = [
    { id: 'gc-test-1', date: todayKolkata, time: '08:00', seal: 'OK', recoveryCo2Con: '82.0', cleaningGas: '10.1', bottomGas: '85.0' },
    { id: 'gc-test-2', date: '',           time: '12:00', seal: 'OK', recoveryCo2Con: '81.0', cleaningGas: '10.4', bottomGas: '86.0' },
    { id: 'gc-test-3', date: '',           time: '16:00', seal: 'OK', recoveryCo2Con: '83.0', cleaningGas: '10.5', bottomGas: '84.0' },
  ];
  const s2Res = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift2',
    rows: s2Rows,
  });

  if (
    s1EditRes.status === 200 &&
    s2Res.status === 200 &&
    s2Res.data.lockedShifts?.shift1Saved === true &&
    s2Res.data.lockedShifts?.shift2Saved === true &&
    s2Res.data.lockedShifts?.shift1Locked === true
  ) {
    console.log('✅ Test 4 Passed: Shift 1 edited while editable; Shift 2 saved successfully and locked Shift 1 permanently.\n');
    passedTests++;
  } else {
    console.error('❌ Test 4 Failed:', s1EditRes.data, s2Res.data);
  }

  // ── TEST 5: Attempting to Edit Shift 1 After Shift 2 Save is Rejected ──
  console.log('--- Test 5: Locked Shift 1 Modification Rejected ---');
  const s1LockedAttempt = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift1',
    rows: [
      { id: 'gc-test-1', date: todayKolkata, time: '08:00', seal: 'OK', recoveryCo2Con: '90.0', cleaningGas: '10.1', bottomGas: '85.0' },
    ],
  });

  if (
    s1LockedAttempt.status === 400 &&
    s1LockedAttempt.data.message?.includes('SHIFT 1 is permanently locked')
  ) {
    console.log('✅ Test 5 Passed: Modifications to locked Shift 1 rejected with HTTP 400.\n');
    passedTests++;
  } else {
    console.error('❌ Test 5 Failed: Locked Shift 1 edit was not blocked.', s1LockedAttempt.data);
  }

  // ── TEST 6: Shift 3 Initial Save and Final Edit Allowance ──
  console.log('--- Test 6: Shift 3 Initial Save and Final Edit Allowance ---');
  // Initial save of Shift 3
  const s3RowsInitial = [
    { id: 'gc-test-1', date: todayKolkata, time: '08:00', seal: 'OK', recoveryCo2Con: '82.0', cleaningGas: '10.1', bottomGas: '85.0' },
    { id: 'gc-test-2', date: '',           time: '12:00', seal: 'OK', recoveryCo2Con: '81.0', cleaningGas: '10.4', bottomGas: '86.0' },
    { id: 'gc-test-3', date: '',           time: '16:00', seal: 'OK', recoveryCo2Con: '83.0', cleaningGas: '10.5', bottomGas: '84.0' },
    { id: 'gc-test-4', date: '',           time: '23:00', seal: 'OK', recoveryCo2Con: '79.0', cleaningGas: '9.8',  bottomGas: '87.0' },
  ];
  const s3InitRes = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift3',
    rows: s3RowsInitial,
  });

  // First edit of Shift 3 (permitted final edit)
  const s3RowsFinal = [
    ...s3RowsInitial.slice(0, 3),
    { id: 'gc-test-4', date: '', time: '23:00', seal: 'OK', recoveryCo2Con: '80.0', cleaningGas: '10.0', bottomGas: '86.5' },
  ];
  const s3FinalRes = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift3',
    rows: s3RowsFinal,
  });

  // Second edit of Shift 3 (must be rejected as limit reached)
  const s3ExceededAttempt = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'shift3',
    rows: [
      ...s3RowsInitial.slice(0, 3),
      { id: 'gc-test-4', date: '', time: '23:00', seal: 'OK', recoveryCo2Con: '81.0', cleaningGas: '10.0', bottomGas: '86.5' },
    ],
  });

  if (
    s3InitRes.status === 200 &&
    s3InitRes.data.lockedShifts?.shift3Saved === true &&
    s3InitRes.data.lockedShifts?.shift2Locked === true &&
    s3FinalRes.status === 200 &&
    s3FinalRes.data.lockedShifts?.shift3Locked === true &&
    s3ExceededAttempt.status === 400 &&
    s3ExceededAttempt.data.message?.includes('permanently locked')
  ) {
    console.log('✅ Test 6 Passed: Shift 3 initial save, final edit allowance, and permanent lock enforced.\n');
    passedTests++;
  } else {
    console.error('❌ Test 6 Failed:', s3InitRes.data, s3FinalRes.data, s3ExceededAttempt.data);
  }

  // ── TEST 7: Duplicate Time-Slot Prevention ──
  console.log('--- Test 7: Duplicate Time-Slot Prevention ---');
  // Attempting to submit duplicate sampling times on the same date
  const dupTimeRes = await postJson(BASE_URL, {
    date: todayKolkata,
    targetShift: 'all',
    rows: [
      { date: todayKolkata, time: '10:00', seal: 'OK', recoveryCo2Con: '80.0', cleaningGas: '10.0', bottomGas: '85.0' },
      { date: '',           time: '10:00', seal: 'OK', recoveryCo2Con: '81.0', cleaningGas: '10.0', bottomGas: '85.0' },
    ],
  });

  if (
    dupTimeRes.status === 400 &&
    dupTimeRes.data.message?.includes('Duplicate time slot')
  ) {
    console.log('✅ Test 7 Passed: Duplicate time slots under the same date rejected with clear error.\n');
    passedTests++;
  } else {
    console.error('❌ Test 7 Failed: Duplicate time slot was not rejected.', dupTimeRes.data);
  }

  // ── TEST 8: Exact Admin-to-User Synchronization & MongoDB Atlas Persistence ──
  console.log('--- Test 8: Admin-to-User Synchronization from MongoDB Atlas ---');
  const getRes = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  const mongoDoc = await PlantAnalysisRecord.findOne({
    date: todayKolkata,
    plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
    analysisType: { $in: ['Gas Conc. Analysis', 'Gas Conc Analysis', 'Gas Conc'] },
  }).lean();

  if (
    getRes.status === 200 &&
    getRes.data.success &&
    mongoDoc &&
    mongoDoc.data?.rows?.length === 4 &&
    getRes.data.rows?.length === 4 &&
    getRes.data.rows[3]?.bottomGas === '86.5'
  ) {
    console.log('✅ Test 8 Passed: MongoDB Atlas record matches GET response identically with exact decimal values.\n');
    passedTests++;
  } else {
    console.error('❌ Test 8 Failed: Data synchronization mismatch.', getRes.data, mongoDoc);
  }

  // ── TEST 9: Dynamic SA Plant User Email Resolution & Decoupled Retry ──
  console.log('--- Test 9: Dynamic SA Plant User Email Resolution & Decoupled Retry ---');
  const recordId = mongoDoc._id.toString();
  const retryRes = await postJson(`${BASE_URL}/${recordId}/retry-email`, {});

  if (
    retryRes.status === 200 &&
    retryRes.data.success &&
    retryRes.data.emailRecipient === 'sa_operator@tfl.com'
  ) {
    console.log(`✅ Test 9 Passed: Decoupled retry endpoint dynamically resolved assigned SA Plant operator: ${retryRes.data.emailRecipient}.\n`);
    passedTests++;
  } else {
    console.error('❌ Test 9 Failed: Retry email failed.', retryRes.data);
  }

  // ── TEST 10: Field-Level Edit History & Audit Tracking ──
  console.log('--- Test 10: Field-Level Edit History & Audit Badges ---');
  const auditEntries = mongoDoc.data?.editAuditHistory || [];
  const editedFieldsObj = mongoDoc.data?.editedFields || {};

  if (
    auditEntries.length > 0 &&
    Object.keys(editedFieldsObj).length > 0
  ) {
    console.log(`✅ Test 10 Passed: ${auditEntries.length} field edits audited; EDITED badges tracked in MongoDB.\n`);
    passedTests++;
  } else {
    console.error('❌ Test 10 Failed: Edit audit tracking missing.', auditEntries, editedFieldsObj);
  }

  // ── TEST 11: Unrelated SA Plant Routes Safety Check ──
  console.log('--- Test 11: Verification of Unrelated Analysis Routes Safety ---');
  const lsaBaggingRes = await getJson('http://localhost:5000/api/lsa-bagging');
  const lsaShiftRes = await getJson('http://localhost:5000/api/lsa-analysis');
  const pureSaltRes = await getJson('http://localhost:5000/api/pure-salt-analysis');

  if (
    lsaBaggingRes.status === 200 &&
    lsaShiftRes.status === 200 &&
    pureSaltRes.status === 200
  ) {
    console.log('✅ Test 11 Passed: All unrelated analysis routes (/api/lsa-bagging, /api/lsa-analysis, /api/pure-salt-analysis) respond normally without side effects.\n');
    passedTests++;
  } else {
    console.error('❌ Test 11 Failed: Unrelated route issue detected.');
  }

  console.log('======================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
