/**
 * Plant Analysis Save & Notification Helper
 * [EMAIL FUNCTIONALITY DECOMMISSIONED]
 * Email delivery notifications and retry controls have been removed.
 * Accurately confirms database saves to MongoDB Atlas without claiming email dispatch.
 */

/**
 * Processes the backend save response across all plant analysis pages.
 * Displays accurate database save success message without email claims or failure warnings.
 *
 * @param {Object} response - Axios response from save endpoint
 * @param {Function} showToast - Toast function
 * @param {Object} [options] - Options (setSaving, setSavePhase, setSaveSuccess, setLastSavedRecord)
 */
export const handleAnalysisSaveResponse = (response, showToast, options = {}) => {
  const { setSaving, setSavePhase, setSaveSuccess, setLastSavedRecord } = options;

  if (setSaving) setSaving(false);

  if (!response?.data) return;

  const record = response.data.data;
  let msg = response.data.message || 'Saved in MongoDB successfully ✓';

  // Sanitize message: remove any legacy email delivery remarks
  if (typeof msg === 'string') {
    if (msg.includes('& email sent') || msg.includes('Email delivery failed') || msg.includes('Email status:')) {
      msg = msg
        .replace(/\s*&\s*email sent\s*✓?/i, ' ✓')
        .replace(/\.?\s*Email delivery failed.*$/i, ' ✓')
        .replace(/\.?\s*Email status:.*$/i, ' ✓')
        .replace(/✓\s*✓/, '✓')
        .trim();
      if (!msg.endsWith('✓')) msg += ' ✓';
    }
  }

  if (setLastSavedRecord && record) {
    setLastSavedRecord(record);
  }

  if (setSavePhase) setSavePhase('completed');
  if (setSaveSuccess) setSaveSuccess(true);
  if (showToast) showToast(msg, 'success');
};

/**
 * Retries sending an analysis report email (Decommissioned)
 * Returns false without initiating network transactions.
 */
export const retryPlantEmail = async () => {
  return false;
};
