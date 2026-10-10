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

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── State ──
  const [date, setDate]               = useState('');
  const [data, setData]               = useState(buildEmptyData());
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError]     = useState(false);

  
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/brine-analysis?date=${date}`);
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


  // ── Real-time input change ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

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
  }, []);

  const handleReset = () => {
    setData(buildEmptyData());
    setDate('');
    setErrors({});
    setSaveSuccess(false);
    setDateError(false);
    showToast('Brine analysis form cleared successfully.', 'info');
  };

  // Full dataset validation before submission
  const validate = () => {
    let hasError = false;

    if (!date) {
      setDateError(true);
      hasError = true;
    } else {
      setDateError(false);
    }

    // Verify all entered fields are numeric
    const newErrors = {};
    ROWS.forEach((r) => {
      PARAMETERS.forEach((p) => {
        const val = data[r.key][p.key];
        if (val !== '' && isNaN(Number(val))) {
          newErrors[`${r.key}_${p.key}`] = 'Enter numbers only';
          hasError = true;
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  const handleSave = async () => {
    if (!validate()) {
      showToast('Please specify analysis date and valid numbers before saving.', 'error');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: 'ACL',
      analysisType: 'Brine Analysis',
      frequency: 'WEEK',
      unit: 'g/L',
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
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

    try {
      const response = await api.post('/api/brine-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast(response.data?.message || 'Brine Analysis saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 6000);
    } catch (err) {
      setSaving(false);
      console.error('[BrineAnalysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast('Save Error: ' + serverMessage, 'error');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header ──────────────────────────────────────────────── */}
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
              </div>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="brine-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="brine-date-input"
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
                id="btn-brine-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-brine-save"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
                title="Save brine analysis"
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

      {/* ── Analysis Table Card with Integrated Date Selector ───────────────── */}
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

                    {/* Parameter input cells (Tolerance / Limit Validation) */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key][param.key];
                      const isFormatError = !!errors[fieldKey];
                      const formatErrorMessage = errors[fieldKey];

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
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
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

    </div>
  );
};

export default BrineAnalysisPage;
