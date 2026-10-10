const jwt = require('jsonwebtoken');
const https = require('https');
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const user = await User.findOne({ role: 'admin' }).lean();
  if (!user) return console.log('no admin found');
  
  const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret_key_here', { expiresIn: '1h' });

  const options = {
    hostname: 'qcl-management-report.onrender.com',
    port: 443,
    path: '/api/acl-300-analysis?date=2026-10-10',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Response from Render:', data);
      process.exit(0);
    });
  });
  req.on('error', e => { console.error(e); process.exit(1); });
  req.end();
}
run();
