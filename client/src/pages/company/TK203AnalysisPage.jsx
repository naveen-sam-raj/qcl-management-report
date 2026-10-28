import React, { useState, useCallback, useEffect } from 'react';
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
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Factory,
  Database,
  Lock,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'co2',  label: 'CO₂',  unit: '',       colClass: 'min-w-[110px]' },
];

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];

const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't09', time: '09:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't13', time: '13:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't17', time: '17:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't21', time: '21:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't01', time: '01:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't05', time: '05:00', shift: 'III Shift', shiftId: 'shift3' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    TIME_SLOTS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

/**
 * Exact operating date in Asia/Kolkata timezone with 06:00-06:00 IST cycle (hourCycle h23)
 * A timestamp between 00:00:00 and 05:59:59 IST belongs to the previous calendar day.
 */
export const getOperatingDateIST = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const y = parseInt(parts.find((p) => p.type === 'year')?.value, 10);
  const m = parseInt(parts.find((p) => p.type === 'month')?.value, 10);
  const d = parseInt(parts.find((p) => p.type === 'day')?.value, 10);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value, 10);

  let targetYear = y;
  let targetMonth = m;
  let targetDay = d;

  if (hour < 6) {
    const prevDay = new Date(Date.UTC(y, m - 1, d - 1));
    targetYear = prevDay.getUTCFullYear();
    targetMonth = prevDay.getUTCMonth() + 1;
    targetDay = prevDay.getUTCDate();
  }

  const mm = String(targetMonth).padStart(2, '0');
  const dd = String(targetDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
};

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

// ─── Row styles by Shift grouping ─────────────────────────────────────────────

const getRowStyles = (shiftId) => {
  if (shiftId === 'shift1') {
    return {
      row:        'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
      badge:      'bg-blue-100 text-blue-800 border border-blue-200',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (shiftId === 'shift2') {
    return {
      row:        'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
      badge:      'bg-indigo-100 text-indigo-800 border border-indigo-200',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  return {
    row:        'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badge:      'bg-purple-100 text-purple-800 border border-purple-200',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const TK203AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── State (Date strictly restricted to current Operating Date in Asia/Kolkata) ──
  const [date]                                      = useState(() => getOperatingDateIST());
  const [data, setData]                             = useState(buildEmptyData());
  const [originalData, setOriginalData]             = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle');
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lockedSlots, setLockedSlots]               = useState({});
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});
  const [editAuditHistory, setEditAuditHistory]     = useState([]);

  // Confirmation modal state for correction save
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  /**
   * Slot-level lock state derivation:
   * Returns: 'locked' | 'open' | 'waiting'
   * - Does NOT store isOpen; strictly derived from data.lockedSlots
   * - Fresh date (no saved slots): only t07 is 'open'; t09..t05 are 'waiting'
   * - A slot is 'locked' if slot.isLocked/correctionUsed is true OR any successor slot isSaved
   * - A slot is 'open' if it's not locked AND its predecessor is saved (or index === 0)
   * - Otherwise, it is 'waiting'
   */
  const getSlotStatus = useCallback((slotKey) => {
    const index = UNITS_ORDER.indexOf(slotKey);
    if (index === -1) return 'locked';

    const slot = lockedSlots[slotKey] || {};

    // 1. Direct permanent lock on this slot
    if (slot.isLocked || slot.correctionUsed) {
      return 'locked';
    }

    // 2. Any successor slot saved permanently locks all predecessor slots
    for (let i = index + 1; i < UNITS_ORDER.length; i++) {
      const nextKey = UNITS_ORDER[i];
      if (lockedSlots[nextKey]?.isSaved) {
        return 'locked';
      }
    }

    // 3. First slot (t07) is open if not locked
    if (index === 0) {
      return 'open';
    }

    // 4. Preceding slot must be saved for this slot to open
    const prevKey = UNITS_ORDER[index - 1];
    const isPrevSaved = Boolean(lockedSlots[prevKey]?.isSaved);
    if (isPrevSaved) {
      return 'open';
    }

    // 5. Otherwise waiting for predecessor
    return 'waiting';
  }, [lockedSlots]);

  const isSlotDisabled = useCallback((slotKey) => {
    if (isViewOnly) return true;
    return getSlotStatus(slotKey) !== 'open';
  }, [isViewOnly, getSlotStatus]);

  const allSlotsLocked = UNITS_ORDER.every((k) => getSlotStatus(k) === 'locked');

  // Fetch existing data for current date
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/tk-203-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }

        if (response.data && response.data.success) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }

          const fetchedRows = record?.rows || record?.data?.rows || record?.readings;
          if (fetchedRows && typeof fetchedRows === 'object') {
            const populated = buildEmptyData();
            TIME_SLOTS.forEach((slot) => {
              if (fetchedRows[slot.key]) {
                PARAMETERS.forEach((p) => {
                  const val = fetchedRows[slot.key][p.key];
                  populated[slot.key][p.key] = val !== null && val !== undefined ? String(val) : '';
                });
              }
            });
            setData(populated);
            setOriginalData(JSON.parse(JSON.stringify(populated)));
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
          }

          // Hydrate lock state and audit
          const resLockedSlots = response.data.lockedSlots || record?.lockedSlots || record?.data?.lockedSlots || {};
          const resLockedShifts = response.data.lockedShifts || record?.lockedShifts || record?.data?.lockedShifts || {};
          const resEditedFields = response.data.editedFields || record?.editedFields || record?.data?.editedFields || {};
          const resAudit = response.data.editAuditHistory || record?.editAuditHistory || record?.data?.editAuditHistory || [];

          setLockedSlots(resLockedSlots);
          setLockedShifts(resLockedShifts);
          setEditedFields(resEditedFields);
          setEditAuditHistory(resAudit);
        } else {
          setData(buildEmptyData());
          setOriginalData(null);
          setLockedSlots({});
          setLockedShifts({});
          setEditedFields({});
          setEditAuditHistory([]);
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setLockedSlots({});
        setLockedShifts({});
        setEditedFields({});
        setEditAuditHistory([]);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  const visibleRows = TIME_SLOTS;

  // ── Real-time input change ──
  const handleChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isSlotDisabled(rowKey)) return;

    setData((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [paramKey]: value },
    }));

    // Clear cell error if any
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });

    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isSlotDisabled]);

  const handleReset = () => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    setSavePhase('idle');
    showToast('TK 203 analysis form reset.', 'info');
  };

  // Full dataset validation before save
  const validate = () => {
    let hasError = false;
    const newErrors = {};

    TIME_SLOTS.forEach((r) => {
      PARAMETERS.forEach((p) => {
        const val = data[r.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.key}_${p.key}`] = 'Numbers only';
          hasError = true;
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // Check if a slot differs from originalData
  const isSlotModified = (slotKey) => {
    const oldRow = originalData ? originalData[slotKey] : null;
    const newRow = data[slotKey];
    return PARAMETERS.some((p) => {
      let oldVal = oldRow?.[p.key] ?? null;
      let newVal = newRow?.[p.key] ?? null;
      if (newVal === '') newVal = null;
      if (oldVal === '') oldVal = null;
      if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
        return Number(oldVal) !== Number(newVal);
      }
      return String(oldVal ?? '') !== String(newVal ?? '');
    });
  };

  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validate()) {
      showToast('Please correct validation errors before saving.', 'error');
      return;
    }

    // Detect which slots have modified values
    const changedSlots = [];
    TIME_SLOTS.forEach((slot) => {
      if (isSlotDisabled(slot.key)) return;
      if (isSlotModified(slot.key)) {
        changedSlots.push(slot.key);
      }
    });

    if (changedSlots.length === 0) {
      showToast('No changes', 'info');
      return;
    }

    if (changedSlots.length > 1) {
      showToast(`Only one slot may be entered or edited per save. Detected changes in: ${changedSlots.join(', ')}`, 'warning');
      return;
    }

    const targetSlotKey = changedSlots[0];
    const targetSlotObj = TIME_SLOTS.find((s) => s.key === targetSlotKey);
    const isCorrection = Boolean(lockedSlots[targetSlotKey]?.isSaved && !lockedSlots[targetSlotKey]?.isLocked);

    // If slot is already saved and not locked, this is a correction save -> show confirm modal
    if (isCorrection) {
      setConfirmData({
        date,
        slotKey: targetSlotKey,
        slotObj: targetSlotObj,
        isCorrection: true,
      });
      setShowConfirmModal(true);
      return;
    }

    // First save for this slot: save directly
    executeSave(targetSlotKey);
  };

  const executeSave = async (targetSlotKey) => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);
    setShowConfirmModal(false);

    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL',
      analysisType: 'TK 203 Analysis',
      tank: 'TK 203',
      submittedBy: user?.name || 'Plant Operator',
      rows: Object.fromEntries(
        TIME_SLOTS.map((r) => [
          r.key,
          Object.fromEntries(
            PARAMETERS.map((p) => {
              const val = data[r.key]?.[p.key];
              return [p.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
            })
          ),
        ])
      ),
    };

    try {
      const response = await api.post('/api/tk-203-analysis', payload);

      // 200 noChange -> toast "No changes"
      if (response.data?.noChange) {
        showToast('No changes', 'info');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      if (!response.data?.success) {
        showToast(response.data?.message || 'Unable to save TK 203 data. Please try again.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setSaveSuccess(true);
      setSavePhase('completed');
      showToast(response.data?.message || `Successfully saved ${targetSlotKey} ✓`, 'success');

      // Hydrate state from save response data
      const responseData = response.data?.data || {};
      if (response.data?.recordId || response.data?.data?._id) {
        setRecordId(response.data.recordId || response.data.data?._id);
      }
      if (responseData.lockedSlots) {
        setLockedSlots(responseData.lockedSlots);
      }
      if (responseData.lockedShifts) {
        setLockedShifts(responseData.lockedShifts);
      }
      if (responseData.editedFields) {
        setEditedFields(responseData.editedFields);
      }
      if (responseData.editAuditHistory) {
        setEditAuditHistory(responseData.editAuditHistory);
      }
      if (responseData.rows) {
        const synced = buildEmptyData();
        TIME_SLOTS.forEach((slot) => {
          if (responseData.rows[slot.key]) {
            PARAMETERS.forEach((p) => {
              const val = responseData.rows[slot.key][p.key];
              synced[slot.key][p.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setData(synced);
        setOriginalData(JSON.parse(JSON.stringify(synced)));
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      console.error('[TK203Analysis] Save failed:', err);
      // 400 / 409 -> show exact server message
      const serverMessage = err.response?.data?.message || err.message || 'Error saving TK 203 analysis';
      showToast(serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast('Cannot retry email: Record ID is not available.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post(`/api/tk-203-analysis/${recordId}/retry-email`);
      if (response.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Email sent successfully on retry.');
        showToast('Email resent successfully!', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data?.emailError || 'Email delivery failed on retry.');
        showToast('Email retry failed: ' + (response.data?.emailError || 'Rejected by server'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.emailError || err.response?.data?.message || err.message;
      setSavePhase('email_failed');
      setEmailStatusDetail(msg);
      showToast('Retry Email Error: ' + msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header with Operating Date ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Back + Title */}
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
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">TK 203</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  TK 203
                </h1>
                <span className="text-[11px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">
                  SHIFT TWICE
                </span>
              </div>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Operating Date (06:00-06:00 IST) */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 shadow-2xs select-none"
              title="Operating Date (06:00-06:00 IST)"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
                <span id="tk203-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
                  {formatDateDisplay(date)}
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 uppercase tracking-wider ml-0.5">
                  Operating Day
                </span>
              </div>
            </div>

            {/* Actions for Admin: Main button text always "Save" via alwaysShowSaveText */}
            {!isViewOnly ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-tk203-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Reset modified fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <StatusSaveButton
                  id="btn-tk203-save"
                  saving={saving}
                  savePhase={savePhase}
                  saveSuccess={saveSuccess}
                  onClick={handleSaveClick}
                  alwaysShowSaveText={true}
                  disabled={allSlotsLocked}
                  title={allSlotsLocked ? 'All slots are locked for this date' : 'Save TK 203 slot data'}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Read-Only View</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner (Truthful Persistence Result) ────────────────────── */}
      <SaveStatusBanner
        id="tk203-success-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="TK 203 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-40 sm:w-48 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Time / Shift / Status
                </th>
                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${p.colClass}`}
                  >
                    <span>{p.label}</span> {p.unit && <span className="text-[10px] text-blue-300 font-semibold lowercase">({p.unit})</span>}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {visibleRows.map((row) => {
                const styles = getRowStyles(row.shiftId);
                const status = getSlotStatus(row.key);
                const isDisabled = isSlotDisabled(row.key);
                const slotSaved = Boolean(lockedSlots[row.key]?.isSaved);

                return (
                  <tr
                    key={row.key}
                    className={`transition-colors duration-100 ${
                      status === 'locked' ? 'bg-slate-50/80 opacity-90' : styles.row
                    }`}
                  >
                    {/* Time slot & Shift & Slot Lock Status Badge */}
                    <td className="px-5 py-2.5 align-top">
                      <div className="flex flex-col gap-1.5 mt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                            {row.time}
                          </span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}>
                            {row.shift}
                          </span>
                        </div>
                        {/* Slot-level lock state indicator */}
                        <div className="flex items-center gap-1">
                          {status === 'locked' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap bg-slate-200 text-slate-700 inline-flex items-center gap-1 shadow-2xs">
                              <Lock className="w-2.5 h-2.5 text-slate-500" /> LOCKED
                            </span>
                          )}
                          {status === 'open' && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap shadow-2xs ${
                              slotSaved
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}>
                              {slotSaved ? 'EDITABLE' : 'OPEN'}
                            </span>
                          )}
                          {status === 'waiting' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs">
                              WAITING
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Parameter input cells */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const isFormatError = !!errors[fieldKey];
                      const formatErrorMessage = errors[fieldKey];

                      const limit = getCellLimit(plantId, 'tk203', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      const isEdited = Boolean(
                        editedFields && (editedFields[fieldKey] || (editedFields.get && editedFields.get(fieldKey)))
                      );

                      return (
                        <td key={param.key} className="px-4 py-2.5 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative w-full max-w-[115px]">
                              <input
                                id={`tk203-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                readOnly={isDisabled}
                                disabled={isDisabled}
                                value={cellVal}
                                onChange={(e) =>
                                  !isViewOnly && handleChange(row.key, param.key, e.target.value)
                                }
                                placeholder={isDisabled ? '—' : '0.00'}
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} ${limit.unit} (Allowed range: ${limit.formattedRange}, Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                                      : hasValue
                                      ? `Normal: ${cellVal} ${limit.unit} (Allowed range: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange} (Target: ${limit.formattedTarget} ${limit.formattedTolerance})`
                                    : ''
                                }
                                className={`w-full max-w-[115px] mx-auto text-center text-sm font-mono font-bold px-3 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isDisabled
                                    ? 'bg-slate-100/90 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                                    : isOutOfLimit
                                    ? 'border-rose-400 bg-rose-50/70 text-rose-950 focus:border-rose-600 focus:ring-2 focus:ring-rose-200 hover:border-rose-400'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950'
                                    : styles.inputFocus
                                }`}
                              />

                              {/* Persistent Edited Badge */}
                              {isEdited && (
                                <div
                                  className="absolute -top-2 -right-2 z-10 px-1 py-0.2 bg-amber-500 text-white text-[8px] font-black rounded uppercase tracking-wider shadow-2xs"
                                  title="This parameter was modified and saved"
                                >
                                  Edited
                                </div>
                              )}
                            </div>

                            {/* Error Message if invalid format */}
                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span className="whitespace-nowrap">{formatErrorMessage}</span>
                              </div>
                            )}

                            {/* Show allowed range badge when value is out of limit */}
                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`tk203-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.formattedRange}`}
                              >
                                <span>Limit: {limit.formattedRange}</span>
                              </div>
                            )}

                            {/* Normal indicator when within limit */}
                            {!isFormatError && !isOutOfLimit && limit && hasValue && (
                              <span
                                className="text-[9.5px] text-emerald-600 font-bold mt-1 tracking-tight flex items-center gap-0.5 animate-fadeIn"
                                title={`Value within normal range (${limit.formattedRange})`}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" /> Normal
                              </span>
                            )}

                            {/* Subtle target hint when field is empty and not disabled */}
                            {!isFormatError && !isOutOfLimit && limit && !hasValue && !isDisabled && (
                              <span
                                className="text-[10px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Target: ${limit.formattedTarget} ${limit.formattedTolerance}`}
                              >
                                {limit.formattedRange}
                              </span>
                            )}
                          </div>
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
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Values for <strong>TK 203</strong>. Frequency: <strong>SHIFT TWICE</strong>. Unit: <strong>Kgm/m³</strong>.
          </p>
        </div>
      </div>

      {/* ── Confirmation Modal for Correction Save ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-800">
                  Confirm Slot Correction
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 transition text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-sm font-semibold mb-4 shadow-2xs flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-amber-900 text-sm">
                    This is your only correction for this slot.
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    Once saved, slot <strong>{confirmData.slotObj?.time} ({confirmData.slotObj?.shift})</strong> will be permanently locked and cannot be modified again.
                  </p>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs text-slate-700">
                <div className="font-bold text-slate-900 mb-1">Proposed Values for {confirmData.slotObj?.time}:</div>
                {PARAMETERS.map((p) => (
                  <div key={p.key} className="flex justify-between border-b border-slate-200/50 pb-1 last:border-0">
                    <span className="font-medium text-slate-600">{p.label}:</span>
                    <span className="font-mono font-bold text-slate-900">{data[confirmData.slotKey]?.[p.key] || '—'} {p.unit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSave(confirmData.slotKey)}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-75 cursor-pointer shadow-2xs"
              >
                {saving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Saving...
                  </>
                ) : (
                  <>Confirm & Save Correction</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TK203AnalysisPage;
