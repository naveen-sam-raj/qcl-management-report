const mongoose = require('mongoose');
const { PlantAnalysisRecord } = require('./models');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // First, simulate what the route does (which is what usually happens during POST)
  const d = '2026-10-15';
  
  const record = {
      id: `acl_300_${Date.now()}`,
      date: d,
      plant: 'ACL',
      analysisType: 'ACL 300# Analysis',
      shifts: {
        shift1: { p18: '9', p44: '99', nacl: '999' },
        shift2: { p18: '', p44: '', nacl: '' },
        shift3: { p18: '', p44: '', nacl: '' },
      },
  };

  await PlantAnalysisRecord.findOneAndUpdate(
      {
        plantCode: 'ACL',
        analysisType: 'ACL 300# Analysis',
        date: d,
      },
      {
        plantName: 'ACL Plant',
        plantCode: 'ACL',
        analysisType: 'ACL 300# Analysis',
        date: d,
        data: record,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  console.log('Simulated POST route saving');

  // Now simulate plantNotificationService
  const { executeSaveAndEmailWorkflow } = require('./services/plantNotificationService');
  
  await executeSaveAndEmailWorkflow({
      plantIdentifier: 'ACL',
      analysisType: 'ACL 300# Analysis',
      unit: '',
      shift: 'All Shifts',
      date: d,
      data: {
          // This simulates rawBody.shifts
          shift1: { p18: '9', p44: '99', nacl: '999' },
          shift2: { p18: '', p44: '', nacl: '' },
          shift3: { p18: '', p44: '', nacl: '' },
      },
      submittedBy: 'Test Admin',
      rawBody: { date: d },
  });
  
  console.log('Simulated background workflow');

  // Fetch the record back
  const doc = await PlantAnalysisRecord.findOne({ date: d, analysisType: 'ACL 300# Analysis' }).sort({ createdAt: -1 }).lean();
  console.log('Fetched Data:', JSON.stringify(doc.data, null, 2));

  process.exit(0);
}

run();
