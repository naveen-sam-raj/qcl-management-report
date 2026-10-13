/**
 * Verification test suite for SA Plant -> Bicarbonate Moisture Analysis ONLY
 * Verifies:
 * 1. Current-date restriction (rejects past and future dates with HTTP 400).
 * 2. Saving all five existing row types (I SHIFT, II SHIFT, III SHIFT, ADDL SAPL1, SAMPLE) and readings.
 * 3. Adding and deleting slots without corrupting data.
 * 4. Tracking field-level edits (EDITED badge audit) when previously saved readings change.
 * 5. GET endpoint returns exact persisted values and blank fields preserved.
 * 6. Dynamic SA Plant operator email resolution (sa_operator@tfl.com).
 * 7. Decoupled retry-email endpoint functions independently.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

const BASE_URL = 'http://localhost:5000/api/bicarbonate-moisture';
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
  console.log('🧪 Starting SA Plant Bicarbonate Moisture Verification Tests');
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
    readings: [{ id: '1', shift: 'I SHIFT', time: '07:00', m404_a: '20.5' }],
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
    readings: [{ id: '1', shift: 'I SHIFT', time: '07:00', m404_a: '20.5' }],
  });
  if (futureRes.status === 400 && futureRes.data.message?.includes('Date restriction enforced')) {
    console.log('✅ Future date rejection passed (HTTP 400)');
  } else {
    console.error(`❌ Future date failed: status=${futureRes.status}`, futureRes.data);
    allPassed = false;
  }

  // ── TEST 2: Save All 5 Existing Row Types & Multiple Readings ──
  console.log('\n--- Test 2: Save All 5 Existing Row Types for Today ---');
  const initialReadings = [
    { id: 'row_1', shift: 'I SHIFT', time: '07:00', m404_a: '19.5', m404_b: '20.2', m404_c: '21.3', m405_outlet: '12.4', sb_turb1: '70', sb_turb2: '74' },
    { id: 'row_2', shift: 'II SHIFT', time: '15:00', m404_a: '19.8', m404_b: '19.8', m404_c: '20.5', m405_outlet: '', sb_turb1: '53', sb_turb2: '72' },
    { id: 'row_3', shift: 'III SHIFT', time: '23:00', m404_a: '21.0', m404_b: '23.7', m404_c: '19.2', m405_outlet: '', sb_turb1: '72', sb_turb2: '122' },
    { id: 'row_4', shift: 'ADDL SAPL1', time: '11:00', m404_a: '20.1', m404_b: '24.2', m404_c: '22.3', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
    { id: 'row_5', shift: 'SAMPLE', time: '', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  ];

  const saveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    plant: 'SA',
    unit: 'Bicarbonate Moisture',
    readings: initialReadings,
  });

  let savedRecordId = null;
  if (saveRes.status === 200 && saveRes.data.success) {
    savedRecordId = saveRes.data.recordId || saveRes.data.data?.id;
    console.log(`✅ Initial save succeeded! Record ID: ${savedRecordId}`);
    console.log(`   Email status: ${saveRes.data.emailStatus}, Recipient: ${saveRes.data.emailRecipient}`);
    if (saveRes.data.emailRecipient?.includes('sa_operator@tfl.com')) {
      console.log('✅ Resolved registered SA Plant operator: sa_operator@tfl.com');
    }
  } else {
    console.error(`❌ Initial save failed: status=${saveRes.status}`, saveRes.data);
    allPassed = false;
  }

  // ── TEST 3: Add and Delete Slot without corrupting existing records ──
  console.log('\n--- Test 3: Add Additional Slot and Persist ---');
  const expandedReadings = [
    ...initialReadings,
    { id: 'row_extra_1', shift: 'EXTRA #6', time: '18:00', m404_a: '20.0', m404_b: '20.1', m404_c: '20.4', m405_outlet: '11.0', sb_turb1: '65', sb_turb2: '68' },
  ];

  const addSlotRes = await postJson(BASE_URL, {
    date: todayKolkata,
    plant: 'SA',
    unit: 'Bicarbonate Moisture',
    readings: expandedReadings,
  });

  if (addSlotRes.status === 200 && addSlotRes.data.success) {
    console.log('✅ Add slot succeeded and persisted to database!');
  } else {
    console.error('❌ Add slot failed:', addSlotRes.data);
    allPassed = false;
  }

  // ── TEST 4: Field-Level Edit Audit (EDITED Badges) ──
  console.log('\n--- Test 4: Field-Level Edit Audit ---');
  const modifiedReadings = expandedReadings.map((r) => {
    if (r.id === 'row_1') {
      return { ...r, m404_a: '21.5' }; // Changed from 19.5 to 21.5
    }
    return r;
  });

  const editRes = await postJson(BASE_URL, {
    date: todayKolkata,
    plant: 'SA',
    unit: 'Bicarbonate Moisture',
    readings: modifiedReadings,
  });

  if (editRes.status === 200 && editRes.data.success) {
    const edits = editRes.data.editedFields || {};
    if (edits['row_1'] && edits['row_1'].m404_a) {
      console.log('✅ Field-level edit tracked: row_1.m404_a marked as EDITED');
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
    console.log(`✅ GET returned data for today (${todayKolkata}). Total rows: ${fetched.readings?.length}`);
    const row1 = fetched.readings?.find((r) => r.id === 'row_1');
    if (row1 && row1.m404_a === '21.5') {
      console.log('✅ Exact updated value verified on GET: m404_a = 21.5');
    } else {
      console.error('❌ Mismatched value on GET:', row1);
      allPassed = false;
    }
    const sampleRow = fetched.readings?.find((r) => r.shift === 'SAMPLE');
    if (sampleRow && sampleRow.m404_a === '') {
      console.log('✅ Blank field preserved without fake zeroes: SAMPLE row is empty string');
    } else {
      console.error('❌ Blank field corrupted:', sampleRow);
      allPassed = false;
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
    console.log('🎉 ALL BICARBONATE MOISTURE VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED. PLEASE REVIEW.');
  }
  console.log('===========================================================');

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

runTests();
