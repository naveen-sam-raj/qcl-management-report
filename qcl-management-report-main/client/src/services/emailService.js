import emailjs from '@emailjs/browser';

/**
 * Retrieves EmailJS credentials from Vite environment variables (import.meta.env).
 * Never hard-code credentials in source code.
 */
export const getEmailJSConfig = () => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error(
      "EmailJS is not fully configured. Please set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY in client/.env."
    );
  }

  return {
    serviceId,
    templateId,
    publicKey,
  };
};

/**
 * Converts a base64 encoded string into a real browser Blob and File object.
 *
 * @param {string} base64 - Base64 encoded file data
 * @param {string} fileName - Filename (e.g. ACL_Plant_Pure_Salt_Analysis_30-09-2026.xlsx)
 * @param {string} mimeType - MIME type for .xlsx
 * @returns {File}
 */
export const base64ToFile = (
  base64,
  fileName = 'ACL_Plant_Pure_Salt_Analysis.xlsx',
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
) => {
  if (!base64) {
    throw new Error('No base64 data provided for Excel file generation.');
  }

  // 1. Decode base64 to binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 2. Generate actual Excel file as a Blob with standard .xlsx MIME type
  const excelBlob = new Blob([bytes], { type: mimeType });

  // 3. Create real File object
  const excelFile = new File([excelBlob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });

  return excelFile;
};

/**
 * SECTION 13: EMAILJS TEST FUNCTION
 * Sends a single test email to verify EmailJS service, template, and public key connectivity.
 * @param {string} recipientEmail - Email address of the recipient
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const sendEmailJSTest = async (recipientEmail) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error(
      "EmailJS is not fully configured. Please set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY in client/.env."
    );
  }

  if (!recipientEmail || !recipientEmail.includes('@')) {
    throw new Error('Please provide a valid recipient email address for testing.');
  }

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const templateParams = {
    email: recipientEmail.trim(),
    to_email: recipientEmail.trim(),
    report_type: 'Test Email',
    date: today,
    plant_name: 'ACL Plant (Test Diagnostic)',
    shift: 'General / Shift Verification',
    message: 'This is a test email from the ACL Plant application.',
  };

  try {
    const result = await emailjs.send(serviceId, templateId, templateParams, publicKey);
    return {
      success: true,
      status: result.status,
      message: `Test email sent successfully to ${recipientEmail} (Status: ${result.status})`,
    };
  } catch (error) {
    console.error('[EmailJS Test] Delivery error:', error);
    const errText = error?.text || error?.message || 'EmailJS service rejected the request.';
    throw new Error(`EmailJS Test Failed: ${errText}`);
  }
};

/**
 * SECTION 1, 2, 4: AUTOMATIC EMAIL REPORT WITH ATTACHED EXCEL WORKBOOK
 * Sends the real .xlsx Excel file as an attachment via EmailJS sendForm.
 *
 * @param {Object} options
 * @param {string} options.recipientEmail - Target recipient email address
 * @param {string} options.date - Analysis date (e.g. 2026-09-30)
 * @param {string} options.plantName - Plant Name (e.g. ACL Plant)
 * @param {string} options.shift - Shift (e.g. All Shifts)
 * @param {string} options.reportType - Report Type (e.g. Pure Salt Analysis)
 * @param {string} options.excelBase64 - Base64 string of the real .xlsx file from backend
 * @param {string} options.excelFileName - Filename (e.g. ACL_Plant_Pure_Salt_Analysis_30-09-2026.xlsx)
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const sendPureSaltAnalysisEmail = async ({
  recipientEmail,
  date,
  plantName = 'ACL Plant',
  shift = 'All Shifts (I, II, III)',
  reportType = 'Pure Salt Analysis',
  excelBase64,
  excelFileName = 'ACL_Plant_Pure_Salt_Analysis.xlsx',
}) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error(
      "EmailJS is not fully configured. Please set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY in client/.env."
    );
  }

  if (!recipientEmail || !recipientEmail.includes('@')) {
    return {
      success: false,
      message: 'Recipient email is missing or invalid.',
    };
  }

  if (!excelBase64) {
    throw new Error('Excel report data was not generated by backend.');
  }

  // 1. Create the real File object from backend base64 .xlsx
  const excelFile = base64ToFile(
    excelBase64,
    excelFileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  // 2. Validate file existence and non-zero size before sending
  if (!excelFile || excelFile.size === 0) {
    throw new Error('Generated Excel file is empty or could not be created.');
  }

  // Safe diagnostic log as requested
  console.log({
    excelFileName: excelFile.name,
    excelFileType: excelFile.type,
    excelFileSize: excelFile.size,
  });

  // 3. Prepare real HTML Form element for EmailJS sendForm
  const formElement = document.createElement('form');
  formElement.style.display = 'none';

  const addHiddenInput = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value || '';
    formElement.appendChild(input);
  };

  // Standard template variables
  addHiddenInput('email', recipientEmail.trim());
  addHiddenInput('to_email', recipientEmail.trim());
  addHiddenInput('report_type', reportType);
  addHiddenInput('date', date);
  addHiddenInput('plant_name', plantName);
  addHiddenInput('shift', shift);

  // 4. Attach real Excel file using DataTransfer into file inputs
  // Primary field name: excel_attachment (as configured in EmailJS template Attachments)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'excel_attachment';

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(excelFile);
  fileInput.files = dataTransfer.files;
  formElement.appendChild(fileInput);

  // Secondary field name: attachment (for backward compatibility if template uses attachment)
  const secondaryFileInput = document.createElement('input');
  secondaryFileInput.type = 'file';
  secondaryFileInput.name = 'attachment';

  const dataTransferSecondary = new DataTransfer();
  dataTransferSecondary.items.add(excelFile);
  secondaryFileInput.files = dataTransferSecondary.files;
  formElement.appendChild(secondaryFileInput);

  document.body.appendChild(formElement);

  try {
    // 5. Send through EmailJS sendForm with the real file attachment
    const result = await emailjs.sendForm(
      serviceId,
      templateId,
      formElement,
      {
        publicKey,
      }
    );

    document.body.removeChild(formElement);

    return {
      success: true,
      status: result.status,
      message: 'Report email sent and Excel file attached successfully.',
    };
  } catch (error) {
    if (document.body.contains(formElement)) {
      document.body.removeChild(formElement);
    }

    console.error('[EmailJS sendForm Attachment Error]', error);
    const errText = error?.text || error?.message || 'EmailJS attachment sending failed.';

    // Do NOT silently fall back to sending plain text emails without the attachment.
    // Return explicit failure so the user and dashboard can fix template attachment setup if needed.
    return {
      success: false,
      error: errText,
      message: errText,
    };
  }
};

export default {
  getEmailJSConfig,
  base64ToFile,
  sendEmailJSTest,
  sendPureSaltAnalysisEmail,
};
