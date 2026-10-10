const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });

function request(options, payload = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

async function run() {
  const d = '2026-10-12';
  console.log('Testing date:', d);

  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const adminUser = await mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users').findOne();
  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, company: adminUser.company }, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
  
  console.log('\n--- A. ADMIN SAVE ---');
  try {
    const payload = {
      date: d,
      plant: 'ACL',
      analysisType: 'ACL 300# Analysis',
      shifts: {
        shift1: { p18: '10', p44: '20', nacl: '30' },
        shift2: { p18: '40', p44: '50', nacl: '60' },
        shift3: { p18: '70', p44: '80', nacl: '90' },
      }
    };
    const opts = {
      hostname: 'localhost', port: 5000, path: '/api/acl-300-analysis', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    };
    const saveRes = await request(opts, payload);
    console.log('Save response success:', saveRes.success);
  } catch(e) { console.log('Save error:', e.message); }

  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- B. DATABASE ---');
  const dbDoc = await mongoose.model('PlantAnalysisRecord', new mongoose.Schema({}, { strict: false }), 'plantanalysisrecords')
    .findOne({ date: d, analysisType: 'ACL 300# Analysis' }).sort({ createdAt: -1 });
  console.log('Data keys in DB:', Object.keys(dbDoc.data));

  console.log('\n--- C. USER API ---');
  try {
    const opts = {
      hostname: 'localhost', port: 5000, path: `/api/acl-300-analysis?date=${d}`, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    };
    const getRes = await request(opts);
    if (!getRes.data || getRes.data.length === 0) {
       console.log('GET returned empty data array!');
    } else {
       console.log('GET response data keys:', Object.keys(getRes.data[0]));
       console.log('GET response shifts:', getRes.data[0].shifts ? 'present' : 'missing');
    }
  } catch(e) { console.log('GET error:', e.message); }

  process.exit(0);
}

run();
