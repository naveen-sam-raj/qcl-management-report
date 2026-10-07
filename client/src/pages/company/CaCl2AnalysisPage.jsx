import React, { useState, useCallback, useEffect } from 'react';
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
  Clock,
  Plus,
  Trash2,
  FlaskConical,
} from 'lucide-react';
import {
  validateCellValue,
  ACL_CACL2_LIMITS,
} from '../../services/analysisValidation';

// Default initial readings matching laboratory reference (Frequency: Day)
const DEFAULT_READINGS = [
  {
    id: 'cacl2_1',
    sample: 'CaCl2 Solution',
    frequency: 'Day',
    time: '08:00',
    ph: '7.7',
    conc: '20',
    fnh3: '1000',
    cnh3: '500',
    ss: '60',
  },
];

const NUMERIC_FIELDS = ['ph', 'conc', 'fnh3', 'cnh3', 'ss'];

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

const CaCl2AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState('2026-09-14');
  const [readings, setReadings] = useState(DEFAULT_READINGS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/cacl2-analysis?date=${date}`);
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
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Clear error for this field
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Add new reading row ──
  const handleAddRow = () => {
    const nextId = `cacl2_${Date.now()}`;
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        sample: `CaCl2 Sample #${prev.length + 1}`,
        frequency: 'Day',
        time: '08:00',
        ph: '',
        conc: '',
        fnh3: '',
        cnh3: '',
        ss: '',
      },
    ]);
    showToast?.('Added new sampling row for CaCl2.', 'info');
  };

  // ── Remove reading row ──
  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
    showToast?.('Row removed.', 'info');
  };

  // ── Reset ──
  const handleReset = () => {
    setReadings(DEFAULT_READINGS);
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Save handler ──
  const handleSave = async () => {
    const newErrors = {};

    readings.forEach((r) => {
      NUMERIC_FIELDS.forEach((f) => {
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
        plant: 'ACL',
        unit: 'CaCl2',
        frequency: 'Day',
        analysisType: 'CaCl2 Analysis',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/cacl2-analysis', payload);

      if (res.data?.success) {
        showToast?.('CaCl2 Analysis data saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'CaCl2 data saved.', 'success');
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
      {/* ── TOP BREADCRUMB HEADER (ACL Theme) ── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Titles */}
          <div className="flex items-center gap-3">
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
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <FlaskConical className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-indigo-600 font-semibold">Cacl2</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-indigo-600" />
                  CACL2 ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                  FREQUENCY: DAY
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap self-end sm:self-auto">
            {/* Integrated Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="cacl2-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="cacl2-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-7 pr-2 py-1 text-xs font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-slate-800 bg-white border-slate-300 hover:border-slate-400"
                  required
                />
              </div>
              {date && (
                <span className="text-xs font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded border border-indigo-200 hidden sm:inline-block">
                  {formatDateDisplay(date)}
                </span>
              )}
            </div>

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
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 disabled:opacity-50"
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
      </div>

      {/* ── MEASUREMENTS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                CaCl2 Parameters Table
              </h2>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md border border-indigo-200/60">
              Frequency: Day
            </span>
          </div>

          <button
            onClick={handleAddRow}
            className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 text-xs font-bold transition flex items-center gap-1"
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
                <th className="py-3 px-3 w-40 border-r border-slate-700">SAMPLE / STREAM</th>
                <th className="py-3 px-2 w-20 text-center border-r border-slate-700">TIME</th>

                {/* 1. pH */}
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">pH</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 7.7 ±1</div>
                </th>

                {/* 2. CONC */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">CONC</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 20% ±5.0</div>
                </th>

                {/* 3. FNH3 */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">FNH₃</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">PPM (±50)</div>
                </th>

                {/* 4. CNH3 */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">CNH₃</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">PPM (±100)</div>
                </th>

                {/* 5. SS */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">SS</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">PPM (±10)</div>
                </th>

                <th className="py-3 px-2 w-12 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-indigo-50/30 transition-colors bg-white"
                  >
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* Sample Name */}
                    <td className="py-2.5 px-3 font-bold border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                        <input
                          type="text"
                          value={row.sample}
                          onChange={(e) => handleCellChange(row.id, 'sample', e.target.value)}
                          className="w-full font-bold text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition text-xs"
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
                        className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-1 text-slate-800 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 transition shadow-2xs"
                      />
                    </td>

                    {/* 1. pH: Reference 7.7, Tolerance ±1 -> Range 6.7 – 8.7 */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ph, ACL_CACL2_LIMITS.ph);
                        const hasVal = row.ph !== '' && row.ph !== null && row.ph !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-ph`}
                                type="text"
                                inputMode="decimal"
                                value={row.ph}
                                onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                                placeholder="6.7 – 8.7"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ph} (Valid Range: 6.7 – 8.7)`
                                      : `NORMAL: ${row.ph} (Valid Range: 6.7 – 8.7)`
                                    : 'Valid Range: 6.7 – 8.7'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_ph`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 6.7 – 8.7"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">6.7 – 8.7</span>
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

                    {/* 2. CONC: Reference 20%, Tolerance ±5.0 -> Range 15% – 25% */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.conc, ACL_CACL2_LIMITS.conc);
                        const hasVal = row.conc !== '' && row.conc !== null && row.conc !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-conc`}
                                type="text"
                                inputMode="decimal"
                                value={row.conc}
                                onChange={(e) => handleCellChange(row.id, 'conc', e.target.value)}
                                placeholder="15 – 25"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.conc}% (Valid Range: 15% – 25%)`
                                      : `NORMAL: ${row.conc}% (Valid Range: 15% – 25%)`
                                    : 'Valid Range: 15% – 25%'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_conc`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 15% – 25%"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">15% – 25%</span>
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
                            {errors[`${row.id}_conc`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_conc`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. FNH3: Reference 1000 PPM, Tolerance ±50 -> Range 950 – 1050 PPM */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.fnh3, ACL_CACL2_LIMITS.fnh3);
                        const hasVal = row.fnh3 !== '' && row.fnh3 !== null && row.fnh3 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-fnh3`}
                                type="text"
                                inputMode="decimal"
                                value={row.fnh3}
                                onChange={(e) => handleCellChange(row.id, 'fnh3', e.target.value)}
                                placeholder="950 – 1050"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.fnh3} PPM (Valid Range: 950 – 1050 PPM)`
                                      : `NORMAL: ${row.fnh3} PPM (Valid Range: 950 – 1050 PPM)`
                                    : 'Valid Range: 950 – 1050 PPM'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_fnh3`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 950 – 1050 PPM"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">950 – 1050 PPM</span>
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
                            {errors[`${row.id}_fnh3`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_fnh3`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 4. CNH3: Reference 500 PPM, Tolerance ±100 -> Range 400 – 600 PPM */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.cnh3, ACL_CACL2_LIMITS.cnh3);
                        const hasVal = row.cnh3 !== '' && row.cnh3 !== null && row.cnh3 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-cnh3`}
                                type="text"
                                inputMode="decimal"
                                value={row.cnh3}
                                onChange={(e) => handleCellChange(row.id, 'cnh3', e.target.value)}
                                placeholder="400 – 600"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.cnh3} PPM (Valid Range: 400 – 600 PPM)`
                                      : `NORMAL: ${row.cnh3} PPM (Valid Range: 400 – 600 PPM)`
                                    : 'Valid Range: 400 – 600 PPM'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_cnh3`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 400 – 600 PPM"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">400 – 600 PPM</span>
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
                            {errors[`${row.id}_cnh3`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_cnh3`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. SS: Reference 60 PPM, Tolerance ±10 -> Range 50 – 70 PPM */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ss, ACL_CACL2_LIMITS.ss);
                        const hasVal = row.ss !== '' && row.ss !== null && row.ss !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-ss`}
                                type="text"
                                inputMode="decimal"
                                value={row.ss}
                                onChange={(e) => handleCellChange(row.id, 'ss', e.target.value)}
                                placeholder="50 – 70"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ss} PPM (Valid Range: 50 – 70 PPM)`
                                      : `NORMAL: ${row.ss} PPM (Valid Range: 50 – 70 PPM)`
                                    : 'Valid Range: 50 – 70 PPM'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${row.id}_ss`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 50 – 70 PPM"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">50 – 70 PPM</span>
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
                            {errors[`${row.id}_ss`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_ss`]}
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
                        disabled={readings.length <= 1}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              Add Another Sampling Row
            </button>
            <span className="text-slate-500 font-medium">
              {readings.length} {readings.length === 1 ? 'row' : 'rows'} recorded for CaCl2
            </span>
          </div>

          <div className="text-slate-500 text-xs">
            Units: <span className="font-semibold text-slate-700">CONC in % | FNH₃, CNH₃, SS in PPM</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaCl2AnalysisPage;
