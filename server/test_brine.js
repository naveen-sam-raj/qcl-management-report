const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '.env' });

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
  const d = '2026-10-10';
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const adminUser = await mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users').findOne();
  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, company: adminUser.company }, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
  
  const payload = {
    date: d,
    plant: 'ACL',
    analysisType: 'Brine Analysis',
    rows: {
      tk109: { nacl: 10, ca: 20 },
      tk110: { nacl: 30, ca: 40 }
    }
  };
  const saveOpts = {
    hostname: 'localhost', port: 5000, path: '/api/brine-analysis', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  };
  const saveRes = await request(saveOpts, payload);
  console.log('Save response:', saveRes.success);

  const getOpts = {
    hostname: 'localhost', port: 5000, path: `/api/brine-analysis?date=${d}`, method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  };
  const getRes = await request(getOpts);
  console.log('Get response length:', getRes.data?.length);
  console.log('Get response data:', JSON.stringify(getRes.data, null, 2));

  process.exit(0);
}
run();
