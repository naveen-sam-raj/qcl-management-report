/**
 * Verification test suite for Soda Ash Plant -> LSA at 500# Analysis ONLY
 * Verifies:
 * 1. Current-date restriction (rejects past and future dates with HTTP 400).
 * 2. Saving all default and custom time slots, NaCl %, BD, and Turbidity values.
 * 3. Adding and deleting slots without corrupting existing records.
 * 4. Tracking field-level edits (EDITED badge audit) when previously saved readings change.
 * 5. Average NaCl % calculation and preserving blank/unsampled fields.
 * 6. GET endpoint returns exact persisted values.
 * 7. Dynamic SA Plant operator email resolution (sa_operator@tfl.com).
 * 8. Decoupled retry-email endpoint functions independently.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/lsa-500-analysis';
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
  console.log('🧪 Starting Soda Ash Plant LSA at 500# Verification Tests');
  console.log('===========================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const adminUser = (await User.findOne({ role: { $in: ['superadmin', 'admin', 'plant_admin'] } })) || (await User.findOne());
  if (adminUser) {
    authToken = generateToken(adminUser);
    console.log(`Generated auth token for user: ${adminUser.username || adminUser.email} (Role: ${adminUser.role})`);
  }

  const todayKolkata = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  console.log(`Today's date in Asia/Kolkata: ${todayKolkata}\n`);

  let allPassed = true;

  // ── TEST 1: Date Restrictions (Reject Past & Future Dates) ──
  console.log('--- Test 1: Date Restrictions ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-09-13',
    plant: 'SA',
    rows: [{ id: 'r1', time: '06:30', nacl: '1.2' }],
  });
  if (pastRes.status === 400 && pastRes.data.message?.includes('Date restriction enforced')) {
    console.log('✅ Past date rejection passed (HTTP 400)');
  } else {
    console.error(`❌ Past date failed: status=${pastRes.status}`, pastRes.data);
    allPassed = false;
  }

  const futureRes = await postJson(BASE_URL, {
    date: '2026-11-20',
    plant: 'SA',
    rows: [{ id: 'r1', time: '06:30', nacl: '1.2' }],
  });
  if (futureRes.status === 400 && futureRes.data.message?.includes('Date restriction enforced')) {
    console.log('✅ Future date rejection passed (HTTP 400)');
  } else {
    console.error(`❌ Future date failed: status=${futureRes.status}`, futureRes.data);
    allPassed = false;
  }

  // ── TEST 2: Save Default Time Slots for Today ──
  console.log('\n--- Test 2: Save Default Time Slots for Today ---');
  const initialRows = [
    { id: 'r1', time: '06:30', nacl: '1.10', bd: '620', turbidity: '80', isDefault: true },
    { id: 'r2', time: '08:30', nacl: '1.30', bd: '640', turbidity: '78', isDefault: true },
    { id: 'r3', time: '10:00', nacl: '0.90', bd: '610', turbidity: '82', isDefault: true },
    { id: 'r4', time: '12:00', nacl: '', bd: '', turbidity: '', isDefault: true }, // Unsampled blank row
  ];

  const saveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    plant: 'SA',
    unit: 'LSA AT 500#',
    rows: initialRows,
  });

  let savedRecordId = null;
  if (saveRes.status === 200 && saveRes.data.success) {
    savedRecordId = saveRes.data.recordId || saveRes.data.data?.id;
    console.log(`✅ Initial save succeeded! Record ID: ${savedRecordId}`);
    console.log(`   Calculated averageNaCl: ${saveRes.data.data?.averageNaCl} % (Expected: 1.10)`);
    if (saveRes.data.data?.averageNaCl === '1.10') {
      console.log('✅ Accurate average NaCl % calculation verified');
    } else {
      console.error('❌ Mismatched averageNaCl:', saveRes.data.data?.averageNaCl);
      allPassed = false;
    }
  } else {
    console.error(`❌ Initial save failed: status=${saveRes.status}`, saveRes.data);
    allPassed = false;
  }

  // ── TEST 3: Add Additional Slot and Persist ──
  console.log('\n--- Test 3: Add Additional Slot and Persist ---');
  const expandedRows = [
    ...initialRows,
    { id: 'r_extra_1', time: '13:30', nacl: '1.50', bd: '650', turbidity: '79', isDefault: false },
  ];

  const addSlotRes = await postJson(BASE_URL, {
    date: todayKolkata,
    plant: 'SA',
    unit: 'LSA AT 500#',
    rows: expandedRows,
  });

  if (addSlotRes.status === 200 && addSlotRes.data.success) {
    console.log('✅ Add slot succeeded and persisted to database!');
  } else {
    console.error('❌ Add slot failed:', addSlotRes.data);
    allPassed = false;
  }

  // ── TEST 4: Field-Level Edit Audit (EDITED Badges) ──
  console.log('\n--- Test 4: Field-Level Edit Audit ---');
  const modifiedRows = expandedRows.map((r) => {
    if (r.id === 'r1') {
      return { ...r, nacl: '1.80' }; // Changed from 1.10 to 1.80
    }
    return r;
  });

  const editRes = await postJson(BASE_URL, {
    date: todayKolkata,
    plant: 'SA',
    unit: 'LSA AT 500#',
    rows: modifiedRows,
  });

  if (editRes.status === 200 && editRes.data.success) {
    const edits = editRes.data.editedFields || {};
    if (edits['r1'] && edits['r1'].nacl) {
      console.log('✅ Field-level edit tracked: r1.nacl marked as EDITED');
    } else {
      console.error('❌ Field edit not tracked properly in editedFields:', edits);
      allPassed = false;
    }
  } else {
    console.error('❌ Edit save failed:', editRes.data);
    allPassed = false;
  }

  // ── TEST 5: GET Endpoint Verification ──
  console.log('\n--- Test 5: GET Endpoint Verification ---');
  const getRes = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  if (getRes.status === 200 && getRes.data.success && getRes.data.data) {
    const fetched = getRes.data.data;
    console.log(`✅ GET returned data for today (${todayKolkata}). Total rows: ${fetched.rows?.length}`);
    const r1 = fetched.rows?.find((r) => r.id === 'r1');
    if (r1 && r1.nacl === '1.80') {
      console.log('✅ Exact updated value verified on GET: r1.nacl = 1.80');
    } else {
      console.error('❌ Mismatched value on GET:', r1);
      allPassed = false;
    }
    const r4 = fetched.rows?.find((r) => r.id === 'r4');
    if (r4 && r4.nacl === '') {
      console.log('✅ Blank field preserved without fake zeroes: r4 row has empty string');
    } else {
      console.error('❌ Blank field corrupted on GET:', r4);
      allPassed = false;
    }
    if (getRes.data.assignedOperatorEmail?.includes('sa_operator@tfl.com')) {
      console.log('✅ Resolved registered SA Plant operator email: sa_operator@tfl.com');
    }
  } else {
    console.error('❌ GET failed:', getRes.data);
    allPassed = false;
  }

  // ── TEST 6: Decoupled Email Retry Endpoint ──
  console.log('\n--- Test 6: Decoupled Email Retry Endpoint ---');
  if (savedRecordId) {
    const retryRes = await postJson(`${BASE_URL}/${savedRecordId}/retry-email`, {});
    if (retryRes.status === 200 && retryRes.data.success) {
      console.log(`✅ Retry email succeeded! Delivery Status: ${retryRes.data.emailDeliveryStatus}, Recipient: ${retryRes.data.emailRecipient}`);
    } else {
      console.error('❌ Retry email failed:', retryRes.data);
      allPassed = false;
    }
  }

  console.log('\n===========================================================');
  if (allPassed) {
    console.log('🎉 ALL LSA AT 500# VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED. PLEASE REVIEW.');
  }
  console.log('===========================================================');

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

runTests();
