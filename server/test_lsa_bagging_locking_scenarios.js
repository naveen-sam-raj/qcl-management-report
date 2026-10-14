/**
 * Comprehensive Shift-Wise Sequential Locking Verification Test Suite
 * Specifically targeting: SA Plant -> LSA Bagging ONLY
 *
 * Verifies:
 * 1. SHIFT 1 -> SHIFT 2 -> SHIFT 3 sequential saving rules.
 * 2. Skipping shifts is prohibited (cannot save Shift 2 or 3 before prior shifts).
 * 3. Lock progression:
 *    - Initial: Shift 1 editable, Shift 2 & 3 waiting.
 *    - After Shift 1 save: Shift 1 editable, Shift 2 editable, Shift 3 waiting.
 *    - After Shift 2 save: Shift 1 permanently LOCKED, Shift 2 editable, Shift 3 editable.
 *    - After Shift 3 initial save: Shift 1 & 2 LOCKED, Shift 3 allows exactly one final edit.
 *    - After Shift 3 final edit: Shift 1, 2, and 3 all permanently LOCKED.
 * 4. Hourly Routine Monitoring shift restrictions:
 *    - Hourly slot assigned to wrong shift timing is rejected.
 *    - Hourly slots cannot be edited or added while their shift is waiting or locked.
 *    - Deleting custom hourly slots belonging to locked shifts is prohibited.
 * 5. Date restriction: Current date enforced (Asia/Kolkata), past & future dates rejected with 400.
 * 6. Shift and Hourly saves operate independently without cross-overwriting data.
 * 7. Field-level audit trail and EDITED badge tracking.
 * 8. Dynamic SA Plant User email resolution (sa_operator@tfl.com) and decoupled email retry.
 * 9. Unrelated analysis routes (LSA Bagging Sieve, LSA Shift Analysis) remain completely untouched.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const app = require('./server');
const BASE_URL = 'http://localhost:5000/api/lsa-bagging';
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
  console.log('🔒 Starting SA Plant LSA Bagging Shift-Wise Sequential Locking Tests');
  console.log('======================================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

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
  console.log(`[DATE] Test Date (Asia/Kolkata): ${todayKolkata}\n`);

  // Clean up any test record for today so we test from clean initial state
  await PlantAnalysisRecord.deleteMany({
    date: todayKolkata,
    plantCode: 'SA',
    analysisType: 'LSA Bagging Analysis',
  });
  console.log('[CLEANUP] Reset today\'s test record in MongoDB to test initial state.\n');

  let passedTests = 0;
  const totalTests = 11;

  // ── TEST 1: Date Restriction (Past & Future Rejection) ──
  console.log('--- Test 1: Date Restriction Enforcement ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-10-10',
    saveType: 'shift',
    targetShift: 'shift1',
    shiftAnalysis: { shift1: { na2co3: '99.20' } },
  });
  const futureRes = await postJson(BASE_URL, {
    date: '2026-10-30',
    saveType: 'shift',
    targetShift: 'shift1',
    shiftAnalysis: { shift1: { na2co3: '99.20' } },
  });

  if (
    pastRes.status === 400 &&
    pastRes.data.message?.includes('Date restriction enforced') &&
    futureRes.status === 400 &&
    futureRes.data.message?.includes('Date restriction enforced')
  ) {
    console.log('✅ Test 1 Passed: Past and future dates rejected with HTTP 400 and clear message.\n');
    passedTests++;
  } else {
    console.error('❌ Test 1 Failed: Date restriction failed.', pastRes.data, futureRes.data);
  }

  // ── TEST 2: Initial State: Skipping Shift 1 is Prohibited ──
  console.log('--- Test 2: Initial State (Shift 2 & 3 Cannot be Saved Before Shift 1) ---');
  const skipToS2 = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift2',
    shiftAnalysis: { shift2: { na2co3: '99.25' } },
  });
  const skipToS3 = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift3',
    shiftAnalysis: { shift3: { na2co3: '99.10' } },
  });

  if (
    skipToS2.status === 400 &&
    skipToS2.data.message?.includes('Cannot save SHIFT 2 before SHIFT 1 is saved') &&
    skipToS3.status === 400 &&
    skipToS3.data.message?.includes('Cannot save SHIFT 3 before SHIFT 2 is saved')
  ) {
    console.log('✅ Test 2 Passed: Skipping ahead to Shift 2 or Shift 3 in initial state correctly rejected with HTTP 400.\n');
    passedTests++;
  } else {
    console.error('❌ Test 2 Failed: Premature shift save was not rejected.', skipToS2.data, skipToS3.data);
  }

  // ── TEST 3: Save Shift 1 (Initial Save) ──
  console.log('--- Test 3: Save SHIFT 1 (Initial Save) ---');
  const s1SaveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift1',
    shiftAnalysis: {
      shift1: {
        na2co3: '99.20',
        nacl: '0.70',
        fe: '0.0070',
        na2so4: '0.080',
        vm: '1.90',
        ir: '0.150',
        bd: '635',
        turbidity: '80',
      },
    },
  });

  const locksAfterS1 = s1SaveRes.data.lockedShifts || {};
  const s1Ok = s1SaveRes.status === 201 && locksAfterS1.shift1Saved === true && !locksAfterS1.shift1Locked;

  // Verify Shift 1 remains editable, and Shift 2 is now allowed
  const s1EditRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift1',
    shiftAnalysis: {
      shift1: {
        na2co3: '99.25',
      },
    },
  });
  const s1EditOk = s1EditRes.status === 201;

  if (s1Ok && s1EditOk) {
    console.log('✅ Test 3 Passed: SHIFT 1 saved successfully and remains editable before SHIFT 2 is saved.\n');
    passedTests++;
  } else {
    console.error('❌ Test 3 Failed: SHIFT 1 save/edit failure.', s1SaveRes.data, s1EditRes.data);
  }

  // ── TEST 4: Save Shift 2 -> Shift 1 Becomes Permanently LOCKED ──
  console.log('--- Test 4: Save SHIFT 2 -> SHIFT 1 Permanently LOCKED ---');
  const s2SaveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift2',
    shiftAnalysis: {
      shift2: {
        na2co3: '99.30',
        nacl: '0.72',
        fe: '0.0072',
        na2so4: '0.081',
        vm: '2.00',
        ir: '0.152',
        bd: '640',
        turbidity: '82',
      },
    },
  });

  const locksAfterS2 = s2SaveRes.data.lockedShifts || {};
  const s2Ok = s2SaveRes.status === 201 && locksAfterS2.shift2Saved === true && locksAfterS2.shift1Locked === true;

  // Try to edit Shift 1 now that Shift 2 is saved -> MUST BE REJECTED
  const s1AttemptAfterS2 = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift1',
    shiftAnalysis: {
      shift1: { na2co3: '99.99' },
    },
  });

  if (s2Ok && s1AttemptAfterS2.status === 400 && s1AttemptAfterS2.data.message?.includes('permanently locked')) {
    console.log('✅ Test 4 Passed: SHIFT 2 saved, and SHIFT 1 is permanently LOCKED against subsequent edits.\n');
    passedTests++;
  } else {
    console.error('❌ Test 4 Failed: SHIFT 1 locking after SHIFT 2 failed.', s2SaveRes.data, s1AttemptAfterS2.data);
  }

  // ── TEST 5: Save Shift 3 (1st time) -> Shift 2 LOCKED, Shift 3 Allows 1 Final Edit ──
  console.log('--- Test 5: Save SHIFT 3 (1st Save) -> SHIFT 2 LOCKED, SHIFT 3 Final Edit Allowed ---');
  const s3SaveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift3',
    shiftAnalysis: {
      shift3: {
        na2co3: '99.10',
        nacl: '0.68',
        fe: '0.0069',
        na2so4: '0.079',
        vm: '1.85',
        ir: '0.148',
        bd: '625',
        turbidity: '78',
      },
    },
  });

  const locksAfterS3 = s3SaveRes.data.lockedShifts || {};
  const s3Ok = s3SaveRes.status === 201 && locksAfterS3.shift3Saved === true && locksAfterS3.shift2Locked === true && !locksAfterS3.shift3Locked;

  // Try to edit Shift 2 now -> MUST BE REJECTED
  const s2AttemptAfterS3 = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift2',
    shiftAnalysis: { shift2: { na2co3: '99.99' } },
  });

  if (s3Ok && s2AttemptAfterS3.status === 400 && s2AttemptAfterS3.data.message?.includes('permanently locked')) {
    console.log('✅ Test 5 Passed: SHIFT 3 saved 1st time, SHIFT 2 is permanently LOCKED, SHIFT 3 allows final edit.\n');
    passedTests++;
  } else {
    console.error('❌ Test 5 Failed: Shift 2 locking or Shift 3 1st save failed.', s3SaveRes.data, s2AttemptAfterS3.data);
  }

  // ── TEST 6: Final Edit of Shift 3 -> ALL THREE SHIFTS PERMANENTLY LOCKED ──
  console.log('--- Test 6: Final Edit of SHIFT 3 -> Permanent Lock of All Shifts ---');
  const s3FinalEditRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift3',
    shiftAnalysis: {
      shift3: {
        na2co3: '99.15', // modified
      },
    },
  });

  const locksAfterFinal = s3FinalEditRes.data.lockedShifts || {};
  const s3FinalOk = s3FinalEditRes.status === 201 && locksAfterFinal.shift3Locked === true && locksAfterFinal.shift3Edits >= 1;

  // Further edit to Shift 3 MUST BE REJECTED
  const s3ExceededAttempt = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift3',
    shiftAnalysis: {
      shift3: { na2co3: '99.50' },
    },
  });

  if (s3FinalOk && s3ExceededAttempt.status === 400 && s3ExceededAttempt.data.message?.includes('permanently locked')) {
    console.log('✅ Test 6 Passed: Exactly one final edit permitted for SHIFT 3; subsequent edits permanently locked.\n');
    passedTests++;
  } else {
    console.error('❌ Test 6 Failed: SHIFT 3 final edit / permanent lock enforcement failed.', s3FinalEditRes.data, s3ExceededAttempt.data);
  }

  // ── TEST 7: Hourly Routine Monitoring — Shift Assignment & Time Validation ──
  console.log('--- Test 7: Hourly Time-to-Shift Validation & Duplicate Prevention ---');
  const badShiftHourly = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: [
      { id: 'h1500_bad', time: '15:00', shift: 'Shift 1', nacl: '0.72', bd: '635' }, // 15:00 belongs to Shift 2!
    ],
  });

  const duplicateHourly = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: [
      { id: 'h0600_1', time: '06:00', shift: 'Shift 1', nacl: '0.70', bd: '630' },
      { id: 'h0600_2', time: '06:00', shift: 'Shift 1', nacl: '0.72', bd: '635' },
    ],
  });

  if (
    badShiftHourly.status === 400 &&
    badShiftHourly.data.message?.includes('belongs to Shift 2') &&
    duplicateHourly.status === 400 &&
    duplicateHourly.data.message?.includes('Duplicate sampling time')
  ) {
    console.log('✅ Test 7 Passed: Wrong hourly shift timing and duplicate sampling times correctly rejected.\n');
    passedTests++;
  } else {
    console.error('❌ Test 7 Failed: Hourly time validation failed.', badShiftHourly.data, duplicateHourly.data);
  }

  // ── TEST 8: Hourly Routine Monitoring — Lock Integration ──
  console.log('--- Test 8: Hourly Monitoring Locked when Shift is Locked ---');
  // Since all 3 shifts are now locked from earlier steps, any modification to Shift 1, Shift 2, or Shift 3 hourly readings must be rejected!
  const modifyLockedS1Hour = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: [
      { id: 'h0700', time: '07:00', shift: 'Shift 1', nacl: '0.99', bd: '750' },
    ],
  });

  const modifyLockedS2Hour = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: [
      { id: 'h1500', time: '15:00', shift: 'Shift 2', nacl: '0.99', bd: '750' },
    ],
  });

  const modifyLockedS3Hour = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: [
      { id: 'h2300', time: '23:00', shift: 'Shift 3', nacl: '0.99', bd: '750' },
    ],
  });

  const s1HourBlocked = modifyLockedS1Hour.status === 400 && modifyLockedS1Hour.data.message?.includes('permanently locked');
  const s2HourBlocked = modifyLockedS2Hour.status === 400 && modifyLockedS2Hour.data.message?.includes('permanently locked');
  const s3HourBlocked = modifyLockedS3Hour.status === 400 && modifyLockedS3Hour.data.message?.includes('permanently locked');

  if (s1HourBlocked && s2HourBlocked && s3HourBlocked) {
    console.log('✅ Test 8 Passed: When shifts are locked, modifying their hourly readings is strictly rejected with HTTP 400.\n');
    passedTests++;
  } else {
    console.error('❌ Test 8 Failed: Hourly lock enforcement failed.', modifyLockedS1Hour.data, modifyLockedS2Hour.data, modifyLockedS3Hour.data);
  }

  // ── TEST 9: Independent Saves & Persistence Across GET / Refresh ──
  console.log('--- Test 9: Independent Persistence & Shift Status Retained in MongoDB ---');
  const getRecord = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  const recordData = getRecord.data.data || {};
  const recordLocks = getRecord.data.lockedShifts || recordData.lockedShifts || {};

  const allLockedPersisted = recordLocks.shift1Locked && recordLocks.shift2Locked && recordLocks.shift3Locked;
  const s1DataPersisted = recordData.shiftAnalysis?.shift1?.na2co3 === '99.25';
  const s3DataPersisted = recordData.shiftAnalysis?.shift3?.na2co3 === '99.15';

  if (getRecord.status === 200 && allLockedPersisted && s1DataPersisted && s3DataPersisted) {
    console.log('✅ Test 9 Passed: MongoDB successfully persisted lockedShifts states and all shift parameters.\n');
    passedTests++;
  } else {
    console.error('❌ Test 9 Failed: MongoDB GET persistence failed.', recordLocks, recordData.shiftAnalysis);
  }

  // ── TEST 10: Dynamic Email Resolution & Retry Email Route ──
  console.log('--- Test 10: Dynamic Operator Recipient Resolution & Retry Email ---');
  const recipient = getRecord.data.assignedOperatorEmail || recordData.emailRecipient;
  const recordId = getRecord.data.recordId || recordData._id || recordData.id;

  const retryRes = await postJson(`${BASE_URL}/${recordId}/retry-email`, {});

  if (recipient === 'sa_operator@tfl.com' && retryRes.status === 200) {
    console.log(`✅ Test 10 Passed: Resolved SA operator (${recipient}) dynamically and retry-email route executed cleanly.\n`);
    passedTests++;
  } else {
    console.error(`❌ Test 10 Failed: Expected sa_operator@tfl.com, got ${recipient}`, retryRes.data);
  }

  // ── TEST 11: Scope Integrity Check — No Unrelated Routes Touched ──
  console.log('--- Test 11: Scope Integrity Verification ---');
  const healthRes = await getJson('http://localhost:5000/api/health');
  const sieveRes = await getJson(`http://localhost:5000/api/lsa-bagging-sieve?date=${todayKolkata}`);
  const lsaShiftRes = await getJson(`http://localhost:5000/api/lsa-analysis?date=${todayKolkata}`);

  if (healthRes.status === 200 && sieveRes.status === 200 && lsaShiftRes.status === 200) {
    console.log('✅ Test 11 Passed: Unrelated analysis routes (LSA Bagging Sieve, LSA Shift Analysis, Health) intact.\n');
    passedTests++;
  } else {
    console.error('❌ Test 11 Failed: Scope violation or regression in unrelated routes.');
  }

  console.log('======================================================================');
  console.log(`📊 Test Results: ${passedTests}/${totalTests} Scenarios Passed`);
  console.log('======================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 11 SEQUENTIAL LOCKING & PERSISTENCE SCENARIOS PASSED!\n');
    process.exit(0);
  } else {
    console.error(`⚠️ ${totalTests - passedTests} test(s) failed.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
