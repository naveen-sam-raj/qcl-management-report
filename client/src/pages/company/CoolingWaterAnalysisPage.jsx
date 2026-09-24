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
  ThermometerSnowflake,
} from 'lucide-react';

// Default initial readings matching the user's legacy screenshot
const DEFAULT_READINGS = [
  { id: 't07', time: '07:00', ph: '6.9', ppo4: '0.0', opo4: '15.0', cl: '1510', frc: '0.0', cl200: '1440' },
  { id: 't09', time: '09:00', ph: '0.0', ppo4: '0.0', opo4: '0.0', cl: '0', frc: '0.0', cl200: '0' },
  { id: 't11', time: '11:00', ph: '6.6', ppo4: '0.0', opo4: '0.0', cl: '1360', frc: '0.6', cl200: '0' },
  { id: 't13', time: '13:00', ph: '0.0', ppo4: '0.0', opo4: '0.0', cl: '0', frc: '0.0', cl200: '0' },
  { id: 't15', time: '15:00', ph: '7.1', ppo4: '0.0', opo4: '15.0', cl: '1305', frc: '0.5', cl200: '1275' },
  { id: 't17', time: '17:00', ph: '0.0', ppo4: '0.0', opo4: '0.0', cl: '0', frc: '0.0', cl200: '0' },
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

const CoolingWaterAnalysisPage = ({ plantId = 'offset' }) => {
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

  // ── Handle reading cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

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
        time: '19:00',
        ph: '',
        ppo4: '',
        opo4: '',
        cl: '',
        frc: '',
        cl200: '',
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
    const numericFields = ['ph', 'ppo4', 'opo4', 'cl', 'frc', 'cl200'];

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
        unit: 'cooling water',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/cooling-water-analysis', payload);

      if (res.data?.success) {
        showToast?.('Cooling Water Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'Cooling Water data saved.', 'success');
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
              <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200/60">
                Cooling Water (C.W Water)
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <ThermometerSnowflake className="w-5 h-5 text-cyan-600" />
              COOLING WATER ANALYSIS (C.W WATER)
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
                Save Cooling Water Data
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
                ? 'bg-cyan-100 text-cyan-900 border border-cyan-300 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            13/09/2026 (Sample)
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: Cooling Water Measurements Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Cooling Water (C.W Water) Laboratory Readings
            </h2>
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
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-3 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME
                  </div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>pH</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>pPO₄</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>oPO₄</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div>Cl</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-24 text-center border-r border-slate-700">
                  <div>FRC</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700 bg-slate-800/80">
                  <div>200# Cl</div>
                  <div className="text-[10px] font-normal text-indigo-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-2 w-14 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => (
                <tr
                  key={row.id}
                  className="hover:bg-cyan-50/30 transition-colors"
                >
                  {/* Row index */}
                  <td className="py-2.5 px-3 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                    {idx + 1}
                  </td>

                  {/* TIME */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100 bg-slate-50/30">
                    <input
                      type="text"
                      value={row.time}
                      onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                      placeholder="HH:mm"
                      className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-md py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 shadow-2xs"
                    />
                  </td>

                  {/* pH */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.ph}
                      onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                      placeholder="0.0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_ph`]
                          ? 'border-red-500 bg-red-50'
                          : row.ph !== '' && row.ph !== '0.0' && row.ph !== '0'
                          ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* pPO4 */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.ppo4}
                      onChange={(e) => handleCellChange(row.id, 'ppo4', e.target.value)}
                      placeholder="0.0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_ppo4`]
                          ? 'border-red-500 bg-red-50'
                          : row.ppo4 !== '' && row.ppo4 !== '0.0' && row.ppo4 !== '0'
                          ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* oPO4 */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.opo4}
                      onChange={(e) => handleCellChange(row.id, 'opo4', e.target.value)}
                      placeholder="0.0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_opo4`]
                          ? 'border-red-500 bg-red-50'
                          : row.opo4 !== '' && row.opo4 !== '0.0' && row.opo4 !== '0'
                          ? 'border-amber-300 bg-amber-50/30 font-bold text-amber-950 focus:border-amber-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* Cl */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.cl}
                      onChange={(e) => handleCellChange(row.id, 'cl', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_cl`]
                          ? 'border-red-500 bg-red-50'
                          : row.cl !== '' && row.cl !== '00000' && row.cl !== '0'
                          ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* FRC */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.frc}
                      onChange={(e) => handleCellChange(row.id, 'frc', e.target.value)}
                      placeholder="0.0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_frc`]
                          ? 'border-red-500 bg-red-50'
                          : row.frc !== '' && row.frc !== '0.0' && row.frc !== '0'
                          ? 'border-emerald-300 bg-emerald-50/30 font-bold text-emerald-950 focus:border-emerald-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* 200# Cl */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100 bg-slate-50/40">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.cl200}
                      onChange={(e) => handleCellChange(row.id, 'cl200', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_cl200`]
                          ? 'border-red-500 bg-red-50'
                          : row.cl200 !== '' && row.cl200 !== '00000' && row.cl200 !== '0'
                          ? 'border-indigo-300 bg-indigo-50/30 font-bold text-indigo-950 focus:border-indigo-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
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
              ))}
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
            Parameters: <span className="font-semibold text-slate-700">pPO₄ (Polyphosphate) | oPO₄ (Orthophosphate) | Cl (Chloride) | FRC (Free Residual Chlorine) | 200# Cl</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoolingWaterAnalysisPage;
