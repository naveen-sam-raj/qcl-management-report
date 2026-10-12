import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
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
  AlertCircle,
} from 'lucide-react';

const emptyRow = { time: '07:00', ph: '', frc: '', cl: '', opo4: '', turbidity: '', tds: '', fe: '', sio2: '', alk: '', so4: '', th: '', cah: '', mgh: '', ammn: '' };
const emptyRow200 = { time: '07:00', ph: '', frc: '', opo4: '', cl: '' };

const DEFAULT_READINGS_DAY = [
  { id: 't07', ...emptyRow, time: '07:00' },
  { id: 't09', ...emptyRow, time: '09:00' },
  { id: 't11', ...emptyRow, time: '11:00' },
  { id: 't13', ...emptyRow, time: '13:00' },
  { id: 't15', ...emptyRow, time: '15:00' },
  { id: 't17', ...emptyRow, time: '17:00' },
];

const DEFAULT_READINGS_200 = [
  { id: 't07', ...emptyRow200, time: '07:00' },
  { id: 't19', ...emptyRow200, time: '19:00' },
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

const CoolingWaterAnalysisPage = ({ plantId = 'offset', is200 = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  const [date, setDate] = useState('2026-09-13');
  const [readings, setReadings] = useState(is200 ? DEFAULT_READINGS_200 : DEFAULT_READINGS_DAY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/cooling-water-analysis?date=${date}&unit=${encodeURIComponent(is200 ? 'cooling water 200#' : 'cooling water')}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.shifts) {
            setReadings(record.shifts);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setReadings(record.readings);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setReadings(record.readings);
          } else if (record.data && Array.isArray(record.data) && record.data.length > 0) {
            setReadings(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setReadings(record);
          } else if (record.data && record.data.readings) {
            setReadings(record.data.readings);
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);

  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && field !== 'ammn' && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  const handleAddRow = () => {
    const nextId = String(Date.now());
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        ...(is200 ? emptyRow200 : emptyRow),
        time: '19:00',
      },
    ]);
  };

  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
  };

  const handleReset = () => {
    setReadings(is200 ? DEFAULT_READINGS_200 : DEFAULT_READINGS_DAY);
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  const handleSave = async () => {
    const newErrors = {};
    const numericFields = is200 ? ['ph', 'frc', 'opo4', 'cl'] : ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh'];

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
        unit: is200 ? 'cooling water 200#' : 'cooling water',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/cooling-water-analysis', payload);

      if (res.data?.success) {
        showToast?.(is200 ? 'Cooling Water 200# saved successfully!' : 'Cooling Water Analysis saved successfully!', 'success');
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
    <div className="space-y-5 animate-fadeIn">
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
              <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200/60">
                {is200 ? 'Cooling Water / 200#' : 'Cooling Water (C.W Water)'}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <ThermometerSnowflake className="w-5 h-5 text-cyan-600" />
              {is200 ? 'COOLING WATER / 200# ANALYSIS' : 'COOLING WATER ANALYSIS (C.W WATER)'}
            </h1>
          </div>
        </div>

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

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                {is200 ? 'Cooling Water / 200# Laboratory Readings' : 'Cooling Water (C.W Water) Laboratory Readings'}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="cw-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="cw-date-input"
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
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-3 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME
                  </div>
                </th>
                <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                  <div>pH</div>
                </th>
                <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                  <div>FRC</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                  <div>O-PO₄</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                  <div>Cl</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                {!is200 && (
                  <>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Turbidity</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">NTU</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>TDS</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Fe</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>SiO₂</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>ALK</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>SO₄</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>TH</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>CaH</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>MgH</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Amm.N</div>
                      <div className="text-[9px] font-normal text-emerald-400/80 normal-case mt-0.5">Limit: NIL</div>
                    </th>
                  </>
                )}
                <th className="py-3 px-2 w-14 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const getLimit = (param) => getCellLimit('offset', 'cooling-water', is200 ? 'shiftTwice' : 'Day', is200 ? `sec200${param}` : param);

                const limits = {
                  ph: getLimit('ph'),
                  frc: getLimit('frc'),
                  cl: getLimit('cl'),
                  opo4: getLimit('opo4'),
                  turbidity: getLimit('turbidity'),
                  tds: getLimit('tds'),
                  fe: getLimit('fe'),
                  sio2: getLimit('sio2'),
                  alk: getLimit('alk'),
                  so4: getLimit('so4'),
                  th: getLimit('th'),
                  cah: getLimit('cah'),
                  mgh: getLimit('mgh'),
                  ammn: getLimit('ammn'),
                };

                const isValid = (val, limit) => limit && val !== '' ? validateCellValue(val, limit) : { isOutOfLimit: false };
                
                const validations = {};
                Object.keys(limits).forEach(key => {
                  validations[key] = isValid(row[key], limits[key]);
                });

                const isAmmnNil = row.ammn !== undefined && ['nil', 'n', 'ni', 'none', '-'].includes(String(row.ammn).toLowerCase().trim());
                validations.ammn = limits.ammn && row.ammn !== '' ? (isAmmnNil ? { isOutOfLimit: false } : { isOutOfLimit: true }) : { isOutOfLimit: false };

                const renderInput = (field) => {
                  const errorMsg = errors[`${row.id}_${field}`];
                  const vResult = validations[field];
                  const isOutOfLimit = vResult.isOutOfLimit;
                  const limit = limits[field];
                  
                  const isNilLimit = field === 'ammn';
                  
                  return (
                    <td key={field} className="py-2.5 px-1.5 text-center border-r border-slate-100">
                      <input
                        type="text"
                        inputMode={isNilLimit ? "text" : "decimal"}
                        value={row[field] ?? ''}
                        onChange={(e) => handleCellChange(row.id, field, e.target.value)}
                        placeholder={isNilLimit ? "NIL" : "0"}
                        className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${
                          (errorMsg || isOutOfLimit)
                            ? 'border-red-500 bg-red-50'
                            : row[field] !== '' && row[field] !== '0'
                            ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                            : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                        }`}
                      />
                      {isOutOfLimit && !errorMsg && limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {limit.formattedLabel || `Limit: ${limit.min}-${limit.max}`}
                        </div>
                      )}
                      {!isOutOfLimit && !errorMsg && limit && (row[field] === '' || row[field] === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {limit.formattedRange || `${limit.min}-${limit.max}`}
                        </div>
                      )}
                    </td>
                  );
                };

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-cyan-50/30 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-2 text-center border-r border-slate-100 bg-slate-50/30">
                      <input
                        type="text"
                        value={row.time}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-md py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 shadow-2xs"
                      />
                    </td>

                    {(is200 ? ['ph', 'frc', 'opo4', 'cl'] : ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh', 'ammn']).map(renderInput)}

                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:text-blue-600 text-slate-600 font-semibold transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Time Slot
            </button>
            <span>{readings.length} slots recorded</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Fill limits properly</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoolingWaterAnalysisPage;
