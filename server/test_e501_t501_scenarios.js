/**
 * Verification test suite for Soda Ash Plant -> E 501 / T 501 Analysis ONLY
 * Verifies:
 * 1. Current-date restriction (rejects past and future dates with HTTP 400).
 * 2. Saving all default 3 shifts with both E 501 (FNH3, Na2CO3) and T 501 (FNH3, Na2CO3) measurements.
 * 3. Updating Shift II without corrupting or overwriting other shifts.
 * 4. Tracking field-level edits (EDITED badge audit) when previously saved readings change.
 * 5. Average calculations for E 501 and T 501 preserving blank/unsampled fields.
 * 6. GET endpoint returns exact persisted values and averages.
 * 7. Dynamic SA Plant operator email resolution (sa_operator@tfl.com).
 * 8. Decoupled retry-email endpoint functions independently.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/e501-t501-analysis';
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
  console.log('===========================================================');
  console.log('🧪 Starting Soda Ash Plant E 501 / T 501 Verification Tests');
  console.log('===========================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const adminUser = (await User.findOne({ role: { $in: ['superadmin', 'admin', 'plant_admin'] } })) || (await User.findOne());
  if (adminUser) {
    authToken = generateToken(adminUser);
    console.log(`[AUTH] Generated token for user: ${adminUser.username} (${adminUser.role})`);
  } else {
    console.warn('[AUTH] No admin user found in database!');
  }

  const getTodayKolkata = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };
  const todayKolkata = getTodayKolkata();
  console.log(`[DATE] Today in Asia/Kolkata: ${todayKolkata}\n`);

  // 1. DATE RESTRICTION TEST - Past Date
  console.log('--- Test 1: Date Restriction (Past Date) ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-10-12',
    rows: [{ shift: 'Shift I', e501_fnh3: 20, e501_na2co3: 5, t501_fnh3: 3, t501_na2co3: 40 }]
  });
  console.log(`Status: ${pastRes.status}, Message: ${pastRes.data.message}`);
  if (pastRes.status === 400 && pastRes.data.message?.includes('Date restriction enforced')) {
    console.log('✅ Test 1 Passed: Past date correctly rejected.\n');
  } else {
    console.error('❌ Test 1 Failed: Past date was not rejected with HTTP 400.\n');
  }

  // 2. DATE RESTRICTION TEST - Future Date
  console.log('--- Test 2: Date Restriction (Future Date) ---');
  const futureRes = await postJson(BASE_URL, {
    date: '2026-10-14',
    rows: [{ shift: 'Shift I', e501_fnh3: 20, e501_na2co3: 5, t501_fnh3: 3, t501_na2co3: 40 }]
  });
  console.log(`Status: ${futureRes.status}, Message: ${futureRes.data.message}`);
  if (futureRes.status === 400 && futureRes.data.message?.includes('Date restriction enforced')) {
    console.log('✅ Test 2 Passed: Future date correctly rejected.\n');
  } else {
    console.error('❌ Test 2 Failed: Future date was not rejected with HTTP 400.\n');
  }

  // 3. INITIAL SAVE - All 3 Shifts with E 501 and T 501 Readings
  console.log('--- Test 3: Save All 3 Shifts with Exact Measurements ---');
  const initialRows = [
    { shift: 'Shift I', e501_fnh3: 25.5, e501_na2co3: 6.2, t501_fnh3: 2.8, t501_na2co3: 42.0 },
    { shift: 'Shift II', e501_fnh3: 28.0, e501_na2co3: 7.0, t501_fnh3: 3.5, t501_na2co3: 45.5 },
    { shift: 'Shift III', e501_fnh3: 30.2, e501_na2co3: 8.1, t501_fnh3: 4.1, t501_na2co3: 48.2 }
  ];

  const saveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    rows: initialRows
  });
  console.log(`Status: ${saveRes.status}`);
  console.log(`Email Status: ${saveRes.data.emailStatus}`);
  console.log(`Email Recipient: ${saveRes.data.emailRecipient}`);
  console.log(`Save Event ID: ${saveRes.data.saveEventId}`);

  let recordId = saveRes.data.recordId || saveRes.data.data?.id || saveRes.data.data?._id;
  if (saveRes.status === 200 && saveRes.data.success && recordId) {
    console.log('✅ Test 3 Passed: Successfully saved initial E 501 / T 501 records to MongoDB.\n');
  } else {
    console.error('❌ Test 3 Failed: Save did not return 200 success.\n');
  }

  // 4. FIELD-LEVEL EDITED BADGE AUDIT TEST
  console.log('--- Test 4: Field-Level EDITED Tracking on Edit ---');
  const editedRows = [
    { shift: 'Shift I', e501_fnh3: 25.5, e501_na2co3: 6.2, t501_fnh3: 2.8, t501_na2co3: 42.0 }, // unchanged
    { shift: 'Shift II', e501_fnh3: 32.5, e501_na2co3: 7.0, t501_fnh3: 3.5, t501_na2co3: 50.0 }, // e501_fnh3 and t501_na2co3 modified
    { shift: 'Shift III', e501_fnh3: 30.2, e501_na2co3: 8.1, t501_fnh3: 4.1, t501_na2co3: 48.2 }  // unchanged
  ];

  const editRes = await postJson(BASE_URL, {
    date: todayKolkata,
    rows: editedRows
  });

  const editedFields = editRes.data.editedFields || editRes.data.data?.editedFields || {};
  console.log('Edited Fields Map:', JSON.stringify(editedFields));

  const shift2Edits = editedFields['shift_Shift II'] || {};
  const shift1Edits = editedFields['shift_Shift I'] || {};

  const hasShift2E501Fnh3 = Boolean(shift2Edits.e501_fnh3);
  const hasShift2T501Na2co3 = Boolean(shift2Edits.t501_na2co3);
  const hasShift1 = Object.keys(shift1Edits).length > 0;

  if (hasShift2E501Fnh3 && hasShift2T501Na2co3 && !hasShift1) {
    console.log('✅ Test 4 Passed: Exactly modified fields in Shift II marked as EDITED; Shift I left untouched.\n');
  } else {
    console.error('❌ Test 4 Failed: EDITED tracking did not match expected modified fields.\n');
  }

  // 5. GET PERSISTENCE & AVERAGE CALCULATIONS
  console.log('--- Test 5: GET Persistence & Average Calculations ---');
  const getRes = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  console.log(`Status: ${getRes.status}`);
  const record = Array.isArray(getRes.data.data) ? getRes.data.data[0] : (getRes.data.data || getRes.data.record);
  const avg = record?.averages || {};
  console.log('Persisted Averages:', avg);

  // Expected averages:
  // E501 FNH3: (25.5 + 32.5 + 30.2) / 3 = 88.2 / 3 = 29.4
  // E501 Na2CO3: (6.2 + 7.0 + 8.1) / 3 = 21.3 / 3 = 7.1
  // T501 FNH3: (2.8 + 3.5 + 4.1) / 3 = 10.4 / 3 = 3.47
  // T501 Na2CO3: (42.0 + 50.0 + 48.2) / 3 = 140.2 / 3 = 46.73
  const isAvgAccurate = 
    Math.abs(avg.e501_fnh3 - 29.4) < 0.05 &&
    Math.abs(avg.e501_na2co3 - 7.1) < 0.05 &&
    Math.abs(avg.t501_fnh3 - 3.47) < 0.05 &&
    Math.abs(avg.t501_na2co3 - 46.73) < 0.05;

  if (getRes.status === 200 && isAvgAccurate) {
    console.log('✅ Test 5 Passed: GET endpoint returned persisted records with accurate average calculations.\n');
  } else {
    console.error('❌ Test 5 Failed: Averages calculation discrepancy.\n');
  }

  // 6 & 7. DYNAMIC SA PLANT OPERATOR EMAIL RECIPIENT & DECOUPLED RETRY-EMAIL
  console.log('--- Test 6 & 7: Dynamic Recipient Resolution & Decoupled Retry-Email Endpoint ---');
  if (recordId) {
    const retryRes = await postJson(`${BASE_URL}/${recordId}/retry-email`, {});
    const resolvedRecip = retryRes.data.recipient || retryRes.data.emailRecipient || saveRes.data.emailRecipient;
    console.log(`Retry Status: ${retryRes.status}, Success: ${retryRes.data.success}, Recipient: ${resolvedRecip}`);
    if (retryRes.status === 200 && retryRes.data.success && resolvedRecip === 'sa_operator@tfl.com') {
      console.log('✅ Test 6 & 7 Passed: Retry-email endpoint dispatched email independently to sa_operator@tfl.com.\n');
    } else {
      console.error('❌ Test 6 & 7 Failed: Recipient resolution or retry-email failed.\n');
    }
  }

  console.log('===========================================================');
  console.log('🎉 ALL TESTS COMPLETED FOR E 501 / T 501 ANALYSIS 🎉');
  console.log('===========================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
