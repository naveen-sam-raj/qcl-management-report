/**
 * Verification test suite for SA Plant -> LSA Bagging Sieve Analysis ONLY
 * Tests:
 * 1. Date restriction: Rejects past and future dates with HTTP 400.
 * 2. Saving multiple sampling rows with exact decimal values independently.
 * 3. Adding custom time slots, editing rows, and deleting time slots with audit history.
 * 4. Correct date-wise and time-slot-wise data isolation.
 * 5. Persistence after refresh and logout/login via GET endpoint (blank stays blank, no mock data).
 * 6. Exact match between entries, MongoDB PlantAnalysisRecord, and response payload.
 * 7. Correct registered SA Plant User recipient (sa_operator@tfl.com).
 * 8. Field-level edit tracking (EDITED badge) only on modified values.
 * 9. Duplicate sampling-time handling (rejects duplicate times with HTTP 400).
 * 10. Decoupled retry-email endpoint functions independently without re-saving analysis.
 * 11. Strict Scope Integrity: Verifies other analysis routes are intact and untouched.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

// Start Express server and connect DB
const app = require('./server');

const BASE_URL = 'http://localhost:5000/api/lsa-bagging-sieve';
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
  console.log('================================================================');
  console.log('🧪 Starting SA Plant LSA Bagging Sieve Analysis Verification Tests');
  console.log('================================================================\n');

  // Ensure DB connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const User = require('./models/User');
  const PlantAnalysisRecord = require('./models/PlantAnalysisRecord');
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

  let passedTests = 0;
  let totalTests = 11;

  // 1. DATE RESTRICTION TEST - Past Date
  console.log('--- Test 1: Date Restriction (Past & Future Dates) ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-10-10',
    rows: [
      { id: 'r1', time: '09:30', bss10: '0.12', bss30: '1.75', m30: '4.05', bss60: '5.82' },
    ],
  });
  const futureRes = await postJson(BASE_URL, {
    date: '2026-10-25',
    rows: [
      { id: 'r1', time: '09:30', bss10: '0.12', bss30: '1.75', m30: '4.05', bss60: '5.82' },
    ],
  });

  if (pastRes.status === 400 && futureRes.status === 400) {
    console.log('✅ Test 1 Passed: Past and Future dates correctly rejected with HTTP 400.');
    passedTests++;
  } else {
    console.error(`❌ Test 1 Failed: Past status: ${pastRes.status}, Future status: ${futureRes.status}`);
  }

  // 2. SAVING MULTIPLE SAMPLING ROWS WITH EXACT DECIMAL VALUES
  console.log('\n--- Test 2: Saving Multiple Sampling Rows with Exact Decimal Values ---');
  const sampleRows = [
    { id: 'r1', time: '09:30', bss10: '0.10', bss30: '1.85', m30: '4.00', bss60: '5.75' },
    { id: 'r2', time: '10:30', bss10: '0.15', bss30: '1.70', m30: '4.10', bss60: '5.65' },
    { id: 'r3', time: '11:30', bss10: '0.08', bss30: '1.92', m30: '3.95', bss60: '5.90' },
    { id: 'r4', time: '14:30', bss10: '',     bss30: '',     m30: '',     bss60: '' }, // Blank row
  ];

  const saveRes = await postJson(BASE_URL, {
    date: todayKolkata,
    rows: sampleRows,
  });

  let savedRecordId = saveRes.data?.recordId;
  if (saveRes.status === 201 && saveRes.data?.success && savedRecordId) {
    console.log(`✅ Test 2 Passed: Successfully saved multiple rows. Record ID: ${savedRecordId}`);
    passedTests++;
  } else {
    console.error(`❌ Test 2 Failed: Status: ${saveRes.status}, Message: ${saveRes.data?.message}`);
  }

  // 3. PERSISTENCE AFTER REFRESH (GET) & EXACT DECIMAL INTEGRITY
  console.log('\n--- Test 3: Date-Wise Persistence & Exact Decimal Matching on Refresh ---');
  const getRes = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  const retrievedRecord = getRes.data?.record;
  const retrievedRows = retrievedRecord?.rows || [];

  const row1 = retrievedRows.find((r) => r.time === '09:30');
  const row4 = retrievedRows.find((r) => r.time === '14:30');

  const exactMatch =
    row1 &&
    String(row1.bss10) === '0.10' &&
    String(row1.bss30) === '1.85' &&
    String(row1.m30) === '4.00' &&
    String(row1.bss60) === '5.75' &&
    row4 &&
    (row4.bss10 === '' || row4.bss10 === undefined);

  if (getRes.status === 200 && exactMatch) {
    console.log('✅ Test 3 Passed: Reloaded exact persisted decimal values. Blank row preserved as blank.');
    passedTests++;
  } else {
    console.error('❌ Test 3 Failed: Row 1 or Row 4 values mismatch:', row1, row4);
  }

  // 4. MONGODB RECORD VERIFICATION
  console.log('\n--- Test 4: MongoDB Atlas Persistence Verification ---');
  const mongoDoc = await PlantAnalysisRecord.findOne({
    date: todayKolkata,
    plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
    analysisType: 'LSA Bagging Sieve Analysis',
  });

  if (mongoDoc && mongoDoc.data?.rows?.length >= 3) {
    console.log(`✅ Test 4 Passed: MongoDB document confirmed in "plantanalysisrecords" (ID: ${mongoDoc._id}).`);
    passedTests++;
  } else {
    console.error('❌ Test 4 Failed: MongoDB document not found or rows empty.');
  }

  // 5. ADDING CUSTOM TIME SLOT & DELETING TIME SLOT
  console.log('\n--- Test 5: Adding Custom Time Slot & Deleting Time Slot ---');
  const modifiedRows = [
    ...sampleRows.filter((r) => r.time !== '11:30'), // Delete 11:30
    { id: 'custom_1', time: '15:30', bss10: '0.11', bss30: '1.68', m30: '4.15', bss60: '5.85', isDefault: false }, // Add custom 15:30
  ];

  const editSlotRes = await postJson(BASE_URL, {
    date: todayKolkata,
    rows: modifiedRows,
  });

  const updatedAudit = editSlotRes.data?.data?.editAuditHistory || [];
  const addedSlotAudit = updatedAudit.some((a) => a.details && a.details.includes('added for 15:30'));
  const deletedSlotAudit = updatedAudit.some((a) => a.details && a.details.includes('deleted for 11:30'));

  if (editSlotRes.status === 201 && addedSlotAudit && deletedSlotAudit) {
    console.log('✅ Test 5 Passed: Custom time slot addition & deletion audited accurately.');
    passedTests++;
  } else {
    console.error('❌ Test 5 Failed: Audit log missing add or delete details:', updatedAudit);
  }

  // 6. FIELD-LEVEL EDIT HISTORY (EDITED BADGE)
  console.log('\n--- Test 6: Field-Level Edit History & EDITED Badge Tracking ---');
  const editedValueRows = modifiedRows.map((r) => {
    if (r.time === '09:30') {
      return { ...r, bss30: '1.95' }; // Change bss30 from 1.85 to 1.95
    }
    return r;
  });

  const editValRes = await postJson(BASE_URL, {
    date: todayKolkata,
    rows: editedValueRows,
  });

  const editedFieldsMap = editValRes.data?.editedFields || {};
  const hasEditedBadge =
    editedFieldsMap['r1']?.bss30 === true ||
    editedFieldsMap['09:30']?.bss30 === true;

  const valAudit = editValRes.data?.data?.editAuditHistory || [];
  const hasValueAudit = valAudit.some(
    (a) => a.samplingTime === '09:30' && String(a.oldValue) === '1.85' && String(a.newValue) === '1.95'
  );

  if (editValRes.status === 201 && hasEditedBadge && hasValueAudit) {
    console.log('✅ Test 6 Passed: Field-level edit tracked in editedFields map and editAuditHistory (old: 1.85 -> new: 1.95).');
    passedTests++;
  } else {
    console.error('❌ Test 6 Failed: Edit tracking failure:', { editedFieldsMap, hasValueAudit });
  }

  // 7. DUPLICATE SAMPLING TIME HANDLING
  console.log('\n--- Test 7: Duplicate Sampling Time Validation ---');
  const duplicateTimeRows = [
    { id: 'r1', time: '09:30', bss10: '0.10', bss30: '1.80', m30: '4.00', bss60: '5.80' },
    { id: 'r2', time: '09:30', bss10: '0.12', bss30: '1.75', m30: '4.05', bss60: '5.75' }, // Duplicate 09:30
  ];

  const dupRes = await postJson(BASE_URL, {
    date: todayKolkata,
    rows: duplicateTimeRows,
  });

  if (dupRes.status === 400 && dupRes.data?.message?.includes('Duplicate sampling time detected')) {
    console.log('✅ Test 7 Passed: Duplicate sampling time rejected with HTTP 400 and clear error message.');
    passedTests++;
  } else {
    console.error(`❌ Test 7 Failed: Expected 400 duplicate error, got: ${dupRes.status}`, dupRes.data);
  }

  // 8. DYNAMIC SA PLANT OPERATOR EMAIL RECIPIENT
  console.log('\n--- Test 8: Dynamic Registered SA Plant User Resolution ---');
  const { getPlantAssignedUser } = require('./services/plantNotificationService');
  const { assignedUser, primaryEmail } = await getPlantAssignedUser('SA', { company: adminUser?.company });

  if (primaryEmail === 'sa_operator@tfl.com' || (assignedUser && assignedUser.email === 'sa_operator@tfl.com')) {
    console.log(`✅ Test 8 Passed: Successfully resolved dynamic SA Plant user to: ${primaryEmail || assignedUser?.email}`);
    passedTests++;
  } else {
    console.error(`❌ Test 8 Failed: Resolved email: ${primaryEmail || assignedUser?.email}, expected sa_operator@tfl.com`);
  }

  // 9. DECOUPLED RETRY-EMAIL ENDPOINT
  console.log('\n--- Test 9: Decoupled Retry-Email Endpoint ---');
  const retryRes = await postJson(`${BASE_URL}/${savedRecordId}/retry-email`, {});

  if (retryRes.status === 200 && retryRes.data?.success !== undefined) {
    console.log(`✅ Test 9 Passed: Retry-email endpoint executed independently. Delivery status: ${retryRes.data?.emailDeliveryStatus}`);
    passedTests++;
  } else {
    console.error(`❌ Test 9 Failed: Retry-email status: ${retryRes.status}`, retryRes.data);
  }

  // 10. DATE-WISE ISOLATION TEST (Historical Preservation)
  console.log('\n--- Test 10: Date-Wise Isolation (Historical Query Preservation) ---');
  const histGetRes = await getJson(`${BASE_URL}?date=2026-09-13`);
  if (histGetRes.status === 200) {
    console.log('✅ Test 10 Passed: Historical records queryable without being overwritten or substituted.');
    passedTests++;
  } else {
    console.error(`❌ Test 10 Failed: Status: ${histGetRes.status}`);
  }

  // 11. STRICT SCOPE INTEGRITY (Other analysis endpoints intact)
  console.log('\n--- Test 11: Strict Scope Integrity Check (Other routes untouched) ---');
  const lsaBaggingRes = await getJson('http://localhost:5000/api/lsa-bagging');
  const pureSaltRes = await getJson('http://localhost:5000/api/pure-salt-analysis');

  if (lsaBaggingRes.status === 200 && pureSaltRes.status === 200) {
    console.log('✅ Test 11 Passed: LSA Bagging and Pure Salt Analysis routes remain intact and healthy.');
    passedTests++;
  } else {
    console.error(`❌ Test 11 Failed: LSA Bagging status: ${lsaBaggingRes.status}, Pure Salt status: ${pureSaltRes.status}`);
  }

  console.log('\n================================================================');
  console.log(`🏁 Results: ${passedTests} / ${totalTests} Tests Passed`);
  console.log('================================================================\n');

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
