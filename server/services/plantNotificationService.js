const mongoose = require('mongoose');
const { Plant, User, ActivityLog, PlantAnalysisRecord } = require('../models');
const { createNodemailerTransporter } = require('./emailService');

// Map of analysis types / keywords to plant codes for intelligent inference
const ANALYSIS_PLANT_MAPPING = {
  // ACL Plant
  'pure salt': 'ACL',
  'pure salt analysis': 'ACL',
  'pure salt sieve': 'ACL',
  'brine': 'ACL',
  'tk 203': 'ACL',
  'tk 204': 'ACL',
  'tk 209': 'ACL',
  'tk 205': 'ACL',
  'tk 207': 'ACL',
  'tk203': 'ACL',
  'tk204': 'ACL',
  'tk209': 'ACL',
  'tk205': 'ACL',
  'tk207': 'ACL',
  'cr 202': 'ACL',
  'cr 203': 'ACL',
  'cr202': 'ACL',
  'cr203': 'ACL',
  'pcl': 'ACL',
  'tcl': 'ACL',
  'cacl2': 'ACL',
  'acl product': 'ACL',
  'acl 300': 'ACL',
  'raw salt': 'ACL',

  // SA Plant
  'tk 401': 'SA',
  'tk 405': 'SA',
  'tk 414': 'SA',
  'p 413': 'SA',
  'tk 419': 'SA',
  'p 417': 'SA',
  't 407': 'SA',
  't 401': 'SA',
  'bi carbonate': 'SA',
  'bicarbonate': 'SA',
  'lsa': 'SA',
  'lsa 500': 'SA',
  'lsa bagging': 'SA',
  'lsa shift': 'SA',
  'e 501': 'SA',
  't 501': 'SA',
  'gas conc': 'SA',

  // OFFSITE Plant
  'dm water': 'OFFSITE',
  'boiler': 'OFFSITE',
  'bfw': 'OFFSITE',
  'super heated steam': 'OFFSITE',
  'raw water': 'OFFSITE',
  'cbd': 'OFFSITE',
  'bottom ash': 'OFFSITE',
  'fly ash': 'OFFSITE',
  'distiller waste': 'OFFSITE',
  'vacuum seal water': 'OFFSITE',
  'vaccum seal water': 'OFFSITE',
  'sewer water': 'OFFSITE',
  'sewar water': 'OFFSITE',
  'cooling water': 'OFFSITE',

  // CO2 Plant
  'bl1204': 'CO2',
  'bl1203': 'CO2',
  'bl1204/bl1203': 'CO2',
  'bl1204-bl1203': 'CO2',
  'absorber': 'CO2',
  'absorber inlet': 'CO2',
  'absorber-inlet': 'CO2',
  'outlet': 'CO2',
  'lean': 'CO2',
  'rich': 'CO2',
  'washwater': 'CO2',
  'wash water': 'CO2',
  'washwater analysis': 'CO2',
  'p1256': 'CO2',
  'p-1256': 'CO2',
  'p 1256': 'CO2',
  'p1256 analysis': 'CO2',
  'co2': 'CO2',
  'reflux': 'CO2',
  'reflux analysis': 'CO2',
  'tk1251': 'CO2',
  'tk-1251': 'CO2',
  'tk 1251': 'CO2',
  'tk1251 analysis': 'CO2',
  'tk1252': 'CO2',
  'tk-1252': 'CO2',
  'tk 1252': 'CO2',
  'tk1252 analysis': 'CO2',
  'dcc drain liq': 'CO2',
  'dcc-drain-liq': 'CO2',
  'dcc drain liq analysis': 'CO2',
  'dcc': 'CO2',
  'sox drain liq': 'CO2',
  'sox-drain-liq': 'CO2',
  'sox drain liq analysis': 'CO2',
  'sox': 'CO2',
  'absorber drain liq': 'CO2',
  'absorber-drain-liq': 'CO2',
  'absorber drain liq analysis': 'CO2',
  'absorber drain': 'CO2',
  'lean weekly': 'CO2',
  'lean-weekly': 'CO2',
  'lean weekly analysis': 'CO2',
};

/**
 * Formats a Date/timestamp into Asia/Kolkata timezone representations:
 * - dateFormatted: '06 Oct 2026'
 * - timeFormatted: '05:24 PM'
 * - fullIST: '06 Oct 2026 05:24 PM IST'
 * - filenameDate: '06-10-2026'
 */
const formatISTDateTime = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();

  // Validate date object
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const dateFormatted = validDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }); // e.g. "06 Oct 2026"

  const timeFormatted = validDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }); // e.g. "05:24 PM"

  const day = validDate.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'Asia/Kolkata' });
  const month = validDate.toLocaleDateString('en-GB', { month: '2-digit', timeZone: 'Asia/Kolkata' });
  const year = validDate.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Kolkata' });
  const filenameDate = `${day}-${month}-${year}`; // e.g. "06-10-2026"

  return {
    dateFormatted,
    timeFormatted,
    fullIST: `${dateFormatted} ${timeFormatted} IST`,
    filenameDate,
    rawDate: validDate,
  };
};

/**
 * Resolves a Plant document from MongoDB using ID, code, name, or inferred analysis keyword.
 *
 * @param {string|Object} plantIdentifier
 * @param {Object} [options]
 * @returns {Promise<Object|null>} Plant document
 */
const resolvePlant = async (plantIdentifier, options = {}) => {
  if (!plantIdentifier && !options.analysisType) {
    return null;
  }

  // 1. Direct MongoDB ObjectId match
  if (
    plantIdentifier &&
    mongoose.Types.ObjectId.isValid(plantIdentifier) &&
    String(new mongoose.Types.ObjectId(plantIdentifier)) === String(plantIdentifier)
  ) {
    const foundById = await Plant.findById(plantIdentifier);
    if (foundById) return foundById;
  }

  // 2. Direct object passed
  if (plantIdentifier && typeof plantIdentifier === 'object' && plantIdentifier._id) {
    return plantIdentifier;
  }

  let codeOrName = typeof plantIdentifier === 'string' ? plantIdentifier.trim() : '';

  // 3. Fallback: Infer from analysisType or unit if plant string is empty or generic
  if (!codeOrName || codeOrName.toLowerCase() === 'all' || codeOrName.toLowerCase() === 'general') {
    const hint = (options.analysisType || options.unit || '').toLowerCase();
    for (const [key, plantCode] of Object.entries(ANALYSIS_PLANT_MAPPING)) {
      if (hint.includes(key)) {
        codeOrName = plantCode;
        break;
      }
    }
  }

  if (!codeOrName) {
    return null;
  }

  // Normalize plant code/names (e.g. 'offset' -> 'OFFSITE', 'ACL Plant' -> 'ACL')
  const clean = codeOrName.replace(/\s*plant\s*$/i, '').trim();
  let targetCode = clean.toUpperCase();
  if (targetCode === 'OFFSET') targetCode = 'OFFSITE';
  if (targetCode === 'C02') targetCode = 'CO2';

  // 4. Query MongoDB for exact code or name match
  const plant = await Plant.findOne({
    $or: [
      { code: targetCode },
      { code: new RegExp(`^${clean}$`, 'i') },
      { name: new RegExp(`^${clean}$`, 'i') },
      { name: new RegExp(`^${clean}\\s+Plant$`, 'i') },
    ],
  });

  return plant;
};

/**
 * Resolves the registered plant user assigned to a given plant in MongoDB.
 *
 * STRICT ROUTING RULE:
 * ACL Plant    → send ONLY to the user assigned to ACL Plant.
 * SA Plant     → send ONLY to the user assigned to SA Plant.
 * CO2 Plant    → send ONLY to the user assigned to CO2 Plant.
 * OFFSET Plant → send ONLY to the user assigned to OFFSET Plant.
 *
 * If no user is assigned to the plant in MongoDB:
 * Returns error: "No user is assigned to this plant."
 * NO fallback to MAIL_USER or any other email address.
 *
 * @param {string|Object} plantIdentifier
 * @param {Object} [options]
 * @returns {Promise<{ plant: Object|null, users: Array, primaryEmail: string|null, recipientEmails: Array<string>, assignedUser: Object|null, error?: string }>}
 */
const getPlantAssignedUser = async (plantIdentifier, options = {}) => {
  const plant = await resolvePlant(plantIdentifier, options);

  if (!plant) {
    return {
      plant: null,
      users: [],
      primaryEmail: null,
      recipientEmails: [],
      assignedUser: null,
      error: `Could not identify plant for: "${plantIdentifier}".`,
    };
  }

  // Find users assigned to this plant in MongoDB
  const users = await User.find({
    plant: plant._id,
  }).sort({ createdAt: 1 });

  const recipientEmails = users.map((u) => u.email).filter(Boolean);

  if (recipientEmails.length === 0) {
    return {
      plant,
      users: [],
      primaryEmail: null,
      recipientEmails: [],
      assignedUser: null,
      error: 'No user is assigned to this plant.',
    };
  }

  return {
    plant,
    users,
    primaryEmail: recipientEmails[0],
    recipientEmails,
    assignedUser: users[0],
  };
};

/**
 * Sends plant analysis notification email with attached Excel file.
 * The email content strictly adheres to the required format:
 *
 * Subject: [PLANT NAME] Analysis Saved - [DATE]
 * Example: ACL Plant Analysis Saved - 06 Oct 2026
 *
 * Body:
 * Plant:
 * [PLANT NAME]
 *
 * Analysis:
 * [ANALYSIS NAME]
 *
 * Saved Date:
 * [DATE]
 *
 * Saved Time:
 * [TIME]
 *
 * Status:
 * Saved Successfully
 *
 * Record ID:
 * <actual MongoDB record ID>
 *
 * @param {Object} params
 * @param {Object} params.plantDoc - Plant document
 * @param {Object} params.assignedUser - Assigned User document
 * @param {string} params.analysisType - Name of analysis
 * @param {Object} params.savedRecord - The actual saved database record
 * @param {Buffer} params.excelBuffer - The generated Excel file buffer
 * @param {string} params.excelFileName - The Excel filename
 * @returns {Promise<{ success: boolean, emailStatus: string, messageId?: string, error?: string }>}
 */
const sendPlantAnalysisEmail = async ({
  plantDoc,
  assignedUser,
  analysisType,
  savedRecord,
  excelBuffer,
  excelFileName,
}) => {
  if (!assignedUser || !assignedUser.email) {
    return {
      success: false,
      emailStatus: 'failed',
      error: 'No user is assigned to this plant.',
    };
  }

  // Extract exact server-generated timestamp from saved MongoDB record
  const serverTimestamp = savedRecord?.createdAt || savedRecord?.savedAt || new Date();
  const { dateFormatted, timeFormatted, fullIST } = formatISTDateTime(serverTimestamp);

  const plantName = plantDoc.name || 'Industrial Plant';
  const recordId = String(savedRecord?._id || savedRecord?.id || 'N/A');

  // Exact Subject: [PLANT NAME] Analysis Saved - [DATE]
  const subject = `[${plantName}] Analysis Saved - ${dateFormatted}`;

  // Exact Body format
  const textBody = `Plant:
${plantName}

Analysis:
${analysisType}

Saved Date:
${dateFormatted}

Saved Time:
${timeFormatted}

Status:
Saved Successfully

Record ID:
${recordId}

Timezone: Asia/Kolkata (${fullIST})
Attachment: ${excelFileName}
`;

  // Extract data values
  let dataHtml = '';
  if (savedRecord?.data) {
    let dataEntries = [];
    const extractEntries = (obj, prefix = '') => {
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'id' || key === 'plant' || key === 'date' || key === 'analysisType' || key === 'company' || key === '_id' || key === 'submittedBy' || key === 'submittedById') continue;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          extractEntries(val, prefix + key + '.');
        } else if (Array.isArray(val)) {
          dataEntries.push({ key: prefix + key, val: `[Array of ${val.length} items]` });
        } else if (val !== '' && val !== null && val !== undefined) {
          dataEntries.push({ key: prefix + key, val: String(val) });
        }
      }
    };
    extractEntries(savedRecord.data);

    if (dataEntries.length > 0) {
      dataHtml = `
      <div class="field-group">
        <div class="field-label">Entered Values</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
          ${dataEntries.map(e => `
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #475569; width: 50%;">${e.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #0f172a;">${e.val}</td>
            </tr>
          `).join('')}
        </table>
      </div>`;
    }
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f2e5a; color: #ffffff; padding: 20px 24px; border-bottom: 3px solid #0284c7; }
    .header h2 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: 0.3px; }
    .header p { margin: 0; font-size: 12px; opacity: 0.85; }
    .body-content { padding: 24px; }
    .field-group { margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; }
    .field-group:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .field-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
    .field-value { font-size: 15px; font-weight: 600; color: #0f172a; }
    .status-badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 6px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .attachment-card { margin-top: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
    .attachment-name { font-size: 13px; font-weight: 600; color: #0369a1; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>${plantName} Analysis Saved</h2>
      <p>SPIC / TFL Plant Management System</p>
    </div>
    <div class="body-content">
      <div class="field-group">
        <div class="field-label">Plant</div>
        <div class="field-value">${plantName}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Analysis</div>
        <div class="field-value">${analysisType}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Saved Date</div>
        <div class="field-value">${dateFormatted}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Saved Time</div>
        <div class="field-value">${timeFormatted} IST</div>
      </div>
      ${dataHtml}
      <div class="field-group">
        <div class="field-label">Status</div>
        <div class="field-value"><span class="status-badge">Saved Successfully</span></div>
      </div>
      <div class="field-group">
        <div class="field-label">Record ID</div>
        <div class="field-value" style="font-family: monospace; font-size: 13px; color: #334155;">${recordId}</div>
      </div>
      <div class="attachment-card">
        <span style="font-size: 18px;">📊</span>
        <div class="attachment-name">Attached Excel Report: <strong>${excelFileName}</strong></div>
      </div>
    </div>
    <div class="footer">
      Sent to assigned plant operator (${assignedUser.email}). Generated from saved database record.
    </div>
  </div>
</body>
</html>
`;

  // Transporter
  const transporter = createNodemailerTransporter();
  if (!transporter) {
    return {
      success: false,
      emailStatus: 'failed',
      error: 'SMTP credentials not configured in server/.env.',
      recipient: assignedUser.email,
    };
  }

  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER || '"Plant Management" <no-reply@spic.co.in>';

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: assignedUser.email.trim(),
      subject,
      text: textBody,
      html: htmlBody,
      attachments: [
        {
          filename: excelFileName,
          content: Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer, 'base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    console.log(
      `[PlantNotification] ✅ Nodemailer confirmation: sent to ${assignedUser.email} (MessageId: ${info.messageId})`
    );
    return {
      success: true,
      emailStatus: 'sent',
      messageId: info.messageId,
      recipient: assignedUser.email,
    };
  } catch (mailErr) {
    console.error(`[PlantNotification] ❌ Nodemailer delivery failed: ${mailErr.message}`);
    return {
      success: false,
      emailStatus: 'failed',
      error: mailErr.message,
      recipient: assignedUser.email,
    };
  }
};

/**
 * Centralized Save → Email workflow for ALL plant analysis pages.
 *
 * 1. Validate data (done prior or here)
 * 2. Save to MongoDB (creates or accepts saved database record)
 * 3. Record exact current date and time of the save operation (Asia/Kolkata)
 * 4. Generate Excel file from saved database record
 * 5. Resolve user assigned to that plant in MongoDB
 * 6. Send email via Nodemailer with attached Excel
 * 7. Mark emailStatus = 'sent' ONLY after Nodemailer confirms; otherwise 'failed'
 * 8. Return unified response to frontend
 */
const executeSaveAndEmailWorkflow = async ({
  plantIdentifier,
  analysisType,
  unit = '',
  shift = '',
  date = '',
  data = {},
  submittedBy = 'Plant Operator',
  submittedById = null,
  company = null,
  explicitRecord = null,
  rawBody = {},
}) => {
  // 1. Resolve Plant from MongoDB
  const plantDoc = await resolvePlant(plantIdentifier, { analysisType, unit });
  if (!plantDoc) {
    return {
      success: false,
      emailSent: false,
      emailStatus: 'failed',
      message: `Plant could not be identified for: "${plantIdentifier}".`,
    };
  }

  const plantName = plantDoc.name;
  const plantCode = plantDoc.code;

  // 2. Resolve Assigned User from MongoDB
  const { assignedUser, primaryEmail, error: userError } = await getPlantAssignedUser(plantDoc._id);

  // 3. Save to MongoDB Atlas (if not already saved explicitly)
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
        analysisType: analysisType || `${plantName} Analysis`,
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
      console.log(`[SaveAndEmail] ✅ Saved to MongoDB Atlas (Collection: "plantanalysisrecords", ID: ${savedRecord._id})`);
    } catch (saveErr) {
      console.error(`[SaveAndEmail] ❌ Database save failed: ${saveErr.message}`);
      return {
        success: false,
        emailSent: false,
        emailStatus: 'failed',
        message: 'Unable to save the data. Please try again.',
        error: saveErr.message,
      };
    }
  }

  // 4. Capture Server-Generated Timestamp
  const serverTimestamp = savedRecord.createdAt || savedRecord.savedAt || new Date();
  const { dateFormatted, timeFormatted, filenameDate } = formatISTDateTime(serverTimestamp);

  // 5. Generate Excel (.xlsx) using saved database record
  let excelResult = null;
  const cleanCode = plantCode.replace(/[^a-zA-Z0-9]/g, '');
  const cleanType = (analysisType || 'Analysis').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const excelFileName = `${cleanCode}_Plant_${cleanType}_${filenameDate}.xlsx`;

  try {
    if (analysisType === 'Pure Salt Analysis' || cleanType.toLowerCase().includes('pure_salt')) {
      const { generatePureSaltAnalysisExcel } = require('./excelService');
      excelResult = await generatePureSaltAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else {
      const { generatePlantReportExcel } = require('./excelService');
      excelResult = await generatePlantReportExcel({
        plantName,
        plantCode,
        analysisType: analysisType || `${plantName} Analysis`,
        unit: savedRecord.unit || unit,
        date: savedRecord.date || date,
        shift: savedRecord.shift || shift,
        submittedBy,
        data: savedRecord.data || data,
        rawBody,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    }
  } catch (excelErr) {
    console.warn(`[SaveAndEmail] ⚠️ Excel generation warning: ${excelErr.message}`);
  }

  // 6. Security Check: Assigned plant user
  if (!primaryEmail || !assignedUser) {
    console.warn(`[SaveAndEmail] No user assigned to plant "${plantName}". Skipping email dispatch.`);

    // Record emailStatus in MongoDB as failed
    const ModelToUpdate = explicitRecord?.constructor?.findByIdAndUpdate
      ? explicitRecord.constructor
      : PlantAnalysisRecord;

    try {
      if (savedRecord._id && ModelToUpdate.findByIdAndUpdate) {
        await ModelToUpdate.findByIdAndUpdate(savedRecord._id, {
          emailStatus: 'failed',
          reportFileName: excelResult?.filename || excelFileName,
        });
        savedRecord.emailStatus = 'failed';
      }
    } catch (uErr) {}

    return {
      success: true,
      emailSent: false,
      emailStatus: 'failed',
      message: 'No user is assigned to this plant.',
      data: savedRecord,
      excel: excelResult
        ? {
            fileName: excelResult.filename,
            base64: excelResult.base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: excelResult.buffer?.length,
          }
        : null,
    };
  }

  // 7. Dispatch Email with Excel Attachment via Nodemailer
  let emailResult = { success: false, emailStatus: 'failed', error: 'Excel generation failed' };
  if (excelResult?.buffer) {
    emailResult = await sendPlantAnalysisEmail({
      plantDoc,
      assignedUser,
      analysisType: analysisType || `${plantName} Analysis`,
      savedRecord,
      excelBuffer: excelResult.buffer,
      excelFileName: excelResult.filename || excelFileName,
    });
  }

  // 8. Update emailStatus in MongoDB (ONLY "sent" after Nodemailer confirms; otherwise "failed")
  const finalEmailStatus = emailResult.success ? 'sent' : 'failed';
  const ModelToUpdate = explicitRecord?.constructor?.findByIdAndUpdate
    ? explicitRecord.constructor
    : PlantAnalysisRecord;

  try {
    if (savedRecord._id && ModelToUpdate.findByIdAndUpdate) {
      await ModelToUpdate.findByIdAndUpdate(savedRecord._id, {
        emailStatus: finalEmailStatus,
        emailRecipient: assignedUser.email,
        emailMessageId: emailResult.messageId || '',
        reportFileName: excelResult?.filename || excelFileName,
      });
      savedRecord.emailStatus = finalEmailStatus;
    }
  } catch (upErr) {
    console.warn(`[SaveAndEmail] Could not update record status: ${upErr.message}`);
  }

  // 9. Activity Log Entry
  try {
    if (ActivityLog && typeof ActivityLog.create === 'function') {
      await ActivityLog.create({
        action: 'PLANT_ANALYSIS_SAVED',
        user: submittedById,
        userName: submittedBy,
        details: `${analysisType || 'Analysis'} saved for ${plantName}. Email ${
          emailResult.success ? 'sent to ' + assignedUser.email : 'failed: ' + (emailResult.error || 'N/A')
        }.`,
        timestamp: new Date(),
      });
    }
  } catch (logErr) {}

  // 10. Return Response
  if (emailResult.success) {
    return {
      success: true,
      emailSent: true,
      emailStatus: 'sent',
      message: 'Saved & Emailed Successfully ✓',
      data: savedRecord,
      excel: excelResult
        ? {
            fileName: excelResult.filename,
            base64: excelResult.base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: excelResult.buffer?.length,
          }
        : null,
    };
  } else {
    return {
      success: true,
      emailSent: false,
      emailStatus: 'failed',
      message: 'Data saved and Excel generated, but email sending failed.',
      emailError: emailResult.error,
      data: savedRecord,
      excel: excelResult
        ? {
            fileName: excelResult.filename,
            base64: excelResult.base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: excelResult.buffer?.length,
          }
        : null,
    };
  }
};

/**
 * Legacy wrapper for backwards compatibility
 */
const sendPlantUpdateNotification = async (params) => {
  const { plant, whatUpdated, updatedBy, dateTime, details, excelBuffer, excelFileName } = params;
  const plantDoc = await resolvePlant(plant, { analysisType: whatUpdated });
  if (!plantDoc) return { success: false, error: `Could not identify plant for "${plant}"` };

  const { assignedUser, primaryEmail } = await getPlantAssignedUser(plantDoc._id);
  if (!assignedUser || !primaryEmail) {
    return { success: false, error: 'No user is assigned to this plant.' };
  }

  return sendPlantAnalysisEmail({
    plantDoc,
    assignedUser,
    analysisType: whatUpdated || `${plantDoc.name} Update`,
    savedRecord: { createdAt: dateTime || new Date(), _id: 'rec_' + Date.now() },
    excelBuffer,
    excelFileName: excelFileName || `${plantDoc.code}_Report.xlsx`,
  });
};

module.exports = {
  ANALYSIS_PLANT_MAPPING,
  formatISTDateTime,
  resolvePlant,
  getPlantAssignedUser,
  sendPlantAnalysisEmail,
  executeSaveAndEmailWorkflow,
  sendPlantUpdateNotification,
};
