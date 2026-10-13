const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('--- Starting SA Plant TK 414 TSC Tank Analysis Test Scenarios ---');
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
  await PlantAnalysisRecord.deleteMany({ plantCode: 'SA', analysisType: { $in: ['TK 414 TSC TANK Analysis', 'TK 414 TSC Tank Analysis', 'TK 414 Analysis'] }, date: today });
  console.log('Cleaned up existing TK 414 records for today');

  // Test 1: Date Restriction - Reject past & future dates
  console.log('\n--- Test 1: Current-Date Restriction ---');
  const pastRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: '2026-10-12',
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '1.40', cnh3: '4.10', tcl: '5.46', pcl: '1.36' }
      }
    })
  });
  console.log(`Past date save status: ${pastRes.status} (Expected: 400)`);
  const pastJson = await pastRes.json();
  console.log(`Past date error message: ${pastJson.message}`);

  const futureRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: '2026-10-14',
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '1.40', cnh3: '4.10', tcl: '5.46', pcl: '1.36' }
      }
    })
  });
  console.log(`Future date save status: ${futureRes.status} (Expected: 400)`);

  // Test 2: Sequential Shift Locking - Cannot save II SHIFT before I SHIFT
  console.log('\n--- Test 2: Sequential Shift Locking (Cannot save II before I) ---');
  const s2EarlyRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's2',
      shift: 'II SHIFT',
      shifts: {
        s2: { fnh3: '1.40', cnh3: '4.10', tcl: '5.46', pcl: '1.36' }
      }
    })
  });
  console.log(`Save II SHIFT before I SHIFT status: ${s2EarlyRes.status} (Expected: 400)`);
  const s2EarlyJson = await s2EarlyRes.json();
  console.log(`Error message: ${s2EarlyJson.message}`);

  // Test 3: Save I SHIFT successfully
  console.log('\n--- Test 3: Save I SHIFT ---');
  const s1Res = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '1.40', cnh3: '4.10', tcl: '5.46', pcl: '1.36' }
      }
    })
  });
  console.log(`Save I SHIFT status: ${s1Res.status} (Expected: 201)`);
  const s1Json = await s1Res.json();
  console.log(`Save I SHIFT response: ${s1Json.message}, emailStatus: ${s1Json.emailStatus}, recipient: ${s1Json.emailRecipient}`);

  // Test 4: Verify I SHIFT remains editable before II SHIFT is saved
  console.log('\n--- Test 4: Edit I SHIFT before II SHIFT is saved ---');
  const s1EditRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '1.42', cnh3: '4.12', tcl: '5.48', pcl: '1.38' }
      }
    })
  });
  console.log(`Edit I SHIFT status: ${s1EditRes.status} (Expected: 201)`);
  const s1EditJson = await s1EditRes.json();
  console.log(`Edit I SHIFT editedFields:`, s1EditJson.data?.editedFields);

  // Test 5: Save II SHIFT successfully
  console.log('\n--- Test 5: Save II SHIFT ---');
  const s2Res = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's2',
      shift: 'II SHIFT',
      shifts: {
        s1: { fnh3: '1.42', cnh3: '4.12', tcl: '5.48', pcl: '1.38' },
        s2: { fnh3: '1.45', cnh3: '4.15', tcl: '5.50', pcl: '1.40' }
      }
    })
  });
  console.log(`Save II SHIFT status: ${s2Res.status} (Expected: 201)`);
  const s2Json = await s2Res.json();
  console.log(`Save II SHIFT response: ${s2Json.message}, emailStatus: ${s2Json.emailStatus}`);

  // Test 6: Verify I SHIFT is now permanently LOCKED
  console.log('\n--- Test 6: Try Editing I SHIFT after II SHIFT saved (Should be locked) ---');
  const s1LockedRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's1',
      shift: 'I SHIFT',
      shifts: {
        s1: { fnh3: '1.35', cnh3: '4.05', tcl: '5.40', pcl: '1.30' },
        s2: { fnh3: '1.45', cnh3: '4.15', tcl: '5.50', pcl: '1.40' }
      }
    })
  });
  console.log(`Try Editing Locked I SHIFT status: ${s1LockedRes.status} (Expected: 400)`);
  const s1LockedJson = await s1LockedRes.json();
  console.log(`Error message: ${s1LockedJson.message}`);

  // Test 7: Save III SHIFT initially
  console.log('\n--- Test 7: Save III SHIFT (Initial Save) ---');
  const s3Res = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's3',
      shift: 'III SHIFT',
      shifts: {
        s1: { fnh3: '1.42', cnh3: '4.12', tcl: '5.48', pcl: '1.38' },
        s2: { fnh3: '1.45', cnh3: '4.15', tcl: '5.50', pcl: '1.40' },
        s3: { fnh3: '1.38', cnh3: '4.08', tcl: '5.42', pcl: '1.32' }
      }
    })
  });
  console.log(`Save III SHIFT initial status: ${s3Res.status} (Expected: 201)`);
  const s3Json = await s3Res.json();
  console.log(`Save III SHIFT message: ${s3Json.message}, emailStatus: ${s3Json.emailStatus}`);

  // Test 8: Verify II SHIFT is now locked
  console.log('\n--- Test 8: Try Editing II SHIFT after III SHIFT saved (Should be locked) ---');
  const s2LockedRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's2',
      shift: 'II SHIFT',
      shifts: {
        s1: { fnh3: '1.42', cnh3: '4.12', tcl: '5.48', pcl: '1.38' },
        s2: { fnh3: '1.40', cnh3: '4.10', tcl: '5.45', pcl: '1.35' },
        s3: { fnh3: '1.38', cnh3: '4.08', tcl: '5.42', pcl: '1.32' }
      }
    })
  });
  console.log(`Try Editing Locked II SHIFT status: ${s2LockedRes.status} (Expected: 400)`);
  const s2LockedJson = await s2LockedRes.json();
  console.log(`Error message: ${s2LockedJson.message}`);

  // Test 9: Perform exactly 1 allowed final edit on III SHIFT
  console.log('\n--- Test 9: Final Edit on III SHIFT (Allowed) ---');
  const s3FinalRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's3',
      shift: 'III SHIFT',
      shifts: {
        s1: { fnh3: '1.42', cnh3: '4.12', tcl: '5.48', pcl: '1.38' },
        s2: { fnh3: '1.45', cnh3: '4.15', tcl: '5.50', pcl: '1.40' },
        s3: { fnh3: '1.39', cnh3: '4.09', tcl: '5.43', pcl: '1.33' }
      }
    })
  });
  console.log(`Final Edit on III SHIFT status: ${s3FinalRes.status} (Expected: 201)`);
  const s3FinalJson = await s3FinalRes.json();
  console.log(`Final edit message: ${s3FinalJson.message}, emailStatus: ${s3FinalJson.emailStatus}`);
  console.log(`Final edit s3Edits count: ${s3FinalJson.data?.lockedShifts?.s3Edits}`);

  // Test 10: Try Editing III SHIFT again (Should exceed max edit limit)
  console.log('\n--- Test 10: Try Editing III SHIFT second time (Should be permanently locked) ---');
  const s3ExceedRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      date: today,
      shiftKey: 's3',
      shift: 'III SHIFT',
      shifts: {
        s1: { fnh3: '1.42', cnh3: '4.12', tcl: '5.48', pcl: '1.38' },
        s2: { fnh3: '1.45', cnh3: '4.15', tcl: '5.50', pcl: '1.40' },
        s3: { fnh3: '1.41', cnh3: '4.11', tcl: '5.45', pcl: '1.35' }
      }
    })
  });
  console.log(`Try Editing beyond final limit status: ${s3ExceedRes.status} (Expected: 400)`);
  const s3ExceedJson = await s3ExceedRes.json();
  console.log(`Error message: ${s3ExceedJson.message}`);

  // Test 11: GET endpoint verification & persistence
  console.log('\n--- Test 11: GET /api/sa-tk-414-tsc-analysis?date=... ---');
  const getRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis?date=${today}`, {
    method: 'GET',
    headers: authHeaders
  });
  console.log(`GET status: ${getRes.status} (Expected: 200)`);
  const getJson = await getRes.json();
  console.log(`GET recordId: ${getJson.recordId}`);
  console.log(`Assigned operator email: ${getJson.assignedOperatorEmail}`);
  console.log(`Locked shifts in DB:`, getJson.lockedShifts);
  console.log(`Edited fields in DB:`, getJson.editedFields);
  console.log(`Persisted shifts:`, getJson.data?.shifts);

  // Test 12: Retry Email endpoint verification
  console.log('\n--- Test 12: POST /api/sa-tk-414-tsc-analysis/:id/retry-email ---');
  const retryRes = await fetch(`${API_BASE}/sa-tk-414-tsc-analysis/${getJson.recordId}/retry-email`, {
    method: 'POST',
    headers: authHeaders
  });
  console.log(`Retry Email status: ${retryRes.status}`);
  const retryJson = await retryRes.json();
  console.log(`Retry Email result: emailSent: ${retryJson.emailSent}, emailStatus: ${retryJson.emailStatus}, recipient: ${retryJson.emailRecipient}`);

  await mongoose.disconnect();
  console.log('\n--- All SA Plant TK 414 TSC Tank Analysis test scenarios completed! ---');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
