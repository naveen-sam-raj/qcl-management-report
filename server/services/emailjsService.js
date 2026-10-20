/**
 * Service to dispatch Plant email notifications via EmailJS.
 * [EMAIL FUNCTIONALITY DECOMMISSIONED]
 * This module has been safely disabled: SDK calls and direct HTTPS REST API
 * dispatches are completely removed so no emails can be sent.
 */

/**
 * Retrieves EmailJS credentials status.
 * Always returns isConfigured: false so email dispatches are bypassed.
 */
const getEmailJSConfig = () => {
  return {
    serviceId: '',
    templateId: '',
    publicKey: '',
    privateKey: '',
    isConfigured: false,
  };
};

/**
 * Redactor helper preserved for interface compatibility.
 */
const maskKey = (key) => {
  if (!key || typeof key !== 'string') return 'N/A';
  if (key.length <= 6) return '******';
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
};

/**
 * Error formatting helper preserved for interface compatibility.
 */
const formatEmailJSError = (err) => {
  if (!err) return { status: 'N/A', message: 'Unknown error', fullString: 'Unknown error' };
  if (typeof err === 'string') return { status: 'N/A', message: err, fullString: err };

  const status = err.status || err.statusCode || (err.response && err.response.status) || 'N/A';
  const message =
    err.text ||
    err.message ||
    (err.response && err.response.data) ||
    (typeof err === 'object' ? JSON.stringify(err) : String(err));
  const name = err.name || (err.constructor && err.constructor.name !== 'Object' ? err.constructor.name : 'EmailJSError');

  return {
    status,
    message,
    name,
    fullString: status !== 'N/A' ? `${name} [Status ${status}]: ${message}` : `${name}: ${message}`,
  };
};

/**
 * Disabled EmailJS notification function.
 * Immediately returns disabled status without initiating any network calls.
 */
const sendEmailJSOffsiteNotification = async () => {
  return {
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
    recipient: '',
  };
};

module.exports = {
  getEmailJSConfig,
  maskKey,
  formatEmailJSError,
  sendEmailJSOffsiteNotification,
  sendEmailJSPlantNotification: sendEmailJSOffsiteNotification,
};
