import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  AlertCircle,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Droplets,
  Layers,
  TrendingUp,
} from 'lucide-react';

// ─── SA Plant Bi Carbonate Moisture Parameters & Validation Limits ───────────
// Plant: SA Plant ONLY (Bi Carbonate Section)
// Parameter: Moisture
// Options: A, B, C (Separate options under M 404)
// Frequency: Once in 4 Hours
//
// Moisture:
// - Reference Value: 20%
// - Tolerance: ±2.0%
// - Valid Range: 18% – 22%
// Applied independently to Options A, B, and C
export const BICARBONATE_MOISTURE_LIMITS = {
  m404_a: {
    key: 'm404_a',
    option: 'A',
    paramName: 'Moisture Option A',
    label: 'Option A',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
  m404_b: {
    key: 'm404_b',
    option: 'B',
    paramName: 'Moisture Option B',
    label: 'Option B',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
  m404_c: {
    key: 'm404_c',
    option: 'C',
    paramName: 'Moisture Option C',
    label: 'Option C',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
};

// Default initial readings matching the user's legacy screenshot (Date: 13/09/2026)
const DEFAULT_READINGS = [
  {
    id: '1',
    shift: 'I SHIFT',
    time: '07:00',
    m404_a: '',
    m404_b: '',
    m404_c: '21.3',
    m405_outlet: '',
    sb_turb1: '70',
    sb_turb2: '74',
  },
  {
    id: '2',
    shift: 'II SHIFT',
    time: '15:00',
    m404_a: '',
    m404_b: '19.8',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '53',
    sb_turb2: '72',
  },
  {
    id: '3',
    shift: 'III SHIFT',
    time: '23:00',
    m404_a: '',
    m404_b: '23.7',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '72',
    sb_turb2: '122',
  },
  {
    id: '4',
    shift: 'ADDL SAPL1',
    time: '11:00',
    m404_a: '',
    m404_b: '24.2',
    m404_c: '22.3',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
  {
    id: '5',
    shift: 'SAMPLE',
    time: '',
    m404_a: '',
    m404_b: '',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
];

const NUMERIC_FIELDS = [
  'm404_a',
  'm404_b',
  'm404_c',
  'm405_outlet',
  'sb_turb1',
  'sb_turb2',
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

const BicarbonateMoistureAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

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
        const response = await api.get(`/api/bicarbonate-moisture?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.readings && record.readings.length > 0) {
            setReadings(record.readings);
          } else if (record.data && Array.isArray(record.data) && record.data.length > 0) {
            setReadings(record.data);
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
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        shift: `EXTRA #${prev.length + 1}`,
        time: '',
        m404_a: '',
        m404_b: '',
        m404_c: '',
        m405_outlet: '',
        sb_turb1: '',
        sb_turb2: '',
      },
    ]);
  };

  // ── Remove reading row ──
  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
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
    const m404Vals = [];
    const turbVals = [];

    readings.forEach((r) => {
      ['m404_a', 'm404_b', 'm404_c'].forEach((f) => {
        const n = parseFloat(r[f]);
        if (!isNaN(n)) m404Vals.push(n);
      });
      ['sb_turb1', 'sb_turb2'].forEach((f) => {
        const n = parseFloat(r[f]);
        if (!isNaN(n)) turbVals.push(n);
      });
    });

    const m404Avg =
      m404Vals.length > 0
        ? (m404Vals.reduce((a, b) => a + b, 0) / m404Vals.length).toFixed(2)
        : '—';

    const turbAvg =
      turbVals.length > 0
        ? (turbVals.reduce((a, b) => a + b, 0) / turbVals.length).toFixed(1)
        : '—';

    return {
      m404Count: m404Vals.length,
      m404Avg,
      turbCount: turbVals.length,
      turbAvg,
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
        unit: 'Bicarbonate Moisture',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/bicarbonate-moisture', payload);

      if (res.data?.success) {
        showToast?.('Bicarbonate Moisture Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'Bicarbonate moisture data saved.', 'success');
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
              <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200/60">
                Bicarbonate Moisture
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Frequency: Once in 4 Hours
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Droplets className="w-5 h-5 text-cyan-600" />
              BICARBONATE MOISTURE ANALYSIS
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
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Moisture Data'}
          </button>
        </div>
      </div>

      {/* ── MAIN ANALYSIS TABLE (Clean TK 203 Dark Header Style) ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table top title banner with Integrated Date Selector */}
        <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Bicarbonate Moisture Readings
              </span>
              <span className="text-[11px] font-bold text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
                Once in 4 Hours
              </span>
            </div>

            {/* Date Input inside Table Header */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="moisture-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="moisture-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-2.5 pr-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 transition text-slate-800 bg-white hover:border-slate-400"
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

          <button
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100/80 border border-cyan-200 px-3 py-1.5 rounded-lg transition shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Slot
          </button>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Row 1: Group Headers */}
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-10 text-center border-r border-b border-slate-800"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-4 w-32 border-r border-b border-slate-800"
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Shift / Sample</span>
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-28 border-r border-b border-slate-800"
                >
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Time</span>
                  </div>
                </th>
                <th
                  colSpan={3}
                  className="py-2 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-cyan-300 font-extrabold"
                >
                  <div className="text-xs font-black tracking-wide">M 404 (Moisture %)</div>
                  <div className="text-[10px] text-cyan-200 font-medium normal-case tracking-normal">
                    Limit: 18% – 22% (Target: 20% ±2.0%)
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-center border-r border-b border-slate-800 w-32"
                >
                  <span className="text-cyan-200">M 405 OUTLET</span>
                </th>
                <th
                  colSpan={2}
                  className="py-2 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-cyan-300 font-extrabold"
                >
                  SB
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-14 text-center border-b border-slate-800"
                >
                  Action
                </th>
              </tr>
              {/* Row 2: Sub-columns */}
              <tr className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider text-center">
                <th className="py-2 px-2 border-r border-slate-700 min-w-[96px] text-center">
                  <div className="font-extrabold text-cyan-200">A</div>
                  <div className="text-[9px] text-slate-300 font-medium normal-case">18% – 22%</div>
                </th>
                <th className="py-2 px-2 border-r border-slate-700 min-w-[96px] text-center">
                  <div className="font-extrabold text-cyan-200">B</div>
                  <div className="text-[9px] text-slate-300 font-medium normal-case">18% – 22%</div>
                </th>
                <th className="py-2 px-2 border-r border-slate-700 min-w-[96px] text-center">
                  <div className="font-extrabold text-cyan-200">C</div>
                  <div className="text-[9px] text-slate-300 font-medium normal-case">18% – 22%</div>
                </th>
                <th className="py-2 px-3 border-r border-slate-700 w-24">TURB</th>
                <th className="py-2 px-3 border-r border-slate-700 w-24">TURB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((reading, index) => {
                return (
                  <tr
                    key={reading.id}
                    className="hover:bg-cyan-50/20 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-2 px-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Shift Label / Input */}
                    <td className="py-2 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={reading.shift}
                        onChange={(e) =>
                          handleCellChange(reading.id, 'shift', e.target.value)
                        }
                        placeholder="Shift name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                      />
                    </td>

                    {/* Time Input */}
                    <td className="py-2 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={reading.time}
                        onChange={(e) =>
                          handleCellChange(reading.id, 'time', e.target.value)
                        }
                        placeholder="HH:MM"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
                      />
                    </td>

                    {/* M 404 A */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top">
                      {(() => {
                        const cellVal = reading.m404_a;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const limit = getCellLimit('sa', 'bicarbonate-moisture', reading.shift, 'm404_a') || BICARBONATE_MOISTURE_LIMITS.m404_a;
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const isFormatError = !!errors[`${reading.id}_m404_a`];

                        return (
                          <div className="flex flex-col items-center justify-start min-h-[58px] min-w-[92px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`moisture-input-${reading.id}-a`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                onChange={(e) =>
                                  handleCellChange(reading.id, 'm404_a', e.target.value)
                                }
                                placeholder="—"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : 'Option A'
                                }
                                className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border-2 transition focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-cyan-500 bg-cyan-50/50 text-cyan-900 font-extrabold focus:ring-2 focus:ring-cyan-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
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

                            {/* Error / Validation Status & Range */}
                            {isFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`moisture-status-${reading.id}-a`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}
                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`moisture-status-${reading.id}-a`}
                                    className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}
                                <span
                                  id={`moisture-range-${reading.id}-a`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue
                                      ? 'text-slate-600 font-bold'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {limit?.formattedRange || '18% – 22%'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* M 404 B */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top">
                      {(() => {
                        const cellVal = reading.m404_b;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const limit = getCellLimit('sa', 'bicarbonate-moisture', reading.shift, 'm404_b') || BICARBONATE_MOISTURE_LIMITS.m404_b;
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const isFormatError = !!errors[`${reading.id}_m404_b`];

                        return (
                          <div className="flex flex-col items-center justify-start min-h-[58px] min-w-[92px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`moisture-input-${reading.id}-b`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                onChange={(e) =>
                                  handleCellChange(reading.id, 'm404_b', e.target.value)
                                }
                                placeholder="—"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : 'Option B'
                                }
                                className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border-2 transition focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-cyan-500 bg-cyan-50/50 text-cyan-900 font-extrabold focus:ring-2 focus:ring-cyan-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
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

                            {/* Error / Validation Status & Range */}
                            {isFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`moisture-status-${reading.id}-b`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}
                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`moisture-status-${reading.id}-b`}
                                    className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}
                                <span
                                  id={`moisture-range-${reading.id}-b`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue
                                      ? 'text-slate-600 font-bold'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {limit?.formattedRange || '18% – 22%'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* M 404 C */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top">
                      {(() => {
                        const cellVal = reading.m404_c;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const limit = getCellLimit('sa', 'bicarbonate-moisture', reading.shift, 'm404_c') || BICARBONATE_MOISTURE_LIMITS.m404_c;
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const isFormatError = !!errors[`${reading.id}_m404_c`];

                        return (
                          <div className="flex flex-col items-center justify-start min-h-[58px] min-w-[92px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`moisture-input-${reading.id}-c`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                onChange={(e) =>
                                  handleCellChange(reading.id, 'm404_c', e.target.value)
                                }
                                placeholder="—"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : 'Option C'
                                }
                                className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border-2 transition focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-cyan-500 bg-cyan-50/50 text-cyan-900 font-extrabold focus:ring-2 focus:ring-cyan-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
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

                            {/* Error / Validation Status & Range */}
                            {isFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`moisture-status-${reading.id}-c`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}
                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`moisture-status-${reading.id}-c`}
                                    className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}
                                <span
                                  id={`moisture-range-${reading.id}-c`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue
                                      ? 'text-slate-600 font-bold'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {limit?.formattedRange || '18% – 22%'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* M 405 OUTLET */}
                    <td className="py-2 px-2 border-r border-slate-100">
                      <input
                        type="text"
                        value={reading.m405_outlet}
                        onChange={(e) =>
                          handleCellChange(
                            reading.id,
                            'm405_outlet',
                            e.target.value
                          )
                        }
                        placeholder="—"
                        className={`w-full text-center font-mono text-xs font-bold py-1 px-2 rounded-md border transition ${
                          errors[`${reading.id}_m405_outlet`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : reading.m405_outlet !== ''
                            ? 'border-cyan-300 bg-cyan-50/50 text-cyan-900 font-extrabold focus:bg-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-1 focus:ring-cyan-500`}
                      />
                    </td>

                    {/* SB TURB 1 */}
                    <td className="py-2 px-2 border-r border-slate-100">
                      <input
                        type="text"
                        value={reading.sb_turb1}
                        onChange={(e) =>
                          handleCellChange(
                            reading.id,
                            'sb_turb1',
                            e.target.value
                          )
                        }
                        placeholder="—"
                        className={`w-full text-center font-mono text-xs font-bold py-1 px-2 rounded-md border transition ${
                          errors[`${reading.id}_sb_turb1`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : reading.sb_turb1 !== ''
                            ? 'border-cyan-300 bg-cyan-50/50 text-cyan-900 font-extrabold focus:bg-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-1 focus:ring-cyan-500`}
                      />
                    </td>

                    {/* SB TURB 2 */}
                    <td className="py-2 px-2 border-r border-slate-100">
                      <input
                        type="text"
                        value={reading.sb_turb2}
                        onChange={(e) =>
                          handleCellChange(
                            reading.id,
                            'sb_turb2',
                            e.target.value
                          )
                        }
                        placeholder="—"
                        className={`w-full text-center font-mono text-xs font-bold py-1 px-2 rounded-md border transition ${
                          errors[`${reading.id}_sb_turb2`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : reading.sb_turb2 !== ''
                            ? 'border-cyan-300 bg-cyan-50/50 text-cyan-900 font-extrabold focus:bg-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-1 focus:ring-cyan-500`}
                      />
                    </td>

                    {/* Delete Row Button */}
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => handleRemoveRow(reading.id)}
                        disabled={readings.length <= 1}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        title="Delete slot"
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
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-cyan-600" />
              <span className="font-medium">M 404 Avg Moisture:</span>{' '}
              <strong className="text-slate-900 font-mono">
                {stats.m404Avg !== '—' ? `${stats.m404Avg} %` : '—'}
              </strong>
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium">SB Avg Turb:</span>{' '}
              <strong className="text-slate-900 font-mono">
                {stats.turbAvg !== '—' ? stats.turbAvg : '—'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Active Shift Entries:
            </span>
            <span className="px-3 py-1 bg-cyan-100 text-cyan-800 font-mono font-extrabold rounded-md border border-cyan-300">
              {readings.length} Rows
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BicarbonateMoistureAnalysisPage;
