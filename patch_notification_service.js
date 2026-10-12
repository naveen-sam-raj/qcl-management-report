const fs = require('fs');
const p = 'server/services/plantNotificationService.js';
let content = fs.readFileSync(p, 'utf8');

const oldBlock = `  // 3. Save to MongoDB Atlas (if not already saved explicitly)
  let savedRecord = explicitRecord;
  if (!savedRecord) {
    const targetDate = date || rawBody.date || new Date().toISOString().split('T')[0];
    const targetShift = shift || rawBody.shift || 'All Shifts';
    const targetUnit = unit || rawBody.unit || '';
    const payloadData =
      data ||
      rawBody.shifts ||
      rawBody.rows ||
      rawBody.readings ||
      rawBody.units ||
      rawBody.data ||
      rawBody;

    try {
      savedRecord = await PlantAnalysisRecord.create({
        plant: plantDoc._id,
        plantName,
        plantCode,
        analysisType: analysisType || \`\${plantName} Analysis\`,
        unit: targetUnit,
        date: targetDate,
        shift: targetShift,
        data: payloadData,
        submittedBy,
        submittedById,
        company: company || plantDoc.company || null,
        emailRecipient: primaryEmail || '',
        emailStatus: 'pending',
        savedAt: new Date(),
      });
      console.log(\`[SaveAndEmail] ✅ Saved to MongoDB Atlas (Collection: "plantanalysisrecords", ID: \${savedRecord._id})\`);
    } catch (saveErr) {
      console.error(\`[SaveAndEmail] ❌ Database save failed: \${saveErr.message}\`);
      return {
        success: false,
        emailSent: false,
        emailStatus: 'failed',
        message: 'Unable to save the data. Please try again.',
        error: saveErr.message,
      };
    }
  }`;

const newBlock = `  // 3. Save to MongoDB Atlas (if not already saved explicitly)
  let savedRecord = explicitRecord;
  const targetDate = date || rawBody.date || new Date().toISOString().split('T')[0];
  const targetShift = shift || rawBody.shift || 'All Shifts';
  const targetUnit = unit || rawBody.unit || '';
  const resolvedAnalysisType = analysisType || \`\${plantName} Analysis\`;

  if (!savedRecord) {
    try {
      // First, try to find the record that was just saved by the route handler
      const existingRecord = await PlantAnalysisRecord.findOne({
        plantCode: { $in: [plantCode, plantCode + ' Plant', plantCode + ' PLANT'] },
        analysisType: resolvedAnalysisType,
        date: targetDate
      }).sort({ createdAt: -1 });

      if (existingRecord) {
        savedRecord = existingRecord;
        console.log(\`[SaveAndEmail] 🔍 Found existing record in MongoDB (ID: \${savedRecord._id})\`);
      } else {
        const payloadData =
          data ||
          rawBody.shifts ||
          rawBody.rows ||
          rawBody.readings ||
          rawBody.units ||
          rawBody.data ||
          rawBody;

        savedRecord = await PlantAnalysisRecord.create({
          plant: plantDoc._id,
          plantName,
          plantCode,
          analysisType: resolvedAnalysisType,
          unit: targetUnit,
          date: targetDate,
          shift: targetShift,
          data: payloadData,
          submittedBy,
          submittedById,
          company: company || plantDoc.company || null,
          emailRecipient: primaryEmail || '',
          emailStatus: 'pending',
          savedAt: new Date(),
        });
        console.log(\`[SaveAndEmail] ✅ Saved to MongoDB Atlas (Collection: "plantanalysisrecords", ID: \${savedRecord._id})\`);
      }
    } catch (saveErr) {
      console.error(\`[SaveAndEmail] ❌ Database save/fetch failed: \${saveErr.message}\`);
      return {
        success: false,
        emailSent: false,
        emailStatus: 'failed',
        message: 'Unable to save the data. Please try again.',
        error: saveErr.message,
      };
    }
  }`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(p, content, 'utf8');
console.log('Patched plantNotificationService.js');
