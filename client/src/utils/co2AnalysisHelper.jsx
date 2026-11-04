import React from 'react';
import api from '../services/api';
import { AlertCircle, CheckCircle2, Clock, Calendar, Mail, RotateCw, Lock, Save } from 'lucide-react';
import ConfirmSaveModal from '../components/common/ConfirmSaveModal';

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

export const OPERATING_DAY_START_HOUR = 6;

/**
 * Exact operating date in Asia/Kolkata timezone with 06:00-06:00 IST cycle (hourCycle h23)
 * A timestamp between 00:00:00 and 05:59:59 IST belongs to the previous calendar day.
 */
export const getOperatingDateIST = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const y = parseInt(parts.find((p) => p.type === 'year')?.value, 10);
  const m = parseInt(parts.find((p) => p.type === 'month')?.value, 10);
  const d = parseInt(parts.find((p) => p.type === 'day')?.value, 10);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value, 10);

  let targetYear = y;
  let targetMonth = m;
  let targetDay = d;

  if (hour < OPERATING_DAY_START_HOUR) {
    const prevDay = new Date(Date.UTC(y, m - 1, d - 1));
    targetYear = prevDay.getUTCFullYear();
    targetMonth = prevDay.getUTCMonth() + 1;
    targetDay = prevDay.getUTCDate();
  }

  const mm = String(targetMonth).padStart(2, '0');
  const dd = String(targetDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
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
export const LockedDateDisplay = ({ date, label = 'Date:', id = 'co2-date-display', badgeText = 'Today' }) => {
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
          title={`Date is locked to ${badgeText} (Asia/Kolkata timezone)`}
        />
      </div>
      <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
        {badgeText} (Asia/Kolkata)
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

  if (norm === 'open') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>OPEN</span>
        {subLabel && <span className="font-normal text-[10px] text-emerald-600">({subLabel})</span>}
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
  summarySections = null,
  recipientEmail = '',
}) => {
  return (
    <ConfirmSaveModal
      isOpen={isOpen}
      onCancel={onClose}
      onConfirm={onConfirm}
      saving={saving}
      title={`Confirm Save — ${shiftOrTime}`}
      subtitle={`${analysisName} for ${formatDateDisplay(date)}`}
      prompt={`Are you sure you want to save measurements for ${shiftOrTime}?`}
      sectionTitle={`Values to be saved (${shiftOrTime}):`}
      items={summarySections ? undefined : summaryItems}
      sections={summarySections || undefined}
      recipientEmail={recipientEmail}
    />
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
 * Retry email utility helper (Decommissioned)
 */
export const retryAnalysisEmail = async () => {
  return false;
};
