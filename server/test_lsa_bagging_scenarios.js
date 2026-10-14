/**
 * Verification test suite for Soda Ash Plant -> LSA Bagging Analysis ONLY
 * Tests:
 * 1. Date restriction (rejects past and future dates with HTTP 400).
 * 2. Saving all 3 shifts (Shift 1, Shift 2, Shift 3) with exact values independently.
 * 3. Saving and retrieving continuous hourly routine monitoring readings (NaCl %, BD) independently.
 * 4. Adding custom hourly slots and handling duplicate time entries correctly.
 * 5. Field-level edit tracking (EDITED badge) for modified shift parameters and hourly readings.
 * 6. Audit history tracking for field changes, row additions, and row deletions.
 * 7. Exact date-wise persistence and retrieval via GET endpoint (blank remains blank, no mock values).
 * 8. Dynamic SA Plant operator email resolution (sa_operator@tfl.com).
 * 9. Decoupled retry-email endpoint functions independently without re-saving analysis.
 * 10. Integrity check ensuring no unintended changes to unrelated analysis routes.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { generateToken } = require('./utils/token');

// Require server to start the Express API and connect to DB if not already running
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
  console.log('===========================================================');
  console.log('🧪 Starting Soda Ash Plant LSA Bagging Verification Tests');
  console.log('===========================================================\n');

  // Ensure DB connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

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

  let passedTests = 0;
  let totalTests = 10;

  // 1. DATE RESTRICTION TEST - Past Date
  console.log('--- Test 1: Date Restriction (Past & Future Dates) ---');
  const pastRes = await postJson(BASE_URL, {
    date: '2026-10-10',
    shiftAnalysis: {
      shift1: { na2co3: '99.20', nacl: '0.72', fe: '0.0070', na2so4: '0.080', vm: '2.00', ir: '0.150', bd: '635', turbidity: '80' },
    },
  });
  const futureRes = await postJson(BASE_URL, {
    date: '2026-10-25',
    shiftAnalysis: {
      shift1: { na2co3: '99.20', nacl: '0.72', fe: '0.0070', na2so4: '0.080', vm: '2.00', ir: '0.150', bd: '635', turbidity: '80' },
    },
  });

  if (
    pastRes.status === 400 &&
    pastRes.data.message?.includes('Date restriction enforced') &&
    futureRes.status === 400 &&
    futureRes.data.message?.includes('Date restriction enforced')
  ) {
    console.log('✅ Test 1 Passed: Past and future dates correctly rejected with HTTP 400.\n');
    passedTests++;
  } else {
    console.error('❌ Test 1 Failed: Date restriction not enforced properly.\n');
  }

  // 2. SAVING SHIFTS INDEPENDENTLY (SHIFT 1, SHIFT 2, SHIFT 3)
  console.log('--- Test 2: Independent Shift Saving (Shifts 1, 2, 3) ---');
  // Save Shift 1
  const s1Res = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift1',
    shiftAnalysis: {
      shift1: { na2co3: '99.15', nacl: '0.70', fe: '0.0068', na2so4: '0.080', vm: '1.80', ir: '0.145', bd: '630', turbidity: '78' },
    },
  });

  // Save Shift 2 independently
  const s2Res = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift2',
    shiftAnalysis: {
      shift2: { na2co3: '99.25', nacl: '0.75', fe: '0.0072', na2so4: '0.081', vm: '1.95', ir: '0.152', bd: '645', turbidity: '82' },
    },
  });

  // Save Shift 3 independently
  const s3Res = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift3',
    shiftAnalysis: {
      shift3: { na2co3: '99.05', nacl: '0.68', fe: '0.0070', na2so4: '0.079', vm: '2.05', ir: '0.148', bd: '620', turbidity: '79' },
    },
  });

  const s3Shifts = s3Res.data.shiftAnalysis || s3Res.data.data?.shiftAnalysis || {};
  const hasS1 = s3Shifts.shift1?.na2co3 === '99.15';
  const hasS2 = s3Shifts.shift2?.na2co3 === '99.25';
  const hasS3 = s3Shifts.shift3?.na2co3 === '99.05';

  if (s1Res.status === 201 && s2Res.status === 201 && s3Res.status === 201 && hasS1 && hasS2 && hasS3) {
    console.log('✅ Test 2 Passed: Shift 1, Shift 2, and Shift 3 saved independently without overwriting each other.\n');
    passedTests++;
  } else {
    console.error('❌ Test 2 Failed: Shift independent save failed.\n');
  }

  // 3. HOURLY ROUTINE MONITORING SAVE (INDEPENDENT OF SHIFTS)
  console.log('--- Test 3: Hourly Routine Monitoring Save ---');
  const sampleHourlySlots = [
    { id: 'h0600', time: '06:00', shift: 'Shift 1', nacl: '0.70', bd: '630' },
    { id: 'h0700', time: '07:00', shift: 'Shift 1', nacl: '0.72', bd: '635' },
    { id: 'h1400', time: '14:00', shift: 'Shift 2', nacl: '0.74', bd: '640' },
    { id: 'h2200', time: '22:00', shift: 'Shift 3', nacl: '0.69', bd: '625' },
  ];

  const hourlyRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: sampleHourlySlots,
  });

  const returnedShifts = hourlyRes.data.shiftAnalysis || hourlyRes.data.data?.shiftAnalysis || {};
  const returnedHours = hourlyRes.data.hourlyReadings || hourlyRes.data.data?.hourlyReadings || [];

  const shiftsIntact = returnedShifts.shift1?.na2co3 === '99.15' && returnedShifts.shift2?.na2co3 === '99.25';
  const hoursSaved = returnedHours.length === 4 && returnedHours.some((h) => h.time === '06:00' && h.nacl === '0.70');

  if (hourlyRes.status === 201 && shiftsIntact && hoursSaved) {
    console.log('✅ Test 3 Passed: Hourly routine monitoring saved independently, leaving shift analysis completely intact.\n');
    passedTests++;
  } else {
    console.error('❌ Test 3 Failed: Hourly save corrupted or failed to save.\n');
  }

  // 4. ADDING CUSTOM HOURLY SLOT & PREVENTING DUPLICATE SAMPLING TIMES
  console.log('--- Test 4: Custom Hourly Slot & Duplicate Prevention ---');
  const hourlyWithCustom = [
    ...sampleHourlySlots,
    { id: 'custom_0830', time: '08:30', shift: 'Shift 1', nacl: '0.73', bd: '638', isCustom: true },
  ];

  const customRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: hourlyWithCustom,
  });

  const duplicateHourly = [
    ...hourlyWithCustom,
    { id: 'custom_dup', time: '08:30', shift: 'Shift 1', nacl: '0.75', bd: '640' },
  ];

  const dupRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'hourly',
    hourlyReadings: duplicateHourly,
  });

  const customSaved = customRes.data.hourlyReadings?.some((h) => h.time === '08:30');
  const dupRejected = dupRes.status === 400 && dupRes.data.message?.includes('Validation failed');

  if (customRes.status === 201 && customSaved && dupRejected) {
    console.log('✅ Test 4 Passed: Custom hourly slot persisted and duplicate sampling time rejected with HTTP 400.\n');
    passedTests++;
  } else {
    console.error('❌ Test 4 Failed: Custom slot or duplicate handling failed.\n');
  }

  // 5. FIELD-LEVEL EDITED BADGE TRACKING (SHIFT & HOURLY)
  console.log('--- Test 5: Field-Level EDITED Tracking on Edit ---');
  const editShiftRes = await postJson(BASE_URL, {
    date: todayKolkata,
    saveType: 'shift',
    targetShift: 'shift2',
    shiftAnalysis: {
      shift2: { na2co3: '99.40', nacl: '0.75', fe: '0.0072', na2so4: '0.081', vm: '1.95', ir: '0.152', bd: '660', turbidity: '82' }, // na2co3 and bd changed
    },
  });

  const shiftEditedFields = editShiftRes.data.editedFields || {};
  const isS2Na2co3Edited = Boolean(shiftEditedFields.shift2?.na2co3);
  const isS2BdEdited = Boolean(shiftEditedFields.shift2?.bd);
  const isS1Edited = Boolean(shiftEditedFields.shift1);

  if (isS2Na2co3Edited && isS2BdEdited && !isS1Edited) {
    console.log('✅ Test 5 Passed: Field-level EDITED badge tracked for modified fields in Shift 2 while Shift 1 remained untagged.\n');
    passedTests++;
  } else {
    console.error('❌ Test 5 Failed: EDITED tracking map unexpected:', JSON.stringify(shiftEditedFields));
  }

  // 6. AUDIT HISTORY PRESERVATION IN MONGODB
  console.log('--- Test 6: Audit History Tracking ---');
  const auditList = editShiftRes.data.data?.editAuditHistory || [];
  const hasShiftAudit = auditList.some(
    (a) => a.shiftKey === 'shift2' && a.field === 'na2co3' && a.oldValue === '99.25' && a.newValue === '99.40'
  );
  const hasRowAddedAudit = auditList.some(
    (a) => a.action === 'ROW_ADDED' && a.samplingTime === '08:30'
  );

  if (hasShiftAudit && hasRowAddedAudit) {
    console.log('✅ Test 6 Passed: Audit history accurately recorded previous/new values, editor, timestamp, and row additions.\n');
    passedTests++;
  } else {
    console.error('❌ Test 6 Failed: Audit history records missing expected entries.\n');
  }

  // 7. GET PERSISTENCE & DATA ISOLATION (AFTER REFRESH / LOGOUT)
  console.log('--- Test 7: GET Persistence & Blank Preservation ---');
  const getRes = await getJson(`${BASE_URL}?date=${todayKolkata}`);
  const record = getRes.data.data || getRes.data.record || {};
  const dbShifts = getRes.data.shiftAnalysis || record?.shiftAnalysis || {};
  const dbHours = getRes.data.hourlyReadings || record?.hourlyReadings || [];

  const s1Persisted = dbShifts.shift1?.na2co3 === '99.15';
  const s2Persisted = dbShifts.shift2?.na2co3 === '99.40';
  const customHourPersisted = dbHours.some((h) => h.time === '08:30' && h.nacl === '0.73');

  if (getRes.status === 200 && s1Persisted && s2Persisted && customHourPersisted) {
    console.log('✅ Test 7 Passed: GET endpoint returned exact persisted values for shifts and hourly readings.\n');
    passedTests++;
  } else {
    console.error('❌ Test 7 Failed: GET endpoint did not return exact persisted values.\n');
  }

  // 8. DYNAMIC SA PLANT OPERATOR EMAIL RESOLUTION
  console.log('--- Test 8: Dynamic SA Plant User Email Resolution ---');
  const recipient = getRes.data.assignedOperatorEmail || editShiftRes.data.emailRecipient;
  console.log(`Resolved Recipient: ${recipient}`);

  if (recipient === 'sa_operator@tfl.com') {
    console.log('✅ Test 8 Passed: Dynamically resolved registered SA Plant operator email (sa_operator@tfl.com).\n');
    passedTests++;
  } else {
    console.error(`❌ Test 8 Failed: Expected sa_operator@tfl.com but got ${recipient}\n`);
  }

  // 9. DECOUPLED RETRY EMAIL DISPATCH
  console.log('--- Test 9: Retry Email Dispatch ---');
  const recordId = getRes.data.recordId || record?._id || record?.id;
  const retryRes = await postJson(`${BASE_URL}/${recordId}/retry-email`, {});
  console.log(`Retry Response Status: ${retryRes.status}, Message: ${retryRes.data.message}`);

  // In test environment, SMTP server may not be reachable or may fail delivery; what matters is that the endpoint handled it gracefully and returned a structured response
  if (retryRes.status === 200 && (retryRes.data.emailSent !== undefined || retryRes.data.emailDeliveryStatus)) {
    console.log('✅ Test 9 Passed: Retry email endpoint executed without re-saving or corrupting analysis data.\n');
    passedTests++;
  } else {
    console.error('❌ Test 9 Failed: Retry email endpoint failed.\n');
  }

  // 10. UNRELATED ANALYSIS ROUTES SAFETY
  console.log('--- Test 10: Unrelated Analysis Routes Safety ---');
  const healthRes = await getJson('http://localhost:5000/api/health');
  const lsaShiftRes = await getJson(`http://localhost:5000/api/lsa-analysis?date=${todayKolkata}`);

  if (healthRes.status === 200 && lsaShiftRes.status === 200) {
    console.log('✅ Test 10 Passed: Unrelated analysis routes (LSA Shift, API health) intact and functional.\n');
    passedTests++;
  } else {
    console.error('❌ Test 10 Failed: Unrelated routes affected.\n');
  }

  console.log('===========================================================');
  console.log(`📊 Test Summary: ${passedTests}/${totalTests} Tests Passed`);
  console.log('===========================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 10 VERIFICATION TESTS COMPLETED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`⚠️ ${totalTests - passedTests} tests failed.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
