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

// ─── LEAN Weekly Configuration ────────────────────────────────────────────────
// Plant: CO2 Plant ONLY (Option 14 / Last Option)
// Analysis: LEAN
// Frequency: Once in a Week
//
// Parameters and limits:
// 1. Cl: Target: 500 PPM, Tolerance: ±50 PPM, Allowed range: 450–550 PPM, Unit: PPM
// 2. SO4: Target: 150 PPM, Tolerance: ±10 PPM, Allowed range: 140–160 PPM, Unit: PPM
// 3. Fe: Target: 30 PPM, Tolerance: ±2.0 PPM, Allowed range: 28–32 PPM, Unit: PPM
// 4. TSS: Target: 30 PPM, Tolerance: ±10 PPM, Allowed range: 20–40 PPM, Unit: PPM
// 5. Na: Target: 500 PPM, Tolerance: ±10 PPM, Allowed range: 490–510 PPM, Unit: PPM
// 6. K: Target: 1000 PPM, Tolerance: ±50 PPM, Allowed range: 950–1050 PPM, Unit: PPM
// 7. NO2: Target: 30 PPM, Tolerance: ±10 PPM, Allowed range: 20–40 PPM, Unit: PPM
// 8. NO3: Target: 600 PPM, Tolerance: ±10 PPM, Allowed range: 590–610 PPM, Unit: PPM
//
// TABLE: DATE | Cl | SO4 | Fe | TSS | Na | K | NO2 | NO3

const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '450–550 PPM',
    placeholder: '500',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '140–160 PPM',
    placeholder: '150',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '28–32 PPM',
    placeholder: '30',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '20–40 PPM',
    placeholder: '30',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'na',
    label: 'Na',
    formula: 'Sodium (PPM)',
    unit: 'PPM',
    range: '490–510 PPM',
    placeholder: '500',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'k',
    label: 'K',
    formula: 'Potassium (PPM)',
    unit: 'PPM',
    range: '950–1050 PPM',
    placeholder: '1000',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'no2',
    label: 'NO2',
    formula: 'Nitrite (PPM)',
    unit: 'PPM',
    range: '20–40 PPM',
    placeholder: '30',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'no3',
    label: 'NO3',
    formula: 'Nitrate (PPM)',
    unit: 'PPM',
    range: '590–610 PPM',
    placeholder: '600',
    colClass: 'min-w-[130px]',
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

// Typical laboratory readings for LEAN Weekly (all within normal limits)
const buildDefaultData = () => ({
  week: {
    cl: '500',
    so4: '150',
    fe: '30',
    tss: '30',
    na: '500',
    k: '1000',
    no2: '30',
    no3: '600',
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

const LeanWeeklyAnalysisPage = ({ plantId = 'co2' }) => {
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
        const response = await api.get(`/api/lean-weekly-analysis?date=${date}`);
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
    showToast?.('LEAN analysis form cleared successfully.', 'info');
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
        analysisType: 'LEAN Weekly Analysis',
        tank: 'LEAN',
        unit: 'LEAN',
        frequency: 'Once in a Week',
        rows: data,
        parameters: data.week || {},
        submittedBy: user?.name || 'Plant Operator',
        submittedAt: new Date().toISOString(),
      };

      const response = await api.post('/api/lean-weekly-analysis', payload);

      setSaveSuccess(true);
      showToast?.(response.data?.message || 'LEAN Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save LEAN Analysis data.';
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
                <span className="text-blue-600 font-semibold">LEAN</span>
                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  Once in a Week
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                LEAN
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="lean-weekly-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="lean-weekly-date-input"
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
                id="btn-lean-weekly-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-lean-weekly-save"
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                  saveSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                title="Save LEAN data"
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
          id="lean-weekly-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              LEAN Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
              LEAN Measurements (PPM)
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold flex-wrap">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Frequency: Once in a Week</span>
            <span>•</span>
            <span>Cl: 450–550 PPM</span>
            <span>•</span>
            <span>SO4: 140–160 PPM</span>
            <span>•</span>
            <span>Fe: 28–32 PPM</span>
            <span>•</span>
            <span>TSS: 20–40 PPM</span>
            <span>•</span>
            <span>Na: 490–510 PPM</span>
            <span>•</span>
            <span>K: 950–1050 PPM</span>
            <span>•</span>
            <span>NO2: 20–40 PPM</span>
            <span>•</span>
            <span>NO3: 590–610 PPM</span>
          </div>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            {/* Column headers: DATE | Cl | SO4 | Fe | TSS | Na | K | NO2 | NO3 */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-48 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  DATE
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${p.colClass}`}
                  >
                    <div className="font-extrabold text-blue-300 text-xs">
                      {p.label}
                    </div>
                    <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                      {p.formula}
                    </div>
                    <div className="mt-1 inline-block text-[10px] bg-slate-800 text-blue-200 px-1.5 py-0.5 rounded border border-slate-700 font-semibold">
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

                    {/* Parameter inputs: Cl, SO4, Fe, TSS, Na, K, NO2, NO3 */}
                    {PARAMETERS.map((param) => {
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const limitConfig = getCellLimit('co2', 'lean', 'onceInAWeek', param.key);
                      const validation = validateCellValue(cellVal, limitConfig);

                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const isFormatError = Boolean(errors[`${row.key}_${param.key}`]);
                      const isOutOfLimit = hasValue && !isFormatError && validation.isOutOfLimit;
                      const isNormal = hasValue && !isFormatError && validation.isNormal;

                      // Exact range label to display
                      const displayRange = limitConfig?.formattedRange || param.range;

                      // Status based border & background colors
                      let inputBorderClass = 'border-slate-300 hover:border-slate-400 bg-white text-slate-800';
                      if (isFormatError) {
                        inputBorderClass = 'border-red-400 bg-red-50 text-red-900 ring-1 ring-red-400';
                      } else if (isOutOfLimit) {
                        inputBorderClass = 'border-rose-400 bg-rose-50 text-rose-900 ring-2 ring-rose-400 font-black';
                      } else if (isNormal) {
                        inputBorderClass = 'border-emerald-400 bg-emerald-50/60 text-emerald-900 ring-1 ring-emerald-300';
                      }

                      return (
                        <td
                          key={param.key}
                          className="px-2.5 py-3.5 align-middle text-center"
                        >
                          <div className="flex flex-col items-center">
                            <div className="relative w-full max-w-[120px]">
                              <input
                                id={`input-lean-weekly-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                placeholder={param.placeholder}
                                value={cellVal}
                                onChange={(e) =>
                                  handleChange(row.key, param.key, e.target.value)
                                }
                                className={`w-full px-2.5 py-1.5 text-center text-xs font-bold rounded-lg border shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${inputBorderClass}`}
                              />
                            </div>

                            {/* Format Error */}
                            {isFormatError && (
                              <span className="text-[10px] text-red-600 font-bold mt-1 tracking-tight">
                                {errors[`${row.key}_${param.key}`]}
                              </span>
                            )}

                            {/* Out of limit badge */}
                            {!isFormatError && isOutOfLimit && (
                              <div
                                id={`lean-weekly-limit-badge-${row.key}-${param.key}`}
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
              Values for <strong>LEAN</strong> (Cl: 450–550 PPM, SO4: 140–160 PPM, Fe: 28–32 PPM, TSS: 20–40 PPM, Na: 490–510 PPM, K: 950–1050 PPM, NO2: 20–40 PPM, NO3: 590–610 PPM). All units in PPM. Exact min and max are Normal.
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

export default LeanWeeklyAnalysisPage;
