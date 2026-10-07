import api from '../services/api';

/**
 * Retries sending an analysis report email with generated Excel attachment
 * for an existing saved MongoDB record.
 *
 * @param {string} recordId - MongoDB record ID
 * @param {string} plant - Plant name or code
 * @param {string} analysisType - Name of analysis
 * @param {Function} [showToast] - Optional toast notifier
 * @returns {Promise<boolean>} Whether retry succeeded
 */
export const retryPlantEmail = async (recordId, plant, analysisType, showToast) => {
  if (!recordId) {
    if (showToast) showToast('No saved record available to retry.', 'error');
    return false;
  }

  try {
    if (showToast) showToast('Retrying email dispatch...', 'info', 2500);

    const res = await api.post('/plants/retry-email', {
      recordId,
      plant,
      analysisType,
    });

    if (res.data?.success && res.data?.emailSent) {
      if (showToast) showToast('Saved & Emailed Successfully ✓', 'success');
      return true;
    } else {
      const msg = res.data?.message || 'Data saved and Excel generated, but email sending failed.';
      if (showToast) {
        showToast(msg, 'warning', 6000, {
          label: 'Retry Email',
          onClick: () => retryPlantEmail(recordId, plant, analysisType, showToast),
        });
      }
      return false;
    }
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message || 'Email sending failed.';
    if (showToast) {
      showToast('Retry failed: ' + errorMsg, 'error');
    }
    return false;
  }
};

/**
 * Processes the backend save response across all plant analysis pages.
 * Displays accurate success or warning toast with Retry Email option.
 *
 * @param {Object} response - Axios response from save endpoint
 * @param {Function} showToast - Toast function
 * @param {Object} [options] - Options (setSaving, setSavePhase, setLastSavedRecord)
 */
export const handleAnalysisSaveResponse = (response, showToast, options = {}) => {
  const { setSaving, setSavePhase, setSaveSuccess, setLastSavedRecord } = options;

  if (setSaving) setSaving(false);

  if (!response?.data) return;

  const isEmailed = Boolean(response.data.emailSent);
  const record = response.data.data;
  const msg =
    response.data.message ||
    (isEmailed ? 'Saved & Emailed Successfully ✓' : 'Data saved and Excel generated, but email sending failed.');

  if (setLastSavedRecord && record) {
    setLastSavedRecord(record);
  }

  if (isEmailed) {
    if (setSavePhase) setSavePhase('completed');
    if (setSaveSuccess) setSaveSuccess(true);
    showToast(msg, 'success');
  } else {
    if (setSavePhase) setSavePhase('email_failed');
    if (setSaveSuccess) setSaveSuccess(true);

    const recordId = record?._id || record?.id;
    const plantTarget = record?.plantName || record?.plant || '';
    const analysisType = record?.analysisType || '';

    showToast(
      msg,
      'warning',
      7000,
      recordId
        ? {
            label: 'Retry Email',
            onClick: () => retryPlantEmail(recordId, plantTarget, analysisType, showToast),
          }
        : null
    );
  }
};
