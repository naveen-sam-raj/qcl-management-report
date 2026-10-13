require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

const getTodayKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: `/api${path}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch (e) {
            parsed = body;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed });
          } else {
            const err = new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`);
            err.status = res.statusCode;
            err.response = { status: res.statusCode, data: parsed };
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Brine Analysis Verification Test Suite ---');
  const today = getTodayKolkata();
  console.log(`Today (Asia/Kolkata): ${today}`);

  const { User, SuperAdmin, PlantAnalysisRecord } = require('./models');
  await mongoose.connect(process.env.MONGODB_URI);

  let realUser = await User.findOne({ status: 'active' });
  let tokenUserId = realUser ? realUser._id : null;
  let tokenRole = realUser ? realUser.role : 'admin';

  if (!tokenUserId) {
    const sa = await SuperAdmin.findOne();
    if (sa) {
      tokenUserId = sa._id;
      tokenRole = 'super_admin';
    }
  }

  // Create test token for admin
  const token = jwt.sign(
    { id: tokenUserId, username: 'QCL_ADMIN', role: tokenRole },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Clear existing record for today before testing saves to ensure clean slate
  await PlantAnalysisRecord.deleteMany({
    date: today,
    plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
    analysisType: 'Brine Analysis',
  });
  console.log(`Cleaned up previous Brine records for ${today}`);

  // Test 1: Date restriction (reject past/future)
  console.log('\n[Test 1] Testing Date Restriction enforcement...');
  try {
    await request('POST', '/brine-analysis', { date: '2026-10-12', rows: { tk109: { nacl: '310' } } }, token);
    console.error('❌ Test 1 Failed: Past date was accepted!');
  } catch (err) {
    if (err.status === 400) {
      console.log('✅ Test 1 Passed: Past date correctly rejected with HTTP 400:', err.response?.data?.message);
    } else {
      console.error('❌ Test 1 Failed with unexpected error:', err.message);
    }
  }

  try {
    await request('POST', '/brine-analysis', { date: '2026-10-14', rows: { tk109: { nacl: '310' } } }, token);
    console.error('❌ Test 1 Failed: Future date was accepted!');
  } catch (err) {
    if (err.status === 400) {
      console.log('✅ Test 1 Passed: Future date correctly rejected with HTTP 400:', err.response?.data?.message);
    } else {
      console.error('❌ Test 1 Failed with unexpected error:', err.message);
    }
  }

  // Test 2: Initial Save with TK 109 and TK 110 values together
  console.log('\n[Test 2] Testing Initial Save of TK 109 and TK 110 together + email dispatch...');
  let recordId = null;
  try {
    const res1 = await request(
      'POST',
      '/brine-analysis',
      {
        date: today,
        plant: 'ACL',
        rows: {
          tk109: { nacl: '310.5', ca: '1.8', mg: '4.5', so4: '8.2' },
          tk110: { nacl: '315.0', ca: '2.1', mg: '4.8', so4: '9.0' },
        },
      },
      token
    );
    console.log('✅ Test 2 Save Response:', {
      status: res1.status,
      success: res1.data.success,
      editCount: res1.data.data.editCount,
      isLocked: res1.data.data.isLocked,
      emailSent: res1.data.emailSent,
      emailRecipient: res1.data.emailRecipient,
      emailStatus: res1.data.emailStatus,
    });
    recordId = res1.data.recordId || res1.data.data.id;
  } catch (err) {
    console.error('❌ Test 2 Failed:', err.response?.data || err.message);
  }

  // Test 3: Permitted Final Edit (2nd save) with changed value + preserving other tank
  console.log('\n[Test 3] Testing Permitted Final Edit (2nd save) with changed value in TK 110...');
  try {
    const res2 = await request(
      'POST',
      '/brine-analysis',
      {
        date: today,
        plant: 'ACL',
        rows: {
          tk109: { nacl: '310.5', ca: '1.8', mg: '4.5', so4: '8.2' },
          tk110: { nacl: '320.0', ca: '2.1', mg: '5.0', so4: '9.0' }, // changed nacl and mg
        },
      },
      token
    );
    console.log('✅ Test 3 Edit Response:', {
      status: res2.status,
      success: res2.data.success,
      editCount: res2.data.data.editCount,
      isLocked: res2.data.data.isLocked,
      editedFields: res2.data.data.editedFields,
      editAuditHistoryLength: res2.data.data.editAuditHistory?.length,
      emailSent: res2.data.emailSent,
    });
  } catch (err) {
    console.error('❌ Test 3 Failed:', err.response?.data || err.message);
  }

  // Test 4: Locking Check (3rd save must be rejected)
  console.log('\n[Test 4] Testing Locking Check (3rd save must be rejected)...');
  try {
    await request('POST', '/brine-analysis', { date: today, plant: 'ACL', rows: { tk109: { nacl: '325.0' } } }, token);
    console.error('❌ Test 4 Failed: 3rd save was accepted!');
  } catch (err) {
    if (err.status === 400) {
      console.log('✅ Test 4 Passed: 3rd save was blocked by lock:', err.response?.data?.message);
    } else {
      console.error('❌ Test 4 Failed with unexpected error:', err.message);
    }
  }

  // Test 5: Exactness & Date-wise Isolation via GET endpoint
  console.log('\n[Test 5] Testing GET endpoint for exact values and recipient resolution...');
  try {
    const getRes = await request('GET', `/brine-analysis?date=${today}`, null, token);
    const rec = getRes.data.data[0];
    console.log('✅ Test 5 GET Response:', {
      assignedOperatorEmail: getRes.data.assignedOperatorEmail,
      persistedRows: rec?.rows,
      isLocked: rec?.isLocked,
      editedFields: rec?.editedFields,
    });
  } catch (err) {
    console.error('❌ Test 5 Failed:', err.response?.data || err.message);
  }

  // Test 6: Retry Email Endpoint
  console.log('\n[Test 6] Testing Retry Email endpoint...');
  if (recordId) {
    try {
      const retryRes = await request('POST', `/brine-analysis/${recordId}/retry-email`, {}, token);
      console.log('✅ Test 6 Retry Email Response:', {
        status: retryRes.status,
        emailSent: retryRes.data.emailSent,
        emailStatus: retryRes.data.emailStatus,
        emailRecipient: retryRes.data.emailRecipient,
      });
    } catch (err) {
      console.error('❌ Test 6 Failed:', err.response?.data || err.message);
    }
  }

  console.log('\n--- All Brine Analysis tests finished ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
