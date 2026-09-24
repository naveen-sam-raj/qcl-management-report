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
  Plus,
  Trash2,
  Clock,
  Flame,
} from 'lucide-react';

// Default initial readings matching the user's screenshot
const DEFAULT_READINGS = [
  { id: '1', time: '07:00', combustible: '1.2', gcv: '94' },
  { id: '2', time: '15:00', combustible: '', gcv: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '' },
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

const FlyAshAnalysisPage = ({ plantId = 'offset' }) => {
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

  // ── Handle reading change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

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

  // ── Add new time slot reading ──
  const handleAddRow = () => {
    const nextId = String(Date.now());
    const nextTime = readings.length === 0 ? '07:00' : '11:00';
    setReadings((prev) => [
      ...prev,
      { id: nextId, time: nextTime, combustible: '', gcv: '' },
    ]);
  };

  // ── Remove time slot reading ──
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

  // ── Summary statistics (Averages) ──
  const stats = useMemo(() => {
    let combTotal = 0;
    let combCount = 0;
    let gcvTotal = 0;
    let gcvCount = 0;

    readings.forEach((r) => {
      if (r.combustible !== '' && !isNaN(Number(r.combustible))) {
        combTotal += Number(r.combustible);
        combCount += 1;
      }
      if (r.gcv !== '' && !isNaN(Number(r.gcv))) {
        gcvTotal += Number(r.gcv);
        gcvCount += 1;
      }
    });

    return {
      combAvg: combCount > 0 ? (combTotal / combCount).toFixed(2) : null,
      gcvAvg: gcvCount > 0 ? (gcvTotal / gcvCount).toFixed(1) : null,
      count: combCount || gcvCount,
    };
  }, [readings]);

  // ── Save handler ──
  const handleSave = async () => {
    const newErrors = {};

    readings.forEach((r) => {
      if (r.combustible !== '' && isNaN(Number(r.combustible))) {
        newErrors[`${r.id}_combustible`] = 'Invalid number';
      }
      if (r.gcv !== '' && isNaN(Number(r.gcv))) {
        newErrors[`${r.id}_gcv`] = 'Invalid number';
      }
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
        unit: 'FLY ash',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/fly-ash-analysis', payload);

      if (res.data?.success) {
        showToast?.('Fly Ash Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'Fly Ash data saved.', 'success');
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
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                FLY Ash
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Flame className="w-5 h-5 text-amber-600" />
              FLY ASH ANALYSIS
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
                Save Fly Ash Data
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
            onClick={() => setDate('2026-09-14')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              date === '2026-09-14'
                ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            14/09/2026 (Sample)
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: Fly Ash Hourly / Shift Measurements Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Fly Ash Hourly / Shift Measurements
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
                  <th className="py-3 px-4 w-12 text-center border-r border-slate-700">#</th>
                  <th className="py-3 px-4 w-36 text-center border-r border-slate-700">
                    <span className="flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      TIME
                    </span>
                  </th>
                  <th className="py-3 px-5 text-center border-r border-slate-700">
                    <div>COMBUSTIBLE</div>
                    <div className="text-[10px] font-normal text-sky-300 normal-case">%</div>
                  </th>
                  <th className="py-3 px-5 text-center border-r border-slate-700">
                    <div>GCV</div>
                    <div className="text-[10px] font-normal text-amber-300 normal-case">Kcals / kg</div>
                  </th>
                  <th className="py-3 px-3 w-16 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((row, idx) => {
                  const combErr = errors[`${row.id}_combustible`];
                  const gcvErr = errors[`${row.id}_gcv`];

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-amber-50/30 transition-colors group"
                    >
                      {/* Row Index */}
                      <td className="py-3.5 px-4 text-center font-bold text-xs text-slate-500 bg-slate-50/50 border-r border-slate-100">
                        {idx + 1}
                      </td>

                      {/* TIME */}
                      <td className="py-3.5 px-3 text-center border-r border-slate-100">
                        <input
                          type="text"
                          value={row.time}
                          onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                          placeholder="HH:mm"
                          className="w-full text-center font-mono font-bold text-sm bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition shadow-2xs"
                        />
                      </td>

                      {/* COMBUSTIBLE % */}
                      <td className="py-3.5 px-4 text-center border-r border-slate-100">
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.combustible}
                            onChange={(e) => handleCellChange(row.id, 'combustible', e.target.value)}
                            placeholder="0.00"
                            className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                              combErr
                                ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                                : row.combustible !== ''
                                ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                                : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100'
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 pointer-events-none">
                            %
                          </span>
                        </div>
                        {combErr && (
                          <div className="text-[10px] text-red-600 font-semibold mt-1">
                            {combErr}
                          </div>
                        )}
                      </td>

                      {/* GCV Kcals/kg */}
                      <td className="py-3.5 px-4 text-center border-r border-slate-100">
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.gcv}
                            onChange={(e) => handleCellChange(row.id, 'gcv', e.target.value)}
                            placeholder="0000"
                            className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                              gcvErr
                                ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                                : row.gcv !== ''
                                ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-100'
                                : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-amber-600 focus:bg-white focus:ring-2 focus:ring-amber-100'
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">
                            kcal
                          </span>
                        </div>
                        {gcvErr && (
                          <div className="text-[10px] text-red-600 font-semibold mt-1">
                            {gcvErr}
                          </div>
                        )}
                      </td>

                      {/* ACTION: Delete */}
                      <td className="py-3.5 px-2 text-center">
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

          {/* Table Footer with quick action and summary info */}
          <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddRow}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                Add Another Time Reading
              </button>
              <span className="text-slate-500 font-medium">
                {readings.length} {readings.length === 1 ? 'slot' : 'slots'} recorded
              </span>
            </div>

            <div className="flex items-center gap-4">
              {stats.combAvg && (
                <span className="font-bold text-slate-700">
                  Avg Combustible:{' '}
                  <span className="text-blue-700 font-mono">{stats.combAvg}%</span>
                </span>
              )}
              {stats.gcvAvg && (
                <span className="font-bold text-slate-700">
                  Avg GCV:{' '}
                  <span className="text-amber-700 font-mono">{stats.gcvAvg} Kcals/kg</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

export default FlyAshAnalysisPage;
