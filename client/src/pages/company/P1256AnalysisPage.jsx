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
  Gauge,
  Database,
  FlaskConical,
} from 'lucide-react';

// ─── P1256 Configuration ──────────────────────────────────────────────────────
// Plant: CO2 Plant ONLY
// Analysis: P1256
// Frequency: Once in a shift
// Parameter and limit:
// ALK: Target 0.20%, Tolerance ±0.10%, Allowed range 0.10%–0.30% (Unit: %)
// TABLE: TIME | ALK

const PARAMETERS = [
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (%)',
    unit: '%',
    target: '0.20%',
    tolerance: '±0.10%',
    range: '0.10–0.30%',
    placeholder: '0.20',
    colClass: 'min-w-[180px]',
  },
];

// Shift rows representing Once in a shift frequency
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFT_ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// Typical laboratory readings for P1256
const buildDefaultData = () => ({
  shift1: { alk: '0.20' },
  shift2: { alk: '' },
  shift3: { alk: '' },
});

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

// ─── Row styles by Shift grouping matching CO2 Plant theme ─────────────────────
const getRowStyles = (shiftId) => {
  if (shiftId === 'shift1') {
    return {
      row: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
      inputFocus:
        'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (shiftId === 'shift2') {
    return {
      row: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
      inputFocus:
        'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  return {
    row: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus:
      'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

const P1256AnalysisPage = ({ plantId = 'co2' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(buildEmptyData());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/p1256-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          if (response.data.data.rows) {
            setData(response.data.data.rows);
          } else if (response.data.data.data && !Array.isArray(response.data.data.data)) {
            setData(response.data.data.data);
          } else {
             // Let it be default
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);


  // ── Real-time input change (Preserves user value exactly as entered) ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [paramKey]: value,
      },
    }));

    // Clear cell error
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
    showToast?.('P1256 analysis form cleared successfully.', 'info');
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

    SHIFT_ROWS.forEach((row) => {
      PARAMETERS.forEach((p) => {
        const val = data[row.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            newErrors[`${row.key}_${p.key}`] = 'Must be a valid number';
            isValid = false;
          }
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [date, data]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast?.('Please correct highlighted errors before saving.', 'error');
      return;
    }

    // Check if at least one cell has value
    const hasData = SHIFT_ROWS.some((row) =>
      PARAMETERS.some((p) => {
        const val = data[row.key]?.[p.key];
        return val !== '' && val !== null && val !== undefined;
      })
    );

    if (!hasData) {
      showToast?.('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: 'CO2',
        analysisType: 'P1256 Analysis',
        tank: 'P1256',
        unit: 'P1256',
        frequency: 'Once in a shift',
        rows: data,
        parameters: data.shift1 || {},
        submittedBy: user?.name || 'Plant Operator',
        submittedAt: new Date().toISOString(),
      };

      const response = await api.post('/api/p1256-analysis', payload);

      setSaveSuccess(true);
      showToast?.(response.data?.message || 'P1256 Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save P1256 Analysis data.';
      showToast?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb Header (Exact CO2 Plant layout & theme) ──────────────── */}
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
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                <span>CO2 Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">P1256</span>
                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  Once in a shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                P1256
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="p1256-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="p1256-date-input"
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
                <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
                  {formatDateDisplay(date)}
                </span>
              )}
              {dateError && (
                <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
                  <AlertCircle className="w-3 h-3" /> Required
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-p1256-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-p1256-save"
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                  saveSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                title="Save P1256 data"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save / Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Success Banner ──────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="p1256-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              P1256 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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

      {/* ── Main Analysis Table Card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Subheader Bar */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              P1256 Measurements
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Frequency: Once in a shift</span>
            <span>•</span>
            <span>Parameter: ALK</span>
            <span>•</span>
            <span>Unit: %</span>
          </div>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            {/* Column headers: TIME | ALK */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  TIME
                </th>
                {PARAMETERS.map((p, idx) => {
                  const limit = getCellLimit('co2', 'p1256', 'shift1', p.key);
                  return (
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
                        {p.formula}
                      </div>
                      {limit && (
                        <div className="mt-1 inline-block text-[10px] bg-slate-800 text-blue-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                          Target: {limit.formattedTarget} ± {limit.tolerance}{limit.unit}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody className="divide-y divide-slate-200">
              {SHIFT_ROWS.map((row) => {
                const styles = getRowStyles(row.shiftId);
                return (
                  <tr
                    key={row.key}
                    className={`transition-colors duration-100 ${styles.row}`}
                  >
                    {/* Time & Shift label */}
                    <td className="px-5 py-3 align-middle border-r border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                          {row.time}
                        </span>
                        <div className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                          {row.label}
                        </div>
                      </div>
                    </td>

                    {/* ALK parameter input cell */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const limit = getCellLimit('co2', 'p1256', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const isFormatError = !!errors[fieldKey];

                      return (
                        <td
                          key={param.key}
                          className="py-3 px-4 border-r border-slate-100 last:border-r-0 text-center align-top"
                        >
                          <div className="flex flex-col items-center justify-start min-h-[58px] max-w-[160px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`p1256-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                placeholder={param.placeholder}
                                onChange={(e) =>
                                  handleChange(row.key, param.key, e.target.value)
                                }
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} ${limit.unit} (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `Normal: ${cellVal} ${limit.unit} (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : ''
                                }
                                className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border transition shadow-2xs focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue
                                    ? 'border-blue-300 bg-blue-50/40 text-blue-950 font-black focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
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
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>{errors[fieldKey] || 'Invalid number'}</span>
                              </div>
                            )}

                            {/* Out of limit badge */}
                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`p1256-limit-badge-${row.key}-${param.key}`}
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
                                title={`Normal: ${cellVal} ${limit.unit} (${limit.formattedRange})`}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Normal
                              </span>
                            )}

                            {/* Display allowed range below input: 0.10–0.30% */}
                            {!isFormatError && !hasValue && limit && (
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

        {/* Table footer info matching CO2 Plant */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Values for <strong>P1256</strong> (ALK: 0.10–0.30%). Numeric values only. Boundary values (0.10% and 0.30%) are considered Normal.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Slots: {SHIFT_ROWS.length} (Once in a shift)
          </div>
        </div>
      </div>
    </div>
  );
};

export default P1256AnalysisPage;
