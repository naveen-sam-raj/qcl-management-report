import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  getCellLimit,
  validateCellValue,
  validateFullDataset,
} from '../../services/analysisValidation';
import {
  ArrowLeft,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FlaskConical,
  Factory,
  ShieldAlert,
  Eye,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMETERS = [
  { key: 'nacl', label: 'NaCl %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'ca', label: 'Ca %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'mg', label: 'Mg %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'so4', label: 'SO₄ %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'ir', label: 'IR %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'h2o', label: 'H₂O %', unit: '%', colClass: 'min-w-[105px]' },
];

const ROWS = [
  { key: 'rawSalt', label: 'RAW SALT', highlight: true, highlightType: 'raw' },
  { key: 'shift1', label: 'I SHIFT', highlight: false, highlightType: 'shift1' },
  { key: 'shift2', label: 'II SHIFT', highlight: false, highlightType: 'shift2' },
  { key: 'shift3', label: 'III SHIFT', highlight: false, highlightType: 'shift3' },
  { key: 'composition', label: 'COMPOSITION', highlight: true, highlightType: 'comp' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

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

// ─── Row style helpers (Vibrant, High-Contrast Industrial Palette) ──────────────

const getRowStyles = (highlightType) => {
  if (highlightType === 'raw') {
    return {
      row: 'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-blue-600',
      label: 'text-blue-950 font-extrabold tracking-tight',
      badge: 'bg-blue-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift1') {
    return {
      row: 'bg-white hover:bg-blue-50/30 border-l-4 border-l-sky-500',
      label: 'text-slate-900 font-bold tracking-tight',
      badge: null,
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift2') {
    return {
      row: 'bg-blue-50/40 hover:bg-blue-100/50 border-l-4 border-l-indigo-500',
      label: 'text-slate-900 font-bold tracking-tight',
      badge: null,
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'shift3') {
    return {
      row: 'bg-white hover:bg-indigo-50/30 border-l-4 border-l-purple-500',
      label: 'text-slate-900 font-bold tracking-tight',
      badge: null,
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (highlightType === 'comp') {
    return {
      row: 'bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-600',
      label: 'text-emerald-950 font-extrabold tracking-tight',
      badge: 'bg-emerald-600 text-white font-extrabold shadow-2xs',
      inputFocus: 'border-2 border-emerald-300 bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 text-slate-900 font-bold hover:border-emerald-400',
    };
  }
  return {
    row: 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent',
    label: 'text-slate-800 font-semibold',
    badge: null,
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PureSaltAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── State ──
  const [date, setDate] = useState('');
  const [data, setData] = useState(buildEmptyData());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // ── Real-time input change & boundary check ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    // Immediate validation using centralized limits registry
    const limit = getCellLimit(plantId, 'pure-salt', rowKey, paramKey);
    const result = validateCellValue(value, limit);

    setErrors((prev) => {
      const next = { ...prev };
      const cellKey = `${rowKey}_${paramKey}`;
      if (!result.isValid) {
        next[cellKey] = result.message;
      } else {
        delete next[cellKey];
      }
      return next;
    });

    // Clear global success on any edit
    setSaveSuccess(false);
  }, [plantId]);

  const handleReset = () => {
    setData(buildEmptyData());
    setDate('');
    setErrors({});
    setSaveSuccess(false);
    setDateError(false);
    showToast('Form cleared successfully.', 'info');
  };

  // Full dataset validation before submission
  const validate = () => {
    let hasError = false;

    if (!date) {
      setDateError(true);
      hasError = true;
    } else {
      setDateError(false);
    }

    // Run full validation across all cells
    const datasetValidation = validateFullDataset(data, plantId, 'pure-salt');
    if (!datasetValidation.isValid) {
      hasError = true;
      const formattedErrors = {};
      Object.entries(datasetValidation.errors).forEach(([k, err]) => {
        formattedErrors[k] = err.message;
      });
      setErrors((prev) => ({ ...prev, ...formattedErrors }));
    }

    return !hasError;
  };

  const handleSave = async () => {
    if (!validate()) {
      showToast('Please correct values that exceed allowed tolerance limits before saving.', 'error');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: 'ACL',
      analysisType: 'Pure Salt Analysis',
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
      rows: Object.fromEntries(
        ROWS.map((r) => [
          r.key,
          Object.fromEntries(
            PARAMETERS.map((p) => {
              const val = data[r.key][p.key];
              return [p.key, val !== '' ? parseFloat(val) : null];
            })
          ),
        ])
      ),
    };

    try {
      // Backend API call with strict server-side tolerance validation
      const response = await api.post('/api/pure-salt-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast(response.data?.message || 'Pure Salt Analysis verified & saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 6000);
    } catch (err) {
      setSaving(false);
      console.error('[PureSaltAnalysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      const serverDetails = err.response?.data?.errorDetails;

      if (serverDetails && typeof serverDetails === 'object') {
        const nextErrors = {};
        Object.entries(serverDetails).forEach(([k, detail]) => {
          nextErrors[k] = typeof detail === 'object' ? detail.message : detail;
        });
        setErrors((prev) => ({ ...prev, ...nextErrors }));
      }

      showToast('Validation Error: ' + serverMessage, 'error');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn pb-6">

      {/* ── Breadcrumb Header ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Back + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              id="btn-psa-back"
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
                <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">Pure Salt Analysis</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                PURE SALT ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          {!isViewOnly ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-psa-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-psa-save"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
                title="Save analysis data"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : 'Save / Submit'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span>View-Only Mode</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="psa-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              Pure Salt Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
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
              htmlFor="psa-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Analysis Date</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="psa-date-input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateError(false);
                  setSaveSuccess(false);
                }}
                className={`pl-9 pr-3 py-1.5 text-xs font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 ${dateError
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

          {/* Info badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 shrink-0">
            <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
            <span>5 Sample Rows · 6 Parameters</span>
          </div>
        </div>
      </div>

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* Table header label */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-blue-600" />
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              {isViewOnly ? 'Analysis Specifications (View-Only)' : 'Analysis Data Entry'}
            </span>
          </div>
          <div className="flex items-center gap-3.5 text-[11px] font-bold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-sky-200 border-2 border-blue-500 inline-block" />
              Raw Salt
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-white border-2 border-slate-400 inline-block" />
              Shifts
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-200 border-2 border-emerald-500 inline-block" />
              Composition
            </span>
          </div>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 sm:w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Parameter / Shift
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                      } ${p.colClass}`}
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody className="divide-y divide-slate-200">
              {ROWS.map((row) => {
                const styles = getRowStyles(row.highlightType);
                return (
                  <tr
                    key={row.key}
                    className={`transition-colors duration-100 ${styles.row}`}
                  >
                    {/* Row label */}
                    <td className="px-5 py-2.5 align-middle">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${styles.label} whitespace-nowrap`}>
                          {row.label}
                        </span>
                        {row.highlight && (!isViewOnly || row.highlightType === 'comp') && (
                          <span
                            className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}
                          >
                            {row.highlightType === 'raw' ? 'Input' : 'Final'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Parameter input cells */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key][param.key];
                      const limit = getCellLimit(plantId, 'pure-salt', row.key, param.key);
                      const cellValidation = validateCellValue(cellVal, limit);
                      const isInvalid = !isViewOnly && (!cellValidation.isValid || !!errors[fieldKey]);
                      const errorMessage = errors[fieldKey] || (!cellValidation.isValid ? cellValidation.message : null);

                      return (
                        <td key={param.key} className="px-3 py-2.5 text-center align-middle">
                          <input
                            id={`psa-input-${row.key}-${param.key}`}
                            type="text"
                            inputMode="decimal"
                            readOnly={isViewOnly}
                            disabled={isViewOnly}
                            value={cellVal}
                            onChange={(e) =>
                              !isViewOnly && handleChange(row.key, param.key, e.target.value)
                            }
                            placeholder={isViewOnly ? '—' : '0.00'}
                            className={`w-full max-w-[96px] mx-auto text-center text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg border shadow-2xs transition-all ${
                              isViewOnly
                                ? 'bg-slate-50 text-slate-800 border-slate-200 cursor-default select-text'
                                : isInvalid
                                ? 'border-2 border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60 focus:outline-none'
                                : styles.inputFocus
                            }`}
                            aria-label={`${row.label} ${param.label}`}
                          />

                          {/* Error Message if format is invalid */}
                          {isInvalid && (
                            <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                              <span className="whitespace-nowrap">{errorMessage}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer hint */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            {isViewOnly ? (
              <span>All values displayed in <strong>percentage (%)</strong>. Read-only specifications view.</span>
            ) : (
              <span>All values are in <strong>percentage (%)</strong>. Enter numeric values only. Leave blank if not applicable.</span>
            )}
          </p>
          {!isViewOnly && (
            <div className="flex items-center gap-2">
              <button
                id="btn-psa-save-bottom"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : 'Save / Submit'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default PureSaltAnalysisPage;
