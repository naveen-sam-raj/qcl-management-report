const nodemailer = require('nodemailer');

/**
 * Creates and returns a Nodemailer transporter configured from server/.env.
 * Uses environment variables:
 * MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASSWORD, MAIL_FROM
 */
const createNodemailerTransporter = () => {
  try {
    require('dotenv').config();
  } catch (e) {
    // Ignore error if dotenv already loaded
  }

  const host = process.env.MAIL_HOST || process.env.SMTP_HOST;
  const user = process.env.MAIL_USER || process.env.SMTP_USER;
  const rawPass = process.env.MAIL_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASS;

  if (!host || !user || !rawPass) {
    return null;
  }

  const pass = rawPass.trim().replace(/\s+/g, '');
  const port = parseInt(process.env.MAIL_PORT || process.env.SMTP_PORT || '587', 10);
  const secure = process.env.MAIL_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: host.trim(),
    port,
    secure,
    auth: {
      user: user.trim(),
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Microsoft Graph API Token Helper (Modular for Microsoft 365 corporate mail)
 */
let cachedM365Token = null;
let m365TokenExpiresAt = 0;

const getMicrosoftGraphAccessToken = async () => {
  const now = Date.now();
  if (cachedM365Token && m365TokenExpiresAt > now + 60000) {
    return cachedM365Token;
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID || process.env.M365_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.M365_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.M365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');
  params.append('client_secret', clientSecret);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Microsoft 365 token error: ${errorText}`);
    }

    const data = await response.json();
    cachedM365Token = data.access_token;
    m365TokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
    return cachedM365Token;
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(`Microsoft 365 token fetch failed: ${err.message}`);
  }
};

/**
 * SECTION 10 & 11: SEND PURE SALT ANALYSIS REPORT WITH EXCEL ATTACHMENT
 * Dispatches an automated email containing the generated .xlsx workbook as an actual attachment.
 * Uses Nodemailer as primary transporter with Microsoft Graph as modular corporate fallback.
 *
 * @param {Object} options
 * @param {string} options.recipientEmail - Recipient email address
 * @param {string} [options.subject] - Optional custom subject line
 * @param {string} [options.body] - Optional custom body text
 * @param {Buffer|Object} [options.attachment] - Excel attachment buffer or object { filename, content, contentType }
 * @param {Buffer} [options.excelBuffer] - Generated Excel workbook buffer
 * @param {string} [options.excelFileName] - Filename (e.g. ACL_Plant_Pure_Salt_Analysis_30-09-2026.xlsx)
 * @param {string} [options.date] - Analysis date
 * @param {string} [options.plant] - Plant name (e.g. ACL Plant)
 * @param {string} [options.shift] - Shift (e.g. All Shifts)
 * @param {string} [options.reportType] - Report type
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, notConfigured?: boolean }>}
 */
const sendPureSaltAnalysisReport = async ({
  recipientEmail,
  subject,
  body,
  attachment,
  excelBuffer,
  excelFileName,
  date = '30-09-2026',
  plant = 'ACL Plant',
  shift = 'All Shifts (I, II, III)',
  reportType = 'Pure Salt Analysis',
}) => {
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Recipient email address is required.' };
  }

  // 1. Resolve Excel Buffer and Filename
  let buffer = excelBuffer;
  let fileName = excelFileName;

  if (attachment) {
    if (Buffer.isBuffer(attachment)) {
      buffer = attachment;
    } else if (attachment.content) {
      buffer = attachment.content;
      fileName = attachment.filename || fileName;
    }
  }

  if (!fileName) {
    fileName = `ACL_Plant_Pure_Salt_Analysis_${date}.xlsx`;
  }

  // 2. Prepare Subject and Body according to specifications
  const emailSubject = subject || `ACL Plant - ${reportType} Report - ${date}`;

  const emailBody = body || `Dear Team,

The ACL Plant entry has been submitted successfully.

Plant: ${plant}
Date: ${date}
Shift: ${shift}

Please find the Excel report attached with the submitted plant entry details.

Regards,
ACL Plant`;

  // 3. Attempt Delivery via Backend Nodemailer
  const transporter = createNodemailerTransporter();

  if (transporter && buffer) {
    try {
      const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER || '"ACL Plant Management" <no-reply@spic.co.in>';

      const mailOptions = {
        from: fromAddress,
        to: recipientEmail.trim(),
        subject: emailSubject,
        text: emailBody,
        attachments: [
          {
            filename: fileName,
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[Nodemailer] ✅ Excel report emailed to ${recipientEmail} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId, provider: 'Nodemailer' };
    } catch (nodemailerErr) {
      console.error('[Nodemailer Error]', nodemailerErr);
      // Fall through to corporate Microsoft Graph fallback if available
    }
  }

  // 4. Modular Fallback: Microsoft 365 Graph API (if corporate M365 configured)
  try {
    const accessToken = await getMicrosoftGraphAccessToken();
    const senderEmail = process.env.MICROSOFT_SENDER_EMAIL || process.env.M365_SENDER_EMAIL || process.env.MAIL_USER;

    if (accessToken && senderEmail && buffer) {
      const graphEndpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;
      const contentBytes = Buffer.isBuffer(buffer) ? buffer.toString('base64') : buffer;

      const emailPayload = {
        message: {
          subject: emailSubject,
          body: {
            contentType: 'Text',
            content: emailBody,
          },
          toRecipients: [{ emailAddress: { address: recipientEmail.trim() } }],
          attachments: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: fileName,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentBytes,
            },
          ],
        },
        saveToSentItems: true,
      };

      const sendController = new AbortController();
      const sendTimeoutId = setTimeout(() => sendController.abort(), 10000);

      const response = await fetch(graphEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
        signal: sendController.signal,
      });

      clearTimeout(sendTimeoutId);

      if (response.ok) {
        console.log(`[Microsoft Graph] ✅ Excel report emailed to ${recipientEmail} via Graph API`);
        return { success: true, provider: 'Microsoft Graph' };
      }
    }
  } catch (m365Err) {
    console.warn('[Microsoft Graph Fallback Error]', m365Err.message);
  }

  // If mail credentials are not configured in server/.env:
  if (!process.env.MAIL_HOST && !process.env.MICROSOFT_TENANT_ID) {
    console.warn('[EmailService] ⚠️ No backend mail provider configured in server/.env (MAIL_HOST / MAIL_USER)');
    return {
      success: false,
      notConfigured: true,
      error: 'Backend mail provider is not configured. Please set MAIL_HOST, MAIL_USER, and MAIL_PASSWORD in server/.env.',
    };
  }

  return {
    success: false,
    error: 'Failed to dispatch email report via backend mailers.',
  };
};

/**
 * User Welcome Email Service (Existing modular account management)
 */
const sendUserWelcomeEmail = async () => {
  return { success: true };
};

module.exports = {
  createNodemailerTransporter,
  sendPureSaltAnalysisReport,
  sendPureSaltReportEmail: sendPureSaltAnalysisReport,
  sendUserWelcomeEmail,
};
