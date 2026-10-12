const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });

async function run() {
  const d = '2026-10-12';
  console.log('Testing date:', d);

  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  
  // 1. Get an admin token
  const adminUser = await mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users').findOne({ role: 'admin' });
  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, company: adminUser.company }, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
  
  // 2. Admin Saves
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
    const saveRes = await axios.post('http://localhost:5000/api/acl-300-analysis', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Save response:', saveRes.data.success);
  } catch(e) {
    console.log('Save error:', e.message);
  }

  // wait 2 seconds for background email service to do its thing
  await new Promise(r => setTimeout(r, 2000));

  // 3. Check DB
  console.log('\n--- B. DATABASE ---');
  const dbDoc = await mongoose.model('PlantAnalysisRecord', new mongoose.Schema({}, { strict: false }), 'plantanalysisrecords')
    .findOne({ date: d, analysisType: 'ACL 300# Analysis' }).sort({ createdAt: -1 });
  console.log('Data keys in DB:', Object.keys(dbDoc.data));

  // 4. User API Fetch
  console.log('\n--- C. USER API ---');
  try {
    const getRes = await axios.get(`http://localhost:5000/api/acl-300-analysis?date=${d}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('GET response data keys:', getRes.data.data.length > 0 ? Object.keys(getRes.data.data[0]) : 'empty');
    if (getRes.data.data.length > 0) {
      console.log('GET response shifts:', getRes.data.data[0].shifts ? 'present' : 'missing');
    }
  } catch(e) {
    console.log('GET error:', e.message);
  }

  process.exit(0);
}

run();
