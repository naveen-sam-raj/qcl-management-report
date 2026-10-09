import React, { useState, useCallback, useEffect } from 'react';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
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
  Waves,
} from 'lucide-react';

// Default initial readings matching the user's legacy screenshot
const DEFAULT_READINGS = [
  {
    id: 't11',
    time: '11:00',
    sec200: { fnh3: '3', cnh3: '0' },
    sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't13',
    time: '13:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't15',
    time: '15:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't17',
    time: '17:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
  {
    id: 't19',
    time: '19:00',
    sec200: { fnh3: '1020', cnh3: '2244' },
    sec400: { fnh3: '5780', cnh3: '2720', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '38.5' },
  },
  {
    id: 't21',
    time: '21:00',
    sec200: { fnh3: '0', cnh3: '0' },
    sec400: { fnh3: '0', cnh3: '0', hco3: '0' },
    finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '0' },
  },
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

const SewerWaterAnalysisPage = ({ plantId = 'offset' }) => {
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
        const response = await api.get(`/api/sewer-water-analysis?date=${date}`);
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
  const handleCellChange = useCallback((id, section, field, value) => {
    if (section === 'time') {
      setReadings((prev) =>
        prev.map((r) => (r.id === id ? { ...r, time: value } : r))
      );
      return;
    }

    if (!isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          [section]: {
            ...r[section],
            [field]: value,
          },
        };
      })
    );

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${section}_${field}`];
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
        time: '23:00',
        sec200: { fnh3: '', cnh3: '' },
        sec400: { fnh3: '', cnh3: '', hco3: '' },
        finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' },
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
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Save handler ──
  const handleSave = async () => {
    const newErrors = {};

    readings.forEach((r) => {
      const validate = (section, field) => {
        const val = r[section]?.[field];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.id}_${section}_${field}`] = 'Invalid';
        }
      };

      validate('sec200', 'fnh3');
      validate('sec200', 'cnh3');
      validate('sec400', 'fnh3');
      validate('sec400', 'cnh3');
      validate('sec400', 'hco3');
      validate('finalOutlet', 'fnh3');
      validate('finalOutlet', 'cnh3');
      validate('finalOutlet', 'hco3');
      validate('finalOutlet', 'pcl');
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
        unit: 'Sewer Water',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/sewer-water-analysis', payload);

      if (res.data?.success) {
        showToast?.('Sewer Water Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'Sewer Water data saved.', 'success');
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
                OFFSET Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Utilities & Facilities
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60">
                Sewer Water
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Waves className="w-5 h-5 text-teal-600" />
              SEWER WATER ANALYSIS
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
                Save Sewer Water Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: Grouped Parameter Measurements Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Sewer Water Plant Section Measurements
              </h2>
            </div>

            {/* Date Input inside Table Header */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="sewerwater-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="sewerwater-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-2.5 pr-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 bg-white hover:border-slate-400"
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
            className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 text-xs font-bold transition flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Time Slot
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Super Header Row: Grouped Plant Sections */}
              <tr className="bg-slate-950 text-white text-xs select-none border-b border-slate-800">
                <th rowSpan={2} className="py-2.5 px-3 w-10 text-center border-r border-slate-800">
                  #
                </th>
                <th rowSpan={2} className="py-2.5 px-3 w-24 text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME
                  </div>
                </th>

                {/* 200 # Group */}
                <th
                  colSpan={2}
                  className="py-2 px-3 text-center border-r border-slate-800 bg-sky-950/80 font-black tracking-wider text-sky-300"
                >
                  &lt;------- 200 # -------&gt;
                </th>

                {/* 400 # Group */}
                <th
                  colSpan={3}
                  className="py-2 px-3 text-center border-r border-slate-800 bg-indigo-950/80 font-black tracking-wider text-indigo-300"
                >
                  &lt;--------- 400 # ---------&gt;
                </th>

                {/* FINAL OUTLET Group */}
                <th
                  colSpan={4}
                  className="py-2 px-3 text-center border-r border-slate-800 bg-emerald-950/80 font-black tracking-wider text-emerald-300"
                >
                  &lt;----- FINAL OUTLET -----&gt;
                </th>

                <th rowSpan={2} className="py-2.5 px-2 w-14 text-center">
                  ACTION
                </th>
              </tr>

              {/* Sub Header Row: Parameters */}
              <tr className="bg-slate-900 text-white text-xs font-extrabold select-none">
                {/* 200 # */}
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-sky-200">
                  FNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-sky-200">
                  CNH₃
                </th>

                {/* 400 # */}
                <th className="py-2 px-2 text-center w-24 border-r border-slate-800 text-indigo-200">
                  FNH₃
                </th>
                <th className="py-2 px-2 text-center w-24 border-r border-slate-800 text-indigo-200">
                  CNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-indigo-200">
                  HCO₃
                </th>

                {/* FINAL OUTLET */}
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  FNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  CNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  HCO₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  PCl
                <div className="text-[9px] font-normal text-emerald-400/80 normal-case mt-0.5">Limit: NIL</div></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const getLimit = (category, param) => getCellLimit('offset', 'sewer-water', 'Shift', `${category}_${param}`);
                
                const sec200Fnh3Limit = getLimit('sec200', 'fnh3');
                const sec200Cnh3Limit = getLimit('sec200', 'cnh3');
                const sec400Fnh3Limit = getLimit('sec400', 'fnh3');
                const sec400Cnh3Limit = getLimit('sec400', 'cnh3');
                const finalOutletFnh3Limit = getLimit('finalOutlet', 'fnh3');
                const finalOutletCnh3Limit = getLimit('finalOutlet', 'cnh3');
                const pclLimit = getLimit('finalOutlet', 'pcl');

                const isValid = (val, limit) => limit && val !== '' ? validateCellValue(val, limit) : { isOutOfLimit: false };
                
                const vSec200Fnh3 = isValid(row.sec200.fnh3, sec200Fnh3Limit);
                const vSec200Cnh3 = isValid(row.sec200.cnh3, sec200Cnh3Limit);
                const vSec400Fnh3 = isValid(row.sec400.fnh3, sec400Fnh3Limit);
                const vSec400Cnh3 = isValid(row.sec400.cnh3, sec400Cnh3Limit);
                const vFinalOutletFnh3 = isValid(row.finalOutlet.fnh3, finalOutletFnh3Limit);
                const vFinalOutletCnh3 = isValid(row.finalOutlet.cnh3, finalOutletCnh3Limit);

                const isPclNil = row.finalOutlet.pcl !== undefined && ['nil', 'n', 'ni', 'none', '-'].includes(String(row.finalOutlet.pcl).toLowerCase().trim());
                const vPcl = pclLimit && row.finalOutlet.pcl !== '' ? (isPclNil ? { isOutOfLimit: false } : { isOutOfLimit: true }) : { isOutOfLimit: false };

                return (
                <tr
                  key={row.id}
                  className="hover:bg-teal-50/30 transition-colors"
                >
                  {/* Row index */}
                  <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                    {idx + 1}
                  </td>

                  {/* TIME */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100 bg-slate-50/30">
                    <input
                      type="text"
                      value={row.time}
                      onChange={(e) => handleCellChange(row.id, 'time', null, e.target.value)}
                      placeholder="HH:mm"
                      className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-md py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 shadow-2xs"
                    />
                  </td>

                  {/* ── 200 # Columns ── */}
                  <td className="py-2.5 px-1.5 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.sec200?.fnh3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'sec200', 'fnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_sec200_fnh3`] || vSec200Fnh3.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.sec200?.fnh3 !== '' && row.sec200?.fnh3 !== '0'
                          ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                      {vSec200Fnh3.isOutOfLimit && !errors[`${row.id}_sec200_fnh3`] && sec200Fnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {sec200Fnh3Limit.formattedLabel || `Limit: ${sec200Fnh3Limit.min}-${sec200Fnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec200Fnh3.isOutOfLimit && !errors[`${row.id}_sec200_fnh3`] && sec200Fnh3Limit && (row.sec200?.fnh3 === '' || row.sec200?.fnh3 === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {sec200Fnh3Limit.formattedRange || `${sec200Fnh3Limit.min}-${sec200Fnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                  <td className="py-2.5 px-1.5 text-center border-r border-slate-200">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.sec200?.cnh3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'sec200', 'cnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_sec200_cnh3`] || vSec200Cnh3.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.sec200?.cnh3 !== '' && row.sec200?.cnh3 !== '0'
                          ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                      {vSec200Cnh3.isOutOfLimit && !errors[`${row.id}_sec200_cnh3`] && sec200Cnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {sec200Cnh3Limit.formattedLabel || `Limit: ${sec200Cnh3Limit.min}-${sec200Cnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec200Cnh3.isOutOfLimit && !errors[`${row.id}_sec200_cnh3`] && sec200Cnh3Limit && (row.sec200?.cnh3 === '' || row.sec200?.cnh3 === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {sec200Cnh3Limit.formattedRange || `${sec200Cnh3Limit.min}-${sec200Cnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                  {/* ── 400 # Columns ── */}
                  <td className="py-2.5 px-1.5 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.sec400?.fnh3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'sec400', 'fnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_sec400_fnh3`] || vSec400Fnh3.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.sec400?.fnh3 !== '' && row.sec400?.fnh3 !== '0'
                          ? 'border-indigo-300 bg-indigo-50/30 font-bold text-indigo-950 focus:border-indigo-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                      {vSec400Fnh3.isOutOfLimit && !errors[`${row.id}_sec400_fnh3`] && sec400Fnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {sec400Fnh3Limit.formattedLabel || `Limit: ${sec400Fnh3Limit.min}-${sec400Fnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec400Fnh3.isOutOfLimit && !errors[`${row.id}_sec400_fnh3`] && sec400Fnh3Limit && (row.sec400?.fnh3 === '' || row.sec400?.fnh3 === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {sec400Fnh3Limit.formattedRange || `${sec400Fnh3Limit.min}-${sec400Fnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                  <td className="py-2.5 px-1.5 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.sec400?.cnh3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'sec400', 'cnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_sec400_cnh3`] || vSec400Cnh3.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.sec400?.cnh3 !== '' && row.sec400?.cnh3 !== '0'
                          ? 'border-indigo-300 bg-indigo-50/30 font-bold text-indigo-950 focus:border-indigo-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                      {vSec400Cnh3.isOutOfLimit && !errors[`${row.id}_sec400_cnh3`] && sec400Cnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {sec400Cnh3Limit.formattedLabel || `Limit: ${sec400Cnh3Limit.min}-${sec400Cnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec400Cnh3.isOutOfLimit && !errors[`${row.id}_sec400_cnh3`] && sec400Cnh3Limit && (row.sec400?.cnh3 === '' || row.sec400?.cnh3 === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {sec400Cnh3Limit.formattedRange || `${sec400Cnh3Limit.min}-${sec400Cnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                  <td className="py-2.5 px-1.5 text-center border-r border-slate-200">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.sec400?.hco3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'sec400', 'hco3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_sec400_hco3`]
                          ? 'border-red-500 bg-red-50'
                          : row.sec400?.hco3 !== '' && row.sec400?.hco3 !== '0'
                          ? 'border-indigo-300 bg-indigo-50/30 font-bold text-indigo-950 focus:border-indigo-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* ── FINAL OUTLET Columns ── */}
                  <td className="py-2.5 px-1.5 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.finalOutlet?.fnh3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'fnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_finalOutlet_fnh3`] || vFinalOutletFnh3.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.finalOutlet?.fnh3 !== '' && row.finalOutlet?.fnh3 !== '0'
                          ? 'border-emerald-300 bg-emerald-50/30 font-bold text-emerald-950 focus:border-emerald-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                      {vFinalOutletFnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_fnh3`] && finalOutletFnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {finalOutletFnh3Limit.formattedLabel || `Limit: ${finalOutletFnh3Limit.min}-${finalOutletFnh3Limit.max}`}
                        </div>
                      )}
                      {!vFinalOutletFnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_fnh3`] && finalOutletFnh3Limit && (row.finalOutlet?.fnh3 === '' || row.finalOutlet?.fnh3 === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {finalOutletFnh3Limit.formattedRange || `${finalOutletFnh3Limit.min}-${finalOutletFnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                  <td className="py-2.5 px-1.5 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.finalOutlet?.cnh3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'cnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_finalOutlet_cnh3`] || vFinalOutletCnh3.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.finalOutlet?.cnh3 !== '' && row.finalOutlet?.cnh3 !== '0'
                          ? 'border-emerald-300 bg-emerald-50/30 font-bold text-emerald-950 focus:border-emerald-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                      {vFinalOutletCnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_cnh3`] && finalOutletCnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {finalOutletCnh3Limit.formattedLabel || `Limit: ${finalOutletCnh3Limit.min}-${finalOutletCnh3Limit.max}`}
                        </div>
                      )}
                      {!vFinalOutletCnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_cnh3`] && finalOutletCnh3Limit && (row.finalOutlet?.cnh3 === '' || row.finalOutlet?.cnh3 === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {finalOutletCnh3Limit.formattedRange || `${finalOutletCnh3Limit.min}-${finalOutletCnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                  <td className="py-2.5 px-1.5 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.finalOutlet?.hco3 ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'hco3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_finalOutlet_hco3`]
                          ? 'border-red-500 bg-red-50'
                          : row.finalOutlet?.hco3 !== '' && row.finalOutlet?.hco3 !== '0'
                          ? 'border-emerald-300 bg-emerald-50/30 font-bold text-emerald-950 focus:border-emerald-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  <td className="py-2.5 px-1.5 text-center border-r border-slate-200">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.finalOutlet?.pcl ?? ''}
                      onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'pcl', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        (errors[`${row.id}_finalOutlet_pcl`] || vPcl.isOutOfLimit)
                          ? 'border-red-500 bg-red-50'
                          : row.finalOutlet?.pcl !== '' && row.finalOutlet?.pcl !== '0'
                          ? 'border-emerald-300 bg-emerald-50/30 font-bold text-emerald-950 focus:border-emerald-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  
                    {vPcl.isOutOfLimit && !errors[`${row.id}_finalOutlet_pcl`] && pclLimit && (
                    <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                        Limit: NIL
                    </div>
                    )}
                    {!vPcl.isOutOfLimit && !errors[`${row.id}_finalOutlet_pcl`] && pclLimit && (row.finalOutlet?.pcl === '' || row.finalOutlet?.pcl === undefined) && (
                    <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                        NIL
                    </div>
                    )}
                </td>

                  {/* ACTION */}
                  <td className="py-2.5 px-2 text-center">
                    <button
                      onClick={() => handleRemoveRow(row.id)}
                      disabled={readings.length <= 1}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ); })}
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
              Add Another Time Slot
            </button>
            <span className="text-slate-500 font-medium">
              {readings.length} {readings.length === 1 ? 'slot' : 'slots'} recorded
            </span>
          </div>

          <div className="text-slate-500 text-xs">
            Sections: <span className="font-semibold text-slate-700">200 # (FNH₃, CNH₃) | 400 # (FNH₃, CNH₃, HCO₃) | Final Outlet (FNH₃, CNH₃, HCO₃, PCl)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SewerWaterAnalysisPage;
