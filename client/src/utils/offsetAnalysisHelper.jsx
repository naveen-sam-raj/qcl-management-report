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
 * Standard Read-Only Date Display Badge matching ACL 300# reference
 * No editable date-picker; strictly locked to Asia/Kolkata today
 */
export const LockedDateDisplay = ({ date, label = 'Date:', id = 'offset-date-display' }) => {
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
        {formatDateDisplay(date)}
      </span>
      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 uppercase tracking-wider ml-0.5">
        Today
      </span>
    </div>
  );
};

/**
 * Decoupled Retry Email Action (Decommissioned)
 */
export const retryAnalysisEmail = async () => {
  return false;
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
 * Status Badge for Records / Shifts (NEW, EDITABLE, WAITING, LOCKED)
 * Matching ACL 300# visual styling
 */
export const RecordStatusBadge = ({ status = 'NEW', subLabel }) => {
  const normalized = String(status).toUpperCase();
  let color = 'bg-blue-100 text-blue-800 border-blue-200';
  let icon = null;

  if (normalized.includes('LOCK')) {
    color = 'bg-slate-100 text-slate-600 border-slate-300';
    icon = <Lock className="w-2.5 h-2.5 inline mr-1" />;
  } else if (normalized.includes('EDIT')) {
    color = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  } else if (normalized.includes('WAIT')) {
    color = 'bg-amber-50 text-amber-700 border-amber-200';
  }

  return (
    <span className={`inline-flex items-center text-[9.5px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${color}`}>
      {icon}
      {status}
      {subLabel && <span className="ml-1 opacity-80 lowercase font-normal">({subLabel})</span>}
    </span>
  );
};

/**
 * Standard Status Save Button matching ACL 300#
 * States:
 * - Saving... (with spinner)
 * - Locked (All Edits Exhausted / All Shifts Saved)
 * - Saved — Email Sent ✓
 * - Saved — Email Pending 🚀
 * - Saved — Email Failed ⚠️
 * - Save Failed — Retry
 * - Save / Submit (Default)
 */
export { StatusSaveButton, SaveStatusBanner } from '../components/common/AnalysisStatusBanner';

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
  isEdit = false,
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
              <h3 className="font-extrabold text-sm tracking-wide uppercase">
                {isEdit ? 'Confirm One-Time Edit Save' : 'Confirm Analysis Save'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isEdit ? 'Note: Exactly 1 edit is permitted. Once saved, this record will be LOCKED.' : 'Review parameters before database persistence'}
              </p>
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

          {isEdit && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>One-Time Edit Warning:</strong> This is your single permitted edit for this record. After saving, it will be permanently <strong>LOCKED</strong>.
              </span>
            </div>
          )}

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
            <span>{isEdit ? 'Confirm & Lock' : 'Confirm & Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
