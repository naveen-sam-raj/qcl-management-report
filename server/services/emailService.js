/**
 * Email Service Module
 * SPIC / TFL / Greenstar Analytics Management System
 *
 * Implements:
 * 1. Microsoft Graph API OAuth 2.0 Client Credentials Flow (@azure/identity + Node.js fetch)
 * 2. Plant-wise sender mailbox routing (SA, ACL, OFFSITE, CO2)
 * 3. In-memory duplicate prevention guard (single instance)
 * 4. Active plant user recipient resolution from MongoDB
 * 5. Backward compatibility for decommissioned Nodemailer / EmailJS entry points
 */

let ClientSecretCredential;
try {
  const azureIdentity = require('@azure/identity');
  ClientSecretCredential = azureIdentity.ClientSecretCredential;
} catch (_) {
  // Handled gracefully in sendPlantAnalysisNotification if not installed
}

const mongoose = require('mongoose');

// ============================================================================
// Duplicate Prevention Guard (In-Memory Map)
// NOTE: This guard protects against rapid repeat clicks on a single server instance.
// ============================================================================
const sentNotificationsCache = new Map();
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60-second duplicate suppression window

const getDuplicateKey = (plantCode, recordId, date, analysisType) => {
  return `${String(plantCode || '').toUpperCase()}:${String(recordId || '')}:${String(date || '')}:${String(analysisType || '').toLowerCase()}`;
};

const isDuplicateSave = (key) => {
  const lastSent = sentNotificationsCache.get(key);
  if (!lastSent) return false;
  if (Date.now() - lastSent < DUPLICATE_WINDOW_MS) {
    return true;
  }
  sentNotificationsCache.delete(key);
  return false;
};

const markAsSent = (key) => {
  sentNotificationsCache.set(key, Date.now());
  // Prune expired entries periodically
  if (sentNotificationsCache.size > 200) {
    const now = Date.now();
    for (const [k, timestamp] of sentNotificationsCache.entries()) {
      if (now - timestamp >= DUPLICATE_WINDOW_MS) {
        sentNotificationsCache.delete(k);
      }
    }
  }
};

// ============================================================================
// HTML Sanitization / Escaping Helper
// ============================================================================
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// ============================================================================
// Plant-Wise Sender Mailbox Resolver
// ============================================================================
const resolveSenderMailbox = (plantCode) => {
  const code = String(plantCode || '').trim().toUpperCase();
  if (code === 'SA' || code.includes('SODA')) {
    return process.env.MAIL_SENDER_SA || process.env.MICROSOFT_SENDER_EMAIL || '';
  }
  if (code === 'ACL') {
    return process.env.MAIL_SENDER_ACL || process.env.MICROSOFT_SENDER_EMAIL || '';
  }
  if (code === 'OFFSITE' || code === 'OFFSET' || code.includes('OFF')) {
    return process.env.MAIL_SENDER_OFFSITE || process.env.MICROSOFT_SENDER_EMAIL || '';
  }
  if (code === 'CO2' || code === 'C02') {
    return process.env.MAIL_SENDER_CO2 || process.env.MICROSOFT_SENDER_EMAIL || '';
  }
  return process.env.MICROSOFT_SENDER_EMAIL || '';
};

// ============================================================================
// Microsoft Graph API Email Notification Function
// ============================================================================
/**
 * Sends an email notification via Microsoft Graph API following successful report save in MongoDB.
 * Execution is designed to be called asynchronously (non-blocking).
 *
 * @param {Object} params
 * @param {string|Object} params.plantDoc - Populated Plant document or null
 * @param {string} params.plantCode - Canonical plant code (SA, ACL, OFFSITE, CO2)
 * @param {string} params.plantName - Descriptive name of the plant
 * @param {string} params.analysisType - Type of analysis report saved
 * @param {string} params.date - Analysis date (YYYY-MM-DD)
 * @param {string} params.savedBy - Name of the admin/operator who performed the save
 * @param {Date|string} [params.savedAt] - Exact save timestamp
 * @param {string} params.recordId - Persisted MongoDB record ID
 * @param {string} [params.userPlant] - Authorized plant code from req.user
 * @param {Object} [params.options] - Dependency injection for tests (fakeFetch, fakeCredential)
 * @returns {Promise<{ success: boolean, emailSent: boolean, emailStatus: string, message?: string, error?: string }>}
 */
const sendPlantAnalysisNotification = async ({
  plantDoc = null,
  plantCode = '',
  plantName = '',
  analysisType = '',
  date = '',
  savedBy = 'Plant Administrator',
  savedAt = new Date(),
  recordId = '',
  userPlant = '',
  options = {},
} = {}) => {
  try {
    // 1. Resolve Plant Code and Name
    const resolvedCode = (
      userPlant ||
      plantCode ||
      (plantDoc && (plantDoc.code || plantDoc.name)) ||
      ''
    ).trim().toUpperCase();

    const normalizedCode =
      resolvedCode === 'OFFSET' ? 'OFFSITE' :
      resolvedCode === 'C02' ? 'CO2' :
      resolvedCode;

    const resolvedPlantName =
      plantName ||
      (plantDoc && plantDoc.name) ||
      `${normalizedCode} Plant`;

    // 2. Validate Microsoft 365 / Azure Environment Configuration
    const tenantId = process.env.AZURE_TENANT_ID || process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      console.warn(
        '[Microsoft Graph Email] ⚠️ Missing Azure credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET). Skipping email notification.'
      );
      return {
        success: true,
        emailSent: false,
        emailStatus: 'skipped',
        message: 'Azure credentials not configured. Email notification skipped safely.',
      };
    }

    // 3. Resolve Plant-Wise Sender Mailbox
    const senderMailbox = resolveSenderMailbox(normalizedCode);
    if (!senderMailbox) {
      console.warn(
        `[Microsoft Graph Email] ⚠️ Sender mailbox not configured for plant "${normalizedCode}" (MAIL_SENDER_${normalizedCode}). Skipping email notification.`
      );
      return {
        success: true,
        emailSent: false,
        emailStatus: 'skipped',
        message: `Sender mailbox for plant ${normalizedCode} is not configured.`,
      };
    }

    // 4. In-Memory Duplicate Prevention Check
    const duplicateKey = getDuplicateKey(normalizedCode, recordId, date, analysisType);
    if (isDuplicateSave(duplicateKey)) {
      console.log(`[Microsoft Graph Email] ℹ️ Duplicate notification suppressed for key: ${duplicateKey}`);
      return {
        success: true,
        emailSent: false,
        emailStatus: 'duplicate_suppressed',
        message: 'Duplicate notification request suppressed.',
      };
    }

    // 5. Query Recipients from MongoDB (Active Users assigned to this plant)
    let recipientEmails = Array.isArray(options.recipientEmails) ? [...options.recipientEmails] : [];
    if (recipientEmails.length === 0) {
      try {
        const User = mongoose.models.User || require('../models/User');
        const Plant = mongoose.models.Plant || require('../models/Plant');

        let plantIdFilter = plantDoc?._id || plantDoc?.id;
        if (!plantIdFilter && Plant) {
          const foundPlant = await Plant.findOne({
            $or: [
              { code: normalizedCode },
              { name: new RegExp(`^${normalizedCode}`, 'i') },
            ],
          }).select('_id');
          if (foundPlant) plantIdFilter = foundPlant._id;
        }

        if (plantIdFilter) {
          const userDocs = await User.find({
            plant: plantIdFilter,
            status: 'active',
          }).select('email');

          recipientEmails = userDocs
            .map((u) => (typeof u.email === 'string' ? u.email.trim().toLowerCase() : null))
            .filter((em) => Boolean(em && em.includes('@')));
        }
      } catch (dbErr) {
        console.warn(`[Microsoft Graph Email] ⚠️ Failed querying plant user recipients from MongoDB: ${dbErr.message}`);
      }
    }

    if (!recipientEmails || recipientEmails.length === 0) {
      console.warn(
        `[Microsoft Graph Email] ⚠️ No active users with valid email assigned to plant "${resolvedPlantName}". Skipping notification.`
      );
      return {
        success: true,
        emailSent: false,
        emailStatus: 'no_recipients',
        message: `No active users assigned to ${resolvedPlantName}.`,
      };
    }

    // Deduplicate recipient emails
    recipientEmails = Array.from(new Set(recipientEmails));

    // 6. Format Email Timestamp in Asia/Kolkata
    const dateObj = savedAt instanceof Date ? savedAt : new Date(savedAt || Date.now());
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const formattedSavedAt = validDate.toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST';

    // 7. Construct Email Content (Escaped, Clean, No Credentials or Values)
    const subject = `New ${resolvedPlantName} Analysis Report Saved - QCL Management System`;

    const htmlBody =
`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.04); }
    .header { font-size: 18px; font-weight: 700; color: #0f2e5a; margin-bottom: 16px; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
    .meta-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .meta-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .meta-label { font-weight: 600; color: #64748b; width: 140px; }
    .meta-value { font-weight: 600; color: #0f172a; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">QCL Management System Notification</div>
    <p style="font-size: 14px; line-height: 1.5;">Hello,</p>
    <p style="font-size: 14px; line-height: 1.5;">A new analysis report has been successfully saved in the QCL Report Management System.</p>
    <table class="meta-table">
      <tr><td class="meta-label">Plant:</td><td class="meta-value">${escapeHtml(resolvedPlantName)}</td></tr>
      <tr><td class="meta-label">Report Type:</td><td class="meta-value">${escapeHtml(analysisType || 'Analysis Report')}</td></tr>
      <tr><td class="meta-label">Analysis Date:</td><td class="meta-value">${escapeHtml(date || 'Today')}</td></tr>
      <tr><td class="meta-label">Saved By:</td><td class="meta-value">${escapeHtml(savedBy || 'Plant Administrator')}</td></tr>
      <tr><td class="meta-label">Saved At:</td><td class="meta-value">${escapeHtml(formattedSavedAt)}</td></tr>
    </table>
    <p style="font-size: 13px; color: #475569;">Please log in to the QCL Management System to view the report details.</p>
    <div class="footer">
      Regards,<br>
      <strong>QCL Management Team</strong><br>
      SPIC
    </div>
  </div>
</body>
</html>`;

    // 8. Obtain Microsoft Graph Access Token via OAuth 2.0 Client Credentials Flow
    let token = '';
    if (options.fakeCredential && typeof options.fakeCredential.getToken === 'function') {
      const tokenRes = await options.fakeCredential.getToken('https://graph.microsoft.com/.default');
      token = tokenRes?.token || '';
    } else {
      if (!ClientSecretCredential) {
        throw new Error('@azure/identity is not installed. Run: npm --prefix server install @azure/identity');
      }
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const tokenRes = await credential.getToken('https://graph.microsoft.com/.default');
      token = tokenRes?.token || '';
    }

    if (!token) {
      throw new Error('Failed to acquire OAuth 2.0 access token for Microsoft Graph.');
    }

    // 9. Dispatch Email via Microsoft Graph API sendMail Endpoint
    const graphEndpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderMailbox)}/sendMail`;

    const requestPayload = {
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlBody,
        },
        toRecipients: recipientEmails.map((address) => ({
          emailAddress: { address },
        })),
      },
      saveToSentItems: 'true',
    };

    const fetchFn = options.fakeFetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) {
      throw new Error('Fetch API is not available in current Node.js runtime.');
    }

    const response = await fetchFn(graphEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      let errDetails = '';
      try {
        errDetails = await response.text();
      } catch (_) {}
      throw new Error(`Microsoft Graph API error [${response.status}]: ${errDetails || response.statusText}`);
    }

    // Mark as sent in duplicate prevention guard
    markAsSent(duplicateKey);

    console.log(
      `[Microsoft Graph Email] ✅ Analysis saved notification sent for ${resolvedPlantName} from [${senderMailbox}] to [${recipientEmails.join(', ')}]`
    );

    return {
      success: true,
      emailSent: true,
      emailStatus: 'sent',
      senderMailbox,
      recipients: recipientEmails,
    };
  } catch (error) {
    // Log error without ever leaking tokens or client secrets
    console.error(`[Microsoft Graph Email] ❌ Delivery failure: ${error.message}`);
    return {
      success: false,
      emailSent: false,
      emailStatus: 'failed',
      error: error.message,
    };
  }
};

// ============================================================================
// Preserved Existing Decommissioned Exports
// ============================================================================
const createNodemailerTransporter = () => {
  return null;
};

const sendPureSaltAnalysisReport = async () => {
  return {
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  };
};

const sendUserWelcomeEmail = async () => {
  return { success: true, emailSent: false, emailStatus: 'disabled' };
};

module.exports = {
  createNodemailerTransporter,
  sendPureSaltAnalysisReport,
  sendPureSaltReportEmail: sendPureSaltAnalysisReport,
  sendUserWelcomeEmail,
  sendPlantAnalysisNotification,
  _sentNotificationsCache: sentNotificationsCache, // For testing duplicate suppression
};
