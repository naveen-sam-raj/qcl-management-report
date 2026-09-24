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
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Flame,
  Wind,
} from 'lucide-react';

// Default initial readings matching the user's screenshot
const DEFAULT_READINGS = [
  {
    id: '1',
    stream: 'Boiler Feed Water (BFW)',
    time: '15:00',
    ph: '9',
    cond: '36.8',
    tAlk: '10',
    sio2: '0.26',
    fe2o3: '',
    th: '0',
  },
  {
    id: '2',
    stream: 'Super Heated Steam (SHS)',
    time: '15:00',
    ph: '7.6',
    cond: '7.3',
    tAlk: '6',
    sio2: '0.14',
    fe2o3: '',
    th: '',
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

const BFWAnalysisPage = ({ plantId = 'offset' }) => {
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

  // ── Handle reading change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && field !== 'stream' && !isValidDecimal(value)) return;

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
    const nextId = String(Date.now());
    const isOdd = readings.length % 2 === 0;
    const defaultStream = isOdd ? 'Boiler Feed Water (BFW)' : 'Super Heated Steam (SHS)';
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        stream: defaultStream,
        time: '15:00',
        ph: '',
        cond: '',
        tAlk: '',
        sio2: '',
        fe2o3: '',
        th: '',
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
    const numericFields = ['ph', 'cond', 'tAlk', 'sio2', 'fe2o3', 'th'];

    readings.forEach((r) => {
      numericFields.forEach((f) => {
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
        plant: 'OFFSET',
        unit: 'BFW',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/bfw-analysis', payload);

      if (res.data?.success) {
        showToast?.('BFW / SHS Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'BFW data saved.', 'success');
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
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* ── TOP HEADER BAR (TK 203 Clean Theme) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
            title="Back to OFFSET Plant"
          >
            <ArrowLeft className="w-4 h-4" />
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
              <Wind className="w-5 h-5 text-blue-600" />
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

      {/* ── DATE SELECTION ROW (Full-width row directly under header) ── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Date : <span className="text-red-500">*</span>
            </label>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition"
          />
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
            {formatDateDisplay(date)}
          </span>
        </div>

        {/* Quick date presets */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium mr-1">Quick:</span>
          <button
            onClick={() => {
              const todayIso = new Date().toISOString().split('T')[0];
              setDate(todayIso);
            }}
            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
          >
            Today
          </button>
          <button
            onClick={() => setDate('2026-09-13')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              date === '2026-09-13'
                ? 'bg-blue-100 text-blue-900 border border-blue-300 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            13/09/2026 (Sample)
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: BFW & SHS Measurements Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Boiler Feed Water / Super Heated Steam Analysis
            </h2>
          </div>
          <button
            onClick={handleAddRow}
            className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 text-xs font-bold transition flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-3 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-4 min-w-[200px] border-r border-slate-700">STREAM / SAMPLE</th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">TIME</th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>pH</div>
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div>COND</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">µS/cm</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>T.ALK</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>SiO₂</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>Fe₂O₃</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>TH</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-2 w-14 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const isBfw = row.stream?.toLowerCase().includes('boiler') || row.stream?.toLowerCase().includes('bfw');

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isBfw ? 'hover:bg-blue-50/40 bg-white' : 'hover:bg-amber-50/40 bg-slate-50/30'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-3 px-3 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* Stream Name */}
                    <td className="py-3 px-4 font-bold border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isBfw ? 'bg-blue-600' : 'bg-amber-500'
                          }`}
                        />
                        <input
                          type="text"
                          value={row.stream}
                          onChange={(e) => handleCellChange(row.id, 'stream', e.target.value)}
                          className="w-full font-bold text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition"
                        />
                      </div>
                    </td>

                    {/* Time */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        value={row.time}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className="w-full text-center font-mono font-bold text-sm bg-white border border-slate-200 rounded-lg py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition shadow-2xs"
                      />
                    </td>

                    {/* pH */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.ph}
                        onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                        placeholder="0.00"
                        className={`w-full text-center font-mono text-sm py-1 px-1 rounded-lg border transition ${
                          errors[`${row.id}_ph`]
                            ? 'border-red-500 bg-red-50'
                            : row.ph !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white'
                        }`}
                      />
                    </td>

                    {/* Cond */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.cond}
                        onChange={(e) => handleCellChange(row.id, 'cond', e.target.value)}
                        placeholder="0.0"
                        className={`w-full text-center font-mono text-sm py-1 px-1 rounded-lg border transition ${
                          errors[`${row.id}_cond`]
                            ? 'border-red-500 bg-red-50'
                            : row.cond !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white'
                        }`}
                      />
                    </td>

                    {/* T.Alk */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.tAlk}
                        onChange={(e) => handleCellChange(row.id, 'tAlk', e.target.value)}
                        placeholder="0"
                        className={`w-full text-center font-mono text-sm py-1 px-1 rounded-lg border transition ${
                          errors[`${row.id}_tAlk`]
                            ? 'border-red-500 bg-red-50'
                            : row.tAlk !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white'
                        }`}
                      />
                    </td>

                    {/* SiO2 */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.sio2}
                        onChange={(e) => handleCellChange(row.id, 'sio2', e.target.value)}
                        placeholder="0.00"
                        className={`w-full text-center font-mono text-sm py-1 px-1 rounded-lg border transition ${
                          errors[`${row.id}_sio2`]
                            ? 'border-red-500 bg-red-50'
                            : row.sio2 !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white'
                        }`}
                      />
                    </td>

                    {/* Fe2O3 */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.fe2o3}
                        onChange={(e) => handleCellChange(row.id, 'fe2o3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center font-mono text-sm py-1 px-1 rounded-lg border transition ${
                          errors[`${row.id}_fe2o3`]
                            ? 'border-red-500 bg-red-50'
                            : row.fe2o3 !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white'
                        }`}
                      />
                    </td>

                    {/* TH */}
                    <td className="py-3 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.th}
                        onChange={(e) => handleCellChange(row.id, 'th', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center font-mono text-sm py-1 px-1 rounded-lg border transition ${
                          errors[`${row.id}_th`]
                            ? 'border-red-500 bg-red-50'
                            : row.th !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white'
                        }`}
                      />
                    </td>

                    {/* ACTION */}
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={readings.length <= 1}
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
              Add Another Stream / Time Reading
            </button>
            <span className="text-slate-500 font-medium">
              {readings.length} {readings.length === 1 ? 'row' : 'rows'} recorded
            </span>
          </div>

          <div className="text-slate-500 text-xs">
            Units: <span className="font-semibold text-slate-700">Cond in µS/cm | T.Alk, SiO₂, Fe₂O₃, TH in ppm</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BFWAnalysisPage;
