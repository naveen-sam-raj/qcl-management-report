const emailjs = require('@emailjs/nodejs');

/**
 * Service to dispatch OFFSITE Plant email notifications via EmailJS HTTPS API.
 * Uses official @emailjs/nodejs SDK with direct HTTPS REST API fallback.
 * Operates over Port 443 (HTTPS) - fully compatible with cloud hosting (Render).
 * Strictly NO Excel attachments generated or sent.
 */

/**
 * Retrieves and validates EmailJS credentials from environment variables.
 * Never exposes credentials to client or logs.
 */
const getEmailJSConfig = () => {
  const serviceId = (process.env.EMAILJS_SERVICE_ID || '').trim();
  const templateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim();
  const publicKey = (process.env.EMAILJS_PUBLIC_KEY || process.env.EMAILJS_USER_ID || '').trim();
  const privateKey = (process.env.EMAILJS_PRIVATE_KEY || process.env.EMAILJS_ACCESS_TOKEN || '').trim();

  return {
    serviceId,
    templateId,
    publicKey,
    privateKey,
    isConfigured: Boolean(serviceId && templateId && publicKey),
  };
};

/**
 * Safe redactor for credentials in logs
 */
const maskKey = (key) => {
  if (!key || typeof key !== 'string') return 'N/A';
  if (key.length <= 6) return '******';
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
};

/**
 * Dispatches an OFFSITE plant analysis email notification via EmailJS HTTPS API.
 *
 * @param {Object} options
 * @param {string[]} options.recipientEmails - Array of resolved recipient emails
 * @param {string} options.plantName - e.g. "OFFSITE Plant"
 * @param {string} options.analysisType - e.g. "Analysis For DM Water / Anion unit"
 * @param {string} options.date - Analysis date (YYYY-MM-DD)
 * @param {string} options.shift - Shift (e.g. "Day", "iShift", etc.)
 * @param {string} options.htmlBody - Full HTML document with styled analytical table
 * @param {string} options.textBody - Plain-text summary of analytical values
 * @param {string} options.subject - Email subject line
 * @param {string} options.recordId - MongoDB ObjectId of confirmed saved record
 * @param {string} [options.saveEventId] - Unique event token
 * @param {boolean} [options.isTestMode] - If true, mock delivery for automated test safety
 * @returns {Promise<{ success: boolean, emailStatus: 'sent'|'failed', messageId?: string, recipient: string, error?: string }>}
 */
const sendEmailJSOffsiteNotification = async ({
  recipientEmails = [],
  plantName = 'OFFSITE Plant',
  analysisType,
  date,
  shift = 'All Shifts',
  htmlBody = '',
  textBody = '',
  htmlTable = '',
  subject = '',
  recordId = '',
  saveEventId = '',
  isTestMode = false,
}) => {
  const targetRecipients = Array.isArray(recipientEmails) && recipientEmails.length > 0
    ? recipientEmails.filter(Boolean).map((e) => e.trim())
    : [];

  const recipientString = targetRecipients.join(', ');

  if (!recipientString) {
    return {
      success: false,
      emailStatus: 'failed',
      error: 'No valid recipient email address resolved from spic_analytics_db.',
      recipient: '',
    };
  }

  // 1. Test Mode Safeguard (Automated tests must never dispatch real emails)
  const isTesting =
    isTestMode ||
    process.env.NODE_ENV === 'test' ||
    process.env.TEST_MODE === 'true' ||
    process.env.MOCK_EMAIL === 'true';

  if (isTesting) {
    console.log(`[EmailJS] 🧪 Test mode active: Mocking EmailJS HTTPS delivery to [${recipientString}]`);
    return {
      success: true,
      emailStatus: 'sent',
      messageId: `mock_emailjs_${Date.now()}`,
      recipient: recipientString,
      provider: 'EmailJS (Mocked)',
    };
  }

  // 2. Validate EmailJS Credentials
  const { serviceId, templateId, publicKey, privateKey, isConfigured } = getEmailJSConfig();

  if (!isConfigured) {
    const missing = [];
    if (!serviceId) missing.push('EMAILJS_SERVICE_ID');
    if (!templateId) missing.push('EMAILJS_TEMPLATE_ID');
    if (!publicKey) missing.push('EMAILJS_PUBLIC_KEY');

    const configErr = `EmailJS credentials not configured on backend. Missing: ${missing.join(', ')}. Please set in environment / Render variables.`;
    console.error(`[EmailJS] ❌ Configuration error: ${configErr}`);
    return {
      success: false,
      emailStatus: 'failed',
      error: configErr,
      recipient: recipientString,
    };
  }

  // 3. Prepare Template Parameters mapping flexibly to any standard EmailJS template
  const templateParams = {
    // Recipient fields
    to_email: recipientString,
    recipient_email: recipientString,
    email: recipientString,
    to_name: `${plantName} Recipient`,

    // Subject
    subject: subject || `[${plantName}] ${analysisType} Saved - ${date}`,

    // Plant & Analysis metadata
    plant_name: plantName,
    plant: plantName,
    analysis_name: analysisType,
    analysisType,
    report_type: analysisType,
    date,
    analysis_date: date,
    shift: shift || 'All Shifts',
    shift_name: shift || 'All Shifts',
    company_name: 'SPIC / TFL',

    // Content: Rich HTML Observation Table and Plain Text Summary
    html_content: htmlBody,
    html_table: htmlTable || htmlBody,
    table_html: htmlTable || htmlBody,
    message: textBody,
    summary: textBody,
    text_content: textBody,

    // Audit metadata
    record_id: recordId,
    event_id: saveEventId || recordId,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `[EmailJS] 🚀 Dispatching HTTPS notification for ${analysisType} to [${recipientString}] (Service: ${maskKey(serviceId)}, Template: ${maskKey(templateId)}, Public: ${maskKey(publicKey)}, Private: ${privateKey ? 'Configured' : 'None'})`
  );

  // 4. Attempt Delivery via @emailjs/nodejs SDK
  try {
    const sendOptions = { publicKey };
    if (privateKey) {
      sendOptions.privateKey = privateKey;
    }

    const response = await emailjs.send(serviceId, templateId, templateParams, sendOptions);
    const messageId = `emailjs_${Date.now()}_${response.status}`;
    console.log(`[EmailJS] ✅ Delivery confirmed by EmailJS: status ${response.status}, text: "${response.text}"`);

    return {
      success: true,
      emailStatus: 'sent',
      messageId,
      recipient: recipientString,
      provider: 'EmailJS Node SDK',
    };
  } catch (sdkErr) {
    console.warn(`[EmailJS] ⚠️ @emailjs/nodejs SDK error (${sdkErr.message}), attempting direct HTTPS REST API fallback...`);

    // 5. Direct HTTPS REST API Fallback (Port 443)
    try {
      const restPayload = {
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams,
      };
      if (privateKey) {
        restPayload.accessToken = privateKey;
      }

      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Node-Fetch/QCL-Management-System',
        },
        body: JSON.stringify(restPayload),
      });

      if (res.ok) {
        const resText = await res.text();
        const messageId = `emailjs_rest_${Date.now()}`;
        console.log(`[EmailJS] ✅ Direct HTTPS REST API confirmed delivery to [${recipientString}]: "${resText}"`);
        return {
          success: true,
          emailStatus: 'sent',
          messageId,
          recipient: recipientString,
          provider: 'EmailJS HTTPS REST API',
        };
      }

      const errText = await res.text();
      const detailedError = `EmailJS HTTPS API rejected request (${res.status}): ${errText || res.statusText}`;
      console.error(`[EmailJS] ❌ HTTPS REST API failure: ${detailedError}`);
      return {
        success: false,
        emailStatus: 'failed',
        error: detailedError,
        recipient: recipientString,
      };
    } catch (restErr) {
      const finalError = `EmailJS delivery failed: ${restErr.message || sdkErr.message}`;
      console.error(`[EmailJS] ❌ All EmailJS dispatch attempts failed: ${finalError}`);
      return {
        success: false,
        emailStatus: 'failed',
        error: finalError,
        recipient: recipientString,
      };
    }
  }
};

module.exports = {
  getEmailJSConfig,
  sendEmailJSOffsiteNotification,
};
