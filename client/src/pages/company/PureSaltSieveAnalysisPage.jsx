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
  Grid3X3,
  Factory,
  Eye,
  Lock,
  Pencil,
  Clock,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import {
  getOperatingDateIST,
  LockedDateDisplay,
  RecordStatusBadge,
} from '../../utils/co2AnalysisHelper';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMETERS = [
  { key: 'p18',  label: 'BSS 18',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p44',  label: 'BSS 44',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p60',  label: 'BSS 60',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p100', label: 'BSS 100', unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'm100', label: '-100',    unit: '%', colClass: 'min-w-[110px]' },
];

const ROWS = [
  { key: 'shift1', label: 'I SHIFT',   badgeText: 'Shift 1', highlightType: 'shift1' },
  { key: 'shift2', label: 'II SHIFT',  badgeText: 'Shift 2', highlightType: 'shift2' },
  { key: 'shift3', label: 'III SHIFT', badgeText: 'Shift 3', highlightType: 'shift3' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

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

// ─── Row styles (Vibrant, High-Contrast Industrial Palette) ───────────────────

const getRowStyles = (highlightType) => {
  if (highlightType === 'shift1') {
    return {
      row:        'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-blue-600',
      label:      'text-blue-950 font-extrabold tracking-tight',
      badge:      'bg-blue-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift2') {
    return {
      row:        'bg-blue-50/40 hover:bg-blue-100/50 border-l-4 border-l-indigo-500',
      label:      'text-indigo-950 font-extrabold tracking-tight',
      badge:      'bg-indigo-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  return {
    row:        'bg-purple-50/30 hover:bg-purple-100/40 border-l-4 border-l-purple-500',
    label:      'text-purple-950 font-extrabold tracking-tight',
    badge:      'bg-purple-600 text-white font-extrabold shadow-2xs',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PureSaltSieveAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── State (Date is locked strictly to Today's date in Asia/Kolkata) ──
  const [date, setDate]               = useState(() => getOperatingDateIST());
  const [data, setData]               = useState(buildEmptyData());
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lockedShifts, setLockedShifts] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [originalData, setOriginalData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Sequential Shift Workflow:
  // - On first entry: I SHIFT is automatically enabled; II SHIFT & III SHIFT are disabled.
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

  // Get status for shift badge: NEW, OPEN, EDITABLE, WAITING, LOCKED
  const getShiftStatus = useCallback(
    (shiftKey) => {
      if (shiftKey === 'shift1') {
        if (lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved) return 'LOCKED';
        if (lockedShifts.shift1Saved) return 'EDITABLE';
        return 'NEW';
      }
      if (shiftKey === 'shift2') {
        if (lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved) return 'LOCKED';
        if (lockedShifts.shift2Saved) return 'EDITABLE';
        if (lockedShifts.shift1Saved) return 'OPEN';
        return 'WAITING';
      }
      if (shiftKey === 'shift3') {
        if (
          lockedShifts.shift3 ||
          lockedShifts.shift3Locked ||
          (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)
        )
          return 'LOCKED';
        if (lockedShifts.shift3Saved) return 'EDITABLE';
        if (lockedShifts.shift2Saved) return 'OPEN';
        return 'WAITING';
      }
      return 'WAITING';
    },
    [lockedShifts]
  );

  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  // 'idle' | 'saving' | 'generating' | 'emailing' | 'completed' | 'email_failed'
  const [savePhase, setSavePhase] = useState('idle');
  const [lastSavedRecord, setLastSavedRecord] = useState(null);
  const [lastExcelData, setLastExcelData] = useState(null);

  // Shift Display Names for clean toasts & dialogs
  const shiftDisplayNames = {
    shift1: 'I SHIFT',
    shift2: 'II SHIFT',
    shift3: 'III SHIFT',
  };

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;
    setData(buildEmptyData());

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/pure-salt-sieve-analysis?date=${date}`);
        if (!active) return;

        if (response.data && (response.data.assignedOperatorEmail || response.data.emailRecipient)) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }

        if (response.data && response.data.emailStatus) {
          if (response.data.emailStatus === 'sent') {
            setSavePhase('completed');
            setEmailStatusDetail('Email accepted by SMTP server');
          } else if (response.data.emailStatus === 'failed') {
            setSavePhase('email_failed');
            setEmailStatusDetail('Email delivery failed to mail server');
          }
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const records = Array.isArray(payloadData) ? payloadData : [payloadData];
          const record = records.find((r) => r.date === date) || records[0];

          if (record) {
            setLastSavedRecord(record);
            if (record.emailRecipient) setRecipientEmail(record.emailRecipient);
            if (record.emailStatus === 'sent') {
              setSavePhase('completed');
              setEmailStatusDetail('Email accepted by SMTP server');
            } else if (record.emailStatus === 'failed') {
              setSavePhase('email_failed');
              setEmailStatusDetail('Email delivery failed to mail server');
            }
          }

          if (record && record.rows) {
            setData(record.rows);
            setOriginalData(JSON.parse(JSON.stringify(record.rows)));
            setLockedShifts(record.lockedShifts || {});
            setEditedFields(record.editedFields || {});
          } else if (record && record.data && record.data.rows) {
            setData(record.data.rows);
            setOriginalData(JSON.parse(JSON.stringify(record.data.rows)));
            setLockedShifts(record.lockedShifts || record.data.lockedShifts || {});
            setEditedFields(record.editedFields || record.data.editedFields || {});
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
        console.warn('[PureSaltSieveAnalysis] Could not fetch existing data', err);
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

  // ── Real-time input change with decimal validation & shift locking ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isShiftDisabled(rowKey)) return; // Prevent edit if shift is disabled / locked

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    // Clear cell error if any
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });

    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isShiftDisabled]);

  const handleReset = () => {
    setData(buildEmptyData());
    setDate(getTodayAsiaKolkata());
    setErrors({});
    setSaveSuccess(false);
    setSavePhase('idle');
    setLastSavedRecord(null);
    setLastExcelData(null);
    setLockedShifts({});
    setEditedFields({});
    setOriginalData(null);
    showToast('Pure Salt Sieve Analysis form cleared.', 'info');
  };

  // Full dataset validation before opening confirmation modal
  const validate = () => {
    if (!date) {
      showToast('Analysis date is required.', 'error');
      return false;
    }

    const newErrors = {};
    let hasError = false;
    ROWS.forEach((r) => {
      PARAMETERS.forEach((p) => {
        const val = data[r.key][p.key];
        if (val !== '' && val !== null && isNaN(Number(val))) {
          newErrors[`${r.key}_${p.key}`] = 'Enter numbers only';
          hasError = true;
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  const handleSaveClick = () => {
    if (!validate()) {
      showToast('Please correct the validation errors before saving.', 'error');
      return;
    }

    const targetRows = ['shift1', 'shift2', 'shift3'];
    const isDiff = (oldRow, newRow) => {
      if (!oldRow && newRow) return true;
      if (oldRow && !newRow) return false;
      return Object.keys(newRow).some((k) => {
        let oldVal = oldRow[k] ?? null;
        let newVal = newRow[k] ?? null;
        if (newVal === '') newVal = null;
        if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
          return Number(oldVal) !== Number(newVal);
        }
        return String(oldVal) !== String(newVal);
      });
    };

    let toSave = [];
    let isFinalEdit = false;
    for (const key of targetRows) {
      const hasData = data[key] && Object.values(data[key]).some((val) => val !== null && val !== '');
      const canEdit = !isShiftDisabled(key);

      if (hasData && canEdit) {
        const diff = isDiff(originalData ? originalData[key] : null, data[key]);
        if (diff) {
          toSave.push({ key, name: shiftDisplayNames[key], values: data[key] });
          if (key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0) {
            isFinalEdit = true;
          }
        }
      }
    }

    if (toSave.length === 0) {
      showToast('No new or modified shift data found to save.', 'info');
      return;
    }

    if (toSave.length > 1) {
      showToast('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    setConfirmData({
      date,
      shifts: toSave,
      isFinalEdit,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (saving) return; // Prevent duplicate submission
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);

    // Close confirmation modal immediately to prevent modal freeze
    setShowConfirmModal(false);

    const shiftBeingSaved = confirmData?.shifts?.[0];
    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL Plant',
      analysisType: 'Pure Salt Sieve Analysis',
      shift: shiftBeingSaved ? shiftBeingSaved.name : 'All Shifts (I, II, III)',
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
      email: recipientEmail.trim(),
      recipientEmail: recipientEmail.trim(),
      rows: Object.fromEntries(
        ROWS.map((r) => [
          r.key,
          Object.fromEntries(
            PARAMETERS.map((p) => {
              const val = data[r.key][p.key];
              return [p.key, val !== '' && val !== null ? parseFloat(val) : null];
            })
          ),
        ])
      ),
    };

    let response;
    try {
      response = await api.post('/pure-salt-sieve-analysis', payload);

      if (response?.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (!response?.data?.success) {
        showToast(response?.data?.message || 'Unable to save the data. Please try again.', 'error');
        setSavePhase('idle');
        return;
      }

      const savedRecord = response.data.data;
      setLastSavedRecord(savedRecord);
      if (savedRecord?.lockedShifts) {
        setLockedShifts(savedRecord.lockedShifts);
      }
      if (savedRecord?.editedFields) {
        setEditedFields(savedRecord.editedFields);
      }
      if (savedRecord?.rows) {
        setOriginalData(JSON.parse(JSON.stringify(savedRecord.rows)));
      }

      // Check email status from server
      if (response.data?.emailRecipient) {
        setRecipientEmail(response.data.emailRecipient);
      }

      const emailRes = response.data?.emailNotification;
      const emailSent = response.data?.emailSent;
      const statusFromApi = response.data?.emailStatus;

      if (emailSent || statusFromApi === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(emailRes?.response || 'Delivered to SMTP server ✓');
        showToast?.('Saved — Email Sent ✓', 'success');
      } else if (statusFromApi === 'disabled') {
        setSavePhase('completed');
        showToast?.('Saved ✓', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailRes?.error || emailRes?.status || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
      }
      setSaveSuccess(true);
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      console.error('[PureSaltSieveAnalysis] Database save failed:', err);
      showToast(err.response?.data?.message || 'Unable to save the data. Please try again.', 'error');
    } finally {
      // Loading ALWAYS resets promptly on success, failure, or timeout
      setSaving(false);
    }
  };

  // ── Retry Email Dispatch Handler ──
  const handleRetryEmail = async () => {
    if (!lastSavedRecord?._id) {
      showToast('No saved record available to retry email.', 'error');
      return;
    }
    setSaving(true);
    setSavePhase('emailing');
    try {
      const response = await api.post(`/pure-salt-sieve-analysis/${lastSavedRecord._id}/retry-email`);
      if (response.data && (response.data.emailSent || response.data.emailStatus === 'sent')) {
        setSavePhase('completed');
        setEmailStatusDetail('Email accepted by SMTP server');
        showToast('Notification email sent successfully ✓', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data?.emailError || 'Email delivery failed');
        showToast('Email retry failed: ' + (response.data?.emailError || 'Server error'), 'error');
      }
    } catch (err) {
      setSavePhase('email_failed');
      const msg = err.response?.data?.message || err.response?.data?.emailError || err.message;
      setEmailStatusDetail(msg);
      showToast('Email retry failed: ' + msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header with Integrated Read-Only Date ────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Back + Title */}
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
                <Grid3X3 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">Pure Salt Sieve Analysis</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  PURE SALT SIEVE ANALYSIS
                </h1>
                <span className="text-[11px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">
                  II SHIFT SPEC
                </span>
              </div>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <LockedDateDisplay date={date} id="ps-sieve-date-display" badgeText="Operating Day" />

            {/* Actions */}
            {!isViewOnly ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-sieve-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <StatusSaveButton
                  id="btn-sieve-save"
                  saving={saving}
                  savePhase={savePhase}
                  saveSuccess={saveSuccess}
                  onClick={handleSaveClick}
                  alwaysShowSaveText={true}
                  defaultLabel="Save / Submit"
                  title="Save sieve analysis data and dispatch automated Excel report"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                  <Eye className="w-3.5 h-3.5 text-amber-600" />
                  <span>View-Only Mode</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner (Success, Pending, or Email Failed) ──────────────── */}
      <SaveStatusBanner
        id="sieve-status-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Pure Salt Sieve Analysis"
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
          <table className="w-full min-w-[760px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3.5 text-left text-xs font-extrabold uppercase tracking-wider w-36 sm:w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  B S S / Shift
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-4 py-3.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${p.colClass}`}
                  >
                    <span>{p.label}</span> <span className="text-[10px] text-blue-300 font-semibold lowercase">({p.unit})</span>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody className="divide-y divide-slate-200">
              {ROWS.map((row) => {
                const styles = getRowStyles(row.highlightType);
                return (
                  <tr
                    key={row.key}
                    className={`transition-colors duration-100 ${styles.row}`}
                  >
                    {/* Row label */}
                    <td className="px-4 py-2.5 align-middle">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold ${styles.label} whitespace-nowrap`}>
                            {row.label}
                          </span>
                          <span
                            className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}
                          >
                            {row.badgeText}
                          </span>
                          <RecordStatusBadge status={getShiftStatus(row.key)} />
                        </div>
                      </div>
                    </td>

                    {/* Parameter input cells */}
                    {PARAMETERS.map((param) => {
                      const cellVal = data[row.key][param.key];
                      const limit = getCellLimit(plantId, 'pure-salt-sieve', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      return (
                        <td key={param.key} className="px-3 py-2 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[50px]">
                            <div className="relative w-full max-w-[100px]">
                              {(() => {
                                const isDisabled = isShiftDisabled(row.key);

                                return (
                                  <input
                                    id={`sieve-input-${row.key}-${param.key}`}
                                    type="text"
                                    inputMode="decimal"
                                    readOnly={isDisabled}
                                    disabled={isDisabled}
                                    value={cellVal}
                                    onChange={(e) =>
                                      !isViewOnly && handleChange(row.key, param.key, e.target.value)
                                    }
                                    placeholder={isDisabled ? '—' : '0.0'}
                                    title={
                                      limit
                                        ? isOutOfLimit
                                          ? `OUT OF SIEVE LIMIT: ${cellVal}% (Allowed range: ${limit.formattedRange})`
                                          : hasValue
                                          ? `Normal: ${cellVal}% (Allowed range: ${limit.formattedRange})`
                                          : `Allowed range: ${limit.formattedRange}`
                                        : ''
                                    }
                                    className={`w-full mx-auto text-center text-xs font-mono font-bold px-2 py-1.5 rounded-lg border shadow-2xs transition-all ${
                                      isDisabled
                                        ? isOutOfLimit
                                          ? 'bg-rose-50 text-rose-900 border-rose-300 font-black cursor-default select-text'
                                          : 'bg-slate-50 text-slate-500 border-slate-200 cursor-default select-text opacity-80'
                                        : isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : styles.inputFocus
                                    }`}
                                    aria-label={`${row.label} ${param.label}`}
                                  />
                                );
                              })()}
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Tiny Compact EDITED badge beside / below modified field */}
                            {Boolean(
                              (editedFields &&
                                (editedFields[`${row.key}_${param.key}`] ||
                                  (editedFields.get && editedFields.get(`${row.key}_${param.key}`)))) ||
                                (row.key === 'shift3' && (lockedShifts.shift3Edits || 0) >= 1 && hasValue)
                            ) && (
                              <div
                                id={`psa-sieve-edited-badge-${row.key}-${param.key}`}
                                className="mt-0.5 inline-flex items-center px-1 py-[2px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
                                title="This parameter was modified and saved"
                              >
                                EDITED
                              </div>
                            )}

                            {/* Show allowed range badge when value is out of limit */}
                            {isOutOfLimit && limit && (
                              <div
                                id={`sieve-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.formattedRange}`}
                              >
                                <span>Limit: {limit.formattedRange}</span>
                              </div>
                            )}

                            {/* Subtle target hint when field is empty */}
                            {!isOutOfLimit && limit && !hasValue && !isViewOnly && (
                              <span
                                className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Allowed: ${limit.formattedRange}`}
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

        {/* Table footer hint */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            All sieve fractions are in <strong>percentage (%)</strong>. Tolerance limits apply strictly to <strong>II SHIFT</strong>.
          </p>
          <div className="text-[11px] text-slate-500 font-medium">
            One correction allowed after first save; saving the next shift locks the previous one.
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Confirm Save — Sieve Analysis</h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 transition text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                You are about to save the following data for <strong>{formatDateDisplay(confirmData.date)}</strong>.
              </p>
              {confirmData.isFinalEdit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs font-medium flex items-start gap-2 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Warning:</strong> You are about to save the final correction for this date. After this save succeeds, all three shifts will be locked and cannot be edited again.
                  </span>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                {confirmData.shifts.map((shift) => (
                  <div key={shift.key}>
                    <div className="text-xs font-bold text-slate-700 mb-1">{shift.name}</div>
                    <div className="text-xs text-slate-600 grid grid-cols-3 gap-2">
                      {Object.entries(shift.values).map(([k, v]) =>
                        v !== null && v !== '' ? (
                          <div key={k}>
                            {k.toUpperCase()}: <span className="font-semibold">{v}%</span>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
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

export default PureSaltSieveAnalysisPage;
