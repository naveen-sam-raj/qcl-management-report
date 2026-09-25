import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  FlaskConical,
  Layers,
  Droplets,
} from 'lucide-react';

// Screenshot values for DM Water and Anion Unit (Date: 13/09/2026)
const DEFAULT_ROWS = [
  {
    id: 'r_dm_water',
    unit: 'DM WATER',
    time: '15:00',
    ph: '7.2',
    cond: '20.7',
    p: '0',
    m: '6',
    th: '0',
    sio2: '0.20',
    isDefault: true,
    accent: 'blue',
  },
  {
    id: 'r_anion_unit',
    unit: 'A.UNIT',
    time: '',
    ph: '0',
    cond: '0',
    p: '0',
    m: '0',
    th: '0',
    sio2: '0.00',
    isDefault: true,
    accent: 'indigo',
  },
];

const NUMERIC_FIELDS = ['ph', 'cond', 'p', 'm', 'th', 'sio2'];

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

const DMWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  // Default date matching user's laboratory screenshot (13/09/2026)
  const [date, setDate] = useState('2026-09-13');
  const [readings, setReadings] = useState(DEFAULT_ROWS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Handle cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

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
        p: '',
        m: '',
        th: '',
        sio2: '',
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
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${row.id}_${field}`] = 'Invalid number';
          hasError = true;
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
      NUMERIC_FIELDS.some((field) => row[field] !== '' && row[field] !== null)
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
      readings,
      submittedBy: user?.name || 'Shift Chemist',
    };

    try {
      const response = await api.post('/api/dm-water-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast?.(response.data?.message || 'DM Water & Anion Unit Analysis saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      setSaving(false);
      console.error('[DMWaterAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* ── Breadcrumb & Top Navigation matching TK 203 theme ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back button + Plant Navigation + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              id="btn-dm-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to OFFSET Plant"
            >
              <ArrowLeft className="w-4 h-4" />
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
                ANALYSIS FOR DM WATER / ANION UNIT
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-dm-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Reset to default screenshot values"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-dm-save"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs ${
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

      {/* ── Control Bar: Date Selector & Context ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {/* Date Picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                DATE:
              </span>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>
              <button
                type="button"
                onClick={() => setDate(new Date().toISOString().split('T')[0])}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[11px] font-bold text-slate-600 transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDate('2026-09-13')}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-[11px] font-bold text-blue-700 transition"
                title="Date from screenshot"
              >
                13/09/2026
              </button>
            </div>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-600 font-semibold">{formatDateDisplay(date)}</span>
          </div>

          {/* Plant & Operator Badge */}
          <div className="flex items-center gap-2 text-slate-500">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Demineralization & Anion Exchange
            </span>
            <span className="hidden md:inline text-slate-400">•</span>
            <span className="hidden md:inline text-[11px]">
              Operator: <strong className="text-slate-700">{user?.name || 'Shift Chemist'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Analytical Table Matching User Screenshot ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-blue-600" />
              Sampling Stream & Analytical Measurements
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Enter laboratory test results for DM Water and Anion Unit (A.UNIT) streams.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Sampling Stream</span>
          </button>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4 w-44 border-r border-slate-800">
                  Unit / Stream
                </th>
                <th className="py-3 px-3 w-32 border-r border-slate-800 text-center">
                  <span className="flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    Time
                  </span>
                </th>
                <th className="py-3 px-3 w-28 border-r border-slate-800 text-center">
                  pH
                </th>
                <th className="py-3 px-3 w-32 border-r border-slate-800 text-center">
                  Cond <span className="text-[9px] text-slate-400 font-normal">(µS/cm)</span>
                </th>
                <th className="py-3 px-3 w-28 border-r border-slate-800 text-center">
                  P <span className="text-[9px] text-slate-400 font-normal">(Alk)</span>
                </th>
                <th className="py-3 px-3 w-28 border-r border-slate-800 text-center">
                  M <span className="text-[9px] text-slate-400 font-normal">(Alk)</span>
                </th>
                <th className="py-3 px-3 w-28 border-r border-slate-800 text-center">
                  TH <span className="text-[9px] text-slate-400 font-normal">(ppm)</span>
                </th>
                <th className="py-3 px-3 w-32 border-r border-slate-800 text-center">
                  SiO₂ <span className="text-[9px] text-slate-400 font-normal">(ppm)</span>
                </th>
                <th className="py-3 px-3 w-16 text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row) => {
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
                    {/* Unit / Stream Name */}
                    <td className="py-3 px-4 border-r border-slate-100">
                      <div className="flex items-center gap-2">
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
                          <div className="font-extrabold text-slate-900 tracking-wide text-xs">
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
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-800 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Unit Name"
                          />
                        )}
                      </div>
                    </td>

                    {/* Time Input (Highlighted with soft amber/yellow as seen in user's screenshot) */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={row.time}
                          onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                          placeholder="HH:mm"
                          className={`w-full text-center font-mono text-xs font-extrabold py-1.5 px-2 rounded-md border transition ${
                            row.time && isDM
                              ? 'bg-amber-100 border-amber-300 text-amber-950 font-black shadow-inner ring-1 ring-amber-200'
                              : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        />
                      </div>
                    </td>

                    {/* pH */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.ph}
                        onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                        placeholder="0.0"
                        className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border transition ${
                          errors[`${row.id}_ph`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : row.ph !== ''
                            ? 'border-blue-200 bg-blue-50/30 text-slate-900 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </td>

                    {/* Cond */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.cond}
                        onChange={(e) => handleCellChange(row.id, 'cond', e.target.value)}
                        placeholder="0.0"
                        className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border transition ${
                          errors[`${row.id}_cond`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : row.cond !== ''
                            ? 'border-blue-200 bg-blue-50/30 text-slate-900 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </td>

                    {/* P (Alk) */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.p}
                        onChange={(e) => handleCellChange(row.id, 'p', e.target.value)}
                        placeholder="0"
                        className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border transition ${
                          errors[`${row.id}_p`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : row.p !== ''
                            ? 'border-blue-200 bg-blue-50/30 text-slate-900 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </td>

                    {/* M (Alk) */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.m}
                        onChange={(e) => handleCellChange(row.id, 'm', e.target.value)}
                        placeholder="0"
                        className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border transition ${
                          errors[`${row.id}_m`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : row.m !== ''
                            ? 'border-blue-200 bg-blue-50/30 text-slate-900 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </td>

                    {/* TH */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.th}
                        onChange={(e) => handleCellChange(row.id, 'th', e.target.value)}
                        placeholder="0"
                        className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border transition ${
                          errors[`${row.id}_th`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : row.th !== ''
                            ? 'border-blue-200 bg-blue-50/30 text-slate-900 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </td>

                    {/* SiO2 */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <input
                        type="text"
                        value={row.sio2}
                        onChange={(e) => handleCellChange(row.id, 'sio2', e.target.value)}
                        placeholder="0.00"
                        className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border transition ${
                          errors[`${row.id}_sio2`]
                            ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : row.sio2 !== ''
                            ? 'border-blue-200 bg-blue-50/30 text-slate-900 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-700'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3 text-center">
                      {!row.isDefault ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold">Standard</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary / Quick Actions */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Total Stream Rows: {readings.length}</span>
            <span>•</span>
            <span>Click any cell to edit numeric values</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-xs text-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DMWaterAnalysisPage;
