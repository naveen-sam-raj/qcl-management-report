import React from 'react';
import { AlertCircle, CheckCircle2, Lock, RotateCw, Save } from 'lucide-react';

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
 * Standard Save / Submit button showing real saving, locked, and confirmed success states
 */
export const StatusSaveButton = ({
  saving = false,
  isLocked = false,
  savePhase = 'idle',
  saveSuccess,
  onClick,
  disabled = false,
  className = '',
  title = 'Save analysis data',
  id = 'btn-save',
  defaultLabel = 'Save / Submit',
  successLabel,
  recipientEmail,
}) => {
  let label = defaultLabel;
  let icon = <Save className="w-3.5 h-3.5" />;
  let btnClasses = 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20';

  // Only show confirmed green success if save API confirmed success AND data was not modified since
  const isConfirmedSuccess =
    !saving &&
    savePhase !== 'saving' &&
    savePhase !== 'save_failed' &&
    (saveSuccess !== undefined
      ? saveSuccess === true
      : (savePhase === 'completed' || savePhase === 'email_failed'));

  if (saving || savePhase === 'saving') {
    label = 'Saving...';
    icon = <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />;
    btnClasses = 'bg-blue-600 text-white opacity-80 cursor-wait';
  } else if (isLocked) {
    label = 'Locked';
    icon = <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    btnClasses = 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed';
  } else if (isConfirmedSuccess) {
    label = successLabel || 'Saved ✓';
    icon = <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />;
    btnClasses = 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20';
  } else if (savePhase === 'save_failed') {
    label = 'Save Failed — Retry';
    icon = <RotateCw className="w-3.5 h-3.5 text-rose-200 shrink-0" />;
    btnClasses = 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20';
  }

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={saving || isLocked || disabled}
      title={title}
      className={`px-4 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${btnClasses} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

/**
 * Standard Save Status Banner displaying truthful database save outcomes
 * [EMAIL FUNCTIONALITY DECOMMISSIONED - Email failure banners and retry controls removed]
 */
export const SaveStatusBanner = ({
  id,
  saveSuccess = false,
  savePhase = 'idle',
  date = '',
  analysisName = 'Analysis',
  onDismiss,
}) => {
  if (!saveSuccess && savePhase === 'idle') return null;

  const isSaveFailed = savePhase === 'save_failed';

  if (isSaveFailed) {
    return (
      <div
        id={id}
        role="alert"
        className="rounded-xl border p-3.5 text-xs transition-all shadow-xs bg-rose-50 border-rose-200 text-rose-900 animate-fadeIn"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-extrabold uppercase tracking-wide">Save Failed — Retry ❌</span>
            <p className="mt-0.5 text-xs text-rose-700">
              {analysisName} data could not be saved to MongoDB. Please check your inputs and try again.
            </p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-rose-400 hover:text-rose-600 transition text-base leading-none shrink-0 cursor-pointer"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="rounded-xl border p-3.5 text-xs transition-all shadow-xs animate-fadeIn bg-emerald-50 border-emerald-200 text-emerald-900"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold uppercase tracking-wide">
                Saved in Database ✓
              </span>
              <span className="text-emerald-800">
                <strong>{analysisName}</strong>
                {date ? <> for <strong>{formatDateDisplay(date)}</strong></> : ''} has been recorded in MongoDB.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-slate-400 hover:text-slate-600 transition text-base leading-none shrink-0 cursor-pointer px-1"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
