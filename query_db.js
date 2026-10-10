const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const PlantAnalysisRecord = require('./server/models/PlantAnalysisRecord');
  const docs = await PlantAnalysisRecord.find({ analysisType: 'Brine Analysis' }).lean();
  console.log(JSON.stringify(docs.map(d => d.data), null, 2));
  process.exit(0);
}
run();
