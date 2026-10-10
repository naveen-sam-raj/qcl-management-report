const mongoose = require('mongoose');
const { PlantAnalysisRecord } = require('./models');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const d = '2026-10-10';
  const query = { date: d, plantCode: 'ACL', analysisType: 'ACL 300# Analysis' };
  
  await PlantAnalysisRecord.findOneAndUpdate(
    query,
    {
      ...query,
      data: { mockData: 'yes', date: d }
    },
    { upsert: true, new: true }
  );

  console.log('Inserted mock record for ACL 300# Analysis on', d);

  const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
  console.log('Found doc:', doc ? 'yes' : 'no', doc?.data);

  process.exit(0);
}

run();
