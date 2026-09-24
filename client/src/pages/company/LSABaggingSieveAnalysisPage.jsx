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
  Plus,
  Trash2,
  Flame,
  Layers,
} from 'lucide-react';

// Sieve size parameters matching the user's laboratory screenshot
const PARAMETERS = [
  { key: 'p10', label: '+10 %',    rawLabel: '+10%',    unit: '%', placeholder: '0.0', colClass: 'min-w-[120px]' },
  { key: 'p30', label: '-10 +30 %', rawLabel: '-10+30%', unit: '%', placeholder: '0.0', colClass: 'min-w-[120px]' },
  { key: 'p60', label: '-30 +60 %', rawLabel: '-30+60%', unit: '%', placeholder: '0.0', colClass: 'min-w-[120px]' },
  { key: 'm60', label: '+60 %',    rawLabel: '+60%',    unit: '%', placeholder: '0.0', colClass: 'min-w-[120px]' },
];

// Pre-configured sampling time slots based on screenshot & standard shift schedule
const DEFAULT_ROWS = [
  { id: 'r1',  time: '09:30', p10: '0.1', p30: '0.4', p60: '4.0', m60: '4.5', isDefault: true },
  { id: 'r2',  time: '10:30', p10: '0.1', p30: '0.4', p60: '4.1', m60: '4.6', isDefault: true },
  { id: 'r3',  time: '11:30', p10: '0.1', p30: '0.4', p60: '4.0', m60: '4.5', isDefault: true },
  { id: 'r4',  time: '14:30', p10: '0.1', p30: '0.3', p60: '4.2', m60: '4.6', isDefault: true },
  { id: 'r5',  time: '16:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r6',  time: '18:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r7',  time: '20:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r8',  time: '22:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r9',  time: '00:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r10', time: '02:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r11', time: '04:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r12', time: '06:30', p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
];

const buildEmptyRows = () =>
  DEFAULT_ROWS.map((r) => ({ ...r, p10: '', p30: '', p60: '', m60: '' }));

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

const LSABaggingSieveAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => {
    // Match date from screenshot (13/09/2026) or today
    return '2026-09-13';
  });
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // ── Cell Value Change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    if (errors[`${id}_${field}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${id}_${field}`];
        return next;
      });
    }

    setSaveSuccess(false);
  }, [errors]);

  // ── Add Row ──
  const handleAddRow = () => {
    const nextId = `r_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setRows((prev) => [
      ...prev,
      { id: nextId, time: '', p10: '', p30: '', p60: '', m60: '', isDefault: false },
    ]);
  };

  // ── Delete Row ──
  const handleDeleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Reset ──
  const handleReset = () => {
    setRows(buildEmptyRows());
    setDate('');
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('LSA Bagging Sieve form cleared successfully.', 'info');
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
    rows.forEach((r) => {
      ['p10', 'p30', 'p60', 'm60'].forEach((p) => {
        const val = r[p];
        if (val !== '' && isNaN(Number(val))) {
          newErrors[`${r.id}_${p}`] = 'Invalid';
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

    const hasValues = rows.some((r) =>
      ['p10', 'p30', 'p60', 'm60'].some((p) => r[p] !== '' && r[p] !== null)
    );

    if (!hasValues) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: 'SA',
      unit: 'LSA Bagging Sieve',
      analysisType: 'LSA Bagging Sieve Analysis',
      submittedBy: user?.name || 'Plant Operator',
      rows: rows.filter((r) => r.time || r.p10 || r.p30 || r.p60 || r.m60),
    };

    try {
      const response = await api.post('/api/lsa-bagging-sieve', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast(response.data?.message || 'LSA Bagging Sieve Analysis data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 6000);
    } catch (err) {
      setSaving(false);
      console.error('[LSABaggingSieve] Save failed:', err);
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
              id="btn-lsa-sieve-back"
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
                <span className="text-blue-600 font-semibold">LSA Bagging Sieve</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                LSA BAGGING SIEVE ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-lsa-sieve-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Clear all fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-lsa-sieve-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              title="Save LSA Bagging Sieve data"
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
          id="lsa-sieve-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              LSA Bagging Sieve Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
              htmlFor="lsa-sieve-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="lsa-sieve-date-input"
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
        {/* Table Header Card */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-blue-600" />
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              LSA Bagging Sieve Data Entry (+10%, -10 +30%, -30 +60%, +60%)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleAddRow}
            id="btn-add-sieve-row"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition shadow-2xs self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Time Slot</span>
          </button>
        </div>

        {/* Scrollable table container */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm border-collapse min-w-[700px]" id="lsa-sieve-table">
            {/* Header with Dark Navy styling */}
            <thead className="sticky top-0 z-10 select-none shadow-sm">
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white">
                <th className="px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-14 bg-slate-950 text-slate-100 border-r border-slate-800">
                  #
                </th>
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800">
                  Time
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 border-r border-slate-800/50 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${p.colClass}`}
                  >
                    <div>{p.label}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-16 bg-slate-950 text-slate-100">
                  Action
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200">
              {rows.map((row, index) => {
                const hasVal = row.p10 || row.p30 || row.p60 || row.m60;

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors duration-100 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    } ${hasVal ? 'hover:bg-blue-50/40' : 'hover:bg-slate-100/60'}`}
                  >
                    {/* Index */}
                    <td className="px-3 py-2 text-center text-xs font-mono font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Time Input / Slot */}
                    <td className="px-4 py-2 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.time}
                        placeholder="HH:MM"
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        className="w-full max-w-[110px] px-2.5 py-1 text-xs font-mono font-bold text-center text-slate-800 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none transition"
                        id={`sieve-time-${index}`}
                      />
                    </td>

                    {/* Parameter inputs matching TK 203 style */}
                    {PARAMETERS.map((param) => {
                      const cellVal = row[param.key];
                      const err = errors[`${row.id}_${param.key}`];

                      return (
                        <td key={param.key} className="px-3 py-2 text-center align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={cellVal}
                            placeholder={param.placeholder}
                            onChange={(e) =>
                              handleCellChange(row.id, param.key, e.target.value)
                            }
                            className={`w-full max-w-[95px] mx-auto text-center text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                              err
                                ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                : cellVal !== ''
                                ? 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-950 font-black'
                                : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800'
                            }`}
                            id={`sieve-input-${index}-${param.key}`}
                            aria-label={`${row.time} ${param.label}`}
                          />
                        </td>
                      );
                    })}

                    {/* Action */}
                    <td className="px-2 py-2 text-center">
                      {!row.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete slot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom helper bar */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Values for <strong>LSA Bagging Sieve</strong> (+10%, -10 +30%, -30 +60%, +60%). Numeric decimal values only.
          </p>
          <div className="flex items-center gap-2">
            <button
              id="btn-lsa-sieve-save-bottom"
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

export default LSABaggingSieveAnalysisPage;
