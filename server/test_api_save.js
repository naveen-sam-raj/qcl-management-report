const http = require('http');
const { generateToken } = require('./utils/token');

async function testApi() {
  try {
    const mockUser = {
      _id: '60d0fe4f5311236168a109ca',
      username: 'normal_operator',
      role: 'operator',
      company: 'test',
      plant: 'ACL Plant'
    };
    
    const token = generateToken(mockUser);

    const payload = {
      date: '2026-10-09',
      plant: 'ACL Plant',
      analysisType: 'Pure Salt Analysis',
      shift: 'All Shifts (I, II, III)',
      rows: {
        shift1: { ca: 0.10, mg: 0.04 },
        composition: { nacl: 92.00, ca: 0.10, mg: 0.04, so4: 0.46, ir: 0.30, h2o: 7.00 }
      }
    };

    console.log('Sending request...');
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/pure-salt-analysis',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
      });
    });

    req.on('error', error => {
      console.error('Request Error:', error);
    });

    req.write(JSON.stringify(payload));
    req.end();

  } catch (err) {
    console.error('Error:', err);
  }
}

testApi();
