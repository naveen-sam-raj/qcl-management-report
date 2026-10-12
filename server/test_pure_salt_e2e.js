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

async function testPureSaltE2E() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const PureSaltAnalysis = mongoose.model('PureSaltAnalysis', new mongoose.Schema({}, { strict: false }), 'puresaltanalyses');
  
  let admin = await User.findOne({ role: 'super_admin' });
  if (!admin) {
    admin = await User.findOne({});
  }

  const token = jwt.sign(
    { _id: admin._id, id: admin._id, username: admin.username, role: admin.role, company: admin.company },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '1d' }
  );

  const testDate = '2026-10-25';
  console.log(`\n======================================================`);
  console.log(`TEST 1: Saving Shift 1 on Date: ${testDate}`);
  console.log(`======================================================`);

  // Clean previous test data if any
  await PureSaltAnalysis.deleteMany({ date: testDate });

  const payloadShift1 = {
    date: testDate,
    plant: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    shift: 'All Shifts (I, II, III)',
    rows: {
      rawSalt: { nacl: 98.5, ca: 0.12, mg: 0.05, so4: 0.3, ir: 0.2, h2o: 3.5 },
      shift1: { nacl: 99.2, ca: 0.09, mg: 0.04, so4: 0.2, ir: 0.1, h2o: 0.5 },
      shift2: { nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null },
      shift3: { nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null },
      composition: { nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null },
    }
  };

  const startTime1 = Date.now();
  const res1 = await postJson('/api/pure-salt-analysis', payloadShift1, token);
  const duration1 = Date.now() - startTime1;

  console.log(`[Shift 1 API Response Status]: ${res1.status}`);
  console.log(`[Shift 1 API Duration]: ${duration1}ms`);
  console.log(`[Shift 1 Response Data]:`, {
    success: res1.data.success,
    message: res1.data.message,
    newlySavedShifts: res1.data.newlySavedShifts,
    recordId: res1.data.data?._id,
    lockedShifts: res1.data.data?.lockedShifts
  });

  // Verify MongoDB persistence for Shift 1
  const doc1 = await PureSaltAnalysis.findOne({ date: testDate });
  console.log(`[MongoDB Verification 1]:`);
  console.log(`Found doc: ${!!doc1}`);
  console.log(`Shift 1 ca: ${doc1?.rows?.shift1?.ca}, mg: ${doc1?.rows?.shift1?.mg}`);
  console.log(`LockedShifts:`, doc1?.lockedShifts);

  console.log(`\n======================================================`);
  console.log(`TEST 2: Saving Shift 2 on Date: ${testDate}`);
  console.log(`======================================================`);

  const payloadShift2 = {
    date: testDate,
    plant: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    shift: 'All Shifts (I, II, III)',
    rows: {
      rawSalt: { nacl: 98.5, ca: 0.12, mg: 0.05, so4: 0.3, ir: 0.2, h2o: 3.5 },
      shift1: { nacl: 99.2, ca: 0.09, mg: 0.04, so4: 0.2, ir: 0.1, h2o: 0.5 },
      shift2: { nacl: 99.1, ca: 0.10, mg: 0.03, so4: 0.25, ir: 0.15, h2o: 0.6 },
      shift3: { nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null },
      composition: { nacl: null, ca: null, mg: null, so4: null, ir: null, h2o: null },
    }
  };

  const startTime2 = Date.now();
  const res2 = await postJson('/api/pure-salt-analysis', payloadShift2, token);
  const duration2 = Date.now() - startTime2;

  console.log(`[Shift 2 API Response Status]: ${res2.status}`);
  console.log(`[Shift 2 API Duration]: ${duration2}ms`);
  console.log(`[Shift 2 Response Data]:`, {
    success: res2.data.success,
    message: res2.data.message,
    newlySavedShifts: res2.data.newlySavedShifts,
    recordId: res2.data.data?._id,
    lockedShifts: res2.data.data?.lockedShifts
  });

  const doc2 = await PureSaltAnalysis.findOne({ date: testDate });
  console.log(`[MongoDB Verification 2]:`);
  console.log(`Found doc: ${!!doc2}`);
  console.log(`Shift 2 ca: ${doc2?.rows?.shift2?.ca}, mg: ${doc2?.rows?.shift2?.mg}`);
  console.log(`LockedShifts:`, doc2?.lockedShifts);

  // Clean up test record
  await PureSaltAnalysis.deleteMany({ date: testDate });
  console.log(`\n✅ All Pure Salt Analysis Save tests PASSED.`);
  process.exit(0);
}

testPureSaltE2E().catch(err => {
  console.error('Test Failed:', err.response?.data || err.message);
  process.exit(1);
});
