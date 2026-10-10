require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const mongoose = require('mongoose');
const { PlantAnalysisRecord, User } = require('./models');

async function checkQuery() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ email: 'samrajnaveen58@gmail.com' }).populate('company');
    console.log('User company:', typeof user.company, user.company._id);
    
    // Query passing the whole object
    const query1 = { analysisType: 'CBD Analysis', company: user.company };
    const doc1 = await PlantAnalysisRecord.findOne(query1);
    console.log('Found with user.company:', !!doc1);

    // Query passing the ObjectId
    const query2 = { analysisType: 'CBD Analysis', company: user.company._id };
    const doc2 = await PlantAnalysisRecord.findOne(query2);
    console.log('Found with user.company._id:', !!doc2);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkQuery();
