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
  Factory,
  PackageCheck,
  FlaskConical,
  Grid3X3,
} from 'lucide-react';

// ─── Chemical & Physical Parameters ──────────────────────────────────────────

const CHEMICAL_PARAMETERS = [
  { key: 'nh4cl', label: 'NH₄Cl %', subLabel: 'Ammonium Chloride', unit: '%', placeholder: '97.40' },
  { key: 'nacl',  label: 'NaCl %',  subLabel: 'Sodium Chloride',   unit: '%', placeholder: '0.72' },
  { key: 'fe2o3', label: 'Fe₂O₃ %', subLabel: 'Ferric Oxide',      unit: '%', placeholder: '0.0055' },
  { key: 'h2o',   label: 'H₂O %',   subLabel: 'Moisture',          unit: '%', placeholder: '0.12' },
  { key: 'ir',    label: 'IR %',    subLabel: 'Insoluble Residue', unit: '%', placeholder: '0.32' },
  { key: 'bd',    label: 'BD',      subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '1000' },
  { key: 'p18_spec', label: '+18 %', subLabel: 'Oversize Particle Spec', unit: '%', placeholder: '00.5' },
];

// ─── BSS Sieve Parameters ────────────────────────────────────────────────────

const BSS_PARAMETERS = [
  { key: 'p6',    label: '+6 %',   mesh: '+6 Mesh',   placeholder: '0.0' },
  { key: 'p8',    label: '+8 %',   mesh: '+8 Mesh',   placeholder: '0.0' },
  { key: 'p12',   label: '+12 %',  mesh: '+12 Mesh',  placeholder: '0.0' },
  { key: 'p16',   label: '+16 %',  mesh: '+16 Mesh',  placeholder: '0.0' },
  { key: 'p18',   label: '+18 %',  mesh: '+18 Mesh',  placeholder: '00.5' },
  { key: 'p44',   label: '+44 %',  mesh: '+44 Mesh',  placeholder: '71.8' },
  { key: 'p60',   label: '+60 %',  mesh: '+60 Mesh',  placeholder: '17.9' },
  { key: 'p100',  label: '+100 %', mesh: '+100 Mesh', placeholder: '09.4' },
  { key: 'm100',  label: '-100 %', mesh: '-100 Mesh', placeholder: '00.4' },
];

const buildEmptyChemicalData = () =>
  Object.fromEntries(CHEMICAL_PARAMETERS.map((p) => [p.key, '']));

const buildEmptyBssData = () =>
  Object.fromEntries(BSS_PARAMETERS.map((p) => [p.key, '']));

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

const ACLProductAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── State ──
  const [date, setDate]                 = useState('');
  const [chemicalData, setChemicalData] = useState(buildEmptyChemicalData());
  const [bssData, setBssData]           = useState(buildEmptyBssData());
  const [errors, setErrors]             = useState({});
  const [saving, setSaving]             = useState(false);
  const [saveSuccess, setSaveSuccess]   = useState(false);
  const [dateError, setDateError]       = useState(false);

  // ── Calculate Live BSS Total ──
  const bssTotal = useMemo(() => {
    let sum = 0;
    let count = 0;
    BSS_PARAMETERS.forEach((p) => {
      const val = bssData[p.key];
      if (val !== '' && !isNaN(Number(val))) {
        sum += Number(val);
        count += 1;
      }
    });
    return { sum: parseFloat(sum.toFixed(3)), count };
  }, [bssData]);

  // ── Input Changes ──
  const handleChemicalChange = useCallback((key, value) => {
    if (!isValidDecimal(value)) return;
    setChemicalData((prev) => {
      const updated = { ...prev, [key]: value };
      // Sync +18 % to BSS if operator updates on chemical side
      if (key === 'p18_spec') {
        setBssData((bPrev) => (bPrev.p18 === '' || bPrev.p18 === prev.p18_spec ? { ...bPrev, p18: value } : bPrev));
      }
      return updated;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`chem_${key}`];
      return next;
    });
    setSaveSuccess(false);
  }, []);

  const handleBssChange = useCallback((key, value) => {
    if (!isValidDecimal(value)) return;
    setBssData((prev) => ({ ...prev, [key]: value }));
    // Sync +18 % to chemical card if entered under BSS
    if (key === 'p18') {
      setChemicalData((cPrev) => (cPrev.p18_spec === '' || cPrev.p18_spec === bssData.p18 ? { ...cPrev, p18_spec: value } : cPrev));
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`bss_${key}`];
      return next;
    });
    setSaveSuccess(false);
  }, [bssData]);

  // ── Reset Form ──
  const handleReset = useCallback(() => {
    setChemicalData(buildEmptyChemicalData());
    setBssData(buildEmptyBssData());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast('ACL Product analysis form cleared successfully.', 'info');
  }, [showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    if (!date) {
      setDateError(true);
      isValid = false;
    } else {
      setDateError(false);
    }

    CHEMICAL_PARAMETERS.forEach((p) => {
      const val = chemicalData[p.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[`chem_${p.key}`] = 'Invalid number';
        isValid = false;
      }
    });

    BSS_PARAMETERS.forEach((p) => {
      const val = bssData[p.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[`bss_${p.key}`] = 'Invalid number';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [date, chemicalData, bssData]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasChemData = Object.values(chemicalData).some((v) => v !== '');
    const hasBssData  = Object.values(bssData).some((v) => v !== '');

    if (!hasChemData && !hasBssData) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: 'ACL',
        analysisType: 'ACL Product Analysis',
        chemical: chemicalData,
        bss: bssData,
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/acl-product', payload);

      setSaveSuccess(true);
      showToast(response.data?.message || 'ACL Product Analysis saved successfully!', 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Failed to save ACL Product Analysis data.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-14">

      {/* ── Breadcrumb Header ──────────────────────────────────────────────── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back + Titles */}
          <div className="flex items-center gap-3">
            <button
              id="btn-aclproduct-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to ACL Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <PackageCheck className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">ACL Product</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                ACL PRODUCT
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-aclproduct-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Clear all fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-aclproduct-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              title="Save ACL Product data"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? 'Saving...' : 'Save / Submit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="aclproduct-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              ACL Product Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
            </span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 transition text-base leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Date Selection Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <label
              htmlFor="aclproduct-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="aclproduct-date-input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateError(false);
                  setSaveSuccess(false);
                }}
                className={`pl-9 pr-3 py-1.5 text-xs font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 ${
                  dateError
                    ? 'border-red-400 bg-red-50 focus:ring-red-400'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              />
            </div>
            {date && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-md">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-bold text-blue-700">
                  {formatDateDisplay(date)}
                </span>
              </div>
            )}
            {dateError && (
              <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                Date is required to save the analysis.
              </p>
            )}
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Finished Product Quality & Sieve Specification
          </div>
        </div>
      </div>

      {/* ── Main Data Entry Section (2 Columns: Chemical Specs & BSS Sieve) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ── CARD 1: Chemical & Physical Parameters ────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-400/30">
                <FlaskConical className="w-4 h-4 text-blue-300" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                  Chemical & Physical Characteristics
                </h2>
                <p className="text-[11px] text-slate-300">
                  Assay, Impurities & Bulk Density
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
              {CHEMICAL_PARAMETERS.length} Parameters
            </span>
          </div>

          {/* Parameters List */}
          <div className="divide-y divide-slate-100 p-2 sm:p-3">
            {CHEMICAL_PARAMETERS.map((param) => {
              const val = chemicalData[param.key];
              const isInvalid = !!errors[`chem_${param.key}`];
              const errorMessage = errors[`chem_${param.key}`];

              return (
                <div
                  key={param.key}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/80 transition-colors"
                >
                  {/* Parameter Label & Sublabel */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-extrabold text-slate-900 font-mono tracking-tight shrink-0">
                      {param.label}
                    </span>
                    <span className="text-xs text-slate-400 truncate hidden sm:inline">
                      ({param.subLabel})
                    </span>
                  </div>

                  {/* Input Box */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <input
                        id={`aclproduct-chem-${param.key}`}
                        type="text"
                        inputMode="decimal"
                        value={val}
                        placeholder={param.placeholder}
                        onChange={(e) => handleChemicalChange(param.key, e.target.value)}
                        className={`w-28 sm:w-32 px-3 py-1.5 text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          isInvalid
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : val !== ''
                            ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                            : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                        }`}
                        aria-label={param.label}
                      />
                      {isInvalid && (
                        <p className="text-[10px] text-red-600 font-bold mt-1 text-center animate-fadeIn absolute -bottom-4 left-0 right-0">
                          {errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card Footer Info */}
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>NH₄Cl purity, NaCl, Fe₂O₃, H₂O, IR & BD</span>
            <span className="font-semibold text-slate-600">Standard Specs</span>
          </div>
        </div>

        {/* ── CARD 2: B S S (Sieve Analysis / Particle Distribution) ───────── */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-600/30 rounded-lg border border-indigo-400/30">
                <Grid3X3 className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                  B S S (Sieve Analysis)
                </h2>
                <p className="text-[11px] text-slate-300">
                  British Standard Sieve Particle Distribution (%)
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
              {BSS_PARAMETERS.length} Mesh Sizes
            </span>
          </div>

          {/* BSS Sieve Parameters List */}
          <div className="divide-y divide-slate-100 p-2 sm:p-3">
            {BSS_PARAMETERS.map((param) => {
              const val = bssData[param.key];
              const isInvalid = !!errors[`bss_${param.key}`];
              const errorMessage = errors[`bss_${param.key}`];

              return (
                <div
                  key={param.key}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/80 transition-colors"
                >
                  {/* Mesh Label */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-extrabold text-slate-900 font-mono tracking-tight shrink-0">
                      {param.label}
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      ({param.mesh})
                    </span>
                  </div>

                  {/* Input Box */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <input
                        id={`aclproduct-bss-${param.key}`}
                        type="text"
                        inputMode="decimal"
                        value={val}
                        placeholder={param.placeholder}
                        onChange={(e) => handleBssChange(param.key, e.target.value)}
                        className={`w-28 sm:w-32 px-3 py-1.5 text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          isInvalid
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : val !== ''
                            ? 'border-2 border-indigo-500 bg-indigo-50/50 text-indigo-900 font-extrabold focus:ring-2 focus:ring-indigo-200'
                            : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900'
                        }`}
                        aria-label={param.label}
                      />
                      {isInvalid && (
                        <p className="text-[10px] text-red-600 font-bold mt-1 text-center animate-fadeIn absolute -bottom-4 left-0 right-0">
                          {errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card Footer: Live Total Recovery Counter */}
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">
              Total Sieve Recovery:
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-extrabold px-2.5 py-0.5 rounded text-xs border ${
                  Math.abs(bssTotal.sum - 100) < 0.2
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : bssTotal.count > 0
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {bssTotal.count > 0 ? `${bssTotal.sum.toFixed(1)} %` : '—'}
              </span>
              {Math.abs(bssTotal.sum - 100) < 0.2 && (
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                  ✓ 100%
                </span>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ACLProductAnalysisPage;
