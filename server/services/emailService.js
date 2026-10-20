/**
 * Email Service Module
 * [EMAIL FUNCTIONALITY DECOMMISSIONED]
 * Nodemailer, Microsoft Graph, and all SMTP/API email delivery paths
 * have been safely disabled. No network calls or mail transmissions are initiated.
 */

/**
 * Returns null to safely indicate no active SMTP mail transporter.
 */
const createNodemailerTransporter = () => {
  return null;
};

/**
 * Disabled email delivery function.
 * Returns disabled outcome without executing network or SMTP transactions.
 */
const sendPureSaltAnalysisReport = async () => {
  return {
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  };
};

/**
 * User Welcome Email Service (No-op)
 */
const sendUserWelcomeEmail = async () => {
  return { success: true, emailSent: false, emailStatus: 'disabled' };
};

module.exports = {
  createNodemailerTransporter,
  sendPureSaltAnalysisReport,
  sendPureSaltReportEmail: sendPureSaltAnalysisReport,
  sendUserWelcomeEmail,
};
