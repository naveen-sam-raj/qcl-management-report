import React from 'react';
import api from '../services/api';
import { AlertCircle, CheckCircle2, Clock, Calendar, Mail, RotateCw, Lock, Save } from 'lucide-react';

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
 * Standard Read-Only Date Display Badge matching ACL TK 209 reference
 * No editable date-picker; strictly locked to Asia/Kolkata today
 */
export const LockedDateDisplay = ({ date, label = 'Date:', id = 'co2-date-display' }) => {
  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
      <label
        htmlFor={id}
        className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
      >
        <span>{label}</span>
        <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={id}
          type="date"
          value={date}
          readOnly
          disabled
          className="pl-7 pr-2 py-1 text-xs font-semibold border rounded-md border-slate-300 bg-slate-100 text-slate-700 cursor-not-allowed select-none"
          title="Date is locked to Today (Asia/Kolkata timezone)"
        />
      </div>
      <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
        Today (Asia/Kolkata)
      </span>
      {date && (
        <span className="text-[11px] text-slate-600 font-medium hidden md:inline-block">
          ({formatDateDisplay(date)})
        </span>
      )}
    </div>
  );
};

/**
 * Record / Shift Status Badge: NEW, EDITABLE, WAITING, LOCKED
 */
export const RecordStatusBadge = ({ status, subLabel = '' }) => {
  const norm = String(status || '').toLowerCase();

  if (norm === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
        <Lock className="w-3 h-3 text-slate-500" />
        <span>LOCKED</span>
        {subLabel && <span className="font-normal text-[10px] text-slate-500">({subLabel})</span>}
      </span>
    );
  }

  if (norm === 'editable') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span>EDITABLE</span>
        {subLabel && <span className="font-normal text-[10px] text-amber-600">({subLabel})</span>}
      </span>
    );
  }

  if (norm === 'waiting') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs">
        <Clock className="w-3 h-3 text-slate-400" />
        <span>WAITING</span>
        {subLabel && <span className="font-normal text-[10px] text-slate-400">({subLabel})</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span>NEW</span>
      {subLabel && <span className="font-normal text-[10px] text-emerald-600">({subLabel})</span>}
    </span>
  );
};

export { StatusSaveButton, SaveStatusBanner } from '../components/common/AnalysisStatusBanner';

/**
 * Standard Save / Edit Confirmation Modal
 */
export const SaveConfirmationModal = ({
  isOpen = false,
  onClose,
  onConfirm,
  saving = false,
  analysisName = 'Analysis',
  date = '',
  shiftOrTime = 'Current Shift',
  summaryItems = [],
  recipientEmail = '',
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 text-slate-800 space-y-4">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Confirm Submission
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Review details before persisting to MongoDB
            </p>
          </div>
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            CO2 Plant
          </span>
        </div>

        <div className="space-y-2 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 font-semibold">Analysis Name:</span>
            <span className="font-bold text-slate-900">{analysisName}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 font-semibold">Date Assigned:</span>
            <span className="font-bold font-mono text-slate-900">{formatDateDisplay(date)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 font-semibold">Shift / Frequency:</span>
            <span className="font-bold text-slate-900">{shiftOrTime}</span>
          </div>
          {recipientEmail && (
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-semibold">Notification Recipient:</span>
              <span className="font-bold font-mono text-blue-700">{recipientEmail}</span>
            </div>
          )}
        </div>

        {summaryItems && summaryItems.length > 0 && (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Measurement Summary:
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {summaryItems.map((item, idx) => (
                <div key={idx} className="bg-slate-100/70 p-2 rounded-lg border border-slate-200/60">
                  <div className="text-[10px] text-slate-500 font-medium">{item.label}</div>
                  <div className="font-bold text-slate-900 font-mono mt-0.5">{item.value || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm shadow-blue-500/20 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving to MongoDB...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Submit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Field-level EDITED badge
 */
export const EditedBadge = ({ isEdited }) => {
  if (!isEdited) return null;
  return (
    <span
      className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 ml-1 shadow-2xs select-none"
      title="Field changed during permitted edit"
    >
      EDITED
    </span>
  );
};

/**
 * Retry email utility helper
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
    showToast?.('No saved record found to retry email for.', 'warning');
    return;
  }
  setSaving?.(true);
  try {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const res = await api.post(`${cleanEndpoint}/retry-email`, { recordId });
    if (res.data?.success) {
      setSavePhase?.('completed');
      setEmailStatusDetail?.('Email delivered successfully upon retry ✓');
      showToast?.('Email notification sent successfully!', 'success');
    } else {
      setSavePhase?.('email_failed');
      setEmailStatusDetail?.(res.data?.message || 'SMTP retry rejected');
      showToast?.(res.data?.message || 'Email retry failed.', 'error');
    }
  } catch (err) {
    console.error('Email retry error:', err);
    setSavePhase?.('email_failed');
    const msg = err.response?.data?.message || err.message || 'SMTP Connection failed';
    setEmailStatusDetail?.(msg);
    showToast?.('Email retry failed: ' + msg, 'error');
  } finally {
    setSaving?.(false);
  }
};
