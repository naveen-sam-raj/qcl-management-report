const jwt = require('jsonwebtoken');
const https = require('https');
require('dotenv').config({ path: './.env' });

const token = jwt.sign({ _id: '6ac5c56e63bdcae0f72ebc13', role: 'admin' }, process.env.JWT_SECRET || 'your_jwt_secret_key_here', { expiresIn: '1h' });

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
  res.on('end', () => console.log('Response:', data));
});
req.on('error', e => console.error(e));
req.end();
