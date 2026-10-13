/**
 * Verification test suite for Soda Ash Plant -> LSA Shift Analysis ONLY
 * Verifies:
 * 1. Current-date restriction (rejects past and future dates with HTTP 400).
 * 2. Saving all 4 rows (I Shift, II Shift, III Shift, Composite) with all 8 parameters independently.
 * 3. Updating one shift without overwriting other shifts or composite.
 * 4. Tracking field-level edits (EDITED badge audit) when previously saved readings change.
 * 5. GET endpoint returns exact persisted values.
 * 6. Dynamic SA Plant operator email resolution (sa_operator@tfl.com).
 * 7. Decoupled retry-email endpoint functions independently.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/lsa-analysis';
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
  console.log('🧪 Starting Soda Ash Plant LSA Shift Analysis Verification Tests');
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
      day: '2-digit',
    }).format(new Date());
  };
  const todayKolkata = getTodayKolkata();
  console.log(`[DATE] Today in Asia/Kolkata: ${todayKolkata}\n`);

  // 1. DATE RESTRICTION TEST - Past Date
  console.log('--- Test 1: Date Restriction (Past Date) ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-10-12',
    shifts: {
      iShift: { na2co3: '99.1', nacl: '0.71', fe: '0.0030', na2so4: '0.000', vm: '0.14', ir: '', bd: '635', turbidity: '63' },
    },
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
    shifts: {
      iShift: { na2co3: '99.1', nacl: '0.71', fe: '0.0030', na2so4: '0.000', vm: '0.14', ir: '', bd: '635', turbidity: '63' },
    },
  });
  console.log(`Status: ${futureRes.status}, Message: ${futureRes.data.message}`);
  if (futureRes.status === 400 && futureRes.data.message?.includes('Date restriction enforced')) {
    console.log('✅ Test 2 Passed: Future date correctly rejected.\n');
  } else {
    console.error('❌ Test 2 Failed: Future date was not rejected with HTTP 400.\n');
  }

  // 3. INITIAL SAVE - All 4 Rows (I Shift, II Shift, III Shift, Composite)
  console.log('--- Test 3: Save All 4 Rows with Exact Measurements ---');
  const initialShifts = {
    iShift: { na2co3: '99.1', nacl: '0.71', fe: '0.0030', na2so4: '0.080', vm: '1.20', ir: '0.150', bd: '635', turbidity: '80' },
    iiShift: { na2co3: '99.2', nacl: '0.73', fe: '0.0029', na2so4: '0.080', vm: '1.25', ir: '0.152', bd: '640', turbidity: '81' },
    iiiShift: { na2co3: '99.0', nacl: '0.80', fe: '0.0032', na2so4: '0.081', vm: '1.18', ir: '0.149', bd: '630', turbidity: '79' },
    composite: { na2co3: '99.1', nacl: '0.75', fe: '0.0030', na2so4: '0.080', vm: '1.21', ir: '0.150', bd: '635', turbidity: '80' },
  };

  const saveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    shifts: initialShifts,
  });
  console.log(`Status: ${saveRes.status}`);
  console.log(`Email Status: ${saveRes.data.emailStatus}`);
  console.log(`Email Recipient: ${saveRes.data.emailRecipient}`);
  console.log(`Save Event ID: ${saveRes.data.saveEventId}`);

  let recordId = saveRes.data.recordId || saveRes.data.data?.id || saveRes.data.data?._id;
  if (saveRes.status === 200 && saveRes.data.success && recordId) {
    console.log('✅ Test 3 Passed: Successfully saved initial LSA Shift records to MongoDB.\n');
  } else {
    console.error('❌ Test 3 Failed: Save did not return 200 success.\n');
  }

  // 4. FIELD-LEVEL EDITED BADGE AUDIT TEST
  console.log('--- Test 4: Field-Level EDITED Tracking on Edit ---');
  const editedShifts = {
    iShift: { na2co3: '99.1', nacl: '0.71', fe: '0.0030', na2so4: '0.080', vm: '1.20', ir: '0.150', bd: '635', turbidity: '80' }, // unchanged
    iiShift: { na2co3: '99.4', nacl: '0.73', fe: '0.0029', na2so4: '0.080', vm: '1.25', ir: '0.152', bd: '655', turbidity: '81' }, // na2co3 and bd modified
    iiiShift: { na2co3: '99.0', nacl: '0.80', fe: '0.0032', na2so4: '0.081', vm: '1.18', ir: '0.149', bd: '630', turbidity: '79' }, // unchanged
    composite: { na2co3: '99.1', nacl: '0.75', fe: '0.0030', na2so4: '0.080', vm: '1.21', ir: '0.150', bd: '635', turbidity: '80' }, // unchanged
  };

  const editRes = await postJson(BASE_URL, {
    date: todayKolkata,
    shifts: editedShifts,
  });

  const editedFields = editRes.data.editedFields || editRes.data.data?.editedFields || {};
  console.log('Edited Fields Map:', JSON.stringify(editedFields));

  const shift2Edits = editedFields['iiShift'] || {};
  const shift1Edits = editedFields['iShift'] || {};

  const hasShift2Na2co3 = Boolean(shift2Edits.na2co3);
  const hasShift2Bd = Boolean(shift2Edits.bd);
  const hasShift1 = Object.keys(shift1Edits).length > 0;

  if (hasShift2Na2co3 && hasShift2Bd && !hasShift1) {
    console.log('✅ Test 4 Passed: Exactly modified fields in II SHIFT marked as EDITED; I SHIFT left untouched.\n');
  } else {
    console.error('❌ Test 4 Failed: EDITED tracking did not match expected modified fields.\n');
  }

  // 5. GET PERSISTENCE & COMPOSITE ROW VERIFICATION
  console.log('--- Test 5: GET Persistence & Composite Row Preservation ---');
  const getRes = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  console.log(`Status: ${getRes.status}`);
  const record = Array.isArray(getRes.data.data) ? getRes.data.data[0] : (getRes.data.data || getRes.data.record);
  const fetchedShifts = record?.shifts || {};

  const s2Na2co3 = fetchedShifts.iiShift?.na2co3;
  const s2Bd = fetchedShifts.iiShift?.bd;
  const compNa2co3 = fetchedShifts.composite?.na2co3;
  const compNacl = fetchedShifts.composite?.nacl;

  console.log(`Persisted values -> II Shift Na2CO3: ${s2Na2co3}, BD: ${s2Bd} | Composite Na2CO3: ${compNa2co3}, NaCl: ${compNacl}`);

  if (getRes.status === 200 && s2Na2co3 === '99.4' && s2Bd === '655' && compNa2co3 === '99.1' && compNacl === '0.75') {
    console.log('✅ Test 5 Passed: GET endpoint returned exact persisted values and preserved Composite independently.\n');
  } else {
    console.error('❌ Test 5 Failed: Mismatched values on GET endpoint.\n');
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
  console.log('🎉 ALL TESTS COMPLETED FOR LSA SHIFT ANALYSIS 🎉');
  console.log('===========================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
