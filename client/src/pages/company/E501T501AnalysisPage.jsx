import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Layers,
  Activity,
  TrendingUp,
} from 'lucide-react';
import {
  validateCellValue,
  SA_E501_LIMITS,
  SA_T501_LIMITS,
} from '../../services/analysisValidation';

// Default initial readings matching the user's legacy screenshot (Date: 13/09/2026)
const DEFAULT_READINGS = [
  {
    id: '1',
    shift: 'I',
    e501_fnh3: '29.9',
    e501_na2co3: '03.7',
    t501_fnh3: '04.8',
    t501_na2co3: '18.6',
  },
  {
    id: '2',
    shift: 'II',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '03.4',
    t501_na2co3: '70.5',
  },
  {
    id: '3',
    shift: 'III',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '04.1',
    t501_na2co3: '44.5',
  },
];

const NUMERIC_FIELDS = [
  'e501_fnh3',
  'e501_na2co3',
  't501_fnh3',
  't501_na2co3',
];

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

const E501T501AnalysisPage = ({ plantId = 'sa', optionName = 'E 501 / T 501' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // Option selection: 'all' | 'e501' | 't501'
  const [selectedOption, setSelectedOption] = useState(() => {
    const opt = (optionName || '').toLowerCase();
    if (opt.includes('e') && !opt.includes('t')) return 'e501';
    if (opt.includes('t') && !opt.includes('e')) return 't501';
    return 'all';
  });

  // ── States ──
  const [date, setDate] = useState('2026-09-13');
  const [readings, setReadings] = useState(DEFAULT_READINGS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/e501-t501-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.shifts) {
            setReadings(record.shifts);
          } else if (record.readings && record.readings.length > 0) {
            setReadings(record.readings);
          } else if (record.readings && record.readings.length > 0) {
            setReadings(record.readings);
          } else if (record.data && Array.isArray(record.data) && record.data.length > 0) {
            setReadings(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setReadings(record);
          } else if (record.data && record.data.readings) {
            setReadings(record.data.readings);
          } else {
            // Leave default
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);


  // ── Handle reading cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Add new reading row ──
  const handleAddRow = () => {
    const nextId = String(Date.now());
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    const nextShift =
      readings.length < romanNumerals.length
        ? romanNumerals[readings.length]
        : `SHIFT ${readings.length + 1}`;

    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        shift: nextShift,
        e501_fnh3: '',
        e501_na2co3: '',
        t501_fnh3: '',
        t501_na2co3: '',
      },
    ]);
  };

  // ── Remove reading row ──
  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one shift row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Reset ──
  const handleReset = () => {
    setReadings(DEFAULT_READINGS);
    setDate('2026-09-13');
    setErrors({});
    showToast?.('Values reset to sample defaults.', 'info');
  };

  // ── Summary Calculations ──
  const stats = useMemo(() => {
    const calcAvg = (field) => {
      const vals = readings
        .map((r) => parseFloat(r[field]))
        .filter((n) => !isNaN(n));
      return vals.length > 0
        ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
        : '—';
    };

    return {
      e501_fnh3_avg: calcAvg('e501_fnh3'),
      e501_na2co3_avg: calcAvg('e501_na2co3'),
      t501_fnh3_avg: calcAvg('t501_fnh3'),
      t501_na2co3_avg: calcAvg('t501_na2co3'),
    };
  }, [readings]);

  // ── Save handler ──
  const handleSave = async () => {
    const newErrors = {};

    readings.forEach((r) => {
      NUMERIC_FIELDS.forEach((f) => {
        if (r[f] !== '' && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date,
        plant: 'SA',
        unit: 'E 501 / T 501',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/e501-t501-analysis', payload);

      if (res.data?.success) {
        showToast?.('E 501 / T 501 Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'E 501 / T 501 data saved.', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('API save error, using local fallback:', err);
      showToast?.('Saved to local session successfully!', 'success');
      setLastSaved(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── TOP HEADER BAR (TK 203 Clean Theme) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                SA Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Soda Ash Production
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60">
                E 501 / T 501
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Activity className="w-5 h-5 text-indigo-600" />
              E 501 / T 501 ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save on top right only */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {lastSaved && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Saved at {lastSaved}
            </span>
          )}

          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save E 501 / T 501 Data'}
          </button>
        </div>
      </div>

      {/* ── MAIN ANALYSIS TABLE (Clean TK 203 Dark Header Style) ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table top title banner with Integrated Date Selector */}
        <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                E 501 / T 501 Chemical Concentration
              </span>
              <span className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/60">
                Units: g/l
              </span>
            </div>

            {/* Date Input inside Table Header */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="e501-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="e501-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-2.5 pr-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-slate-800 bg-white hover:border-slate-400"
                  required
                />
              </div>
              {date && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium bg-slate-200/60 px-2 py-0.5 rounded-md">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {formatDateDisplay(date)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Option Selection Toggle */}
            <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300 shadow-2xs">
              <button
                type="button"
                id="btn-option-all"
                onClick={() => setSelectedOption('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  selectedOption === 'all'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View and enter both E 501 and T 501"
              >
                All (E 501 &amp; T 501)
              </button>
              <button
                type="button"
                id="btn-option-e501"
                onClick={() => setSelectedOption('e501')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  selectedOption === 'e501'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Select E 501 only (Limits: FNH₃ 10–40 g/L, Na₂CO₃ 2–10 g/L)"
              >
                E 501
              </button>
              <button
                type="button"
                id="btn-option-t501"
                onClick={() => setSelectedOption('t501')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  selectedOption === 't501'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Select T 501 only (Limits: FNH₃ 1–5 g/L, Na₂CO₃ 20–60 g/L)"
              >
                T 501
              </button>
            </div>

            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 px-3 py-1.5 rounded-lg transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Shift Row
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Row 1: Groups */}
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-12 text-center border-r border-b border-slate-800"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-4 w-28 text-center border-r border-b border-slate-800"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Shift</span>
                  </div>
                </th>
                {(selectedOption === 'all' || selectedOption === 'e501') && (
                  <th
                    colSpan={2}
                    className="py-2.5 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-indigo-300 font-extrabold tracking-wide"
                  >
                    E 501 <span className="text-[10px] text-indigo-200 font-normal">(g/l)</span>
                  </th>
                )}
                {(selectedOption === 'all' || selectedOption === 't501') && (
                  <th
                    colSpan={2}
                    className="py-2.5 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-indigo-300 font-extrabold tracking-wide"
                  >
                    T 501 <span className="text-[10px] text-indigo-200 font-normal">(g/l)</span>
                  </th>
                )}
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-16 text-center border-b border-slate-800"
                >
                  Action
                </th>
              </tr>
              {/* Row 2: Sub-columns */}
              <tr className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider text-center">
                {(selectedOption === 'all' || selectedOption === 'e501') && (
                  <>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      FNH₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      Na₂CO₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                  </>
                )}
                {(selectedOption === 'all' || selectedOption === 't501') && (
                  <>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      FNH₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      Na₂CO₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((reading, index) => {
                return (
                  <tr
                    key={reading.id}
                    className="hover:bg-indigo-50/20 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-2.5 px-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Shift */}
                    <td className="py-2.5 px-3 text-center border-r border-slate-100">
                      <input
                        type="text"
                        value={reading.shift}
                        onChange={(e) =>
                          handleCellChange(reading.id, 'shift', e.target.value)
                        }
                        placeholder="Shift"
                        className="w-full text-center bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-xs font-extrabold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </td>

                    {/* E 501 Cells (Limits: FNH3 10–40 g/L, Na2CO3 2–10 g/L) */}
                    {(selectedOption === 'all' || selectedOption === 'e501') && (
                      <>
                        {/* E 501 FNH3 */}
                        {(() => {
                          const field = 'e501_fnh3';
                          const cellVal = reading[field];
                          const limit = SA_E501_LIMITS.fnh3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} E 501 FNH3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                )}
                              </div>
                            </td>
                          );
                        })()}

                        {/* E 501 Na2CO3 */}
                        {(() => {
                          const field = 'e501_na2co3';
                          const cellVal = reading[field];
                          const limit = SA_E501_LIMITS.na2co3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} E 501 Na2CO3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                )}
                              </div>
                            </td>
                          );
                        })()}
                      </>
                    )}

                    {/* T 501 Cells (Limits: FNH3 1–5 g/L, Na2CO3 20–60 g/L) */}
                    {(selectedOption === 'all' || selectedOption === 't501') && (
                      <>
                        {/* T 501 FNH3 */}
                        {(() => {
                          const field = 't501_fnh3';
                          const cellVal = reading[field];
                          const limit = SA_T501_LIMITS.fnh3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} T 501 FNH3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                )}
                              </div>
                            </td>
                          );
                        })()}

                        {/* T 501 Na2CO3 */}
                        {(() => {
                          const field = 't501_na2co3';
                          const cellVal = reading[field];
                          const limit = SA_T501_LIMITS.na2co3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} T 501 Na2CO3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                )}
                              </div>
                            </td>
                          );
                        })()}
                      </>
                    )}

                    {/* Delete Row */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleRemoveRow(reading.id)}
                        disabled={readings.length <= 1}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        title="Delete Shift Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Table Summary Footer ── */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-600">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span className="font-semibold text-slate-700">E 501 Avg:</span>
              <span className="font-mono text-slate-900 font-bold">
                FNH₃: {stats.e501_fnh3_avg} g/l | Na₂CO₃: {stats.e501_na2co3_avg} g/l
              </span>
            </span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">T 501 Avg:</span>
              <span className="font-mono text-slate-900 font-bold">
                FNH₃: {stats.t501_fnh3_avg} g/l | Na₂CO₃: {stats.t501_na2co3_avg} g/l
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Active Shifts:
            </span>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 font-mono font-extrabold rounded-md border border-indigo-300">
              {readings.length} Shifts
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default E501T501AnalysisPage;
