require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const http = require('http');
const { generateToken } = require('./utils/token');

async function testBottomAshFlow() {
  try {
    // Admin Token
    const adminToken = generateToken({
      _id: '6ac5c56e63bdcae0f72ebc13',
      id: '6ac5c56e63bdcae0f72ebc13',
      role: 'company_admin',
      username: 'admin@gmail.com'
    });

    // User Token (Offset User: rvabishek31@gmail.com)
    const userToken = generateToken({
      _id: '6ac5c61063bdcae0f72ebd4d', // Use any ID, auth.js ignores it if in token, wait auth.js uses it to find user!
      id: '6ac5c61063bdcae0f72ebd4d',  // Assuming this is rvabishek31's ID. Let's just use hnaveensamraj's ID.
      role: 'user',
      username: 'hnaveensamraj@gmail.com' // I know this user is in the DB and has the company!
    });
    // Wait, let's use the API with real user IDs from MongoDB!

    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./models/User');
    const adminUser = await User.findOne({ email: 'admin@gmail.com' });
    const normalUser = await User.findOne({ email: 'rvabishek31@gmail.com' });

    const tokenAdmin = generateToken(adminUser);
    const tokenUser = generateToken(normalUser);

    const postPayload = {
      date: '2026-10-12',
      plant: 'OFFSET',
      unit: 'Bottom ash',
      analysisType: 'Bottom Ash Analysis',
      readings: [
        { id: '1', time: '07:00', combustible: '10', gcv: '20', moisture: '30' }
      ]
    };

    console.log('1. Admin POSTing...');
    const postOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/bottom-ash-analysis',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tokenAdmin
      }
    };

    const reqPost = http.request(postOptions, (resPost) => {
      let data = '';
      resPost.on('data', chunk => { data += chunk; });
      resPost.on('end', () => {
        console.log('POST Response:', data);

        console.log('\n2. User GETting...');
        const getOptions = {
          hostname: 'localhost',
          port: 5000,
          path: '/api/bottom-ash-analysis?date=2026-10-12',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + tokenUser
          }
        };

        const reqGet = http.request(getOptions, (resGet) => {
          let getData = '';
          resGet.on('data', chunk => { getData += chunk; });
          resGet.on('end', () => {
            console.log('GET Response:', getData);
            process.exit(0);
          });
        });
        reqGet.end();
      });
    });

    reqPost.write(JSON.stringify(postPayload));
    reqPost.end();

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testBottomAshFlow();
