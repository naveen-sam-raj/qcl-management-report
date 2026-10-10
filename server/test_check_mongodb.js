const mongoose = require('mongoose');
const { PlantAnalysisRecord, User } = require('./models');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  
  // Find recent ACL 300# Analysis records
  const docs = await PlantAnalysisRecord.find({ analysisType: 'ACL 300# Analysis' }).sort({ createdAt: -1 }).limit(3).lean();
  
  console.log('Recent MongoDB Records for ACL 300# Analysis:');
  docs.forEach((doc, i) => {
    console.log(`\n--- Record ${i + 1} ---`);
    console.log('ID:', doc._id);
    console.log('Date:', doc.date);
    console.log('Company:', doc.company);
    console.log('PlantCode:', doc.plantCode);
    console.log('Data Structure Keys:', doc.data ? Object.keys(doc.data) : 'No data field');
    if (doc.data) {
      if (doc.data.shifts) console.log('Has shifts inside data? YES');
      else console.log('Has shifts inside data? NO');
    }
  });

  process.exit(0);
}
run();
