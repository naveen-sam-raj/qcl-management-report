const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { PlantAnalysisRecord } = require('../models');
const { getPlantAssignedUser } = require('../services/plantNotificationService');
const { sendEmailJSOffsiteNotification, getEmailJSConfig } = require('../services/emailjsService');

async function runLiveEmailJSTest() {
  console.log('================================================================');
  console.log('LIVE EMAILJS OFFSITE NOTIFICATION TEST');
  console.log('================================================================');

  await connectDB();

  // 1. Resolve registered OFFSITE recipient
  const { assignedUser, primaryEmail, recipientEmails } = await getPlantAssignedUser('OFFSITE');
  console.log('Resolved Operator:', assignedUser?.name);
  console.log('Primary Recipient:', primaryEmail);
  console.log('All Recipients:', recipientEmails);

  if (!primaryEmail) {
    throw new Error('No registered OFFSITE user found in spic_analytics_db.');
  }

  // 2. Fetch latest saved DM Water analysis document from MongoDB
  const dmDoc = await PlantAnalysisRecord.findOne({
    analysisType: { $in: ['Analysis For DM Water / Anion unit', 'DM Water Analysis'] },
    plantCode: { $in: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] },
  }).sort({ createdAt: -1 });

  if (!dmDoc) {
    throw new Error('No DM Water record found in MongoDB.');
  }

  console.log(`Using MongoDB Record ID: ${dmDoc._id} (Date: ${dmDoc.date})`);

  // 3. Check EmailJS Config
  const config = getEmailJSConfig();
  console.log('EmailJS Configured:', config.isConfigured);
  if (!config.isConfigured) {
    console.log('\n⚠️ EMAILJS CREDENTIALS NOT CONFIGURED IN server/.env:');
    console.log('Please set:');
    console.log('EMAILJS_SERVICE_ID=your_service_id');
    console.log('EMAILJS_TEMPLATE_ID=your_template_id');
    console.log('EMAILJS_PUBLIC_KEY=your_public_key');
    console.log('EMAILJS_PRIVATE_KEY=your_private_key (optional but recommended for backend)\n');
  }

  // 4. Build Readable HTML Observation Table matching saved MongoDB record
  const readings = dmDoc.data?.readings || [];
  const formatVal = (v) => (v !== null && v !== undefined && v !== '' && v !== '–' && v !== '-' ? String(v) : '—');

  const htmlTable = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;">
      <thead>
        <tr style="background-color: #0369a1; color: #ffffff;">
          <th style="padding: 8px 10px; text-align: left; border: 1px solid #bae6fd;">Unit / Stream</th>
          <th style="padding: 8px 10px; text-align: center; border: 1px solid #bae6fd;">Time</th>
          <th style="padding: 8px 10px; text-align: center; border: 1px solid #bae6fd;">pH</th>
          <th style="padding: 8px 10px; text-align: center; border: 1px solid #bae6fd;">Cond (µS/cm)</th>
          <th style="padding: 8px 10px; text-align: center; border: 1px solid #bae6fd;">Alk (ppm)</th>
          <th style="padding: 8px 10px; text-align: center; border: 1px solid #bae6fd;">SiO2 (ppm)</th>
        </tr>
      </thead>
      <tbody>
        ${readings.map((r, idx) => `
          <tr style="background-color: ${idx % 2 === 1 ? '#f0f9ff' : '#ffffff'};">
            <td style="padding: 8px 10px; border: 1px solid #e0f2fe; font-weight: 700; color: #0c4a6e;">${r.unit || `Row ${idx + 1}`}</td>
            <td style="padding: 8px 10px; border: 1px solid #e0f2fe; text-align: center; color: #334155;">${formatVal(r.time)}</td>
            <td style="padding: 8px 10px; border: 1px solid #e0f2fe; text-align: center; font-weight: 700; color: #0369a1;">${formatVal(r.ph)}</td>
            <td style="padding: 8px 10px; border: 1px solid #e0f2fe; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(r.cond)}</td>
            <td style="padding: 8px 10px; border: 1px solid #e0f2fe; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(r.alk || r.m)}</td>
            <td style="padding: 8px 10px; border: 1px solid #e0f2fe; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(r.sio2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 20px;">
      <div style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background-color: #0369a1; padding: 18px 24px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 18px;">OFFSITE Plant — DM Water Analysis Saved</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">SPIC / TFL Plant Management System</p>
        </div>
        <div style="padding: 20px 24px;">
          <p><strong>Analysis:</strong> DM Water Analysis</p>
          <p><strong>Date:</strong> ${dmDoc.date}</p>
          <p><strong>Record ID:</strong> <code>${dmDoc._id}</code></p>
          <h4 style="margin: 16px 0 6px; color: #0f2e5a;">Analytical Observations</h4>
          ${htmlTable}
          <div style="margin-top: 20px; padding: 10px 14px; background-color: #ecfdf5; border-left: 4px solid #10b981; font-size: 13px; color: #065f46;">
            ✅ Confirmed saved in MongoDB Atlas. Email notification delivered via EmailJS HTTPS API (zero Excel attachments).
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 12px 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          Sent to registered OFFSITE operator (${primaryEmail}).
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `Company: SPIC / TFL
Plant: OFFSITE Plant
Analysis: DM Water Analysis
Analysis Date: ${dmDoc.date}
Record ID: ${dmDoc._id}
Readings:
${readings.map(r => ` - ${r.unit}: pH=${formatVal(r.ph)}, Cond=${formatVal(r.cond)}, Alk=${formatVal(r.alk || r.m)}, SiO2=${formatVal(r.sio2)}`).join('\n')}
Status: Saved Successfully (Delivered via EmailJS HTTPS API, no Excel attachment)
`;

  // 5. Attempt Live Dispatch
  const start = Date.now();
  console.log(`\nDispatching to ${primaryEmail}...`);
  const result = await sendEmailJSOffsiteNotification({
    recipientEmails: recipientEmails && recipientEmails.length > 0 ? recipientEmails : [primaryEmail],
    plantName: 'OFFSITE Plant',
    analysisType: 'DM Water Analysis',
    date: dmDoc.date,
    shift: 'Day',
    htmlBody,
    textBody,
    htmlTable,
    subject: `[OFFSITE Plant] DM Water Analysis Saved - ${dmDoc.date}`,
    recordId: String(dmDoc._id),
    isTestMode: false,
  });

  const elapsed = Date.now() - start;
  console.log(`\nResult in ${elapsed} ms:`, result);

  process.exit(result.success ? 0 : 1);
}

runLiveEmailJSTest().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
