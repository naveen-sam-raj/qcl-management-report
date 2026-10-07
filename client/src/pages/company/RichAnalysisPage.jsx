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

// Rich Config: CO2 Plant ONLY, Once in a shift
const SHIFT_PARAMETERS = [
  {
    key: 'loading',
    label: 'LOADING',
    formula: 'Loading (g of CO2/g of solvent)',
    unit: 'g of CO2/g of solvent',
    target: '0.6000 g of CO2/g of solvent',
    tolerance: '\u00b10.05',
    range: '0.5500\u20130.6500 g of CO2/g of solvent',
    placeholder: '0.6000',
    colClass: 'min-w-[220px] border-r border-slate-800/50',
  },
  {
    key: 'density',
    label: 'DENSITY',
    formula: 'Density (Kg/cc)',
    unit: 'Kg/cc',
    target: '1080 Kg/cc',
    tolerance: '\u00b110',
    range: '1070\u20131090 Kg/cc',
    placeholder: '1080',
    colClass: 'min-w-[160px]',
  },
];

const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 \u2013 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 \u2013 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 \u2013 06:00)', shiftId: 'shift3' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFT_ROWS.map((r) => [r.key, Object.fromEntries(SHIFT_PARAMETERS.map((p) => [p.key, '']))])
  );

const buildDefaultData = () => ({
  shift1: { loading: '', density: '' },
  shift2: { loading: '', density: '' },
  shift3: { loading: '', density: '' },
});

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '\u2014';
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
    });
  } catch { return isoDate; }
};

const getRowStyles = (shiftId) => {
  if (shiftId === 'shift1') return {
    row: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  };
  if (shiftId === 'shift2') return {
    row: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  };
  return {
    row: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

const RichAnalysisPage = ({ plantId = 'co2' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

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
        const response = await api.get(`/api/rich-analysis?date=${date}`);
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


  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setData((prev) => ({ ...prev, [rowKey]: { ...(prev[rowKey] || {}), [paramKey]: value } }));
    setErrors((prev) => { const next = { ...prev }; delete next[`${rowKey}_${paramKey}`]; return next; });
    setSaveSuccess(false);
  }, []);

  const handleReset = useCallback(() => {
    setData(buildEmptyData()); setErrors({}); setDateError(false); setSaveSuccess(false);
    showToast?.('Rich analysis form cleared successfully.', 'info');
  }, [showToast]);

  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};
    if (!date) { setDateError(true); isValid = false; } else { setDateError(false); }
    SHIFT_ROWS.forEach((row) => {
      SHIFT_PARAMETERS.forEach((p) => {
        const val = data[row.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) { newErrors[`${row.key}_${p.key}`] = 'Must be a valid number'; isValid = false; }
        }
      });
    });
    setErrors(newErrors);
    return isValid;
  }, [date, data]);

  const handleSave = async () => {
    if (!validateForm()) { showToast?.('Please correct highlighted errors before saving.', 'error'); return; }
    const hasData = SHIFT_ROWS.some((row) =>
      SHIFT_PARAMETERS.some((p) => { const v = data[row.key]?.[p.key]; return v !== '' && v !== null && v !== undefined; })
    );
    if (!hasData) { showToast?.('Please enter at least one measurement value.', 'warning'); return; }
    setSaving(true); setSaveSuccess(false);
    try {
      const payload = {
        date, plant: 'CO2', analysisType: 'Rich Analysis', tank: 'Rich', unit: 'Rich',
        frequency: 'Once in a shift', rows: data, parameters: data.shift1 || {},
        submittedBy: user?.name || 'Plant Operator', submittedAt: new Date().toISOString(),
      };
      const response = await api.post('/api/rich-analysis', payload);
      setSaveSuccess(true);
      showToast?.(response.data?.message || 'Rich Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0] || 'Failed to save Rich Analysis data.';
      showToast?.(msg, 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" /><span>Back</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                <span>CO2 Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 font-semibold">Rich</span>
                <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  Once in a shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                Rich
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label htmlFor="rich-date-input" className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <span>Date:</span><span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="rich-date-input" type="date" value={date}
                  onChange={(e) => { setDate(e.target.value); setDateError(false); setSaveSuccess(false); }}
                  className={`pl-7 pr-2 py-1 text-xs font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 transition text-slate-800 bg-white ${
                    dateError ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-slate-300 hover:border-slate-400'
                  }`}
                />
              </div>
              {date && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-200 hidden sm:inline-block">
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
                id="btn-rich-reset" onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" /><span>Reset</span>
              </button>
              <button
                id="btn-rich-save" onClick={handleSave} disabled={saving}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                  saveSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                title="Save Rich data"
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

      {/* Success Banner */}
      {saveSuccess && (
        <div id="rich-success-banner" className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">Analysis Saved Successfully:</span>{' '}
            <span className="text-emerald-700">
              Rich Analysis for <strong>{formatDateDisplay(date)}</strong> (Once in a shift) has been recorded.
            </span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 transition text-base leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Analysis Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              Shift Analysis &mdash; Once in a Shift
            </h2>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
              3 Shifts
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Loading: g of CO2/g of solvent</span>
            <span>&bull;</span>
            <span>Density: Kg/cc</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-sm">
            <thead>
              <tr className="border-b-2 border-emerald-600 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  TIME
                </th>
                {SHIFT_PARAMETERS.map((p, idx) => {
                  const limit = getCellLimit('co2', 'rich', 'shift1', p.key);
                  return (
                    <th
                      key={p.key}
                      className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                      } ${p.colClass}`}
                    >
                      <div className="font-extrabold text-emerald-300 text-xs">{p.label}</div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">{p.formula}</div>
                      {limit && (
                        <div className="mt-1 inline-block text-[10px] bg-slate-800 text-emerald-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                          Target: {limit.formattedTarget} ({limit.formattedTolerance})
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {SHIFT_ROWS.map((row) => {
                const styles = getRowStyles(row.shiftId);
                return (
                  <tr key={row.key} className={`transition-colors duration-100 ${styles.row}`}>
                    <td className="px-5 py-3 align-middle border-r border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                          {row.time}
                        </span>
                        <div className="text-[11px] font-bold text-slate-600 whitespace-nowrap">{row.label}</div>
                      </div>
                    </td>
                    {SHIFT_PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const limit = getCellLimit('co2', 'rich', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const isFormatError = !!errors[fieldKey];
                      return (
                        <td key={param.key} className="py-3 px-3 border-r border-slate-100 last:border-r-0 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px] max-w-[200px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`rich-input-${row.key}-${param.key}`}
                                type="text" inputMode="decimal" value={cellVal} placeholder={param.placeholder}
                                onChange={(e) => handleChange(row.key, param.key, e.target.value)}
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} ${limit.unit} (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `Normal: ${cellVal} ${limit.unit} (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : ''
                                }
                                className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2 rounded-lg border transition shadow-2xs focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue
                                    ? 'border-emerald-300 bg-emerald-50/40 text-emerald-950 font-black focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
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
                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>{errors[fieldKey] || 'Invalid number'}</span>
                              </div>
                            )}
                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`rich-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.formattedRange}`}
                              >
                                <span>Limit: {limit.formattedRange}</span>
                              </div>
                            )}
                            {!isFormatError && isNormal && hasValue && limit && (
                              <span
                                className="text-[10px] text-emerald-600 font-bold mt-1 tracking-tight flex items-center gap-0.5 animate-fadeIn"
                                title={`Normal: ${cellVal} ${limit.unit} (${limit.formattedRange})`}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Normal
                              </span>
                            )}
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

        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>
              Shift measurements: <strong>Loading</strong> (0.5500&ndash;0.6500 g of CO2/g of solvent),{' '}
              <strong>Density</strong> (1070&ndash;1090 Kg/cc).
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">Total Shifts: 3 (Once in a shift)</div>
        </div>
      </div>
    </div>
  );
};

export default RichAnalysisPage;
