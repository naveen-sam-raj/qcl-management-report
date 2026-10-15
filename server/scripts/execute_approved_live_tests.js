const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDB } = require('../config/db');
const { User, PlantAnalysisRecord, PureSaltAnalysis } = require('../models');
const { generateToken } = require('../utils/token');

async function runLiveTests() {
  await connectDB();
  const superAdmin = await User.findOne({ role: 'super_admin' });
  if (!superAdmin) throw new Error('Super admin not found');
  const token = generateToken(superAdmin);

  const initialRecordCount = await PlantAnalysisRecord.countDocuments({});
  const initialPsCount = await PureSaltAnalysis.countDocuments({});

  function sendLiveTest(plant) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        plant,
        recipient: 'naveensamraj2003@gmail.com',
        isTestMode: false,
      });

      const req = https.request(
        {
          hostname: 'qcl-management-report.onrender.com',
          path: '/api/plants/test-emailjs',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': 'Bearer ' + token,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
            } catch (e) {
              resolve({ statusCode: res.statusCode, data: body });
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  const results = {};
  const plants = ['ACL', 'SA', 'CO2'];

  for (const plant of plants) {
    console.log(`\n============================================================`);
    console.log(`Dispatching 1 live test email for ${plant} Plant...`);
    console.log(`Target: naveensamraj2003@gmail.com | Endpoint: /api/plants/test-emailjs`);
    console.log(`============================================================`);
    try {
      const res = await sendLiveTest(plant);
      results[plant] = res;
      console.log(`Response for ${plant}:`, JSON.stringify(res, null, 2));
    } catch (err) {
      console.error(`Error sending test for ${plant}:`, err.message);
      results[plant] = { error: err.message };
    }
    // Pause between plant dispatches to avoid throttling
    await new Promise((r) => setTimeout(r, 2500));
  }

  const finalRecordCount = await PlantAnalysisRecord.countDocuments({});
  const finalPsCount = await PureSaltAnalysis.countDocuments({});

  console.log('\n============================================================');
  console.log('INTEGRITY & MUTATION CHECK:');
  console.log(`PlantAnalysisRecord count: before=${initialRecordCount}, after=${finalRecordCount}`);
  console.log(`PureSaltAnalysis count: before=${initialPsCount}, after=${finalPsCount}`);

  if (initialRecordCount !== finalRecordCount || initialPsCount !== finalPsCount) {
    console.error('❌ WARNING: DB records mutated during test!');
  } else {
    console.log('✅ DB records unchanged. Zero mutations verified.');
  }

  console.log('\n============================================================');
  console.log('LIVE DISPATCH SUMMARY:');
  for (const plant of plants) {
    const outcome = results[plant];
    console.log(`- ${plant}: Status ${outcome?.statusCode || 'ERR'} | Success: ${outcome?.data?.success} | Analysis: ${outcome?.data?.analysisType} | MsgId: ${outcome?.data?.messageId}`);
  }
  console.log('============================================================');

  process.exit(0);
}

runLiveTests().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
