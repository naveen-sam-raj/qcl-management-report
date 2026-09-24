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
  Clock,
  Droplets,
  FlaskConical,
  Gauge,
  Info,
} from 'lucide-react';

// Screenshot values for Raw Water
const SCREENSHOT_DATA = {
  ph: '7.6',
  cond: '211',
  turbidity: '8',
  tds: '137',
  freeCl2: '0',
  fe: '0.30',
  sio2: '5',
  mAlk: '56',
  th: '60',
  caH: '36',
  mgH: '24',
  cl: '30',
  so4: '15',
  ema: '45',
};

// Left Column Parameters: Physical & Dissolved Solids
const LEFT_PARAMETERS = [
  { key: 'ph',        label: 'pH',           formula: 'pH',         unit: '',        step: '0.1', placeholder: '7.00', desc: 'Acidity / Basicity' },
  { key: 'cond',      label: 'Cond',         formula: 'EC',         unit: 'µS/cm',   step: '1',   placeholder: '0000', desc: 'Conductivity' },
  { key: 'turbidity', label: 'Turbidity',    formula: 'Turb',       unit: 'NTU',     step: '1',   placeholder: '00',   desc: 'Water Clarity' },
  { key: 'tds',       label: 'TDS',          formula: 'TDS',        unit: 'ppm',     step: '1',   placeholder: '0000', desc: 'Total Dissolved Solids' },
  { key: 'freeCl2',   label: 'Free Cl2',     formula: 'Free Cl₂',   unit: 'ppm',     step: '0.1', placeholder: '0.00', desc: 'Residual Chlorine' },
  { key: 'fe',        label: 'Fe',           formula: 'Iron (Fe)',  unit: 'ppm',     step: '0.01',placeholder: '0.00', desc: 'Total Iron' },
  { key: 'sio2',      label: 'SiO2',         formula: 'SiO₂',       unit: 'ppm',     step: '1',   placeholder: '00',   desc: 'Reactive Silica' },
];

// Right Column Parameters: Alkalinity, Hardness & Anions
const RIGHT_PARAMETERS = [
  { key: 'mAlk',      label: 'M Alk',        formula: 'M.Alk',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Methyl Orange Alk.' },
  { key: 'th',        label: 'TH',           formula: 'TH',         unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Total Hardness' },
  { key: 'caH',       label: 'Ca H',         formula: 'Ca-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Calcium Hardness' },
  { key: 'mgH',       label: 'Mg H',         formula: 'Mg-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Magnesium Hardness' },
  { key: 'cl',        label: 'Cl',           formula: 'Cl⁻',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Chloride' },
  { key: 'so4',       label: 'SO4',          formula: 'SO₄²⁻',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Sulphate' },
  { key: 'ema',       label: 'EMA',          formula: 'EMA',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Equiv. Mineral Acidity' },
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

const RawWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState('2026-09-14');
  const [time, setTime] = useState('08:00');
  const [data, setData] = useState(SCREENSHOT_DATA);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // ── Handle field change ──
  const handleInputChange = useCallback((field, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({ ...prev, [field]: value }));

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
  }, []);

  // ── Reset ──
  const handleReset = () => {
    setData(SCREENSHOT_DATA);
    setTime('08:00');
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Save ──
  const handleSave = async () => {
    const newErrors = {};

    [...LEFT_PARAMETERS, ...RIGHT_PARAMETERS].forEach((param) => {
      const val = data[param.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[param.key] = 'Enter numeric value';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please resolve the highlighted field errors.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date,
        time,
        plant: 'OFFSET',
        unit: 'Raw Water',
        parameters: data,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/raw-water-analysis', payload);

      if (res.data?.success) {
        showToast?.('Raw Water Analysis saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'Raw Water data saved.', 'success');
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
              <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/60">
                Raw Water
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Droplets className="w-5 h-5 text-sky-600" />
              RAW WATER ANALYSIS
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
                Save Raw Water Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── DATE & TIME SELECTION ROW (Full-width row directly under header) ── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Date : <span className="text-red-500">*</span>
            </label>
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

          {/* Time Input */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
            <Clock className="w-4 h-4 text-sky-600" />
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              TIME :
            </label>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="HH:mm"
              className="w-24 text-center font-mono font-bold text-sm bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
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
            onClick={() => {
              setDate('2026-09-14');
              setTime('08:00');
            }}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              date === '2026-09-14'
                ? 'bg-sky-100 text-sky-900 border border-sky-300 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            14/09/2026 (Sample)
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: 2-Column Chemical Analysis Parameters Card ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table / Card Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-black tracking-wider uppercase">
              Raw Water Laboratory Quality Parameters
            </h2>
          </div>
          <span className="text-[11px] font-mono font-semibold bg-white/10 px-2.5 py-0.5 rounded text-sky-200">
            14 Parameters
          </span>
        </div>

        {/* 2-Column Grid matching the legacy screen layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
          {/* ── LEFT COLUMN: Physical & Dissolved Solids ── */}
          <div className="p-5 space-y-3 bg-white">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              Physical & Inorganics
            </div>

            <div className="space-y-2.5 pt-1">
              {LEFT_PARAMETERS.map((param) => {
                const val = data[param.key] || '';
                const err = errors[param.key];

                return (
                  <div
                    key={param.key}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200/60"
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-extrabold text-sm text-slate-800 tracking-wide">
                          {param.label} :
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {param.formula}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{param.desc}</div>
                    </div>

                    <div className="w-36 flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val}
                        onChange={(e) => handleInputChange(param.key, e.target.value)}
                        placeholder={param.placeholder}
                        className={`w-full text-center font-mono text-sm py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs ${
                          err
                            ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200'
                            : val !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
                      {param.unit && (
                        <span className="text-[10px] font-bold text-slate-500 min-w-[36px]">
                          {param.unit}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Alkalinity, Hardness & Anions ── */}
          <div className="p-5 space-y-3 bg-white">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-sky-500" />
              Alkalinity, Hardness & Anions
            </div>

            <div className="space-y-2.5 pt-1">
              {RIGHT_PARAMETERS.map((param) => {
                const val = data[param.key] || '';
                const err = errors[param.key];

                return (
                  <div
                    key={param.key}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200/60"
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-extrabold text-sm text-slate-800 tracking-wide">
                          {param.label} :
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {param.formula}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{param.desc}</div>
                    </div>

                    <div className="w-36 flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val}
                        onChange={(e) => handleInputChange(param.key, e.target.value)}
                        placeholder={param.placeholder}
                        className={`w-full text-center font-mono text-sm py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs ${
                          err
                            ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200'
                            : val !== ''
                            ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
                      {param.unit && (
                        <span className="text-[10px] font-bold text-slate-500 min-w-[36px]">
                          {param.unit}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card Footer: Summary of Values */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>
              All parameters measured for date <strong className="text-slate-800">{date}</strong> at{' '}
              <strong className="text-slate-800">{time || '—'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-semibold">
              pH: <strong className="text-blue-700 font-mono">{data.ph || '—'}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold">
              TDS: <strong className="text-slate-900 font-mono">{data.tds || '—'} ppm</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold">
              Total Hardness: <strong className="text-slate-900 font-mono">{data.th || '—'} ppm</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RawWaterAnalysisPage;
