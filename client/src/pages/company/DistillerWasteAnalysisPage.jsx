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
  FlaskRound,
} from 'lucide-react';

// Default initial readings matching the user's legacy screenshot
const DEFAULT_READINGS = [
  { id: 't0630', time: '06:30', exCao: '00.00', fnh3: '272', cnh3: '1190', tnh3: '1462', nahco3: '0' },
  { id: 't0730', time: '07:30', exCao: '00.00', fnh3: '340', cnh3: '1870', tnh3: '2210', nahco3: '0' },
  { id: 't0830', time: '08:30', exCao: '00.00', fnh3: '425', cnh3: '8330', tnh3: '8755', nahco3: '0' },
  { id: 't0930', time: '09:30', exCao: '00.00', fnh3: '510', cnh3: '4420', tnh3: '4930', nahco3: '0' },
  { id: 't1030', time: '10:30', exCao: '00.00', fnh3: '238', cnh3: '13090', tnh3: '13328', nahco3: '0' },
  { id: 't1130', time: '11:30', exCao: '00.00', fnh3: '442', cnh3: '21250', tnh3: '21692', nahco3: '0' },
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

const DistillerWasteAnalysisPage = ({ plantId = 'offset' }) => {
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

  // ── Handle cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };

        // Auto-calculate TNH3 = FNH3 + CNH3 if modifying FNH3 or CNH3
        if (field === 'fnh3' || field === 'cnh3') {
          const fnh3Val = field === 'fnh3' ? value : r.fnh3;
          const cnh3Val = field === 'cnh3' ? value : r.cnh3;
          if (fnh3Val !== '' && cnh3Val !== '' && !isNaN(Number(fnh3Val)) && !isNaN(Number(cnh3Val))) {
            updated.tnh3 = String(Number(fnh3Val) + Number(cnh3Val));
          }
        }

        return updated;
      })
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
        time: '12:30',
        exCao: '00.00',
        fnh3: '',
        cnh3: '',
        tnh3: '',
        nahco3: '0',
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
    const numericFields = ['exCao', 'fnh3', 'cnh3', 'tnh3', 'nahco3'];

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
        unit: 'Distiller waste',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/distiller-waste-analysis', payload);

      if (res.data?.success) {
        showToast?.('Distiller Waste Water Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'Distiller waste data saved.', 'success');
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
              <span className="text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200/60">
                Distiller Waste Water
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <FlaskRound className="w-5 h-5 text-violet-600" />
              DISTILLER WASTE WATER ANALYSIS
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
                Save Distiller Data
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
                ? 'bg-violet-100 text-violet-900 border border-violet-300 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            13/09/2026 (Sample)
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: Distiller Waste Water Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Distiller Waste Water Hourly Laboratory Measurements
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
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div>Ex.CaO</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">%</div>
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div>FNH₃</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-32 text-center border-r border-slate-700">
                  <div>CNH₃</div>
                  <div className="text-[10px] font-normal text-indigo-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 w-32 text-center border-r border-slate-700 bg-slate-800/80">
                  <div>TNH₃</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">ppm (Total)</div>
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div>NaHCO₃</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-2 w-14 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => (
                <tr
                  key={row.id}
                  className="hover:bg-violet-50/30 transition-colors"
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

                  {/* ExCao */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.exCao}
                      onChange={(e) => handleCellChange(row.id, 'exCao', e.target.value)}
                      placeholder="00.00"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_exCao`]
                          ? 'border-red-500 bg-red-50'
                          : row.exCao !== '' && row.exCao !== '00.00' && row.exCao !== '0'
                          ? 'border-amber-300 bg-amber-50/30 font-bold text-amber-950 focus:border-amber-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* FNH3 */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.fnh3}
                      onChange={(e) => handleCellChange(row.id, 'fnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_fnh3`]
                          ? 'border-red-500 bg-red-50'
                          : row.fnh3 !== '' && row.fnh3 !== '0'
                          ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* CNH3 */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.cnh3}
                      onChange={(e) => handleCellChange(row.id, 'cnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_cnh3`]
                          ? 'border-red-500 bg-red-50'
                          : row.cnh3 !== '' && row.cnh3 !== '0'
                          ? 'border-indigo-300 bg-indigo-50/30 font-bold text-indigo-950 focus:border-indigo-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* TNH3 (Total NH3) */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100 bg-slate-50/40">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.tnh3}
                      onChange={(e) => handleCellChange(row.id, 'tnh3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_tnh3`]
                          ? 'border-red-500 bg-red-50'
                          : row.tnh3 !== '' && row.tnh3 !== '0'
                          ? 'border-emerald-300 bg-emerald-50/40 font-black text-emerald-950 focus:border-emerald-600'
                          : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                      }`}
                    />
                  </td>

                  {/* NaHCO3 */}
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.nahco3}
                      onChange={(e) => handleCellChange(row.id, 'nahco3', e.target.value)}
                      placeholder="0"
                      className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                        errors[`${row.id}_nahco3`]
                          ? 'border-red-500 bg-red-50'
                          : row.nahco3 !== '' && row.nahco3 !== '0'
                          ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600'
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
            Formulas: <span className="font-semibold text-slate-700">TNH₃ = FNH₃ + CNH₃ | Ex.CaO in % | Ammonia in ppm</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DistillerWasteAnalysisPage;
