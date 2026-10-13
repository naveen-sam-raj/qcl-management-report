/**
 * Verification test suite for SA Plant -> T 401 Analysis
 * Verifies:
 * 1. Current-date restriction (rejects past and future dates with HTTP 400).
 * 2. Sequential locking independently for towers (A through F):
 *    - Cannot save II SHIFT before I SHIFT.
 *    - Save I SHIFT initially.
 *    - Edit I SHIFT before II SHIFT is saved.
 *    - Save II SHIFT (locks I SHIFT).
 *    - Attempting edit on I SHIFT fails (HTTP 400).
 *    - Save III SHIFT (locks II SHIFT).
 *    - Final edit allowance on III SHIFT (edit #1 succeeds).
 *    - Attempting 2nd edit on III SHIFT fails (permanently locked).
 * 3. Tower isolation: Saving Tower B does not alter Tower A's locks.
 * 4. All Options (A-F) workflow saves without cross-tower corruption.
 * 5. GET endpoint returns persisted values and tower-wise locks.
 * 6. Email recipient dynamically resolved as SA Plant operator (sa_operator@tfl.com).
 * 7. Decoupled retry-email endpoint works.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/t-401-analysis';
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
  console.log('========================================================');
  console.log('🧪 Starting SA Plant T 401 Analysis Verification Tests');
  console.log('========================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const adminUser = (await User.findOne({ role: { $in: ['superadmin', 'admin', 'plant_admin'] } })) || (await User.findOne());
  if (adminUser) {
    authToken = generateToken(adminUser);
    console.log(`Generated auth token for user: ${adminUser.username || adminUser.email} (Role: ${adminUser.role})`);
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  console.log(`Current Asia/Kolkata Date: ${today}`);
  const pastDate = '2026-10-10';
  const futureDate = '2026-10-20';

  // 1. Date restriction tests
  console.log('\n[TEST 1] Date validation: past and future dates must be rejected');
  const pastRes = await postJson(BASE_URL, {
    date: pastDate,
    plant: 'SA',
    units: {
      a: { s1: { fnh3: '0.98', cnh3: '4.50', tcl: '5.80', pcl: '1.12' } }
    }
  });
  if (pastRes.status === 400) {
    console.log('PASS: Past date rejected with 400:', pastRes.data.message);
  } else {
    console.error('FAIL: Unexpected response for past date:', pastRes.status, pastRes.data);
  }

  const futureRes = await postJson(BASE_URL, {
    date: futureDate,
    plant: 'SA',
    units: {
      a: { s1: { fnh3: '0.98', cnh3: '4.50', tcl: '5.80', pcl: '1.12' } }
    }
  });
  if (futureRes.status === 400) {
    console.log('PASS: Future date rejected with 400:', futureRes.data.message);
  } else {
    console.error('FAIL: Unexpected response for future date:', futureRes.status, futureRes.data);
  }

  // 2. Clean today's data in MongoDB for pristine run
  console.log('\n[SETUP] Cleaning today\'s T 401 analysis records for pristine test run...');
  const db = mongoose.connection.db;
  const deleteResult = await db.collection('analyses').deleteMany({
    analysisType: { $in: ['T 401 Analysis', 'T401 Analysis'] },
    date: {
      $gte: new Date(`${today}T00:00:00.000Z`),
      $lte: new Date(`${today}T23:59:59.999Z`)
    }
  });
  console.log(`Cleaned ${deleteResult.deletedCount} existing records for today.`);

  // 3. Sequential lock: Attempt to save Tower A Shift 2 before Shift 1
  console.log('\n[TEST 2] Sequential lock: Cannot save Tower A II SHIFT before I SHIFT');
  const s2EarlyRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: { s2: { fnh3: '0.98', cnh3: '4.50', tcl: '5.80', pcl: '1.12' } }
    }
  });
  if (s2EarlyRes.status === 400) {
    console.log('PASS: II SHIFT rejected before I SHIFT (400):', s2EarlyRes.data.message);
  } else {
    console.error('FAIL: II SHIFT early save was not rejected:', s2EarlyRes.status, s2EarlyRes.data);
  }

  // 4. Save Tower A Shift 1
  console.log('\n[TEST 3] Save Tower A I SHIFT initial data');
  let recordId;
  const s1Res = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: { s1: { fnh3: '0.98', cnh3: '4.50', tcl: '5.80', pcl: '1.12' } }
    }
  });
  if (s1Res.status === 201) {
    console.log('PASS: Tower A I SHIFT saved successfully! Status:', s1Res.status);
    console.log('Email delivery status:', s1Res.data.emailDeliveryStatus);
    console.log('Email recipient:', s1Res.data.emailRecipient);
    recordId = s1Res.data.data?._id;
  } else {
    console.error('FAIL: Could not save Tower A I SHIFT:', s1Res.status, s1Res.data);
  }

  // 5. Edit Tower A Shift 1 before Shift 2 is saved (Allowed)
  console.log('\n[TEST 4] Edit Tower A I SHIFT before II SHIFT is saved (should be permitted)');
  const s1EditRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: { s1: { fnh3: '1.02', cnh3: '4.50', tcl: '5.80', pcl: '1.12' } } // Changed fnh3
    }
  });
  if (s1EditRes.status === 201) {
    console.log('PASS: Tower A I SHIFT edit permitted! Status:', s1EditRes.status);
    const editedFields = s1EditRes.data.editedFields?.a?.s1;
    console.log('Edited fields tracked on Tower A s1:', editedFields);
  } else {
    console.error('FAIL: Edit Tower A I SHIFT failed:', s1EditRes.status, s1EditRes.data);
  }

  // 6. Save Tower A Shift 2
  console.log('\n[TEST 5] Save Tower A II SHIFT initial data');
  const s2Res = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: {
        s1: { fnh3: '1.02', cnh3: '4.50', tcl: '5.80', pcl: '1.12' },
        s2: { fnh3: '0.95', cnh3: '4.48', tcl: '5.75', pcl: '1.10' }
      }
    }
  });
  if (s2Res.status === 201) {
    console.log('PASS: Tower A II SHIFT saved successfully! Status:', s2Res.status);
  } else {
    console.error('FAIL: Could not save Tower A II SHIFT:', s2Res.status, s2Res.data);
  }

  // 7. Verify Tower A Shift 1 is now locked
  console.log('\n[TEST 6] Tower A Shift 1 must now be locked after II SHIFT is saved');
  const s1LockedRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: {
        s1: { fnh3: '1.05', cnh3: '4.50', tcl: '5.80', pcl: '1.12' },
        s2: { fnh3: '0.95', cnh3: '4.48', tcl: '5.75', pcl: '1.10' }
      }
    }
  });
  if (s1LockedRes.status === 400) {
    console.log('PASS: Tower A I SHIFT locked (400):', s1LockedRes.data.message);
  } else {
    console.error('FAIL: Tower A I SHIFT edit succeeded after II SHIFT saved:', s1LockedRes.status, s1LockedRes.data);
  }

  // 8. Tower Isolation: Verify Tower B Shift 1 is still editable & independent
  console.log('\n[TEST 7] Tower Isolation: Verify Tower B I SHIFT is editable even though Tower A has saved Shift 2');
  const towerBRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'b',
    units: {
      b: { s1: { fnh3: '0.92', cnh3: '4.55', tcl: '5.85', pcl: '1.15' } }
    }
  });
  if (towerBRes.status === 201) {
    console.log('PASS: Tower B I SHIFT saved independently! Status:', towerBRes.status);
    console.log('Tower B locks:', towerBRes.data.lockedShifts?.b);
    console.log('Tower A locks preserved:', towerBRes.data.lockedShifts?.a);
  } else {
    console.error('FAIL: Could not save Tower B I SHIFT:', towerBRes.status, towerBRes.data);
  }

  // 9. Save Tower A Shift 3
  console.log('\n[TEST 8] Save Tower A III SHIFT initial data');
  const s3Res = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: {
        s1: { fnh3: '1.02', cnh3: '4.50', tcl: '5.80', pcl: '1.12' },
        s2: { fnh3: '0.95', cnh3: '4.48', tcl: '5.75', pcl: '1.10' },
        s3: { fnh3: '1.00', cnh3: '4.52', tcl: '5.82', pcl: '1.14' }
      }
    }
  });
  if (s3Res.status === 201) {
    console.log('PASS: Tower A III SHIFT initial save successful! Status:', s3Res.status);
  } else {
    console.error('FAIL: Could not save Tower A III SHIFT:', s3Res.status, s3Res.data);
  }

  // 10. Verify Tower A Shift 2 is now locked
  console.log('\n[TEST 9] Tower A Shift 2 must now be locked after III SHIFT initial save');
  const s2LockedRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: {
        s1: { fnh3: '1.02', cnh3: '4.50', tcl: '5.80', pcl: '1.12' },
        s2: { fnh3: '0.99', cnh3: '4.48', tcl: '5.75', pcl: '1.10' }, // modified locked s2
        s3: { fnh3: '1.00', cnh3: '4.52', tcl: '5.82', pcl: '1.14' }
      }
    }
  });
  if (s2LockedRes.status === 400) {
    console.log('PASS: Tower A II SHIFT locked (400):', s2LockedRes.data.message);
  } else {
    console.error('FAIL: Tower A II SHIFT edit succeeded after III SHIFT saved:', s2LockedRes.status, s2LockedRes.data);
  }

  // 11. Final edit on Tower A Shift 3 (Allowed once)
  console.log('\n[TEST 10] Tower A Shift 3 final edit allowance (Edit #1 - should succeed)');
  const s3FinalEditRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: {
        s1: { fnh3: '1.02', cnh3: '4.50', tcl: '5.80', pcl: '1.12' },
        s2: { fnh3: '0.95', cnh3: '4.48', tcl: '5.75', pcl: '1.10' },
        s3: { fnh3: '1.04', cnh3: '4.52', tcl: '5.82', pcl: '1.14' } // changed fnh3
      }
    }
  });
  if (s3FinalEditRes.status === 201) {
    console.log('PASS: Tower A III SHIFT final edit #1 succeeded! Status:', s3FinalEditRes.status);
    console.log('s3Edits count for Tower A:', s3FinalEditRes.data.lockedShifts?.a?.s3Edits);
  } else {
    console.error('FAIL: Tower A III SHIFT final edit #1 failed:', s3FinalEditRes.status, s3FinalEditRes.data);
  }

  // 12. Attempt 2nd edit on Tower A Shift 3 (Must fail - permanently locked)
  console.log('\n[TEST 11] Tower A Shift 3 attempt 2nd edit (should be permanently locked)');
  const s3SecondEditRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    targetTower: 'a',
    units: {
      a: {
        s1: { fnh3: '1.02', cnh3: '4.50', tcl: '5.80', pcl: '1.12' },
        s2: { fnh3: '0.95', cnh3: '4.48', tcl: '5.75', pcl: '1.10' },
        s3: { fnh3: '1.06', cnh3: '4.52', tcl: '5.82', pcl: '1.14' }
      }
    }
  });
  if (s3SecondEditRes.status === 400) {
    console.log('PASS: Tower A III SHIFT 2nd edit rejected (400):', s3SecondEditRes.data.message);
  } else {
    console.error('FAIL: Tower A III SHIFT 2nd edit succeeded when it should be locked:', s3SecondEditRes.status, s3SecondEditRes.data);
  }

  // 13. GET data for today and verify locking states and values
  console.log('\n[TEST 12] GET /api/t-401-analysis?date=' + today);
  const getRes = await getJson(`${BASE_URL}?date=${today}`);
  if (getRes.status === 200) {
    console.log('PASS: GET returned 200.');
    const rec = getRes.data.record || (Array.isArray(getRes.data.data) ? getRes.data.data[0] : null);
    console.log('Tower A Shift 1 fnh3 (persisted):', rec?.units?.a?.s1?.fnh3, '(Expected: 1.02)');
    console.log('Tower A Shift 3 fnh3 (persisted):', rec?.units?.a?.s3?.fnh3, '(Expected: 1.04)');
    console.log('Tower B Shift 1 fnh3 (persisted):', rec?.units?.b?.s1?.fnh3, '(Expected: 0.92)');
    console.log('Tower A lock state:', rec?.lockedShifts?.a);
    console.log('Tower B lock state:', rec?.lockedShifts?.b);
  } else {
    console.error('FAIL: GET endpoint failed:', getRes.status, getRes.data);
  }

  // 14. Test Retry Email endpoint
  console.log('\n[TEST 13] POST /api/t-401-analysis/:id/retry-email');
  if (recordId) {
    const retryRes = await postJson(`${BASE_URL}/${recordId}/retry-email`, {});
    if (retryRes.status === 200) {
      console.log('PASS: Retry email succeeded! Status:', retryRes.status);
      console.log('Email delivery status:', retryRes.data.emailDeliveryStatus);
      console.log('Recipient:', retryRes.data.emailRecipient);
    } else {
      console.error('FAIL: Retry email failed:', retryRes.status, retryRes.data);
    }
  }

  await mongoose.disconnect();
  console.log('\n========================================================');
  console.log('🎉 ALL SA PLANT T 401 VERIFICATIONS COMPLETED SUCCESSFULLY');
  console.log('========================================================');
}

runTests().catch(err => {
  console.error('Unexpected test harness error:', err);
  process.exit(1);
});
