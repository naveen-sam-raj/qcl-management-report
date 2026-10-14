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
  Droplets,
  Factory,
  Lock,
  Mail,
  RefreshCw,
  X,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMETERS = [
  { key: 'nacl', label: 'NaCl', unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'ca',   label: 'Ca',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'mg',   label: 'Mg',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'so4',  label: 'SO₄',  unit: 'g/L', colClass: 'min-w-[130px]' },
];

const ROWS = [
  { key: 'tk109', label: 'TK 109', tankType: 'Storage Tank', highlightType: 'tk109' },
  { key: 'tk110', label: 'TK 110', tankType: 'Feed Tank',    highlightType: 'tk110' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

// Strict Current Date helper in Asia/Kolkata timezone
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
  if (highlightType === 'tk109') {
    return {
      row:        'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-blue-600',
      label:      'text-blue-950 font-extrabold tracking-tight',
      badge:      'bg-blue-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  return {
    row:        'bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-600',
    label:      'text-emerald-950 font-extrabold tracking-tight',
    badge:      'bg-emerald-600 text-white font-extrabold shadow-2xs',
    inputFocus: 'border-2 border-emerald-300 bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 text-slate-900 font-bold hover:border-emerald-400',
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const BrineAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Date is strictly locked to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [data, setData]                             = useState(buildEmptyData());
  const [originalData, setOriginalData]             = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [emailRetrying, setEmailRetrying]           = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lastSaved, setLastSaved]                   = useState(null);

  // Locking and Edit History States
  const [editCount, setEditCount]                   = useState(0);
  const [isLocked, setIsLocked]                     = useState(false);
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Fetch existing data on mount or date change
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/brine-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail) {
          setRecipientEmail(response.data.assignedOperatorEmail);
        }
        if (response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient);
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
            const fetchedRows =
              record.rows ||
              record.data?.rows ||
              (record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : null);

            if (fetchedRows && typeof fetchedRows === 'object') {
              const populated = buildEmptyData();
              ROWS.forEach((r) => {
                const tankData = fetchedRows[r.key] || {};
                PARAMETERS.forEach((p) => {
                  const val = tankData[p.key];
                  populated[r.key][p.key] = val !== undefined && val !== null ? String(val) : '';
                });
              });
              setData(populated);
              setOriginalData(JSON.parse(JSON.stringify(populated)));
            } else {
              setData(buildEmptyData());
              setOriginalData(null);
            }

            const recEditCount = record.editCount ?? record.data?.editCount ?? (record.isSaved ? 1 : 0);
            const recIsLocked = record.isLocked ?? record.data?.isLocked ?? (recEditCount >= 2);
            setEditCount(recEditCount);
            setIsLocked(recIsLocked);
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setEditCount(0);
            setIsLocked(false);
            setEditedFields({});
          }
        } else {
          setData(buildEmptyData());
          setOriginalData(null);
          setEditCount(0);
          setIsLocked(false);
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing Brine data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setEditCount(0);
        setIsLocked(false);
        setEditedFields({});
      }
    };

    fetchExistingData();
    return () => {
      active = false;
    };
  }, [date]);

  // Can user edit this date's analysis?
  const canEdit = !isViewOnly && !isLocked && editCount < 2;

  // ── Input change ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!canEdit) return;
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });

    setSaveSuccess(false);
  }, [canEdit]);

  // ── Reset Handler ──
  const handleReset = useCallback(() => {
    if (!canEdit) return;
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.('Brine analysis form reset.', 'info');
  }, [canEdit, originalData, showToast]);

  // ── Validation ──
  const validate = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    ROWS.forEach((r) => {
      PARAMETERS.forEach((p) => {
        const val = data[r.key][p.key];
        if (val !== '' && isNaN(Number(val))) {
          newErrors[`${r.key}_${p.key}`] = 'Enter numbers only';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [data]);

  // ── Save Trigger: Open Confirmation Modal ──
  const handleSaveClick = () => {
    if (!canEdit) {
      showToast?.('This analysis is locked and cannot be edited.', 'warning');
      return;
    }

    if (!validate()) {
      showToast?.('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasData = ROWS.some((r) =>
      PARAMETERS.some((p) => data[r.key][p.key] !== '')
    );
    if (!hasData) {
      showToast?.('Please enter at least one measurement value for TK 109 or TK 110.', 'warning');
      return;
    }

    const isFinalEdit = editCount === 1;

    setConfirmData({
      date,
      data,
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
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        plant: 'ACL',
        plantId: 'acl',
        analysisType: 'Brine Analysis',
        frequency: 'WEEK',
        unit: 'g/L',
        submittedBy: user?.name || 'Plant Operator',
        rows: Object.fromEntries(
          ROWS.map((r) => [
            r.key,
            Object.fromEntries(
              PARAMETERS.map((p) => {
                const val = data[r.key][p.key];
                return [p.key, val !== '' ? parseFloat(val) : null];
              })
            ),
          ])
        ),
      };

      const response = await api.post('/brine-analysis', payload);

      if (response?.data && response.data.success) {
        setSaveSuccess(true);
        setLastSaved(new Date().toLocaleTimeString());
        setOriginalData(JSON.parse(JSON.stringify(data)));

        if (response.data.recordId) {
          setRecordId(response.data.recordId);
        }
        if (response.data.data) {
          const rec = response.data.data;
          setEditCount(rec.editCount || 1);
          setIsLocked(rec.isLocked || (rec.editCount >= 2));
          if (rec.editedFields) setEditedFields(rec.editedFields);
        }
        if (response.data.emailRecipient) {
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
          setEmailStatusDetail(emailRes?.error || 'Email delivery failed');
          showToast?.('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
        }
      }
    } catch (err) {
      setSavePhase('idle');
      console.error('[BrineAnalysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Retry Email Dispatch ──
  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('Cannot retry email: Record ID is not available.', 'error');
      return;
    }
    setEmailRetrying(true);
    try {
      const response = await api.post(`/brine-analysis/${recordId}/retry-email`);
      if (response?.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Email sent successfully on retry.');
        showToast?.('Email resent successfully!', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response?.data?.error || 'Email delivery failed on retry.');
        showToast?.('Email retry failed: ' + (response?.data?.error || 'Rejected by server'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setSavePhase('email_failed');
      setEmailStatusDetail(msg);
      showToast?.('Retry Email Error: ' + msg, 'error');
    } finally {
      setEmailRetrying(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans">
      {/* ── Breadcrumb Header with Locked Current Date ──────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
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
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">Brine Analysis</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  BRINE ANALYSIS
                </h1>
                <span className="text-[11px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">
                  WEEK
                </span>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                    <Lock className="w-3 h-3 text-slate-500" /> Locked (Max Edits Reached)
                  </span>
                ) : editCount === 1 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Edit Mode (1 Edit Remaining)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Initial Entry
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Locked Current-Date Section */}
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

            {lastSaved && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Saved at {lastSaved}
              </span>
            )}

            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <button
                  id="btn-brine-reset"
                  onClick={handleReset}
                  disabled={saving || emailRetrying}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              {!isViewOnly && (
                <button
                  id="btn-brine-save"
                  onClick={handleSaveClick}
                  disabled={saving || emailRetrying || !canEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
                  title="Save brine analysis"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : isLocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Locked</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{editCount === 0 ? 'Save / Submit' : 'Save Final Edit'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Banner for Email Dispatch State ── */}
      {savePhase === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-emerald-900 text-xs animate-fadeIn shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-extrabold">Saved — Email Sent ✓</span>
              <span className="text-emerald-700 ml-1.5">
                Delivered to registered ACL operator ({recipientEmail || 'assigned user'}).
              </span>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
            {emailStatusDetail}
          </span>
        </div>
      )}

      

      {savePhase === 'email_failed' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-rose-900 text-xs animate-fadeIn shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span className="font-extrabold">Saved — Email Failed</span>
              <span className="text-rose-700 ml-1.5">
                Analysis data is safely saved in the database, but email delivery to{' '}
                <strong>{recipientEmail || 'operator'}</strong> encountered an issue: {emailStatusDetail}
              </span>
            </div>
          </div>
          <button
            onClick={handleRetryEmail}
            disabled={emailRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition shadow-2xs cursor-pointer shrink-0 disabled:opacity-60"
            title="Retry sending notification email"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${emailRetrying ? 'animate-spin' : ''}`} />
            <span>{emailRetrying ? 'Retrying...' : 'Retry Email'}</span>
          </button>
        </div>
      )}

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && savePhase !== 'email_failed' && savePhase !== 'completed' && (
        <div
          id="brine-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              Brine Analysis (TK 109, TK 110) for <strong>{formatDateDisplay(date)}</strong> has been recorded.
            </span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 transition text-base leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Analysis Table Card with Tolerance Limits & EDITED Badges ─────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-6 py-3.5 text-left text-xs font-extrabold uppercase tracking-wider w-44 sm:w-52 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Parameter / Tank
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-6 py-3.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
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
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center gap-2.5 mt-1">
                        <span className={`text-xs font-bold ${styles.label} whitespace-nowrap`}>
                          {row.label}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}
                        >
                          {row.tankType}
                        </span>
                      </div>
                    </td>

                    {/* Parameter input cells (Tolerance / Limit Validation & EDITED Badges) */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key][param.key];
                      const isFormatError = !!errors[fieldKey];
                      const formatErrorMessage = errors[fieldKey];
                      const isFieldEdited = !!editedFields[fieldKey];

                      const limit = getCellLimit(plantId, 'brine', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      return (
                        <td key={param.key} className="px-6 py-3.5 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative w-full max-w-[125px]">
                              <input
                                id={`brine-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  handleChange(row.key, param.key, e.target.value)
                                }
                                placeholder="0.00"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} g/L (Allowed range: ${limit.formattedRange}, Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                                      : hasValue
                                      ? `Normal: ${cellVal} g/L (Allowed range: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange} (Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                                    : ''
                                }
                                className={`w-full max-w-[125px] mx-auto text-center text-sm font-mono font-bold px-3 py-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  !canEdit
                                    ? 'border-2 border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                    : cellVal !== ''
                                    ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                                    : styles.inputFocus
                                }`}
                                aria-label={`${row.label} ${param.label}`}
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

                            {/* EDITED Badge */}
                            {isFieldEdited && (
                              <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-amber-500 text-white shadow-2xs animate-fadeIn">
                                EDITED
                              </span>
                            )}

                            {/* Error Message if invalid number format */}
                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span className="whitespace-nowrap">{formatErrorMessage}</span>
                              </div>
                            )}

                            {/* Show allowed range badge when value is out of limit */}
                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`brine-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.formattedRange}`}
                              >
                                <span>Limit: {limit.formattedRange}</span>
                              </div>
                            )}

                            {/* Normal indicator when within limit */}
                            {!isFormatError && !isOutOfLimit && limit && hasValue && (
                              <span
                                className="text-[9.5px] text-emerald-600 font-bold mt-1 tracking-tight flex items-center gap-0.5 animate-fadeIn"
                                title={`Value within normal range (${limit.formattedRange})`}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" /> Normal
                              </span>
                            )}

                            {/* Subtle target hint when field is empty */}
                            {!isFormatError && !isOutOfLimit && limit && !hasValue && (
                              <span
                                className="text-[10px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Target: ${limit.formattedTarget} ${limit.formattedTolerance}`}
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
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            All values are in <strong>grams per liter (g/L)</strong>. Frequency: <strong>WEEK</strong>. Enter analysis values for <strong>TK 109</strong> and <strong>TK 110</strong>. Numeric values only. Leave blank if not applicable.
          </p>
        </div>
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-400/30">
                  <Droplets className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-100">
                    Confirm Brine Analysis Save
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    ACL Plant — {formatDateDisplay(confirmData.date)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              {confirmData.isFinalEdit && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 px-3.5 py-2.5 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Final Edit Warning:</span> This is your 2nd and final permitted edit for today’s record. Once saved, this record will be permanently locked against further edits.
                  </div>
                </div>
              )}

              {/* Data Summary */}
              {ROWS.map((row) => (
                <div key={row.key}>
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-blue-600" />
                    <span>{row.label} ({row.tankType})</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {PARAMETERS.map((p) => {
                      const val = confirmData.data[row.key][p.key];
                      return (
                        <div key={p.key} className="flex justify-between items-center py-1 border-b border-slate-200/60 last:border-0">
                          <span className="font-semibold text-slate-600">{p.label}:</span>
                          <span className="font-mono font-bold text-blue-900">
                            {val !== '' ? `${val} g/L` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Notification Notice */}
              <div className="bg-blue-50 border border-blue-200 text-blue-900 px-3.5 py-2.5 rounded-xl flex items-start gap-2">
                <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Email Notification:</span> Saving will automatically generate the official report Excel sheet and dispatch an email to the registered ACL Plant operator ({recipientEmail || 'assigned user'}).
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm cursor-pointer disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Confirm & Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrineAnalysisPage;
