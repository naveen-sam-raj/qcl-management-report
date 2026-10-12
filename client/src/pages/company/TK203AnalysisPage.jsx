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
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Factory,
  Database,
  Lock,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'co2',  label: 'CO₂',  unit: '',       colClass: 'min-w-[110px]' },
];

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

const SHIFT_MAPPING = [
  { key: 'shift1', name: 'I SHIFT',   slotKeys: ['t07', 't09', 't11', 't13'] },
  { key: 'shift2', name: 'II SHIFT',  slotKeys: ['t15', 't17', 't19', 't21'] },
  { key: 'shift3', name: 'III SHIFT', slotKeys: ['t23', 't01', 't03', 't05'] },
];

const buildEmptyData = () =>
  Object.fromEntries(
    TIME_SLOTS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

// Helper for exact date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayAsiaKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
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

// ─── Row styles by Shift ──────────────────────────────────────────────────────

const getRowStyles = (shiftId) => {
  if (shiftId === 'shift1') {
    return {
      row:        'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
      label:      'text-blue-950 font-extrabold tracking-tight',
      badge:      'bg-blue-100 text-blue-800 border border-blue-200',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (shiftId === 'shift2') {
    return {
      row:        'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
      label:      'text-indigo-950 font-extrabold tracking-tight',
      badge:      'bg-indigo-100 text-indigo-800 border border-indigo-200',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  return {
    row:        'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    label:      'text-purple-950 font-extrabold tracking-tight',
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

  // ── State (Date strictly restricted to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [data, setData]                             = useState(buildEmptyData());
  const [originalData, setOriginalData]             = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving' | 'email_pending' | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Sequential Shift Workflow:
  // - On initial load: I SHIFT is editable; II SHIFT & III SHIFT are waiting/disabled.
  // - After I SHIFT save: I SHIFT remains editable until II SHIFT is saved; II SHIFT becomes available.
  // - After II SHIFT save: I SHIFT is permanently locked; II SHIFT remains editable until III SHIFT is saved; III SHIFT becomes available.
  // - After III SHIFT initial save: II SHIFT is permanently locked; exactly 1 final edit allowed for III SHIFT.
  // - After III SHIFT final edit: all 3 shifts permanently locked for that date.
  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 'shift1') {
      return Boolean(lockedShifts.shift1) || Boolean(lockedShifts.shift2Saved);
    }
    if (shiftKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2) || Boolean(lockedShifts.shift3Saved);
    }
    if (shiftKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  // Fetch existing data for current date
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/tk-203-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        if (response.data?.emailStatus) {
          if (response.data.emailStatus === 'sent') setSavePhase('completed');
          else if (response.data.emailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('email_pending');
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }

          if (record) {
            const fetchedRows = record.rows || record.shifts || record.readings || record.data?.rows || record.data;
            if (fetchedRows && typeof fetchedRows === 'object') {
              // Merge fetched rows with clean default structure
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

            setLockedShifts(record.lockedShifts || record.data?.lockedShifts || {});
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
          }
        } else {
          setData(buildEmptyData());
          setOriginalData(null);
          setLockedShifts({});
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setLockedShifts({});
        setEditedFields({});
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

    // Find shift of this row
    const slotObj = TIME_SLOTS.find((s) => s.key === rowKey);
    const shiftId = slotObj ? slotObj.shiftId : null;
    if (shiftId && isShiftDisabled(shiftId)) return;

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
  }, [isShiftDisabled]);

  const handleReset = () => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast('TK 203 analysis form reset.', 'info');
  };

  // Full dataset validation before opening confirmation modal
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

  // Check if a row differs from originalData
  const isRowDiff = (oldRow, newRow) => {
    if (!oldRow && newRow) return true;
    if (oldRow && !newRow) return false;
    return PARAMETERS.some((p) => {
      let oldVal = oldRow?.[p.key] ?? null;
      let newVal = newRow?.[p.key] ?? null;
      if (newVal === '') newVal = null;
      if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
        return Number(oldVal) !== Number(newVal);
      }
      return String(oldVal) !== String(newVal);
    });
  };

  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validate()) {
      showToast('Please correct validation errors before saving.', 'error');
      return;
    }

    // Determine which shifts have changed and are editable
    const shiftsToSave = [];
    let isFinalEdit = false;

    SHIFT_MAPPING.forEach((shift) => {
      if (isShiftDisabled(shift.key)) return;

      const hasAnyData = shift.slotKeys.some((sKey) => {
        const row = data[sKey];
        return row && Object.values(row).some((val) => val !== null && val !== '');
      });

      const hasDiff = shift.slotKeys.some((sKey) => {
        const oldRow = originalData ? originalData[sKey] : null;
        const newRow = data[sKey];
        return isRowDiff(oldRow, newRow);
      });

      if (hasAnyData && hasDiff) {
        shiftsToSave.push({
          key: shift.key,
          name: shift.name,
          slotKeys: shift.slotKeys,
        });

        if (shift.key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0) {
          isFinalEdit = true;
        }
      }
    });

    if (shiftsToSave.length === 0) {
      showToast('No new or modified shift data found to save.', 'info');
      return;
    }

    if (shiftsToSave.length > 1) {
      showToast('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    setConfirmData({
      date,
      shift: shiftsToSave[0],
      isFinalEdit,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);

    // Close confirmation modal immediately to prevent modal freeze
    setShowConfirmModal(false);

    const shiftBeingSaved = confirmData?.shift;
    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL',
      analysisType: 'TK 203 Analysis',
      tank: 'TK 203',
      shift: shiftBeingSaved ? shiftBeingSaved.name : 'I SHIFT',
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
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

      if (!response?.data?.success) {
        showToast(response?.data?.message || 'Unable to save TK 203 data. Please try again.', 'error');
        setSavePhase('idle');
        return;
      }

      setSaveSuccess(true);
      const savedDoc = response.data?.data;
      if (savedDoc && (savedDoc._id || savedDoc.id)) {
        setRecordId(savedDoc._id || savedDoc.id);
      }
      if (savedDoc?.lockedShifts) {
        setLockedShifts(savedDoc.lockedShifts);
      }
      if (savedDoc?.editedFields) {
        setEditedFields(savedDoc.editedFields);
      }
      if (savedDoc?.rows) {
        // Sync originalData to persisted rows
        const synced = buildEmptyData();
        TIME_SLOTS.forEach((slot) => {
          if (savedDoc.rows[slot.key]) {
            PARAMETERS.forEach((p) => {
              const val = savedDoc.rows[slot.key][p.key];
              synced[slot.key][p.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setData(synced);
        setOriginalData(JSON.parse(JSON.stringify(synced)));
      }

      if (response.data?.emailRecipient) {
        setRecipientEmail(response.data.emailRecipient);
      }

      const emailRes = response.data?.emailNotification;
      const emailSent = response.data?.emailSent;
      const emailPending = response.data?.emailPending;
      const statusFromApi = response.data?.emailStatus;

      if (emailSent || statusFromApi === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(emailRes?.response || 'Delivered to SMTP server ✓');
        showToast('Saved — Email Sent ✓', 'success');
      } else if (emailPending || statusFromApi === 'pending') {
        setSavePhase('email_pending');
        setEmailStatusDetail('Saved — Email dispatching immediately 🚀');
        showToast('Saved — Email Dispatching 🚀', 'info');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailRes?.error || emailRes?.status || 'Email delivery failed');
        showToast('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('idle');
      console.error('[TK203Analysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast('Save Error: ' + serverMessage, 'error');
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

  // Helper for Shift Status Badges
  const getShiftBadge = (shiftId) => {
    let status = 'NEW';
    let bg = 'bg-indigo-100 text-indigo-700';

    if (lockedShifts[shiftId]) {
      status = 'Locked';
      bg = 'bg-slate-200 text-slate-700';
    } else {
      if (shiftId === 'shift1') {
        if (lockedShifts.shift2Saved) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.shift1Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      } else if (shiftId === 'shift2') {
        if (!lockedShifts.shift1Saved) {
          status = 'Waiting';
          bg = 'bg-amber-100 text-amber-700';
        } else if (lockedShifts.shift3Saved) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.shift2Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      } else if (shiftId === 'shift3') {
        if (!lockedShifts.shift2Saved) {
          status = 'Waiting';
          bg = 'bg-amber-100 text-amber-700';
        } else if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) {
          status = 'Locked';
          bg = 'bg-slate-200 text-slate-700';
        } else if (lockedShifts.shift3Saved) {
          status = 'Editable';
          bg = 'bg-blue-100 text-blue-700';
        }
      }
    }

    return (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap shadow-2xs ${bg}`}>
        {status}
      </span>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header with Restricted Today Date ────────────────────── */}
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
              {/* Breadcrumb */}
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
            {/* Integrated Date Section - Strictly Restricted to Today (Asia/Kolkata) */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 shadow-2xs select-none"
              title="Date selection restricted strictly to current date (Asia/Kolkata)"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
                <span id="tk203-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
                  {formatDateDisplay(date)}
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 uppercase tracking-wider ml-0.5">
                  Today
                </span>
              </div>
            </div>

            {/* Actions for Admin */}
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

                <button
                  id="btn-tk203-save"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs disabled:opacity-75 cursor-pointer ${
                    savePhase === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  title="Save permitted shift data and notify registered user"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : savePhase === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Save className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {savePhase === 'saving'
                      ? 'Saving...'
                      : savePhase === 'completed'
                      ? 'Saved & Emailed ✓'
                      : savePhase === 'email_failed'
                      ? 'Saved — Email Failed'
                      : savePhase === 'email_pending'
                      ? 'Saved — Email Pending'
                      : 'Save / Submit'}
                  </span>
                </button>
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

      {/* ── Status Banner (Success, Pending, or Email Failed) ──────────────── */}
      {saveSuccess && (
        <div
          id="tk203-success-banner"
          className={`flex items-start gap-3 p-3.5 border rounded-xl shadow-xs animate-fadeIn ${
            savePhase === 'email_failed'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : savePhase === 'email_pending'
              ? 'bg-sky-50 border-sky-200 text-sky-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          {savePhase === 'email_failed' ? (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">
                {savePhase === 'email_failed'
                  ? 'Saved — Email Failed ⚠️'
                  : savePhase === 'email_pending'
                  ? 'Saved — Email Pending ⏳'
                  : 'Saved — Email Sent ✓'}
              </span>
              <span className="text-slate-600">
                TK 203 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded in database.
              </span>
            </div>
            {recipientEmail && (
              <div className="text-[11.5px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold">Notification Recipient:</span>
                <span className="font-mono bg-white/70 border px-1.5 py-0.2 rounded font-bold">
                  {recipientEmail}
                </span>
                <span className="text-slate-500">(Registered ACL Plant Operator)</span>
                {emailStatusDetail && (
                  <span className="italic text-slate-600">— {emailStatusDetail}</span>
                )}
              </div>
            )}
          </div>
          {savePhase === 'email_failed' && (
            <button
              onClick={handleRetryEmail}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-200/90 hover:bg-amber-300 rounded border border-amber-400/50 transition cursor-pointer shrink-0 shadow-2xs"
            >
              Retry Email
            </button>
          )}
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-slate-400 hover:text-slate-600 transition text-base leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Analysis Table Card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 sm:w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Time / Shift
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

            {/* Data rows */}
            <tbody className="divide-y divide-slate-200">
              {visibleRows.map((row) => {
                const styles = getRowStyles(row.shiftId);
                const isDisabled = isShiftDisabled(row.shiftId);

                return (
                  <tr
                    key={row.key}
                    className={`transition-colors duration-100 ${styles.row}`}
                  >
                    {/* Time slot & shift label */}
                    <td className="px-5 py-2.5 align-top">
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                            {row.time}
                          </span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}>
                            {row.shift}
                          </span>
                        </div>
                        {/* Only show shift status badge once per shift group (at first slot) */}
                        {['t07', 't15', 't23'].includes(row.key) && (
                          <div className="mt-0.5">
                            {getShiftBadge(row.shiftId)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Parameter input cells (Tolerance / Limit Validation) */}
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
                        (editedFields && (editedFields[fieldKey] || (editedFields.get && editedFields.get(fieldKey))))
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
                                    ? isOutOfLimit
                                      ? 'bg-rose-50 text-rose-900 border-rose-300 font-black cursor-default select-text'
                                      : 'bg-slate-50 text-slate-500 border-slate-200 cursor-default select-text opacity-80'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                    : styles.inputFocus
                                }`}
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

                            {/* Tiny Compact EDITED badge beside / below modified field */}
                            {isEdited && (
                              <div
                                id={`tk203-edited-badge-${row.key}-${param.key}`}
                                className="mt-1 inline-flex items-center px-1.5 py-[2px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
                                title="This parameter was modified and saved"
                              >
                                EDITED
                              </div>
                            )}

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
            Values for <strong>TK 203</strong>. Frequency: <strong>SHIFT TWICE</strong>. Unit: <strong>Kgm/m³</strong>. Enter numeric values only. Shifts lock sequentially upon saving.
          </p>
        </div>
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                Confirm Save — {confirmData.shift.name} (TK 203)
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 transition text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-slate-600 mb-3">
                You are about to save <strong>{confirmData.shift.name}</strong> data for <strong>{formatDateDisplay(confirmData.date)}</strong>.
              </p>
              {confirmData.isFinalEdit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs font-medium flex items-start gap-2 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Warning:</strong> You are about to save the final correction for III SHIFT. After this save succeeds, all shifts for today will be permanently locked.
                  </span>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-bold text-slate-700 mb-1">
                  Time Slots & Parameters to Persist:
                </div>
                {confirmData.shift.slotKeys.map((sKey) => {
                  const slotObj = TIME_SLOTS.find((s) => s.key === sKey);
                  const row = data[sKey] || {};
                  const nonEmpties = PARAMETERS.filter((p) => row[p.key] !== '' && row[p.key] !== null && row[p.key] !== undefined);
                  return (
                    <div key={sKey} className="text-xs border-b border-slate-200/60 pb-1.5 last:border-0">
                      <span className="font-bold text-blue-900">{slotObj?.time} ({slotObj?.shift}):</span>{' '}
                      {nonEmpties.length > 0 ? (
                        <span className="text-slate-700">
                          {nonEmpties.map((p) => `${p.label}: ${row[p.key]}`).join(' | ')}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No values entered</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                disabled={saving}
              >
                Review / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-75 cursor-pointer shadow-2xs"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Saving...
                  </>
                ) : (
                  <>Confirm Save</>
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
