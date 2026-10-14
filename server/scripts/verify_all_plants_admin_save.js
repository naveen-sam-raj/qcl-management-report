const mongoose = require('mongoose');
const dotenv = require('dotenv');
const xlsx = require('xlsx');
dotenv.config();

const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
const User = require('../models/User');
const Plant = require('../models/Plant');
const PlantAnalysisRecord = require('../models/PlantAnalysisRecord');

async function runTest() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB successfully.');

  const admin = await User.findOne({ role: { $in: ['admin', 'super_admin'] } });
  if (!admin) {
    console.error('No admin found.');
    process.exit(1);
  }
  console.log(`Using Admin: ${admin.username} (${admin.email}), Role: ${admin.role}`);

  const testCases = [
    {
      plantCode: 'ACL',
      analysisType: 'Raw Salt Analysis',
      unit: 'Raw Salt',
      payload: {
        date: '2026-10-14',
        shift: 'Day',
        sourceOfSalt: 'Tuticorin Salt Pan',
        moisture: 3.42,
        nacl: 98.15,
        ca: 0.12,
        mg: 0.08,
        so4: 0.25,
        remarks: 'Live Admin Save ACL Verification'
      }
    },
    {
      plantCode: 'SA',
      analysisType: 'SA TK 401 Analysis',
      unit: 'TK 401',
      payload: {
        date: '2026-10-14',
        shift: 'I',
        time: '09:00',
        strength: 98.45,
        temp: 34.20,
        remarks: 'Live Admin Save SA Verification'
      }
    },
    {
      plantCode: 'OFFSITE',
      analysisType: 'CBD Analysis',
      unit: 'CBD',
      payload: {
        date: '2026-10-14',
        shift: 'I',
        time: '10:00',
        flowRate: 15.65,
        temp: 42.10,
        remarks: 'Live Admin Save OFFSET/OFFSITE Verification'
      }
    },
    {
      plantCode: 'CO2',
      analysisType: 'P1256 Analysis',
      unit: 'P1256',
      payload: {
        date: '2026-10-14',
        shift: 'I',
        time: '11:00',
        purity: 99.88,
        pressure: 6.75,
        remarks: 'Live Admin Save CO2 Verification'
      }
    }
  ];

  for (const tc of testCases) {
    console.log(`\n========================================`);
    console.log(`Testing Plant: ${tc.plantCode} - ${tc.analysisType}`);
    console.log(`========================================`);

    const plant = await Plant.findOne({ code: tc.plantCode });
    if (!plant) {
      console.error(`Plant not found for code: ${tc.plantCode}`);
      continue;
    }

    const startTime = Date.now();
    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: tc.plantCode,
      analysisType: tc.analysisType,
      unit: tc.unit,
      shift: tc.payload.shift,
      date: tc.payload.date,
      data: tc.payload,
      submittedBy: admin.name || admin.username,
      submittedById: admin._id,
      company: admin.company,
      rawBody: tc.payload,
      saveEventId: 'test_save_' + Date.now()
    });
    const durationMs = Date.now() - startTime;

    console.log(`Execution completed in ${durationMs}ms`);
    console.log(`Save Success: ${result.success}`);
    console.log(`Email Sent: ${result.emailSent}`);
    console.log(`Email Status: ${result.emailStatus}`);
    console.log(`User-Facing Message: "${result.message}"`);
    console.log(`Recipients Dispatched: ${result.recipient}`);
    console.log(`MessageId: ${result.messageId}`);

    if (result.error) {
      console.error(`Error encountered:`, result.error);
    }

    // 1. Verify in MongoDB
    const persisted = await PlantAnalysisRecord.findById(result.recordId);
    console.log(`MongoDB Persistence Verified: ${persisted ? 'YES (ID: ' + persisted._id + ')' : 'NO'}`);
    if (persisted) {
      console.log(`Persisted Data Match:`, JSON.stringify(persisted.data));
    }

    // 2. Verify Excel generation output if available or test generation directly
    if (result.attachmentBuffer) {
      const workbook = xlsx.read(result.attachmentBuffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const csv = xlsx.utils.sheet_to_csv(sheet);
      console.log(`Generated Excel Sheet (${workbook.SheetNames[0]}) Sample CSV:\n${csv.split('\n').slice(0, 10).join('\n')}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nAll plant tests completed.');
}

runTest().catch(err => {
  console.error('Fatal error in runTest:', err);
  process.exit(1);
});
