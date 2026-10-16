import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  getCellLimit,
  validateCellValue,
} from '../../services/analysisValidation';
import {
  ArrowLeft,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Factory,
  Layers,
  Lock,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';

// ─── PCL/TCL Parameter & Limits Specification ────────────────────────────────
// Plant: ACL Plant ONLY
// Selection options: Streams A, B, C, D, E, F, G, H
// Frequency: Once in a Shift (I Shift, II Shift, III Shift)
// Parameter / Limit: PCL/TCL: 0.05–0.10 Kgm/m³ +0.2 / -0.02
// Allowed Range: 0.03–0.30 Kgm/m³ (Min: 0.05 - 0.02 = 0.03, Max: 0.10 + 0.20 = 0.30)
// Boundaries (0.03 and 0.30) are treated as NORMAL.

export const PCL_TCL_LIMITS = {
  pcltcl: {
    key: 'pcltcl',
    paramName: 'PCL/TCL',
    label: 'PCL/TCL',
    target: 0.10,
    tolerance: 0.20,
    min: 0.03,
    max: 0.30,
    unit: 'Kgm/m³',
    formattedRange: '0.03–0.30 Kgm/m³',
    formattedTarget: '0.05–0.10 Kgm/m³',
    formattedTolerance: '+0.2 / -0.02',
    notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02',
    placeholder: '0.10',
  },
};

// 8 Selection Options (Streams A through H)
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[85px]' },
];

// Frequency: Once in a Shift (3 Shifts)
const SHIFTS = [
  {
    key: 'shift1',
    label: 'I SHIFT',
    time: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'shift2',
    label: 'II SHIFT',
    time: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'shift3',
    label: 'III SHIFT',
    time: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
];

const buildEmptyShiftRows = () =>
  Object.fromEntries(
    SHIFTS.map((s) => [
      s.key,
      Object.fromEntries(STREAMS.map((st) => [st.key, ''])),
    ])
  );

// Helper for exact date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayAsiaKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const formatDateDisplay = (isoDate) => {
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

// ─── Individual Cell Component with Limit Badges & Formatting ─────────────────
const PclTclCell = ({
  id,
  value,
  onChange,
  limit,
  isInvalidFormat,
  formatErrorMessage,
  inputFocusStyle,
  ariaLabel,
  disabled = false,
  maxWidth = 'max-w-[85px]',
  isEdited = false,
}) => {
  const validation = validateCellValue(value, limit);
  const isOutOfLimit = validation.isOutOfLimit;
  const isNormal = validation.isNormal;
  const hasValue = value !== '' && value !== null && value !== undefined;

  return (
    <div className="flex flex-col items-center justify-start min-h-[58px]">
      <div className={`relative w-full ${maxWidth}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          onChange={onChange}
          disabled={disabled}
          title={
            limit
              ? isOutOfLimit
                ? `OUT OF LIMIT: ${value} Kgm/m³ (Allowed: ${limit.formattedRange}, Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                : hasValue
                ? `NORMAL: ${value} Kgm/m³ (Allowed: ${limit.formattedRange})`
                : `Allowed range: ${limit.formattedRange} (Notation: ${limit.notation || limit.formattedRange})`
              : ''
          }
          className={`w-full ${maxWidth} mx-auto px-1.5 py-1.5 text-xs font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
            disabled
              ? isOutOfLimit
                ? 'border-2 border-rose-300 bg-rose-50/70 text-rose-900 font-black cursor-default select-text'
                : 'border border-slate-200 bg-slate-50 text-slate-500 cursor-default select-text opacity-85'
              : isOutOfLimit
              ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
              : isInvalidFormat
              ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
              : hasValue && isNormal
              ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
              : hasValue
              ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
              : inputFocusStyle
          }`}
          aria-label={ariaLabel}
        />
        {isOutOfLimit && (
          <span
            className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
            title="Out of limit"
          >
            <AlertCircle className="w-2.5 h-2.5 text-white" />
          </span>
        )}
      </div>

      {/* Small field-level EDITED badge */}
      {isEdited && (
        <div
          id={`${id}-edited-badge`}
          className="mt-1 inline-flex items-center px-1.5 py-[2px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
          title="This stream value was modified and saved"
        >
          EDITED
        </div>
      )}

      {isInvalidFormat && (
        <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
          <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
          <span className="whitespace-nowrap">{formatErrorMessage || 'Invalid'}</span>
        </div>
      )}

      {!isInvalidFormat && (
        <div className="mt-0.5 flex flex-col items-center justify-center">
          {hasValue && isNormal && (
            <span
              id={`${id}-status`}
              className="text-[9.5px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
              title={`NORMAL: within ${limit?.formattedRange || ''}`}
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              <span>NORMAL</span>
            </span>
          )}

          {hasValue && isOutOfLimit && (
            <span
              id={`${id}-status`}
              className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
              title={`OUT OF LIMIT: ${value} Kgm/m³ (Allowed: ${limit?.formattedRange || ''})`}
            >
              <AlertCircle className="w-2 h-2 text-rose-600 shrink-0" />
              <span>OUT OF LIMIT</span>
            </span>
          )}

          {limit?.formattedRange && (
            <span
              id={`${id}-range`}
              className={`text-[9px] font-semibold mt-0.5 tracking-tight whitespace-nowrap ${
                isOutOfLimit
                  ? 'text-rose-700 font-bold'
                  : hasValue
                  ? 'text-slate-600 font-bold'
                  : 'text-slate-400'
              }`}
              title={`PCL/TCL: ${limit.notation || limit.formattedRange}`}
            >
              {limit.formattedRange}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PclTclAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // Dynamic limit config from registry
  const limitPclTcl = getCellLimit(plantId, 'pcl-tcl', 'shift', 'pcltcl') || PCL_TCL_LIMITS.pcltcl;

  // ── States (Date is locked strictly to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [shiftRows, setShiftRows]                   = useState(buildEmptyShiftRows());
  const [originalData, setOriginalData]             = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Sequential Shift Workflow:
  // - On initial load: I SHIFT is editable; II SHIFT & III SHIFT are waiting/disabled.
  // - After I SHIFT save: I SHIFT remains editable until II SHIFT is saved; II SHIFT becomes available.
  // - After II SHIFT save: I SHIFT is permanently locked; II SHIFT remains editable until III SHIFT is saved; III SHIFT becomes available.
  // - After III SHIFT initial save: II SHIFT is permanently locked; exactly 1 final edit allowed for III SHIFT.
  // - After III SHIFT final edit: all 3 shifts permanently locked for that date.
  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 'shift1') {
      return Boolean(lockedShifts.shift1) || Boolean(lockedShifts.shift2Saved);
    }
    if (shiftKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2) || Boolean(lockedShifts.shift3Saved);
    }
    if (shiftKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  // Fetch existing data for current date
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/pcl-tcl-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        if (response.data?.emailStatus) {
          if (response.data.emailStatus === 'sent') setSavePhase('completed');
          else if (response.data.emailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('idle');
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }

          if (record) {
            const fetchedRows = record.shiftRows || record.rows || record.data?.shiftRows || record.data?.rows || record.data;
            if (fetchedRows && typeof fetchedRows === 'object') {
              const populated = buildEmptyShiftRows();
              SHIFTS.forEach((shift) => {
                if (fetchedRows[shift.key]) {
                  STREAMS.forEach((st) => {
                    const val = fetchedRows[shift.key][st.key];
                    populated[shift.key][st.key] = val !== null && val !== undefined ? String(val) : '';
                  });
                }
              });
              setShiftRows(populated);
              setOriginalData(JSON.parse(JSON.stringify(populated)));
            } else {
              setShiftRows(buildEmptyShiftRows());
              setOriginalData(null);
            }

            setLockedShifts(record.lockedShifts || record.data?.lockedShifts || {});
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setShiftRows(buildEmptyShiftRows());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
          }
        } else {
          setShiftRows(buildEmptyShiftRows());
          setOriginalData(null);
          setLockedShifts({});
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setShiftRows(buildEmptyShiftRows());
        setOriginalData(null);
        setLockedShifts({});
        setEditedFields({});
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Input Changes ──
  const handleCellChange = useCallback((shiftKey, streamKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isShiftDisabled(shiftKey)) return;

    setShiftRows((prev) => ({
      ...prev,
      [shiftKey]: {
        ...(prev[shiftKey] || {}),
        [streamKey]: value,
      },
    }));

    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${shiftKey}_${streamKey}`];
      return next;
    });

    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isShiftDisabled]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    if (originalData) {
      setShiftRows(JSON.parse(JSON.stringify(originalData)));
    } else {
      setShiftRows(buildEmptyShiftRows());
    }
    setErrors({});
    setSaveSuccess(false);
    setSavePhase('idle');
    showToast?.('PCL/TCL analysis form reset.', 'info');
  }, [originalData, showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    SHIFTS.forEach((shift) => {
      STREAMS.forEach((s) => {
        const val = shiftRows[shift.key]?.[s.key];
        if (val !== '' && val !== undefined && val !== null && isNaN(Number(val))) {
          newErrors[`${shift.key}_${s.key}`] = 'Invalid number';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [shiftRows]);

  // Helper to check if a shift row differs from originalData
  const isShiftDiff = (oldShift, newShift) => {
    if (!oldShift && newShift) return true;
    if (oldShift && !newShift) return false;
    return STREAMS.some((st) => {
      let oldVal = oldShift?.[st.key] ?? null;
      let newVal = newShift?.[st.key] ?? null;
      if (newVal === '') newVal = null;
      if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
        return Number(oldVal) !== Number(newVal);
      }
      return String(oldVal) !== String(newVal);
    });
  };

  // ── Open Save Confirmation Modal ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validateForm()) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    const shiftsToSave = [];
    let isFinalEdit = false;

    SHIFTS.forEach((shift) => {
      if (isShiftDisabled(shift.key)) return;

      const currentShiftData = shiftRows[shift.key];
      const hasAnyValue = currentShiftData && Object.values(currentShiftData).some((v) => v !== '' && v !== null && v !== undefined);
      const oldShiftData = originalData ? originalData[shift.key] : null;
      const hasDiff = isShiftDiff(oldShiftData, currentShiftData);

      if (hasAnyValue && hasDiff) {
        shiftsToSave.push({
          key: shift.key,
          label: shift.label,
          time: shift.time,
        });

        if (shift.key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0) {
          isFinalEdit = true;
        }
      }
    });

    if (shiftsToSave.length === 0) {
      showToast?.('No new or modified shift data found to save.', 'info');
      return;
    }

    if (shiftsToSave.length > 1) {
      showToast?.('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    setConfirmData({
      date,
      shift: shiftsToSave[0],
      isFinalEdit,
    });
    setShowConfirmModal(true);
  };

  // ── Confirm Save / Submit ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);

    // Close confirmation modal immediately to prevent modal freeze
    setShowConfirmModal(false);

    const shiftBeingSaved = confirmData?.shift;
    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL',
      analysisType: 'PCL/TCL Analysis',
      unit: 'PCL/TCL',
      frequency: 'Once in a shift',
      shift: shiftBeingSaved ? shiftBeingSaved.label : 'I SHIFT',
      rows: Object.fromEntries(
        SHIFTS.map((s) => [
          s.key,
          Object.fromEntries(
            STREAMS.map((st) => {
              const val = shiftRows[s.key]?.[st.key];
              return [st.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
            })
          ),
        ])
      ),
      shiftRows: Object.fromEntries(
        SHIFTS.map((s) => [
          s.key,
          Object.fromEntries(
            STREAMS.map((st) => {
              const val = shiftRows[s.key]?.[st.key];
              return [st.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
            })
          ),
        ])
      ),
      submittedBy: user?.name || 'Shift Chemist',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/pcl-tcl-analysis', payload);

      if (!response?.data?.success) {
        showToast?.(response.data?.message || 'Unable to save PCL/TCL data. Please try again.', 'error');
        setSavePhase('idle');
        return;
      }

      setSaveSuccess(true);
      const savedDoc = response.data?.data;
      if (savedDoc && (savedDoc._id || savedDoc.id)) {
        setRecordId(savedDoc._id || savedDoc.id);
      }
      if (savedDoc?.lockedShifts) {
        setLockedShifts(savedDoc.lockedShifts);
      }
      if (savedDoc?.editedFields) {
        setEditedFields(savedDoc.editedFields);
      }
      if (savedDoc?.shiftRows || savedDoc?.rows) {
        const syncedSource = savedDoc.shiftRows || savedDoc.rows;
        const synced = buildEmptyShiftRows();
        SHIFTS.forEach((s) => {
          if (syncedSource[s.key]) {
            STREAMS.forEach((st) => {
              const val = syncedSource[s.key][st.key];
              synced[s.key][st.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setShiftRows(synced);
        setOriginalData(JSON.parse(JSON.stringify(synced)));
      }

      if (response.data?.emailRecipient) {
        setRecipientEmail(response.data.emailRecipient);
      }

      const emailRes = response.data?.emailNotification;
      const emailSent = response.data?.emailSent;
      const emailPending = response.data?.emailPending;
      const statusFromApi = response.data?.emailStatus;

      if (emailSent || statusFromApi === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(emailRes?.response || 'Delivered to SMTP server ✓');
        showToast?.('Saved — Email Sent ✓', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailRes?.error || emailRes?.status || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      console.error('[PclTclAnalysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('Cannot retry email: Record ID is not available.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post(`/api/pcl-tcl-analysis/${recordId}/retry-email`);
      if (response.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Email sent successfully on retry.');
        showToast?.('Email resent successfully!', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data?.emailError || 'Email delivery failed on retry.');
        showToast?.('Email retry failed: ' + (response.data?.emailError || 'Rejected by server'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.emailError || err.response?.data?.message || err.message;
      setSavePhase('email_failed');
      setEmailStatusDetail(msg);
      showToast?.('Retry Email Error: ' + msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Helper for Shift Status Badges
  const getShiftBadge = (shiftId) => {
    let status = 'NEW';
    let bg = 'bg-indigo-100 text-indigo-700';

    if (lockedShifts[shiftId]) {
      status = 'Locked';
      bg = 'bg-slate-200 text-slate-700';
    } else {
      if (shiftId === 'shift1') {
        if (lockedShifts.shift2Saved) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.shift1Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      } else if (shiftId === 'shift2') {
        if (!lockedShifts.shift1Saved) {
          status = 'Waiting';
          bg = 'bg-amber-100 text-amber-700';
        } else if (lockedShifts.shift3Saved) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.shift2Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      } else if (shiftId === 'shift3') {
        if (!lockedShifts.shift2Saved) {
          status = 'Waiting';
          bg = 'bg-amber-100 text-amber-700';
        } else if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.shift3Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      }
    }

    return (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap shadow-2xs ${bg}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb & Top Navigation with Restricted Today Date ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back button + Breadcrumb + Title */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">PCL/TCL</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                PCL/TCL ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Restricted Today Date + Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Locked Today Date Display */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider leading-none">
                  DATE (TODAY ONLY)
                </span>
                <span className="text-xs font-black text-slate-800 leading-tight">
                  {formatDateDisplay(date)}
                </span>
              </div>
              <span className="ml-1 text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.2 rounded border border-blue-200 uppercase">
                Asia/Kolkata
              </span>
            </div>

            {/* Actions: Save / Submit */}
            {!isViewOnly ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  title="Reset form values"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <StatusSaveButton
                  id="btn-pcltcl-save"
                  saving={saving}
                  savePhase={savePhase}
                  saveSuccess={saveSuccess}
                  onClick={handleSaveClick}
                  defaultLabel="Save / Submit"
                  title="Save permitted shift data and notify registered user"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Read-Only View</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner (Success, Pending, or Email Failed) ──────────────── */}
      <SaveStatusBanner
        id="pcltcl-success-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="PCL/TCL Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Shift / Frequency
                </th>
                {STREAMS.map((s, idx) => (
                  <th
                    key={s.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${s.colClass}`}
                  >
                    Stream {s.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Shift Rows (Frequency: Once in a Shift) */}
            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => {
                const isDisabled = isShiftDisabled(shift.key);

                return (
                  <tr
                    key={shift.key}
                    className={`transition-colors duration-100 ${shift.rowStyle}`}
                  >
                    {/* Shift label & time */}
                    <td className="px-5 py-3 align-top border-r border-slate-200/80 bg-white/70">
                      <div className="flex flex-col gap-1 mt-0.5">
                        <span className="text-xs font-bold text-slate-900 whitespace-nowrap">
                          {shift.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                          {shift.time}
                        </span>
                        <div className="mt-1">
                          {getShiftBadge(shift.key)}
                        </div>
                      </div>
                    </td>

                    {/* Streams A through H Input Cells */}
                    {STREAMS.map((stream) => {
                      const fieldKey = `${shift.key}_${stream.key}`;
                      const cellVal = shiftRows[shift.key]?.[stream.key] ?? '';
                      const isInvalid = !!errors[fieldKey];
                      const isEdited = Boolean(
                        editedFields && (editedFields[fieldKey] || (editedFields.get && editedFields.get(fieldKey)))
                      );

                      return (
                        <td
                          key={stream.key}
                          className="px-2 py-2 text-center align-top"
                        >
                          <PclTclCell
                            id={`pcltcl-input-${shift.key}-${stream.key}`}
                            value={cellVal}
                            limit={limitPclTcl}
                            isInvalidFormat={isInvalid}
                            formatErrorMessage={errors[fieldKey]}
                            inputFocusStyle={shift.inputFocus}
                            ariaLabel={`Stream ${stream.label} - ${shift.label}`}
                            disabled={isDisabled}
                            isEdited={isEdited}
                            onChange={(e) =>
                              !isViewOnly && handleCellChange(shift.key, stream.key, e.target.value)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Parameter: <strong>PCL/TCL: 0.05–0.10 Kgm/m³ +0.2 / -0.02</strong> (Allowed range: <strong>0.03–0.30 Kgm/m³</strong>). Frequency: <strong>Once in a Shift</strong>.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-500 font-semibold">
            Streams: A, B, C, D, E, F, G, H
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {showConfirmModal && confirmData && (
        <div
          id="pcltcl-confirm-modal-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            id="pcltcl-confirm-modal-card"
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-4 text-white">
              <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
                <span>Confirm Save — {confirmData.shift?.label}</span>
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                PCL/TCL Analysis for {formatDateDisplay(confirmData.date)}
              </p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs text-slate-600">
              <p className="text-sm font-semibold text-slate-800">
                Are you sure you want to save measurements for{' '}
                <strong className="text-blue-700">{confirmData.shift?.label}</strong>?
              </p>

              {confirmData.isFinalEdit && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium text-[11px]">
                    <strong>Final Edit Notice:</strong> This is the final permitted edit for III SHIFT. After saving, all shifts for today ({formatDateDisplay(confirmData.date)}) will be permanently locked.
                  </span>
                </div>
              )}

              {/* Snapshot of entered stream values */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Values to be saved ({confirmData.shift?.label}):
                </div>
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  {STREAMS.map((st) => {
                    const val = shiftRows[confirmData.shift?.key]?.[st.key];
                    return (
                      <div key={st.key} className="bg-white p-1.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-sans">Str {st.label}</span>
                        <strong className="text-xs text-slate-800">
                          {val !== '' && val !== null && val !== undefined ? val : '—'}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              {recipientEmail && (
                <div className="text-[11px] text-slate-500">
                  📧 An email notification will be dispatched to registered plant operator:{' '}
                  <strong className="text-slate-800">{recipientEmail}</strong>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {saving && (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PclTclAnalysisPage;
