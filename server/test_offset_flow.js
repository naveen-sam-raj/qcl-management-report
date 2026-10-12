require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const mongoose = require('mongoose');
const User = require('/home/naveen/Downloads/qcl-management-report-main/server/models/User');
const PlantAnalysisRecord = require('/home/naveen/Downloads/qcl-management-report-main/server/models/PlantAnalysisRecord');
const Company = require('/home/naveen/Downloads/qcl-management-report-main/server/models/Company');

async function testOffsetFlow() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const admin = await User.findOne({ email: 'admin@gmail.com' }).populate('company');
  const user = await User.findOne({ email: 'hnaveensamraj@gmail.com' }).populate('company');

  console.log("Admin Company:", admin.company.name);
  console.log("User Company:", user.company.name);

  const testDate = '2026-10-10';
  
  // Simulated Admin Save Payload
  const recordToSave = {
      plantName: 'OFFSET',
      plantCode: 'OFFSET',
      analysisType: 'CBD Analysis',
      unit: 'CBD',
      date: testDate,
      data: {
         shifts: {
            iShift: { ph: '11.0' }
         }
      },
      submittedBy: admin.name,
      submittedById: admin._id,
      company: admin.company._id
  };

  // 1. Admin saves record
  await PlantAnalysisRecord.findOneAndUpdate(
      {
          plantCode: recordToSave.plantCode,
          analysisType: recordToSave.analysisType,
          date: recordToSave.date,
          company: admin.company._id, // This matches what the POST route does: req.user.company
      },
      recordToSave,
      { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  console.log("Admin saved record successfully.");

  // 2. Inspect database
  const savedRecord = await PlantAnalysisRecord.findOne({ date: testDate, analysisType: 'CBD Analysis' }).lean();
  console.log("Saved Record in DB:", JSON.stringify(savedRecord, null, 2));

  // 3. User fetches record (simulating GET route)
  const query = { date: testDate, analysisType: 'CBD Analysis' };
  if (user && user.company) {
    query.company = user.company; // This is what the GET route does
  }
  
  const fetchedRecord = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
  console.log("User Fetched Record:", fetchedRecord ? "FOUND" : "NOT FOUND");

  process.exit(0);
}

testOffsetFlow().catch(console.error);
