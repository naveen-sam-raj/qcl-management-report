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
  Flame,
  Database,
  FlaskConical,
  Lock,
} from 'lucide-react';

// ─── SA Plant TK 401 Parameters & Validation Limits ──────────────────────────
// Plant: SA Plant ONLY
// Analysis: TK 401
// Frequency: Once in a Shift (I Shift, II Shift, III Shift)
//
// Parameters & Limits:
// 1. FNH3: Reference: 3.97 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.87 – 4.07 Kgm/m³
// 2. CNH3: Reference: 1.92 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.82 – 2.02 Kgm/m³
// 3. TCL:  Reference: 5.47 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.37 – 5.57 Kgm/m³
// 4. PCL:  Reference: 3.55 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.45 – 3.65 Kgm/m³
// 5. TCAO: Available without limits/tolerances (no limit assumed or invented)

export const SA_TK401_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    formula: 'Free Ammonia (FNH₃)',
    target: 3.97,
    tolerance: 0.10,
    min: 3.87,
    max: 4.07,
    unit: 'Kgm/m³',
    formattedRange: '3.87–4.07 Kgm/m³',
    formattedTarget: '3.97 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.97',
    hasLimit: true,
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    formula: 'Combined Ammonia (CNH₃)',
    target: 1.92,
    tolerance: 0.10,
    min: 1.82,
    max: 2.02,
    unit: 'Kgm/m³',
    formattedRange: '1.82–2.02 Kgm/m³',
    formattedTarget: '1.92 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.92',
    hasLimit: true,
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    formula: 'Total Chlorine (T.Cl)',
    target: 5.47,
    tolerance: 0.10,
    min: 5.37,
    max: 5.57,
    unit: 'Kgm/m³',
    formattedRange: '5.37–5.57 Kgm/m³',
    formattedTarget: '5.47 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.47',
    hasLimit: true,
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    formula: 'Polymer Chloride (P.Cl)',
    target: 3.55,
    tolerance: 0.10,
    min: 3.45,
    max: 3.65,
    unit: 'Kgm/m³',
    formattedRange: '3.45–3.65 Kgm/m³',
    formattedTarget: '3.55 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.55',
    hasLimit: true,
  },
  tcao: {
    key: 'tcao',
    paramName: 'TCAO',
    label: 'TCaO',
    formula: 'Total Calcium Oxide (TCaO)',
    unit: '',
    placeholder: '0.00',
    hasLimit: false,
  },
};

const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '3.97', hasLimit: true },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '1.92', hasLimit: true },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.47', hasLimit: true },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '3.55', hasLimit: true },
  { key: 'tcao', label: 'TCaO', formula: 'Total Calcium Oxide (TCaO)', placeholder: '0.00', hasLimit: false },
];

const SHIFTS = [
  {
    key: 's1',
    label: 'I SHIFT',
    time: '07:00 – 15:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
  },
  {
    key: 's2',
    label: 'II SHIFT',
    time: '15:00 – 23:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
  },
  {
    key: 's3',
    label: 'III SHIFT',
    time: '23:00 – 07:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
  },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFTS.map((s) => [
      s.key,
      Object.fromEntries(PARAMETERS.map((p) => [p.key, ''])),
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

const TK401SAAnalysisPage = ({ plantId = 'sa' }) => {
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
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving' | 'email_pending' | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [isPermanentMailError, setIsPermanentMailError] = useState(false);
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Sequential Shift Workflow:
  // - On initial load: I SHIFT (s1) is editable; II SHIFT (s2) & III SHIFT (s3) are waiting/disabled.
  // - After I SHIFT save: I SHIFT remains editable until II SHIFT is saved; II SHIFT becomes available.
  // - After II SHIFT save: I SHIFT is permanently locked; II SHIFT remains editable until III SHIFT is saved; III SHIFT becomes available.
  // - After III SHIFT initial save: II SHIFT is permanently locked; exactly 1 final edit allowed for III SHIFT.
  // - After III SHIFT final edit: all 3 shifts permanently locked for that date.
  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 's1') {
      return Boolean(lockedShifts.s1) || Boolean(lockedShifts.s2Saved);
    }
    if (shiftKey === 's2') {
      if (!lockedShifts.s1Saved) return true;
      return Boolean(lockedShifts.s2) || Boolean(lockedShifts.s3Saved);
    }
    if (shiftKey === 's3') {
      if (!lockedShifts.s2Saved) return true;
      if (lockedShifts.s3) return true;
      if (lockedShifts.s3Saved && (lockedShifts.s3Edits || 0) >= 1) return true;
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
        const response = await api.get(`/sa-tk-401-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        if (response.data?.emailStatus) {
          if (response.data.emailStatus === 'sent') setSavePhase('completed');
          else if (response.data.emailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('email_pending');
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }

          if (record) {
            const fetchedRows = record.shifts || record.rows || record.readings || record.data?.shifts || record.data?.rows || record.data;
            if (fetchedRows && typeof fetchedRows === 'object') {
              const populated = buildEmptyData();
              SHIFTS.forEach((shift) => {
                const shiftSource = fetchedRows[shift.key] || fetchedRows[shift.key === 's1' ? 'shift1' : shift.key === 's2' ? 'shift2' : 'shift3'];
                if (shiftSource) {
                  PARAMETERS.forEach((p) => {
                    const val = shiftSource[p.key];
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

            setLockedShifts(record.lockedShifts || response.data.lockedShifts || {});
            setEditedFields(record.editedFields || response.data.editedFields || {});
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
    showToast?.('TK 401 analysis form reset.', 'info');
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

        if (shift.key === 's3' && lockedShifts.s3Saved && (lockedShifts.s3Edits || 0) === 0) {
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
      plant: 'SA',
      analysisType: 'TK 401 Analysis',
      tank: 'TK 401',
      unit: 'TK 401',
      frequency: 'Once in a Shift',
      shift: shiftBeingSaved ? shiftBeingSaved.label : 'I SHIFT',
      shiftKey: shiftBeingSaved?.key || 's1',
      shifts: data,
      rows: data,
      parameters: data[shiftBeingSaved?.key || 's1'] || {},
      submittedBy: user?.name || 'Shift Chemist',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/sa-tk-401-analysis', payload);

      if (!response?.data?.success) {
        showToast?.(response.data?.message || 'Unable to save TK 401 data. Please try again.', 'error');
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
      if (savedDoc?.shifts || savedDoc?.rows) {
        const docRows = savedDoc.shifts || savedDoc.rows;
        const synced = buildEmptyData();
        SHIFTS.forEach((s) => {
          if (docRows[s.key]) {
            PARAMETERS.forEach((p) => {
              const val = docRows[s.key][p.key];
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
      const emailErrMsg = emailRes?.error || response.data?.emailError || emailRes?.status || '';

      const is550 = /550|5\.1\.1|5\.4\.1|Recipient address rejected|undeliverable address|Access denied/i.test(emailErrMsg);
      setIsPermanentMailError(is550);

      if (emailSent || statusFromApi === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(emailRes?.response || 'Delivered to SMTP server ✓');
        showToast?.('Saved — Email Sent ✓', 'success');
      } else if (emailPending || statusFromApi === 'pending') {
        setSavePhase('email_pending');
        setEmailStatusDetail('Saved — Email dispatching immediately 🚀');
        showToast?.('Saved — Email Dispatching 🚀', 'info');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailErrMsg || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (emailErrMsg || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('idle');
      console.error('[TK401SAAnalysis] Save failed:', err);
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
      const response = await api.post(`/api/sa-tk-401-analysis/${recordId}/retry-email`);
      if (response.data?.emailSent) {
        setSavePhase('completed');
        setIsPermanentMailError(false);
        setEmailStatusDetail('Email accepted by SMTP server ✓');
        showToast?.('Email resent successfully!', 'success');
      } else {
        const errMsg = response.data?.emailError || response.data?.error || 'Email delivery failed on retry.';
        const is550 = response.data?.isPermanentFailure || /550|5\.1\.1|5\.4\.1|Recipient address rejected|undeliverable address|Access denied/i.test(errMsg);
        setSavePhase('email_failed');
        setIsPermanentMailError(is550);
        setEmailStatusDetail(errMsg);
        showToast?.('Email retry failed: ' + errMsg, 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.emailError || err.response?.data?.message || err.message;
      const is550 = err.response?.data?.isPermanentFailure || /550|5\.1\.1|5\.4\.1|Recipient address rejected|undeliverable address|Access denied/i.test(msg);
      setSavePhase('email_failed');
      setIsPermanentMailError(is550);
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
      if (shiftId === 's1') {
        if (lockedShifts.s2Saved) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.s1Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      } else if (shiftId === 's2') {
        if (!lockedShifts.s1Saved) {
          status = 'Waiting';
          bg = 'bg-amber-100 text-amber-700';
        } else if (lockedShifts.s3Saved) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.s2Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      } else if (shiftId === 's3') {
        if (!lockedShifts.s2Saved) {
          status = 'Waiting';
          bg = 'bg-amber-100 text-amber-700';
        } else if (lockedShifts.s3Saved && (lockedShifts.s3Edits || 0) >= 1) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.s3Saved) {
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
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-indigo-600 font-semibold">TK 401</span>
                <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                  Once in a Shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                TK 401 ANALYSIS
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
              <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
                <span id="tk401-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
                  {formatDateDisplay(date)}
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 uppercase tracking-wider ml-0.5">
                  Today
                </span>
              </div>
            </div>

            {/* Actions */}
            {!isViewOnly ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-tk401-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Reset modified fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  id="btn-tk401-save"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs disabled:opacity-75 cursor-pointer ${
                    savePhase === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
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
                      : savePhase === 'email_pending'
                      ? 'Saved — Email Pending'
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
          id="tk401-success-banner"
          className={`flex items-start gap-3 p-3.5 border rounded-xl shadow-xs animate-fadeIn ${
            savePhase === 'email_failed'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : savePhase === 'email_pending'
              ? 'bg-sky-50 border-sky-200 text-sky-900'
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
                  : savePhase === 'email_pending'
                  ? 'Saved — Email Pending ⏳'
                  : 'Saved — Email Sent ✓'}
              </span>
              <span className="text-slate-600">
                TK 401 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded in database.
              </span>
            </div>
            {recipientEmail && (
              <div className="text-[11.5px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold">Notification Recipient:</span>
                <span className="font-mono bg-white/70 border px-1.5 py-0.2 rounded font-bold">
                  {recipientEmail}
                </span>
                <span className="text-slate-500">(Registered SA Plant Operator)</span>
                {emailStatusDetail && (
                  <span className={`italic ${savePhase === 'email_failed' ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}>
                    — {emailStatusDetail}
                  </span>
                )}
              </div>
            )}
            {isPermanentMailError && (
              <div className="text-[11px] text-rose-800 bg-rose-100/80 border border-rose-200 rounded p-1.5 font-medium">
                <strong>Permanent Recipient Error (550 / Access Denied):</strong> The mail server rejected this recipient address. Do not repeatedly retry without updating the active SA Plant user's registered email address in User Management.
              </div>
            )}
          </div>
          {savePhase === 'email_failed' && !isPermanentMailError && (
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
        {/* Table Header Bar with Integrated Details */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              TK 401 Shift Measurements
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>Frequency: Once in a Shift</span>
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
                  const limit = param.hasLimit ? SA_TK401_LIMITS[param.key] : null;
                  return (
                    <th
                      key={param.key}
                      className="py-3 px-4 text-center border-r border-slate-800 min-w-[140px] last:border-r-0"
                    >
                      <div className="font-extrabold text-indigo-300 text-xs">
                        {param.label}
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        {param.hasLimit ? 'Kgm/m³' : '—'}
                      </div>
                      {limit && (
                        <div className="mt-1 inline-block text-[10px] bg-slate-800 text-indigo-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                          Target: {limit.formattedTarget} ({limit.formattedTolerance})
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
                          <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
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
                      const limit = param.hasLimit
                        ? getCellLimit('sa', 'tk401', shift.key, param.key) || SA_TK401_LIMITS[param.key]
                        : null;
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
                          <div className="flex flex-col items-center justify-start min-h-[62px] max-w-[140px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`tk401-input-${shift.key}-${param.key}`}
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
                                      ? `NORMAL: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : param.label
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
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
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
                                id={`tk401-edited-badge-${shift.key}-${param.key}`}
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

                            {/* Status and Allowed Range Display */}
                            {!isFormatError && (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`tk401-status-${shift.key}-${param.key}`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit?.formattedRange || ''}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}

                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`tk401-status-${shift.key}-${param.key}`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit?.formattedRange || ''})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}

                                {/* Allowed range displayed below each applicable input field */}
                                {limit?.formattedRange && (
                                  <span
                                    id={`tk401-range-${shift.key}-${param.key}`}
                                    className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                      isOutOfLimit
                                        ? 'text-rose-700 font-bold'
                                        : hasValue
                                        ? 'text-slate-600 font-bold'
                                        : 'text-slate-400'
                                    }`}
                                    title={`Target: ${limit?.formattedTarget || ''} (${limit?.formattedTolerance || ''})`}
                                  >
                                    {limit?.formattedRange}
                                  </span>
                                )}
                              </div>
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
            <span className="font-semibold text-slate-700">TK 401 Shift Analysis:</span>
            <span>Frequency: Once in a Shift • Parameters: FNH₃, CNH₃, TCl, PCl, TCaO</span>
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                Confirm Save — {confirmData.shift.label} (TK 401)
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
                  Measurements to Persist:
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {PARAMETERS.map((p) => {
                    const val = data[confirmData.shift.key]?.[p.key];
                    return (
                      <div key={p.key} className="bg-white p-2 rounded border border-slate-200 shadow-2xs">
                        <span className="font-bold text-slate-700">{p.label}:</span>{' '}
                        <span className="font-mono font-extrabold text-indigo-900">
                          {val !== '' && val !== null && val !== undefined ? `${val} ${p.hasLimit ? 'Kgm/m³' : ''}` : '—'}
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-75 cursor-pointer shadow-2xs"
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

export default TK401SAAnalysisPage;
