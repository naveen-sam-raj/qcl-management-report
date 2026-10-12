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
  Sliders,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';

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
  const [date, setDate]               = useState(() => getTodayAsiaKolkata());
  const [data, setData]               = useState(buildEmptyData());
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lockedShifts, setLockedShifts] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [originalData, setOriginalData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Shift-Wise Input Locking: null | 'shift1' | 'shift2' | 'shift3'
  // When null, all shifts are read-only until Admin explicitly selects an available shift
  const [activeEditingShift, setActiveEditingShift] = useState(null);

  const [recipientEmail, setRecipientEmail] = useState(
    user?.email || import.meta.env.VITE_DEFAULT_REPORT_RECIPIENT_EMAIL || ''
  );
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
    setActiveEditingShift(null);

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/pure-salt-sieve-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const records = Array.isArray(payloadData) ? payloadData : [payloadData];
          const record = records.find((r) => r.date === date) || records[0];

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
    if (lockedShifts[rowKey]) return; // Prevent edit if shift is locked
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

    // Clear cell error if any
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });

    setSaveSuccess(false);
  }, [lockedShifts, activeEditingShift]);

  const handleReset = () => {
    setData(buildEmptyData());
    setDate(getTodayAsiaKolkata());
    setActiveEditingShift(null);
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
      const canEdit =
        !lockedShifts[key] &&
        !(key === 'shift2' && !lockedShifts.shift1Saved) &&
        !(key === 'shift3' && !lockedShifts.shift2Saved) &&
        activeEditingShift === key; // Only include the actively editing shift

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
        showToast('Please select an available shift to edit first.', 'info');
      } else {
        showToast(`No modified changes found in ${shiftDisplayNames[activeEditingShift]} to save.`, 'info');
      }
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
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);

    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL Plant',
      analysisType: 'Pure Salt Sieve Analysis',
      shift: activeEditingShift ? shiftDisplayNames[activeEditingShift] : 'All Shifts (I, II, III)',
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

      if (!response?.data?.success) {
        showToast(response?.data?.message || 'Unable to save the data. Please try again.', 'error');
        setShowConfirmModal(false);
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
      setActiveEditingShift(null); // Return to read-only state upon successful save
      setShowConfirmModal(false);

      setSavePhase('generating');
      await new Promise((resolve) => setTimeout(resolve, 300));

      setSavePhase('emailing');
      await new Promise((resolve) => setTimeout(resolve, 300));

      setSavePhase('completed');
      setSaveSuccess(true);
      showToast(response.data.message || 'Saved & Dispatched Successfully ✓', 'success');

      setTimeout(() => {
        setSaving(false);
        setSavePhase('idle');
      }, 4000);
    } catch (err) {
      setSavePhase('idle');
      setSaving(false);
      console.error('[PureSaltSieveAnalysis] Database save failed:', err);
      showToast(err.response?.data?.message || 'Unable to save the data. Please try again.', 'error');
      setShowConfirmModal(false);
    } finally {
      if (!response?.data?.success) {
        setSaving(false);
      }
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
            {/* Integrated Date Section - Read-Only Restricted Strictly to Today (Asia/Kolkata) */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 shadow-2xs select-none"
              title="Date selection restricted strictly to current date (Asia/Kolkata)"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
                <span id="ps-sieve-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
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
                  id="btn-sieve-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  id="btn-sieve-save"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs disabled:opacity-75 cursor-pointer ${
                    savePhase === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  title="Save sieve analysis data and dispatch automated Excel report"
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
                      ? 'Saved & Dispatched ✓'
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

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="sieve-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <span className="font-bold text-emerald-800">
              Saved & Dispatched Successfully ✓
            </span>{' '}
            <span className="text-emerald-700">
              Pure Salt Sieve Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded in database.
            </span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 transition text-base leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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
                  Editing {shiftDisplayNames[activeEditingShift]}
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
                    id="btn-psa-sieve-bar-shift1"
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
                    id="btn-psa-sieve-bar-shift2"
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
                    id="btn-psa-sieve-bar-shift3"
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
          <table className="w-full min-w-[760px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3.5 text-left text-xs font-extrabold uppercase tracking-wider w-48 sm:w-56 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
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
                          const isWaiting =
                            (row.key === 'shift2' && !lockedShifts.shift1Saved) ||
                            (row.key === 'shift3' && !lockedShifts.shift2Saved);
                          const isFinalUsed = Boolean(
                            row.key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1
                          );
                          const canEdit = !isLocked && !isWaiting && !isFinalUsed;
                          const isActive = activeEditingShift === row.key;

                          if (isActive) {
                            return (
                              <button
                                type="button"
                                id={`btn-psa-sieve-active-${row.key}`}
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
                                id={`btn-psa-sieve-select-${row.key}`}
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
                                const isShift = ['shift1', 'shift2', 'shift3'].includes(row.key);
                                const isLocked = Boolean(lockedShifts[row.key]);
                                const isWaiting =
                                  (row.key === 'shift2' && !lockedShifts.shift1Saved) ||
                                  (row.key === 'shift3' && !lockedShifts.shift2Saved);
                                const isShiftActive = activeEditingShift === row.key;
                                const isDisabled = isViewOnly || isLocked || isWaiting || !isShiftActive;

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
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            All sieve fractions are in <strong>percentage (%)</strong>. Tolerance limits apply strictly to <strong>II SHIFT</strong>.
          </p>
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
