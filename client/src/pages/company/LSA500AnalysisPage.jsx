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
  Layers,
} from 'lucide-react';

// ─── Default Time Slots matching Legacy System ──────────────────────────────────
const DEFAULT_ROWS = [
  { id: 'r1',  time: '06:30', nacl: '', isDefault: true },
  { id: 'r2',  time: '08:30', nacl: '', isDefault: true },
  { id: 'r3',  time: '10:00', nacl: '', isDefault: true },
  { id: 'r4',  time: '12:00', nacl: '', isDefault: true },
  { id: 'r5',  time: '14:30', nacl: '', isDefault: true },
  { id: 'r6',  time: '16:00', nacl: '', isDefault: true },
  { id: 'r7',  time: '18:00', nacl: '', isDefault: true },
  { id: 'r8',  time: '20:00', nacl: '', isDefault: true },
  { id: 'r9',  time: '22:30', nacl: '', isDefault: true },
  { id: 'r10', time: '00:30', nacl: '', isDefault: true },
  { id: 'r11', time: '02:00', nacl: '', isDefault: true },
  { id: 'r12', time: '04:00', nacl: '', isDefault: true },
  { id: 'r13', time: '',      nacl: '', isDefault: false },
  { id: 'r14', time: '',      nacl: '', isDefault: false },
  { id: 'r15', time: '',      nacl: '', isDefault: false },
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

const LSA500AnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ─── State ──────────────────────────────────────────────────────────────────
  const [date, setDate]               = useState('');
  const [rows, setRows]               = useState(DEFAULT_ROWS);
  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError]     = useState(false);

  // ─── Live Statistics ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const validVals = rows
      .map((r) => parseFloat(r.nacl))
      .filter((v) => !isNaN(v));

    if (validVals.length === 0) {
      return { count: 0, avg: null, min: null, max: null };
    }

    const sum = validVals.reduce((acc, val) => acc + val, 0);
    const avg = sum / validVals.length;
    const min = Math.min(...validVals);
    const max = Math.max(...validVals);

    return {
      count: validVals.length,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
    };
  }, [rows]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCellChange = useCallback((id, field, value) => {
    if (field === 'nacl' && !isValidDecimal(value)) return;

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    if (errors[`${id}_${field}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${id}_${field}`];
        return next;
      });
    }
  }, [errors]);

  const handleAddRow = () => {
    const nextId = `r_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setRows((prev) => [...prev, { id: nextId, time: '', nacl: '', isDefault: false }]);
  };

  const handleDeleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleReset = useCallback(() => {
    if (window.confirm('Are you sure you want to reset all entered values for LSA AT 500#?')) {
      setRows(DEFAULT_ROWS);
      setErrors({});
      setDateError(false);
      setSaveSuccess(false);
      showToast('LSA AT 500# analysis form cleared successfully.', 'info');
    }
  }, [showToast]);

  const handleSave = async () => {
    if (!date) {
      setDateError(true);
      showToast('Please select an analysis date before saving.', 'error');
      document.getElementById('lsa500-date-input')?.focus();
      return;
    }
    setDateError(false);

    // Validate any non-empty rows
    const newErrors = {};
    rows.forEach((r) => {
      if (r.nacl !== '' && isNaN(Number(r.nacl))) {
        newErrors[`${r.id}_nacl`] = 'Invalid number';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast('Please fix invalid numeric values before saving.', 'error');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: 'SA',
        analysisType: 'LSA AT 500# Analysis',
        unit: 'LSA AT 500#',
        rows: rows.filter((r) => r.time || r.nacl),
        averageNaCl: stats.avg,
        submittedBy: user?.name || 'Operator',
      };

      const response = await api.post('/api/lsa-500-analysis', payload);
      setSaveSuccess(true);
      showToast(response.data?.message || 'LSA AT 500# data saved successfully!', 'success');
      setTimeout(() => setSaveSuccess(false), 8000);
    } catch (err) {
      console.error('Error saving LSA AT 500# data:', err);
      const msg =
        err?.response?.data?.message ||
        'Failed to save LSA AT 500# Analysis data.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── Breadcrumb & Top Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
            title="Back to Soda Ash Plant Options"
            id="btn-lsa500-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Soda Ash Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-emerald-600">LSA AT 500#</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6 text-emerald-600 inline" />
              LSA AT 500# ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleReset}
            id="btn-lsa500-reset"
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition shadow-xs disabled:opacity-50"
            title="Clear all fields"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>
          <button
            onClick={handleSave}
            id="btn-lsa500-save"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition shadow-sm disabled:opacity-50"
            title="Save LSA AT 500# data"
          >
            {saving ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving...' : 'Save Analysis'}
          </button>
        </div>
      </div>

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && (
        <div
          id="lsa500-success-banner"
          className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-sm">Saved Successfully!</span>
              <p className="text-xs text-emerald-700">
                LSA AT 500# Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-bold underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Date Selection Row right below Heading Bar ─────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <label
              htmlFor="lsa500-date-input"
              className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
            >
              <span>Date :</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="lsa500-date-input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (dateError) setDateError(false);
                }}
                className={`pl-9 pr-3 py-1.5 text-xs font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition text-slate-800 ${
                  dateError
                    ? 'border-red-400 bg-red-50 focus:ring-red-400'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              />
            </div>
            {date && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-md">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-700">
                  {formatDateDisplay(date)}
                </span>
              </div>
            )}
            {dateError && (
              <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> Date is required to save the analysis.
              </p>
            )}
          </div>

          {/* Quick date picks */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setDate(today);
                setDateError(false);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                setDate(d.toISOString().split('T')[0]);
                setDateError(false);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
            >
              Yesterday
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Data Table starting from the Left Side ─────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Table Header Card */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 to-emerald-50/30 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                LSA AT 500# — NaCl % Data Entry
              </h2>
              <p className="text-xs text-slate-500">
                Enter NaCl % for each sampling time slot (e.g. 0.80, 0.74).
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddRow}
              id="btn-add-lsa500-row"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 transition shadow-2xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              Add Time Slot
            </button>
          </div>

          {/* Grid Container */}
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-left border-collapse" id="lsa500-table">
              {/* Header */}
              <thead className="sticky top-0 bg-slate-900 text-white z-10 select-none shadow-sm">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center w-14 border-r border-slate-800">
                    #
                  </th>
                  <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase w-40 border-r border-slate-800">
                    Time
                  </th>
                  <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center">
                    NaCl %
                  </th>
                  <th className="px-2 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center w-12">
                    Action
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-200/80">
                {rows.map((row, index) => {
                  const hasVal = row.nacl !== '';
                  const err = errors[`${row.id}_nacl`];

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        hasVal ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Row Index */}
                      <td className="px-3 py-2 text-center text-xs font-bold text-slate-400 border-r border-slate-100">
                        {index + 1}
                      </td>

                      {/* Time Column (Editable Input matching legacy box) */}
                      <td className="px-3 py-1.5 border-r border-slate-100">
                        <input
                          type="text"
                          value={row.time}
                          placeholder="HH:MM"
                          onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                          className="w-full max-w-[130px] px-2.5 py-1 text-xs font-bold font-mono text-slate-800 bg-slate-50 border border-slate-300 rounded focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200 outline-none transition text-center"
                          id={`lsa500-time-${index}`}
                        />
                      </td>

                      {/* NaCl % Column */}
                      <td className="px-4 py-1.5">
                        <div className="flex items-center justify-center max-w-[200px] mx-auto">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.nacl}
                            placeholder="0.00"
                            onChange={(e) => handleCellChange(row.id, 'nacl', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const nextInput = document.getElementById(`lsa500-nacl-${index + 1}`);
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            id={`lsa500-nacl-${index}`}
                            className={`w-full px-3 py-1 text-xs font-bold font-mono text-center rounded border transition outline-none ${
                              err
                                ? 'border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                                : hasVal
                                ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-extrabold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200'
                                : 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 hover:border-slate-400'
                            }`}
                          />
                        </div>
                      </td>

                      {/* Delete action for custom rows */}
                      <td className="px-2 py-1.5 text-center">
                        {!row.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer with Average */}
              <tfoot className="bg-slate-100/80 border-t-2 border-slate-300 sticky bottom-0 z-10 font-bold text-xs">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-right text-slate-700 uppercase tracking-wider font-extrabold border-r border-slate-300">
                    Average NaCl %:
                  </td>
                  <td className="px-4 py-2.5 text-center text-emerald-700 font-black text-sm">
                    {stats.avg !== null ? `${stats.avg}%` : '—'}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bottom helper bar */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <div>
              Values for <strong>LSA AT 500#</strong> (NaCl %). Numeric decimal values only. Leave blank if not sampled.
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              Shift 1: 06:30–12:00 | Shift 2: 14:30–20:00 | Shift 3: 22:30–04:00
            </div>
          </div>
        </div>
      </div>
  );
};

export default LSA500AnalysisPage;
