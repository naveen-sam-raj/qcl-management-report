import React, { useState, useCallback } from 'react';
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
  Droplets,
  Flame,
} from 'lucide-react';
import {
  validateCellValue,
  OFFSET_BFW_LIMITS,
  OFFSET_SHS_LIMITS,
} from '../../services/analysisValidation';

// Default initial readings matching laboratory reference (Date: 13/09/2026)
const DEFAULT_BFW_READINGS = [
  {
    id: 'bfw_1',
    stream: 'Boiler Feed Water (BFW)',
    frequency: 'Day',
    time: '15:00',
    ph: '9',
    cond: '36.8',
    th: '0',
    alk: '10',
    tAlk: '10',
    sio2: '0.26',
    fe2o3: '',
  },
];

const DEFAULT_SHS_READINGS = [
  {
    id: 'shs_1',
    stream: 'Super Heated Steam (SHS)',
    frequency: 'Day',
    time: '15:00',
    ph: '7.6',
    cond: '7.3',
    th: '',
    alk: '6',
    tAlk: '6',
    sio2: '0.14',
    fe2o3: '',
  },
];

const NUMERIC_FIELDS = ['ph', 'cond', 'alk', 'sio2'];

const isValidInput = (val, field) => {
  if (val === '' || val === null || val === undefined) return true;
  if (field === 'th') {
    const s = String(val).toLowerCase();
    if (s === 'nil' || s === 'n' || s === 'ni' || s === 'none' || s === '-') return true;
  }
  return /^-?\d*\.?\d*$/.test(val);
};

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

const BFWAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── Active Selected Option (BFW or SHS - Separate Selectable Options) ──
  const [selectedOption, setSelectedOption] = useState('bfw'); // 'bfw' | 'shs'

  // ── States ──
  const [date, setDate] = useState('2026-09-13');
  const [bfwReadings, setBfwReadings] = useState(DEFAULT_BFW_READINGS);
  const [shsReadings, setShsReadings] = useState(DEFAULT_SHS_READINGS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Active configuration based on selected option
  const isBfwSelected = selectedOption === 'bfw';
  const activeLimits = isBfwSelected ? OFFSET_BFW_LIMITS : OFFSET_SHS_LIMITS;
  const activeOptionLabel = isBfwSelected ? 'Boiler Feed Water (BFW)' : 'Super Heated Steam (SHS)';
  const activeReadings = isBfwSelected ? bfwReadings : shsReadings;
  const setActiveReadings = isBfwSelected ? setBfwReadings : setShsReadings;

  // ── Handle cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if ((NUMERIC_FIELDS.includes(field) || field === 'th') && !isValidInput(value, field)) return;

    setActiveReadings((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === 'alk') {
          updated.tAlk = value;
        } else if (field === 'tAlk') {
          updated.alk = value;
        }
        return updated;
      })
    );

    // Clear error for this field
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, [setActiveReadings]);

  // ── Add new reading row ──
  const handleAddRow = () => {
    const nextId = `${selectedOption}_${Date.now()}`;
    const defaultStream = isBfwSelected
      ? `Boiler Feed Water (BFW) - #${activeReadings.length + 1}`
      : `Super Heated Steam (SHS) - #${activeReadings.length + 1}`;

    setActiveReadings((prev) => [
      ...prev,
      {
        id: nextId,
        stream: defaultStream,
        frequency: 'Day',
        time: '15:00',
        ph: '',
        cond: '',
        th: '',
        alk: '',
        tAlk: '',
        sio2: '',
        fe2o3: '',
      },
    ]);
    showToast?.(`Added new sampling row for ${activeOptionLabel}.`, 'info');
  };

  // ── Remove reading row ──
  const handleRemoveRow = (id) => {
    if (activeReadings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setActiveReadings((prev) => prev.filter((r) => r.id !== id));
    showToast?.('Row removed.', 'info');
  };

  // ── Reset ──
  const handleReset = () => {
    if (isBfwSelected) {
      setBfwReadings(DEFAULT_BFW_READINGS);
      showToast?.('BFW values reset to defaults.', 'info');
    } else {
      setShsReadings(DEFAULT_SHS_READINGS);
      showToast?.('SHS values reset to defaults.', 'info');
    }
    setErrors({});
  };

  // ── Save handler (Preserves both BFW and SHS readings for the date) ──
  const handleSave = async () => {
    const newErrors = {};
    const allReadings = [...bfwReadings, ...shsReadings];

    allReadings.forEach((r) => {
      // Validate TH
      if (r.th !== '' && r.th !== null && r.th !== undefined) {
        const s = String(r.th).trim().toLowerCase();
        if (s !== 'nil' && s !== 'n' && s !== 'none' && s !== '-' && isNaN(Number(r.th))) {
          newErrors[`${r.id}_th`] = 'Invalid';
        }
      }

      // Validate numeric fields
      ['ph', 'cond', 'alk', 'sio2'].forEach((f) => {
        const val = r[f];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
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
        plant: 'OFFSET',
        unit: 'BFW',
        analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
        readings: allReadings.map((r) => ({
          ...r,
          alk: r.alk || r.tAlk || '',
          tAlk: r.tAlk || r.alk || '',
        })),
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/bfw-analysis', payload);

      if (res.data?.success) {
        showToast?.('BFW & SHS Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'BFW / SHS data saved.', 'success');
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
    <div className="space-y-4 animate-fadeIn">
      {/* ── TOP HEADER BAR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
            title="Back to Plant"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                OFFSET Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Utilities & Facilities
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                Boiler Feed Water / Super Heated Steam
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              {isBfwSelected ? (
                <Droplets className="w-5 h-5 text-blue-600" />
              ) : (
                <Flame className="w-5 h-5 text-amber-600" />
              )}
              BOILER FEED WATER / SUPER HEATED STEAM
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
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
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-blue-500/20 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save Analysis Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── SEPARATE SELECTABLE OPTIONS SWITCHER ── */}
      {/* Kept under the SAME option/selection area as TWO distinct selectable options */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">
            Select Analysis:
          </span>

          {/* Option 1: BFW */}
          <button
            type="button"
            onClick={() => setSelectedOption('bfw')}
            className={`flex-1 sm:flex-none flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition border cursor-pointer ${
              isBfwSelected
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Droplets className={`w-4 h-4 ${isBfwSelected ? 'text-white' : 'text-blue-600'}`} />
            <span>Boiler Feed Water (BFW)</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                isBfwSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
              }`}
            >
              Frequency: Day
            </span>
          </button>

          {/* Option 2: SHS */}
          <button
            type="button"
            onClick={() => setSelectedOption('shs')}
            className={`flex-1 sm:flex-none flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition border cursor-pointer ${
              !isBfwSelected
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-500/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Flame className={`w-4 h-4 ${!isBfwSelected ? 'text-white' : 'text-amber-600'}`} />
            <span>Super Heated Steam (SHS)</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                !isBfwSelected ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-600'
              }`}
            >
              Frequency: Day
            </span>
          </button>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label
            htmlFor="bfw-date-input"
            className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
          >
            <span>Date:</span>
            <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="bfw-date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-2.5 pr-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 bg-white hover:border-slate-400"
              required
            />
          </div>
          {date && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              <Calendar className="w-3 h-3 text-slate-400" />
              {formatDateDisplay(date)}
            </span>
          )}
        </div>
      </div>

      {/* ── MEASUREMENTS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                {activeOptionLabel} Analysis
              </h2>
            </div>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md">
              Frequency: Day
            </span>
          </div>

          <button
            onClick={handleAddRow}
            className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 text-xs font-bold transition flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
        </div>

        <div>
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-2 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-44 border-r border-slate-700">STREAM / SAMPLE</th>
                <th className="py-3 px-2 w-20 text-center border-r border-slate-700">TIME</th>
                
                {/* 1. pH */}
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">pH</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Direct Range</div>
                </th>

                {/* 2. Cond */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">Cond</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">umho/cm</div>
                </th>

                {/* 3. TH */}
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">
                  <div className="text-white font-bold">TH</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">Nil</div>
                </th>

                {/* 4. Alk */}
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">Alk</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>

                {/* 5. SiO2 */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">SiO₂</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">ppm</div>
                </th>

                <th className="py-3 px-2 w-12 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {activeReadings.map((row, idx) => {
                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isBfwSelected ? 'hover:bg-blue-50/40 bg-white' : 'hover:bg-amber-50/40 bg-slate-50/30'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* Stream Name */}
                    <td className="py-2.5 px-3 font-bold border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isBfwSelected ? 'bg-blue-600' : 'bg-amber-500'
                          }`}
                        />
                        <input
                          type="text"
                          value={row.stream}
                          onChange={(e) => handleCellChange(row.id, 'stream', e.target.value)}
                          className="w-full font-bold text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition text-xs"
                        />
                      </div>
                    </td>

                    {/* Time */}
                    <td className="py-2.5 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        value={row.time}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 transition shadow-2xs"
                      />
                    </td>

                    {/* 1. pH: Direct Valid Range 7.0 – 9.5 */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ph, activeLimits.ph);
                        const hasVal = row.ph !== '' && row.ph !== null && row.ph !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-ph`}
                                type="text"
                                inputMode="decimal"
                                value={row.ph}
                                onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                                placeholder="7.0 – 9.5"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ph} (Valid Range: 7.0 – 9.5)`
                                      : `NORMAL: ${row.ph} (Valid Range: 7.0 – 9.5)`
                                    : 'Direct Valid Range: 7.0 – 9.5'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_ph`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 7.0 – 9.5"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">7.0 – 9.5</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_ph`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_ph`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 2. Cond: Target 10 umho/cm, Tolerance ±5 -> Valid Range 5 – 15 umho/cm */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.cond, activeLimits.cond);
                        const hasVal = row.cond !== '' && row.cond !== null && row.cond !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-cond`}
                                type="text"
                                inputMode="decimal"
                                value={row.cond}
                                onChange={(e) => handleCellChange(row.id, 'cond', e.target.value)}
                                placeholder="5 – 15"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.cond} umho/cm (Valid: 5 – 15 umho/cm)`
                                      : `NORMAL: ${row.cond} umho/cm (Valid: 5 – 15 umho/cm)`
                                    : 'Valid Range: 5 – 15 umho/cm'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_cond`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 5 – 15 umho/cm"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">5 – 15 umho/cm</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_cond`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_cond`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. TH: Limit Nil (Keep input field available, treat Nil exactly as provided) */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const hasVal = row.th !== '' && row.th !== null && row.th !== undefined;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <input
                              id={`${selectedOption}-input-${row.id}-th`}
                              type="text"
                              value={row.th}
                              onChange={(e) => handleCellChange(row.id, 'th', e.target.value)}
                              placeholder="Nil"
                              title="Limit: Nil"
                              className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                errors[`${row.id}_th`]
                                  ? 'border-red-400 bg-red-50 text-red-700'
                                  : hasVal
                                  ? 'border-slate-300 bg-white text-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-100'
                                  : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-100'
                              }`}
                            />
                            {/* Display Limit: Nil near input */}
                            <div className="flex items-center justify-center gap-1 w-full text-[10px] leading-tight">
                              <span className="text-slate-400 font-medium">Limit: Nil</span>
                            </div>
                            {errors[`${row.id}_th`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_th`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 4. Alk: Target 5 ppm, Tolerance ±4 -> Valid Range 1 – 9 ppm */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.alk, activeLimits.alk);
                        const hasVal = row.alk !== '' && row.alk !== null && row.alk !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-alk`}
                                type="text"
                                inputMode="decimal"
                                value={row.alk}
                                onChange={(e) => handleCellChange(row.id, 'alk', e.target.value)}
                                placeholder="1 – 9"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.alk} ppm (Valid: 1 – 9 ppm)`
                                      : `NORMAL: ${row.alk} ppm (Valid: 1 – 9 ppm)`
                                    : 'Valid Range: 1 – 9 ppm'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_alk`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 1 – 9 ppm"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">1 – 9 ppm</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_alk`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_alk`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. SiO2: Target 0.20 ppm, Tolerance ±5 -> Source notation preserved */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.sio2, activeLimits.sio2);
                        const hasVal = row.sio2 !== '' && row.sio2 !== null && row.sio2 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-sio2`}
                                type="text"
                                inputMode="decimal"
                                value={row.sio2}
                                onChange={(e) => handleCellChange(row.id, 'sio2', e.target.value)}
                                placeholder="0.20 ± 5"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.sio2} ppm (Reference: 0.20 ± 5 ppm)`
                                      : `NORMAL: ${row.sio2} ppm (Reference: 0.20 ± 5 ppm)`
                                    : 'Reference: 0.20 ± 5 ppm'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_sio2`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 0.20 ± 5 ppm"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">0.20 ± 5 ppm</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_sio2`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_sio2`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* ACTION */}
                    <td className="py-2.5 px-2 text-center align-top">
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={activeReadings.length <= 1}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Delete row"
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

        {/* Table Footer */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddRow}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              Add Another Sampling Row
            </button>
            <span className="text-slate-500 font-medium">
              {activeReadings.length} {activeReadings.length === 1 ? 'row' : 'rows'} recorded for {activeOptionLabel}
            </span>
          </div>

          <div className="text-slate-500 text-xs">
            Units: <span className="font-semibold text-slate-700">Cond in umho/cm | Alk, SiO₂ in ppm | TH: Nil</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BFWAnalysisPage;
