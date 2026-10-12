require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const http = require('http');
const { generateToken } = require('./utils/token');

async function testApi() {
  try {
    const mockUser = {
      _id: '6ac5c61063bdcae0f72ebd4c',
      id: '6ac5c61063bdcae0f72ebd4c',
      role: 'user',
      username: 'hnaveensamraj@gmail.com'
    };
    
    const token = generateToken(mockUser);

    console.log('Sending GET request...');
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cbd-analysis?date=2026-10-10&company=TFL&plantCode=OFFSET',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        process.exit(0);
      });
    });

    req.on('error', error => {
      console.error('Request Error:', error);
      process.exit(1);
    });

    req.end();

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testApi();
