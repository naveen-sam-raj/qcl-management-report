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
  Database,
  FlaskConical,
  Lock,
} from 'lucide-react';

// ─── TK 204 Parameters & Shift Rows Configuration ────────────────────────────
// Frequency: Once in a shift (I Shift, II Shift, III Shift)
// Unit: strictly Kgm/m³

const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '3.09' },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '3.70' },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.09' },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '1.39' },
];

const SHIFTS = [
  { key: 'shift1', label: 'I SHIFT',   time: '06:00 – 14:00', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'shift2', label: 'II SHIFT',  time: '14:00 – 22:00', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { key: 'shift3', label: 'III SHIFT', time: '22:00 – 06:00', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFTS.map((s) => [s.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
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

const TK204AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Date is locked strictly to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [data, setData]                             = useState(buildEmptyData());
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
        const response = await api.get(`/tk-204-analysis?date=${date}`);
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
            const fetchedRows = record.rows || record.shifts || record.readings || record.data?.rows || record.data;
            if (fetchedRows && typeof fetchedRows === 'object') {
              const populated = buildEmptyData();
              SHIFTS.forEach((shift) => {
                if (fetchedRows[shift.key]) {
                  PARAMETERS.forEach((p) => {
                    const val = fetchedRows[shift.key][p.key];
                    populated[shift.key][p.key] = val !== null && val !== undefined ? String(val) : '';
                  });
                }
              });
              setData(populated);
              setOriginalData(JSON.parse(JSON.stringify(populated)));
            } else {
              setData(buildEmptyData());
              setOriginalData(null);
            }

            setLockedShifts(record.lockedShifts || record.data?.lockedShifts || {});
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
          }
        } else {
          setData(buildEmptyData());
          setOriginalData(null);
          setLockedShifts({});
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
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

  // ── Cell Value Change Handler ──
  const handleCellChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isShiftDisabled(shiftKey)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...(prev[shiftKey] || {}),
        [paramKey]: value,
      },
    }));

    // Clear format error for this cell
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${shiftKey}_${paramKey}`];
      return copy;
    });

    setSaveSuccess(false);
  }, [isShiftDisabled]);

  // ── Reset Handler ──
  const handleReset = () => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.('TK 204 analysis form reset.', 'info');
  };

  // ── Validation ──
  const validateForm = () => {
    const newErrors = {};
    let hasError = false;

    SHIFTS.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            newErrors[`${s.key}_${p.key}`] = 'Invalid number';
            hasError = true;
          }
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // Helper to check if a shift row differs from originalData
  const isShiftDiff = (oldShift, newShift) => {
    if (!oldShift && newShift) return true;
    if (oldShift && !newShift) return false;
    return PARAMETERS.some((p) => {
      let oldVal = oldShift?.[p.key] ?? null;
      let newVal = newShift?.[p.key] ?? null;
      if (newVal === '') newVal = null;
      if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
        return Number(oldVal) !== Number(newVal);
      }
      return String(oldVal) !== String(newVal);
    });
  };

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

      const currentShiftData = data[shift.key];
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

  // ── Confirm Save Handler ──
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
      analysisType: 'TK 204 Analysis',
      tank: 'TK 204',
      unit: 'TK 204',
      frequency: 'Once in a shift',
      shift: shiftBeingSaved ? shiftBeingSaved.label : 'I SHIFT',
      rows: Object.fromEntries(
        SHIFTS.map((s) => [
          s.key,
          Object.fromEntries(
            PARAMETERS.map((p) => {
              const val = data[s.key]?.[p.key];
              return [p.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
            })
          ),
        ])
      ),
      submittedBy: user?.name || 'Shift Chemist',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/tk-204-analysis', payload);

      if (!response?.data?.success) {
        showToast?.(response.data?.message || 'Unable to save TK 204 data. Please try again.', 'error');
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
      if (savedDoc?.rows) {
        const synced = buildEmptyData();
        SHIFTS.forEach((s) => {
          if (savedDoc.rows[s.key]) {
            PARAMETERS.forEach((p) => {
              const val = savedDoc.rows[s.key][p.key];
              synced[s.key][p.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setData(synced);
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
      setSavePhase('idle');
      console.error('[TK204Analysis] Save failed:', err);
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
      const response = await api.post(`/api/tk-204-analysis/${recordId}/retry-email`);
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
                <Factory className="w-3.5 h-3.5 text-purple-600" />
                <span>{plantId?.toUpperCase() === 'TFL' ? 'TFL Plant' : 'ACL Plant'}</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">TK 204</span>
                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  Once in a shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                TK 204 ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Actions */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section - Strictly Restricted to Today (Asia/Kolkata) */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 shadow-2xs select-none"
              title="Date selection restricted strictly to current date (Asia/Kolkata)"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
                <span id="tk204-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
                  {formatDateDisplay(date)}
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 uppercase tracking-wider ml-0.5">
                  Today
                </span>
              </div>
            </div>

            {/* Actions */}
            {!isViewOnly ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-tk204-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Reset modified fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  id="btn-tk204-save"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs disabled:opacity-75 cursor-pointer ${
                    savePhase === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  title="Save permitted shift data and notify registered user"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : savePhase === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Save className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {savePhase === 'saving'
                      ? 'Saving...'
                      : savePhase === 'completed'
                      ? 'Saved & Emailed ✓'
                      : savePhase === 'email_failed'
                      ? 'Saved — Email Failed'
                      : 'Save / Submit'}
                  </span>
                </button>
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
      {saveSuccess && (
        <div
          id="tk204-success-banner"
          className={`flex items-start gap-3 p-3.5 border rounded-xl shadow-xs animate-fadeIn ${
            savePhase === 'email_failed'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          {savePhase === 'email_failed' ? (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">
                {savePhase === 'email_failed'
                  ? 'Saved — Email Failed ⚠️'
                  : 'Saved — Email Sent ✓'}
              </span>
              <span className="text-slate-600">
                TK 204 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded in database.
              </span>
            </div>
            {recipientEmail && (
              <div className="text-[11.5px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold">Notification Recipient:</span>
                <span className="font-mono bg-white/70 border px-1.5 py-0.2 rounded font-bold">
                  {recipientEmail}
                </span>
                <span className="text-slate-500">(Registered ACL Plant Operator)</span>
                {emailStatusDetail && (
                  <span className="italic text-slate-600">— {emailStatusDetail}</span>
                )}
              </div>
            )}
          </div>
          {savePhase === 'email_failed' && (
            <button
              onClick={handleRetryEmail}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-200/90 hover:bg-amber-300 rounded border border-amber-400/50 transition cursor-pointer shrink-0 shadow-2xs"
            >
              Retry Email
            </button>
          )}
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-slate-400 hover:text-slate-600 transition text-base leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Main Data Card ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Bar with Frequency & Unit Hints */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              TK 204 Shift Measurements (Kgm/m³)
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Frequency: Once in a shift</span>
            <span>•</span>
            <span>Unit: Kgm/m³</span>
          </div>
        </div>

        {/* The Analysis Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-5 w-48 border-r border-slate-800">
                  Shift / Schedule
                </th>
                {PARAMETERS.map((param) => {
                  const limit = getCellLimit(plantId, 'tk204', 'shift1', param.key);
                  return (
                    <th
                      key={param.key}
                      className="py-3 px-4 text-center border-r border-slate-800 min-w-[150px] last:border-r-0"
                    >
                      <div className="font-extrabold text-blue-300 text-xs">
                        {param.label}
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        {param.formula}
                      </div>
                      {limit && (
                        <div className="mt-1 inline-block text-[10px] bg-slate-800 text-blue-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                          Target: {limit.formattedTarget} ± 0.10 Kgm/m³
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {SHIFTS.map((shift) => {
                const isDisabled = isShiftDisabled(shift.key);

                return (
                  <tr key={shift.key} className="hover:bg-slate-50/80 transition-colors">
                    {/* Shift Label & Status */}
                    <td className="py-3 px-5 border-r border-slate-100 bg-slate-50/50 align-top">
                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                          <div>
                            <span className="font-extrabold text-slate-900 text-xs tracking-wide">
                              {shift.label}
                            </span>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {shift.time}
                            </div>
                          </div>
                        </div>
                        <div className="mt-1">
                          {getShiftBadge(shift.key)}
                        </div>
                      </div>
                    </td>

                    {/* Parameter Cells */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${shift.key}_${param.key}`;
                      const cellVal = data[shift.key]?.[param.key] ?? '';
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const limit = getCellLimit(plantId, 'tk204', shift.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const isFormatError = !!errors[fieldKey];

                      const isEdited = Boolean(
                        editedFields && (editedFields[fieldKey] || (editedFields.get && editedFields.get(fieldKey)))
                      );

                      return (
                        <td
                          key={param.key}
                          className="py-3 px-4 border-r border-slate-100 last:border-r-0 text-center align-top"
                        >
                          <div className="flex flex-col items-center justify-start min-h-[58px] max-w-[140px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`tk204-input-${shift.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                readOnly={isDisabled}
                                disabled={isDisabled}
                                value={cellVal}
                                onChange={(e) => !isViewOnly && handleCellChange(shift.key, param.key, e.target.value)}
                                placeholder={isDisabled ? '—' : param.placeholder}
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `Normal: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : ''
                                }
                                className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border transition shadow-2xs focus:outline-none ${
                                  isDisabled
                                    ? isOutOfLimit
                                      ? 'bg-rose-50 text-rose-900 border-rose-300 font-black cursor-default select-text'
                                      : 'bg-slate-50 text-slate-500 border-slate-200 cursor-default select-text opacity-80'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue
                                    ? 'border-blue-300 bg-blue-50/40 text-blue-950 font-black focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                }`}
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

                            {/* Tiny Compact EDITED badge beside / below modified field */}
                            {isEdited && (
                              <div
                                id={`tk204-edited-badge-${shift.key}-${param.key}`}
                                className="mt-1 inline-flex items-center px-1.5 py-[2px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
                                title="This measurement was modified and saved"
                              >
                                EDITED
                              </div>
                            )}

                            {/* Error Message */}
                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid number</span>
                              </div>
                            )}

                            {/* Out of limit badge */}
                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`tk204-limit-badge-${shift.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.formattedRange}`}
                              >
                                <span>Limit: {limit.formattedRange}</span>
                              </div>
                            )}

                            {/* Normal indicator */}
                            {!isFormatError && isNormal && hasValue && limit && (
                              <span
                                className="text-[10px] text-emerald-600 font-bold mt-1 tracking-tight flex items-center gap-0.5 animate-fadeIn"
                                title={`Normal: ${cellVal} Kgm/m³ (${limit.formattedRange})`}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Normal
                              </span>
                            )}

                            {/* Display allowed range near the input field when empty and not disabled */}
                            {!isFormatError && !hasValue && limit && !isDisabled && (
                              <span
                                className="text-[10px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Allowed range: ${limit.formattedRange}`}
                              >
                                {limit.formattedRange}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Card Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">TK 204 Tolerance Limits:</span>
            <span>FNH₃: 2.99–3.19 • CNH₃: 3.60–3.80 • TCl: 4.99–5.19 • PCl: 1.29–1.49 Kgm/m³</span>
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                Confirm Save — {confirmData.shift.label} (TK 204)
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 transition text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-slate-600 mb-3">
                You are about to save <strong>{confirmData.shift.label}</strong> ({confirmData.shift.time}) measurements for <strong>{formatDateDisplay(confirmData.date)}</strong>.
              </p>
              {confirmData.isFinalEdit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs font-medium flex items-start gap-2 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Warning:</strong> You are about to save the final correction for III SHIFT. After this save succeeds, all shifts for today will be permanently locked.
                  </span>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-bold text-slate-700 mb-1">
                  Measurements to Persist (Kgm/m³):
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {PARAMETERS.map((p) => {
                    const val = data[confirmData.shift.key]?.[p.key];
                    return (
                      <div key={p.key} className="bg-white p-2 rounded border border-slate-200 shadow-2xs">
                        <span className="font-bold text-slate-700">{p.label}:</span>{' '}
                        <span className="font-mono font-extrabold text-blue-900">
                          {val !== '' && val !== null && val !== undefined ? `${val} Kgm/m³` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                disabled={saving}
              >
                Review / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-75 cursor-pointer shadow-2xs"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Saving...
                  </>
                ) : (
                  <>Confirm Save</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TK204AnalysisPage;
