import React, { useState, useEffect, useCallback } from 'react';
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
  Droplets,
  HelpCircle,
} from 'lucide-react';
import {
  getCellLimit,
  validateCellValue,
  OFFSET_DM_WATER_LIMITS,
} from '../../services/analysisValidation';

// ─── Centralized Limit Configs for Offset Plant → DM Water (Frequency: Day) ───
const PH_LIMIT = OFFSET_DM_WATER_LIMITS.ph;
const COND_LIMIT = OFFSET_DM_WATER_LIMITS.cond;
const TH_LIMIT = OFFSET_DM_WATER_LIMITS.th;
const ALK_LIMIT = OFFSET_DM_WATER_LIMITS.alk;
const SIO2_LIMIT = OFFSET_DM_WATER_LIMITS.sio2;

// Screenshot & Laboratory reference values for DM Water and Anion Unit (Date: 13/09/2026)
const DEFAULT_ROWS = [
  {
    id: 'r_dm_water',
    unit: 'DM WATER',
    time: '15:00',
    ph: '7.2',
    cond: '10',
    th: '0',
    alk: '5',
    sio2: '0.20',
    p: '0',
    m: '5',
    isDefault: true,
    accent: 'blue',
  },
  {
    id: 'r_anion_unit',
    unit: 'A.UNIT',
    time: '',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    sio2: '',
    p: '',
    m: '',
    isDefault: true,
    accent: 'indigo',
  },
];

const NUMERIC_FIELDS = ['ph', 'cond', 'th', 'alk', 'sio2'];

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

const DMWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  // Default date matching laboratory reference
  const [date, setDate] = useState('2026-09-13');
  const [readings, setReadings] = useState(DEFAULT_ROWS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/dm-water-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          if (response.data.data.readings && response.data.data.readings.length > 0) {
            setReadings(response.data.data.readings);
          } else if (response.data.data.data && Array.isArray(response.data.data.data) && response.data.data.data.length > 0) {
            setReadings(response.data.data.data);
          } else {
             // Let it be default
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);


  // ── Handle cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidInput(value, field)) return;

    setReadings((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );

    // Clear validation error if any
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Add new custom sampling row ──
  const handleAddRow = () => {
    const nextId = `r_custom_${Date.now()}`;
    const nextIndex = readings.length + 1;
    const defaultUnitName = nextIndex % 2 === 1 ? `DM WATER (${nextIndex})` : `A.UNIT (${nextIndex})`;

    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        unit: defaultUnitName,
        time: '',
        ph: '',
        cond: '',
        th: '',
        alk: '',
        sio2: '',
        p: '',
        m: '',
        isDefault: false,
        accent: nextIndex % 2 === 1 ? 'blue' : 'indigo',
      },
    ]);
    showToast?.('Added new sampling row.', 'info');
  };

  // ── Remove custom row ──
  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one analysis row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
    showToast?.('Row removed.', 'info');
  };

  // ── Reset ──
  const handleReset = () => {
    setReadings(DEFAULT_ROWS);
    setDate('2026-09-13');
    setErrors({});
    showToast?.('Values reset to laboratory default readings.', 'info');
  };

  // ── Validate ──
  const validate = () => {
    const newErrors = {};
    let hasError = false;

    readings.forEach((row) => {
      NUMERIC_FIELDS.forEach((field) => {
        const val = row[field];
        if (val !== '' && val !== null && val !== undefined) {
          if (field === 'th') {
            const s = String(val).toLowerCase();
            if (s === 'nil' || s === 'none' || s === '-' || !isNaN(Number(val))) {
              return;
            }
          }
          if (isNaN(Number(val))) {
            newErrors[`${row.id}_${field}`] = 'Invalid number';
            hasError = true;
          }
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // ── Save ──
  const handleSave = async () => {
    if (!validate()) {
      showToast?.('Please correct invalid numeric entries.', 'error');
      return;
    }

    const hasAnyValue = readings.some((row) =>
      NUMERIC_FIELDS.some((field) => row[field] !== '' && row[field] !== null && row[field] !== undefined)
    );

    if (!hasAnyValue) {
      showToast?.('Please enter at least one analytical reading value.', 'warning');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: 'OFFSET',
      unit: 'DM Water',
      readings: readings.map((r) => ({
        ...r,
        p: r.p !== undefined && r.p !== '' ? r.p : '0',
        m: r.alk !== undefined && r.alk !== '' ? r.alk : (r.m || '0'),
      })),
      submittedBy: user?.name || 'Shift Chemist',
    };

    try {
      const response = await api.post('/api/dm-water-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast?.(response.data?.message || 'DM Water Analysis saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      setSaving(false);
      console.error('[DMWaterAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb & Top Navigation ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Plant Navigation + Title */}
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
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                <span>OFFSET Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">DM Water</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                DM WATER ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-dm-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
              title="Reset to default reference values"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-dm-save"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                saveSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Meta Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              DM Water Observations Table
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              {readings.length} Stream{readings.length > 1 ? 's' : ''}
            </span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
              Frequency: Day
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-2 py-0.5 text-xs font-bold rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-200 cursor-pointer shadow-2xs"
              title="Add another sampling stream"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stream Row</span>
            </button>
          </div>
        </div>

        {/* The Table - Fully responsive: expands close to available width on desktop/large displays, horizontally scrollable on mobile/tablet */}
        <div className="overflow-x-auto w-full table-responsive-container">
          <table className="w-full text-center border-collapse min-w-[900px] xl:min-w-full">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                <th className="py-3 px-2 w-12 min-w-[48px] text-center text-slate-400 font-semibold border-r border-slate-800">
                  #
                </th>
                <th className="py-2.5 px-3 min-w-[160px] w-[18%] text-center border-r border-slate-800">
                  Unit / Stream
                </th>
                <th className="py-2.5 px-2 min-w-[100px] w-[11%] text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Time</span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[120px] w-[14%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-blue-300">pH</div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[130px] w-[15%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-cyan-300">Cond</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(umho/cm)</div>
                </th>
                <th className="py-2.5 px-2 min-w-[110px] w-[12%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-amber-300">TH</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(ppm)</div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[120px] w-[14%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-emerald-300">Alk</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(ppm)</div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[120px] w-[14%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-indigo-300">SiO₂</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(ppm)</div>
                </th>
                <th className="py-2.5 px-2 w-14 min-w-[56px] text-center">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const isDM = row.unit?.toUpperCase().includes('DM WATER');
                const isAnion = row.unit?.toUpperCase().includes('A.UNIT');

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isDM
                        ? 'bg-blue-50/20 hover:bg-blue-50/40'
                        : isAnion
                        ? 'bg-indigo-50/20 hover:bg-indigo-50/40'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center text-slate-400 font-semibold border-r border-slate-100 text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Unit / Stream Name */}
                    <td className="py-2.5 px-3 border-r border-slate-100 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isDM
                              ? 'bg-blue-600'
                              : isAnion
                              ? 'bg-indigo-600'
                              : 'bg-emerald-500'
                          }`}
                        />
                        {row.isDefault ? (
                          <div className="font-extrabold text-slate-900 tracking-wide text-xs text-center">
                            {row.unit}
                            <div className="text-[10px] text-slate-400 font-medium">
                              {isDM ? 'Demineralized Water' : 'Anion Exchange Unit'}
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => handleCellChange(row.id, 'unit', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-800 text-xs text-center focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Unit Name"
                          />
                        )}
                      </div>
                    </td>

                    {/* Time Input */}
                    <td className="py-2.5 px-2 border-r border-slate-100 text-center">
                      <input
                        type="time"
                        value={row.time}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className={`w-full text-center font-bold text-xs py-1 px-1.5 rounded-md border transition ${
                          row.time && isDM
                            ? 'bg-amber-50 border-amber-300 text-amber-950 font-black'
                            : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
                        } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                      />
                    </td>

                    {/* 1. pH: Direct Valid Range 7.0 – 9.5 */}
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ph, PH_LIMIT);
                        const hasVal = row.ph !== '' && row.ph !== null && row.ph !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-ph`}
                                type="text"
                                inputMode="decimal"
                                value={row.ph}
                                onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                                placeholder="7.0 – 9.5"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ph} (Direct Valid Range: 7.0 – 9.5)`
                                      : `NORMAL: ${row.ph} (Direct Valid Range: 7.0 – 9.5)`
                                    : 'Direct Valid Range: 7.0 – 9.5'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_ph`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
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
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.cond, COND_LIMIT);
                        const hasVal = row.cond !== '' && row.cond !== null && row.cond !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-cond`}
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
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100'
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
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <input
                              id={`dm-water-input-${row.id}-th`}
                              type="text"
                              value={row.th}
                              onChange={(e) => handleCellChange(row.id, 'th', e.target.value)}
                              placeholder="Nil"
                              title="Limit: Nil"
                              className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                errors[`${row.id}_th`]
                                  ? 'border-red-400 bg-red-50 text-red-700'
                                  : hasVal
                                  ? 'border-slate-300 bg-white text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                                  : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
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
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.alk, ALK_LIMIT);
                        const hasVal = row.alk !== '' && row.alk !== null && row.alk !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-alk`}
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
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
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

                    {/* 5. SiO2: Reference 0.20 ppm, Tolerance ±5 (Preserved exactly as given) */}
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.sio2, SIO2_LIMIT);
                        const hasVal = row.sio2 !== '' && row.sio2 !== null && row.sio2 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-sio2`}
                                type="text"
                                inputMode="decimal"
                                value={row.sio2}
                                onChange={(e) => handleCellChange(row.id, 'sio2', e.target.value)}
                                placeholder="0.20 ± 5"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.sio2} ppm (Valid: 0.20 ± 5 ppm)`
                                      : `NORMAL: ${row.sio2} ppm (Valid: 0.20 ± 5 ppm)`
                                    : 'Valid Reference: 0.20 ppm ±5'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_sio2`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
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

                    {/* Action */}
                    <td className="py-2.5 px-2 text-center align-top">
                      {!row.isDefault ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          title="Delete stream row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold block pt-1">Standard</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Total Stream Rows: {readings.length}</span>
            <span>•</span>
            <span className="text-slate-500">Frequency: <strong className="text-slate-700">Day</strong></span>
            <span>•</span>
            <span>Click any cell to edit numeric values</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DMWaterAnalysisPage;
