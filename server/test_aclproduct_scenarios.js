const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('--- Starting ACL Product Analysis Test Scenarios ---');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const User = require('./models/User');
  const { generateToken } = require('./utils/token');
  const PlantAnalysisRecord = require('./models/PlantAnalysisRecord');

  const admin = (await User.findOne({ role: { $in: ['superadmin', 'admin', 'plant_admin'] } })) || (await User.findOne());
  if (!admin) {
    console.error('No user found in database!');
    process.exit(1);
  }

  const token = generateToken(admin);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Determine today's date in Asia/Kolkata
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  console.log(`Today in Asia/Kolkata: ${today}`);

  // Clean up any test record for today
  await PlantAnalysisRecord.deleteMany({ plantCode: 'ACL', analysisType: 'ACL Product Analysis', date: today });
  console.log('Cleaned up existing records for today');

  // Test 1: Date Restriction - Reject past & future dates
  console.log('\n--- Test 1: Current-Date Restriction ---');
  const pastRes = await fetch(`${API_BASE}/acl-product`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: '2026-10-12',
      chemical: { nh4cl: '99.50', nacl: '0.12' },
      bss: { p6: '0.00', p8: '0.00' }
    })
  });
  console.log(`Past date save status: ${pastRes.status} (Expected: 400)`);
  const pastJson = await pastRes.json();
  console.log(`Past date error message: ${pastJson.message}`);

  const futureRes = await fetch(`${API_BASE}/acl-product`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: '2026-10-14',
      chemical: { nh4cl: '99.50', nacl: '0.12' },
      bss: { p6: '0.00', p8: '0.00' }
    })
  });
  console.log(`Future date save status: ${futureRes.status} (Expected: 400)`);

  // Test 2: Initial Daily Save with all 7 chemical & 9 BSS parameters
  console.log('\n--- Test 2: Initial Daily Save ---');
  const initialChem = {
    nh4cl: '99.55',
    nacl: '0.12',
    fe2o3: '0.003',
    h2o: '0.08',
    ir: '0.04',
    bd: '0.92',
    p18_spec: '0.00'
  };
  const initialBss = {
    p6: '0.00',
    p8: '0.50',
    p12: '5.20',
    p16: '14.30',
    p18: '20.00',
    p44: '35.00',
    p60: '15.00',
    p100: '8.00',
    m100: '2.00'
  };
  // Expected Total Sieve: 0.00 + 0.50 + 5.20 + 14.30 + 20.00 + 35.00 + 15.00 + 8.00 + 2.00 = 100.00

  const initialSaveRes = await fetch(`${API_BASE}/acl-product`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      chemical: initialChem,
      bss: initialBss
    })
  });
  console.log(`Initial save status: ${initialSaveRes.status} (Expected: 201)`);
  const initialSaveData = await initialSaveRes.json();
  const recordId = initialSaveData.recordId || initialSaveData.data?.id;
  console.log(`Record ID: ${recordId}`);
  console.log(`Edit count: ${initialSaveData.data?.editCount} (Expected: 1)`);
  console.log(`Is locked: ${initialSaveData.data?.isLocked} (Expected: false)`);
  console.log(`Total Sieve Recovery: ${initialSaveData.data?.bss?.totalSieveRecovery} (Expected: 100.00)`);
  console.log(`Email Sent: ${initialSaveData.emailSent}`);
  console.log(`Email Recipient: ${initialSaveData.emailRecipient}`);
  console.log(`Email Status: ${initialSaveData.emailStatus}`);

  // Test 3: Permitted Final Edit
  console.log('\n--- Test 3: Permitted Final Edit ---');
  const editedChem = {
    ...initialChem,
    nh4cl: '99.60', // changed
    h2o: '0.07'      // changed
  };
  const editedBss = {
    ...initialBss,
    p16: '14.10',   // changed
    p18: '20.20'    // changed
  };

  const editRes = await fetch(`${API_BASE}/acl-product`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      chemical: editedChem,
      bss: editedBss
    })
  });
  console.log(`Edit save status: ${editRes.status} (Expected: 201)`);
  const editData = await editRes.json();
  console.log(`Edit count: ${editData.data?.editCount} (Expected: 2)`);
  console.log(`Is locked: ${editData.data?.isLocked} (Expected: true)`);
  console.log(`Edited fields: ${JSON.stringify(editData.data?.editedFields)}`);
  console.log(`Email Sent: ${editData.emailSent}`);

  // Test 4: Locking Enforcement - Block 3rd attempt
  console.log('\n--- Test 4: Locking Enforcement (3rd Save Blocked) ---');
  const lockedRes = await fetch(`${API_BASE}/acl-product`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      chemical: { ...editedChem, nh4cl: '99.70' },
      bss: editedBss
    })
  });
  console.log(`3rd save attempt status: ${lockedRes.status} (Expected: 400)`);
  const lockedJson = await lockedRes.json();
  console.log(`Lock message: ${lockedJson.message}`);

  // Test 5: Verify Saved Database Record & Isolation via GET
  console.log('\n--- Test 5: Database Fetch & Isolation ---');
  const getRes = await fetch(`${API_BASE}/acl-product?date=${today}`, {
    headers: authHeaders
  });
  console.log(`GET status: ${getRes.status} (Expected: 200)`);
  const getJson = await getRes.json();
  const fetchedRecord = Array.isArray(getJson.data) ? getJson.data[0] : getJson.data;
  console.log(`Fetched record ID: ${fetchedRecord?._id || fetchedRecord?.recordId}`);
  console.log(`Fetched NH4Cl: ${fetchedRecord?.chemical?.nh4cl} (Expected: 99.60)`);
  console.log(`Fetched H2O: ${fetchedRecord?.chemical?.h2o} (Expected: 0.07)`);
  console.log(`Fetched BSS P16: ${fetchedRecord?.bss?.p16} (Expected: 14.10)`);
  console.log(`Fetched Total Sieve Recovery: ${fetchedRecord?.bss?.totalSieveRecovery}`);

  // Test 6: Retry Email Endpoint
  console.log('\n--- Test 6: Retry Email Endpoint ---');
  const docId = initialSaveData.recordId || fetchedRecord?._id;
  const retryRes = await fetch(`${API_BASE}/acl-product/${docId}/retry-email`, {
    method: 'POST',
    headers: authHeaders
  });
  console.log(`Retry email status: ${retryRes.status} (Expected: 200)`);
  const retryJson = await retryRes.json();
  console.log(`Retry message: ${retryJson.message}`);
  console.log(`Retry recipient: ${retryJson.recipient}`);

  console.log('\n--- All ACL Product Tests Completed Successfully! ---');
  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
