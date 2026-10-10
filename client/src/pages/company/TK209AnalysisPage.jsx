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
  FlaskConical,
} from 'lucide-react';

// ─── TK 209 Parameters & Shift Rows Configuration ────────────────────────────
// Plant: ACL Plant ONLY
// Frequency: Once in a shift (I Shift, II Shift, III Shift)
// Unit: strictly Kgm/m³
//
// Parameters and official limits:
// 1. FNH3: Target: 0.68 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 0.58–0.78 Kgm/m³
// 2. CNH3: Target: 2.36 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 2.26–2.46 Kgm/m³
// 3. TCL:  Target: 3.04 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 2.94–3.14 Kgm/m³
// 4. PCL:  Target: 0.68 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 0.58–0.78 Kgm/m³

export const TK209_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 0.68,
    tolerance: 0.10,
    min: 0.58,
    max: 0.78,
    unit: 'Kgm/m³',
    formattedRange: '0.58–0.78 Kgm/m³',
    formattedTarget: '0.68 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.68',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 2.36,
    tolerance: 0.10,
    min: 2.26,
    max: 2.46,
    unit: 'Kgm/m³',
    formattedRange: '2.26–2.46 Kgm/m³',
    formattedTarget: '2.36 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '2.36',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 3.04,
    tolerance: 0.10,
    min: 2.94,
    max: 3.14,
    unit: 'Kgm/m³',
    formattedRange: '2.94–3.14 Kgm/m³',
    formattedTarget: '3.04 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.04',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 0.68,
    tolerance: 0.10,
    min: 0.58,
    max: 0.78,
    unit: 'Kgm/m³',
    formattedRange: '0.58–0.78 Kgm/m³',
    formattedTarget: '0.68 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.68',
  },
};

const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '0.68' },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '2.36' },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '3.04' },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '0.68' },
];

const SHIFTS = [
  { key: 'shift1', label: 'I SHIFT',   time: '06:00 – 14:00', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'shift2', label: 'II SHIFT',  time: '14:00 – 22:00', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { key: 'shift3', label: 'III SHIFT', time: '22:00 – 06:00', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFTS.map((s) => [s.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// Default screenshot / typical laboratory readings for TK 209
const buildDefaultData = () => ({
  shift1: { fnh3: '0.68', cnh3: '2.36', tcl: '3.04', pcl: '0.68' },
  shift2: { fnh3: '', cnh3: '', tcl: '', pcl: '' },
  shift3: { fnh3: '', cnh3: '', tcl: '', pcl: '' },
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

const TK209AnalysisPage = ({ plantId = 'acl' }) => {
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

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/tk-209-analysis?date=${date}`);
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


  // ── Cell Value Change Handler ──
  const handleCellChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...(prev[shiftKey] || {}),
        [paramKey]: value,
      },
    }));

    // Clear format error for this cell
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${shiftKey}_${paramKey}`];
      return copy;
    });
  }, []);

  // ── Reset Handler ──
  const handleReset = () => {
    setData(buildEmptyData());
    setErrors({});
    showToast?.('All input fields have been reset.', 'info');
  };

  // ── Validation ──
  const validateForm = () => {
    const newErrors = {};
    let hasError = false;

    SHIFTS.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            newErrors[`${s.key}_${p.key}`] = 'Invalid number';
            hasError = true;
          }
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // ── Save Handler ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    if (!date) {
      showToast?.('Please select an analysis date.', 'warning');
      return;
    }

    // Check if at least one value is entered
    const hasAnyValue = SHIFTS.some((s) =>
      PARAMETERS.some((p) => {
        const val = data[s.key]?.[p.key];
        return val !== '' && val !== null && val !== undefined;
      })
    );

    if (!hasAnyValue) {
      showToast?.('Please enter at least one measurement value for TK 209.', 'warning');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL',
      analysisType: 'TK 209 Analysis',
      tank: 'TK 209',
      unit: 'TK 209',
      frequency: 'Once in a shift',
      rows: data,
      parameters: data.shift1 || {},
      submittedBy: user?.name || 'Shift Chemist',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/tk-209-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast?.(response.data?.message || 'TK 209 Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      setSaving(false);
      console.error('[TK209Analysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb & Top Navigation ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back button + Breadcrumb + Title */}
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
                <Factory className="w-3.5 h-3.5 text-purple-600" />
                <span>{plantId?.toUpperCase() === 'TFL' ? 'TFL Plant' : 'ACL Plant'}</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-indigo-600 font-semibold">TK 209</span>
                <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                  Once in a shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                TK 209 ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-tk209-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
              title="Reset input fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-tk209-save"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                saveSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {saveSuccess && (
        <div
          id="tk209-success-banner"
          className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-bold shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>TK 209 Analysis data saved successfully to database!</span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-700 hover:text-emerald-900 font-extrabold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main Data Card ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Bar with Integrated Date Selector */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
                TK 209 Shift Measurements (Kgm/m³)
              </h2>
            </div>

            {/* Date Input */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="tk209-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <Calendar className="w-3 h-3 text-indigo-600" />
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                id="tk209-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-2.5 pr-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-700 bg-white shadow-2xs hover:border-slate-400 transition"
                required
              />
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium bg-slate-200/60 px-2 py-0.5 rounded-md">
                {formatDateDisplay(date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>Frequency: Once in a shift</span>
            <span>•</span>
            <span>Unit: Kgm/m³</span>
          </div>
        </div>

        {/* The Analysis Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-5 w-44 border-r border-slate-800">
                  Shift / Schedule
                </th>
                {PARAMETERS.map((param) => {
                  const limit = getCellLimit(plantId, 'tk209', 'shift1', param.key);
                  return (
                    <th
                      key={param.key}
                      className="py-3 px-4 text-center border-r border-slate-800 min-w-[150px] last:border-r-0"
                    >
                      <div className="font-extrabold text-indigo-300 text-xs">
                        {param.label}
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        Kgm/m³
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {SHIFTS.map((shift) => (
                <tr key={shift.key} className="hover:bg-slate-50/80 transition-colors">
                  {/* Shift Label */}
                  <td className="py-3 px-5 border-r border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                      <div>
                        <span className="font-extrabold text-slate-900 text-xs tracking-wide">
                          {shift.label}
                        </span>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {shift.time}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Parameter Cells */}
                  {PARAMETERS.map((param) => {
                    const cellVal = data[shift.key]?.[param.key] ?? '';
                    const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                    const limit = getCellLimit(plantId, 'tk209', shift.key, param.key) || TK209_LIMITS[param.key];
                    const validation = validateCellValue(cellVal, limit);
                    const isOutOfLimit = validation.isOutOfLimit;
                    const isNormal = validation.isNormal;
                    const isFormatError = !!errors[`${shift.key}_${param.key}`];

                    return (
                      <td
                        key={param.key}
                        className="py-3 px-4 border-r border-slate-100 last:border-r-0 text-center align-top"
                      >
                        <div className="flex flex-col items-center justify-start min-h-[62px] max-w-[140px] mx-auto">
                          <div className="relative w-full">
                            <input
                              id={`tk209-input-${shift.key}-${param.key}`}
                              type="text"
                              inputMode="decimal"
                              value={cellVal}
                              onChange={(e) => handleCellChange(shift.key, param.key, e.target.value)}
                              placeholder={param.placeholder}
                              title={
                                limit
                                  ? isOutOfLimit
                                    ? `OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                    : hasValue
                                    ? `NORMAL: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                    : `Allowed range: ${limit.formattedRange}`
                                  : ''
                              }
                              className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs focus:outline-none ${
                                isOutOfLimit
                                  ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                  : isFormatError
                                  ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                  : hasValue && isNormal
                                  ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                              }`}
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

                          {/* Error Message */}
                          {isFormatError && (
                            <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                              <span>Invalid number</span>
                            </div>
                          )}

                          {/* Status and Allowed Range Display */}
                          {!isFormatError && (
                            <div className="mt-1 flex flex-col items-center justify-center">
                              {hasValue && isNormal && (
                                <span
                                  id={`tk209-status-${shift.key}-${param.key}`}
                                  className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                  title={`NORMAL: within ${limit?.formattedRange || ''}`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>NORMAL</span>
                                </span>
                              )}

                              {hasValue && isOutOfLimit && (
                                <span
                                  id={`tk209-status-${shift.key}-${param.key}`}
                                  className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                  title={`OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit?.formattedRange || ''})`}
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                  <span>OUT OF LIMIT</span>
                                </span>
                              )}

                              {/* Allowed range displayed below each input field */}
                              <span
                                id={`tk209-range-${shift.key}-${param.key}`}
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Card Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">TK 209 Tolerance Limits:</span>
            <span>FNH₃: 0.58–0.78 • CNH₃: 2.26–2.46 • TCl: 2.94–3.14 • PCl: 0.58–0.78 Kgm/m³</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TK209AnalysisPage;
