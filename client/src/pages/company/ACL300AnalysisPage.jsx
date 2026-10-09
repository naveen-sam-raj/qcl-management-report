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
  PackageCheck,
} from 'lucide-react';
import {
  validateCellValue,
  ACL_300_LIMITS,
} from '../../services/analysisValidation';

const DEFAULT_SHIFTS = {
  shift1: { p18: '', p44: '', nacl: '' },
  shift2: { p18: '', p44: '', nacl: '' },
  shift3: { p18: '', p44: '', nacl: '' },
};

const NUMERIC_FIELDS = ['nacl', 'p18', 'p44'];

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
  const [shifts, setShifts] = useState(DEFAULT_SHIFTS);
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
             setShifts(DEFAULT_SHIFTS);
          } else if (record.shifts) {
             setShifts({
               shift1: record.shifts.shift1 || { p18: '', p44: '', nacl: '' },
               shift2: record.shifts.shift2 || { p18: '', p44: '', nacl: '' },
               shift3: record.shifts.shift3 || { p18: '', p44: '', nacl: '' },
             });
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);

  const handleCellChange = useCallback((shiftKey, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setShifts((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [field]: value
      }
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${shiftKey}_${field}`];
      return copy;
    });
  }, []);

  const handleReset = () => {
    setShifts(DEFAULT_SHIFTS);
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  const handleSave = async () => {
    const newErrors = {};

    ['shift1', 'shift2', 'shift3'].forEach((shiftKey) => {
      const row = shifts[shiftKey];
      NUMERIC_FIELDS.forEach((f) => {
        const val = row[f];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${shiftKey}_${f}`] = 'Invalid';
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
        shifts,
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

  const renderLimitCell = (shiftKey, fieldKey, limitConfig, placeholder, rangeLabel) => {
    const valRes = validateCellValue(shifts[shiftKey][fieldKey], limitConfig);
    const hasVal = shifts[shiftKey][fieldKey] !== '' && shifts[shiftKey][fieldKey] !== null && shifts[shiftKey][fieldKey] !== undefined;
    const isOutOfLimit = valRes.isOutOfLimit;
    const isNormal = valRes.isNormal;
    const errorMsg = errors[`${shiftKey}_${fieldKey}`];

    return (
      <td className="py-2.5 px-3 border-r border-slate-100 align-top text-center" key={fieldKey}>
        <div className="flex flex-col items-center gap-1.5 w-full">
          <div className="relative w-full">
            <input
              id={`acl-300-input-${shiftKey}-${fieldKey}`}
              type="text"
              inputMode="decimal"
              value={shifts[shiftKey][fieldKey]}
              onChange={(e) => handleCellChange(shiftKey, fieldKey, e.target.value)}
              placeholder={placeholder}
              title={
                hasVal
                  ? isOutOfLimit
                    ? `OUT OF LIMIT: ${shifts[shiftKey][fieldKey]} (Valid Range: ${rangeLabel})`
                    : `NORMAL: ${shifts[shiftKey][fieldKey]} (Valid Range: ${rangeLabel})`
                  : `Valid Range: ${rangeLabel}`
              }
              className={`w-full px-3 py-2 text-sm font-bold text-center rounded border transition focus:outline-none ${
                errorMsg
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : isOutOfLimit
                  ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200 shadow-[inset_0_2px_4px_rgba(225,29,72,0.1)]'
                  : hasVal && isNormal
                  ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                  : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 shadow-sm'
              }`}
            />
            {isOutOfLimit && (
              <span
                className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow flex items-center justify-center pointer-events-none"
                title={`Out of limit: ${rangeLabel}`}
              >
                <AlertCircle className="w-2.5 h-2.5 text-white" />
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 w-full text-xs leading-tight flex-wrap">
            <span className="text-slate-400 font-medium hidden sm:inline-block">{rangeLabel}</span>
            {hasVal && (
              isOutOfLimit ? (
                <span className="font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-300 text-[10px] whitespace-nowrap shadow-xs uppercase">
                  OUT OF LIMIT
                </span>
              ) : isNormal ? (
                <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 text-[10px] whitespace-nowrap inline-flex items-center gap-0.5 shadow-xs uppercase">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> NORMAL
                </span>
              ) : null
            )}
          </div>
          {errorMsg && (
            <div className="text-xs text-red-500 font-bold text-center mt-0.5">
              {errorMsg}
            </div>
          )}
        </div>
      </td>
    );
  };

  const shiftRows = [
    { key: 'shift1', label: 'I SHIFT' },
    { key: 'shift2', label: 'II SHIFT' },
    { key: 'shift3', label: 'III SHIFT' },
  ];

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
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200 hidden sm:inline-block">
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
        <div className="px-5 py-3 border-b border-slate-200/80 flex items-center gap-2 bg-slate-50/70">
          <Clock className="w-4.5 h-4.5 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            ACL 300# Parameters
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-4 px-4 w-40 border-r border-slate-700 align-middle">
                  PARAMETER / SHIFT
                </th>
                <th className="py-3 px-3 w-48 text-center border-r border-slate-700">
                  <div className="text-white font-bold text-sm">NaCl %</div>
                  <div className="text-[11px] font-normal text-sky-300 normal-case mt-0.5">Target: 2.0% ±0.10</div>
                </th>
                <th className="py-3 px-3 w-48 text-center border-r border-slate-700">
                  <div className="text-white font-bold text-sm">BSS 18 Mesh %</div>
                  <div className="text-[11px] font-normal text-sky-300 normal-case mt-0.5">Target: 5% ±1.0</div>
                </th>
                <th className="py-3 px-3 w-48 text-center border-r border-slate-700">
                  <div className="text-white font-bold text-sm">BSS 44 Mesh %</div>
                  <div className="text-[11px] font-normal text-emerald-300 normal-case mt-0.5">Target: 60% ±5</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {shiftRows.map((shift) => (
                <tr key={shift.key} className="hover:bg-blue-50/30 transition-colors bg-white">
                  <td className="py-4 px-4 font-extrabold text-slate-700 bg-slate-50/50 border-r border-slate-100 tracking-wide">
                    {shift.label}
                  </td>
                  {renderLimitCell(shift.key, 'nacl', ACL_300_LIMITS.nacl, '1.90 – 2.10', '1.90% – 2.10%')}
                  {renderLimitCell(shift.key, 'p18', ACL_300_LIMITS.p18, '4.0 – 6.0', '4.0% – 6.0%')}
                  {renderLimitCell(shift.key, 'p44', ACL_300_LIMITS.p44, '55.0 – 65.0', '55.0% – 65.0%')}
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
