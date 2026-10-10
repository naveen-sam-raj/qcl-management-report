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

// ─── CR 202 Parameters & Limits Configuration (ACL Plant ONLY) ────────────────
// Frequency: ONCE IN A SHIFT
// Unit: strictly Kgm/m³
//
// Parameters and official limits:
// 1. FNH3: Target: 3.10 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 3.00–3.20 Kgm/m³
// 2. CNH3: Target: 2.98 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 2.88–3.08 Kgm/m³
// 3. TCL:  Target: 4.65 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 4.55–4.75 Kgm/m³
// 4. PCL:  Target: 1.90 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 1.80–2.00 Kgm/m³

export const CR202_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 3.10,
    tolerance: 0.10,
    min: 3.00,
    max: 3.20,
    unit: 'Kgm/m³',
    formattedRange: '3.00–3.20 Kgm/m³',
    formattedTarget: '3.10 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.10',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 2.98,
    tolerance: 0.10,
    min: 2.88,
    max: 3.08,
    unit: 'Kgm/m³',
    formattedRange: '2.88–3.08 Kgm/m³',
    formattedTarget: '2.98 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '2.98',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 4.65,
    tolerance: 0.10,
    min: 4.55,
    max: 4.75,
    unit: 'Kgm/m³',
    formattedRange: '4.55–4.75 Kgm/m³',
    formattedTarget: '4.65 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '4.65',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 1.90,
    tolerance: 0.10,
    min: 1.80,
    max: 2.00,
    unit: 'Kgm/m³',
    formattedRange: '1.80–2.00 Kgm/m³',
    formattedTarget: '1.90 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.90',
  },
};

// 8 Streams (A through H) for CR 202
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[80px] border-r border-slate-800/50' },
];

// 4-Hourly Time Slots (07:00, 11:00, 15:00, 19:00, 23:00, 03:00)
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shiftGroup: 'shift1' },
  { key: 't11', time: '11:00', shiftGroup: 'shift1' },
  { key: 't15', time: '15:00', shiftGroup: 'shift2' },
  { key: 't19', time: '19:00', shiftGroup: 'shift2' },
  { key: 't23', time: '23:00', shiftGroup: 'shift3' },
  { key: 't03', time: '03:00', shiftGroup: 'shift3' },
];

const buildEmptyTimeRows = () =>
  Object.fromEntries(
    TIME_SLOTS.map((slot) => [
      slot.key,
      {
        ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
        avgTcl: '',
        avgAH: '',
      },
    ])
  );

const buildEmptyFnh3Row = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
  avgAH: '',
});

const buildEmptyPclRow = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
  avgAH: '',
});

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

const getRowStyles = (shiftGroup) => {
  if (shiftGroup === 'shift1') {
    return {
      row:        'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (shiftGroup === 'shift2') {
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

// Compute average across streams A through H (sum / 8)
const computeAvgAH = (rowObj) => {
  let sum = 0;
  let count = 0;
  STREAMS.forEach((s) => {
    const val = rowObj[s.key];
    if (val !== '' && !isNaN(Number(val))) {
      sum += Number(val);
      count++;
    }
  });
  if (count === 0) return '';
  return (sum / 8).toFixed(2);
};

// ─── Individual Cell Component with Limit Badges & Formatting ─────────────────
const CR202Cell = ({
  id,
  value,
  onChange,
  limit,
  isInvalidFormat,
  formatErrorMessage,
  inputFocusStyle,
  ariaLabel,
  disabled = false,
  maxWidth = 'max-w-[80px]',
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
                : `Allowed range: ${limit.formattedRange} (Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
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
              title={`Target: ${limit?.formattedTarget || ''} (${limit?.formattedTolerance || ''})`}
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

const CR202AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── Limits from Central Registry with local fallback ──
  const limitFNH3 = getCellLimit(plantId, 'cr202', 'shift', 'fnh3') || CR202_LIMITS.fnh3;
  const limitCNH3 = getCellLimit(plantId, 'cr202', 'shift', 'cnh3') || CR202_LIMITS.cnh3;
  const limitTCL  = getCellLimit(plantId, 'cr202', 'shift', 'tcl')  || CR202_LIMITS.tcl;
  const limitPCL  = getCellLimit(plantId, 'cr202', 'shift', 'pcl')  || CR202_LIMITS.pcl;

  // ── State ──
  const [date, setDate]         = useState('');
  const [timeRows, setTimeRows] = useState(buildEmptyTimeRows());
  const [fnh3Row, setFnh3Row]   = useState(buildEmptyFnh3Row());
  const [pclRow, setPclRow]     = useState(buildEmptyPclRow());
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/cr-202-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
          const record = response.data.data[0];
          if (record) {
            if (record.timeRows) {
              setTimeRows(record.timeRows);
            } else {
              setTimeRows(buildEmptyTimeRows());
            }
            if (record.fnh3Row) {
              setFnh3Row(record.fnh3Row);
            } else {
              setFnh3Row(buildEmptyFnh3Row());
            }
            if (record.pclRow) {
              setPclRow(record.pclRow);
            } else {
              setPclRow(buildEmptyPclRow());
            }
          } else {
          setTimeRows(buildEmptyTimeRows());
          setFnh3Row(buildEmptyFnh3Row());
          setPclRow(buildEmptyPclRow());
          }
        } else {
          setTimeRows(buildEmptyTimeRows());
          setFnh3Row(buildEmptyFnh3Row());
          setPclRow(buildEmptyPclRow());
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
          setTimeRows(buildEmptyTimeRows());
          setFnh3Row(buildEmptyFnh3Row());
          setPclRow(buildEmptyPclRow());
      }
    };
    fetchExistingData();
  }, [date]);


  // ── Input Changes ──
  const handleTimeCellChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setTimeRows((prev) => {
      const updatedRow = { ...prev[rowKey], [paramKey]: value };
      // Auto-update AVG A-H if stream changed
      if (STREAMS.some((s) => s.key === paramKey)) {
        updatedRow.avgAH = computeAvgAH(updatedRow);
      }
      return {
        ...prev,
        [rowKey]: updatedRow,
      };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  const handleFnh3CellChange = useCallback((paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setFnh3Row((prev) => {
      const updatedFnh3 = { ...prev, [paramKey]: value };
      // Auto-update AVG A-H if stream changed
      if (STREAMS.some((s) => s.key === paramKey)) {
        updatedFnh3.avgAH = computeAvgAH(updatedFnh3);
      }
      return updatedFnh3;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`fnh3_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  const handlePclCellChange = useCallback((paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setPclRow((prev) => {
      const updatedPcl = { ...prev, [paramKey]: value };
      // Auto-update AVG A-H if stream changed
      if (STREAMS.some((s) => s.key === paramKey)) {
        updatedPcl.avgAH = computeAvgAH(updatedPcl);
      }
      return updatedPcl;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`pcl_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setTimeRows(buildEmptyTimeRows());
    setFnh3Row(buildEmptyFnh3Row());
    setPclRow(buildEmptyPclRow());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('CR 202 analysis form cleared successfully.', 'info');
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

    TIME_SLOTS.forEach((slot) => {
      STREAMS.forEach((s) => {
        const val = timeRows[slot.key][s.key];
        if (val !== '' && isNaN(Number(val))) {
          newErrors[`${slot.key}_${s.key}`] = 'Invalid';
          isValid = false;
        }
      });
      const avgVal = timeRows[slot.key].avgTcl;
      if (avgVal !== '' && isNaN(Number(avgVal))) {
        newErrors[`${slot.key}_avgTcl`] = 'Invalid';
        isValid = false;
      }
      const avgAHVal = timeRows[slot.key].avgAH;
      if (avgAHVal !== '' && isNaN(Number(avgAHVal))) {
        newErrors[`${slot.key}_avgAH`] = 'Invalid';
        isValid = false;
      }
    });

    // FNH3 row validation
    STREAMS.forEach((s) => {
      const val = fnh3Row[s.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[`fnh3_${s.key}`] = 'Invalid';
        isValid = false;
      }
    });
    if (fnh3Row.avgTcl !== '' && isNaN(Number(fnh3Row.avgTcl))) {
      newErrors['fnh3_avgTcl'] = 'Invalid';
      isValid = false;
    }
    if (fnh3Row.avgAH !== '' && isNaN(Number(fnh3Row.avgAH))) {
      newErrors['fnh3_avgAH'] = 'Invalid';
      isValid = false;
    }

    // PCl row validation
    STREAMS.forEach((s) => {
      const val = pclRow[s.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[`pcl_${s.key}`] = 'Invalid';
        isValid = false;
      }
    });

    if (pclRow.avgTcl !== '' && isNaN(Number(pclRow.avgTcl))) {
      newErrors['pcl_avgTcl'] = 'Invalid';
      isValid = false;
    }
    if (pclRow.avgAH !== '' && isNaN(Number(pclRow.avgAH))) {
      newErrors['pcl_avgAH'] = 'Invalid';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }, [date, timeRows, fnh3Row, pclRow]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasTimeData = TIME_SLOTS.some((slot) =>
      STREAMS.some((s) => timeRows[slot.key][s.key] !== '') ||
      timeRows[slot.key].avgTcl !== '' ||
      timeRows[slot.key].avgAH !== ''
    );
    const hasFnh3Data =
      STREAMS.some((s) => fnh3Row[s.key] !== '') ||
      fnh3Row.avgTcl !== '' ||
      fnh3Row.avgAH !== '';
    const hasPclData =
      STREAMS.some((s) => pclRow[s.key] !== '') ||
      pclRow.avgTcl !== '' ||
      pclRow.avgAH !== '';

    if (!hasTimeData && !hasFnh3Data && !hasPclData) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: 'ACL',
        analysisType: 'CR 202 Analysis',
        crystallizer: 'CR 202',
        timeRows,
        fnh3Row,
        pclRow,
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/cr-202-analysis', payload);

      setSaveSuccess(true);
      showToast(response.data?.message || 'CR 202 Analysis data saved successfully!', 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save CR 202 Analysis data.';
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
          {/* Left: Titles */}
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
                <span className="text-blue-600 font-semibold">Cr 202</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  CR 202 ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                  ONCE IN A SHIFT
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="cr202-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="cr202-date-input"
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
                id="btn-cr202-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-cr202-save"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
                title="Save CR 202 data"
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
          id="cr202-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              CR 202 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
          <table className="w-full min-w-[950px] text-sm">
            {/* Column headers with Super-Header for CNH3 */}
            <thead>
              {/* Row 1: Grouping Header */}
              <tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
                <th className="px-5 py-2 text-left w-28 sm:w-32 border-r border-slate-800 text-slate-300">
                  CR 202
                </th>
                <th colSpan={8} className="px-3 py-2 text-center border-r border-slate-800 bg-blue-950/80 text-blue-200">
                  <span className="inline-flex items-center gap-2">
                    <span>←</span>
                    <span className="font-mono tracking-widest font-black">CNH₃</span>
                    <span>→</span>
                  </span>
                </th>
                <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[85px] border-r border-slate-800">
                  AVG
                </th>
                <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[85px]">
                  AVG
                </th>
              </tr>

              {/* Row 2: Sub-columns (Time, A through H, AVG TCl, AVG A-H) */}
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider w-28 sm:w-32 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Time
                </th>
                {STREAMS.map((s, idx) => (
                  <th
                    key={s.key}
                    className={`px-2.5 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${s.colClass}`}
                  >
                    {s.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[85px] border-r border-slate-800">
                  TCl
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[85px]">
                  A-H
                </th>
              </tr>
            </thead>

            {/* Time Slot Rows (4-hourly) */}
            <tbody className="divide-y divide-slate-200">
              {TIME_SLOTS.map((slot) => {
                const styles = getRowStyles(slot.shiftGroup);
                return (
                  <tr
                    key={slot.key}
                    className={`transition-colors duration-100 ${styles.row}`}
                  >
                    {/* Time slot label */}
                    <td className="px-5 py-2.5 align-middle">
                      <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                        {slot.time}
                      </span>
                    </td>

                    {/* Stream CNH3 input cells (A to H) */}
                    {STREAMS.map((stream) => {
                      const fieldKey = `${slot.key}_${stream.key}`;
                      const cellVal = timeRows[slot.key][stream.key];

                      return (
                        <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                          <CR202Cell
                            id={`cr202-input-${slot.key}-${stream.key}`}
                            value={cellVal}
                            onChange={(e) =>
                              handleTimeCellChange(slot.key, stream.key, e.target.value)
                            }
                            limit={limitCNH3}
                            isInvalidFormat={!!errors[fieldKey]}
                            formatErrorMessage={errors[fieldKey]}
                            inputFocusStyle={styles.inputFocus}
                            ariaLabel={`CNH3 Stream ${stream.label} at ${slot.time}`}
                            maxWidth="max-w-[78px]"
                          />
                        </td>
                      );
                    })}

                    {/* AVG TCl cell */}
                    <td className="px-2 py-2 text-center align-top bg-slate-50/50 border-r border-slate-200">
                      <CR202Cell
                        id={`cr202-input-${slot.key}-avgtcl`}
                        value={timeRows[slot.key].avgTcl}
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgTcl', e.target.value)
                        }
                        limit={limitTCL}
                        isInvalidFormat={!!errors[`${slot.key}_avgTcl`]}
                        formatErrorMessage={errors[`${slot.key}_avgTcl`]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900"
                        ariaLabel={`AVG TCl at ${slot.time}`}
                        maxWidth="max-w-[82px]"
                      />
                    </td>

                    {/* AVG A-H cell (Auto-calculated / Editable) */}
                    <td className="px-2 py-2 text-center align-top bg-slate-100/50">
                      <CR202Cell
                        id={`cr202-input-${slot.key}-avgah`}
                        value={timeRows[slot.key].avgAH}
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgAH', e.target.value)
                        }
                        limit={limitCNH3}
                        isInvalidFormat={!!errors[`${slot.key}_avgAH`]}
                        formatErrorMessage={errors[`${slot.key}_avgAH`]}
                        inputFocusStyle="border-2 border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-800"
                        ariaLabel={`AVG A-H at ${slot.time}`}
                        maxWidth="max-w-[82px]"
                      />
                    </td>
                  </tr>
                );
              })}

              {/* ── Special Row: FNH3 ── */}
              <tr className="bg-emerald-50/40 hover:bg-emerald-100/50 border-t-2 border-emerald-300 border-l-4 border-l-emerald-600 transition-colors">
                <td className="px-5 py-3 align-middle">
                  <span className="text-xs font-extrabold text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded shadow-2xs inline-block whitespace-nowrap">
                    FNH₃
                  </span>
                </td>
                {STREAMS.map((stream) => {
                  const fieldKey = `fnh3_${stream.key}`;
                  const cellVal = fnh3Row[stream.key];

                  return (
                    <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                      <CR202Cell
                        id={`cr202-input-fnh3-${stream.key}`}
                        value={cellVal}
                        onChange={(e) =>
                          handleFnh3CellChange(stream.key, e.target.value)
                        }
                        limit={limitFNH3}
                        isInvalidFormat={!!errors[fieldKey]}
                        formatErrorMessage={errors[fieldKey]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-900"
                        ariaLabel={`FNH3 Stream ${stream.label}`}
                        maxWidth="max-w-[78px]"
                      />
                    </td>
                  );
                })}

                {/* AVG TCl for FNH3 row */}
                <td className="px-2 py-2 text-center align-top bg-slate-100/60 border-r border-slate-200">
                  <CR202Cell
                    id="cr202-input-fnh3-avgtcl"
                    value={fnh3Row.avgTcl}
                    onChange={(e) =>
                      handleFnh3CellChange('avgTcl', e.target.value)
                    }
                    limit={limitTCL}
                    isInvalidFormat={!!errors['fnh3_avgTcl']}
                    formatErrorMessage={errors['fnh3_avgTcl']}
                    inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-900"
                    ariaLabel="FNH3 AVG TCl"
                    maxWidth="max-w-[82px]"
                  />
                </td>

                {/* AVG A-H for FNH3 row */}
                <td className="px-2 py-2 text-center align-top bg-slate-100/80">
                  <CR202Cell
                    id="cr202-input-fnh3-avgah"
                    value={fnh3Row.avgAH}
                    onChange={(e) =>
                      handleFnh3CellChange('avgAH', e.target.value)
                    }
                    limit={limitFNH3}
                    isInvalidFormat={!!errors['fnh3_avgAH']}
                    formatErrorMessage={errors['fnh3_avgAH']}
                    inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-900"
                    ariaLabel="FNH3 AVG A-H"
                    maxWidth="max-w-[82px]"
                  />
                </td>
              </tr>

              {/* ── Special Bottom Row: PCl ── */}
              <tr className="bg-sky-50/50 hover:bg-sky-100/60 border-t-2 border-sky-300 border-l-4 border-l-blue-600 transition-colors">
                <td className="px-5 py-3 align-middle">
                  <span className="text-xs font-extrabold text-blue-900 bg-blue-100 border border-blue-300 px-3 py-1 rounded shadow-2xs inline-block whitespace-nowrap">
                    PCl
                  </span>
                </td>
                {STREAMS.map((stream) => {
                  const fieldKey = `pcl_${stream.key}`;
                  const cellVal = pclRow[stream.key];

                  return (
                    <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                      <CR202Cell
                        id={`cr202-input-pcl-${stream.key}`}
                        value={cellVal}
                        onChange={(e) =>
                          handlePclCellChange(stream.key, e.target.value)
                        }
                        limit={limitPCL}
                        isInvalidFormat={!!errors[fieldKey]}
                        formatErrorMessage={errors[fieldKey]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900"
                        ariaLabel={`PCl Stream ${stream.label}`}
                        maxWidth="max-w-[78px]"
                      />
                    </td>
                  );
                })}

                {/* AVG TCl for PCl row */}
                <td className="px-2 py-2 text-center align-top bg-slate-100/60 border-r border-slate-200">
                  <CR202Cell
                    id="cr202-input-pcl-avgtcl"
                    value={pclRow.avgTcl}
                    onChange={(e) =>
                      handlePclCellChange('avgTcl', e.target.value)
                    }
                    limit={limitTCL}
                    isInvalidFormat={!!errors['pcl_avgTcl']}
                    formatErrorMessage={errors['pcl_avgTcl']}
                    inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900"
                    ariaLabel="PCl AVG TCl"
                    maxWidth="max-w-[82px]"
                  />
                </td>

                {/* AVG A-H for PCl row */}
                <td className="px-2 py-2 text-center align-top bg-slate-100/80">
                  <CR202Cell
                    id="cr202-input-pcl-avgah"
                    value={pclRow.avgAH}
                    onChange={(e) =>
                      handlePclCellChange('avgAH', e.target.value)
                    }
                    limit={limitPCL}
                    isInvalidFormat={!!errors['pcl_avgAH']}
                    formatErrorMessage={errors['pcl_avgAH']}
                    inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-900"
                    ariaLabel="PCl AVG A-H"
                    maxWidth="max-w-[82px]"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Values for <strong>CR 202 (CNH₃ Streams A - H)</strong>, <strong>FNH₃</strong>, <strong>AVG TCl</strong>, <strong>AVG A-H</strong> and <strong>PCl</strong>. Numeric values only.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Slots: 6 + 1 (FNH₃) + 1 (PCl) · Live AVG A-H Calculation · Limits: Kgm/m³
          </div>
        </div>
      </div>
    </div>
  );
};

export default CR202AnalysisPage;
