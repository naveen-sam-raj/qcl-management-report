import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  getCellLimit,
  validateCellValue,
  SA_LSA_BAGGING_SIEVE_LIMITS,
} from '../../services/analysisValidation';
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

// Sieve size parameters: BSS 10, BSS 30 (1.5%–2.0%), -30, BSS 60 (5.5%–6.0%)
// Keeps legacy keys (p10, p30, p60, m60) alongside modern keys for backward compatibility
const PARAMETERS = [
  { key: 'bss10', legacyKey: 'p10', label: 'BSS 10', unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss30', legacyKey: 'p30', label: 'BSS 30', unit: '%', placeholder: '1.8', colClass: 'min-w-[130px]' },
  { key: 'm30',   legacyKey: 'p60', label: '-30',    unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss60', legacyKey: 'm60', label: 'BSS 60', unit: '%', placeholder: '5.8', colClass: 'min-w-[130px]' },
];

// Pre-configured sampling time slots based on laboratory schedule (1 Hour Once frequency)
const DEFAULT_ROWS = [
  { id: 'r1',  time: '09:30', bss10: '0.1', bss30: '1.8', m30: '4.0', bss60: '5.8', p10: '0.1', p30: '1.8', p60: '4.0', m60: '5.8', isDefault: true },
  { id: 'r2',  time: '10:30', bss10: '0.1', bss30: '1.7', m30: '4.1', bss60: '5.7', p10: '0.1', p30: '1.7', p60: '4.1', m60: '5.7', isDefault: true },
  { id: 'r3',  time: '11:30', bss10: '0.1', bss30: '1.9', m30: '4.0', bss60: '5.9', p10: '0.1', p30: '1.9', p60: '4.0', m60: '5.9', isDefault: true },
  { id: 'r4',  time: '14:30', bss10: '0.1', bss30: '1.6', m30: '4.2', bss60: '5.6', p10: '0.1', p30: '1.6', p60: '4.2', m60: '5.6', isDefault: true },
  { id: 'r5',  time: '16:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r6',  time: '18:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r7',  time: '20:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r8',  time: '22:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r9',  time: '00:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r10', time: '02:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r11', time: '04:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r12', time: '06:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
];

const buildEmptyRows = () =>
  DEFAULT_ROWS.map((r) => ({
    ...r,
    bss10: '', bss30: '', m30: '', bss60: '',
    p10: '', p30: '', p60: '', m60: '',
  }));

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
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // Sync both modern key (bss10, bss30, m30, bss60) and legacy key (p10, p30, p60, m60)
        const paramDef = PARAMETERS.find((p) => p.key === field || p.legacyKey === field);
        if (paramDef) {
          updated[paramDef.key] = value;
          updated[paramDef.legacyKey] = value;
        }
        return updated;
      })
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
      {
        id: nextId,
        time: '',
        bss10: '', bss30: '', m30: '', bss60: '',
        p10: '', p30: '', p60: '', m60: '',
        isDefault: false,
      },
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
      PARAMETERS.forEach((p) => {
        const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.id}_${p.key}`] = 'Invalid';
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
      PARAMETERS.some((p) => {
        const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
        return val !== '' && val !== null && val !== undefined;
      })
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
      rows: rows.filter((r) => {
        return r.time || PARAMETERS.some((p) => {
          const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
          return val !== '' && val !== null && val !== undefined;
        });
      }),
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
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header matching TK 203 theme ────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Title */}
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
          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="lsa-sieve-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="lsa-sieve-date-input"
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
              type="button"
              onClick={handleAddRow}
              id="btn-add-sieve-row"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 text-blue-700 bg-blue-50/80 hover:bg-blue-100 transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>Add Time Slot</span>
            </button>

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

      {/* ── Main Data Table starting from the Left Side ─────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
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
                {PARAMETERS.map((p, idx) => {
                  const limit = getCellLimit(plantId, 'lsa-bagging-sieve', 'hourly', p.key);
                  return (
                    <th
                      key={p.key}
                      className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 border-r border-slate-800/50 ${
                        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                      } ${p.colClass}`}
                    >
                      <div className="font-extrabold text-sm">{p.label}</div>
                      <div className="text-[10px] font-semibold text-slate-400 mt-0.5">{p.unit}</div>
                      {limit ? (
                        <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-blue-900/60 border border-blue-400/40 text-[9.5px] font-bold text-blue-200">
                          {limit.formattedRange}
                        </div>
                      ) : (
                        <div className="mt-1 inline-block px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500">
                          —
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-16 bg-slate-950 text-slate-100">
                  Action
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200">
              {rows.map((row, index) => {
                const hasVal = PARAMETERS.some((p) => {
                  const val = row[p.key] !== undefined && row[p.key] !== '' ? row[p.key] : row[p.legacyKey];
                  return val !== '' && val !== null && val !== undefined;
                });

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

                    {/* Parameter inputs matching theme and real-time validation */}
                    {PARAMETERS.map((param) => {
                      const cellVal = row[param.key] !== undefined && row[param.key] !== '' ? row[param.key] : (row[param.legacyKey] !== undefined ? row[param.legacyKey] : '');
                      const limit = getCellLimit(plantId, 'lsa-bagging-sieve', 'hourly', param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const err = errors[`${row.id}_${param.key}`] || errors[`${row.id}_${param.legacyKey}`];

                      return (
                        <td key={param.key} className="px-3 py-2.5 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative inline-block w-full max-w-[105px]">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                placeholder={param.placeholder}
                                onChange={(e) =>
                                  handleCellChange(row.id, param.key, e.target.value)
                                }
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} % (Valid range: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal} % (Valid range: ${limit.formattedRange})`
                                      : `Valid range: ${limit.formattedRange}`
                                    : `${param.label}`
                                }
                                className={`w-full max-w-[105px] mx-auto text-center text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : err
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                    : cellVal !== ''
                                    ? 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-950 font-black'
                                    : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800'
                                }`}
                                id={`sieve-input-${index}-${param.key}`}
                                aria-label={`${row.time} ${param.label}`}
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

                            {/* Status & Limit Display */}
                            {err ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>Invalid</span>
                              </div>
                            ) : limit ? (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isOutOfLimit && (
                                  <div
                                    id={`sieve-limit-badge-${row.id}-${param.key}`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                    title={`OUT OF LIMIT: ${cellVal} % (Valid range: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </div>
                                )}
                                {hasValue && isNormal && (
                                  <div
                                    id={`sieve-status-${row.id}-${param.key}`}
                                    className="text-[9px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </div>
                                )}
                                <span
                                  id={`sieve-range-${row.id}-${param.key}`}
                                  className={`text-[9.5px] font-medium tracking-tight whitespace-nowrap ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue && isNormal
                                      ? 'text-emerald-700/80 font-semibold'
                                      : 'text-slate-400'
                                  }`}
                                  title={`Valid range: ${limit.formattedRange}`}
                                >
                                  {limit.formattedRange}
                                </span>
                              </div>
                            ) : null}
                          </div>
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
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Frequency: <strong>1 Hour Once</strong> &bull; Parameters: <strong>BSS 10</strong>, <strong>BSS 30</strong> (1.5% – 2.0%), <strong>-30</strong>, <strong>BSS 60</strong> (5.5% – 6.0%). Numeric decimal values only.
          </p>
        </div>
      </div>

    </div>
  );
};

export default LSABaggingSieveAnalysisPage;
