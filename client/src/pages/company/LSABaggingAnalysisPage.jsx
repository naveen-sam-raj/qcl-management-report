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
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';

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

const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).replace(/\//g, '.');
  } catch {
    return isoDate;
  }
};

const isValidDecimal = (val) => {
  if (val === '' || val === null || val === undefined) return true;
  return /^-?\d*(\.\d*)?$/.test(String(val).trim());
};

const LSABaggingAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // ── Locked Operating Date ──
  const [date] = useState(() => getOperatingDateIST());

  // ── States ──
  const [recordId, setRecordId] = useState(null);
  const [shiftData, setShiftData] = useState(buildInitialShiftData);
  const [originalShiftData, setOriginalShiftData] = useState(null);
  const [hourlyReadings, setHourlyReadings] = useState(() => DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s })));
  const [originalHourlyReadings, setOriginalHourlyReadings] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [lockedShifts, setLockedShifts] = useState({
    shift1Saved: false,
    shift2Saved: false,
    shift3Saved: false,
    shift1Locked: false,
    shift2Locked: false,
    shift3Locked: false,
    shift1Edits: 0,
    shift2Edits: 0,
    shift3Edits: 0,
  });
  const [originalLockedShifts, setOriginalLockedShifts] = useState(null);

  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [errors, setErrors] = useState({});

  const [activeHourlyFilter, setActiveHourlyFilter] = useState('all');
  const [newTimeInput, setNewTimeInput] = useState('');

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null,
    shiftKey: null,
    title: '',
    message: '',
    items: [],
  });

  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');

  // ── Helpers to merge DB values with defaults ──
  const mergeShiftWithDefaults = (dbShifts) => {
    const init = buildInitialShiftData();
    if (!dbShifts) return init;
    return {
      shift1: { ...init.shift1, ...(dbShifts.shift1 || {}) },
      shift2: { ...init.shift2, ...(dbShifts.shift2 || {}) },
      shift3: { ...init.shift3, ...(dbShifts.shift3 || {}) },
    };
  };

  const mergeHourlyWithDefaults = (dbHours) => {
    if (!Array.isArray(dbHours) || dbHours.length === 0) {
      return DEFAULT_HOURLY_SLOTS.map((s) => ({ ...s }));
    }

    const merged = DEFAULT_HOURLY_SLOTS.map((defSlot) => {
      const found = dbHours.find((h) => h.time === defSlot.time);
      return found ? { ...defSlot, ...found } : { ...defSlot };
    });

    const customSlots = dbHours.filter(
      (h) => !DEFAULT_HOURLY_SLOTS.some((def) => def.time === h.time)
    );

    return [...merged, ...customSlots];
  };

  // ── Sequential Shift Locking State Resolvers ──
  const isShiftDisabled = useCallback(
    (keyOrName) => {
      if (isViewOnly) return true;
      const key = normalizeToShiftKey(keyOrName);

      if (key === 'shift1') {
        return Boolean(lockedShifts.shift1Locked || lockedShifts.shift2Saved || (lockedShifts.shift1Edits || 0) > 0);
      }
      if (key === 'shift2') {
        if (!lockedShifts.shift1Saved) return true;
        return Boolean(lockedShifts.shift2Locked || lockedShifts.shift3Saved || (lockedShifts.shift2Edits || 0) > 0);
      }
      if (key === 'shift3') {
        if (!lockedShifts.shift2Saved) return true;
        return Boolean(lockedShifts.shift3Locked || (lockedShifts.shift3Edits || 0) > 0);
      }
      return false;
    },
    [lockedShifts, isViewOnly]
  );

  const getShiftStatusInfo = useCallback(
    (keyOrName) => {
      const key = normalizeToShiftKey(keyOrName);

      if (key === 'shift1') {
        if (lockedShifts.shift1Locked || lockedShifts.shift2Saved || (lockedShifts.shift1Edits || 0) > 0) {
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
        if (lockedShifts.shift2Locked || lockedShifts.shift3Saved || (lockedShifts.shift2Edits || 0) > 0) {
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
        if (lockedShifts.shift3Locked || (lockedShifts.shift3Edits || 0) > 0) {
          return { status: 'LOCKED', label: 'LOCKED', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300' };
        }
        if (lockedShifts.shift3Saved) {
          return { status: 'FINAL_EDIT', label: 'FINAL EDIT', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' };
        }
        return { status: 'NEW', label: 'NEW', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' };
      }

      return { status: 'UNKNOWN', label: 'UNKNOWN', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    },
    [lockedShifts]
  );

  const allShiftsLocked = useMemo(() => {
    return isShiftDisabled('shift1') && isShiftDisabled('shift2') && isShiftDisabled('shift3');
  }, [isShiftDisabled]);

  // ── Fetch existing data on mount ──
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
            shift1Edits: 0,
            shift2Edits: 0,
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

  // ── Add Custom Hourly Slot ──
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
      showToast?.(`Sampling time ${newTimeInput} already exists in schedule.`, 'warning');
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
    // Check if slot was already saved in DB
    const isSavedCustom = originalHourlyReadings?.some((r) => r.id === id || (r.time === hourlyReadings.find(x => x.id === id)?.time && r.isCustom));
    if (isSavedCustom && isShiftDisabled(shiftName)) {
      showToast?.(`Cannot delete saved custom hourly slot '${id}'.`, 'error');
      return;
    }
    setHourlyReadings((prev) => prev.filter((row) => row.id !== id));
    showToast?.('Custom hourly sampling slot removed.', 'info');
  };

  // ── Reset Handler ──
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

  const validateHourly = (shiftFilter = 'all') => {
    let isValid = true;
    const newErrors = { ...errors };

    hourlyReadings.forEach((row) => {
      if (shiftFilter !== 'all' && row.shift !== shiftFilter) return;
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

  // ── Save Confirmation Dialogs ──
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
        ? `Are you sure you want to save the final edit for ${shiftDef?.name}? WARNING: After this save, all three shifts for this date will be permanently LOCKED.`
        : `Are you sure you want to save ${shiftDef?.name} Shift Analysis?`,
      items,
    });
  };

  const handleSaveHourlyClick = (shiftFilter = activeHourlyFilter) => {
    if (!validateHourly(shiftFilter)) {
      showToast?.('Please correct numeric errors before saving.', 'error');
      return;
    }

    let targetShiftKey = shiftFilter !== 'all' ? normalizeToShiftKey(shiftFilter) : null;

    if (!targetShiftKey) {
      // Find which shift has modifications
      const changedShifts = [];
      for (const sDef of SHIFTS) {
        const curRows = hourlyReadings.filter((r) => r.shift === sDef.name);
        const oldRows = (originalHourlyReadings || []).filter((r) => r.shift === sDef.name);

        let hasDiff = false;
        if (curRows.length !== oldRows.length) {
          hasDiff = true;
        } else {
          for (const cr of curRows) {
            const er = oldRows.find((r) => r.time === cr.time);
            if (!er || cr.nacl !== er.nacl || cr.bd !== er.bd) {
              hasDiff = true;
              break;
            }
          }
        }
        if (hasDiff) changedShifts.push(sDef.key);
      }

      if (changedShifts.length === 0) {
        showToast?.('No changes in hourly routine monitoring.', 'info');
        return;
      }
      if (changedShifts.length > 1) {
        showToast?.('Hourly readings have modifications in multiple shifts. Please select a specific shift tab to save one shift at a time.', 'warning');
        return;
      }
      targetShiftKey = changedShifts[0];
    }

    if (isShiftDisabled(targetShiftKey)) {
      showToast?.(`Cannot save hourly readings for ${targetShiftKey.toUpperCase()}: shift is ${getShiftStatusInfo(targetShiftKey).label}.`, 'warning');
      return;
    }

    const shiftDisplayName = SHIFTS.find((s) => s.key === targetShiftKey)?.name;
    const recordedHours = hourlyReadings.filter((r) => {
      const rowMatches = r.shift === shiftDisplayName;
      const hasVal = (r.nacl !== '' && r.nacl !== null && r.nacl !== undefined) || (r.bd !== '' && r.bd !== null && r.bd !== undefined);
      return rowMatches && hasVal;
    });

    if (recordedHours.length === 0) {
      showToast?.(`Please enter at least one hourly reading for ${shiftDisplayName} before saving.`, 'warning');
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'hourly',
      shiftKey: targetShiftKey,
      title: `Confirm Save — Hourly Routine Monitoring (${shiftDisplayName})`,
      message: `Are you sure you want to save the continuous hourly readings for ${shiftDisplayName}?`,
      items: recordedHours.map((r) => ({
        label: `${r.time} (${r.shift})`,
        value: `NaCl: ${r.nacl ? r.nacl + '%' : '—'} | BD: ${r.bd ? r.bd + ' g/L' : '—'}`,
      })),
    });
  };

  // ── Confirm Save Execution ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');

    const saveType = confirmModal.type;
    const targetShift = confirmModal.shiftKey;

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

      if (response?.data?.noChange) {
        setSavePhase('idle');
        setSaving(false);
        showToast?.('No changes', 'info');
        return;
      }

      if (response?.data?.statusFromApi === 'disabled' || response?.data?.success) {
        setOriginalShiftData(JSON.parse(JSON.stringify(shiftData)));
        setOriginalHourlyReadings(JSON.parse(JSON.stringify(hourlyReadings)));
        setLastSaved(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }));

        const returnedDoc = response.data.data || response.data.record || {};
        const newEdited = response.data.editedFields || returnedDoc.editedFields || {};
        const newRecordId = response.data.recordId || returnedDoc._id || returnedDoc.id;

        setRecordId(newRecordId || recordId);
        setEditedFields(newEdited);

        if (response.data.lockedShifts || returnedDoc.lockedShifts) {
          const updatedLocks = response.data.lockedShifts || returnedDoc.lockedShifts;
          setLockedShifts(updatedLocks);
          setOriginalLockedShifts(JSON.parse(JSON.stringify(updatedLocks)));
        }

        setSavePhase('completed');
        setSaving(false);
        showToast?.('Saved ✓', 'success');
      } else {
        setSavePhase('idle');
        setSaving(false);
        showToast?.(response?.data?.message || 'Failed to save LSA Bagging Analysis.', 'error');
      }
    } catch (err) {
      console.error('Save error:', err);
      const msg = err.response?.data?.message || err.message || 'Error occurred while saving.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
      setSaving(false);
    }
  };

  const filteredHourlyRows = useMemo(() => {
    if (activeHourlyFilter === 'all') return hourlyReadings;
    return hourlyReadings.filter((row) => row.shift === activeHourlyFilter);
  }, [hourlyReadings, activeHourlyFilter]);

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

          {/* Right: Locked Date Section + Reset */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {lastSaved && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Saved at {lastSaved}
              </span>
            )}

            {/* Locked Operating Date Display */}
            <LockedDateDisplay
              date={date}
              id="lsa-bagging-locked-date"
              badgeText="Operating Day"
            />

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
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Banner (Email / Save Status) ─────────────────────────────── */}
      <SaveStatusBanner
        id="lsa-bagging-status-banner"
        saveSuccess={savePhase === 'completed'}
        savePhase={savePhase}
        date={date}
        analysisName="LSA Bagging Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={() => {}}
        onDismiss={() => setSavePhase('idle')}
        saving={saving}
      />

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 1: SHIFT-WISE COMPOSITE ANALYSIS (ONCE IN A SHIFT)
          ══════════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                SECTION 1: SHIFT COMPOSITE ANALYSIS
              </h2>
              <p className="text-xs text-slate-500">
                Frequency: <strong>Once in a Shift</strong> • 8 Chemical Parameters
              </p>
            </div>
          </div>
        </div>

        {/* Shift Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {SHIFTS.map((shift) => {
            const shiftStatus = getShiftStatusInfo(shift.key);
            const isShiftRowDisabled = isViewOnly || isShiftDisabled(shift.key);
            const isShiftSaved = Boolean(lockedShifts[`${shift.key}Saved`]);
            const shiftValues = shiftData[shift.key] || {};
            const hasDataEntered = Object.values(shiftValues).some((v) => v !== '' && v !== null && v !== undefined);

            return (
              <div
                key={shift.key}
                className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden flex flex-col justify-between shadow-xs ${
                  isShiftRowDisabled
                    ? 'border-slate-200/80 bg-slate-50/50 opacity-90'
                    : 'border-slate-300 hover:border-blue-400 hover:shadow-md'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-900 tracking-tight">
                        {shift.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {shift.timing}
                      </p>
                    </div>
                  </div>

                  <RecordStatusBadge status={shiftStatus.status} />
                </div>

                {/* Form Fields */}
                <div className="p-4 space-y-3.5 flex-1">
                  {SHIFT_COMPONENTS.map((comp) => {
                    const limit = SA_LSA_BAGGING_SHIFT_LIMITS[comp.key];
                    const val = shiftValues[comp.key];
                    const validation = validateCellValue(val, limit);
                    const isOutOfLimit = validation.isOutOfLimit;
                    const isNormal = validation.isNormal;
                    const hasValue = val !== '' && val !== null && val !== undefined;
                    const isEdited = !!editedFields[shift.key]?.[comp.key];
                    const hasError = errors[`shift_${shift.key}_${comp.key}`];

                    return (
                      <div key={comp.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label
                            htmlFor={`lsa-shift-${shift.key}-${comp.key}`}
                            className="font-bold text-slate-700 flex items-center gap-1"
                          >
                            <span>{comp.label}</span>
                            {isEdited && (
                              <span
                                className="text-[9px] font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded"
                                title="Field modified after first save"
                              >
                                EDITED
                              </span>
                            )}
                          </label>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {limit.formattedRange}
                          </span>
                        </div>

                        <div className="relative">
                          <input
                            id={`lsa-shift-${shift.key}-${comp.key}`}
                            type="text"
                            inputMode="decimal"
                            disabled={isShiftRowDisabled}
                            value={val}
                            placeholder={comp.placeholder}
                            title={
                              isShiftRowDisabled
                                ? `${shift.name} is ${shiftStatus.label}`
                                : isOutOfLimit
                                ? `OUT OF LIMIT: ${val} ${comp.unit} (Valid range: ${limit.formattedRange})`
                                : hasValue
                                ? `NORMAL: ${val} ${comp.unit} (Valid range: ${limit.formattedRange})`
                                : `Valid range: ${limit.formattedRange}`
                            }
                            onChange={(e) => handleShiftInputChange(shift.key, comp.key, e.target.value)}
                            className={`w-full px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all text-slate-900 focus:outline-none ${
                              hasError
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : isOutOfLimit
                                ? 'border-2 border-rose-500 bg-rose-50/80 text-rose-950 font-bold focus:ring-2 focus:ring-rose-200'
                                : hasValue && isNormal
                                ? 'border-emerald-400 bg-emerald-50/30 text-emerald-950 focus:ring-2 focus:ring-emerald-200'
                                : 'border-slate-300 bg-white hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                            } disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                            {comp.unit}
                          </span>
                        </div>

                        {/* Inline Warning/Error Label */}
                        <div className="flex items-center justify-between text-[10px]">
                          {hasError ? (
                            <span className="text-red-500 font-semibold">{hasError}</span>
                          ) : isOutOfLimit ? (
                            <span className="text-rose-600 font-bold inline-flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5" /> Out of Spec ({limit.formattedRange})
                            </span>
                          ) : hasValue && isNormal ? (
                            <span className="text-emerald-600 font-medium inline-flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Normal
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Spec: {limit.formattedRange}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Card Footer / Save Shift Button */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400 font-medium">
                    {isShiftSaved ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Saved
                      </span>
                    ) : (
                      <span>Not yet saved</span>
                    )}
                  </div>

                  {!isViewOnly && (
                    <button
                      id={`btn-save-shift-${shift.key}`}
                      onClick={() => handleSaveShiftClick(shift.key)}
                      disabled={saving || isShiftRowDisabled}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs whitespace-nowrap ${
                        isShiftRowDisabled
                          ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 cursor-pointer shadow-xs active:scale-[0.98]'
                      }`}
                      title={
                        isShiftRowDisabled
                          ? `${shift.name} is ${shiftStatus.label}`
                          : `Save ${shift.name} parameters`
                      }
                    >
                      <Save className="w-3 h-3" />
                      <span>{isShiftSaved ? 'Save Edit' : `Save ${shift.name}`}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 2: CONTINUOUS HOURLY ROUTINE MONITORING (1 HR ONCE)
          ══════════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                SECTION 2: HOURLY ROUTINE MONITORING
              </h2>
              <p className="text-xs text-slate-500">
                Frequency: <strong>1 Hr Once</strong> • 24 Standard Intervals • NaCl & BD Tracking
              </p>
            </div>
          </div>

          {/* Filter Tabs & Save Button */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              {['all', 'Shift 1', 'Shift 2', 'Shift 3'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveHourlyFilter(tab)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeHourlyFilter === tab
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {tab === 'all' ? 'All Shifts' : tab}
                </button>
              ))}
            </div>

            {!isViewOnly && (
              <button
                id="btn-save-hourly"
                onClick={() => handleSaveHourlyClick()}
                disabled={saving || (activeHourlyFilter !== 'all' ? isShiftDisabled(activeHourlyFilter) : allShiftsLocked)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition shadow-2xs ${
                  saving || (activeHourlyFilter !== 'all' ? isShiftDisabled(activeHourlyFilter) : allShiftsLocked)
                    ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 cursor-pointer shadow-xs active:scale-[0.98]'
                }`}
                title={
                  activeHourlyFilter !== 'all' && isShiftDisabled(activeHourlyFilter)
                    ? `${activeHourlyFilter} is ${getShiftStatusInfo(activeHourlyFilter).label}`
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
        <div className="overflow-x-auto max-h-[480px] bg-white rounded-xl border border-slate-200/90 shadow-xs">
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
                                onChange={(e) => handleHourlyInputChange(row.id, 'nacl', e.target.value)}
                                className={`w-full px-2.5 py-1 text-xs font-mono font-bold text-center rounded border transition focus:outline-none ${
                                  hasError
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50/80 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasValue && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/30 text-emerald-950 focus:ring-2 focus:ring-emerald-200'
                                    : 'border-slate-300 bg-white hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                } disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 pointer-events-none">
                                %
                              </span>
                            </div>

                            <div className="flex items-center justify-center gap-1 text-[9px] mt-1 leading-none">
                              <span className="text-slate-400">{limit.formattedRange}</span>
                              {isEditedNacl && (
                                <span className="font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                                  EDITED
                                </span>
                              )}
                            </div>
                            {hasError && <span className="text-[9px] text-red-500 mt-0.5">{hasError}</span>}
                          </div>
                        </td>
                      );
                    })()}

                    {/* BD (g/L) Input */}
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
                                onChange={(e) => handleHourlyInputChange(row.id, 'bd', e.target.value)}
                                className={`w-full px-2.5 py-1 text-xs font-mono font-bold text-center rounded border transition focus:outline-none ${
                                  hasError
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50/80 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasValue && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/30 text-emerald-950 focus:ring-2 focus:ring-emerald-200'
                                    : 'border-slate-300 bg-white hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                } disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 pointer-events-none">
                                g/L
                              </span>
                            </div>

                            <div className="flex items-center justify-center gap-1 text-[9px] mt-1 leading-none">
                              <span className="text-slate-400">{limit.formattedRange}</span>
                              {isEditedBd && (
                                <span className="font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                                  EDITED
                                </span>
                              )}
                            </div>
                            {hasError && <span className="text-[9px] text-red-500 mt-0.5">{hasError}</span>}
                          </div>
                        </td>
                      );
                    })()}

                    {/* Status Badge */}
                    <td className="py-2.5 px-4 text-center align-middle">
                      {isFilled ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                          <Check className="w-2.5 h-2.5 text-emerald-600" /> Recorded
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          Pending
                        </span>
                      )}
                    </td>

                    {/* Delete Custom Slot */}
                    <td className="py-2.5 px-3 text-center align-middle">
                      {row.isCustom && !isRowDisabled && (
                        <button
                          onClick={() => handleDeleteHourlySlot(row.id, row.shift)}
                          className="text-slate-400 hover:text-red-600 p-1 transition cursor-pointer"
                          title="Delete custom slot"
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

        {/* Add Custom Slot Input Bar & Footer Note */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div>
            <div className="text-slate-500 text-[11px]">
              Showing <strong className="text-slate-700">{filteredHourlyRows.length}</strong> hourly routine sampling slots.
            </div>
            <div className="text-[11px] text-slate-400 italic mt-0.5">
              One correction allowed after first save; saving the next shift locks the previous one.
            </div>
          </div>

          {!isViewOnly && (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={newTimeInput}
                onChange={(e) => setNewTimeInput(e.target.value)}
                placeholder="08:30"
                className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddHourlySlot}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-300 rounded-lg transition shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Slot</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Save Confirmation Modal ────────────────────────────────────────── */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-sm tracking-wide uppercase">
                <Save className="w-4 h-4 text-blue-400" />
                <span>{confirmModal.title}</span>
              </div>
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">{confirmModal.message}</p>

              {confirmModal.items && confirmModal.items.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
                  {confirmModal.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center pt-1.5 first:pt-0">
                      <span className="font-semibold text-slate-600">{item.label}</span>
                      <span className="font-mono font-bold text-slate-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LSABaggingAnalysisPage;
