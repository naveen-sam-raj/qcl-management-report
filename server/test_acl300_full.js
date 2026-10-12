const mongoose = require('mongoose');
const { PlantAnalysisRecord } = require('./models');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const query = { date: '2026-10-10', plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'ACL 300# Analysis' };
  const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
  console.log('ACL 300 doc:', JSON.stringify(doc, null, 2));

  process.exit(0);
}

run();
