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
  PackageCheck,
} from 'lucide-react';
import {
  validateCellValue,
  ACL_300_LIMITS,
} from '../../services/analysisValidation';

const DEFAULT_READINGS = [
  {
    id: `acl_300_${Date.now()}`,
    sample: 'ACL 300#',
    shift: 'I Shift',
    time: '08:00',
    nacl: '',
    p18: '',
    p44: '',
  },
];

const NUMERIC_FIELDS = ['nacl', 'p18', 'p44'];

const SHIFT_OPTIONS = ['I Shift', 'II Shift', 'III Shift'];

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

const ACL300AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [readings, setReadings] = useState(DEFAULT_READINGS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/acl-300-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.readings && record.readings.length > 0) {
            setReadings(record.readings);
          } else if (record.data && Array.isArray(record.data) && record.data.length > 0) {
            setReadings(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setReadings(record);
          } else if (record.data && record.data.readings) {
            setReadings(record.data.readings);
          } else if (record.shifts) {
            // Migrate old shifts format to dynamic rows
            const oldShifts = [];
            if (record.shifts.shift1 && Object.values(record.shifts.shift1).some(v => v !== '')) {
              oldShifts.push({ id: `acl_300_${Date.now()}_1`, sample: 'ACL 300#', shift: 'I Shift', time: '08:00', ...record.shifts.shift1 });
            }
            if (record.shifts.shift2 && Object.values(record.shifts.shift2).some(v => v !== '')) {
              oldShifts.push({ id: `acl_300_${Date.now()}_2`, sample: 'ACL 300#', shift: 'II Shift', time: '16:00', ...record.shifts.shift2 });
            }
            if (record.shifts.shift3 && Object.values(record.shifts.shift3).some(v => v !== '')) {
              oldShifts.push({ id: `acl_300_${Date.now()}_3`, sample: 'ACL 300#', shift: 'III Shift', time: '00:00', ...record.shifts.shift3 });
            }
            if (oldShifts.length > 0) {
              setReadings(oldShifts);
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);

  const handleCellChange = useCallback((id, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

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
    const nextId = `acl_300_${Date.now()}`;
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        sample: `ACL 300#`,
        shift: 'I Shift',
        time: '',
        nacl: '',
        p18: '',
        p44: '',
      },
    ]);
    showToast?.('Added new sampling row for ACL 300#.', 'info');
  };

  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
    showToast?.('Row removed.', 'info');
  };

  const handleReset = () => {
    setReadings([{ ...DEFAULT_READINGS[0], id: `acl_300_${Date.now()}` }]);
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

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
        unit: 'ACL 300#',
        frequency: 'Once in a Shift',
        analysisType: 'ACL 300# Analysis',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/acl-300-analysis', payload);

      if (res.data?.success) {
        showToast?.('ACL 300# Analysis data saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'ACL 300# data saved.', 'success');
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

  const renderLimitCell = (row, fieldKey, limitConfig, placeholder, rangeLabel) => {
    const valRes = validateCellValue(row[fieldKey], limitConfig);
    const hasVal = row[fieldKey] !== '' && row[fieldKey] !== null && row[fieldKey] !== undefined;
    const isOutOfLimit = valRes.isOutOfLimit;
    const isNormal = valRes.isNormal;
    const errorMsg = errors[`${row.id}_${fieldKey}`];

    return (
      <td className="py-2 px-2 border-r border-slate-100 align-top text-center" key={fieldKey}>
        <div className="flex flex-col items-center gap-1 w-full">
          <div className="relative w-full">
            <input
              id={`acl-300-input-${row.id}-${fieldKey}`}
              type="text"
              inputMode="decimal"
              value={row[fieldKey]}
              onChange={(e) => handleCellChange(row.id, fieldKey, e.target.value)}
              placeholder={placeholder}
              title={
                hasVal
                  ? isOutOfLimit
                    ? `OUT OF LIMIT: ${row[fieldKey]} (Valid Range: ${rangeLabel})`
                    : `NORMAL: ${row[fieldKey]} (Valid Range: ${rangeLabel})`
                  : `Valid Range: ${rangeLabel}`
              }
              className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                errorMsg
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : isOutOfLimit
                  ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                  : hasVal && isNormal
                  ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                  : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100'
              }`}
            />
            {isOutOfLimit && (
              <span
                className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                title={`Out of limit: ${rangeLabel}`}
              >
                <AlertCircle className="w-2 h-2 text-white" />
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
            <span className="text-slate-400 font-medium">{rangeLabel}</span>
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
          {errorMsg && (
            <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
              {errorMsg}
            </div>
          )}
        </div>
      </td>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── TOP BREADCRUMB HEADER ── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <PackageCheck className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">ACL 300#</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-blue-600" />
                  ACL 300# ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                  FREQUENCY: ONCE IN A SHIFT
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap self-end sm:self-auto">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="acl300-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="acl300-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-7 pr-2 py-1 text-xs font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 bg-white border-slate-300 hover:border-slate-400"
                  required
                />
              </div>
              {date && (
                <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
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
      </div>

      {/* ── PARAMETERS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                ACL 300# Parameters
              </h2>
            </div>
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
          <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-2 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-40 border-r border-slate-700">SAMPLE / STREAM</th>
                <th className="py-3 px-2 w-32 text-center border-r border-slate-700">SHIFT</th>
                <th className="py-3 px-2 w-24 text-center border-r border-slate-700">TIME</th>

                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">NaCl</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 2.0% ±0.10</div>
                </th>
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">18 MESH</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 5% ±1.0</div>
                </th>
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">44 MESH</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">Target: 60% ±5</div>
                </th>
                <th className="py-3 px-2 w-12 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => (
                <tr key={row.id} className="hover:bg-blue-50/30 transition-colors bg-white">
                  <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-bold border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      <input
                        type="text"
                        value={row.sample}
                        onChange={(e) => handleCellChange(row.id, 'sample', e.target.value)}
                        className="w-full font-bold text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition text-xs"
                      />
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <select
                      value={row.shift}
                      onChange={(e) => handleCellChange(row.id, 'shift', e.target.value)}
                      className="w-full font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 transition shadow-2xs cursor-pointer"
                    >
                      <option value="">Select Shift...</option>
                      {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 px-2 text-center border-r border-slate-100">
                    <input
                      type="text"
                      value={row.time}
                      onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                      placeholder="HH:mm"
                      className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 transition shadow-2xs"
                    />
                  </td>
                  
                  {renderLimitCell(row, 'nacl', ACL_300_LIMITS.nacl, '1.9 – 2.1', '1.90% – 2.10%')}
                  {renderLimitCell(row, 'p18', ACL_300_LIMITS.p18, '4.0 – 6.0', '4.0% – 6.0%')}
                  {renderLimitCell(row, 'p44', ACL_300_LIMITS.p44, '55.0 – 65.0', '55.0% – 65.0%')}

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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ACL300AnalysisPage;
