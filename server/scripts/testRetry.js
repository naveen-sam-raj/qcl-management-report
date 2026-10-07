const mongoose = require('mongoose');
require('dotenv').config();
const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');
const { PlantAnalysisRecord } = require('../models');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const record = await PlantAnalysisRecord.findOne({}).sort({ createdAt: -1 });
  console.log('Testing retry for record:', record._id, record.plantName, record.analysisType);

  const retryResult = await executeSaveAndEmailWorkflow({
    plantIdentifier: record.plant,
    analysisType: record.analysisType,
    unit: record.unit,
    shift: record.shift,
    date: record.date,
    data: record.data,
    submittedBy: record.submittedBy,
    submittedById: record.submittedById,
    company: record.company,
    explicitRecord: record,
  });

  console.log('Retry Result:', {
    success: retryResult.success,
    emailSent: retryResult.emailSent,
    emailStatus: retryResult.emailStatus,
    message: retryResult.message,
    excelFileName: retryResult.excel?.fileName,
    excelBytes: retryResult.excel?.sizeBytes,
  });

  process.exit(0);
})();
