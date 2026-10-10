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
} from 'lucide-react';

// ─── TK 207 Parameters & Limits Configuration (ACL Plant ONLY) ────────────────
// Frequency: SHIFT TWICE
// Unit: strictly Kgm/m³
//
// Parameters and official limits:
// 1. FNH3: Target: 4.02 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 3.92–4.12 Kgm/m³
// 2. CNH3: Target: 1.92 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 1.82–2.02 Kgm/m³
// 3. TCL:  Target: 5.47 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 5.37–5.57 Kgm/m³
// 4. PCL:  Target: 3.55 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 3.45–3.65 Kgm/m³

export const TK207_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 4.02,
    tolerance: 0.10,
    min: 3.92,
    max: 4.12,
    unit: 'Kgm/m³',
    formattedRange: '3.92–4.12 Kgm/m³',
    formattedTarget: '4.02 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 1.92,
    tolerance: 0.10,
    min: 1.82,
    max: 2.02,
    unit: 'Kgm/m³',
    formattedRange: '1.82–2.02 Kgm/m³',
    formattedTarget: '1.92 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 5.47,
    tolerance: 0.10,
    min: 5.37,
    max: 5.57,
    unit: 'Kgm/m³',
    formattedRange: '5.37–5.57 Kgm/m³',
    formattedTarget: '5.47 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 3.55,
    tolerance: 0.10,
    min: 3.45,
    max: 3.65,
    unit: 'Kgm/m³',
    formattedRange: '3.45–3.65 Kgm/m³',
    formattedTarget: '3.55 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
};

const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
];

const TIME_SLOTS = [
  { key: 't07', time: '07:00', shiftId: 'shift1' },
  { key: 't09', time: '09:00', shiftId: 'shift1' },
  { key: 't11', time: '11:00', shiftId: 'shift1' },
  { key: 't13', time: '13:00', shiftId: 'shift1' },
  { key: 't15', time: '15:00', shiftId: 'shift2' },
  { key: 't17', time: '17:00', shiftId: 'shift2' },
  { key: 't19', time: '19:00', shiftId: 'shift2' },
  { key: 't21', time: '21:00', shiftId: 'shift2' },
  { key: 't23', time: '23:00', shiftId: 'shift3' },
  { key: 't01', time: '01:00', shiftId: 'shift3' },
  { key: 't03', time: '03:00', shiftId: 'shift3' },
  { key: 't05', time: '05:00', shiftId: 'shift3' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    TIME_SLOTS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
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

// ─── Row styles by Shift grouping ─────────────────────────────────────────────

const getRowStyles = (shiftId) => {
  if (shiftId === 'shift1') {
    return {
      row:        'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (shiftId === 'shift2') {
    return {
      row:        'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  return {
    row:        'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const TK207AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── State ──
  const [date, setDate]               = useState('');
  const [data, setData]               = useState(buildEmptyData());
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError]     = useState(false);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/tk-207-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             setData(buildEmptyData());
          } else if (record.shifts) {
            setData(record.shifts);
          } else if (record.readings && record.readings.length > 0) {
            setData(record.readings);
          } else if (record.rows) {
            setData(record.rows);
          } else if (record.data && !Array.isArray(record.data)) {
            setData(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setData(record);
          } else if (record.data && record.data.rows) {
            setData(record.data.rows);
          } else {
            setData(buildEmptyData());
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);


  const visibleRows = TIME_SLOTS;

  // ── Real-time input change (Does NOT modify entered value) ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    // Clear cell format error if any
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  // ── Reset form ──
  const handleReset = useCallback(() => {
    setData(buildEmptyData());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('TK 207 analysis form cleared successfully.', 'info');
  }, [showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    if (!date) {
      setDateError(true);
      isValid = false;
    } else {
      setDateError(false);
    }

    TIME_SLOTS.forEach((row) => {
      PARAMETERS.forEach((p) => {
        const val = data[row.key][p.key];
        if (val !== '' && isNaN(Number(val))) {
          newErrors[`${row.key}_${p.key}`] = 'Must be a valid number';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [date, data]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast('Please correct highlighted errors before saving.', 'error');
      return;
    }

    // Check if at least one cell is filled
    const hasData = TIME_SLOTS.some((row) =>
      PARAMETERS.some((p) => data[row.key][p.key] !== '')
    );
    if (!hasData) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: 'ACL',
        analysisType: 'TK 207 Analysis',
        tank: 'TK 207',
        rows: data,
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/tk-207-analysis', payload);

      setSaveSuccess(true);
      showToast(response.data?.message || 'TK 207 Analysis data saved successfully!', 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save TK 207 Analysis data.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header ──────────────────────────────────────────────── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back + Titles */}
          <div className="flex items-center gap-3">
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
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">TK 207</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5 flex items-center gap-2">
                <span>TK 207</span>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                  SHIFT TWICE
                </span>
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="tk207-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="tk207-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (typeof setDateError === 'function') setDateError(false);
                    if (typeof setSaveSuccess === 'function') setSaveSuccess(false);
                  }}
                  className={`pl-7 pr-2 py-1 text-xs font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 bg-white ${
                    typeof dateError !== 'undefined' && dateError
                      ? 'border-red-400 bg-red-50 focus:ring-red-400'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                />
              </div>
              {date && (
                <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
                  {formatDateDisplay(date)}
                </span>
              )}
              {typeof dateError !== 'undefined' && dateError && (
                <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
                  <AlertCircle className="w-3 h-3" /> Required
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-tk207-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-tk207-save"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
                title="Save TK 207 data"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : 'Save / Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="tk207-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              TK 207 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* Table Header Bar */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              TK 207 Measurements
            </h2>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
              SHIFT TWICE
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-600 font-semibold flex-wrap">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Unit: Kgm/m³</span>
            <span>•</span>
            <span>FNH₃: 3.92–4.12</span>
            <span>•</span>
            <span>CNH₃: 1.82–2.02</span>
            <span>•</span>
            <span>TCl: 5.37–5.57</span>
            <span>•</span>
            <span>PCl: 3.45–3.65</span>
          </div>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-28 sm:w-32 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Time
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${p.colClass}`}
                  >
                    <div className="font-extrabold text-blue-300 text-xs">
                      {p.label}
                    </div>
                    <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                      Kgm/m³
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody className="divide-y divide-slate-200">
              {visibleRows.map((row) => {
                const styles = getRowStyles(row.shiftId);
                return (
                  <tr
                    key={row.key}
                    className={`transition-colors duration-100 ${styles.row}`}
                  >
                    {/* Time slot label */}
                    <td className="px-5 py-2.5 align-middle">
                      <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                        {row.time}
                      </span>
                    </td>

                    {/* Parameter input cells with Tolerance / Limit Validation */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key][param.key];
                      const isFormatError = !!errors[fieldKey];
                      const formatErrorMessage = errors[fieldKey];

                      const limit = getCellLimit(plantId, 'tk207', row.key, param.key) || TK207_LIMITS[param.key];
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      return (
                        <td key={param.key} className="px-4 py-2.5 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[62px]">
                            <div className="relative w-full max-w-[115px]">
                              <input
                                id={`tk207-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                placeholder="0.00"
                                onChange={(e) =>
                                  handleChange(row.key, param.key, e.target.value)
                                }
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange}, Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange} (Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                                    : ''
                                }
                                className={`w-full max-w-[115px] mx-auto text-center text-sm font-mono font-bold px-3 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                    : hasValue && isNormal
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : styles.inputFocus
                                }`}
                                aria-label={`${param.label} at ${row.time}`}
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

                            {/* Invalid numeric error message */}
                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span className="whitespace-nowrap">{formatErrorMessage}</span>
                              </div>
                            )}

                            {/* Status and Allowed Range Display */}
                            {!isFormatError && (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && (
                                  <span
                                    id={`tk207-status-${row.key}-${param.key}`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit?.formattedRange || ''}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}

                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`tk207-status-${row.key}-${param.key}`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit?.formattedRange || ''})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}

                                {/* Allowed range displayed below each input field */}
                                <span
                                  id={`tk207-range-${row.key}-${param.key}`}
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

        {/* Table footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Values for <strong>TK 207</strong> (FNH₃, CNH₃, TCl, PCl). Frequency: <strong>SHIFT TWICE</strong>. Unit: <strong>Kgm/m³</strong>. Enter numeric values only. Leave blank if not applicable.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Slots: {visibleRows.length} (24-hour monitoring)
          </div>
        </div>
      </div>
    </div>
  );
};

export default TK207AnalysisPage;
