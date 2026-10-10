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
  Layers,
} from 'lucide-react';

// ─── PCL/TCL Parameter & Limits Specification ────────────────────────────────
// Plant: ACL Plant ONLY
// Selection options: Streams A, B, C, D, E, F, G, H
// Frequency: Once in a Shift (I Shift, II Shift, III Shift)
// Parameter / Limit: PCL/TCL: 0.05–0.10 Kgm/m³ +0.2 / -0.02
// Allowed Range: 0.03–0.30 Kgm/m³ (Min: 0.05 - 0.02 = 0.03, Max: 0.10 + 0.20 = 0.30)
// Boundaries (0.03 and 0.30) are treated as NORMAL.

export const PCL_TCL_LIMITS = {
  pcltcl: {
    key: 'pcltcl',
    paramName: 'PCL/TCL',
    label: 'PCL/TCL',
    target: 0.10,
    tolerance: 0.20,
    min: 0.03,
    max: 0.30,
    unit: 'Kgm/m³',
    formattedRange: '0.03–0.30 Kgm/m³',
    formattedTarget: '0.05–0.10 Kgm/m³',
    formattedTolerance: '+0.2 / -0.02',
    notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02',
    placeholder: '0.10',
  },
};

// 8 Selection Options (Streams A through H)
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[85px]' },
];

// Frequency: Once in a Shift (3 Shifts)
const SHIFTS = [
  {
    key: 'shift1',
    label: 'I SHIFT',
    time: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'shift2',
    label: 'II SHIFT',
    time: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'shift3',
    label: 'III SHIFT',
    time: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
];

const buildEmptyShiftRows = () =>
  Object.fromEntries(
    SHIFTS.map((s) => [
      s.key,
      Object.fromEntries(STREAMS.map((st) => [st.key, ''])),
    ])
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

// ─── Individual Cell Component with Limit Badges & Formatting ─────────────────
const PclTclCell = ({
  id,
  value,
  onChange,
  limit,
  isInvalidFormat,
  formatErrorMessage,
  inputFocusStyle,
  ariaLabel,
  disabled = false,
  maxWidth = 'max-w-[85px]',
}) => {
  const validation = validateCellValue(value, limit);
  const isOutOfLimit = validation.isOutOfLimit;
  const isNormal = validation.isNormal;
  const hasValue = value !== '' && value !== null && value !== undefined;

  return (
    <div className="flex flex-col items-center justify-start min-h-[58px]">
      <div className={`relative w-full ${maxWidth}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          onChange={onChange}
          disabled={disabled}
          title={
            limit
              ? isOutOfLimit
                ? `OUT OF LIMIT: ${value} Kgm/m³ (Allowed: ${limit.formattedRange}, Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                : hasValue
                ? `NORMAL: ${value} Kgm/m³ (Allowed: ${limit.formattedRange})`
                : `Allowed range: ${limit.formattedRange} (Notation: ${limit.notation || limit.formattedRange})`
              : ''
          }
          className={`w-full ${maxWidth} mx-auto px-1.5 py-1.5 text-xs font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
            isOutOfLimit
              ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
              : isInvalidFormat
              ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
              : hasValue && isNormal
              ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
              : hasValue
              ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
              : inputFocusStyle
          }`}
          aria-label={ariaLabel}
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

      {isInvalidFormat && (
        <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
          <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
          <span className="whitespace-nowrap">{formatErrorMessage || 'Invalid'}</span>
        </div>
      )}

      {!isInvalidFormat && (
        <div className="mt-0.5 flex flex-col items-center justify-center">
          {hasValue && isNormal && (
            <span
              id={`${id}-status`}
              className="text-[9.5px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
              title={`NORMAL: within ${limit?.formattedRange || ''}`}
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              <span>NORMAL</span>
            </span>
          )}

          {hasValue && isOutOfLimit && (
            <span
              id={`${id}-status`}
              className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
              title={`OUT OF LIMIT: ${value} Kgm/m³ (Allowed: ${limit?.formattedRange || ''})`}
            >
              <AlertCircle className="w-2 h-2 text-rose-600 shrink-0" />
              <span>OUT OF LIMIT</span>
            </span>
          )}

          {limit?.formattedRange && (
            <span
              id={`${id}-range`}
              className={`text-[9px] font-semibold mt-0.5 tracking-tight whitespace-nowrap ${
                isOutOfLimit
                  ? 'text-rose-700 font-bold'
                  : hasValue
                  ? 'text-slate-600 font-bold'
                  : 'text-slate-400'
              }`}
              title={`PCL/TCL: ${limit.notation || limit.formattedRange}`}
            >
              {limit.formattedRange}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PclTclAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // Dynamic limit config from registry (editable in analysisValidation.js)
  const limitPclTcl = getCellLimit(plantId, 'pcl-tcl', 'shift', 'pcltcl') || PCL_TCL_LIMITS.pcltcl;

  // ── State ──
  const [date, setDate]               = useState('');
  const [shiftRows, setShiftRows]     = useState(buildEmptyShiftRows());
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError]     = useState(false);

  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/pcl-tcl-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
          const record = response.data.data[0];
          if (record) {
            if (record.shiftRows) {
              setShiftRows(record.shiftRows);
            } else {
              setShiftRows(buildEmptyShiftRows());
            }
          } else {
          setShiftRows(buildEmptyShiftRows());
          }
        } else {
          setShiftRows(buildEmptyShiftRows());
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
          setShiftRows(buildEmptyShiftRows());
      }
    };
    fetchExistingData();
  }, [date]);


  // ── Input Changes ──
  const handleCellChange = useCallback((shiftKey, streamKey, value) => {
    if (!isValidDecimal(value)) return;
    setShiftRows((prev) => ({
      ...prev,
      [shiftKey]: { ...prev[shiftKey], [streamKey]: value },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${shiftKey}_${streamKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setShiftRows(buildEmptyShiftRows());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('PCL/TCL analysis form cleared successfully.', 'info');
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

    SHIFTS.forEach((shift) => {
      STREAMS.forEach((s) => {
        const val = shiftRows[shift.key]?.[s.key];
        if (val !== '' && val !== undefined && val !== null && isNaN(Number(val))) {
          newErrors[`${shift.key}_${s.key}`] = 'Invalid';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [date, shiftRows]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasData = SHIFTS.some((shift) =>
      STREAMS.some((s) => (shiftRows[shift.key]?.[s.key] ?? '') !== '')
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
        analysisType: 'PCL/TCL Analysis',
        shiftRows,
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/pcl-tcl-analysis', payload);

      setSaveSuccess(true);
      showToast(response.data?.message || 'PCL/TCL Analysis data saved successfully!', 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save PCL/TCL Analysis data.';
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
          {/* Left: Back + Breadcrumb + Title */}
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
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">PCL/TCL</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                PCL/TCL ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="pcl-tcl-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="pcl-tcl-date-input"
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
                id="btn-pcltcl-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-pcltcl-save"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
                title="Save PCL/TCL data"
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
          id="pcltcl-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              PCL/TCL Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Shift / Frequency
                </th>
                {STREAMS.map((s, idx) => (
                  <th
                    key={s.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${s.colClass}`}
                  >
                    Stream {s.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Shift Rows (Frequency: Once in a Shift) */}
            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => (
                <tr
                  key={shift.key}
                  className={`transition-colors duration-100 ${shift.rowStyle}`}
                >
                  {/* Shift label & time */}
                  <td className="px-5 py-3 align-middle border-r border-slate-200/80 bg-white/70">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-900 whitespace-nowrap">
                        {shift.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                        {shift.time}
                      </span>
                      <span className="text-[9px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 mt-1 inline-block w-fit">
                        Once in a Shift
                      </span>
                    </div>
                  </td>

                  {/* Streams A through H Input Cells */}
                  {STREAMS.map((stream) => {
                    const fieldKey = `${shift.key}_${stream.key}`;
                    const cellVal = shiftRows[shift.key]?.[stream.key] ?? '';
                    const isInvalid = !!errors[fieldKey];

                    return (
                      <td
                        key={stream.key}
                        className="px-2 py-2 text-center align-middle"
                      >
                        <PclTclCell
                          id={`pcltcl-input-${shift.key}-${stream.key}`}
                          value={cellVal}
                          limit={limitPclTcl}
                          isInvalidFormat={isInvalid}
                          formatErrorMessage={errors[fieldKey]}
                          inputFocusStyle={shift.inputFocus}
                          ariaLabel={`Stream ${stream.label} - ${shift.label}`}
                          onChange={(e) =>
                            handleCellChange(shift.key, stream.key, e.target.value)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Parameter: <strong>PCL/TCL: 0.05–0.10 Kgm/m³ +0.2 / -0.02</strong> (Allowed range: <strong>0.03–0.30 Kgm/m³</strong>). Frequency: <strong>Once in a Shift</strong>.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-500 font-semibold">
            Streams: A, B, C, D, E, F, G, H
          </div>
        </div>
      </div>
    </div>
  );
};

export default PclTclAnalysisPage;
