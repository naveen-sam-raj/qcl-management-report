require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const mongoose = require('mongoose');
const { PlantAnalysisRecord } = require('/home/naveen/Downloads/qcl-management-report-main/server/models');

async function checkDb() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Fetching latest 5 PlantAnalysisRecords...');
    const records = await PlantAnalysisRecord.find().sort({ createdAt: -1 }).limit(5).lean();
    
    records.forEach((r, i) => {
      console.log(`\n--- Record ${i+1} ---`);
      console.log('Date:', r.date);
      console.log('AnalysisType:', r.analysisType);
      console.log('Company:', r.company);
      console.log('PlantCode:', r.plantCode || r.plantName);
      console.log('Data keys:', Object.keys(r.data || {}));
      if (r.data && r.data.shifts) {
        console.log('Shifts keys:', Object.keys(r.data.shifts));
      }
      if (r.data && r.data.readings) {
        console.log('Readings length:', r.data.readings.length);
      }
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkDb();
