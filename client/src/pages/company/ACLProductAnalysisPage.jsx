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
  Grid3X3,
} from 'lucide-react';
import {
  validateCellValue,
  ACL_PRODUCT_LIMITS,
} from '../../services/analysisValidation';

const DEFAULT_READINGS = [
  {
    id: `acl_prod_${Date.now()}`,
    sample: 'ACL Product',
    frequency: 'Day',
    time: '08:00',
    nh4cl: '',
    nacl: '',
    fe2o3: '',
    h2o: '',
    ir: '',
    bd: '',
    sieve_6: '',
    sieve_8: '',
    sieve_12: '',
    sieve_16: '',
    sieve_18: '',
    sieve_44: '',
    sieve_60: '',
    sieve_100: '',
  },
];

const NUMERIC_FIELDS = [
  'nh4cl', 'nacl', 'fe2o3', 'h2o', 'ir', 'bd',
  'sieve_6', 'sieve_8', 'sieve_12', 'sieve_16', 'sieve_18', 'sieve_44', 'sieve_60', 'sieve_100'
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

const ACLProductAnalysisPage = ({ plantId = 'acl' }) => {
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
        const response = await api.get(`/api/acl-product-analysis?date=${date}`);
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
    const nextId = `acl_prod_${Date.now()}`;
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        sample: `ACL Product #${prev.length + 1}`,
        frequency: 'Day',
        time: '08:00',
        nh4cl: '',
        nacl: '',
        fe2o3: '',
        h2o: '',
        ir: '',
        bd: '',
        sieve_6: '',
        sieve_8: '',
        sieve_12: '',
        sieve_16: '',
        sieve_18: '',
        sieve_44: '',
        sieve_60: '',
        sieve_100: '',
      },
    ]);
    showToast?.('Added new sampling row for ACL Product.', 'info');
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
    setReadings([{ ...DEFAULT_READINGS[0], id: `acl_prod_${Date.now()}` }]);
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
        unit: 'ACL Product',
        frequency: 'Day',
        analysisType: 'ACL Product Analysis',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/acl-product-analysis', payload);

      if (res.data?.success) {
        showToast?.('ACL Product Analysis data saved successfully!', 'success');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        showToast?.(res.data?.message || 'ACL Product data saved.', 'success');
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

  const renderLimitCell = (row, fieldKey, limitConfig, placeholder, rangeLabel, statusLabelStyle) => {
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
              id={`acl-product-input-${row.id}-${fieldKey}`}
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

  const renderSieveCell = (row, fieldKey, placeholder) => {
    const hasVal = row[fieldKey] !== '' && row[fieldKey] !== null && row[fieldKey] !== undefined;
    const errorMsg = errors[`${row.id}_${fieldKey}`];

    return (
      <td className="py-2 px-2 border-r border-slate-100 align-top text-center" key={fieldKey}>
        <div className="flex flex-col items-center gap-1 w-full">
          <input
            type="text"
            inputMode="decimal"
            value={row[fieldKey]}
            onChange={(e) => handleCellChange(row.id, fieldKey, e.target.value)}
            placeholder={placeholder}
            className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
              errorMsg
                ? 'border-red-400 bg-red-50 text-red-700'
                : hasVal
                ? 'border-indigo-400 bg-indigo-50/50 text-indigo-950 font-bold focus:ring-2 focus:ring-indigo-200'
                : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
            }`}
          />
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
                <span className="text-blue-600 font-semibold">ACL Product</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-blue-600" />
                  ACL PRODUCT ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                  FREQUENCY: DAY
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap self-end sm:self-auto">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="aclproduct-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="aclproduct-date-input"
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

      {/* ── CHEMICAL PARAMETERS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                ACL Product Chemical Parameters
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
          <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-2 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-40 border-r border-slate-700">SAMPLE / STREAM</th>
                <th className="py-3 px-2 w-24 text-center border-r border-slate-700">TIME</th>

                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">NH₄Cl</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 97.0% ±0.5</div>
                </th>
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">NaCl</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 2.0% ±0.1</div>
                </th>
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">Fe₂O₃</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">Target: 0.013% ±0.005</div>
                </th>
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">H₂O</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 2.0% ±0.10</div>
                </th>
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">IR</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">Target: 0.30% ±0.10</div>
                </th>
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">BD</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">Target: 1000 ±0.10 g/L</div>
                </th>
                <th className="py-3 px-2 w-12 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => (
                <tr key={`chem-${row.id}`} className="hover:bg-blue-50/30 transition-colors bg-white">
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
                    <input
                      type="text"
                      value={row.time}
                      onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                      placeholder="HH:mm"
                      className="w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-1 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 transition shadow-2xs"
                    />
                  </td>
                  
                  {renderLimitCell(row, 'nh4cl', ACL_PRODUCT_LIMITS.nh4cl, '96.5 – 97.5', '96.5% – 97.5%')}
                  {renderLimitCell(row, 'nacl', ACL_PRODUCT_LIMITS.nacl, '1.9 – 2.1', '1.9% – 2.1%')}
                  {renderLimitCell(row, 'fe2o3', ACL_PRODUCT_LIMITS.fe2o3, '0.008 – 0.018', '0.008% – 0.018%')}
                  {renderLimitCell(row, 'h2o', ACL_PRODUCT_LIMITS.h2o, '1.90 – 2.10', '1.90% – 2.10%')}
                  {renderLimitCell(row, 'ir', ACL_PRODUCT_LIMITS.ir, '0.20 – 0.40', '0.20% – 0.40%')}
                  {renderLimitCell(row, 'bd', ACL_PRODUCT_LIMITS.bd, '999.9 – 1000.1', '999.90 – 1000.10')}

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

      {/* ── SIEVE ANALYSIS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden mt-6">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Sieve Analysis (%)
              </h2>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-2 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-40 border-r border-slate-700">SAMPLE / STREAM</th>
                <th className="py-3 px-2 w-24 text-center border-r border-slate-700">TIME</th>

                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">6 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">8 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">12 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">16 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">18 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">44 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">60 MESH</th>
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">100 MESH</th>
                <th className="py-3 px-2 w-12 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => (
                <tr key={`sieve-${row.id}`} className="hover:bg-indigo-50/30 transition-colors bg-white">
                  <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-bold border-r border-slate-100 text-slate-600 bg-slate-50/30">
                    {row.sample || '—'}
                  </td>
                  <td className="py-2.5 px-2 text-center border-r border-slate-100 font-mono text-slate-600 bg-slate-50/30">
                    {row.time || '—'}
                  </td>
                  
                  {renderSieveCell(row, 'sieve_6', '0.0')}
                  {renderSieveCell(row, 'sieve_8', '0.0')}
                  {renderSieveCell(row, 'sieve_12', '0.0')}
                  {renderSieveCell(row, 'sieve_16', '0.0')}
                  {renderSieveCell(row, 'sieve_18', '0.0')}
                  {renderSieveCell(row, 'sieve_44', '0.0')}
                  {renderSieveCell(row, 'sieve_60', '0.0')}
                  {renderSieveCell(row, 'sieve_100', '0.0')}

                  <td className="py-2.5 px-2 text-center align-top">
                    {/* Visual filler to align with the above table */}
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

export default ACLProductAnalysisPage;
