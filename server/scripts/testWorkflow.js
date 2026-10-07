const mongoose = require('mongoose');
require('dotenv').config();
const { getPlantAssignedUser, formatISTDateTime, executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log('\n--- 1. Testing getPlantAssignedUser for all 4 plants ---');
  for (const pName of ['ACL Plant', 'SA Plant', 'OFFSITE Plant', 'CO2 Plant', 'NonExistent Plant']) {
    const res = await getPlantAssignedUser(pName);
    console.log(`Plant "${pName}":`, {
      found: !!res.plant,
      plantName: res.plant?.name,
      primaryEmail: res.primaryEmail,
      recipientEmails: res.recipientEmails,
      error: res.error,
    });
  }

  console.log('\n--- 2. Testing formatISTDateTime ---');
  const d = new Date('2026-10-06T11:54:32.000Z');
  const ist = formatISTDateTime(d);
  console.log('IST formatted:', ist);

  console.log('\n--- 3. Testing executeSaveAndEmailWorkflow for ACL Pure Salt Analysis ---');
  const workflowRes = await executeSaveAndEmailWorkflow({
    plantIdentifier: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    unit: '',
    shift: 'All Shifts (I, II, III)',
    date: '2026-10-06',
    data: {
      rawSalt: { nacl: 98.5, ca: 0.12, mg: 0.05, so4: 0.3, ir: 0.2, h2o: 3.5 },
      shift1: { nacl: 99.2, ca: 0.09, mg: 0.04, so4: 0.2, ir: 0.1, h2o: 0.5 },
    },
    submittedBy: 'Test Runner',
  });

  console.log('Workflow Result:');
  console.log({
    success: workflowRes.success,
    emailSent: workflowRes.emailSent,
    emailStatus: workflowRes.emailStatus,
    message: workflowRes.message,
    recordId: workflowRes.data?._id,
    recordPlant: workflowRes.data?.plantName,
    recordSavedAt: workflowRes.data?.savedAt,
    recordCreatedAt: workflowRes.data?.createdAt,
    excelFileName: workflowRes.excel?.fileName,
    excelBytes: workflowRes.excel?.sizeBytes,
    emailError: workflowRes.emailError,
  });

  process.exit(0);
})();
