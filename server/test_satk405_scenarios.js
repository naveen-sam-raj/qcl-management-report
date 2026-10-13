const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('--- Starting SA Plant TK 405 Analysis Test Scenarios ---');
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
  await PlantAnalysisRecord.deleteMany({ plantCode: 'SA', analysisType: 'TK 405 Analysis', date: today });
  console.log('Cleaned up existing TK 405 records for today');

  // Test 1: Date Restriction - Reject past & future dates
  console.log('\n--- Test 1: Current-Date Restriction ---');
  const pastRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: '2026-10-12',
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '3.86', cnh3: '1.89', tcl: '5.39', pcl: '3.50', tcao: '0.12' }
      }
    })
  });
  console.log(`Past date save status: ${pastRes.status} (Expected: 400)`);
  const pastJson = await pastRes.json();
  console.log(`Past date error message: ${pastJson.message}`);

  const futureRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: '2026-10-14',
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '3.86', cnh3: '1.89', tcl: '5.39', pcl: '3.50', tcao: '0.12' }
      }
    })
  });
  console.log(`Future date save status: ${futureRes.status} (Expected: 400)`);

  // Test 2: Sequential Shift Locking - Cannot save II SHIFT before I SHIFT
  console.log('\n--- Test 2: Sequential Shift Locking (Cannot save II before I) ---');
  const s2EarlyRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's2',
      shift: 'II SHIFT',
      shifts: {
        s2: { fnh3: '3.86', cnh3: '1.89', tcl: '5.39', pcl: '3.50', tcao: '0.12' }
      }
    })
  });
  console.log(`Save II SHIFT before I SHIFT status: ${s2EarlyRes.status} (Expected: 400)`);
  const s2EarlyJson = await s2EarlyRes.json();
  console.log(`Error message: ${s2EarlyJson.message}`);

  // Test 3: Save I SHIFT successfully
  console.log('\n--- Test 3: Save I SHIFT ---');
  const s1Res = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '3.85', cnh3: '1.88', tcl: '5.38', pcl: '3.48', tcao: '0.10' }
      }
    })
  });
  console.log(`Save I SHIFT status: ${s1Res.status} (Expected: 201)`);
  const s1Json = await s1Res.json();
  console.log(`Save I SHIFT success: ${s1Json.success}, emailSent: ${s1Json.emailSent}, recipient: ${s1Json.emailRecipient}`);
  console.log(`Locked shifts state:`, s1Json.data?.lockedShifts);

  // Test 4: Edit I SHIFT before II SHIFT is saved (permitted)
  console.log('\n--- Test 4: Edit I SHIFT before II SHIFT saved ---');
  const s1EditRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '3.90', cnh3: '1.88', tcl: '5.38', pcl: '3.48', tcao: '0.10' }
      }
    })
  });
  console.log(`Edit I SHIFT status: ${s1EditRes.status} (Expected: 201)`);
  const s1EditJson = await s1EditRes.json();
  console.log(`Edited fields state:`, s1EditJson.data?.editedFields);

  // Test 5: Save II SHIFT (must lock I SHIFT permanently)
  console.log('\n--- Test 5: Save II SHIFT ---');
  const s2Res = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's2',
      shift: 'II SHIFT',
      shifts: {
        s2: { fnh3: '3.88', cnh3: '1.92', tcl: '5.42', pcl: '3.52', tcao: '0.15' }
      }
    })
  });
  console.log(`Save II SHIFT status: ${s2Res.status} (Expected: 201)`);
  const s2Json = await s2Res.json();
  console.log(`Locked shifts state after II SHIFT:`, s2Json.data?.lockedShifts);

  // Test 6: Attempting to edit I SHIFT after II SHIFT is saved must be rejected (400)
  console.log('\n--- Test 6: Attempt edit I SHIFT after II SHIFT saved (Must be rejected) ---');
  const s1LockedRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '3.95', cnh3: '1.88', tcl: '5.38', pcl: '3.48', tcao: '0.10' }
      }
    })
  });
  console.log(`Edit locked I SHIFT status: ${s1LockedRes.status} (Expected: 400)`);
  const s1LockedJson = await s1LockedRes.json();
  console.log(`Message: ${s1LockedJson.message}`);

  // Test 7: Save III SHIFT (initial save)
  console.log('\n--- Test 7: Save III SHIFT (Initial Save) ---');
  const s3Res = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's3',
      shift: 'III SHIFT',
      shifts: {
        s3: { fnh3: '3.80', cnh3: '1.85', tcl: '5.35', pcl: '3.45', tcao: '0.08' }
      }
    })
  });
  console.log(`Save III SHIFT status: ${s3Res.status} (Expected: 201)`);
  const s3Json = await s3Res.json();
  console.log(`Locked shifts after III initial save:`, s3Json.data?.lockedShifts);

  // Test 8: Exactly 1 final edit allowed for III SHIFT
  console.log('\n--- Test 8: Exactly 1 Final Edit for III SHIFT ---');
  const s3FinalEditRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's3',
      shift: 'III SHIFT',
      shifts: {
        s3: { fnh3: '3.82', cnh3: '1.85', tcl: '5.35', pcl: '3.45', tcao: '0.08' }
      }
    })
  });
  console.log(`Final edit III SHIFT status: ${s3FinalEditRes.status} (Expected: 201)`);
  const s3FinalEditJson = await s3FinalEditRes.json();
  console.log(`Locked shifts after III final edit (all locked):`, s3FinalEditJson.data?.lockedShifts);

  // Test 9: 2nd edit of III SHIFT must be rejected (400)
  console.log('\n--- Test 9: 2nd Edit of III SHIFT (Must be rejected) ---');
  const s3ExcessRes = await fetch(`${API_BASE}/sa-tk-405-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's3',
      shift: 'III SHIFT',
      shifts: {
        s3: { fnh3: '3.89', cnh3: '1.85', tcl: '5.35', pcl: '3.45', tcao: '0.08' }
      }
    })
  });
  console.log(`2nd edit III SHIFT status: ${s3ExcessRes.status} (Expected: 400)`);
  const s3ExcessJson = await s3ExcessRes.json();
  console.log(`Message: ${s3ExcessJson.message}`);

  // Test 10: GET endpoint returns exact persisted record & locks
  console.log('\n--- Test 10: GET Enriched Record ---');
  const getRes = await fetch(`${API_BASE}/sa-tk-405-analysis?date=${today}`, {
    headers: authHeaders
  });
  console.log(`GET status: ${getRes.status} (Expected: 200)`);
  const getJson = await getRes.json();
  console.log(`Assigned operator email:`, getJson.assignedOperatorEmail);
  console.log(`Locked shifts in response:`, getJson.lockedShifts);
  console.log(`Edited fields in response:`, getJson.editedFields);
  console.log(`Persisted shifts data:`, JSON.stringify(getJson.data?.shifts));

  // Test 11: Retry Email
  console.log('\n--- Test 11: Retry Email ---');
  const recordId = getJson.data?._id;
  const retryRes = await fetch(`${API_BASE}/sa-tk-405-analysis/${recordId}/retry-email`, {
    method: 'POST',
    headers: authHeaders
  });
  console.log(`Retry Email status: ${retryRes.status} (Expected: 200)`);
  const retryJson = await retryRes.json();
  console.log(`Retry email response:`, retryJson);

  console.log('\n--- ALL SA TK 405 SCENARIOS COMPLETED SUCCESSFULLY ---');
  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
