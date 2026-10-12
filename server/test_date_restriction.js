const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });

function postJson(urlPath, payload, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getTodayKolkata() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

async function testDateRestriction() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const PureSaltAnalysis = mongoose.model('PureSaltAnalysis', new mongoose.Schema({}, { strict: false }), 'puresaltanalyses');
  
  let admin = await User.findOne({ role: 'super_admin' }) || await User.findOne({});
  const token = jwt.sign(
    { _id: admin._id, id: admin._id, username: admin.username, role: admin.role, company: admin.company },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '1d' }
  );

  const today = getTodayKolkata();
  const yesterday = '2026-10-11';
  const tomorrow = '2026-10-13';

  console.log(`\n======================================================`);
  console.log(`CURRENT ASIA/KOLKATA TODAY DATE: ${today}`);
  console.log(`======================================================`);

  // TEST 1: Rejecting Yesterday's date
  console.log(`\n--- Test 1: Submitting Past Date (${yesterday}) ---`);
  const resPast = await postJson('/api/pure-salt-analysis', {
    date: yesterday,
    plant: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    rows: {
      shift1: { nacl: 99.2, ca: 0.09, mg: 0.04, so4: 0.2, ir: 0.1, h2o: 0.5 }
    }
  }, token);

  console.log(`Status: ${resPast.status}`);
  console.log(`Response message: ${resPast.data?.message}`);
  if (resPast.status === 400 && resPast.data?.message?.includes('Date restriction enforced')) {
    console.log('✅ PASS: Backend successfully rejected past date.');
  } else {
    throw new Error('FAILED to reject past date!');
  }

  // TEST 2: Rejecting Tomorrow's date
  console.log(`\n--- Test 2: Submitting Future Date (${tomorrow}) ---`);
  const resFuture = await postJson('/api/pure-salt-analysis', {
    date: tomorrow,
    plant: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    rows: {
      shift1: { nacl: 99.2, ca: 0.09, mg: 0.04, so4: 0.2, ir: 0.1, h2o: 0.5 }
    }
  }, token);

  console.log(`Status: ${resFuture.status}`);
  console.log(`Response message: ${resFuture.data?.message}`);
  if (resFuture.status === 400 && resFuture.data?.message?.includes('Date restriction enforced')) {
    console.log('✅ PASS: Backend successfully rejected future date.');
  } else {
    throw new Error('FAILED to reject future date!');
  }

  // TEST 3: Accepting Today's date
  console.log(`\n--- Test 3: Submitting Today's Date (${today}) ---`);
  await PureSaltAnalysis.deleteMany({ date: today, plant: 'ACL Plant' });

  const resToday = await postJson('/api/pure-salt-analysis', {
    date: today,
    plant: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    rows: {
      shift1: { nacl: 99.2, ca: 0.09, mg: 0.04, so4: 0.2, ir: 0.1, h2o: 0.5 }
    }
  }, token);

  console.log(`Status: ${resToday.status}`);
  console.log(`Success: ${resToday.data?.success}`);
  if (resToday.status === 201 && resToday.data?.success) {
    console.log("✅ PASS: Backend successfully accepted today's date.");
  } else {
    throw new Error("FAILED to accept today's date!");
  }

  // Clean up today's test record
  await PureSaltAnalysis.deleteMany({ date: today, plant: 'ACL Plant' });
  console.log(`\n🎉 ALL DATE RESTRICTION TESTS PASSED!`);
  process.exit(0);
}

testDateRestriction().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
