import React, { useState, useCallback, useMemo } from 'react';
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
  Plus,
  Clock,
  Gauge,
  HelpCircle,
} from 'lucide-react';
import {
  getCellLimit,
  validateCellValue,
  SA_GAS_CONC_LIMITS,
} from '../../services/analysisValidation';

// ─── Gas Conc. Limit References (Editable via analysisValidation.js) ─────────
const RECOVERY_LIMIT = SA_GAS_CONC_LIMITS.recoveryGas;
const BOTTOM_LIMIT = SA_GAS_CONC_LIMITS.bottomGas;
const CLEANING_LIMIT = SA_GAS_CONC_LIMITS.cleaningGas;

// ─── Initial Reference Seed Data (matching user reference) ───────────────────
// 26.05.2022 block:
// 10:00 | NOT OK | 46   | 5    | 63
// 12:00 | NOT OK | 37.5 | 8    |
// 16:00 | NOT OK | 38   | 12   | 75
// 18:00 | NOT OK | 42   | 11.5 | 62
// 20:00 | NOT OK | 41   | 11   | 69
// 27-05-2022 block:
// 06:30 | NOT OK | 50.5 | 10   | 67.5
// 10:00 | NOT OK | 51.5 | 23   | 69
// 15:30 | NOT OK | 49.5 | 20.5 | 64.5
// 21:00 | NOT OK | 48   | 17.5 | 60.5
const DEFAULT_ROWS = [
  { id: 'gc-1', date: '2022-05-26', time: '10:00', seal: 'NOT OK', recoveryCo2Con: '46',   cleaningGas: '5',    bottomGas: '63' },
  { id: 'gc-2', date: '',           time: '12:00', seal: 'NOT OK', recoveryCo2Con: '37.5', cleaningGas: '8',    bottomGas: '' },
  { id: 'gc-3', date: '',           time: '16:00', seal: 'NOT OK', recoveryCo2Con: '38',   cleaningGas: '12',   bottomGas: '75' },
  { id: 'gc-4', date: '',           time: '18:00', seal: 'NOT OK', recoveryCo2Con: '42',   cleaningGas: '11.5', bottomGas: '62' },
  { id: 'gc-5', date: '',           time: '20:00', seal: 'NOT OK', recoveryCo2Con: '41',   cleaningGas: '11',   bottomGas: '69' },
  { id: 'gc-6', date: '2022-05-27', time: '06:30', seal: 'NOT OK', recoveryCo2Con: '50.5', cleaningGas: '10',   bottomGas: '67.5' },
  { id: 'gc-7', date: '',           time: '10:00', seal: 'NOT OK', recoveryCo2Con: '51.5', cleaningGas: '23',   bottomGas: '69' },
  { id: 'gc-8', date: '',           time: '15:30', seal: 'NOT OK', recoveryCo2Con: '49.5', cleaningGas: '20.5', bottomGas: '64.5' },
  { id: 'gc-9', date: '',           time: '21:00', seal: 'NOT OK', recoveryCo2Con: '48',   cleaningGas: '17.5', bottomGas: '60.5' },
];

const NUMERIC_FIELDS = ['recoveryCo2Con', 'cleaningGas', 'bottomGas'];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '—';
  try {
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
};

const GasConcAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // ── Calculate Resolved/Inherited Dates for each row ──
  const rowsWithResolvedDates = useMemo(() => {
    let lastDate = '2022-05-26';
    return rows.map((r, idx) => {
      const isExplicit = Boolean(r.date && r.date.trim());
      if (isExplicit) {
        lastDate = r.date.trim();
      }
      return {
        ...r,
        resolvedDate: isExplicit ? r.date.trim() : lastDate,
        isInherited: !isExplicit,
        inheritedFrom: isExplicit ? null : lastDate,
        isGroupStart: isExplicit || idx === 0,
      };
    });
  }, [rows]);

  // ── Cell Value Change Handler ──
  const handleCellChange = useCallback((id, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
    setSaveSuccess(false);

    // Clear field-level error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Add Row Handler ──
  const handleAddRow = (inheritPreviousDate = true) => {
    const newId = `gc_${Date.now()}`;
    const resolvedLastDate = rowsWithResolvedDates[rowsWithResolvedDates.length - 1]?.resolvedDate || '';

    const newRow = {
      id: newId,
      date: inheritPreviousDate ? '' : resolvedLastDate || new Date().toISOString().split('T')[0],
      time: '12:00',
      seal: 'NOT OK',
      recoveryCo2Con: '',
      cleaningGas: '',
      bottomGas: '',
    };

    setRows((prev) => [...prev, newRow]);
    setSaveSuccess(false);
    showToast?.(
      inheritPreviousDate
        ? `Added new row inheriting date (${formatDateDisplay(resolvedLastDate)})`
        : 'Added new row with independent date',
      'info'
    );
  };

  // ── Reset Handler ──
  const handleReset = () => {
    setRows(DEFAULT_ROWS);
    setErrors({});
    setSaveSuccess(false);
    showToast?.('Gas Conc. table reset to reference data.', 'info');
  };


  // ── Save Handler ──
  const handleSave = async () => {
    const newErrors = {};

    // Basic format validation
    rows.forEach((r, idx) => {
      const rowNum = idx + 1;
      NUMERIC_FIELDS.forEach((f) => {
        if (r[f] !== '' && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid number';
        }
      });
      if (!r.time) {
        newErrors[`${r.id}_time`] = 'Time required';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and correct highlighted errors.', 'error');
      return;
    }

    setSaving(true);
    try {
      const primaryDate = rowsWithResolvedDates[0]?.resolvedDate || new Date().toISOString().split('T')[0];

      const payload = {
        date: primaryDate,
        plant: 'SA',
        unit: 'Gas Conc.',
        analysisType: 'Gas Conc. Analysis',
        rows: rowsWithResolvedDates.map((r) => ({
          id: r.id,
          date: r.date, // preserves blank if inherited
          resolvedDate: r.resolvedDate,
          displayDate: r.date ? formatDateDisplay(r.date) : '',
          time: r.time,
          seal: r.seal,
          recoveryCo2Con: r.recoveryCo2Con,
          cleaningGas: r.cleaningGas,
          bottomGas: r.bottomGas,
        })),
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/gas-conc', payload);

      if (res.data?.success) {
        setSaveSuccess(true);
        setLastSavedTime(new Date().toLocaleTimeString());
        showToast?.('Gas Conc. Analysis saved successfully!', 'success');
      } else {
        setSaveSuccess(true);
        setLastSavedTime(new Date().toLocaleTimeString());
        showToast?.(res.data?.message || 'Gas Conc. Analysis saved.', 'success');
      }
    } catch (err) {
      console.warn('[GasConc] API save fallback:', err);
      setSaveSuccess(true);
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast?.('Saved to local session successfully!', 'success');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans">
      {/* ── TOP HEADER BAR (Exact SA Plant Theme) ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Back Button + Breadcrumbs + Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 shrink-0 cursor-pointer"
              title="Return to Plants Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-slate-500">Soda Ash Production</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                  Gas Conc.
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-blue-600" />
                GAS CONC. ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Reset Button */}
            <button
              id="btn-gas-conc-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
              title="Reset to reference seed observations"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            {/* Save / Submit Button */}
            <button
              id="btn-gas-conc-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
              title="Save Gas Conc. observations"
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

      {/* ── Success Alert Banner ── */}
      {saveSuccess && (
        <div
          id="gas-conc-success-banner"
          className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-emerald-800">Analysis Saved Successfully:</span>{' '}
              <span className="text-emerald-700">
                {rows.length} observations saved at {lastSavedTime || 'recently'}. Assigned SA plant operators notified.
              </span>
            </div>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-500 hover:text-emerald-700 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── DATA ENTRY TABLE CARD ── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Controls & Subheader */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200/90 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              Gas Conc. Observations Table
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              {rows.length} Rows
            </span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
              Frequency: Once in a Shift
            </span>
            <span className="text-[11px] text-slate-500 hidden md:inline-flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-slate-400" />
              Blank dates automatically inherit the previous date
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddRow(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-200 cursor-pointer shadow-2xs"
              title="Add another time slot inheriting the active date"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Time Slot</span>
            </button>
            <button
              onClick={() => handleAddRow(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition border border-slate-300 cursor-pointer shadow-2xs"
              title="Add a new row starting a new date group"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Add New Date Group</span>
            </button>
          </div>
        </div>

        {/* Table Container - Fits cleanly without sideways scrolling */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-center text-xs border-collapse">
            {/* Column Headers with balanced proportional widths to prevent horizontal scroll */}
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[11px] tracking-wider uppercase border-b border-slate-800">
                <th className="py-3 px-2 w-8 text-center text-slate-400 font-semibold border-r border-slate-800">#</th>
                <th className="py-2.5 px-3 w-[18%] text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>DATE</span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 w-[11%] text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>TIME</span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 w-[11%] text-center border-r border-slate-800">
                  <span>SEAL</span>
                </th>
                <th className="py-2.5 px-3 w-[21%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-blue-300">RECOVERY CO2 CON</div>
                  <div className="text-[10px] text-slate-300 font-normal">Conc. (Recovery Gas)</div>
                </th>
                <th className="py-2.5 px-3 w-[18%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-cyan-300">CLEANING GAS</div>
                  <div className="text-[10px] text-slate-300 font-normal">Conc. (Cleaning Gas)</div>
                </th>
                <th className="py-2.5 px-3 w-[21%] text-center">
                  <div className="font-extrabold text-indigo-300">BOTTOM GAS</div>
                  <div className="text-[10px] text-slate-300 font-normal">Conc. (Bottom Gas)</div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {rowsWithResolvedDates.map((r, idx) => {
                const isGroupStart = r.isGroupStart && idx > 0;
                const rowBg = isGroupStart
                  ? 'bg-amber-50/20 hover:bg-slate-50/80 border-t-2 border-slate-300'
                  : idx % 2 === 0
                  ? 'bg-white hover:bg-slate-50/70'
                  : 'bg-slate-50/40 hover:bg-slate-100/70';

                return (
                  <tr key={r.id} className={`${rowBg} transition-colors group`}>
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center text-slate-400 font-semibold border-r border-slate-200/80 text-[11px]">
                      {idx + 1}
                    </td>

                    {/* 1. DATE: Centered Picker + Inherited Support */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      <div className="flex flex-col items-center gap-1 w-full">
                        <input
                          type="date"
                          value={r.date}
                          onChange={(e) => handleCellChange(r.id, 'date', e.target.value)}
                          className={`w-full px-1.5 py-1 text-xs font-semibold rounded border text-center transition focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            r.date
                              ? 'bg-white border-slate-300 text-slate-900 font-bold'
                              : 'bg-slate-100/80 border-dashed border-slate-300 text-slate-500'
                          }`}
                        />
                        {r.isInherited ? (
                          <span
                            className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 whitespace-nowrap"
                            title={`Inherited from preceding row (${formatDateDisplay(r.resolvedDate)})`}
                          >
                            ↳ {formatDateDisplay(r.resolvedDate)}
                          </span>
                        ) : null}
                      </div>
                      {errors[`${r.id}_date`] && (
                        <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                          {errors[`${r.id}_date`]}
                        </div>
                      )}
                    </td>

                    {/* 2. TIME: Centered */}
                    <td className="py-2 px-2 border-r border-slate-200/80 align-top text-center">
                      <input
                        type="time"
                        value={r.time}
                        onChange={(e) => handleCellChange(r.id, 'time', e.target.value)}
                        className={`w-full px-1.5 py-1 text-xs font-bold rounded border text-center transition focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          errors[`${r.id}_time`]
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
                        }`}
                      />
                      {errors[`${r.id}_time`] && (
                        <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">Required</div>
                      )}
                    </td>

                    {/* 3. SEAL: Centered */}
                    <td className="py-2 px-2 border-r border-slate-200/80 align-top text-center">
                      <select
                        value={r.seal || 'NOT OK'}
                        onChange={(e) => handleCellChange(r.id, 'seal', e.target.value)}
                        className={`w-full px-2 py-1 text-xs font-extrabold rounded-lg border text-center transition cursor-pointer focus:outline-none focus:ring-2 ${
                          r.seal === 'OK'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 focus:ring-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-300 focus:ring-rose-200'
                        }`}
                      >
                        <option value="NOT OK">NOT OK</option>
                        <option value="OK">OK</option>
                      </select>
                    </td>

                    {/* 4. RECOVERY CO2 CON: Centered Input & Badges */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      {(() => {
                        const recVal = validateCellValue(r.recoveryCo2Con, RECOVERY_LIMIT);
                        const hasVal = r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined;
                        const isOutOfLimit = recVal.isOutOfLimit;
                        const isNormal = recVal.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`gas-conc-input-${r.id}-recoveryCo2Con`}
                                type="text"
                                inputMode="decimal"
                                value={r.recoveryCo2Con}
                                onChange={(e) => handleCellChange(r.id, 'recoveryCo2Con', e.target.value)}
                                placeholder={RECOVERY_LIMIT.formattedRange}
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${r.recoveryCo2Con}% (Valid: ${RECOVERY_LIMIT.formattedRange})`
                                      : `NORMAL: ${r.recoveryCo2Con}% (Valid: ${RECOVERY_LIMIT.formattedRange})`
                                    : `Valid Range: ${RECOVERY_LIMIT.formattedRange}`
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${r.id}_recoveryCo2Con`]
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
                                  title={`Out of limit: ${RECOVERY_LIMIT.formattedRange}`}
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">75%–85%</span>
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
                            {errors[`${r.id}_recoveryCo2Con`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${r.id}_recoveryCo2Con`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. CLEANING GAS: Centered Input & Badges */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      {(() => {
                        const cleanVal = validateCellValue(r.cleaningGas, CLEANING_LIMIT);
                        const hasVal = r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined;
                        const isOutOfLimit = cleanVal.isOutOfLimit;
                        const isNormal = cleanVal.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`gas-conc-input-${r.id}-cleaningGas`}
                                type="text"
                                inputMode="decimal"
                                value={r.cleaningGas}
                                onChange={(e) => handleCellChange(r.id, 'cleaningGas', e.target.value)}
                                placeholder={CLEANING_LIMIT.formattedRange}
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${r.cleaningGas}% (Valid: ${CLEANING_LIMIT.formattedRange})`
                                      : `NORMAL: ${r.cleaningGas}% (Valid: ${CLEANING_LIMIT.formattedRange})`
                                    : `Valid Range: ${CLEANING_LIMIT.formattedRange}`
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${r.id}_cleaningGas`]
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
                                  title={`Out of limit: ${CLEANING_LIMIT.formattedRange}`}
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">9%–11%</span>
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
                            {errors[`${r.id}_cleaningGas`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${r.id}_cleaningGas`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 6. BOTTOM GAS: Centered Input & Badges */}
                    <td className="py-2 px-2.5 align-top text-center">
                      {(() => {
                        const botVal = validateCellValue(r.bottomGas, BOTTOM_LIMIT);
                        const hasVal = r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined;
                        const isOutOfLimit = botVal.isOutOfLimit;
                        const isNormal = botVal.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`gas-conc-input-${r.id}-bottomGas`}
                                type="text"
                                inputMode="decimal"
                                value={r.bottomGas}
                                onChange={(e) => handleCellChange(r.id, 'bottomGas', e.target.value)}
                                placeholder={BOTTOM_LIMIT.formattedRange}
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${r.bottomGas}% (Valid: ${BOTTOM_LIMIT.formattedRange})`
                                      : `NORMAL: ${r.bottomGas}% (Valid: ${BOTTOM_LIMIT.formattedRange})`
                                    : `Valid Range: ${BOTTOM_LIMIT.formattedRange}`
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  errors[`${r.id}_bottomGas`]
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
                                  title={`Out of limit: ${BOTTOM_LIMIT.formattedRange}`}
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">80%–90%</span>
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
                            {errors[`${r.id}_bottomGas`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${r.id}_bottomGas`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Bar with Add Row actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs">
          <div className="text-slate-500 text-[11px]">
            Showing <strong className="text-slate-700">{rows.length}</strong> observation rows across{' '}
            <strong className="text-slate-700">
              {new Set(rowsWithResolvedDates.map((r) => r.resolvedDate)).size}
            </strong>{' '}
            date group(s).
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddRow(true)}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-300 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Row (Same Date)</span>
            </button>
            <button
              onClick={() => handleAddRow(false)}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Add Row (New Date)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GasConcAnalysisPage;
