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
  Globe,
  Droplets,
} from 'lucide-react';

// Shift rows matching laboratory shifts
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
];

// Parameters matching CBD laboratory report screenshot
const PARAMETERS = [
  { key: 'ph',     label: 'pH',     rawLabel: 'pH',     unit: '',    placeholder: '0.00', step: '0.1' },
  { key: 'po4',    label: 'PO₄',    rawLabel: 'PO4',    unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'na2so3', label: 'Na₂SO₃', rawLabel: 'Na2SO3', unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'talk',   label: 'T.Alk',  rawLabel: 'T.Alk',  unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tfe',    label: 'T.Fe',   rawLabel: 'T.Fe',   unit: 'ppm', placeholder: '0.00', step: '0.1' },
  { key: 'sio2',   label: 'SiO₂',   rawLabel: 'SiO2',   unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'ss',     label: 'SS',     rawLabel: 'SS',     unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tds',    label: 'TDS',    rawLabel: 'TDS',    unit: 'ppm', placeholder: '0.00', step: '1' },
];

const buildEmptyData = () => ({
  iShift:   { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
});

// Initial sample data from user's screenshot
const SCREENSHOT_DATA = {
  iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
  iiShift:  { ph: '0.0',  po4: '0',  na2so3: '0',  talk: '0',   tfe: '0', sio2: '0', ss: '0',  tds: '0' },
  iiiShift: { ph: '0.0',  po4: '0',  na2so3: '0',  talk: '0',   tfe: '0', sio2: '0', ss: '0',  tds: '0' },
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

const CBDAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => {
    // Match date from screenshot (13/09/2026) or today
    return '2026-09-13';
  });
  const [data, setData] = useState(SCREENSHOT_DATA);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // ── Cell Value Change ──
  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [paramKey]: value,
      },
    }));

    if (errors[`${shiftKey}_${paramKey}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${shiftKey}_${paramKey}`];
        return next;
      });
    }

    setSaveSuccess(false);
  }, [errors]);

  // ── Reset ──
  const handleReset = () => {
    setData(buildEmptyData());
    setDate('');
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('CBD analysis form cleared successfully.', 'info');
  };

  // ── Validation & Save ──
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
      plant: 'OFFSET',
      unit: 'CBD',
      analysisType: 'CBD Analysis',
      submittedBy: user?.name || 'Plant Operator',
      shifts: data,
    };

    try {
      const response = await api.post('/api/cbd-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast(response.data?.message || 'CBD Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 6000);
    } catch (err) {
      setSaving(false);
      console.error('[CBDAnalysis] Save failed:', err);
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
              id="btn-cbd-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to OFFSET Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                <span>OFFSET Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">CBD</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                CBD ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-cbd-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Clear all fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-cbd-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              title="Save CBD Analysis data"
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
          id="cbd-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              CBD Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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

      {/* ── Date Selection Row right below Heading Bar ─────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <label
              htmlFor="cbd-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="cbd-date-input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (dateError) setDateError(false);
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
                <AlertCircle className="w-3.5 h-3.5" /> Date is required to save the analysis.
              </p>
            )}
          </div>

          {/* Quick date picks */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setDate(today);
                setDateError(false);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDate('2026-09-13');
                setDateError(false);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
              title="13/09/2026 as in laboratory screenshot"
            >
              13/09/2026
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Data Table starting from the Left Side ─────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-blue-600" />
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              CBD Analysis Data Entry (Continuous Blowdown)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400 font-bold hidden sm:inline">
            pH · PO₄ · Na₂SO₃ · T.Alk · T.Fe · SiO₂ · SS · TDS
          </span>
        </div>

        {/* Scrollable table container */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]" id="cbd-table">
            {/* Header with Dark Navy styling */}
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
                    {p.unit && (
                      <div className="text-[10px] font-normal text-slate-400 lowercase tracking-normal">
                        {p.unit}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => (
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

                  {/* Parameter Input Cells */}
                  {PARAMETERS.map((param) => {
                    const fieldKey = `${shift.key}_${param.key}`;
                    const cellVal = data[shift.key][param.key];
                    const isInvalid = !!errors[fieldKey];
                    const errorMessage = errors[fieldKey];

                    return (
                      <td key={param.key} className="px-3 py-2.5 text-center align-middle">
                        <input
                          id={`cbd-input-${shift.key}-${param.key}`}
                          type="text"
                          inputMode="decimal"
                          value={cellVal}
                          onChange={(e) =>
                            handleChange(shift.key, param.key, e.target.value)
                          }
                          placeholder={param.placeholder}
                          className={`w-full max-w-[95px] mx-auto text-center text-sm font-mono font-bold px-3 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom helper bar */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Values for <strong>CBD Analysis</strong> (Continuous Blowdown Boiler Water: pH, PO₄, Na₂SO₃, T.Alk, T.Fe, SiO₂, SS, TDS). Numeric values only.
          </p>
          <div className="flex items-center gap-2">
            <button
              id="btn-cbd-save-bottom"
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

export default CBDAnalysisPage;
