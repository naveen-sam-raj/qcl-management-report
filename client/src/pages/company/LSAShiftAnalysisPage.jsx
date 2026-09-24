import React, { useState, useEffect, useCallback } from 'react';
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
  Flame,
  Layers,
} from 'lucide-react';

// ─── Shift Rows ───────────────────────────────────────────────────────────────
const SHIFTS = [
  {
    key: 'iShift',
    label: 'I SHIFT',
    desc: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
    badgeStyle: 'bg-blue-100 text-blue-900 border border-blue-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiShift',
    label: 'II SHIFT',
    desc: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiiShift',
    label: 'III SHIFT',
    desc: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badgeStyle: 'bg-purple-100 text-purple-900 border border-purple-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'composite',
    label: 'COMPOSITE',
    desc: '24-Hour Composite',
    isComposite: true,
    rowStyle: 'bg-amber-50/50 hover:bg-amber-100/70 border-l-4 border-l-amber-500',
    badgeStyle: 'bg-amber-100 text-amber-950 border border-amber-300 font-black',
    inputFocus: 'border-2 border-amber-300 bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-100 text-slate-950 font-bold hover:border-amber-400',
  },
];

// ─── Parameters Matching Original Lab Form ────────────────────────────────────
const PARAMETERS = [
  { key: 'na2co3',    label: 'Na₂CO₃', rawLabel: 'Na2CO3', unit: '%', isPercent: true,  placeholder: '0.00', step: '0.1' },
  { key: 'nacl',      label: 'NaCl',   rawLabel: 'NaCl',   unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
  { key: 'fe',        label: 'Fe',     rawLabel: 'Fe',     unit: '%', isPercent: true,  placeholder: '0.0000', step: '0.0001' },
  { key: 'na2so4',    label: 'Na₂SO₄', rawLabel: 'Na2SO4', unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
  { key: 'vm',        label: 'VM',     rawLabel: 'VM',     unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
  { key: 'ir',        label: 'IR',     rawLabel: 'IR',     unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
  { key: 'bd',        label: 'BD',     rawLabel: 'BD',     unit: 'kg/m³', isPercent: false, placeholder: '0.00', step: '1' },
  { key: 'turbidity', label: 'TURBIDITY SOLUTION', rawLabel: 'TURBIDITY', unit: 'NTU', isPercent: false, placeholder: '0.00', step: '1' },
];

const buildEmptyData = () => ({
  iShift:    { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  iiShift:   { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  iiiShift:  { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  composite: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
});

// Sample data matching user's reference screenshot
const SCREENSHOT_DATA = {
  iShift:    { na2co3: '99.1', nacl: '0.71', fe: '0.0030', na2so4: '0.000', vm: '0.14', ir: '',      bd: '635', turbidity: '63' },
  iiShift:   { na2co3: '99.1', nacl: '0.71', fe: '0.0029', na2so4: '0.000', vm: '0.16', ir: '',      bd: '641', turbidity: '66' },
  iiiShift:  { na2co3: '99.0', nacl: '0.81', fe: '0.0032', na2so4: '0.000', vm: '0.12', ir: '',      bd: '628', turbidity: '66' },
  composite: { na2co3: '99.1', nacl: '0.74', fe: '0.0030', na2so4: '0.064', vm: '0.14', ir: '0.100', bd: '635', turbidity: '65' },
};

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

const LSAShiftAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => {
    // Default to today's date formatted as YYYY-MM-DD
    return new Date().toISOString().split('T')[0];
  });
  const [data, setData] = useState(buildEmptyData());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // ── Input Changes ──
  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [paramKey]: value,
      },
    }));

    // Clear cell error if any
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${shiftKey}_${paramKey}`];
      return next;
    });

    setSaveSuccess(false);
  }, []);

  // ── Reset ──
  const handleReset = () => {
    setData(buildEmptyData());
    setDate('');
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('LSA Shift analysis form cleared successfully.', 'info');
  };

  // ── Validation & Submission ──
  const validate = () => {
    let hasError = false;

    if (!date) {
      setDateError(true);
      hasError = true;
    } else {
      setDateError(false);
    }

    const newErrors = {};
    SHIFTS.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key][p.key];
        if (val !== '' && isNaN(Number(val))) {
          newErrors[`${s.key}_${p.key}`] = 'Numbers only';
          hasError = true;
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  const handleSave = async () => {
    if (!validate()) {
      showToast('Please select analysis date and enter valid numeric values.', 'error');
      return;
    }

    const hasValues = Object.values(data).some((sObj) =>
      Object.values(sObj).some((val) => val !== '' && val !== null)
    );

    if (!hasValues) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: 'SA',
      unit: 'LSA',
      analysisType: 'LSA Shift Analysis',
      submittedBy: user?.name || 'Plant Operator',
      shifts: data,
    };

    try {
      const response = await api.post('/api/lsa-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast(response.data?.message || 'LSA Shift Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 6000);
    } catch (err) {
      setSaving(false);
      console.error('[LSAShiftAnalysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast('Save Error: ' + serverMessage, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-10">

      {/* ── Breadcrumb Header matching TK 203 theme ────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Back + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              id="btn-lsa-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to SA Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">LSA</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                LSA SHIFT ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-lsa-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Clear all fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-lsa-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              title="Save LSA Shift data"
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
          id="lsa-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              LSA Shift Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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

      {/* ── Date Selection Card matching TK 203 theme ─────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <label
              htmlFor="lsa-shift-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="lsa-shift-date-input"
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
        </div>
      </div>

      {/* ── Analysis Table Card matching TK 203 theme ──────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* Table header label bar with blue indicator */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-blue-600" />
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              LSA Shift Analysis Data Entry (I, II, III Shift & Composite)
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-400 font-mono hidden sm:inline">
            Na₂CO₃ · NaCl · Fe · Na₂SO₄ · VM · IR · BD · Turbidity
          </span>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            {/* Column headers with dark navy styling */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  SHIFT
                </th>

                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 border-r border-slate-800/50 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    }`}
                  >
                    <div>{p.label}</div>
                    <div className="text-[10px] font-normal text-slate-400 lowercase tracking-normal">
                      {p.unit}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows with shift styling */}
            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => {
                return (
                  <tr
                    key={shift.key}
                    className={`transition-colors duration-100 ${shift.rowStyle}`}
                  >
                    {/* Shift Label Badge */}
                    <td className="px-5 py-3 align-middle whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className={`text-xs font-mono px-2.5 py-1 rounded shadow-2xs inline-block text-center ${shift.badgeStyle}`}>
                          {shift.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium mt-0.5 text-center">
                          {shift.desc}
                        </span>
                      </div>
                    </td>

                    {/* Parameter Input Cells matching TK 203 rounded inputs */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${shift.key}_${param.key}`;
                      const cellVal = data[shift.key][param.key];
                      const isInvalid = !!errors[fieldKey];
                      const errorMessage = errors[fieldKey];

                      return (
                        <td key={param.key} className="px-3 py-2.5 text-center align-middle">
                          <input
                            id={`lsa-input-${shift.key}-${param.key}`}
                            type="text"
                            inputMode="decimal"
                            value={cellVal}
                            onChange={(e) =>
                              handleChange(shift.key, param.key, e.target.value)
                            }
                            placeholder={param.placeholder}
                            className={`w-full max-w-[105px] mx-auto text-center text-sm font-mono font-bold px-3 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                              isInvalid
                                ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                : shift.inputFocus
                            }`}
                            aria-label={`${shift.label} ${param.label}`}
                          />

                          {/* Error Message if invalid format */}
                          {isInvalid && (
                            <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                              <span>{errorMessage}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer hint & bottom action */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Values for <strong>LSA Shift Analysis</strong> (Na₂CO₃, NaCl, Fe, Na₂SO₄, VM, IR, BD, Turbidity). Numeric values only.
          </p>
          <div className="flex items-center gap-2">
            <button
              id="btn-lsa-save-bottom"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
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
  );
};

export default LSAShiftAnalysisPage;
