import React, { useState, useEffect, useCallback } from 'react';
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
  Database,
  FlaskConical,
  Layers,
} from 'lucide-react';

// Screenshot values for TK 204 / TK 209 (Date: 14/09/2026)
const DEFAULT_PARAMETERS = {
  fnh3: { tk204: '2.92', tk209: '1.64' },
  cnh3: { tk204: '3.60', tk209: '3.20' },
  tcl:  { tk204: '5.28', tk209: '4.40' },
  pcl:  { tk204: '1.68', tk209: '1.20' },
};

const PARAM_CONFIG = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '0.00' },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '0.00' },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)', placeholder: '0.00' },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '0.00' },
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

const TK204TK209AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  // Default date matching user's laboratory screenshot (14/09/2026)
  const [date, setDate] = useState('2026-09-14');
  const [parameters, setParameters] = useState(DEFAULT_PARAMETERS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Handle field change ──
  const handleCellChange = useCallback((paramKey, tankKey, value) => {
    if (!isValidDecimal(value)) return;

    setParameters((prev) => ({
      ...prev,
      [paramKey]: {
        ...(prev[paramKey] || {}),
        [tankKey]: value,
      },
    }));

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${paramKey}_${tankKey}`];
      return copy;
    });
  }, []);

  // ── Reset ──
  const handleReset = () => {
    setParameters(DEFAULT_PARAMETERS);
    setDate('2026-09-14');
    setErrors({});
    showToast?.('Values reset to laboratory default readings.', 'info');
  };

  // ── Validate ──
  const validate = () => {
    const newErrors = {};
    let hasError = false;

    PARAM_CONFIG.forEach((p) => {
      ['tk204', 'tk209'].forEach((tank) => {
        const val = parameters[p.key]?.[tank];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${p.key}_${tank}`] = 'Invalid number';
          hasError = true;
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // ── Save ──
  const handleSave = async () => {
    if (!validate()) {
      showToast?.('Please correct invalid numeric entries.', 'error');
      return;
    }

    const hasAnyValue = PARAM_CONFIG.some((p) =>
      ['tk204', 'tk209'].some((tank) => parameters[p.key]?.[tank] !== '' && parameters[p.key]?.[tank] !== null)
    );

    if (!hasAnyValue) {
      showToast?.('Please enter at least one measurement value.', 'warning');
      return;
    }

    setSaving(true);

    const payload = {
      date,
      plant: 'ACL',
      unit: 'TK 204 / TK 209',
      parameters,
      submittedBy: user?.name || 'Shift Chemist',
    };

    try {
      const response = await api.post('/api/tk204-tk209-analysis', payload);
      setSaving(false);
      setSaveSuccess(true);
      showToast?.(response.data?.message || 'TK 204 / TK 209 Analysis saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      setSaving(false);
      console.error('[TK204/TK209] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* ── Breadcrumb & Top Navigation matching TK 203 theme ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back button + Plant Navigation + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              id="btn-tk204-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to ACL Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-purple-600" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">TK 204 / TK 209</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                TK 204 / TK 209 ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-tk204-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Reset to default screenshot values"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-tk204-save"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs ${
                saveSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Control Bar: Date Selector & Context ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {/* Date Picker (Highlighted in soft yellow/amber background matching screenshot) */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                DATE:
              </span>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-amber-100 border border-amber-300 text-amber-950 font-bold rounded-lg px-2.5 py-1.5 text-xs shadow-inner ring-1 ring-amber-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <button
                type="button"
                onClick={() => setDate(new Date().toISOString().split('T')[0])}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[11px] font-bold text-slate-600 transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDate('2026-09-14')}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-[11px] font-bold text-blue-700 transition"
                title="Date from screenshot"
              >
                14/09/2026
              </button>
            </div>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-600 font-semibold">{formatDateDisplay(date)}</span>
          </div>

          {/* Plant & Operator Badge */}
          <div className="flex items-center gap-2 text-slate-500">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              ACL Plant • Storage Tank Comparison
            </span>
            <span className="hidden md:inline text-slate-400">•</span>
            <span className="hidden md:inline text-[11px]">
              Operator: <strong className="text-slate-700">{user?.name || 'Shift Chemist'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Comparison Table Matching Screenshot ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden max-w-3xl">
        {/* Table Header Bar */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">
              Chemical Analysis Comparison: TK 204 vs TK 209
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">4 Chemical Parameters</span>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-6 w-48 border-r border-slate-800">
                  Parameter
                </th>
                <th className="py-3 px-6 text-center border-r border-slate-800 bg-slate-800/90 text-blue-300 font-extrabold tracking-wider">
                  TK 204
                </th>
                <th className="py-3 px-6 text-center bg-slate-800/90 text-indigo-300 font-extrabold tracking-wider">
                  TK 209
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {PARAM_CONFIG.map((param) => {
                const val204 = parameters[param.key]?.tk204 ?? '';
                const val209 = parameters[param.key]?.tk209 ?? '';

                return (
                  <tr key={param.key} className="hover:bg-slate-50 transition-colors">
                    {/* Parameter Label */}
                    <td className="py-3.5 px-6 border-r border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-blue-600" />
                        <div>
                          <span className="font-extrabold text-slate-900 text-sm tracking-wide">
                            {param.label}
                          </span>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {param.formula}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* TK 204 Value */}
                    <td className="py-3 px-6 border-r border-slate-100">
                      <div className="relative max-w-[200px] mx-auto">
                        <input
                          type="text"
                          value={val204}
                          onChange={(e) => handleCellChange(param.key, 'tk204', e.target.value)}
                          placeholder={param.placeholder}
                          className={`w-full text-center font-mono text-sm font-extrabold py-2 px-3 rounded-lg border transition ${
                            errors[`${param.key}_tk204`]
                              ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                              : val204 !== ''
                              ? 'border-blue-200 bg-blue-50/40 text-blue-900 font-black'
                              : 'border-slate-200 bg-white text-slate-700'
                          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        />
                      </div>
                    </td>

                    {/* TK 209 Value */}
                    <td className="py-3 px-6">
                      <div className="relative max-w-[200px] mx-auto">
                        <input
                          type="text"
                          value={val209}
                          onChange={(e) => handleCellChange(param.key, 'tk209', e.target.value)}
                          placeholder={param.placeholder}
                          className={`w-full text-center font-mono text-sm font-extrabold py-2 px-3 rounded-lg border transition ${
                            errors[`${param.key}_tk209`]
                              ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                              : val209 !== ''
                              ? 'border-indigo-200 bg-indigo-50/40 text-indigo-900 font-black'
                              : 'border-slate-200 bg-white text-slate-700'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary / Quick Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Tanks: TK 204 & TK 209</span>
            <span>•</span>
            <span>Click any cell to edit numeric values</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-xs text-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TK204TK209AnalysisPage;
