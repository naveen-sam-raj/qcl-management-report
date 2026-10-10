import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  PURE_SALT_LIMIT_VALIDATION_ENABLED,
  getCellLimit,
  validateCellValue,
  validateFullDataset,
} from '../../services/analysisValidation';
import {
  ArrowLeft,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FlaskConical,
  Factory,
  ShieldAlert,
  Eye,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMETERS = [
  { key: 'nacl', label: 'NaCl %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'ca', label: 'Ca %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'mg', label: 'Mg %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'so4', label: 'SO₄ %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'ir', label: 'IR %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'h2o', label: 'H₂O %', unit: '%', colClass: 'min-w-[105px]' },
];

const ROWS = [
  { key: 'rawSalt', label: 'RAW SALT', highlight: true, highlightType: 'raw' },
  { key: 'shift1', label: 'I SHIFT', highlight: false, highlightType: 'shift1' },
  { key: 'shift2', label: 'II SHIFT', highlight: false, highlightType: 'shift2' },
  { key: 'shift3', label: 'III SHIFT', highlight: false, highlightType: 'shift3' },
  { key: 'composition', label: 'COMPOSITION', highlight: true, highlightType: 'comp' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Row style helpers (Vibrant, High-Contrast Industrial Palette) ──────────────

const getRowStyles = (highlightType) => {
  if (highlightType === 'raw') {
    return {
      row: 'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-blue-600',
      label: 'text-blue-950 font-extrabold tracking-tight',
      badge: 'bg-blue-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift1') {
    return {
      row: 'bg-white hover:bg-blue-50/30 border-l-4 border-l-sky-500',
      label: 'text-slate-900 font-bold tracking-tight',
      badge: null,
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift2') {
    return {
      row: 'bg-blue-50/40 hover:bg-blue-100/50 border-l-4 border-l-indigo-500',
      label: 'text-slate-900 font-bold tracking-tight',
      badge: null,
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift3') {
    return {
      row: 'bg-white hover:bg-indigo-50/30 border-l-4 border-l-purple-500',
      label: 'text-slate-900 font-bold tracking-tight',
      badge: null,
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'comp') {
    return {
      row: 'bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-600',
      label: 'text-emerald-950 font-extrabold tracking-tight',
      badge: 'bg-emerald-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-emerald-300 bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 text-slate-900 font-bold hover:border-emerald-400',
    };
  }
  return {
    row: 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent',
    label: 'text-slate-800 font-semibold',
    badge: null,
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PureSaltAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── State ──
  const [date, setDate] = useState('');
  const [data, setData] = useState(buildEmptyData());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // EmailJS & Excel Reporting States
  const [recipientEmail, setRecipientEmail] = useState(
    user?.email || import.meta.env.VITE_DEFAULT_REPORT_RECIPIENT_EMAIL || ''
  );
  // 'idle' | 'saving' | 'generating' | 'emailing' | 'completed' | 'email_failed'
  const [savePhase, setSavePhase] = useState('idle');
  const [lastSavedRecord, setLastSavedRecord] = useState(null);
  const [lastExcelData, setLastExcelData] = useState(null);

    // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    
    let active = true;
    setData(buildEmptyData()); // Clear stale data immediately while loading

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/pure-salt-analysis?date=${date}`);
        if (!active) return; // Ignore response if date changed
        
        if (response.data && response.data.success && response.data.data) {
          const records = Array.isArray(response.data.data) ? response.data.data : [response.data.data];
          const record = records.find(r => r.date === date);
          
          if (record && record.rows) {
            setData(record.rows);
          } else if (record && record.data && !Array.isArray(record.data)) {
            setData(record.data);
          } else if (record && Object.keys(record).length > 0 && !record.shifts && !record.readings && !record.rows && !record.data && !record.parameters) {
            setData(record);
          } else {
            setData(buildEmptyData());
          }
        } else {
          setData(buildEmptyData());
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
      }
    };
    fetchExistingData();
    
    return () => {
      active = false;
    };
  }, [date]);


  // ── Real-time input change (Accepts exact values without limits/tolerances) ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    // Clear global success on any edit
    setSaveSuccess(false);
  }, []);

  const handleReset = () => {
    setData(buildEmptyData());
    setDate('');
    setErrors({});
    setSaveSuccess(false);
    setDateError(false);
    setSavePhase('idle');
    setLastSavedRecord(null);
    setLastExcelData(null);
    showToast('Form cleared successfully.', 'info');
  };

  // ── Form validation before submission (respects PURE_SALT_LIMIT_VALIDATION_ENABLED) ──
  const validate = () => {
    if (!date) {
      setDateError(true);
      showToast('Please select an analysis date before saving.', 'error');
      return false;
    }
    setDateError(false);

    // Basic numeric check across all entered values
    let hasFormatError = false;
    Object.entries(data || {}).forEach(([rowKey, rowVals]) => {
      Object.entries(rowVals || {}).forEach(([paramKey, val]) => {
        if (val !== '' && val !== null && val !== undefined) {
          const str = String(val).trim();
          if (!/^-?\d*\.?\d+$/.test(str) || isNaN(parseFloat(str))) {
            hasFormatError = true;
          }
        }
      });
    });

    if (hasFormatError) {
      showToast('Please ensure all entered parameter values are valid numbers.', 'error');
      return false;
    }

    // Validate tolerance limits if enabled (flags out-of-limits without blocking DB save)
    if (PURE_SALT_LIMIT_VALIDATION_ENABLED) {
      const datasetValidation = validateFullDataset(data, plantId, 'pure-salt');
      if (datasetValidation.hasFormatError) {
        showToast('Please ensure all entered parameter values are valid numbers.', 'error');
        return false;
      }
    }

    return true;
  };

  // ── Retry Email Dispatch via backend if initial email failed ──
  const handleRetryEmail = async () => {
    if (!lastSavedRecord?._id) {
      showToast('No saved report available to re-send.', 'error');
      return;
    }

    setSaving(true);
    setSavePhase('emailing');

    try {
      const retryRes = await api.post(`/pure-salt-analysis/${lastSavedRecord._id}/retry-email`, {
        recipientEmail: recipientEmail.trim(),
      });

      if (retryRes.data?.success && retryRes.data?.emailSent) {
        setSavePhase('completed');
        setSaveSuccess(true);
        showToast('Saved & Emailed Successfully ✓', 'success');

        setTimeout(() => {
          setSaving(false);
          setSavePhase('idle');
        }, 4000);
      } else {
        setSaving(false);
        setSavePhase('email_failed');
        showToast(retryRes.data?.message || 'Data saved and Excel generated, but email sending failed.', 'warning');
      }
    } catch (err) {
      setSaving(false);
      setSavePhase('email_failed');
      showToast('Data saved and Excel generated, but email sending failed.', 'warning');
    }
  };

  // ── Section 2 & 3: Save to MongoDB, Generate Excel & Send via Nodemailer Backend ──
  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    // Stage 1: "Saving..."
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);

    const payload = {
      date,
      plant: 'ACL Plant',
      analysisType: 'Pure Salt Analysis',
      shift: 'All Shifts (I, II, III)',
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
              return [p.key, val !== '' ? parseFloat(val) : null];
            })
          ),
        ])
      ),
    };

    let response;
    try {
      // Step: Send data to backend API (handles DB Save + ExcelJS Generate + Nodemailer Email with .xlsx attachment)
      response = await api.post('/pure-salt-analysis', payload);
    } catch (err) {
      setSaving(false);
      setSavePhase('idle');
      console.error('[PureSaltAnalysis] Database save failed:', err);

      // Section 12: If MongoDB save fails: "Unable to save the data. Please try again."
      showToast('Unable to save the data. Please try again.', 'error');
      return;
    }

    // Step: Confirm MongoDB save successful
    if (!response?.data?.success) {
      setSaving(false);
      setSavePhase('idle');
      showToast('Unable to save the data. Please try again.', 'error');
      return;
    }

    const savedRecord = response.data.data;
    const excelInfo = response.data.excel;
    setLastSavedRecord(savedRecord);
    setLastExcelData(excelInfo);

    // Stage 2: "Generating Report..."
    setSavePhase('generating');
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Stage 3: "Sending Email..."
    setSavePhase('emailing');
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Stage 4: Final Status Messaging (Section 3, 9 & 12)
    if (response.data.emailSent) {
      setSavePhase('completed');
      setSaveSuccess(true);
      showToast('Saved & Emailed Successfully ✓', 'success');

      // Reset button state to idle after feedback display
      setTimeout(() => {
        setSaving(false);
        setSavePhase('idle');
      }, 5000);
    } else {
      // MongoDB save succeeded, but email sending failed
      setSaving(false);
      setSavePhase('email_failed');
      setSaveSuccess(true);
      const warnMsg = response.data.message || 'Data saved and Excel generated, but email sending failed.';
      showToast(warnMsg, 'warning');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Header Card (Pure Salt Analysis Tab) with Integrated Date Section ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Plant breadcrumb + Pure Salt Analysis Title */}
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
              <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-blue-600 font-semibold">Pure Salt Analysis</span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
              PURE SALT ANALYSIS
            </h1>
          </div>
          </div>

          {/* Right: Date Section, Recipient Email, Test & Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
              <label
                htmlFor="psa-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="psa-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setDateError(false);
                    setSaveSuccess(false);
                  }}
                  className={`pl-7 pr-2 py-1 text-xs font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 bg-white ${
                    dateError
                      ? 'border-red-400 bg-red-50 focus:ring-red-400'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                />
              </div>
              {date && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded border border-blue-200 hidden md:inline-block">
                  {formatDateDisplay(date)}
                </span>
              )}
              {dateError && (
                <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
                  <AlertCircle className="w-3 h-3" /> Required
                </span>
              )}
            </div>

            {/* Actions */}
            {!isViewOnly ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-psa-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                {savePhase === 'email_failed' && (
                  <button
                    id="btn-psa-retry-email"
                    type="button"
                    onClick={handleRetryEmail}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition shadow-2xs cursor-pointer"
                    title="Retry sending report email with attached Excel file"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                    <span>Retry Email</span>
                  </button>
                )}

                <button
                  id="btn-psa-save"
                  onClick={handleSave}
                  disabled={saving}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs disabled:opacity-75 cursor-pointer ${
                    savePhase === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : savePhase === 'email_failed'
                      ? 'bg-slate-700 hover:bg-slate-800'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  title="Save analysis data and dispatch automated Excel report"
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
                      : savePhase === 'generating'
                      ? 'Generating Report...'
                      : savePhase === 'emailing'
                      ? 'Sending Email...'
                      : savePhase === 'completed'
                      ? 'Saved & Emailed Successfully ✓'
                      : 'Save / Submit'}
                  </span>
                </button>
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

      {/* ── Status Banner (Success or Partial Email Failure) ────────────────── */}
      {saveSuccess && (
        <div
          id="psa-status-banner"
          className={`flex items-start gap-3 p-3 rounded-xl border shadow-xs animate-fadeIn ${
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
          <div className="text-xs flex-1">
            <div className="font-bold">
              {savePhase === 'email_failed'
                ? 'Data saved and Excel generated, but email sending failed.'
                : 'Saved & Emailed Successfully ✓'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 text-[11px]">
              <span>
                Pure Salt Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded in database.
              </span>
              {lastExcelData?.fileName && (
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                  <span>Attached: {lastExcelData.fileName}</span>
                </span>
              )}
              {recipientEmail && (
                <span className="text-slate-500">
                  Recipient: <strong>{recipientEmail}</strong>
                </span>
              )}
            </div>
          </div>
          {savePhase === 'email_failed' && (
            <button
              onClick={handleRetryEmail}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 rounded border border-amber-400/50 transition cursor-pointer shrink-0"
            >
              Retry Email
            </button>
          )}
          <button
            onClick={() => setSaveSuccess(false)}
            className="text-slate-400 hover:text-slate-600 transition text-base leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 sm:w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Parameter / Shift
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                      } ${p.colClass}`}
                  >
                    {p.label}
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
                    <td className="px-5 py-2.5 align-middle">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${styles.label} whitespace-nowrap`}>
                          {row.label}
                        </span>
                        {row.highlight && (!isViewOnly || row.highlightType === 'comp') && (
                          <span
                            className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}
                          >
                            {row.highlightType === 'raw' ? 'Input' : 'Final'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Parameter input cells (Tolerance / Limit Validation) */}
                    {PARAMETERS.map((param) => {
                      const cellVal = data[row.key][param.key];
                      const limit = getCellLimit(plantId, 'pure-salt', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      return (
                        <td key={param.key} className="px-3 py-2 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[50px]">
                            <div className="relative w-full max-w-[98px]">
                              <input
                                id={`psa-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                readOnly={isViewOnly}
                                disabled={isViewOnly}
                                value={cellVal}
                                onChange={(e) =>
                                  !isViewOnly && handleChange(row.key, param.key, e.target.value)
                                }
                                placeholder={isViewOnly ? '—' : '0.00'}
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed range: ${limit.min.toFixed(2)}% – ${limit.max.toFixed(2)}%, Target: ${limit.target.toFixed(2)} ± ${limit.tolerance.toFixed(2)}%)`
                                      : hasValue
                                      ? `Normal: ${cellVal}% (Allowed range: ${limit.min.toFixed(2)}% – ${limit.max.toFixed(2)}%)`
                                      : `Allowed range: ${limit.min.toFixed(2)}% – ${limit.max.toFixed(2)}% (Target: ${limit.target.toFixed(2)} ± ${limit.tolerance.toFixed(2)}%)`
                                    : ''
                                }
                                className={`w-full mx-auto text-center text-xs font-mono font-bold px-2 py-1.5 rounded-lg border shadow-2xs transition-all ${
                                  isViewOnly
                                    ? isOutOfLimit
                                      ? 'bg-rose-50 text-rose-900 border-rose-300 font-black cursor-default select-text'
                                      : 'bg-slate-50 text-slate-800 border-slate-200 cursor-default select-text'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : styles.inputFocus
                                }`}
                                aria-label={`${row.label} ${param.label}`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Show actual allowed range when value is out of range */}
                            {isOutOfLimit && limit && (
                              <div
                                id={`psa-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.min.toFixed(2)}% to ${limit.max.toFixed(2)}%`}
                              >
                                <span>Limit: {limit.min.toFixed(2)}–{limit.max.toFixed(2)}%</span>
                              </div>
                            )}

                            {/* Subtle target hint when field is empty */}
                            {!isOutOfLimit && limit && !hasValue && !isViewOnly && (
                              <span
                                className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Target: ${limit.target.toFixed(2)} ± ${limit.tolerance.toFixed(2)}%`}
                              >
                                {limit.min.toFixed(2)}–{limit.max.toFixed(2)}%
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
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            {isViewOnly ? (
              <span>All values displayed in <strong>percentage (%)</strong>. Read-only specifications view.</span>
            ) : (
              <span>All values are in <strong>percentage (%)</strong>. Enter numeric values only. Leave blank if not applicable.</span>
            )}
          </p>
        </div>
      </div>

    </div>
  );
};

export default PureSaltAnalysisPage;
