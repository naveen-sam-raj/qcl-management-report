import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Layers,
  Clock,
  Plus,
  Trash2,
  Activity,
  Check,
  RefreshCw,
  Mail,
  Send,
  X,
  Lock,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import {
  getCellLimit,
  validateCellValue,
  SA_LSA_BAGGING_SHIFT_LIMITS,
  SA_LSA_BAGGING_HOURLY_LIMITS,
} from '../../services/analysisValidation';

// ─── Shift-wise Parameters (Once in a Shift) ─────────────────────────────────

const SHIFT_COMPONENTS = [
  { key: 'na2co3',    label: 'Na₂CO₃ %', subLabel: 'Sodium Carbonate',  unit: '%',   placeholder: '99.20' },
  { key: 'nacl',      label: 'NaCl %',   subLabel: 'Sodium Chloride',   unit: '%',   placeholder: '0.72' },
  { key: 'fe',        label: 'Fe₂O₃ %',  subLabel: 'Iron Content',      unit: '%',   placeholder: '0.0070' },
  { key: 'na2so4',    label: 'Na₂SO₄ %', subLabel: 'Sodium Sulphate',   unit: '%',   placeholder: '0.080' },
  { key: 'vm',        label: 'VM %',     subLabel: 'Volatile Matter',   unit: '%',   placeholder: '2.00' },
  { key: 'ir',        label: 'IR %',     subLabel: 'Insoluble Residue', unit: '%',   placeholder: '0.150' },
  { key: 'bd',        label: 'BD (g/L)', subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '635' },
  { key: 'turbidity', label: 'Turbidity',subLabel: 'Solution Turbidity',unit: 'NTU', placeholder: '80' },
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

const normalizeToShiftKey = (shift) => {
  if (!shift) return 'shift1';
  const s = String(shift).toLowerCase().replace(/\s+/g, '');
  if (s === 'shift1' || s === 's1' || s === '1') return 'shift1';
  if (s === 'shift2' || s === 's2' || s === '2') return 'shift2';
  if (s === 'shift3' || s === 's3' || s === '3') return 'shift3';
  return 'shift1';
};

const buildInitialShiftData = () => ({
  shift1: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  shift2: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  shift3: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
});

// ─── Hourly Time Slots (1 Hr Once) ───────────────────────────────────────────

const DEFAULT_HOURLY_SLOTS = [
  // Shift 1 (06:00 - 14:00)
  { id: 'h0600', time: '06:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0700', time: '07:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0800', time: '08:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0900', time: '09:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1000', time: '10:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1100', time: '11:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1200', time: '12:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1300', time: '13:00', shift: 'Shift 1', nacl: '', bd: '' },

  // Shift 2 (14:00 - 22:00)
  { id: 'h1400', time: '14:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1500', time: '15:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1600', time: '16:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1700', time: '17:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1800', time: '18:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1900', time: '19:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2000', time: '20:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2100', time: '21:00', shift: 'Shift 2', nacl: '', bd: '' },

  // Shift 3 (22:00 - 06:00)
  { id: 'h2200', time: '22:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h2300', time: '23:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0000', time: '00:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0100', time: '01:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0200', time: '02:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0300', time: '03:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0400', time: '04:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0500', time: '05:00', shift: 'Shift 3', nacl: '', bd: '' },
];

const getShiftFromTime = (timeStr) => {
  if (!timeStr) return 'Shift 1';
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (isNaN(hour)) return 'Shift 1';
  if (hour >= 6 && hour < 14) return 'Shift 1';
  if (hour >= 14 && hour < 22) return 'Shift 2';
  return 'Shift 3';
};

const getTodayAsiaKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

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

const mergeShiftWithDefaults = (savedShifts) => {
  const initial = buildInitialShiftData();
  if (!savedShifts || typeof savedShifts !== 'object') return initial;

  ['shift1', 'shift2', 'shift3'].forEach((sKey) => {
    const savedS = savedShifts[sKey] || {};
    SHIFT_COMPONENTS.forEach((comp) => {
      const v = savedS[comp.key];
      initial[sKey][comp.key] = v !== undefined && v !== null ? String(v) : '';
    });
  });
  return initial;
};

const mergeHourlyWithDefaults = (savedList) => {
  if (!Array.isArray(savedList) || savedList.length === 0) {
    return DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s }));
  }

  const savedMap = new Map();
  savedList.forEach((r) => {
    if (r.time) savedMap.set(r.time, r);
  });

  const merged = DEFAULT_HOURLY_SLOTS.map((defSlot) => {
    const saved = savedMap.get(defSlot.time);
    if (saved) {
      savedMap.delete(defSlot.time);
      return {
        ...defSlot,
        nacl: saved.nacl !== undefined && saved.nacl !== null ? String(saved.nacl) : '',
        bd: saved.bd !== undefined && saved.bd !== null ? String(saved.bd) : '',
      };
    }
    return { ...defSlot };
  });

  savedMap.forEach((customSlot) => {
    merged.push({
      id: customSlot.id || `custom_${customSlot.time.replace(':', '')}`,
      time: customSlot.time,
      shift: customSlot.shift || getShiftFromTime(customSlot.time),
      nacl: customSlot.nacl !== undefined && customSlot.nacl !== null ? String(customSlot.nacl) : '',
      bd: customSlot.bd !== undefined && customSlot.bd !== null ? String(customSlot.bd) : '',
      isCustom: true,
    });
  });

  return merged;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LSABaggingAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Strict Current-Date Restriction) ──
  const [date] = useState(() => getTodayAsiaKolkata());
  const [shiftData, setShiftData] = useState(buildInitialShiftData());
  const [originalShiftData, setOriginalShiftData] = useState(null);
  const [hourlyReadings, setHourlyReadings] = useState(DEFAULT_HOURLY_SLOTS);
  const [originalHourlyReadings, setOriginalHourlyReadings] = useState(null);
  const [activeHourlyFilter, setActiveHourlyFilter] = useState('all');
  const [newTimeInput, setNewTimeInput] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Sequential Shift Locking State
  const [lockedShifts, setLockedShifts] = useState({
    shift1Saved: false,
    shift2Saved: false,
    shift3Saved: false,
    shift1Locked: false,
    shift2Locked: false,
    shift3Locked: false,
    shift3Edits: 0,
  });
  const [originalLockedShifts, setOriginalLockedShifts] = useState(null);

  // Email & Persistence states
  const [savePhase, setSavePhase] = useState('idle'); // 'idle' | 'saving' | 'completed'  | 'email_failed'
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [editedFields, setEditedFields] = useState({});
  const [retryingEmail, setRetryingEmail] = useState(false);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: 'all', // 'shift' | 'hourly' | 'all'
    shiftKey: null,
    title: '',
    message: '',
    items: [],
  });

  // ── Sequential Shift Locking State Machine ──
  // - Initial state: SHIFT 1 is editable. SHIFT 2 & SHIFT 3 are read-only and show WAITING.
  // - After SHIFT 1 is saved: SHIFT 1 remains editable until SHIFT 2 is saved; SHIFT 2 becomes editable; SHIFT 3 shows WAITING.
  // - After SHIFT 2 is saved: SHIFT 1 permanently LOCKED; SHIFT 2 remains editable until SHIFT 3 is saved; SHIFT 3 becomes editable.
  // - After SHIFT 3 is saved 1st time: SHIFT 1 & SHIFT 2 permanently LOCKED; exactly 1 final edit allowed for SHIFT 3.
  // - After SHIFT 3 final edit: all 3 shifts permanently LOCKED.
  const isShiftDisabled = useCallback((shiftKeyOrName) => {
    if (isViewOnly) return true;
    const key = normalizeToShiftKey(shiftKeyOrName);

    if (key === 'shift1') {
      return Boolean(lockedShifts.shift1Locked || lockedShifts.shift2Saved);
    }
    if (key === 'shift2') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2Locked || lockedShifts.shift3Saved);
    }
    if (key === 'shift3') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3Locked) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  const getShiftStatusInfo = useCallback((shiftKeyOrName) => {
    const key = normalizeToShiftKey(shiftKeyOrName);

    if (key === 'shift1') {
      if (lockedShifts.shift1Locked || lockedShifts.shift2Saved) {
        return { status: 'LOCKED', label: 'LOCKED', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300' };
      }
      if (lockedShifts.shift1Saved) {
        return { status: 'EDITABLE', label: 'EDITABLE', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      }
      return { status: 'NEW', label: 'NEW', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' };
    }

    if (key === 'shift2') {
      if (!lockedShifts.shift1Saved) {
        return { status: 'WAITING', label: 'WAITING', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' };
      }
      if (lockedShifts.shift2Locked || lockedShifts.shift3Saved) {
        return { status: 'LOCKED', label: 'LOCKED', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300' };
      }
      if (lockedShifts.shift2Saved) {
        return { status: 'EDITABLE', label: 'EDITABLE', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      }
      return { status: 'NEW', label: 'NEW', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' };
    }

    if (key === 'shift3') {
      if (!lockedShifts.shift2Saved) {
        return { status: 'WAITING', label: 'WAITING', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' };
      }
      if (lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) {
        return { status: 'LOCKED', label: 'LOCKED', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300' };
      }
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0) {
        return { status: 'FINAL_EDIT', label: 'FINAL EDIT', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' };
      }
      return { status: 'NEW', label: 'NEW', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' };
    }

    return { status: 'UNKNOWN', label: 'UNKNOWN', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }, [lockedShifts]);

  const allShiftsLocked = useMemo(() => {
    return isShiftDisabled('shift1') && isShiftDisabled('shift2') && isShiftDisabled('shift3');
  }, [isShiftDisabled]);

  // ── Fetch existing data on mount / date change ──
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        let response;
        try {
          response = await api.get(`/api/lsa-bagging?date=${date}`);
        } catch {
          response = await api.get(`/api/lsa-bagging-analysis?date=${date}`);
        }

        if (!active) return;

        if (response?.data?.success) {
          const rec = response.data.record || response.data.data;
          const assignedOp = response.data.assignedOperatorEmail || rec?.emailRecipient || '';
          setRecipientEmail(assignedOp);

          const defaultLocks = {
            shift1Saved: false,
            shift2Saved: false,
            shift3Saved: false,
            shift1Locked: false,
            shift2Locked: false,
            shift3Locked: false,
            shift3Edits: 0,
          };

          if (rec) {
            setRecordId(rec._id || response.data.recordId || null);

            const shifts = rec.shiftAnalysis || rec.data?.shiftAnalysis || rec.shifts;
            const hours = rec.hourlyReadings || rec.data?.hourlyReadings;

            const mergedShifts = mergeShiftWithDefaults(shifts);
            const mergedHours = mergeHourlyWithDefaults(hours);

            setShiftData(mergedShifts);
            setOriginalShiftData(JSON.parse(JSON.stringify(mergedShifts)));

            setHourlyReadings(mergedHours);
            setOriginalHourlyReadings(JSON.parse(JSON.stringify(mergedHours)));

            const edFields = rec.editedFields || response.data.editedFields || {};
            setEditedFields(edFields);

            const locks = rec.lockedShifts || response.data.lockedShifts || defaultLocks;
            setLockedShifts(locks);
            setOriginalLockedShifts(JSON.parse(JSON.stringify(locks)));

            if (rec.emailStatus === 'sent' || response.data.emailStatus === 'sent') {
              setSavePhase('completed');
              setEmailStatusDetail(`Email sent to ${assignedOp || 'registered SA Plant operator'}`);
            } else if (rec.emailStatus === 'failed' || response.data.emailStatus === 'failed') {
              setSavePhase('email_failed');
              setEmailStatusDetail('Database save succeeded. Email dispatch failed.');
            }
          } else {
            setShiftData(buildInitialShiftData());
            setOriginalShiftData(null);
            setHourlyReadings(DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s })));
            setOriginalHourlyReadings(null);
            setEditedFields({});
            const locks = response.data.lockedShifts || defaultLocks;
            setLockedShifts(locks);
            setOriginalLockedShifts(JSON.parse(JSON.stringify(locks)));
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing LSA Bagging data:', err.message);
      }
    };

    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Shift Input Change Handler ──
  const handleShiftInputChange = useCallback((shiftKey, paramKey, val) => {
    if (!isValidDecimal(val)) return;

    setShiftData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [paramKey]: val,
      },
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`shift_${shiftKey}_${paramKey}`];
      return copy;
    });

    if (savePhase !== 'idle') {
      setSavePhase('idle');
    }
  }, [savePhase]);

  // ── Hourly Input Change Handler ──
  const handleHourlyInputChange = useCallback((id, paramKey, val) => {
    if (!isValidDecimal(val)) return;

    setHourlyReadings((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [paramKey]: val } : row))
    );

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`hourly_${id}_${paramKey}`];
      return copy;
    });

    if (savePhase !== 'idle') {
      setSavePhase('idle');
    }
  }, [savePhase]);

  // ── Add Custom Hourly Slot (Prevent Duplicates) ──
  const handleAddHourlySlot = () => {
    if (!newTimeInput) {
      showToast?.('Please enter a valid time (e.g. 08:30)', 'warning');
      return;
    }

    const assignedShift = getShiftFromTime(newTimeInput);
    if (isShiftDisabled(assignedShift)) {
      showToast?.(`Cannot add hourly slot for ${newTimeInput} (${assignedShift}): shift is ${getShiftStatusInfo(assignedShift).label}.`, 'warning');
      return;
    }

    if (hourlyReadings.some((r) => r.time === newTimeInput)) {
      showToast?.(`Sampling time ${newTimeInput} already exists in the routine monitoring schedule.`, 'warning');
      return;
    }

    const newSlot = {
      id: `custom_${Date.now()}`,
      time: newTimeInput,
      shift: assignedShift,
      nacl: '',
      bd: '',
      isCustom: true,
    };

    setHourlyReadings((prev) => [...prev, newSlot]);
    setNewTimeInput('');
    showToast?.(`Time slot ${newTimeInput} (${assignedShift}) added.`, 'info');
  };

  // ── Delete Custom Hourly Slot ──
  const handleDeleteHourlySlot = (id, shiftName) => {
    if (isShiftDisabled(shiftName)) {
      showToast?.(`Cannot delete hourly slot: ${shiftName} is ${getShiftStatusInfo(shiftName).label}.`, 'warning');
      return;
    }
    setHourlyReadings((prev) => prev.filter((row) => row.id !== id));
    showToast?.('Custom hourly sampling slot removed.', 'info');
  };

  // ── Reset Handler (Revert to Database State) ──
  const handleReset = useCallback(() => {
    if (originalShiftData) {
      setShiftData(JSON.parse(JSON.stringify(originalShiftData)));
    } else {
      setShiftData(buildInitialShiftData());
    }

    if (originalHourlyReadings) {
      setHourlyReadings(JSON.parse(JSON.stringify(originalHourlyReadings)));
    } else {
      setHourlyReadings(DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s })));
    }

    if (originalLockedShifts) {
      setLockedShifts(JSON.parse(JSON.stringify(originalLockedShifts)));
    }

    setErrors({});
    setSavePhase('idle');
    showToast?.('LSA Bagging parameters reset to last saved state.', 'info');
  }, [originalShiftData, originalHourlyReadings, originalLockedShifts, showToast]);

  // ── Validation ──
  const validateShift = (shiftKey = null) => {
    let isValid = true;
    const newErrors = { ...errors };

    const shiftsToValidate = shiftKey ? [SHIFTS.find((s) => s.key === shiftKey)] : SHIFTS;

    shiftsToValidate.filter(Boolean).forEach((shift) => {
      SHIFT_COMPONENTS.forEach((comp) => {
        const val = shiftData[shift.key]?.[comp.key];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`shift_${shift.key}_${comp.key}`] = 'Invalid number';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  };

  const validateHourly = () => {
    let isValid = true;
    const newErrors = { ...errors };

    hourlyReadings.forEach((row) => {
      ['nacl', 'bd'].forEach((param) => {
        const val = row[param];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`hourly_${row.id}_${param}`] = 'Invalid';
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  };

  // ── Open Save Confirmation Dialogs ──
  const handleSaveShiftClick = (shiftKey) => {
    if (isShiftDisabled(shiftKey)) {
      showToast?.(`Cannot save ${shiftKey.toUpperCase()}: shift is ${getShiftStatusInfo(shiftKey).label}.`, 'warning');
      return;
    }

    if (!validateShift(shiftKey)) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    const shiftObj = shiftData[shiftKey] || {};
    const hasValues = Object.values(shiftObj).some((v) => v !== '' && v !== null && v !== undefined);

    if (!hasValues) {
      showToast?.(`Please enter at least one measurement value for ${shiftKey.toUpperCase()} before saving.`, 'warning');
      return;
    }

    const shiftDef = SHIFTS.find((s) => s.key === shiftKey);
    const isShift3Final = shiftKey === 'shift3' && lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0;

    const items = SHIFT_COMPONENTS.map((comp) => ({
      label: comp.label,
      value: shiftObj[comp.key] !== '' && shiftObj[comp.key] !== null ? `${shiftObj[comp.key]} ${comp.unit}` : '—',
    }));

    setConfirmModal({
      isOpen: true,
      type: 'shift',
      shiftKey,
      title: isShift3Final
        ? `Confirm Save — ${shiftDef?.name || 'SHIFT 3'} (Final Edit Allowed)`
        : `Confirm Save — ${shiftDef?.name || shiftKey.toUpperCase()} (${shiftDef?.timing || ''})`,
      message: isShift3Final
        ? `Are you sure you want to save the final edit for ${shiftDef?.name}? WARNING: Exactly one final edit is permitted for SHIFT 3. After this save, all three shifts for this date will be permanently LOCKED.`
        : `Are you sure you want to save ${shiftDef?.name} Shift Analysis? This will persist the 8 parameters to MongoDB and dispatch an email notification to the registered SA Plant User.`,
      items,
    });
  };

  const handleSaveHourlyClick = (shiftFilter = activeHourlyFilter) => {
    if (!validateHourly()) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    const targetShiftKey = shiftFilter !== 'all' ? normalizeToShiftKey(shiftFilter) : 'all';

    if (targetShiftKey !== 'all' && isShiftDisabled(targetShiftKey)) {
      showToast?.(`Cannot save hourly readings for ${shiftFilter}: shift is ${getShiftStatusInfo(targetShiftKey).label}.`, 'warning');
      return;
    }

    if (targetShiftKey === 'all' && allShiftsLocked) {
      showToast?.('All shifts are permanently locked for this date. Hourly readings cannot be saved.', 'warning');
      return;
    }

    const recordedHours = hourlyReadings.filter((r) => {
      const rowMatches = shiftFilter === 'all' || r.shift === shiftFilter;
      const hasVal = (r.nacl !== '' && r.nacl !== null && r.nacl !== undefined) || (r.bd !== '' && r.bd !== null && r.bd !== undefined);
      return rowMatches && hasVal;
    });

    if (recordedHours.length === 0) {
      showToast?.(`Please enter at least one hourly reading${shiftFilter !== 'all' ? ` for ${shiftFilter}` : ''} before saving.`, 'warning');
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'hourly',
      shiftKey: targetShiftKey,
      title: `Confirm Save — Hourly Routine Monitoring (${shiftFilter !== 'all' ? shiftFilter : 'All Active Shifts'})`,
      message: `Are you sure you want to save the continuous hourly readings? ${recordedHours.length} intervals have recorded values. This will persist them to MongoDB and notify the registered SA Plant User.`,
      items: recordedHours.map((r) => ({
        label: `${r.time} (${r.shift})`,
        value: `NaCl: ${r.nacl ? r.nacl + '%' : '—'} | BD: ${r.bd ? r.bd + ' g/L' : '—'}`,
      })),
    });
  };

  const handleSaveAllClick = () => {
    if (allShiftsLocked) {
      showToast?.('All shifts are permanently locked for this date. No further changes can be submitted.', 'warning');
      return;
    }

    const shiftValid = validateShift();
    const hourlyValid = validateHourly();

    if (!shiftValid || !hourlyValid) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    const hasShiftValues = Object.values(shiftData).some((s) =>
      Object.values(s).some((v) => v !== '' && v !== null && v !== undefined)
    );
    const hasHourlyValues = hourlyReadings.some(
      (r) => (r.nacl !== '' && r.nacl !== null && r.nacl !== undefined) || (r.bd !== '' && r.bd !== null && r.bd !== undefined)
    );

    if (!hasShiftValues && !hasHourlyValues) {
      showToast?.('Please enter at least one measurement value in Shift Analysis or Hourly Monitoring before saving.', 'warning');
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'all',
      shiftKey: null,
      title: 'Confirm Save — LSA Bagging Analysis (All Changes)',
      message: 'Are you sure you want to save both Shift Analysis and Hourly Routine Monitoring? Data will be persisted to MongoDB and notification sent to the registered SA Plant User.',
      items: [
        { label: 'Date', value: formatDateDisplay(date) },
        { label: 'Shift Analysis', value: hasShiftValues ? 'Measurements entered' : 'No changes' },
        { label: 'Hourly Routine', value: `${hourlyReadings.filter((r) => r.nacl || r.bd).length} intervals recorded` },
      ],
    });
  };

  // ── Confirm Save Execution ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');

    const saveType = confirmModal.type;
    const targetShift = confirmModal.shiftKey || 'all';

    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

    try {
      const payload = {
        plant: 'SA',
        plantId: 'sa',
        analysisType: 'LSA Bagging Analysis',
        date,
        saveType,
        targetShift,
        shiftAnalysis: shiftData,
        hourlyReadings: hourlyReadings,
        submittedBy: user?.name || 'Plant Operator',
        submittedAt: new Date().toISOString(),
      };

      let response;
      try {
        response = await api.post('/api/lsa-bagging', payload);
      } catch (err1) {
        response = await api.post('/api/lsa-bagging-analysis', payload);
      }

      if (!response?.data?.success) {
        showToast?.(response?.data?.message || 'Failed to save LSA Bagging Analysis.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setOriginalShiftData(JSON.parse(JSON.stringify(shiftData)));
      setOriginalHourlyReadings(JSON.parse(JSON.stringify(hourlyReadings)));
      setLastSaved(new Date().toLocaleTimeString());

      const returnedDoc = response.data.data || response.data.record || {};
      const newEdited = response.data.editedFields || returnedDoc.editedFields || {};
      const newRecordId = response.data.recordId || returnedDoc._id || returnedDoc.id;

      setRecordId(newRecordId || recordId);
      setEditedFields(newEdited);
      const recipient = response.data.emailRecipient || returnedDoc.emailRecipient || '';
      setRecipientEmail(recipient);

      if (response.data.lockedShifts || returnedDoc.lockedShifts) {
        const updatedLocks = response.data.lockedShifts || returnedDoc.lockedShifts;
        setLockedShifts(updatedLocks);
        setOriginalLockedShifts(JSON.parse(JSON.stringify(updatedLocks)));
      }

      const isEmailSent = response.data.emailDeliveryStatus === 'sent' || response.data.emailStatus === 'sent';
      const isEmailFailed = response.data.emailDeliveryStatus === 'failed' || response.data.emailStatus === 'failed';

      if (isEmailSent) {
        setSavePhase('completed');
        setEmailStatusDetail(`Notification dispatched to ${recipient}`);
        showToast?.('LSA Bagging Analysis saved and email notification sent!', 'success');
      } else if (isEmailFailed) {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data.message || 'Email delivery failed.');
        showToast?.('Data saved to MongoDB, but email dispatch failed.', 'warning');
      } else {
        setSavePhase('completed');
        setEmailStatusDetail('Saved successfully. Email notification is processing in background.');
        showToast?.('LSA Bagging Analysis saved successfully.', 'success');
      }
    } catch (err) {
      console.error('[LSABagging] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  // ── Retry Email Dispatch ──
  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('No saved record reference found to retry email.', 'warning');
      return;
    }
    setRetryingEmail(true);
    try {
      let res;
      try {
        res = await api.post(`/api/lsa-bagging/${recordId}/retry-email`);
      } catch {
        res = await api.post(`/api/lsa-bagging-analysis/${recordId}/retry-email`);
      }

      if (res?.data?.success && (res.data.emailSent || res.data.emailDeliveryStatus === 'sent')) {
        setSavePhase('completed');
        setEmailStatusDetail(`Notification email successfully re-sent to ${res.data.emailRecipient || res.data.recipient || recipientEmail}`);
        showToast?.('Notification email re-sent successfully!', 'success');
      } else {
        const errorMsg = res?.data?.message || 'SMTP delivery rejected.';
        setEmailStatusDetail(`Retry failed: ${errorMsg}`);
        showToast?.(`Email retry failed: ${errorMsg}`, 'error');
      }
    } catch (err) {
      console.error('[LSABagging] Retry email failed:', err);
      const msg = err.response?.data?.message || err.message;
      setEmailStatusDetail(`Retry failed: ${msg}`);
      showToast?.(`Email retry failed: ${msg}`, 'error');
    } finally {
      setRetryingEmail(false);
    }
  };

  // ── Filtered Hourly Slots ──
  const filteredHourlyRows = useMemo(() => {
    if (activeHourlyFilter === 'all') return hourlyReadings;
    return hourlyReadings.filter((row) => row.shift === activeHourlyFilter);
  }, [hourlyReadings, activeHourlyFilter]);

  // ── Hourly Summary Statistics ──
  const hourlyStats = useMemo(() => {
    const naclVals = hourlyReadings.map((r) => parseFloat(r.nacl)).filter((v) => !isNaN(v));
    const bdVals = hourlyReadings.map((r) => parseFloat(r.bd)).filter((v) => !isNaN(v));

    const avgNacl = naclVals.length ? (naclVals.reduce((a, b) => a + b, 0) / naclVals.length).toFixed(2) : '—';
    const avgBd = bdVals.length ? (bdVals.reduce((a, b) => a + b, 0) / bdVals.length).toFixed(1) : '—';

    return {
      totalFilled: Math.max(naclVals.length, bdVals.length),
      avgNacl,
      avgBd,
    };
  }, [hourlyReadings]);

  return (
    <div className="space-y-6 animate-fadeIn font-sans">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Back Button + Breadcrumb + Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 shrink-0 cursor-pointer"
              title="Return to Plants Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-blue-600 font-semibold">LSA Bagging</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                LSA BAGGING
              </h1>
            </div>
          </div>

          {/* Right: Date Section + Actions */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {lastSaved && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Saved at {lastSaved}
              </span>
            )}

            {/* Integrated Current-Date Locked Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="lsa-bagging-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="lsa-bagging-date-input"
                  type="date"
                  value={date}
                  readOnly
                  disabled
                  min={date}
                  max={date}
                  className="pl-7 pr-2 py-1 text-xs font-semibold border rounded-md text-slate-800 bg-slate-100 border-slate-300 cursor-not-allowed opacity-90 shadow-2xs"
                  title="Date automatically locked to current date (Asia/Kolkata timezone)"
                  required
                />
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
                {formatDateDisplay(date)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {!isViewOnly && (
                <button
                  id="btn-lsa-bagging-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-50"
                  title="Revert to last saved state"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              {!isViewOnly && (
                <StatusSaveButton
                  id="btn-lsa-bagging-save"
                  saving={saving}
                  isLocked={allShiftsLocked}
                  savePhase={savePhase}
                  onClick={handleSaveAllClick}
                  defaultLabel="Save / Submit"
                  title={allShiftsLocked ? 'All shifts are permanently locked' : 'Save all LSA Bagging changes'}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Banner (Email / Save Status) ─────────────────────────────── */}
      <SaveStatusBanner
        id="lsa-bagging-status-banner"
        saveSuccess={savePhase === 'completed' || savePhase === 'email_failed'}
        savePhase={savePhase}
        date={date}
        analysisName="LSA Bagging Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => setSavePhase('idle')}
        saving={saving || retryingEmail}
      />

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 1: SHIFT COMPOSITE ANALYSIS (ONCE IN A SHIFT) ─────────────── */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Dark Gradient Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-400/30">
              <Layers className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                SHIFT ANALYSIS (ONCE IN A SHIFT)
              </h2>
              <p className="text-[11px] text-slate-300">
                Na₂CO₃, NaCl, Fe₂O₃, Na₂SO₄, VM, IR, BD, Turbidity
              </p>
            </div>
          </div>

          <span className="self-start sm:self-auto text-[10px] font-bold px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
            3 Shifts • 8 Parameters
          </span>
        </div>

        {/* Unified Table Structure */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            {/* Top Fixed Parameters Header */}
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200">
                <th className="py-3 px-4 text-xs font-extrabold uppercase tracking-wider text-slate-600 w-44 sticky left-0 bg-slate-50/95 z-10 shadow-r">
                  Shift / Schedule
                </th>

                {SHIFT_COMPONENTS.map((comp) => (
                  <th key={comp.key} className="py-3 px-2 text-center">
                    <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
                      {comp.label}
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      ({comp.subLabel})
                    </div>
                  </th>
                ))}

                {!isViewOnly && (
                  <th className="py-3 px-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-600 w-28">
                    Action
                  </th>
                )}
              </tr>
            </thead>

            {/* Shift 1, Shift 2, Shift 3 Rows */}
            <tbody className="divide-y divide-slate-100">
              {SHIFTS.map((shift) => {
                const shiftEdits = editedFields[shift.key] || {};
                const statusInfo = getShiftStatusInfo(shift.key);
                const isShiftRowDisabled = isShiftDisabled(shift.key);

                return (
                  <tr key={shift.key} className="hover:bg-slate-50/70 transition-colors">
                    {/* Shift Label */}
                    <td className="py-3.5 px-4 align-middle sticky left-0 bg-white hover:bg-slate-50/90 z-10">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0">
                          <Clock className={`w-3.5 h-3.5 ${shift.iconColor}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-slate-900">
                              {shift.name}
                            </span>
                            <span
                              id={`lsa-shift-status-${shift.key}`}
                              className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border shadow-2xs ${statusInfo.badgeClass}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {shift.timing}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 8 Component Inputs */}
                    {SHIFT_COMPONENTS.map((comp) => {
                      const val = shiftData[shift.key]?.[comp.key] ?? '';
                      const hasFormatError = errors[`shift_${shift.key}_${comp.key}`];
                      const limit = getCellLimit(plantId || 'sa', 'lsa-bagging', shift.key, comp.key) || SA_LSA_BAGGING_SHIFT_LIMITS[comp.key];
                      const validation = validateCellValue(val, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = val !== '' && val !== null && val !== undefined;
                      const isEdited = !!shiftEdits[comp.key];

                      return (
                        <td key={comp.key} className="py-2.5 px-2 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative inline-block w-full max-w-[105px]">
                              <input
                                id={`lsa-${shift.key}-${comp.key}`}
                                type="text"
                                inputMode="decimal"
                                disabled={isViewOnly || isShiftRowDisabled}
                                value={val}
                                placeholder={comp.placeholder}
                                title={
                                  isShiftRowDisabled
                                    ? `${shift.name} is ${statusInfo.label}`
                                    : limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${val} ${limit.unit} (Valid range: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${val} ${limit.unit} (Valid range: ${limit.formattedRange})`
                                      : `Valid range: ${limit.formattedRange}`
                                    : ''
                                }
                                onChange={(e) =>
                                  handleShiftInputChange(shift.key, comp.key, e.target.value)
                                }
                                className={`w-full px-2 py-1.5 text-xs sm:text-sm font-mono font-bold text-center rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isShiftRowDisabled
                                    ? 'border-2 border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-75'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : hasFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                    : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                                }`}
                                aria-label={`${shift.name} ${comp.label}`}
                              />

                              {/* EDITED BADGE */}
                              {isEdited && (
                                <span
                                  className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                                  title="Field previously edited"
                                >
                                  EDITED
                                </span>
                              )}

                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Range and Status Display */}
                            {hasFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isOutOfLimit && (
                                  <div
                                    id={`lsa-limit-badge-${shift.key}-${comp.key}`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                    title={`OUT OF LIMIT: ${val} ${limit?.unit || ''} (Valid range: ${limit?.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </div>
                                )}
                                {hasValue && isNormal && limit && (
                                  <div
                                    id={`lsa-status-${shift.key}-${comp.key}`}
                                    className="text-[9px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                    title={`NORMAL: within ${limit?.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </div>
                                )}
                                {limit?.formattedRange && (
                                  <span
                                    id={`lsa-range-${shift.key}-${comp.key}`}
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
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Independent Save Shift Action */}
                    {!isViewOnly && (
                      <td className="py-2.5 px-3 text-center align-middle">
                        <button
                          type="button"
                          id={`btn-save-shift-${shift.key}`}
                          onClick={() => handleSaveShiftClick(shift.key)}
                          disabled={saving || isShiftRowDisabled}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs whitespace-nowrap ${
                            isShiftRowDisabled
                              ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-70'
                              : statusInfo.status === 'FINAL_EDIT'
                              ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'
                              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                          }`}
                          title={
                            isShiftRowDisabled
                              ? `${shift.name} is ${statusInfo.label}`
                              : statusInfo.status === 'FINAL_EDIT'
                              ? `Save ${shift.name} (Final Edit Allowed)`
                              : `Save ${shift.name} independently`
                          }
                        >
                          {isShiftRowDisabled ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          <span>
                            {isShiftRowDisabled
                              ? `${shift.name} (${statusInfo.label})`
                              : statusInfo.status === 'FINAL_EDIT'
                              ? 'Save Final Edit'
                              : `Save ${shift.name}`}
                          </span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 2: HOURLY ROUTINE MONITORING (1 HRS ONCE: NaCl & BD) ───────── */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Dark Gradient Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-400/30">
              <Clock className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                HOURLY ROUTINE MONITORING (1 HR ONCE)
              </h2>
              <p className="text-[11px] text-slate-300">
                Continuous 1-Hour Monitoring: NaCl % & Bulk Density (BD)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 uppercase tracking-wider">
              {hourlyStats.totalFilled} Readings Recorded
            </span>
          </div>
        </div>

        {/* Toolbar: Filter Tabs & Add Custom Time + Save Hourly Button */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Shift Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveHourlyFilter('all')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                activeHourlyFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              All 24 Hours ({hourlyReadings.length})
            </button>
            {['Shift 1', 'Shift 2', 'Shift 3'].map((s) => {
              const count = hourlyReadings.filter((r) => r.shift === s).length;
              const sKey = normalizeToShiftKey(s);
              const sStatus = getShiftStatusInfo(sKey);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveHourlyFilter(s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                    activeHourlyFilter === s
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>{s} ({count})</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full border ${
                      activeHourlyFilter === s
                        ? 'bg-white/20 text-white border-white/30'
                        : sStatus.badgeClass
                    }`}
                  >
                    {sStatus.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Add Custom Slot Input & Independent Save Hourly Button */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {!isViewOnly && (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-md px-2 py-0.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Time:</span>
                <input
                  type="time"
                  value={newTimeInput}
                  onChange={(e) => setNewTimeInput(e.target.value)}
                  className="text-xs font-mono font-bold text-slate-800 focus:outline-none"
                />
              </div>
            )}

            {!isViewOnly && (
              <button
                type="button"
                onClick={handleAddHourlySlot}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition cursor-pointer shrink-0"
                title="Add specific custom reading time"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Hour</span>
              </button>
            )}

            {!isViewOnly && (
              <button
                type="button"
                id="btn-save-hourly"
                onClick={() => handleSaveHourlyClick()}
                disabled={saving || (activeHourlyFilter !== 'all' ? isShiftDisabled(activeHourlyFilter) : allShiftsLocked)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition shadow-2xs ${
                  (activeHourlyFilter !== 'all' ? isShiftDisabled(activeHourlyFilter) : allShiftsLocked)
                    ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60'
                    : 'text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                }`}
                title={
                  activeHourlyFilter !== 'all' && isShiftDisabled(activeHourlyFilter)
                    ? `${activeHourlyFilter} is ${getShiftStatusInfo(activeHourlyFilter).label}`
                    : allShiftsLocked
                    ? 'All shifts are permanently locked'
                    : 'Save hourly routine monitoring readings independently'
                }
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {activeHourlyFilter !== 'all'
                    ? `Save Hourly (${activeHourlyFilter})`
                    : 'Save Hourly'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Hourly Table */}
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 shadow-xs">
              <tr>
                <th className="py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider text-slate-600 w-16">
                  #
                </th>
                <th className="py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider text-slate-600 w-36">
                  Sampling Time
                </th>
                <th className="py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider text-slate-600 w-32">
                  Shift
                </th>
                <th className="py-2.5 px-4 text-center text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  <div className="font-mono text-sm font-extrabold text-slate-900">NaCl %</div>
                  <div className="text-[10px] text-slate-400 font-normal">Sodium Chloride (1 Hr Once)</div>
                </th>
                <th className="py-2.5 px-4 text-center text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  <div className="font-mono text-sm font-extrabold text-slate-900">BD (g/L)</div>
                  <div className="text-[10px] text-slate-400 font-normal">Bulk Density (1 Hr Once)</div>
                </th>
                <th className="py-2.5 px-4 text-center text-xs font-extrabold uppercase tracking-wider text-slate-600 w-28">
                  Status
                </th>
                <th className="py-2.5 px-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-600 w-16">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredHourlyRows.map((row, index) => {
                const rowShiftKey = normalizeToShiftKey(row.shift);
                const isRowDisabled = isViewOnly || isShiftDisabled(rowShiftKey);
                const rowShiftStatus = getShiftStatusInfo(rowShiftKey);
                const isFilled = row.nacl !== '' || row.bd !== '';
                const hourlyEdits = editedFields.hourly || {};
                const isEditedNacl = !!(hourlyEdits[row.id]?.nacl || hourlyEdits[row.time]?.nacl);
                const isEditedBd = !!(hourlyEdits[row.id]?.bd || hourlyEdits[row.time]?.bd);

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isFilled ? 'bg-blue-50/20 hover:bg-blue-50/40' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-2.5 px-4 text-xs font-mono text-slate-400">
                      {String(index + 1).padStart(2, '0')}
                    </td>

                    {/* Sampling Time */}
                    <td className="py-2.5 px-4 align-middle">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-xs font-mono font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {row.time}
                        </span>
                      </div>
                    </td>

                    {/* Shift Badge */}
                    <td className="py-2.5 px-4 align-middle">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          row.shift === 'Shift 1'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : row.shift === 'Shift 2'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-teal-50 text-teal-700 border-teal-200'
                        }`}
                      >
                        {row.shift}
                      </span>
                    </td>

                    {/* NaCl % Input */}
                    {(() => {
                      const limit = SA_LSA_BAGGING_HOURLY_LIMITS.nacl;
                      const validation = validateCellValue(row.nacl, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = row.nacl !== '' && row.nacl !== null && row.nacl !== undefined;
                      const hasError = errors[`hourly_${row.id}_nacl`];

                      return (
                        <td className="py-2.5 px-4 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative inline-block w-32 sm:w-36">
                              <input
                                id={`lsa-hourly-${row.id}-nacl`}
                                type="text"
                                inputMode="decimal"
                                disabled={isRowDisabled}
                                value={row.nacl}
                                placeholder="0.72"
                                title={
                                  isRowDisabled
                                    ? `${row.shift} is ${rowShiftStatus.label}`
                                    : isOutOfLimit
                                    ? `OUT OF LIMIT: ${row.nacl} % (Valid range: ${limit.formattedRange})`
                                    : hasValue
                                    ? `NORMAL: ${row.nacl} % (Valid range: ${limit.formattedRange})`
                                    : `Valid range: ${limit.formattedRange}`
                                }
                                onChange={(e) =>
                                  handleHourlyInputChange(row.id, 'nacl', e.target.value)
                                }
                                className={`w-full px-2 py-1.5 text-xs sm:text-sm font-mono font-bold text-center rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isRowDisabled
                                    ? 'border-2 border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-75'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : hasError
                                    ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                                    : hasValue && isNormal
                                    ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                    : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                                }`}
                                aria-label={`Hourly ${row.time} NaCl %`}
                              />

                              {/* EDITED BADGE */}
                              {isEditedNacl && (
                                <span
                                  className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                                  title="Field previously edited"
                                >
                                  EDITED
                                </span>
                              )}

                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {hasError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isOutOfLimit && (
                                  <div
                                    id={`lsa-hourly-limit-badge-${row.id}-nacl`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                    title={`OUT OF LIMIT: ${row.nacl} % (Valid range: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </div>
                                )}
                                {hasValue && isNormal && (
                                  <div
                                    id={`lsa-hourly-status-${row.id}-nacl`}
                                    className="text-[9px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </div>
                                )}
                                <span
                                  id={`lsa-hourly-range-${row.id}-nacl`}
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
                            )}
                          </div>
                        </td>
                      );
                    })()}

                    {/* BD Input */}
                    {(() => {
                      const limit = SA_LSA_BAGGING_HOURLY_LIMITS.bd;
                      const validation = validateCellValue(row.bd, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = row.bd !== '' && row.bd !== null && row.bd !== undefined;
                      const hasError = errors[`hourly_${row.id}_bd`];

                      return (
                        <td className="py-2.5 px-4 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative inline-block w-32 sm:w-36">
                              <input
                                id={`lsa-hourly-${row.id}-bd`}
                                type="text"
                                inputMode="decimal"
                                disabled={isRowDisabled}
                                value={row.bd}
                                placeholder="635"
                                title={
                                  isRowDisabled
                                    ? `${row.shift} is ${rowShiftStatus.label}`
                                    : isOutOfLimit
                                    ? `OUT OF LIMIT: ${row.bd} g/L (Valid range: ${limit.formattedRange})`
                                    : hasValue
                                    ? `NORMAL: ${row.bd} g/L (Valid range: ${limit.formattedRange})`
                                    : `Valid range: ${limit.formattedRange}`
                                }
                                onChange={(e) =>
                                  handleHourlyInputChange(row.id, 'bd', e.target.value)
                                }
                                className={`w-full px-2 py-1.5 text-xs sm:text-sm font-mono font-bold text-center rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isRowDisabled
                                    ? 'border-2 border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-75'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : hasError
                                    ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                                    : hasValue && isNormal
                                    ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                    : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                                }`}
                                aria-label={`Hourly ${row.time} Bulk Density BD`}
                              />

                              {/* EDITED BADGE */}
                              {isEditedBd && (
                                <span
                                  className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                                  title="Field previously edited"
                                >
                                  EDITED
                                </span>
                              )}

                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {hasError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isOutOfLimit && (
                                  <div
                                    id={`lsa-hourly-limit-badge-${row.id}-bd`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                    title={`OUT OF LIMIT: ${row.bd} g/L (Valid range: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </div>
                                )}
                                {hasValue && isNormal && (
                                  <div
                                    id={`lsa-hourly-status-${row.id}-bd`}
                                    className="text-[9px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </div>
                                )}
                                <span
                                  id={`lsa-hourly-range-${row.id}-bd`}
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
                            )}
                          </div>
                        </td>
                      );
                    })()}

                    {/* Status Badge */}
                    <td className="py-2.5 px-4 text-center align-top pt-3.5">
                      {(() => {
                        const naclVal = validateCellValue(row.nacl, SA_LSA_BAGGING_HOURLY_LIMITS.nacl);
                        const bdVal = validateCellValue(row.bd, SA_LSA_BAGGING_HOURLY_LIMITS.bd);
                        const hasAnyVal = (row.nacl !== '' && row.nacl !== null && row.nacl !== undefined) || (row.bd !== '' && row.bd !== null && row.bd !== undefined);
                        const anyOutOfLimit = (row.nacl !== '' && naclVal.isOutOfLimit) || (row.bd !== '' && bdVal.isOutOfLimit);

                        if (!hasAnyVal) {
                          return (
                            <span className="text-[10px] font-medium text-slate-400">
                              Pending
                            </span>
                          );
                        }

                        if (anyOutOfLimit) {
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-300">
                              <AlertCircle className="w-3 h-3 text-rose-600" /> Out of Limit
                            </span>
                          );
                        }

                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" /> Normal
                          </span>
                        );
                      })()}
                    </td>

                    {/* Delete Custom Row */}
                    <td className="py-2.5 px-3 text-center align-top pt-3.5">
                      {row.isCustom && !isViewOnly ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteHourlySlot(row.id, row.shift)}
                          disabled={isRowDisabled}
                          className={`p-1 rounded transition ${
                            isRowDisabled
                              ? 'text-slate-300 cursor-not-allowed opacity-50'
                              : 'text-slate-400 hover:text-red-600 cursor-pointer'
                          }`}
                          title={isRowDisabled ? `Cannot delete: ${row.shift} is ${rowShiftStatus.label}` : 'Delete slot'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Hourly Summary Statistics Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span className="font-semibold">
              Showing <strong>{filteredHourlyRows.length}</strong> hourly intervals
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-2xs flex items-center gap-1.5">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Avg NaCl %:</span>
              <span className="font-mono font-extrabold text-blue-700">{hourlyStats.avgNacl} %</span>
            </div>

            <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-2xs flex items-center gap-1.5">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Avg BD:</span>
              <span className="font-mono font-extrabold text-blue-700">{hourlyStats.avgBd} g/L</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Information / Standards Reference Footer Card ────────────────────── */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <Activity className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-slate-800">
            LSA Bagging Operational Protocol:
          </div>
          <p className="text-slate-500 leading-relaxed">
            • <strong>Once in a Shift:</strong> Record composite sample analysis for{' '}
            <code className="bg-slate-200/70 px-1 py-0.5 rounded text-slate-700 font-mono">
              Na₂CO₃, NaCl, Fe₂O₃, Na₂SO₄, VM, IR, BD, Turbidity
            </code>{' '}
            for Shift 1, Shift 2, and Shift 3. Each shift is saved independently.
            <br />
            • <strong>1 Hr Once:</strong> Routine monitoring of{' '}
            <code className="bg-slate-200/70 px-1 py-0.5 rounded text-slate-700 font-mono">
              NaCl %
            </code>{' '}
            and{' '}
            <code className="bg-slate-200/70 px-1 py-0.5 rounded text-slate-700 font-mono">
              Bulk Density (BD)
            </code>{' '}
            recorded at 1-hour intervals across operating shifts.
          </p>
        </div>
      </div>

      {/* ── Confirmation Modal ──────────────────────────────────────────────── */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold tracking-tight text-slate-100">
                  {confirmModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                {confirmModal.message}
              </p>

              {/* Items Preview */}
              {confirmModal.items && confirmModal.items.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5 text-xs">
                  {confirmModal.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-200/50 last:border-0">
                      <span className="font-semibold text-slate-600">{item.label}:</span>
                      <span className="font-mono font-bold text-slate-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Notification Recipient Notice */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-[11px]">
                <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  Notification recipient: <strong>{recipientEmail || ''}</strong> (SA Plant Assigned User)
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 transition border border-slate-200 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : 'Confirm & Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LSABaggingAnalysisPage;
