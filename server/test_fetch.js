const mongoose = require('mongoose');
const { PlantAnalysisRecord, PureSaltAnalysis } = require('./models');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const query = { date: '2026-10-10', plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'ACL 300# Analysis' };
  const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
  console.log('ACL 300 doc:', doc ? 'found' : 'not found');

  const psQuery = { date: '2026-10-10', plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Analysis' };
  const psDoc = await PureSaltAnalysis.findOne(psQuery).sort({ createdAt: -1 }).lean();
  console.log('Pure Salt doc:', psDoc ? 'found' : 'not found');

  process.exit(0);
}

run();
