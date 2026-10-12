require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const http = require('http');
const { generateToken } = require('./utils/token');

async function testFullApiFlow() {
  try {
    // Admin Token (admin@gmail.com)
    const adminToken = generateToken({
      _id: '6ac5c56e63bdcae0f72ebc13',
      id: '6ac5c56e63bdcae0f72ebc13',
      role: 'company_admin',
      username: 'admin@gmail.com'
    });

    // User Token (hnaveensamraj@gmail.com)
    const userToken = generateToken({
      _id: '6ac5c61063bdcae0f72ebd4c',
      id: '6ac5c61063bdcae0f72ebd4c',
      role: 'user',
      username: 'hnaveensamraj@gmail.com'
    });

    const postPayload = {
      date: '2026-10-11',
      plant: 'OFFSET',
      unit: 'FLY ash',
      analysisType: 'Fly Ash Analysis',
      readings: {
        0: { ph: '12.5' }
      }
    };

    console.log('1. Admin saving data via POST...');
    const postOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/fly-ash-analysis',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      }
    };

    const reqPost = http.request(postOptions, (resPost) => {
      let data = '';
      resPost.on('data', chunk => { data += chunk; });
      resPost.on('end', () => {
        console.log('POST Status:', resPost.statusCode);
        console.log('POST Response:', JSON.stringify(JSON.parse(data), null, 2));

        console.log('\n2. User fetching data via GET...');
        const getOptions = {
          hostname: 'localhost',
          port: 5000,
          path: '/api/fly-ash-analysis?date=2026-10-11',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + userToken
          }
        };

        const reqGet = http.request(getOptions, (resGet) => {
          let getData = '';
          resGet.on('data', chunk => { getData += chunk; });
          resGet.on('end', () => {
            console.log('GET Status:', resGet.statusCode);
            console.log('GET Response:', JSON.stringify(JSON.parse(getData), null, 2));
            process.exit(0);
          });
        });

        reqGet.on('error', error => {
          console.error('GET Request Error:', error);
          process.exit(1);
        });

        reqGet.end();
      });
    });

    reqPost.on('error', error => {
      console.error('POST Request Error:', error);
      process.exit(1);
    });

    reqPost.write(JSON.stringify(postPayload));
    reqPost.end();

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testFullApiFlow();
