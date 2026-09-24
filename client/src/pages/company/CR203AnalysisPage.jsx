import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
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

// ─── Constants ────────────────────────────────────────────────────────────────

// 8 Streams (A through H) for CNH3
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
      },
    ])
  );

const buildEmptyPclRow = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
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

// ─── Main Component ───────────────────────────────────────────────────────────

const CR203AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── State ──
  const [date, setDate]         = useState('');
  const [timeRows, setTimeRows] = useState(buildEmptyTimeRows());
  const [pclRow, setPclRow]     = useState(buildEmptyPclRow());
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // ── Input Changes ──
  const handleTimeCellChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setTimeRows((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  const handlePclCellChange = useCallback((paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setPclRow((prev) => ({
      ...prev,
      [paramKey]: value,
    }));
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
    setPclRow(buildEmptyPclRow());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('CR 203 analysis form cleared successfully.', 'info');
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
    });

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

    setErrors(newErrors);
    return isValid;
  }, [date, timeRows, pclRow]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasTimeData = TIME_SLOTS.some((slot) =>
      STREAMS.some((s) => timeRows[slot.key][s.key] !== '') || timeRows[slot.key].avgTcl !== ''
    );
    const hasPclData = STREAMS.some((s) => pclRow[s.key] !== '') || pclRow.avgTcl !== '';

    if (!hasTimeData && !hasPclData) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: 'ACL',
        analysisType: 'CR 203 Analysis',
        crystallizer: 'CR 203',
        timeRows,
        pclRow,
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/cr-203-analysis', payload);

      setSaveSuccess(true);
      showToast(response.data?.message || 'CR 203 Analysis data saved successfully!', 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save CR 203 Analysis data.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-14">

      {/* ── Breadcrumb Header ──────────────────────────────────────────────── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back + Titles */}
          <div className="flex items-center gap-3">
            <button
              id="btn-cr203-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to ACL Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">Cr 203</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                CR 203 ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-cr203-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Clear all fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-cr203-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              title="Save CR 203 data"
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

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="cr203-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              CR 203 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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

      {/* ── Date Selection Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <label
              htmlFor="cr203-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="cr203-date-input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateError(false);
                  setSaveSuccess(false);
                }}
                className={`pl-9 pr-3 py-1.5 text-xs font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 ${
                  dateError
                    ? 'border-red-400 bg-red-50 focus:ring-red-400'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              />
            </div>
            {date && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-md">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-bold text-blue-700">
                  {formatDateDisplay(date)}
                </span>
              </div>
            )}
            {dateError && (
              <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                Date is required to save the analysis.
              </p>
            )}
          </div>
          <div className="text-xs font-semibold text-slate-500">
            CNH₃ Streams (A - H) · 4-Hourly Intervals + AVG TCl &amp; PCl
          </div>
        </div>
      </div>

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* Table header label */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-blue-600" />
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              CR 203 Analysis Data Entry (CNH₃ Streams &amp; AVG TCl)
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            6 Time Slots + PCl
          </span>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            {/* Column headers with Super-Header for CNH3 */}
            <thead>
              {/* Row 1: Grouping Header */}
              <tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
                <th className="px-5 py-2 text-left w-28 sm:w-32 border-r border-slate-800 text-slate-300">
                  CR 203
                </th>
                <th colSpan={8} className="px-3 py-2 text-center border-r border-slate-800 bg-blue-950/80 text-blue-200">
                  <span className="inline-flex items-center gap-2">
                    <span>←</span>
                    <span className="font-mono tracking-widest font-black">CNH₃</span>
                    <span>→</span>
                  </span>
                </th>
                <th className="px-4 py-2 text-center bg-slate-900 text-slate-200 min-w-[95px]">
                  AVG
                </th>
              </tr>

              {/* Row 2: Sub-columns (Time, A through H, AVG TCl) */}
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider w-28 sm:w-32 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Time
                </th>
                {STREAMS.map((s, idx) => (
                  <th
                    key={s.key}
                    className={`px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${s.colClass}`}
                  >
                    {s.label}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[95px]">
                  TCl
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
                      const isInvalid = !!errors[fieldKey];

                      return (
                        <td key={stream.key} className="px-2 py-2.5 text-center align-middle">
                          <input
                            id={`cr203-input-${slot.key}-${stream.key}`}
                            type="text"
                            inputMode="decimal"
                            value={cellVal}
                            placeholder="0.00"
                            onChange={(e) =>
                              handleTimeCellChange(slot.key, stream.key, e.target.value)
                            }
                            className={`w-full max-w-[80px] mx-auto px-2 py-1.5 text-xs font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                              isInvalid
                                ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                                : cellVal !== ''
                                ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                                : styles.inputFocus
                            }`}
                            aria-label={`CNH3 Stream ${stream.label} at ${slot.time}`}
                          />
                        </td>
                      );
                    })}

                    {/* AVG TCl cell */}
                    <td className="px-3 py-2.5 text-center align-middle bg-slate-50/50">
                      <input
                        id={`cr203-input-${slot.key}-avgtcl`}
                        type="text"
                        inputMode="decimal"
                        value={timeRows[slot.key].avgTcl}
                        placeholder="0.00"
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgTcl', e.target.value)
                        }
                        className={`w-full max-w-[88px] mx-auto px-2 py-1.5 text-xs font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          errors[`${slot.key}_avgTcl`]
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : timeRows[slot.key].avgTcl !== ''
                            ? 'border-2 border-indigo-500 bg-indigo-50 text-indigo-900 font-black focus:ring-2 focus:ring-indigo-200'
                            : 'border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900'
                        }`}
                        aria-label={`AVG TCl at ${slot.time}`}
                      />
                    </td>
                  </tr>
                );
              })}

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
                  const isInvalid = !!errors[fieldKey];

                  return (
                    <td key={stream.key} className="px-2 py-3 text-center align-middle">
                      <input
                        id={`cr203-input-pcl-${stream.key}`}
                        type="text"
                        inputMode="decimal"
                        value={cellVal}
                        placeholder="0.00"
                        onChange={(e) =>
                          handlePclCellChange(stream.key, e.target.value)
                        }
                        className={`w-full max-w-[80px] mx-auto px-2 py-1.5 text-xs font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          isInvalid
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : cellVal !== ''
                            ? 'border-2 border-blue-500 bg-blue-100/50 text-blue-950 font-extrabold focus:ring-2 focus:ring-blue-200'
                            : 'border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                        }`}
                        aria-label={`PCl Stream ${stream.label}`}
                      />
                    </td>
                  );
                })}

                {/* Optional AVG TCl for PCl row */}
                <td className="px-3 py-3 text-center align-middle bg-slate-100/60">
                  <input
                    id="cr203-input-pcl-avgtcl"
                    type="text"
                    inputMode="decimal"
                    value={pclRow.avgTcl}
                    placeholder="0.00"
                    onChange={(e) =>
                      handlePclCellChange('avgTcl', e.target.value)
                    }
                    className="w-full max-w-[88px] mx-auto px-2 py-1.5 text-xs font-mono font-bold text-center rounded-lg border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 transition-all focus:outline-none shadow-2xs"
                    aria-label="PCl AVG TCl"
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
              Values for <strong>CR 203 (CNH₃ Streams A - H)</strong>, <strong>AVG TCl</strong> and <strong>PCl</strong>. Numeric values only.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Slots: 6 + 1 (PCl)
          </div>
        </div>
      </div>
    </div>
  );
};

export default CR203AnalysisPage;
