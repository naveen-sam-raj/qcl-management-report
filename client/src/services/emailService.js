/**
 * Client Email Service Module
 * [EMAIL FUNCTIONALITY DECOMMISSIONED]
 * EmailJS browser SDK integrations and test functions have been disabled.
 */

export const getEmailJSConfig = () => {
  return {
    serviceId: '',
    templateId: '',
    publicKey: '',
  };
};

export const base64ToFile = () => {
  return null;
};

export const sendEmailJSTest = async () => {
  return {
    success: true,
    message: 'Email test functionality has been removed.',
  };
};

export const sendPureSaltAnalysisEmail = async () => {
  return {
    success: true,
    message: 'Email notification functionality has been removed.',
  };
};

export default {
  getEmailJSConfig,
  base64ToFile,
  sendEmailJSTest,
  sendPureSaltAnalysisEmail,
};
