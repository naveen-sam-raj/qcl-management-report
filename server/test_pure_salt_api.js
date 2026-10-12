const axios = require('axios');

async function testSave() {
  try {
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
    const res = await axios.post('http://localhost:5000/api/pure-salt-analysis', payload, {
      headers: { 'Authorization': 'Bearer ' + process.env.TOKEN } // Wait, I don't have a token.
    });
    console.log('Success:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('Error Status:', err.response.status);
      console.error('Error Data:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
  }
}

testSave();
