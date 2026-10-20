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
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
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
  Lock,
  Pencil,
  Clock,
  Sliders,
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

const SHIFT_DISPLAY_NAMES = {
  rawSalt: 'RAW SALT',
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
  composition: 'COMPOSITION',
};

const buildEmptyData = () =>
  Object.fromEntries(
    ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

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

  // Shift display names mapping for header badges, modals, and toasts
  const shiftDisplayNames = SHIFT_DISPLAY_NAMES;

  // ── State (Date is locked strictly to Today's date in Asia/Kolkata) ──
  const [date, setDate] = useState(() => getTodayAsiaKolkata());
  const [data, setData] = useState(buildEmptyData());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [lockedShifts, setLockedShifts] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [originalData, setOriginalData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Shift-Wise Input Locking: null | 'shift1' | 'shift2' | 'shift3'
  // Defaults to 'shift1' so Shift 1 is immediately open and editable on load
  const [activeEditingShift, setActiveEditingShift] = useState('shift1');

  // Helper to determine the active editable shift based on lock state
  const resolveActiveShift = useCallback((lShifts = {}) => {
    const areAllShiftsLocked = Boolean(lShifts.shift3Saved && (lShifts.shift3Edits || 0) >= 1);
    if (areAllShiftsLocked) return null;
    if (!lShifts.shift1Saved || !lShifts.shift1) return 'shift1';
    if (!lShifts.shift2Saved || !lShifts.shift2) return 'shift2';
    if (!lShifts.shift3Saved || (lShifts.shift3Edits || 0) === 0) return 'shift3';
    return null;
  }, []);

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
    setActiveEditingShift('shift1'); // Default to shift1 for fresh input

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/pure-salt-analysis?date=${date}`);
        if (!active) return; // Ignore response if date changed
        
        if (response.data && response.data.success && response.data.data) {
          const records = Array.isArray(response.data.data) ? response.data.data : [response.data.data];
          const record = records.find(r => r.date === date);
          
          if (record && record.rows) {
            setData(record.rows);
            setOriginalData(JSON.parse(JSON.stringify(record.rows)));
            setLockedShifts(record.lockedShifts || {});
            setEditedFields(record.editedFields || {});
            setActiveEditingShift(resolveActiveShift(record.lockedShifts || {}));
          } else if (record && record.data && !Array.isArray(record.data)) {
            setData(record.data);
            setOriginalData(JSON.parse(JSON.stringify(record.data)));
            setLockedShifts(record.lockedShifts || {});
            setEditedFields(record.editedFields || {});
            setActiveEditingShift(resolveActiveShift(record.lockedShifts || {}));
          } else if (record && Object.keys(record).length > 0 && !record.shifts && !record.readings && !record.rows && !record.data && !record.parameters) {
            setData(record);
            setOriginalData(JSON.parse(JSON.stringify(record)));
            setLockedShifts(record.lockedShifts || {});
            setEditedFields(record.editedFields || {});
            setActiveEditingShift(resolveActiveShift(record.lockedShifts || {}));
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
            setActiveEditingShift('shift1');
          }
        } else {
          setData(buildEmptyData());
          setOriginalData(null);
          setLockedShifts({});
          setEditedFields({});
          setActiveEditingShift('shift1');
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setLockedShifts({});
        setEditedFields({});
        setActiveEditingShift('shift1');
      }
    };
    fetchExistingData();
    
    return () => {
      active = false;
    };
  }, [date, resolveActiveShift]);


  // ── Real-time input change (Accepts exact values without limits/tolerances) ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (lockedShifts[rowKey]) return; // Prevent edit if locked
    if (rowKey === 'shift2' && !lockedShifts.shift1Saved) return; // Enforce sequence
    if (rowKey === 'shift3' && !lockedShifts.shift2Saved) return; // Enforce sequence

    // Shift-Wise Locking: shifts can only be edited when actively selected
    if (['shift1', 'shift2', 'shift3'].includes(rowKey) && activeEditingShift !== rowKey) {
      return;
    }

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    // Clear global success on any edit
    setSaveSuccess(false);
    setSavePhase('idle');
  }, [lockedShifts, activeEditingShift]);

  const handleReset = () => {
    setData(buildEmptyData());
    setDate(getTodayAsiaKolkata());
    setActiveEditingShift('shift1');
    setErrors({});
    setSaveSuccess(false);
    setDateError(false);
    setSavePhase('idle');
    setLastSavedRecord(null);
    setLastExcelData(null);
    setLockedShifts({});
    setEditedFields({});
    setOriginalData(null);
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

  const handleSaveClick = () => {
    if (!validate()) return;
    
    const targetRows = ['rawSalt', 'shift1', 'shift2', 'shift3', 'composition'];
    const shiftDisplayNames = {
      rawSalt: 'RAW SALT',
      shift1: 'I SHIFT',
      shift2: 'II SHIFT',
      shift3: 'III SHIFT',
      composition: 'COMPOSITION'
    };
    
    const isDiff = (oldRow, newRow) => {
      if (!oldRow && newRow) return true;
      if (oldRow && !newRow) return false;
      return Object.keys(newRow).some(k => {
        let oldVal = oldRow[k];
        if (oldVal === undefined) oldVal = null;
        let newVal = newRow[k];
        if (newVal === undefined || newVal === '') newVal = null;
        return String(oldVal) !== String(newVal);
      });
    };
    
    let toSave = [];
    let isFinalEdit = false;
    for (const key of targetRows) {
      const isShift = ['shift1', 'shift2', 'shift3'].includes(key);
      const hasData = data[key] && Object.values(data[key]).some(val => val !== null && val !== '');
      const canEdit = !lockedShifts[key] &&
        !(key === 'shift2' && !lockedShifts.shift1Saved) &&
        !(key === 'shift3' && !lockedShifts.shift2Saved) &&
        (!isShift || activeEditingShift === key);
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
      if (!activeEditingShift) {
        showToast('Please select an available shift to edit first, or enter RAW SALT / COMPOSITION.', 'info');
      } else {
        showToast(`No modified changes found in ${shiftDisplayNames[activeEditingShift]} to save.`, 'info');
      }
      return;
    }
    
    setConfirmData({
      date,
      shifts: toSave,
      isFinalEdit
    });
    setShowConfirmModal(true);
  };

  // ── Section 2 & 3: Save to MongoDB, Generate Excel & Send via Nodemailer Backend ──
  const handleConfirmSave = async () => {
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

      // Step: Confirm MongoDB save successful
      if (!response?.data?.success) {
        showToast(response?.data?.message || 'Unable to save the data. Please try again.', 'error');
        setShowConfirmModal(false);
        setSavePhase('idle');
        return;
      }

      const savedRecord = response.data.data;
      const excelInfo = response.data.excel;
      setLastSavedRecord(savedRecord);
      setLastExcelData(excelInfo);
      if (savedRecord?.lockedShifts) {
        setLockedShifts(savedRecord.lockedShifts);
      }
      if (savedRecord?.editedFields) {
        setEditedFields(savedRecord.editedFields);
      }
      if (savedRecord?.rows) {
        setOriginalData(JSON.parse(JSON.stringify(savedRecord.rows)));
      }
      setActiveEditingShift(resolveActiveShift(savedRecord?.lockedShifts || {}));
      setShowConfirmModal(false);

      setSaveSuccess(true);
      setSavePhase('completed');
      showToast(response.data?.message || 'Saved in MongoDB successfully ✓', 'success');
    } catch (err) {
      setSavePhase('idle');
      console.error('[PureSaltAnalysis] Database save failed:', err);
      // If MongoDB save fails: "Unable to save the data. Please try again."
      showToast(err.response?.data?.message || 'Unable to save the data. Please try again.', 'error');
      setShowConfirmModal(false);
    } finally {
      setSaving(false);
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
            {/* Integrated Date Section - Allows historical navigation and current date entry */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="psa-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="psa-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSaveSuccess(false);
                    setSavePhase('idle');
                  }}
                  className="pl-2.5 pr-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-slate-700 bg-white shadow-2xs hover:border-slate-400 transition"
                  required
                />
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-blue-800 bg-blue-100/90 px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                {formatDateDisplay(date)}
              </span>
              {date === getTodayAsiaKolkata() && (
                <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded uppercase tracking-wider border border-emerald-200 shadow-2xs">
                  TODAY
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

                <StatusSaveButton
                  id="btn-psa-save"
                  saving={saving}
                  savePhase={savePhase}
                  saveSuccess={saveSuccess}
                  onClick={handleSaveClick}
                  title="Save analysis data and dispatch automated Excel report"
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

      {/* ── Status Banner (Success or Partial Email Failure) ────────────────── */}
      <SaveStatusBanner
        id="psa-status-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Pure Salt Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={savePhase === 'email_failed' ? 'Email delivery failed' : ''}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* ── Shift-Wise Input Editing Control Bar ────────────────────────── */}
        {!isViewOnly && (
          <div className="px-5 py-3 bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 tracking-tight flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                <span>Shift Input Mode:</span>
              </span>
              {activeEditingShift ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-blue-600 text-white shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                  Editing {shiftDisplayNames[activeEditingShift] || activeEditingShift}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-200 text-slate-700 shadow-2xs">
                  <Lock className="w-3 h-3 text-slate-500" />
                  All Shifts Read-Only (Select a shift to edit)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Read-Only Mode Button */}
              <button
                type="button"
                onClick={() => setActiveEditingShift(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
                  activeEditingShift === null
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
                title="Lock all shifts in read-only mode"
              >
                Read-Only
              </button>

              {/* I SHIFT Button */}
              {(() => {
                const isLocked = Boolean(lockedShifts.shift1);
                const isEligible = !isLocked;
                const isActive = activeEditingShift === 'shift1';
                return (
                  <button
                    type="button"
                    id="btn-psa-select-bar-shift1"
                    disabled={!isEligible}
                    onClick={() => setActiveEditingShift(isActive ? null : 'shift1')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                        : isLocked
                        ? 'bg-slate-100 text-slate-400 border border-slate-200'
                        : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {isLocked ? <Lock className="w-3 h-3 text-slate-400" /> : <Pencil className="w-3 h-3" />}
                    <span>I SHIFT</span>
                    {isLocked && <span className="text-[10px] text-slate-400 font-normal">(Locked)</span>}
                    {isActive && <span className="text-[10px] text-blue-100 font-normal">Active</span>}
                  </button>
                );
              })()}

              {/* II SHIFT Button */}
              {(() => {
                const isLocked = Boolean(lockedShifts.shift2);
                const isWaiting = !lockedShifts.shift1Saved;
                const isEligible = !isLocked && !isWaiting;
                const isActive = activeEditingShift === 'shift2';
                return (
                  <button
                    type="button"
                    id="btn-psa-select-bar-shift2"
                    disabled={!isEligible}
                    onClick={() => setActiveEditingShift(isActive ? null : 'shift2')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                        : isLocked
                        ? 'bg-slate-100 text-slate-400 border border-slate-200'
                        : isWaiting
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-3 h-3 text-slate-400" />
                    ) : isWaiting ? (
                      <Clock className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Pencil className="w-3 h-3" />
                    )}
                    <span>II SHIFT</span>
                    {isLocked && <span className="text-[10px] text-slate-400 font-normal">(Locked)</span>}
                    {isWaiting && <span className="text-[10px] text-amber-700 font-normal">(Waiting)</span>}
                    {isActive && <span className="text-[10px] text-blue-100 font-normal">Active</span>}
                  </button>
                );
              })()}

              {/* III SHIFT Button */}
              {(() => {
                const isLocked = Boolean(lockedShifts.shift3);
                const isWaiting = !lockedShifts.shift2Saved;
                const isFinalUsed = Boolean(lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1);
                const isEligible = !isLocked && !isWaiting && !isFinalUsed;
                const isActive = activeEditingShift === 'shift3';
                return (
                  <button
                    type="button"
                    id="btn-psa-select-bar-shift3"
                    disabled={!isEligible}
                    onClick={() => setActiveEditingShift(isActive ? null : 'shift3')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                        : isLocked || isFinalUsed
                        ? 'bg-slate-100 text-slate-400 border border-slate-200'
                        : isWaiting
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {isLocked || isFinalUsed ? (
                      <Lock className="w-3 h-3 text-slate-400" />
                    ) : isWaiting ? (
                      <Clock className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Pencil className="w-3 h-3" />
                    )}
                    <span>III SHIFT</span>
                    {isLocked && <span className="text-[10px] text-slate-400 font-normal">(Locked)</span>}
                    {isWaiting && <span className="text-[10px] text-amber-700 font-normal">(Waiting)</span>}
                    {isFinalUsed && <span className="text-[10px] text-slate-400 font-normal">(Final Used)</span>}
                    {isActive && <span className="text-[10px] text-blue-100 font-normal">Active</span>}
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-48 sm:w-56 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
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
                    <td className="px-4 py-2.5 align-middle">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          {(() => {
                            let status = 'NEW';
                            let bg = 'bg-indigo-100 text-indigo-700';

                            if (lockedShifts[row.key]) {
                              status = 'Locked';
                              bg = 'bg-slate-200 text-slate-700';
                            } else {
                              if (row.key === 'shift1') {
                                if (lockedShifts.shift1Saved) {
                                  status = 'Editable';
                                  bg = 'bg-blue-100 text-blue-700';
                                }
                              } else if (row.key === 'shift2') {
                                if (!lockedShifts.shift1Saved) {
                                  status = 'Waiting';
                                  bg = 'bg-amber-100 text-amber-700';
                                } else if (lockedShifts.shift2Saved) {
                                  status = 'Editable';
                                  bg = 'bg-blue-100 text-blue-700';
                                }
                              } else if (row.key === 'shift3') {
                                if (!lockedShifts.shift2Saved) {
                                  status = 'Waiting';
                                  bg = 'bg-amber-100 text-amber-700';
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
                          })()}
                        </div>

                        {/* Shift Edit Selector Action Button */}
                        {!isViewOnly && ['shift1', 'shift2', 'shift3'].includes(row.key) && (() => {
                          const isLocked = Boolean(lockedShifts[row.key]);
                          const isWaiting = (row.key === 'shift2' && !lockedShifts.shift1Saved) || (row.key === 'shift3' && !lockedShifts.shift2Saved);
                          const isFinalUsed = Boolean(row.key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1);
                          const canEdit = !isLocked && !isWaiting && !isFinalUsed;
                          const isActive = activeEditingShift === row.key;

                          if (isActive) {
                            return (
                              <button
                                type="button"
                                id={`btn-psa-active-${row.key}`}
                                onClick={() => setActiveEditingShift(null)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer transition shrink-0"
                                title="Click to stop editing this shift (set to read-only)"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>Editing</span>
                              </button>
                            );
                          }

                          if (canEdit) {
                            return (
                              <button
                                type="button"
                                id={`btn-psa-select-${row.key}`}
                                onClick={() => setActiveEditingShift(row.key)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 hover:border-blue-500 shadow-2xs cursor-pointer transition shrink-0"
                                title={`Click to edit ${row.label}`}
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>{lockedShifts[`${row.key}Saved`] ? 'Edit' : 'Enter'}</span>
                              </button>
                            );
                          }

                          return null;
                        })()}
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
                              {(() => {
                                const isShift = ['shift1', 'shift2', 'shift3'].includes(row.key);
                                let isDisabled;
                                if (isShift) {
                                  const isLocked = Boolean(lockedShifts[row.key]);
                                  const isWaiting = (row.key === 'shift2' && !lockedShifts.shift1Saved) || (row.key === 'shift3' && !lockedShifts.shift2Saved);
                                  const isShiftActive = activeEditingShift === row.key;
                                  isDisabled = isViewOnly || isLocked || isWaiting || !isShiftActive;
                                } else {
                                  // RAW SALT and COMPOSITION retain their independent rules
                                  const isLocked = Boolean(lockedShifts[row.key]);
                                  isDisabled = isViewOnly || isLocked;
                                }
                                return (
                                  <input
                                    id={`psa-input-${row.key}-${param.key}`}
                                    type="text"
                                    inputMode="decimal"
                                    readOnly={isDisabled}
                                    disabled={isDisabled}
                                    value={cellVal}
                                    onChange={(e) =>
                                      !isViewOnly && handleChange(row.key, param.key, e.target.value)
                                    }
                                    placeholder={isDisabled ? '—' : '0.00'}
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
                              (editedFields && (editedFields[`${row.key}_${param.key}`] || (editedFields.get && editedFields.get(`${row.key}_${param.key}`)))) ||
                              (row.key === 'shift3' && (lockedShifts.shift3Edits || 0) >= 1 && hasValue)
                            ) && (
                              <div
                                id={`psa-edited-badge-${row.key}-${param.key}`}
                                className="mt-0.5 inline-flex items-center px-1 py-[2px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
                                title="This parameter was modified and saved"
                              >
                                EDITED
                              </div>
                            )}

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

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Confirm Save</h3>
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
                      {Object.entries(shift.values).map(([k, v]) => (
                        v !== null && v !== '' ? <div key={k}>{k.toUpperCase()}: <span className="font-semibold">{v}</span></div> : null
                      ))}
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

export default PureSaltAnalysisPage;
