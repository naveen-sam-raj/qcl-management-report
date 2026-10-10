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

// ─── SOX DRAIN LIQ Configuration ──────────────────────────────────────────────
// Plant: CO2 Plant ONLY
// Analysis: SOX DRAIN LIQ
// Frequency: Once in a Week
//
// Parameters and limits:
// 1. Cl: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM, Unit: PPM
// 2. SO4: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM, Unit: PPM
// 3. Fe: Target: 2 PPM, Tolerance: ±1.0 PPM, Allowed range: 1–3 PPM, Unit: PPM
// 4. TSS: Target: 10 PPM, Tolerance: ±10 PPM, Allowed range: 0–20 PPM, Unit: PPM
//
// TABLE: DATE | Cl | SO4 | Fe | TSS

const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '1–3 PPM',
    placeholder: '2',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '0–20 PPM',
    placeholder: '10',
    colClass: 'min-w-[150px]',
  },
];

// Single weekly row representing Once in a Week frequency
const WEEKLY_ROWS = [
  {
    key: 'week',
    label: 'Weekly Analysis',
    frequencyBadge: 'Once in a Week',
  },
];

const buildEmptyData = () =>
  Object.fromEntries(
    WEEKLY_ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// Typical laboratory readings for SOX DRAIN LIQ (all within normal limits)
const buildDefaultData = () => ({
  week: {
    cl: '300',
    so4: '300',
    fe: '2',
    tss: '10',
  },
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

const SOXDrainLiqAnalysisPage = ({ plantId = 'co2' }) => {
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
        const response = await api.get(`/sox-drain-liq-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.shifts) {
            setData(record.shifts);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
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
            // Leave default
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
    showToast?.('SOX DRAIN LIQ analysis form cleared successfully.', 'info');
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

    WEEKLY_ROWS.forEach((row) => {
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
    const hasData = WEEKLY_ROWS.some((row) =>
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
        analysisType: 'SOX DRAIN LIQ Analysis',
        tank: 'SOX DRAIN LIQ',
        unit: 'SOX DRAIN LIQ',
        frequency: 'Once in a Week',
        rows: data,
        parameters: data.week || {},
        submittedBy: user?.name || 'Plant Operator',
        submittedAt: new Date().toISOString(),
      };

      const response = await api.post('/api/sox-drain-liq-analysis', payload);

      setSaveSuccess(true);
      showToast?.(response.data?.message || 'SOX DRAIN LIQ Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save SOX DRAIN LIQ Analysis data.';
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
                <span className="text-blue-600 font-semibold">SOX DRAIN LIQ</span>
                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  Once in a Week
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                SOX DRAIN LIQ
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="sox-drain-liq-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="sox-drain-liq-date-input"
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
                id="btn-sox-drain-liq-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-sox-drain-liq-save"
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                  saveSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                title="Save SOX DRAIN LIQ data"
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
          id="sox-drain-liq-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              SOX DRAIN LIQ Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
              SOX DRAIN LIQ Measurements
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold flex-wrap">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Frequency: Once in a Week</span>
            <span>•</span>
            <span>Cl: 290–310 PPM</span>
            <span>•</span>
            <span>SO4: 290–310 PPM</span>
            <span>•</span>
            <span>Fe: 1–3 PPM</span>
            <span>•</span>
            <span>TSS: 0–20 PPM</span>
          </div>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            {/* Column headers: DATE | Cl | SO4 | Fe | TSS */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-56 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  DATE
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
                      {p.formula}
                    </div>
                    <div className="mt-1 inline-block text-[10px] bg-slate-800 text-blue-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                      Allowed: {p.range}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody className="divide-y divide-slate-200">
              {WEEKLY_ROWS.map((row) => {
                return (
                  <tr
                    key={row.key}
                    className="transition-colors duration-100 bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600"
                  >
                    {/* DATE Column */}
                    <td className="px-5 py-3.5 align-middle border-r border-slate-100">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-mono font-extrabold text-slate-900 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                            {formatDateDisplay(date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                            {row.frequencyBadge}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Parameters input cells: Cl, SO4, Fe, TSS */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const limit = getCellLimit('co2', 'sox-drain-liq', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const isFormatError = !!errors[fieldKey];
                      const displayRange = limit?.formattedRange || param.range;

                      return (
                        <td
                          key={param.key}
                          className="py-3 px-4 border-r border-slate-100 last:border-r-0 text-center align-top"
                        >
                          <div className="flex flex-col items-center justify-start min-h-[58px] max-w-[160px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`sox-drain-liq-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                placeholder={param.placeholder}
                                onChange={(e) =>
                                  handleChange(row.key, param.key, e.target.value)
                                }
                                title={
                                  isOutOfLimit
                                    ? `OUT OF LIMIT: ${cellVal} ${param.unit} (Allowed: ${displayRange})`
                                    : hasValue
                                    ? `Normal: ${cellVal} ${param.unit} (Allowed: ${displayRange})`
                                    : `Allowed range: ${displayRange}`
                                }
                                className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border transition shadow-2xs focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue
                                    ? 'border-blue-300 bg-blue-50/40 text-blue-950 font-black focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                    : 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400'
                                }`}
                                aria-label={`${param.label} measurement`}
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
                            {!isFormatError && isOutOfLimit && (
                              <div
                                id={`sox-drain-liq-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${displayRange}`}
                              >
                                <span>Limit: {displayRange}</span>
                              </div>
                            )}

                            {/* Normal indicator */}
                            {!isFormatError && isNormal && hasValue && (
                              <span
                                className="text-[10px] text-emerald-600 font-bold mt-1 tracking-tight flex items-center gap-0.5 animate-fadeIn"
                                title={`Normal: ${cellVal} ${param.unit} (${displayRange})`}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Normal
                              </span>
                            )}

                            {/* Display allowed ranges near corresponding inputs */}
                            {!isFormatError && !hasValue && (
                              <span
                                className="text-[10px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Allowed range: ${displayRange}`}
                              >
                                {displayRange}
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
              Values for <strong>SOX DRAIN LIQ</strong> (Cl: 290–310 PPM, SO4: 290–310 PPM, Fe: 1–3 PPM, TSS: 0–20 PPM). Numeric values only. Boundary values are considered Normal.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Frequency: Once in a Week
          </div>
        </div>
      </div>
    </div>
  );
};

export default SOXDrainLiqAnalysisPage;
