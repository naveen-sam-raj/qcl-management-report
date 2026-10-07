const mongoose = require('mongoose');
const { Plant, User, ActivityLog } = require('../models');
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
 * Resolves the registered plant user(s) assigned to a given plant in MongoDB.
 *
 * @param {string|Object} plantIdentifier
 * @param {Object} [options]
 * @returns {Promise<{ plant: Object|null, users: Array, primaryEmail: string|null, recipientEmails: Array<string> }>}
 */
const getPlantAssignedUser = async (plantIdentifier, options = {}) => {
  const plant = await resolvePlant(plantIdentifier, options);

  if (!plant) {
    return {
      plant: null,
      users: [],
      primaryEmail: null,
      recipientEmails: [],
    };
  }

  // Find all registered operators/users assigned to this plant in MongoDB
  const users = await User.find({
    plant: plant._id,
  }).sort({ createdAt: 1 });

  const recipientEmails = users.map((u) => u.email).filter(Boolean);

  return {
    plant,
    users,
    primaryEmail: recipientEmails[0] || null,
    recipientEmails,
    assignedUser: users[0] || null,
  };
};

/**
 * Sends plant-wise automatic email notification when an Admin edits/saves plant data.
 * The email is delivered ONLY to the registered email address of the plant's assigned user.
 *
 * Rules strictly followed:
 * 1. ACL Plant Admin edits/saves → send email ONLY to the ACL Plant user's registered email.
 * 2. SA Plant Admin edits/saves → send email ONLY to the SA Plant user's registered email.
 * 3. CO2 Plant Admin edits/saves → send email ONLY to the CO2 Plant user's registered email.
 * 4. Offsite Plant Admin edits/saves → send email ONLY to the Offsite Plant user's registered email.
 *
 * @param {Object} params
 * @param {string|Object} params.plant - Plant name, code, or ObjectId (e.g. 'ACL Plant', 'SA Plant', 'CO2 Plant', 'OFFSITE Plant')
 * @param {string} params.whatUpdated - Description of what was updated/saved
 * @param {string} [params.updatedBy] - Admin/user who performed the update
 * @param {string|Date} [params.dateTime] - Date and time of the update
 * @param {string} [params.details] - Optional extra details/summary of values changed
 * @param {Buffer|Object} [params.attachment] - Optional attachment buffer or object { filename, content, contentType }
 * @param {Buffer} [params.excelBuffer] - Optional generated Excel report buffer
 * @param {string} [params.excelFileName] - Optional Excel filename
 * @returns {Promise<{ success: boolean, plant?: string, recipient?: string, messageId?: string, error?: string }>}
 */
const sendPlantUpdateNotification = async ({
  plant: plantIdentifier,
  whatUpdated,
  updatedBy = 'Plant Administrator',
  dateTime = new Date(),
  details = '',
  attachment,
  excelBuffer,
  excelFileName,
}) => {
  try {
    // 1. Resolve Plant and its registered assigned user from MongoDB
    const { plant, primaryEmail, assignedUser, recipientEmails } = await getPlantAssignedUser(
      plantIdentifier,
      { analysisType: whatUpdated }
    );

    if (!plant) {
      console.warn(`[PlantNotification] Plant could not be identified for: "${plantIdentifier}"`);
      return {
        success: false,
        error: `Could not identify plant for: "${plantIdentifier}".`,
      };
    }

    if (!primaryEmail && (!recipientEmails || recipientEmails.length === 0)) {
      console.warn(
        `[PlantNotification] No registered operator user assigned to plant "${plant.name}" (${plant.code}) in MongoDB.`
      );
      return {
        success: false,
        plant: plant.name,
        error: `No registered user found assigned to ${plant.name}. Please assign a user to this plant in User Management.`,
      };
    }

    // 2. Format Date/Time
    const formattedDate =
      dateTime instanceof Date
        ? dateTime.toLocaleString('en-IN', {
            dateStyle: 'full',
            timeStyle: 'medium',
            timeZone: 'Asia/Kolkata',
          })
        : String(dateTime);

    // 3. Prepare Email Transporter
    const transporter = createNodemailerTransporter();
    if (!transporter) {
      console.error('[PlantNotification] Nodemailer transporter could not be initialized from server/.env.');
      return {
        success: false,
        plant: plant.name,
        recipient: primaryEmail,
        error: 'SMTP credentials not configured in server/.env.',
      };
    }

    const fromAddress =
      process.env.MAIL_FROM || process.env.MAIL_USER || '"ACL Plant Management" <no-reply@spic.co.in>';

    // 4. Resolve Attachment (Excel .xlsx report)
    const mailAttachments = [];
    let resolvedBuffer = excelBuffer;
    let resolvedFileName = excelFileName;

    if (attachment) {
      if (Buffer.isBuffer(attachment)) {
        resolvedBuffer = attachment;
      } else if (attachment.content) {
        resolvedBuffer = Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content, 'base64');
        resolvedFileName = attachment.filename || resolvedFileName;
      }
    }

    // Fail-safe: if no Excel buffer passed, auto-generate authentic .xlsx report
    if (!resolvedBuffer) {
      try {
        const { generatePlantReportExcel } = require('./excelService');
        const genResult = await generatePlantReportExcel({
          plantName: plant.name,
          plantCode: plant.code,
          analysisType: whatUpdated || `${plant.name} Report`,
          date: new Date().toISOString().split('T')[0],
          submittedBy: updatedBy,
          data: details ? { summary: details } : {},
        });
        resolvedBuffer = genResult.buffer;
        resolvedFileName = resolvedFileName || genResult.filename;
      } catch (genErr) {
        console.warn('[PlantNotification] Could not auto-generate fallback Excel:', genErr.message);
      }
    }

    const finalFileName =
      resolvedFileName ||
      `${plant.code}_Plant_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

    if (resolvedBuffer) {
      mailAttachments.push({
        filename: finalFileName,
        content: Buffer.isBuffer(resolvedBuffer) ? resolvedBuffer : Buffer.from(resolvedBuffer, 'base64'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      console.log(`[PlantNotification] 📎 Attached Excel report: "${finalFileName}" (${mailAttachments[0].content.length} bytes)`);
    }

    const subject = `[${plant.name}] Plant Data Update Notification - ${new Date().toLocaleDateString('en-IN')}`;

    const textBody = `Dear ${assignedUser?.name || 'Plant Operator'},

Plant data has been updated and saved by an Administrator.

• Plant Name: ${plant.name} (${plant.code})
• What Was Updated: ${whatUpdated}
• Date & Time: ${formattedDate}
• Updated By: ${updatedBy}
${mailAttachments.length > 0 ? `• Attached Report: ${finalFileName}\n` : ''}${details ? `\nSummary / Changes:\n${details}\n` : ''}
Please find the attached Excel (.xlsx) report containing the recorded plant operations data.
You can also log in to the SPIC / TFL Plant Management Portal to review the updated records.

Regards,
ACL & Industrial Plant Management System
Southern Petrochemical Industries Corporation (SPIC / TFL)`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%); color: #ffffff; padding: 24px; text-align: left; }
    .header h2 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; border-radius: 9999px; background: #e0f2fe; color: #0369a1; margin-bottom: 16px; }
    .table-details { width: 100%; border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .table-details td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .table-details tr:last-child td { border-bottom: none; }
    .label { font-weight: 600; color: #64748b; width: 38%; }
    .value { font-weight: 700; color: #0f172a; }
    .attachment-box { margin-top: 16px; padding: 12px 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
    .attachment-icon { font-size: 18px; }
    .attachment-text { font-size: 13px; font-weight: 600; color: #065f46; }
    .notes-box { background: #f1f5f9; border-left: 4px solid #0284c7; padding: 12px 16px; margin-top: 16px; border-radius: 4px; font-size: 13px; color: #334155; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Plant Data Update Notification</h2>
      <p>SPIC / TFL Plant Management System</p>
    </div>
    <div class="content">
      <div class="badge">${plant.name}</div>
      <p style="font-size: 14px; margin-top: 0;">Dear <strong>${assignedUser?.name || 'Plant Operator'}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #475569;">
        This automated notification is to inform you that operational data has been saved/updated for your assigned plant.
      </p>
      <table class="table-details">
        <tr>
          <td class="label">Plant</td>
          <td class="value">${plant.name} (${plant.code})</td>
        </tr>
        <tr>
          <td class="label">What Was Updated</td>
          <td class="value" style="color: #0284c7;">${whatUpdated}</td>
        </tr>
        <tr>
          <td class="label">Date & Time</td>
          <td class="value">${formattedDate}</td>
        </tr>
        <tr>
          <td class="label">Updated By</td>
          <td class="value">${updatedBy}</td>
        </tr>
        ${mailAttachments.length > 0 ? `
        <tr>
          <td class="label">Attached Report</td>
          <td class="value" style="color: #059669;">📎 ${finalFileName}</td>
        </tr>` : ''}
      </table>
      ${mailAttachments.length > 0 ? `
      <div class="attachment-box">
        <span class="attachment-icon">📊</span>
        <span class="attachment-text">Excel Report Attached: <strong>${finalFileName}</strong></span>
      </div>` : ''}
      ${details ? `<div class="notes-box"><strong>Update Details:</strong><br>${details.replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <div class="footer">
      This is an automated notification sent exclusively to the assigned plant operator. The Excel report is attached directly to this email.
    </div>
  </div>
</body>
</html>
`;

    const targetRecipients =
      recipientEmails && recipientEmails.length > 0
        ? [...new Set(recipientEmails)].join(', ')
        : primaryEmail;

    const mailOptions = {
      from: fromAddress,
      to: targetRecipients,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: mailAttachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[PlantNotification] ✅ Sent for plant "${plant.name}" ONLY to assigned user "${primaryEmail}" (MessageId: ${info.messageId})`
    );

    // 5. Activity Log Entry
    try {
      if (ActivityLog && typeof ActivityLog.create === 'function') {
        await ActivityLog.create({
          action: 'PLANT_USER_NOTIFICATION_SENT',
          userName: updatedBy || 'System Administrator',
          role: 'admin',
          details: `Automatic notification sent to assigned user (${primaryEmail}) for plant "${plant.name}". Update: "${whatUpdated}". Admin: "${updatedBy}".`,
          timestamp: new Date(),
        });
      }
    } catch (logErr) {
      console.warn('[PlantNotification] ActivityLog error:', logErr.message);
    }

    return {
      success: true,
      plant: plant.name,
      recipient: primaryEmail,
      recipientName: assignedUser?.name,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('[PlantNotification] Error dispatching notification:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  resolvePlant,
  getPlantAssignedUser,
  sendPlantUpdateNotification,
};
