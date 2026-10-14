import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  getCellLimit,
  validateCellValue,
} from '../../services/analysisValidation';
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
  Flame,
  Layers,
  Mail,
  RefreshCw,
  Lock,
} from 'lucide-react';

/**
 * Returns current date string formatted as YYYY-MM-DD in Asia/Kolkata timezone
 */
const getTodayAsiaKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

// Sieve size parameters: BSS 10, BSS 30 (1.5%–2.0%), -30, BSS 60 (5.5%–6.0%)
// Keeps legacy keys (p10, p30, p60, m60) alongside modern keys for backward compatibility
const PARAMETERS = [
  { key: 'bss10', legacyKey: 'p10', label: 'BSS 10', unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss30', legacyKey: 'p30', label: 'BSS 30', unit: '%', placeholder: '1.8', colClass: 'min-w-[130px]' },
  { key: 'm30',   legacyKey: 'p60', label: '-30',    unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss60', legacyKey: 'm60', label: 'BSS 60', unit: '%', placeholder: '5.8', colClass: 'min-w-[130px]' },
];

// Pre-configured sampling time slots based on laboratory schedule (1 Hour Once frequency)
const DEFAULT_ROWS = [
  { id: 'r1',  time: '09:30', bss10: '0.1', bss30: '1.8', m30: '4.0', bss60: '5.8', p10: '0.1', p30: '1.8', p60: '4.0', m60: '5.8', isDefault: true },
  { id: 'r2',  time: '10:30', bss10: '0.1', bss30: '1.7', m30: '4.1', bss60: '5.7', p10: '0.1', p30: '1.7', p60: '4.1', m60: '5.7', isDefault: true },
  { id: 'r3',  time: '11:30', bss10: '0.1', bss30: '1.9', m30: '4.0', bss60: '5.9', p10: '0.1', p30: '1.9', p60: '4.0', m60: '5.9', isDefault: true },
  { id: 'r4',  time: '14:30', bss10: '0.1', bss30: '1.6', m30: '4.2', bss60: '5.6', p10: '0.1', p30: '1.6', p60: '4.2', m60: '5.6', isDefault: true },
  { id: 'r5',  time: '16:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r6',  time: '18:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r7',  time: '20:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r8',  time: '22:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r9',  time: '00:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r10', time: '02:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r11', time: '04:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
  { id: 'r12', time: '06:30', bss10: '',    bss30: '',    m30: '',    bss60: '',    p10: '',    p30: '',    p60: '',    m60: '',    isDefault: true },
];

const buildEmptyRows = () =>
  DEFAULT_ROWS.map((r) => ({
    ...r,
    bss10: '', bss30: '', m30: '', bss60: '',
    p10: '', p30: '', p60: '', m60: '',
  }));

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

const LSABaggingSieveAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date] = useState(() => getTodayAsiaKolkata());
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [initialRows, setInitialRows] = useState(DEFAULT_ROWS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recordId, setRecordId] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [, setEditAuditHistory] = useState([]);
  const [emailDelivery, setEmailDelivery] = useState(null);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ── Fetch today's persisted data on mount ──
  const fetchPersistedData = useCallback(async (selectedDate) => {
    try {
      setLoading(true);
      const res = await api.get(`/api/lsa-bagging-sieve?date=${selectedDate}`);
      const payload = res.data?.record || (Array.isArray(res.data?.data) && res.data.data[0]) || null;

      if (payload && Array.isArray(payload.rows) && payload.rows.length > 0) {
        setRecordId(res.data?.recordId || payload.id || null);
        setEditedFields(payload.editedFields || res.data?.editedFields || {});
        setEditAuditHistory(payload.editAuditHistory || res.data?.editAuditHistory || []);

        if (res.data?.emailStatus || payload.emailStatus) {
          setEmailDelivery({
            status: res.data?.emailStatus || payload.emailStatus,
            recipient: res.data?.emailRecipient || payload.emailRecipient || res.data?.assignedOperatorEmail || 'sa_operator@tfl.com',
            message: payload.emailMessage || '',
          });
        }

        // Merge saved rows with template
        const savedRows = payload.rows;
        const merged = DEFAULT_ROWS.map((defRow) => {
          const found = savedRows.find((s) => s.time === defRow.time);
          if (found) {
            return {
              ...defRow,
              ...found,
              id: defRow.id,
              isDefault: true,
            };
          }
          return { ...defRow };
        });

        // Add custom rows not in DEFAULT_ROWS
        const customRows = savedRows.filter((s) => !DEFAULT_ROWS.some((d) => d.time === s.time));
        customRows.forEach((cRow, idx) => {
          merged.push({
            ...cRow,
            id: cRow.id || `custom_r_${idx}_${cRow.time}`,
            isDefault: false,
          });
        });

        setRows(merged);
        setInitialRows(JSON.parse(JSON.stringify(merged)));
      } else {
        setRows(DEFAULT_ROWS);
        setInitialRows(JSON.parse(JSON.stringify(DEFAULT_ROWS)));
        setRecordId(null);
        setEditedFields({});
        setEditAuditHistory([]);
        setEmailDelivery(null);
      }
    } catch (err) {
      console.warn('[LSABaggingSieve] Fetch note:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersistedData(date);
  }, [date, fetchPersistedData]);

  // ── Cell Value Change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        const paramDef = PARAMETERS.find((p) => p.key === field || p.legacyKey === field);
        if (paramDef) {
          updated[paramDef.key] = value;
          updated[paramDef.legacyKey] = value;
        }
        return updated;
      })
    );

    if (errors[`${id}_${field}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${id}_${field}`];
        return next;
      });
    }
  }, [errors]);

  // ── Add Row ──
  const handleAddRow = () => {
    const nextId = `r_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setRows((prev) => [
      ...prev,
      {
        id: nextId,
        time: '',
        bss10: '', bss30: '', m30: '', bss60: '',
        p10: '', p30: '', p60: '', m60: '',
        isDefault: false,
      },
    ]);
  };

  // ── Delete Row ──
  const handleDeleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Reset ──
  const handleReset = () => {
    setRows(buildEmptyRows());
    setErrors({});
    showToast('LSA Bagging Sieve form cleared.', 'info');
  };

  // ── Validation ──
  const validate = () => {
    let hasError = false;
    const newErrors = {};

    // Validate duplicate sampling times
    const seenTimes = new Set();
    rows.forEach((r) => {
      if (r.time && r.time.trim() !== '') {
        const t = r.time.trim();
        if (seenTimes.has(t)) {
          showToast(`Duplicate sampling time "${t}". Each time slot must have a unique sampling time.`, 'error');
          newErrors[`${r.id}_time`] = 'Duplicate';
          hasError = true;
        }
        seenTimes.add(t);
      }
    });

    // Validate numeric decimal entries
    rows.forEach((r) => {
      PARAMETERS.forEach((p) => {
        const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.id}_${p.key}`] = 'Invalid';
          hasError = true;
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // ── Open Save Confirmation Modal ──
  const handleInitiateSave = () => {
    if (!validate()) {
      showToast('Please fix validation errors before saving.', 'error');
      return;
    }

    const hasValues = rows.some((r) =>
      PARAMETERS.some((p) => {
        const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
        return val !== '' && val !== null && val !== undefined;
      })
    );

    if (!hasValues) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    setShowConfirmModal(true);
  };

  // ── Execute Save to MongoDB & Email Workflow ──
  const executeSave = async () => {
    setSaving(true);

    const payload = {
      date,
      plant: 'SA',
      unit: 'LSA Bagging Sieve',
      analysisType: 'LSA Bagging Sieve Analysis',
      submittedBy: user?.name || 'Plant Operator',
      rows: rows.filter((r) => {
        return r.time || PARAMETERS.some((p) => {
          const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
          return val !== '' && val !== null && val !== undefined;
        });
      }),
    };

    try {
      const response = await api.post('/api/lsa-bagging-sieve', payload);
      const resData = response.data;

      if (resData.recordId) {
        setRecordId(resData.recordId);
      }
      if (resData.editedFields) {
        setEditedFields(resData.editedFields);
      }

      setEmailDelivery({
        status: resData.emailDeliveryStatus || resData.emailStatus || 'pending',
        recipient: resData.emailRecipient || 'sa_operator@tfl.com',
        message: resData.message || '',
      });

      setInitialRows(JSON.parse(JSON.stringify(rows)));
      showToast(resData.message || 'LSA Bagging Sieve Analysis data saved successfully!', 'success');
      setShowConfirmModal(false);
    } catch (err) {
      console.error('[LSABaggingSieve] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
      setShowConfirmModal(false);
    }
  };

  // ── Decoupled Email Retry ──
  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast('Cannot retry email: No persisted record ID available yet. Please save first.', 'warning');
      return;
    }

    setRetryingEmail(true);
    try {
      const res = await api.post(`/api/lsa-bagging-sieve/${recordId}/retry-email`);
      if (res.data?.success) {
        setEmailDelivery({
          status: res.data?.emailDeliveryStatus || 'sent',
          recipient: res.data?.emailRecipient || res.data?.recipient || 'sa_operator@tfl.com',
          message: res.data?.message || '',
        });
        showToast(res.data?.message || 'Notification email re-sent successfully!', 'success');
      } else {
        showToast('Email retry failed: ' + (res.data?.message || 'Delivery error'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      showToast('Email retry failed: ' + msg, 'error');
    } finally {
      setRetryingEmail(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header matching TK 203 theme ────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Title */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">LSA Bagging Sieve</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                LSA BAGGING SIEVE ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Locked Today's Date in Asia/Kolkata timezone */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="lsa-sieve-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Date:</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="lsa-sieve-date-input"
                  type="date"
                  value={date}
                  readOnly
                  disabled
                  title="Date is locked to current date (Asia/Kolkata timezone)"
                  className="pl-7 pr-2 py-1 text-xs font-semibold border rounded-md text-slate-700 bg-slate-100 border-slate-300 cursor-not-allowed opacity-90"
                />
              </div>
              {date && (
                <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
                  {formatDateDisplay(date)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleAddRow}
                id="btn-add-sieve-row"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 text-blue-700 bg-blue-50/80 hover:bg-blue-100 transition shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>Add Time Slot</span>
              </button>

              <button
                id="btn-lsa-sieve-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                id="btn-lsa-sieve-save"
                onClick={handleInitiateSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
                title="Save LSA Bagging Sieve data"
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
      </div>

      {/* ── Email Notification Status Banner ─────────────────────────────────── */}
      {emailDelivery && (
        <div
          id="lsa-sieve-notification-banner"
          className={`flex items-center justify-between p-3.5 rounded-xl border shadow-xs animate-fadeIn ${
            emailDelivery.status === 'sent'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : emailDelivery.status === 'failed'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs">
            {emailDelivery.status === 'sent' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : emailDelivery.status === 'failed' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Mail className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <div>
              <span className="font-extrabold uppercase tracking-wide">
                {emailDelivery.status === 'sent'
                  ? 'Saved — Email Sent'
                  : 'Saved — Email Failed'}
              </span>
              <span className="mx-1.5 text-slate-400">|</span>
              <span>Recipient: <strong>{emailDelivery.recipient || 'sa_operator@tfl.com'}</strong></span>
              {emailDelivery.message && (
                <div className="text-[11px] opacity-90 mt-0.5">{emailDelivery.message}</div>
              )}
            </div>
          </div>

          {emailDelivery.status === 'failed' && (
            <button
              id="btn-retry-sieve-email"
              onClick={handleRetryEmail}
              disabled={retryingEmail}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-bold transition shadow-xs disabled:opacity-60 cursor-pointer shrink-0 ml-4"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryingEmail ? 'animate-spin' : ''}`} />
              <span>{retryingEmail ? 'Retrying...' : 'Retry Email'}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Main Data Table starting from the Left Side ─────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading LSA Bagging Sieve Analysis records...</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-sm border-collapse min-w-[700px]" id="lsa-sieve-table">
              {/* Header with Dark Navy styling */}
              <thead className="sticky top-0 z-10 select-none shadow-sm">
                <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white">
                  <th className="px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-14 bg-slate-950 text-slate-100 border-r border-slate-800">
                    #
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800">
                    Time
                  </th>
                  {PARAMETERS.map((p, idx) => {
                    const limit = getCellLimit(plantId, 'lsa-bagging-sieve', 'hourly', p.key);
                    return (
                      <th
                        key={p.key}
                        className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 border-r border-slate-800/50 ${
                          idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                        } ${p.colClass}`}
                      >
                        <div className="font-extrabold text-sm">{p.label}</div>
                        <div className="text-[10px] font-semibold text-slate-400 mt-0.5">{p.unit}</div>
                        {limit ? (
                          <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-blue-900/60 border border-blue-400/40 text-[9.5px] font-bold text-blue-200">
                            {limit.formattedRange}
                          </div>
                        ) : (
                          <div className="mt-1 inline-block px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500">
                            —
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-16 bg-slate-950 text-slate-100">
                    Action
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, index) => {
                  const hasVal = PARAMETERS.some((p) => {
                    const val = row[p.key] !== undefined && row[p.key] !== '' ? row[p.key] : row[p.legacyKey];
                    return val !== '' && val !== null && val !== undefined;
                  });

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors duration-100 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      } ${hasVal ? 'hover:bg-blue-50/40' : 'hover:bg-slate-100/60'}`}
                    >
                      {/* Index */}
                      <td className="px-3 py-2 text-center text-xs font-mono font-bold text-slate-400 border-r border-slate-100">
                        {index + 1}
                      </td>

                      {/* Time Input / Slot */}
                      <td className="px-4 py-2 border-r border-slate-100">
                        <input
                          type="text"
                          value={row.time}
                          placeholder="HH:MM"
                          onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                          className="w-full max-w-[110px] px-2.5 py-1 text-xs font-mono font-bold text-center text-slate-800 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none transition"
                          id={`sieve-time-${index}`}
                        />
                      </td>

                      {/* Parameter inputs with real-time validation and EDITED badges */}
                      {PARAMETERS.map((param) => {
                        const cellVal = row[param.key] !== undefined && row[param.key] !== '' ? row[param.key] : (row[param.legacyKey] !== undefined ? row[param.legacyKey] : '');
                        const limit = getCellLimit(plantId, 'lsa-bagging-sieve', 'hourly', param.key);
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const err = errors[`${row.id}_${param.key}`] || errors[`${row.id}_${param.legacyKey}`];

                        // Field-level EDITED badge logic: check if persisted value changed
                        const isEditedInDB =
                          editedFields?.[row.id]?.[param.key] ||
                          editedFields?.[row.time]?.[param.key] ||
                          editedFields?.[row.id]?.[param.legacyKey] ||
                          editedFields?.[row.time]?.[param.legacyKey];

                        // In-session edit against initial row
                        const initRow = initialRows.find((ir) => ir.id === row.id || ir.time === row.time);
                        const initVal = initRow ? (initRow[param.key] !== undefined ? initRow[param.key] : initRow[param.legacyKey]) : '';
                        const isLocallyModified = initVal !== undefined && initVal !== null && initVal !== '' && String(initVal) !== String(cellVal);

                        const showEditedBadge = Boolean(isEditedInDB || isLocallyModified);

                        return (
                          <td key={param.key} className="px-3 py-2.5 text-center align-top">
                            <div className="flex flex-col items-center justify-start min-h-[58px]">
                              <div className="relative inline-block w-full max-w-[105px]">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={cellVal}
                                  placeholder={param.placeholder}
                                  onChange={(e) =>
                                    handleCellChange(row.id, param.key, e.target.value)
                                  }
                                  title={
                                    limit
                                      ? isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} % (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} % (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                      : `${param.label}`
                                  }
                                  className={`w-full max-w-[105px] mx-auto text-center text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                    isOutOfLimit
                                      ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                      : err
                                      ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                      : hasValue && isNormal && limit
                                      ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                      : cellVal !== ''
                                      ? 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-950 font-black'
                                      : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800'
                                  }`}
                                  id={`sieve-input-${index}-${param.key}`}
                                  aria-label={`${row.time} ${param.label}`}
                                />
                                {isOutOfLimit && (
                                  <span
                                    className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                    title="Out of limit"
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-white" />
                                  </span>
                                )}
                              </div>

                              {/* EDITED badge */}
                              {showEditedBadge && (
                                <div className="mt-1">
                                  <span
                                    id={`sieve-edited-badge-${row.id}-${param.key}`}
                                    className="inline-flex items-center px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-fadeIn"
                                    title="Value was modified after initial save"
                                  >
                                    EDITED
                                  </span>
                                </div>
                              )}

                              {/* Status & Limit Display */}
                              {err ? (
                                <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                  <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                  <span>Invalid</span>
                                </div>
                              ) : limit ? (
                                <div className="mt-1 flex flex-col items-center justify-center">
                                  {hasValue && isOutOfLimit && (
                                    <div
                                      id={`sieve-limit-badge-${row.id}-${param.key}`}
                                      className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                      title={`OUT OF LIMIT: ${cellVal} % (Valid range: ${limit.formattedRange})`}
                                    >
                                      <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                      <span>OUT OF LIMIT</span>
                                    </div>
                                  )}
                                  {hasValue && isNormal && (
                                    <div
                                      id={`sieve-status-${row.id}-${param.key}`}
                                      className="text-[9px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                      title={`NORMAL: within ${limit.formattedRange}`}
                                    >
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                      <span>NORMAL</span>
                                    </div>
                                  )}
                                  <span
                                    id={`sieve-range-${row.id}-${param.key}`}
                                    className={`text-[9.5px] font-medium tracking-tight whitespace-nowrap ${
                                      isOutOfLimit
                                        ? 'text-rose-700 font-bold'
                                        : hasValue && isNormal
                                        ? 'text-emerald-700/80 font-semibold'
                                        : 'text-slate-400'
                                    }`}
                                    title={`Valid range: ${limit.formattedRange}`}
                                  >
                                    {limit.formattedRange}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}

                      {/* Action */}
                      <td className="px-2 py-2 text-center">
                        {!row.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete slot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom helper bar */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Frequency: <strong>1 Hour Once</strong> &bull; Parameters: <strong>BSS 10</strong>, <strong>BSS 30</strong> (1.5% – 2.0%), <strong>-30</strong>, <strong>BSS 60</strong> (5.5% – 6.0%). Numeric decimal values only.
          </p>
        </div>
      </div>

      {/* ── Save Confirmation Modal ─────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Confirm Analysis Submission
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  SA Plant &bull; LSA Bagging Sieve Analysis
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-2">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Analysis Date:</span>
                <span className="font-bold text-slate-900">{formatDateDisplay(date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Sampling Time Slots:</span>
                <span className="font-bold text-slate-900">
                  {rows.filter((r) => r.time).length} slots
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Assigned Recipient:</span>
                <span className="font-bold text-blue-700">sa_operator@tfl.com</span>
              </div>
              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                Data will be persisted to MongoDB Atlas and an automated report email will be dispatched to the registered SA Plant operator.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-save-sieve"
                onClick={executeSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : 'Confirm & Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LSABaggingSieveAnalysisPage;
