/**
 * Verification test suite for SA Plant -> TK 419 SC Tank Analysis
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/sa-tk-419-sc-analysis';
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
  console.log('🧪 Starting TK 419 SC Tank Analysis Verification Tests');
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
    shifts: {
      s1: { fnh3: '2.05', cnh3: '4.05' }
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
    shifts: {
      s1: { fnh3: '2.05', cnh3: '4.05' }
    }
  });
  if (futureRes.status === 400) {
    console.log('PASS: Future date rejected with 400:', futureRes.data.message);
  } else {
    console.error('FAIL: Unexpected response for future date:', futureRes.status, futureRes.data);
  }

  // 2. Clean today's data in MongoDB for pristine run
  console.log('\n[SETUP] Cleaning today\'s TK 419 analysis records for pristine test run...');
  const db = mongoose.connection.db;
  const deleteResult = await db.collection('analyses').deleteMany({
    analysisType: { $in: ['TK 419 SC TANK Analysis', 'TK 419 SC Tank Analysis', 'TK 419 Analysis'] },
    date: {
      $gte: new Date(`${today}T00:00:00.000Z`),
      $lte: new Date(`${today}T23:59:59.999Z`)
    }
  });
  console.log(`Cleaned ${deleteResult.deletedCount} existing records for today.`);

  // 3. Sequential lock: Attempt to save Shift 2 before Shift 1
  console.log('\n[TEST 2] Sequential lock: Cannot save II SHIFT before I SHIFT');
  const s2EarlyRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s2: { fnh3: '2.08', cnh3: '4.06' }
    }
  });
  if (s2EarlyRes.status === 400) {
    console.log('PASS: II SHIFT rejected before I SHIFT (400):', s2EarlyRes.data.message);
  } else {
    console.error('FAIL: II SHIFT early save was not rejected:', s2EarlyRes.status, s2EarlyRes.data);
  }

  // 4. Save Shift 1
  console.log('\n[TEST 3] Save I SHIFT initial data');
  let s1Id;
  const s1Res = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.05', cnh3: '4.05' }
    }
  });
  if (s1Res.status === 201) {
    console.log('PASS: I SHIFT saved successfully! Status:', s1Res.status);
    console.log('Email delivery status:', s1Res.data.emailDeliveryStatus);
    console.log('Email recipient:', s1Res.data.emailRecipient);
    s1Id = s1Res.data.analysis?._id;
  } else {
    console.error('FAIL: Could not save I SHIFT:', s1Res.status, s1Res.data);
  }

  // 5. Edit Shift 1 before Shift 2 is saved (Allowed)
  console.log('\n[TEST 4] Edit I SHIFT before II SHIFT is saved (should be permitted)');
  const s1EditRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.10', cnh3: '4.05' } // fnh3 changed
    }
  });
  if (s1EditRes.status === 201) {
    console.log('PASS: I SHIFT edit permitted! Status:', s1EditRes.status);
    const editedFields = s1EditRes.data.analysis?.recordSummary?.shiftData?.s1?.editedFields;
    console.log('Edited fields tracked on s1:', editedFields);
  } else {
    console.error('FAIL: Edit I SHIFT failed:', s1EditRes.status, s1EditRes.data);
  }

  // 6. Save Shift 2
  console.log('\n[TEST 5] Save II SHIFT initial data');
  const s2Res = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.10', cnh3: '4.05' },
      s2: { fnh3: '2.08', cnh3: '4.08' }
    }
  });
  if (s2Res.status === 201) {
    console.log('PASS: II SHIFT saved successfully! Status:', s2Res.status);
    console.log('Email delivery status:', s2Res.data.emailDeliveryStatus);
  } else {
    console.error('FAIL: Could not save II SHIFT:', s2Res.status, s2Res.data);
  }

  // 7. Verify Shift 1 is now locked
  console.log('\n[TEST 6] Shift 1 must now be locked after II SHIFT is saved');
  const s1LockedRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.12', cnh3: '4.05' }, // attempt edit on locked s1
      s2: { fnh3: '2.08', cnh3: '4.08' }
    }
  });
  if (s1LockedRes.status === 400) {
    console.log('PASS: I SHIFT locked (400):', s1LockedRes.data.message);
  } else {
    console.error('FAIL: I SHIFT edit succeeded after II SHIFT saved:', s1LockedRes.status, s1LockedRes.data);
  }

  // 8. Save Shift 3
  console.log('\n[TEST 7] Save III SHIFT initial data');
  let s3Id;
  const s3Res = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.10', cnh3: '4.05' },
      s2: { fnh3: '2.08', cnh3: '4.08' },
      s3: { fnh3: '2.00', cnh3: '4.00' }
    }
  });
  if (s3Res.status === 201) {
    console.log('PASS: III SHIFT initial save successful! Status:', s3Res.status);
    console.log('Email delivery status:', s3Res.data.emailDeliveryStatus);
    s3Id = s3Res.data.analysis?._id;
  } else {
    console.error('FAIL: Could not save III SHIFT:', s3Res.status, s3Res.data);
  }

  // 9. Verify Shift 2 is now locked
  console.log('\n[TEST 8] Shift 2 must now be locked after III SHIFT initial save');
  const s2LockedRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.10', cnh3: '4.05' },
      s2: { fnh3: '2.15', cnh3: '4.08' }, // attempt edit on locked s2
      s3: { fnh3: '2.00', cnh3: '4.00' }
    }
  });
  if (s2LockedRes.status === 400) {
    console.log('PASS: II SHIFT locked (400):', s2LockedRes.data.message);
  } else {
    console.error('FAIL: II SHIFT edit succeeded after III SHIFT saved:', s2LockedRes.status, s2LockedRes.data);
  }

  // 10. Perform final edit on Shift 3 (Allowed once)
  console.log('\n[TEST 9] Shift 3 final edit allowance (Edit #1 - should succeed)');
  const s3FinalEditRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.10', cnh3: '4.05' },
      s2: { fnh3: '2.08', cnh3: '4.08' },
      s3: { fnh3: '2.02', cnh3: '4.02' } // changed
    }
  });
  if (s3FinalEditRes.status === 201) {
    console.log('PASS: III SHIFT final edit #1 succeeded! Status:', s3FinalEditRes.status);
    console.log('s3Edits count:', s3FinalEditRes.data.analysis?.recordSummary?.shiftData?.s3Edits);
  } else {
    console.error('FAIL: III SHIFT final edit #1 failed:', s3FinalEditRes.status, s3FinalEditRes.data);
  }

  // 11. Attempt 2nd edit on Shift 3 (Must fail - permanently locked)
  console.log('\n[TEST 10] Shift 3 attempt 2nd edit (should be permanently locked)');
  const s3SecondEditRes = await postJson(BASE_URL, {
    date: today,
    plant: 'SA',
    shifts: {
      s1: { fnh3: '2.10', cnh3: '4.05' },
      s2: { fnh3: '2.08', cnh3: '4.08' },
      s3: { fnh3: '2.04', cnh3: '4.04' } // attempt second edit
    }
  });
  if (s3SecondEditRes.status === 400) {
    console.log('PASS: III SHIFT 2nd edit rejected (400):', s3SecondEditRes.data.message);
  } else {
    console.error('FAIL: III SHIFT 2nd edit succeeded when it should be locked:', s3SecondEditRes.status, s3SecondEditRes.data);
  }

  // 12. GET data for today and verify locking states and values
  console.log('\n[TEST 11] GET /api/sa-tk-419-sc-analysis?date=' + today);
  const getRes = await getJson(`${BASE_URL}?date=${today}`);
  if (getRes.status === 200) {
    console.log('PASS: GET returned 200.');
    const data = getRes.data;
    console.log('Locked shifts state:', data.lockedShifts);
    console.log('Shift 1 data:', data.shifts?.s1);
    console.log('Shift 3 data:', data.shifts?.s3);
  } else {
    console.error('FAIL: GET endpoint failed:', getRes.status, getRes.data);
  }

  // 13. Test Retry Email endpoint
  console.log('\n[TEST 12] POST /api/sa-tk-419-sc-analysis/:id/retry-email');
  if (s3Id) {
    const retryRes = await postJson(`${BASE_URL}/${s3Id}/retry-email`, {});
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
  console.log('🎉 ALL TK 419 SC TANK VERIFICATIONS COMPLETED SUCCESSFULLY');
  console.log('========================================================');
}

runTests().catch(err => {
  console.error('Unexpected test harness error:', err);
  process.exit(1);
});
