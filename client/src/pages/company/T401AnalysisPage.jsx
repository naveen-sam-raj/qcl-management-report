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
  Layers,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

// 6 Tower Units (A through F)
const UNITS = [
  { key: 'a', label: 'T 401 A', subLabel: 'Tower Unit A' },
  { key: 'b', label: 'T 401 B', subLabel: 'Tower Unit B' },
  { key: 'c', label: 'T 401 C', subLabel: 'Tower Unit C' },
  { key: 'd', label: 'T 401 D', subLabel: 'Tower Unit D' },
  { key: 'e', label: 'T 401 E', subLabel: 'Tower Unit E' },
  { key: 'f', label: 'T 401 F', subLabel: 'Tower Unit F' },
];

// 3 Shifts (I, II, III)
const SHIFTS = [
  { key: 's1', label: 'I',   title: 'I Shift (07:00 – 15:00)',  badgeColor: 'bg-sky-100 text-sky-800 border-sky-300' },
  { key: 's2', label: 'II',  title: 'II Shift (15:00 – 23:00)', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { key: 's3', label: 'III', title: 'III Shift (23:00 – 07:00)', badgeColor: 'bg-purple-100 text-purple-800 border-purple-300' },
];

// 3 Parameters per shift
const PARAMETERS = [
  { key: 'cnh3', label: 'CNH₃', placeholder: '4.50' },
  { key: 'tcl',  label: 'TCl',  placeholder: '5.72' },
  { key: 'pcl',  label: 'PCl',  placeholder: '1.20' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    UNITS.map((u) => [
      u.key,
      Object.fromEntries(
        SHIFTS.map((s) => [
          s.key,
          Object.fromEntries(PARAMETERS.map((p) => [p.key, ''])),
        ])
      ),
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

// ─── Main Component ───────────────────────────────────────────────────────────

const T401AnalysisPage = ({ plantId = 'sa' }) => {
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

  // ── Input Changes ──
  const handleCellChange = useCallback((unitKey, shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setData((prev) => ({
      ...prev,
      [unitKey]: {
        ...prev[unitKey],
        [shiftKey]: {
          ...prev[unitKey][shiftKey],
          [paramKey]: value,
        },
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${unitKey}_${shiftKey}_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setData(buildEmptyData());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('T 401 analysis form cleared successfully.', 'info');
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

    UNITS.forEach((u) => {
      SHIFTS.forEach((s) => {
        PARAMETERS.forEach((p) => {
          const val = data[u.key][s.key][p.key];
          if (val !== '' && isNaN(Number(val))) {
            newErrors[`${u.key}_${s.key}_${p.key}`] = 'Invalid';
            isValid = false;
          }
        });
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

    const hasData = UNITS.some((u) =>
      SHIFTS.some((s) =>
        PARAMETERS.some((p) => data[u.key][s.key][p.key] !== '')
      )
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
        plant: 'SA',
        analysisType: 'T 401 Analysis',
        tower: 'T 401',
        units: data,
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/t-401-analysis', payload);

      setSaveSuccess(true);
      showToast(response.data?.message || 'T 401 Analysis data saved successfully!', 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save T 401 Analysis data.';
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
              id="btn-t401-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to SA Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">T 401</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                T 401 ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-t401-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Clear all fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-t401-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              title="Save T 401 data"
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
          id="t401-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              T 401 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
              htmlFor="t401-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="t401-date-input"
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
            6 Tower Units (A - F) · Shifts (I, II, III) · CNH₃, TCl, PCl
          </div>
        </div>
      </div>

      {/* ── 6 Tower Units Grid (3 Columns on Desktop, 2 on Tablet, 1 on Mobile) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
        {UNITS.map((unit) => (
          <div
            key={unit.key}
            className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col"
          >
            {/* Unit Header */}
            <div className="px-4 py-2.5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="font-mono font-black text-sm text-slate-100 tracking-wide">
                  {unit.label}
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                {unit.subLabel}
              </span>
            </div>

            {/* Unit Table */}
            <div className="p-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 font-extrabold uppercase">
                    <th className="pb-2 text-left w-14 font-extrabold text-[11px] text-slate-500">
                      SHIFT
                    </th>
                    {PARAMETERS.map((p) => (
                      <th
                        key={p.key}
                        className="pb-2 text-center font-extrabold text-[11px] text-slate-700"
                      >
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SHIFTS.map((shift) => (
                    <tr
                      key={shift.key}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Shift Badge */}
                      <td className="py-2 pr-2 align-middle">
                        <span
                          className={`font-mono font-extrabold px-2 py-0.5 rounded text-[11px] border shadow-2xs inline-block text-center w-8 ${shift.badgeColor}`}
                          title={shift.title}
                        >
                          {shift.label}
                        </span>
                      </td>

                      {/* Inputs (CNH3, TCl, PCl) */}
                      {PARAMETERS.map((param) => {
                        const cellVal = data[unit.key][shift.key][param.key];
                        const fieldKey = `${unit.key}_${shift.key}_${param.key}`;
                        const isInvalid = !!errors[fieldKey];

                        return (
                          <td key={param.key} className="py-2 px-1 text-center align-middle">
                            <input
                              id={`t401-input-${unit.key}-${shift.key}-${param.key}`}
                              type="text"
                              inputMode="decimal"
                              value={cellVal}
                              placeholder={param.placeholder}
                              onChange={(e) =>
                                handleCellChange(unit.key, shift.key, param.key, e.target.value)
                              }
                              className={`w-full max-w-[85px] mx-auto px-2 py-1 text-xs font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                                isInvalid
                                  ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                                  : cellVal !== ''
                                  ? 'border-2 border-blue-500 bg-blue-50/60 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                                  : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800'
                              }`}
                              aria-label={`${unit.label} Shift ${shift.label} ${param.label}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unit Footer Accent */}
            <div className="mt-auto px-4 py-1.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>CNH₃ · TCl · PCl</span>
              <span className="font-mono">3 Shifts</span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default T401AnalysisPage;
