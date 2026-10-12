const mongoose = require('mongoose');
const { PlantAnalysisRecord } = require('./models');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const d = '2026-10-20'; // test date

  console.log('\n--- A. ADMIN SAVE ---');
  // From brineAnalysisRoutes.js:
  // const { shifts = {} } = payload;
  const payload = {
    date: d,
    plant: 'ACL',
    analysisType: 'Brine Analysis',
    shifts: {
      shift1: { p18: '1', p44: '2', nacl: '3' },
      shift2: { p18: '4', p44: '5', nacl: '6' },
      shift3: { p18: '7', p44: '8', nacl: '9' },
    }
  };

  const record = {
    id: `brine_${Date.now()}`,
    date: payload.date,
    plant: payload.plant || 'ACL',
    analysisType: payload.analysisType || 'Brine Analysis',
    shifts: {
      shift1: payload.shifts.shift1,
      shift2: payload.shifts.shift2,
      shift3: payload.shifts.shift3,
    },
  };

  let savedDoc = null;
  if (PlantAnalysisRecord) {
    savedDoc = await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: record.plant || 'Unknown',
        analysisType: record.analysisType || 'Unknown',
        date: record.date,
      },
      {
        plantName: record.plant || 'Plant',
        plantCode: record.plant || 'Unknown',
        analysisType: record.analysisType || 'Unknown',
        date: record.date,
        data: record, // <--- Here it saves `record` object
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log('Simulated save operation. savedDoc._id:', savedDoc ? savedDoc._id : 'null');
  
  // Also simulate plantNotificationService intercept since it happens on 'finish'
  const { executeSaveAndEmailWorkflow } = require('./services/plantNotificationService');
  await executeSaveAndEmailWorkflow({
      plantIdentifier: 'ACL',
      analysisType: 'Brine Analysis',
      unit: '',
      shift: 'All Shifts',
      date: d,
      data: payload.shifts, // middleware sends just the shifts!
      submittedBy: 'Test Admin',
      rawBody: { date: d },
  });

  console.log('\n--- B. DATABASE ---');
  // Check what is actually in the DB
  const dbDoc = await PlantAnalysisRecord.findById(savedDoc._id).lean();
  console.log('MongoDB Document (data field):', JSON.stringify(dbDoc.data, null, 2));

  console.log('\n--- C. USER API ---');
  // From brineAnalysisRoutes.js GET handler:
  const query = { date: d, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Brine Analysis' };
  const getDoc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
  
  let apiResponse = null;
  if (getDoc && getDoc.data) {
    apiResponse = {
      success: true,
      data: [getDoc.data]
    };
  } else {
    apiResponse = { success: true, data: [] };
  }
  console.log('User API Response:', JSON.stringify(apiResponse, null, 2));

  console.log('\n--- D. USER UI ---');
  // From BrineAnalysisPage.jsx fetchExistingData:
  let frontendShiftsData = null;
  if (apiResponse.success && apiResponse.data && apiResponse.data.length > 0) {
    const rec = apiResponse.data[0];
    if (rec && rec.shifts) {
      frontendShiftsData = rec.shifts;
      console.log('Frontend extracted shifts:', frontendShiftsData);
    } else {
      console.log('Frontend extracted shifts: FAILED (rec.shifts is undefined)');
      console.log('rec was:', rec);
    }
  }

  process.exit(0);
}

run();
