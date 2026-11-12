import React, { useState, useCallback, useEffect } from 'react';
import AnalysisHeader from '../../components/common/AnalysisHeader';
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
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Factory,
  Database,
  Lock,
  Clock,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';

// ─── CR 202 Parameters & Limits Configuration (ACL Plant ONLY) ────────────────
// Frequency: ONCE IN A SHIFT
// Unit: strictly Kgm/m³
//
// Parameters and official limits:
// 1. FNH3: Target: 3.10 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 3.00–3.20 Kgm/m³
// 2. CNH3: Target: 2.98 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 2.88–3.08 Kgm/m³
// 3. TCL:  Target: 4.65 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 4.55–4.75 Kgm/m³
// 4. PCL:  Target: 1.90 Kgm/m³, Tolerance: ±0.10 Kgm/m³, Allowed range: 1.80–2.00 Kgm/m³

export const CR202_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 3.10,
    tolerance: 0.10,
    min: 3.00,
    max: 3.20,
    unit: 'Kgm/m³',
    formattedRange: '3.00–3.20 Kgm/m³',
    formattedTarget: '3.10 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.10',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 2.98,
    tolerance: 0.10,
    min: 2.88,
    max: 3.08,
    unit: 'Kgm/m³',
    formattedRange: '2.88–3.08 Kgm/m³',
    formattedTarget: '2.98 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '2.98',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 4.65,
    tolerance: 0.10,
    min: 4.55,
    max: 4.75,
    unit: 'Kgm/m³',
    formattedRange: '4.55–4.75 Kgm/m³',
    formattedTarget: '4.65 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '4.65',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 1.90,
    tolerance: 0.10,
    min: 1.80,
    max: 2.00,
    unit: 'Kgm/m³',
    formattedRange: '1.80–2.00 Kgm/m³',
    formattedTarget: '1.90 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.90',
  },
};

// 8 Streams (A through H) for CR 202
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[80px] border-r border-slate-800/50' },
];

// 4-Hourly Time Slots mapped to 3 shifts
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftGroup: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftGroup: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftGroup: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftGroup: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftGroup: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftGroup: 'shift3' },
];

const SHIFT_MAPPING = [
  { key: 'shift1', name: 'I SHIFT (06:00 – 14:00)', slotKeys: ['t07', 't11'] },
  { key: 'shift2', name: 'II SHIFT (14:00 – 22:00)', slotKeys: ['t15', 't19'] },
  { key: 'shift3', name: 'III SHIFT (22:00 – 06:00)', slotKeys: ['t23', 't03'] },
];

const UNITS_ORDER = ['t07', 't11', 't15', 't19', 't23', 't03'];

const isValueDifferent = (oldVal, newVal) => {
  if (oldVal === undefined || oldVal === null || oldVal === '' || oldVal === '—' || oldVal === '-') oldVal = null;
  if (newVal === undefined || newVal === null || newVal === '' || newVal === '—' || newVal === '-') newVal = null;
  if (oldVal === null && newVal === null) return false;
  if (oldVal === null || newVal === null) return true;
  if (!isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
    return Number(oldVal) !== Number(newVal);
  }
  return String(oldVal) !== String(newVal);
};

const buildEmptyTimeRows = () =>
  Object.fromEntries(
    TIME_SLOTS.map((slot) => [
      slot.key,
      {
        ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
        avgTcl: '',
        avgAH: '',
      },
    ])
  );

const buildEmptyFnh3Row = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
  avgAH: '',
});

const buildEmptyPclRow = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
  avgAH: '',
});

// Asia/Kolkata current date helper
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

const getRowStyles = (shiftGroup) => {
  if (shiftGroup === 'shift1') {
    return {
      row:        'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
      badge:      'bg-blue-100 text-blue-800 border border-blue-200',
      inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  }
  if (shiftGroup === 'shift2') {
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

// Compute average across streams A through H (sum / 8)
const computeAvgAH = (rowObj) => {
  let sum = 0;
  let count = 0;
  STREAMS.forEach((s) => {
    const val = rowObj[s.key];
    if (val !== '' && val !== null && val !== undefined && !isNaN(Number(val))) {
      sum += Number(val);
      count++;
    }
  });
  if (count === 0) return '';
  return (sum / 8).toFixed(2);
};

// ─── Individual Cell Component with Limit Badges & EDITED Indicator ─────────
const CR202Cell = ({
  id,
  value,
  onChange,
  limit,
  isInvalidFormat,
  formatErrorMessage,
  inputFocusStyle,
  ariaLabel,
  disabled = false,
  maxWidth = 'max-w-[80px]',
  isEdited = false,
}) => {
  const validation = validateCellValue(value, limit);
  const isOutOfLimit = validation.isOutOfLimit;
  const isNormal = validation.isNormal;
  const hasValue = value !== '' && value !== null && value !== undefined;

  return (
    <div className={`flex flex-col items-center justify-start min-h-[58px] ${maxWidth} mx-auto`}>
      <div className="relative w-full">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          placeholder={limit?.placeholder || '0.00'}
          disabled={disabled}
          onChange={onChange}
          title={
            disabled
              ? 'Field is locked for editing'
              : limit
              ? isOutOfLimit
                ? `OUT OF LIMIT: ${value} Kgm/m³ (Allowed: ${limit.formattedRange})`
                : hasValue
                ? `NORMAL: ${value} Kgm/m³`
                : `Target: ${limit.formattedTarget} (${limit.formattedTolerance})`
              : ''
          }
          className={`w-full text-center text-xs font-mono font-bold px-1.5 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
            disabled
              ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-not-allowed font-semibold'
              : isOutOfLimit
              ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
              : isInvalidFormat
              ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
              : hasValue && isNormal
              ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
              : inputFocusStyle
          }`}
          aria-label={ariaLabel}
        />

        {/* Small EDITED badge */}
        {isEdited && hasValue && (
          <span
            className="absolute -top-1.5 -left-1.5 bg-amber-500 text-white rounded px-1 text-[8px] font-black tracking-wider uppercase shadow-xs pointer-events-none"
            title="Modified after initial save"
          >
            EDITED
          </span>
        )}

        {/* Out of limit alert dot */}
        {isOutOfLimit && (
          <span
            className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
            title="Out of limit"
          >
            <AlertCircle className="w-2 h-2 text-white" />
          </span>
        )}
      </div>

      {/* Invalid numeric error message */}
      {isInvalidFormat && (
        <div className="text-[8.5px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
          <AlertCircle className="w-2 h-2 shrink-0 text-red-600" />
          <span>{formatErrorMessage}</span>
        </div>
      )}

      {/* Status & Range */}
      {!isInvalidFormat && (
        <div className="mt-0.5 flex flex-col items-center justify-center">
          {hasValue && isNormal && (
            <span
              className="text-[9px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5"
            >
              <CheckCircle2 className="w-2 h-2 text-emerald-600 shrink-0" />
              <span>OK</span>
            </span>
          )}

          {hasValue && isOutOfLimit && (
            <span
              className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[8.5px] font-black tracking-tight whitespace-nowrap flex items-center justify-center gap-0.5 shadow-2xs"
            >
              <AlertCircle className="w-2 h-2 text-rose-600 shrink-0" />
              <span>OUT</span>
            </span>
          )}

          <span
            className={`text-[8.5px] font-semibold tracking-tight ${
              isOutOfLimit
                ? 'text-rose-700 font-bold'
                : hasValue
                ? 'text-slate-600 font-bold'
                : 'text-slate-400'
            }`}
          >
            {limit?.min && limit?.max ? `${limit.min}–${limit.max}` : ''}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CR202AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── Limits from Central Registry ──
  const limitFNH3 = getCellLimit(plantId, 'cr202', 'shift', 'fnh3') || CR202_LIMITS.fnh3;
  const limitCNH3 = getCellLimit(plantId, 'cr202', 'shift', 'cnh3') || CR202_LIMITS.cnh3;
  const limitTCL  = getCellLimit(plantId, 'cr202', 'shift', 'tcl')  || CR202_LIMITS.tcl;
  const limitPCL  = getCellLimit(plantId, 'cr202', 'shift', 'pcl')  || CR202_LIMITS.pcl;

  // ── State (Date strictly restricted to Operating Date in Asia/Kolkata) ──
  const [date]                                      = useState(() => getOperatingDateIST());
  const [timeRows, setTimeRows]                     = useState(buildEmptyTimeRows());
  const [fnh3Row, setFnh3Row]                       = useState(buildEmptyFnh3Row());
  const [pclRow, setPclRow]                         = useState(buildEmptyPclRow());
  const [originalTimeRows, setOriginalTimeRows]     = useState(null);
  const [originalFnh3Row, setOriginalFnh3Row]       = useState(null);
  const [originalPclRow, setOriginalPclRow]         = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lockedSlots, setLockedSlots]               = useState({});
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  /**
   * Slot-level lock state derivation:
   * Returns: 'locked' | 'open' | 'waiting'
   * - Fresh date: only t07 is 'open'; all others are 'waiting'
   * - A slot is 'locked' if slot.isLocked/correctionUsed is true OR any successor slot isSaved
   * - A slot is 'open' if it's not locked AND its predecessor is saved (or index === 0)
   * - Otherwise, it is 'waiting'
   */
  const getSlotStatus = useCallback((slotKey) => {
    const index = UNITS_ORDER.indexOf(slotKey);
    if (index === -1) return 'locked';

    const slot = lockedSlots[slotKey] || {};
    if (slot.isLocked || slot.correctionUsed) {
      return 'locked';
    }

    for (let i = index + 1; i < UNITS_ORDER.length; i++) {
      if (lockedSlots[UNITS_ORDER[i]]?.isSaved) {
        return 'locked';
      }
    }

    if (index === 0) {
      return 'open';
    }

    const prevKey = UNITS_ORDER[index - 1];
    if (lockedSlots[prevKey]?.isSaved) {
      return 'open';
    }

    return 'waiting';
  }, [lockedSlots]);

  const isSlotDisabled = useCallback((slotKey) => {
    if (isViewOnly) return true;
    return getSlotStatus(slotKey) !== 'open';
  }, [isViewOnly, getSlotStatus]);

  const getShiftStatus = useCallback((shiftKey) => {
    const shiftObj = SHIFT_MAPPING.find((s) => s.key === shiftKey);
    if (!shiftObj) return { label: 'WAITING', bg: 'bg-slate-100 text-slate-500 border border-slate-200' };

    const slotStatuses = shiftObj.slotKeys.map((sKey) => getSlotStatus(sKey));
    const allLocked = slotStatuses.every((st) => st === 'locked');
    if (allLocked) {
      return { label: 'LOCKED', bg: 'bg-slate-200 text-slate-700' };
    }

    const anyOpen = slotStatuses.some((st) => st === 'open');
    if (anyOpen) {
      return { label: 'ACTIVE', bg: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
    }

    return { label: 'WAITING', bg: 'bg-amber-100 text-amber-700 border border-amber-300' };
  }, [getSlotStatus]);

  // Fetch existing data for current date
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/cr-202-analysis?date=${date}`);
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
            const fetchedTRows = record.timeRows || record.data?.timeRows;
            const fetchedFRow = record.fnh3Row || record.data?.fnh3Row;
            const fetchedPRow = record.pclRow || record.data?.pclRow;

            if (fetchedTRows && typeof fetchedTRows === 'object') {
              const populatedTRows = buildEmptyTimeRows();
              TIME_SLOTS.forEach((slot) => {
                if (fetchedTRows[slot.key]) {
                  STREAMS.forEach((s) => {
                    const val = fetchedTRows[slot.key][s.key];
                    populatedTRows[slot.key][s.key] = val !== null && val !== undefined ? String(val) : '';
                  });
                  populatedTRows[slot.key].avgTcl = fetchedTRows[slot.key].avgTcl !== null && fetchedTRows[slot.key].avgTcl !== undefined ? String(fetchedTRows[slot.key].avgTcl) : '';
                  populatedTRows[slot.key].avgAH = fetchedTRows[slot.key].avgAH !== null && fetchedTRows[slot.key].avgAH !== undefined ? String(fetchedTRows[slot.key].avgAH) : computeAvgAH(populatedTRows[slot.key]);
                }
              });
              setTimeRows(populatedTRows);
              setOriginalTimeRows(JSON.parse(JSON.stringify(populatedTRows)));
            } else {
              setTimeRows(buildEmptyTimeRows());
              setOriginalTimeRows(null);
            }

            if (fetchedFRow && typeof fetchedFRow === 'object') {
              const popF = buildEmptyFnh3Row();
              STREAMS.forEach((s) => {
                const val = fetchedFRow[s.key];
                popF[s.key] = val !== null && val !== undefined ? String(val) : '';
              });
              popF.avgAH = fetchedFRow.avgAH !== null && fetchedFRow.avgAH !== undefined ? String(fetchedFRow.avgAH) : computeAvgAH(popF);
              setFnh3Row(popF);
              setOriginalFnh3Row(JSON.parse(JSON.stringify(popF)));
            } else {
              setFnh3Row(buildEmptyFnh3Row());
              setOriginalFnh3Row(null);
            }

            if (fetchedPRow && typeof fetchedPRow === 'object') {
              const popP = buildEmptyPclRow();
              STREAMS.forEach((s) => {
                const val = fetchedPRow[s.key];
                popP[s.key] = val !== null && val !== undefined ? String(val) : '';
              });
              popP.avgAH = fetchedPRow.avgAH !== null && fetchedPRow.avgAH !== undefined ? String(fetchedPRow.avgAH) : computeAvgAH(popP);
              setPclRow(popP);
              setOriginalPclRow(JSON.parse(JSON.stringify(popP)));
            } else {
              setPclRow(buildEmptyPclRow());
              setOriginalPclRow(null);
            }

            const resLockedSlots = response.data?.lockedSlots || record.lockedSlots || record.data?.lockedSlots || {};
            setLockedSlots(resLockedSlots);
            setLockedShifts(record.lockedShifts || record.data?.lockedShifts || {});
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setTimeRows(buildEmptyTimeRows());
            setFnh3Row(buildEmptyFnh3Row());
            setPclRow(buildEmptyPclRow());
            setOriginalTimeRows(null);
            setOriginalFnh3Row(null);
            setOriginalPclRow(null);
            setLockedSlots({});
            setLockedShifts({});
            setEditedFields({});
          }
        } else {
          setTimeRows(buildEmptyTimeRows());
          setFnh3Row(buildEmptyFnh3Row());
          setPclRow(buildEmptyPclRow());
          setOriginalTimeRows(null);
          setOriginalFnh3Row(null);
          setOriginalPclRow(null);
          setLockedSlots({});
          setLockedShifts({});
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setTimeRows(buildEmptyTimeRows());
        setFnh3Row(buildEmptyFnh3Row());
        setPclRow(buildEmptyPclRow());
        setOriginalTimeRows(null);
        setOriginalFnh3Row(null);
        setOriginalPclRow(null);
        setLockedSlots({});
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
  const handleTimeCellChange = useCallback((rowKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isSlotDisabled(rowKey)) return;

    setTimeRows((prev) => {
      const updatedRow = { ...prev[rowKey], [paramKey]: value };
      if (STREAMS.some((s) => s.key === paramKey)) {
        updatedRow.avgAH = computeAvgAH(updatedRow);
      }
      return {
        ...prev,
        [rowKey]: updatedRow,
      };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isSlotDisabled]);

  const handleFnh3CellChange = useCallback((paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isViewOnly) return;

    setFnh3Row((prev) => {
      const updatedFnh3 = { ...prev, [paramKey]: value };
      if (STREAMS.some((s) => s.key === paramKey)) {
        updatedFnh3.avgAH = computeAvgAH(updatedFnh3);
      }
      return updatedFnh3;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`fnh3_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isViewOnly]);

  const handlePclCellChange = useCallback((paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isViewOnly) return;

    setPclRow((prev) => {
      const updatedPcl = { ...prev, [paramKey]: value };
      if (STREAMS.some((s) => s.key === paramKey)) {
        updatedPcl.avgAH = computeAvgAH(updatedPcl);
      }
      return updatedPcl;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`pcl_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isViewOnly]);

  // ── Reset ──
  const handleReset = () => {
    if (originalTimeRows) {
      setTimeRows(JSON.parse(JSON.stringify(originalTimeRows)));
    } else {
      setTimeRows(buildEmptyTimeRows());
    }
    if (originalFnh3Row) {
      setFnh3Row(JSON.parse(JSON.stringify(originalFnh3Row)));
    } else {
      setFnh3Row(buildEmptyFnh3Row());
    }
    if (originalPclRow) {
      setPclRow(JSON.parse(JSON.stringify(originalPclRow)));
    } else {
      setPclRow(buildEmptyPclRow());
    }
    setErrors({});
    setSaveSuccess(false);
    setSavePhase('idle');
    showToast('CR 202 analysis form reset.', 'info');
  };

  // ── Validation ──
  const validateForm = () => {
    let hasError = false;
    const newErrors = {};

    TIME_SLOTS.forEach((slot) => {
      STREAMS.forEach((s) => {
        const val = timeRows[slot.key][s.key];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${slot.key}_${s.key}`] = 'Invalid';
          hasError = true;
        }
      });
      const avgVal = timeRows[slot.key].avgTcl;
      if (avgVal !== '' && avgVal !== null && avgVal !== undefined && isNaN(Number(avgVal))) {
        newErrors[`${slot.key}_avgTcl`] = 'Invalid';
        hasError = true;
      }
    });

    STREAMS.forEach((s) => {
      const val = fnh3Row[s.key];
      if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
        newErrors[`fnh3_${s.key}`] = 'Invalid';
        hasError = true;
      }
      const pVal = pclRow[s.key];
      if (pVal !== '' && pVal !== null && pVal !== undefined && isNaN(Number(pVal))) {
        newErrors[`pcl_${s.key}`] = 'Invalid';
        hasError = true;
      }
    });

    setErrors(newErrors);
    return !hasError;
  };

  // Check if a row differs from original data
  const isSlotDiff = (oldSlot, newSlot) => {
    const fields = [...STREAMS.map((s) => s.key), 'avgTcl', 'avgAH'];
    return fields.some((f) => isValueDifferent(oldSlot?.[f], newSlot?.[f]));
  };

  const isRowDiff = (oldR, newR) => {
    const fields = [...STREAMS.map((s) => s.key), 'avgAH'];
    return fields.some((f) => isValueDifferent(oldR?.[f], newR?.[f]));
  };

  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validateForm()) {
      showToast('Please correct validation errors before saving.', 'error');
      return;
    }

    const changedSlots = [];
    UNITS_ORDER.forEach((sKey) => {
      if (isSlotDisabled(sKey)) return;
      const oldSlot = originalTimeRows ? originalTimeRows[sKey] : null;
      const newSlot = timeRows[sKey];
      if (isSlotDiff(oldSlot, newSlot)) {
        changedSlots.push(sKey);
      }
    });

    const fnh3Diff = isRowDiff(originalFnh3Row, fnh3Row);
    const pclDiff = isRowDiff(originalPclRow, pclRow);

    if (changedSlots.length === 0 && !fnh3Diff && !pclDiff) {
      showToast('No new or modified data found to save.', 'info');
      return;
    }

    if (changedSlots.length > 1) {
      const fields = [...STREAMS.map((s) => s.key), 'avgTcl', 'avgAH'];
      const slotDetails = changedSlots.map((sKey) => {
        const oldSlot = originalTimeRows ? originalTimeRows[sKey] : null;
        const newSlot = timeRows[sKey];
        const changedFields = fields
          .filter((f) => isValueDifferent(oldSlot?.[f], newSlot?.[f]))
          .map((f) => `${f}: '${oldSlot?.[f] ?? ''}' -> '${newSlot?.[f] ?? ''}'`);
        return `${sKey}[${changedFields.join(', ')}]`;
      });
      console.warn(`[CR 202 Save] Multiple changed slots detected: ${slotDetails.join(', ')}`);
      showToast(`Only one slot may be entered or edited per save. Detected changes in: ${slotDetails.join(', ')}`, 'warning');
      return;
    }

    let targetSlotKey = changedSlots[0];
    if (!targetSlotKey && (fnh3Diff || pclDiff)) {
      targetSlotKey = UNITS_ORDER.find((k) => !isSlotDisabled(k));
      if (!targetSlotKey) {
        showToast('All slots for today are permanently locked. Cannot edit FNH₃ or PCl.', 'warning');
        return;
      }
    }

    const targetSlotObj = TIME_SLOTS.find((s) => s.key === targetSlotKey);
    const isCorrection = Boolean(lockedSlots[targetSlotKey]?.isSaved && !lockedSlots[targetSlotKey]?.isLocked);

    setConfirmData({
      date,
      targetSlotKey,
      targetSlotObj,
      isCorrection,
      fnh3Diff,
      pclDiff,
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

    const targetSlotObj = confirmData?.targetSlotObj;
    const payload = {
      date,
      plant: plantId ? plantId.toUpperCase() : 'ACL',
      analysisType: 'CR 202 Analysis',
      crystallizer: 'CR 202',
      targetSlot: confirmData?.targetSlotKey,
      shift: targetSlotObj?.shift || 'I Shift',
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
      timeRows,
      fnh3Row,
      pclRow,
    };

    try {
      const response = await api.post('/api/cr-202-analysis', payload);

      if (response.data?.noChange) {
        showToast('No changes', 'info');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      if (!response?.data?.success) {
        showToast(response?.data?.message || 'Unable to save CR 202 data. Please try again.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setSaveSuccess(true);
      setSavePhase('completed');
      showToast(response.data?.message || `Successfully saved ${confirmData?.targetSlotKey} ✓`, 'success');

      const savedDoc = response.data?.data;
      if (savedDoc && (savedDoc._id || savedDoc.id)) {
        setRecordId(savedDoc._id || savedDoc.id);
      }
      if (response.data?.lockedSlots || savedDoc?.lockedSlots) {
        setLockedSlots(response.data?.lockedSlots || savedDoc?.lockedSlots);
      }
      if (response.data?.lockedShifts || savedDoc?.lockedShifts) {
        setLockedShifts(response.data?.lockedShifts || savedDoc?.lockedShifts);
      }
      if (response.data?.editedFields || savedDoc?.editedFields) {
        setEditedFields(response.data?.editedFields || savedDoc?.editedFields);
      }
      if (response.data?.editAuditHistory || savedDoc?.editAuditHistory) {
        setEditAuditHistory(response.data?.editAuditHistory || savedDoc?.editAuditHistory);
      }
      if (savedDoc?.timeRows) {
        const populatedTRows = buildEmptyTimeRows();
        TIME_SLOTS.forEach((slot) => {
          if (savedDoc.timeRows[slot.key]) {
            populatedTRows[slot.key] = { ...populatedTRows[slot.key], ...savedDoc.timeRows[slot.key] };
          }
        });
        setTimeRows(populatedTRows);
        setOriginalTimeRows(JSON.parse(JSON.stringify(populatedTRows)));
      }
      if (savedDoc?.fnh3Row) {
        const popF = buildEmptyFnh3Row();
        STREAMS.forEach((s) => {
          if (savedDoc.fnh3Row[s.key] !== undefined) popF[s.key] = String(savedDoc.fnh3Row[s.key] ?? '');
        });
        popF.avgAH = savedDoc.fnh3Row.avgAH !== null && savedDoc.fnh3Row.avgAH !== undefined ? String(savedDoc.fnh3Row.avgAH) : '';
        setFnh3Row(popF);
        setOriginalFnh3Row(JSON.parse(JSON.stringify(popF)));
      }
      if (savedDoc?.pclRow) {
        const popP = buildEmptyPclRow();
        STREAMS.forEach((s) => {
          if (savedDoc.pclRow[s.key] !== undefined) popP[s.key] = String(savedDoc.pclRow[s.key] ?? '');
        });
        popP.avgAH = savedDoc.pclRow.avgAH !== null && savedDoc.pclRow.avgAH !== undefined ? String(savedDoc.pclRow.avgAH) : '';
        setPclRow(popP);
        setOriginalPclRow(JSON.parse(JSON.stringify(popP)));
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Unable to save CR 202 data.', 'error');
      setSavePhase('idle');
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
      const response = await api.post(`/api/cr-202-analysis/${recordId}/retry-email`);
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
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-300 shadow-2xs ${bg}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb & Top Navigation ── */}
      <AnalysisHeader
        plantName="ACL Plant"
        analysisName="CR 202"
        title="CR 202 ANALYSIS"
        date={date}
        dateId="cr202-date-input"
        onBack={() => navigate(`${basePath}/plants/${plantId}`)}
        isViewOnly={isViewOnly}
        onSave={handleSaveClick}
        saving={saving}
        savePhase={savePhase}
        saveSuccess={saveSuccess}
        saveButtonId="btn-cr202-save"
        saveButtonTitle="Save active shift data and notify assigned user"
      />

      {/* ── Status Banner (Persistence & Email Result) ────────────────────────── */}
      <SaveStatusBanner
        id="cr202-status-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="CR 202 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Shift Status Tracker Bar ───────────────────────────────────────── */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-slate-700">Shift Workflow Status:</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {SHIFT_MAPPING.map((shift) => {
            const shiftStatus = getShiftStatus(shift.key);
            return (
              <div key={shift.key} className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600 text-[11px]">{shift.name.split(' ')[0]}:</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${shiftStatus.bg}`}>
                  {shiftStatus.label}
                </span>
              </div>
            );
          })}
        </div>
        {isViewOnly && (
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            View Only Mode (Operator/User)
          </span>
        )}
      </div>

      {/* ── Main Data Entry Table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            {/* Column headers with Super-Header for CNH3 */}
            <thead>
              {/* Row 1: Grouping Header */}
              <tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
                <th className="px-5 py-2 text-left w-36 border-r border-slate-800 text-slate-300">
                  CR 202
                </th>
                <th colSpan={8} className="px-3 py-2 text-center border-r border-slate-800 bg-blue-950/80 text-blue-200">
                  <span className="inline-flex items-center gap-2">
                    <span>←</span>
                    <span className="font-mono tracking-widest font-black">CNH₃ (2.88–3.08)</span>
                    <span>→</span>
                  </span>
                </th>
                <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[85px] border-r border-slate-800">
                  AVG
                </th>
                <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[85px]">
                  AVG
                </th>
              </tr>

              {/* Row 2: Sub-columns (Time, A through H, AVG TCl, AVG A-H) */}
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  Time / Shift
                </th>
                {STREAMS.map((s, idx) => (
                  <th
                    key={s.key}
                    className={`px-2.5 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    } ${s.colClass}`}
                  >
                    {s.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[85px] border-r border-slate-800">
                  TCl (4.55–4.75)
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[85px]">
                  A-H (2.88–3.08)
                </th>
              </tr>
            </thead>

            {/* Time Slot Rows (4-hourly) */}
            <tbody className="divide-y divide-slate-200">
              {TIME_SLOTS.map((slot) => {
                const styles = getRowStyles(slot.shiftGroup);
                const status = getSlotStatus(slot.key);
                const isDisabled = isSlotDisabled(slot.key);
                const slotSaved = Boolean(lockedSlots[slot.key]?.isSaved);

                return (
                  <tr
                    key={slot.key}
                    className={`transition-colors duration-100 ${styles.row} ${isDisabled ? 'opacity-85' : ''}`}
                  >
                    {/* Time slot & shift label */}
                    <td className="px-5 py-2.5 align-top">
                      <div className="flex flex-col gap-1.5 mt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                            {slot.time}
                          </span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}>
                            {slot.shift}
                          </span>
                        </div>
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
                              {slotSaved ? 'EDITABLE' : 'NEW'}
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

                    {/* Stream CNH3 input cells (A to H) */}
                    {STREAMS.map((stream) => {
                      const fieldKey = `${slot.key}_${stream.key}`;
                      const cellVal = timeRows[slot.key]?.[stream.key] ?? '';
                      const isEdited = Boolean(editedFields[fieldKey]) && cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      return (
                        <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                          <CR202Cell
                            id={`cr202-input-${slot.key}-${stream.key}`}
                            value={cellVal}
                            disabled={isDisabled}
                            onChange={(e) =>
                              handleTimeCellChange(slot.key, stream.key, e.target.value)
                            }
                            limit={limitCNH3}
                            isInvalidFormat={!!errors[fieldKey]}
                            formatErrorMessage={errors[fieldKey]}
                            inputFocusStyle={styles.inputFocus}
                            ariaLabel={`CNH3 Stream ${stream.label} at ${slot.time}`}
                            maxWidth="max-w-[78px]"
                            isEdited={isEdited}
                          />
                        </td>
                      );
                    })}

                    {/* AVG TCl cell */}
                    <td className="px-2 py-2 text-center align-top bg-slate-50/50 border-r border-slate-200">
                      <CR202Cell
                        id={`cr202-input-${slot.key}-avgtcl`}
                        value={timeRows[slot.key]?.avgTcl ?? ''}
                        disabled={isDisabled}
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgTcl', e.target.value)
                        }
                        limit={limitTCL}
                        isInvalidFormat={!!errors[`${slot.key}_avgTcl`]}
                        formatErrorMessage={errors[`${slot.key}_avgTcl`]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900"
                        ariaLabel={`AVG TCl at ${slot.time}`}
                        maxWidth="max-w-[82px]"
                        isEdited={Boolean(editedFields[`${slot.key}_avgTcl`]) && (timeRows[slot.key]?.avgTcl ?? '') !== ''}
                      />
                    </td>

                    {/* AVG A-H cell (Auto-calculated / Editable) */}
                    <td className="px-2 py-2 text-center align-top bg-slate-100/50">
                      <CR202Cell
                        id={`cr202-input-${slot.key}-avgah`}
                        value={timeRows[slot.key]?.avgAH ?? ''}
                        disabled={isDisabled}
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgAH', e.target.value)
                        }
                        limit={limitCNH3}
                        isInvalidFormat={!!errors[`${slot.key}_avgAH`]}
                        formatErrorMessage={errors[`${slot.key}_avgAH`]}
                        inputFocusStyle="border-2 border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-800"
                        ariaLabel={`AVG A-H at ${slot.time}`}
                        maxWidth="max-w-[82px]"
                        isEdited={Boolean(editedFields[`${slot.key}_avgAH`]) && (timeRows[slot.key]?.avgAH ?? '') !== ''}
                      />
                    </td>
                  </tr>
                );
              })}

              {/* ── Special Row: FNH3 ── */}
              <tr className="bg-emerald-50/40 hover:bg-emerald-100/50 border-t-2 border-emerald-300 border-l-4 border-l-emerald-600 transition-colors">
                <td className="px-5 py-3 align-middle">
                  <span className="text-xs font-extrabold text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded shadow-2xs inline-block whitespace-nowrap">
                    FNH₃
                  </span>
                </td>
                {STREAMS.map((stream) => {
                  const fieldKey = `fnh3_${stream.key}`;
                  const cellVal = fnh3Row?.[stream.key] ?? '';
                  const isEdited = Boolean(editedFields[fieldKey]);

                  return (
                    <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                      <CR202Cell
                        id={`cr202-input-fnh3-${stream.key}`}
                        value={cellVal}
                        disabled={isViewOnly}
                        onChange={(e) =>
                          handleFnh3CellChange(stream.key, e.target.value)
                        }
                        limit={limitFNH3}
                        isInvalidFormat={!!errors[fieldKey]}
                        formatErrorMessage={errors[fieldKey]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-900"
                        ariaLabel={`FNH3 Stream ${stream.label}`}
                        maxWidth="max-w-[78px]"
                        isEdited={isEdited}
                      />
                    </td>
                  );
                })}

                {/* Empty spacer for AVG TCl */}
                <td className="px-2 py-2 text-center align-middle bg-slate-100/40 border-r border-slate-200">
                  <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
                </td>

                {/* FNH3 AVG A-H */}
                <td className="px-2 py-2 text-center align-top bg-emerald-100/50">
                  <CR202Cell
                    id="cr202-input-fnh3-avgah"
                    value={fnh3Row?.avgAH ?? ''}
                    disabled={isViewOnly}
                    onChange={(e) =>
                      handleFnh3CellChange('avgAH', e.target.value)
                    }
                    limit={limitFNH3}
                    isInvalidFormat={!!errors['fnh3_avgAH']}
                    formatErrorMessage={errors['fnh3_avgAH']}
                    inputFocusStyle="border-2 border-emerald-300 bg-white hover:border-emerald-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-emerald-950 font-black"
                    ariaLabel="FNH3 AVG A-H"
                    maxWidth="max-w-[82px]"
                    isEdited={Boolean(editedFields['fnh3_avgAH'])}
                  />
                </td>
              </tr>

              {/* ── Special Row: PCl ── */}
              <tr className="bg-purple-50/40 hover:bg-purple-100/50 border-t border-purple-200 border-l-4 border-l-purple-600 transition-colors">
                <td className="px-5 py-3 align-middle">
                  <span className="text-xs font-extrabold text-purple-900 bg-purple-100 border border-purple-300 px-3 py-1 rounded shadow-2xs inline-block whitespace-nowrap">
                    PCl
                  </span>
                </td>
                {STREAMS.map((stream) => {
                  const fieldKey = `pcl_${stream.key}`;
                  const cellVal = pclRow?.[stream.key] ?? '';
                  const isEdited = Boolean(editedFields[fieldKey]);

                  return (
                    <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                      <CR202Cell
                        id={`cr202-input-pcl-${stream.key}`}
                        value={cellVal}
                        disabled={isViewOnly}
                        onChange={(e) =>
                          handlePclCellChange(stream.key, e.target.value)
                        }
                        limit={limitPCL}
                        isInvalidFormat={!!errors[fieldKey]}
                        formatErrorMessage={errors[fieldKey]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900"
                        ariaLabel={`PCl Stream ${stream.label}`}
                        maxWidth="max-w-[78px]"
                        isEdited={isEdited}
                      />
                    </td>
                  );
                })}

                {/* Empty spacer for AVG TCl */}
                <td className="px-2 py-2 text-center align-middle bg-slate-100/40 border-r border-slate-200">
                  <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
                </td>

                {/* PCl AVG A-H */}
                <td className="px-2 py-2 text-center align-top bg-purple-100/50">
                  <CR202Cell
                    id="cr202-input-pcl-avgah"
                    value={pclRow?.avgAH ?? ''}
                    disabled={isViewOnly}
                    onChange={(e) =>
                      handlePclCellChange('avgAH', e.target.value)
                    }
                    limit={limitPCL}
                    isInvalidFormat={!!errors['pcl_avgAH']}
                    formatErrorMessage={errors['pcl_avgAH']}
                    inputFocusStyle="border-2 border-purple-300 bg-white hover:border-purple-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-purple-950 font-black"
                    ariaLabel="PCl AVG A-H"
                    maxWidth="max-w-[82px]"
                    isEdited={Boolean(editedFields['pcl_avgAH'])}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Values for <strong>CR 202</strong> (CNH₃ A–H, AVG TCl, AVG A–H, FNH₃, PCl). Frequency: <strong>ONCE IN A SHIFT</strong>. Unit: <strong>Kgm/m³</strong>.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Slots: {TIME_SLOTS.length} + FNH₃ & PCl Streams
          </div>
        </div>
      </div>

      {/* ── Save Confirmation Modal ────────────────────────────────────────── */}
      <ConfirmSaveModal
        isOpen={Boolean(showConfirmModal && confirmData)}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        title={`Confirm Save — Slot ${confirmData?.targetSlotObj?.time || confirmData?.targetSlotKey || ''} (${confirmData?.targetSlotObj?.shift || ''}) (CR 202)`}
        subtitle={`ACL Plant for ${formatDateDisplay(confirmData?.date)}`}
        prompt="Please review the slot details before saving."
        isFinalEdit={confirmData?.isCorrection}
        warningNotice={confirmData?.isCorrection ? '⚠️ Notice: This is the single permitted correction edit for this time slot. After this save, this slot will be permanently locked.' : null}
        sections={confirmData?.targetSlotKey ? [
          {
            title: `Slot ${confirmData.targetSlotObj?.time || confirmData.targetSlotKey} Readings:`,
            items: [
              ...STREAMS.map((s) => {
                const val = timeRows[confirmData.targetSlotKey]?.[s.key];
                return {
                  label: `Stream ${s.label}`,
                  value: val === '' || val === null || val === undefined ? '—' : `${val} Kgm/m³`,
                };
              }),
              {
                label: 'AVG TCl',
                value: (timeRows[confirmData.targetSlotKey]?.avgTcl === '' || timeRows[confirmData.targetSlotKey]?.avgTcl === null || timeRows[confirmData.targetSlotKey]?.avgTcl === undefined)
                  ? '—'
                  : `${timeRows[confirmData.targetSlotKey]?.avgTcl} Kgm/m³`,
              },
              {
                label: 'AVG A-H',
                value: (timeRows[confirmData.targetSlotKey]?.avgAH === '' || timeRows[confirmData.targetSlotKey]?.avgAH === null || timeRows[confirmData.targetSlotKey]?.avgAH === undefined)
                  ? '—'
                  : `${timeRows[confirmData.targetSlotKey]?.avgAH} Kgm/m³`,
              },
            ],
          },
          ...(confirmData.fnh3Diff || confirmData.pclDiff ? [
            {
              title: 'Global Readings (FNH₃ & PCl):',
              items: [
                ...(confirmData.fnh3Diff ? STREAMS.map((s) => {
                  const val = fnh3Row[s.key];
                  return {
                    label: `FNH₃ (${s.label})`,
                    value: val === '' || val === null || val === undefined ? '—' : `${val} Kgm/m³`,
                  };
                }) : []),
                ...(confirmData.pclDiff ? STREAMS.map((s) => {
                  const val = pclRow[s.key];
                  return {
                    label: `PCl (${s.label})`,
                    value: val === '' || val === null || val === undefined ? '—' : `${val} Kgm/m³`,
                  };
                }) : []),
              ],
            },
          ] : []),
        ] : []}
        columns={4}
      />

    </div>
  );
};

export default CR202AnalysisPage;
