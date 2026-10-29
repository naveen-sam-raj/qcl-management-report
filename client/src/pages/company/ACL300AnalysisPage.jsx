import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  Clock,
  Layers,
  Lock,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';

// ─── Shift & Component Parameters ─────────────────────────────────────────────

const ACL300_COMPONENTS = [
  { key: 'p18',  label: '+18 %',  subLabel: '+18 Mesh Particle Spec', unit: '%', placeholder: '00.5' },
  { key: 'p44',  label: '+44 %',  subLabel: '+44 Mesh Particle Spec', unit: '%', placeholder: '71.8' },
  { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', unit: '%', placeholder: '0.72' },
];

const SHIFTS = [
  {
    key: 'shift1',
    name: 'SHIFT 1',
    timing: '06:00 – 14:00 (I Shift)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    key: 'shift2',
    name: 'SHIFT 2',
    timing: '14:00 – 22:00 (II Shift)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'shift3',
    name: 'SHIFT 3',
    timing: '22:00 – 06:00 (III Shift)',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    iconColor: 'text-teal-600',
  },
];

const buildInitialShiftData = () => ({
  shift1: { p18: '', p44: '', nacl: '' },
  shift2: { p18: '', p44: '', nacl: '' },
  shift3: { p18: '', p44: '', nacl: '' },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

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

const ACL300AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Date is locked strictly to Operating Date in Asia/Kolkata) ──
  const [date]                                      = useState(() => getOperatingDateIST());
  const [shiftsData, setShiftsData]                 = useState(buildInitialShiftData());
  const [originalData, setOriginalData]             = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [emailRetrying, setEmailRetrying]           = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Sequential Shift Workflow:
  // - On initial load: SHIFT 1 is editable; SHIFT 2 & SHIFT 3 are waiting/disabled.
  // - After SHIFT 1 save: SHIFT 1 remains editable until SHIFT 2 is saved; SHIFT 2 becomes available.
  // - After SHIFT 2 save: SHIFT 1 is permanently locked; SHIFT 2 remains editable until SHIFT 3 is saved; SHIFT 3 becomes available.
  // - After SHIFT 3 initial save: SHIFT 2 is permanently locked; exactly 1 final edit allowed for SHIFT 3.
  // - After SHIFT 3 final edit: all 3 shifts permanently locked for that date.
  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 'shift1') {
      return Boolean(lockedShifts.shift1) || Boolean(lockedShifts.shift1Locked) || Boolean(lockedShifts.shift2Saved);
    }
    if (shiftKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2) || Boolean(lockedShifts.shift2Locked) || Boolean(lockedShifts.shift3Saved);
    }
    if (shiftKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3 || lockedShifts.shift3Locked) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  // Compute UI status for each shift row
  const getShiftStatus = useCallback((shiftKey) => {
    if (shiftKey === 'shift1') {
      if (lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved) return 'LOCKED';
      if (lockedShifts.shift1Saved) return 'EDITABLE';
      return 'NEW';
    }
    if (shiftKey === 'shift2') {
      if (lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved) return 'LOCKED';
      if (lockedShifts.shift2Saved) return 'EDITABLE';
      if (lockedShifts.shift1Saved) return 'OPEN';
      return 'WAITING';
    }
    if (shiftKey === 'shift3') {
      if (lockedShifts.shift3 || lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1))
        return 'LOCKED';
      if (lockedShifts.shift3Saved) return 'EDITABLE';
      if (lockedShifts.shift2Saved) return 'OPEN';
      return 'WAITING';
    }
    return 'WAITING';
  }, [lockedShifts]);

  // Fetch existing data for current date
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/acl-300-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        if (response.data?.emailStatus) {
          if (response.data.emailStatus === 'sent') setSavePhase('completed');
          else if (response.data.emailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('idle');
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }

          if (record) {
            const fetchedShifts = record.shifts || record.shiftRows || record.data?.shifts || record.data?.shiftRows || record.data;
            if (fetchedShifts && typeof fetchedShifts === 'object') {
              const populated = buildInitialShiftData();
              SHIFTS.forEach((s) => {
                if (fetchedShifts[s.key]) {
                  ACL300_COMPONENTS.forEach((comp) => {
                    const val = fetchedShifts[s.key][comp.key];
                    populated[s.key][comp.key] = val !== undefined && val !== null ? String(val) : '';
                  });
                }
              });
              setShiftsData(populated);
              setOriginalData(JSON.parse(JSON.stringify(populated)));
            } else {
              setShiftsData(buildInitialShiftData());
              setOriginalData(null);
            }

            if (record.lockedShifts || record.data?.lockedShifts) {
              setLockedShifts(record.lockedShifts || record.data?.lockedShifts);
            } else {
              setLockedShifts({});
            }

            if (record.editedFields || record.data?.editedFields) {
              setEditedFields(record.editedFields || record.data?.editedFields);
            } else {
              setEditedFields({});
            }
          } else {
            setShiftsData(buildInitialShiftData());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
          }
        } else {
          setShiftsData(buildInitialShiftData());
          setOriginalData(null);
          setLockedShifts({});
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing ACL 300# data', err);
        setShiftsData(buildInitialShiftData());
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

  // ── Input Changes ──
  const handleInputChange = useCallback((shiftKey, paramKey, val) => {
    if (!isValidDecimal(val)) return;
    if (isShiftDisabled(shiftKey)) return;

    setShiftsData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...(prev[shiftKey] || {}),
        [paramKey]: val,
      },
    }));

    // Clear validation error on change
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${shiftKey}_${paramKey}`];
      return copy;
    });

    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isShiftDisabled]);

  // ── Reset Handler ──
  const handleReset = useCallback(() => {
    if (originalData) {
      setShiftsData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setShiftsData(buildInitialShiftData());
    }
    setErrors({});
    setSaveSuccess(false);
    setSavePhase('idle');
    showToast?.('Values reset.', 'info');
  }, [originalData, showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    SHIFTS.forEach((shift) => {
      ACL300_COMPONENTS.forEach((comp) => {
        const val = shiftsData[shift.key]?.[comp.key];
        if (val !== '' && val !== undefined && val !== null && isNaN(Number(val))) {
          newErrors[`${shift.key}_${comp.key}`] = 'Invalid number';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [shiftsData]);

  // Helper to check if a shift differs from originalData
  const isShiftDiff = (oldShift, newShift) => {
    if (!oldShift && newShift) return true;
    if (oldShift && !newShift) return false;
    return ACL300_COMPONENTS.some((comp) => {
      let oldVal = oldShift?.[comp.key] ?? null;
      let newVal = newShift?.[comp.key] ?? null;
      if (newVal === '') newVal = null;
      if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
        return Number(oldVal) !== Number(newVal);
      }
      return String(oldVal) !== String(newVal);
    });
  };

  // ── Open Save Confirmation Modal ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validateForm()) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    const shiftsToSave = [];
    let isFinalEdit = false;

    SHIFTS.forEach((shift) => {
      if (isShiftDisabled(shift.key)) return;

      const currentShiftData = shiftsData[shift.key];
      const hasAnyValue = currentShiftData && Object.values(currentShiftData).some((v) => v !== '' && v !== null && v !== undefined);
      const oldShiftData = originalData ? originalData[shift.key] : null;
      const hasDiff = isShiftDiff(oldShiftData, currentShiftData);

      if (hasAnyValue && hasDiff) {
        shiftsToSave.push({
          key: shift.key,
          name: shift.name,
          timing: shift.timing,
        });

        if (shift.key === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0) {
          isFinalEdit = true;
        }
      }
    });

    if (shiftsToSave.length === 0) {
      showToast?.('No new or modified shift data found to save.', 'info');
      return;
    }

    if (shiftsToSave.length > 1) {
      showToast?.('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    setConfirmData({
      date,
      shift: shiftsToSave[0],
      isFinalEdit,
    });
    setShowConfirmModal(true);
  };

  // ── Confirm Save / Submit ──
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
      analysisType: 'ACL 300# Analysis',
      unit: 'ACL 300#',
      frequency: 'Once in a shift',
      shift: shiftBeingSaved ? shiftBeingSaved.name : 'SHIFT 1',
      shifts: Object.fromEntries(
        SHIFTS.map((s) => [
          s.key,
          Object.fromEntries(
            ACL300_COMPONENTS.map((comp) => {
              const val = shiftsData[s.key]?.[comp.key];
              return [comp.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
            })
          ),
        ])
      ),
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/acl-300-analysis', payload);

      if (response?.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes detected — save skipped', 'info');
        return;
      }

      if (!response?.data?.success) {
        showToast?.(response?.data?.message || 'Unable to save ACL 300# data. Please try again.', 'error');
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
      if (savedDoc?.shifts) {
        // Sync originalData to persisted shifts
        const synced = buildInitialShiftData();
        SHIFTS.forEach((s) => {
          if (savedDoc.shifts[s.key]) {
            ACL300_COMPONENTS.forEach((comp) => {
              const val = savedDoc.shifts[s.key][comp.key];
              synced[s.key][comp.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setShiftsData(synced);
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
        showToast?.(`Saved — Email Sent ✓`, 'success');
      } else if (statusFromApi === 'disabled') {
        setSavePhase('completed');
        setEmailStatusDetail('Notifications disabled for this plant');
        showToast?.('Saved ✓', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailRes?.error || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      console.error('[ACL 300#] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Retry Email Dispatch ──
  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('Cannot retry email: Record ID is not available.', 'error');
      return;
    }
    if (emailRetrying) return;
    setEmailRetrying(true);
    try {
      const response = await api.post(`/api/acl-300-analysis/${recordId}/retry-email`);
      if (response.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Email sent successfully on retry.');
        showToast?.('Email resent successfully!', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data?.error || 'Email delivery failed on retry.');
        showToast?.('Email retry failed: ' + (response.data?.error || 'Rejected by server'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setSavePhase('email_failed');
      setEmailStatusDetail(msg);
      showToast?.('Retry Email Error: ' + msg, 'error');
    } finally {
      setEmailRetrying(false);
    }
  };

  // Check if all shifts are permanently locked
  const isAllLocked = Boolean(
    (lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved) &&
    (lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved) &&
    (lockedShifts.shift3 || lockedShifts.shift3Locked || ((lockedShifts.shift3Edits || 0) >= 1))
  );

  return (
    <div className="space-y-3 sm:space-y-3.5 animate-fadeIn font-sans">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 sm:px-5 sm:py-2.5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Back Button + Breadcrumb + Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(basePath)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 shrink-0 cursor-pointer"
              title="Return to Plants Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <Factory className="w-3 h-3 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-2.5 h-2.5" />
                <PackageCheck className="w-3 h-3 text-blue-500" />
                <span className="text-blue-600 font-semibold">ACL 300#</span>
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                ACL 300# Analysis
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Actions */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Locked Operating Date (Asia/Kolkata) */}
            <LockedDateDisplay date={date} id="acl300-date-display" badgeText="Operating Day" />

            {/* Actions */}
            {!isViewOnly ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="btn-acl300-reset"
                  onClick={handleReset}
                  disabled={saving || isAllLocked}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 disabled:opacity-50 cursor-pointer"
                  title="Clear / reset modified fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <StatusSaveButton
                  id="btn-acl300-save"
                  saving={saving}
                  savePhase={savePhase}
                  saveSuccess={saveSuccess}
                  onClick={handleSaveClick}
                  alwaysShowSaveText={true}
                  title="Save permitted shift data and notify registered user"
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

      {/* ── Status Banner for Email Dispatch State ── */}
      <SaveStatusBanner
        id="acl300-status-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="ACL 300# Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving || emailRetrying}
      />

      {/* ── SINGLE UNIFIED BOX: Shift 1, 2, 3 Rows with Fixed Top Parameters ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="px-4 py-2 sm:px-5 sm:py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-blue-600/30 rounded-md border border-blue-400/30">
              <Layers className="w-3.5 h-3.5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                ACL 300# SHIFT ANALYSIS
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-300">
                Particle Size Distribution (+18 Mesh, +44 Mesh) & Sodium Chloride (NaCl %)
              </p>
            </div>
          </div>

          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
            3 Shifts • 3 Parameters
          </span>
        </div>

        {/* Unified Table Structure: Fixed Component Headers at Top, Shifts 1, 2, 3 Rows Underneath */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {/* ── FIXED TOP HEADERS (+18 %, +44 %, NaCl %) ── */}
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200">
                <th className="py-2.5 px-4 sm:px-6 text-xs font-extrabold uppercase tracking-wider text-slate-600 w-1/4">
                  Shift / Schedule
                </th>

                {/* +18 % Component Header */}
                <th className="py-2 px-3 text-center w-1/4">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
                    +18 %
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    (+18 Mesh Particle Spec)
                  </div>
                </th>

                {/* +44 % Component Header */}
                <th className="py-2 px-3 text-center w-1/4">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
                    +44 %
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    (+44 Mesh Particle Spec)
                  </div>
                </th>

                {/* NaCl % Component Header */}
                <th className="py-2 px-3 text-center w-1/4">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
                    NaCl %
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    (Sodium Chloride Content)
                  </div>
                </th>
              </tr>
            </thead>

            {/* ── SHIFT 1, SHIFT 2, SHIFT 3 ROWS ── */}
            <tbody className="divide-y divide-slate-100">
              {SHIFTS.map((shift) => {
                const disabled = isShiftDisabled(shift.key);

                return (
                  <tr
                    key={shift.key}
                    className={`transition-colors ${
                      disabled ? 'bg-slate-50/50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Shift Label Column */}
                    <td className="py-2.5 sm:py-3 px-4 sm:px-6 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg border shrink-0 ${disabled ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-slate-100 border-slate-200'}`}>
                          {disabled ? (
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Clock className={`w-3.5 h-3.5 ${shift.iconColor}`} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                              {shift.name}
                            </span>
                            <RecordStatusBadge status={getShiftStatus(shift.key)} />
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {shift.timing}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Inputs for each component with EDITED badge */}
                    {ACL300_COMPONENTS.map((comp) => {
                      const fieldKey = `${shift.key}_${comp.key}`;
                      const isEdited = Boolean(editedFields[fieldKey]);
                      const val = shiftsData[shift.key]?.[comp.key] ?? '';

                      return (
                        <td key={comp.key} className="py-2 sm:py-2.5 px-3 text-center align-middle">
                          <div className="relative inline-block">
                            <input
                              id={`acl300-${shift.key}-${comp.key}`}
                              type="text"
                              inputMode="decimal"
                              value={val}
                              placeholder={comp.placeholder}
                              disabled={disabled}
                              onChange={(e) => handleInputChange(shift.key, comp.key, e.target.value)}
                              className={`w-28 sm:w-32 px-2.5 py-1.5 text-xs sm:text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                                disabled
                                  ? 'border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed select-text opacity-85'
                                  : errors[fieldKey]
                                  ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                                  : val !== ''
                                  ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                                  : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                              }`}
                              aria-label={`${shift.name} ${comp.label}`}
                            />

                            {/* Small Field-Level EDITED Badge */}
                            {isEdited && (
                              <span
                                id={`${fieldKey}-edited-badge`}
                                className="absolute -top-1.5 -right-2 px-1 py-0.2 rounded bg-amber-100 border border-amber-300 text-amber-800 text-[8px] font-black uppercase tracking-tight shadow-2xs animate-fadeIn select-none"
                                title="Value modified after initial save"
                              >
                                EDITED
                              </span>
                            )}

                            {errors[fieldKey] && (
                              <p className="text-[10px] text-red-600 font-bold mt-0.5 text-center animate-fadeIn absolute -bottom-3.5 left-0 right-0">
                                {errors[fieldKey]}
                              </p>
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

        {/* Card Footer */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between">
          <span>ACL 300# Operational Quality Standard (Particle Distribution & NaCl %) — One correction allowed after first save; saving the next shift locks the previous one.</span>
          <span className="font-semibold text-slate-700">TFL ACL Plant Standard</span>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scaleIn">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-blue-950 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PackageCheck className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-sm tracking-tight">Confirm Save / Submit</h3>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 uppercase">
                {confirmData?.shift?.name}
              </span>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to save the following measurement data for{' '}
                  <strong className="text-slate-900">{confirmData?.shift?.name}</strong> on{' '}
                  <strong className="text-slate-900">{formatDateDisplay(date)}</strong>?
                </p>
                {confirmData?.isFinalEdit && (
                  <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>⚠️ Note: This is your final edit for SHIFT 3. After this save, all shifts for this date will be permanently locked.</span>
                  </div>
                )}
              </div>

              {/* Data Summary Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 text-xs font-extrabold text-slate-700 uppercase flex items-center justify-between">
                  <span>Parameter</span>
                  <span>Entered Value</span>
                </div>
                <div className="divide-y divide-slate-200/80 text-xs font-mono">
                  {ACL300_COMPONENTS.map((comp) => {
                    const shiftKey = confirmData?.shift?.key || 'shift1';
                    const val = shiftsData[shiftKey]?.[comp.key];
                    return (
                      <div key={comp.key} className="px-3 py-2 flex items-center justify-between bg-white">
                        <span className="font-sans font-semibold text-slate-700">{comp.label} ({comp.subLabel})</span>
                        <span className="font-extrabold text-blue-600 font-mono text-sm">
                          {val !== '' && val !== null && val !== undefined ? `${val} %` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {recipientEmail && (
                <div className="text-[11px] text-slate-500">
                  📧 An email notification will be dispatched to registered plant operator:{' '}
                  <strong className="text-slate-800">{recipientEmail}</strong>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {saving && (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ACL300AnalysisPage;
