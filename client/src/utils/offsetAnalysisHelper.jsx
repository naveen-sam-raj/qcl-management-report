import React from 'react';
import api from '../services/api';
import { AlertCircle, CheckCircle2, Clock, Calendar, Mail, RotateCw } from 'lucide-react';

/**
 * Returns today's operating date in Asia/Kolkata timezone (YYYY-MM-DD)
 */
export const getTodayAsiaKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

/**
 * Format ISO date string into Indian locale display (e.g., "Wed, 14 Oct 2026")
 */
export const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return isoDate;
  }
};

/**
 * Decoupled Retry Email Action
 */
export const retryAnalysisEmail = async ({
  endpoint,
  recordId,
  setSavePhase,
  setEmailStatusDetail,
  showToast,
  setSaving,
}) => {
  if (!recordId) {
    showToast?.('Cannot retry email: Record ID is not available.', 'error');
    return false;
  }
  if (setSaving) setSaving(true);
  try {
    const res = await api.post(`${endpoint}/${recordId}/retry-email`);
    if (res.data?.success || res.data?.emailStatus === 'sent' || res.data?.emailSent) {
      if (setSavePhase) setSavePhase('completed');
      if (setEmailStatusDetail) setEmailStatusDetail('Email sent successfully on retry ✓');
      showToast?.('Email resent successfully to registered plant operator!', 'success');
      return true;
    } else {
      if (setSavePhase) setSavePhase('email_failed');
      const err = res.data?.emailError || res.data?.message || 'Email delivery rejected by server.';
      if (setEmailStatusDetail) setEmailStatusDetail(err);
      showToast?.('Email retry failed: ' + err, 'error');
      return false;
    }
  } catch (err) {
    const msg = err.response?.data?.emailError || err.response?.data?.message || err.message;
    if (setSavePhase) setSavePhase('email_failed');
    if (setEmailStatusDetail) setEmailStatusDetail(msg);
    showToast?.('Retry Email Error: ' + msg, 'error');
    return false;
  } finally {
    if (setSaving) setSaving(false);
  }
};

/**
 * Field-Level EDITED Badge
 */
export const EditedBadge = ({ isEdited }) => {
  if (!isEdited) return null;
  return (
    <span
      className="mt-0.5 inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100 text-amber-900 border border-amber-300 text-[8.5px] font-extrabold uppercase tracking-wider select-none shadow-2xs"
      title="This field value was modified and saved after initial entry"
    >
      EDITED
    </span>
  );
};

/**
 * Standard Save Status Banner (Email Sent, Email Pending, Email Failed)
 */
export const SaveStatusBanner = ({
  saveSuccess,
  savePhase,
  date,
  analysisName = 'Analysis',
  recipientEmail,
  emailStatusDetail,
  onRetryEmail,
  onDismiss,
  saving,
}) => {
  if (!saveSuccess) return null;

  const isFailed = savePhase === 'email_failed';
  const isPending = savePhase === 'email_pending';

  return (
    <div
      className={`flex items-start gap-3 p-3.5 border rounded-xl shadow-xs animate-fadeIn ${
        isFailed
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : isPending
          ? 'bg-sky-50 border-sky-200 text-sky-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}
    >
      {isFailed ? (
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      )}
      <div className="text-xs flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold uppercase tracking-wide">
            {isFailed
              ? 'Saved — Email Failed ⚠️'
              : isPending
              ? 'Saved — Email Pending 🚀'
              : 'Saved — Email Sent ✓'}
          </span>
          <span className="text-slate-600">
            {analysisName} for <strong>{formatDateDisplay(date)}</strong> has been persisted in MongoDB.
          </span>
        </div>
        {recipientEmail && (
          <div className="text-[11px] text-slate-600 font-mono flex items-center gap-1">
            <Mail className="w-3 h-3 text-slate-400" />
            <span>Assigned Recipient:</span>
            <strong>{recipientEmail}</strong>
          </div>
        )}
        {emailStatusDetail && (
          <div className="text-[11px] text-slate-500 italic">
            {emailStatusDetail}
          </div>
        )}
        {isFailed && onRetryEmail && (
          <div className="pt-1">
            <button
              type="button"
              onClick={onRetryEmail}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-bold rounded transition shadow-2xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCw className={`w-3 h-3 ${saving ? 'animate-spin' : ''}`} />
              <span>Retry Email Notification</span>
            </button>
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 transition text-base leading-none shrink-0 cursor-pointer"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
};

/**
 * Standard Save Confirmation Modal
 */
export const SaveConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  saving,
  analysisName = 'OFFSET Analysis',
  date,
  shiftOrTime,
  summaryItems = [],
  recipientEmail,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-wide uppercase">Confirm Analysis Save</h3>
              <p className="text-[11px] text-slate-300">Review parameters before database persistence</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-white transition text-lg leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Analysis</span>
              <span className="font-extrabold text-slate-800">{analysisName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Operating Date</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                {formatDateDisplay(date)}
              </span>
            </div>
            {shiftOrTime && (
              <div className="col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Shift / Timing</span>
                <span className="font-extrabold text-blue-700">{shiftOrTime}</span>
              </div>
            )}
          </div>

          {summaryItems.length > 0 && (
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                Parameters Being Submitted:
              </span>
              <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                {summaryItems.map((item, idx) => (
                  <div key={idx} className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="text-[9.5px] text-slate-400 block font-sans truncate">{item.label}</span>
                    <strong className="text-xs text-slate-800 font-mono">{item.value || '—'}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recipientEmail && (
            <div className="text-[11px] text-slate-600 bg-blue-50/60 p-2.5 rounded-lg border border-blue-200/60 flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Notification email with persisted values will be dispatched dynamically to registered operator:{' '}
                <strong className="text-blue-900 font-mono">{recipientEmail}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving && (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <span>Confirm & Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
