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
  Clock,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';

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
        {isEdited && (
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

  // ── State (Date strictly restricted to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
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

            setLockedShifts(record.lockedShifts || record.data?.lockedShifts || {});
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setTimeRows(buildEmptyTimeRows());
            setFnh3Row(buildEmptyFnh3Row());
            setPclRow(buildEmptyPclRow());
            setOriginalTimeRows(null);
            setOriginalFnh3Row(null);
            setOriginalPclRow(null);
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

    const slotObj = TIME_SLOTS.find((s) => s.key === rowKey);
    const shiftGroup = slotObj ? slotObj.shiftGroup : null;
    if (shiftGroup && isShiftDisabled(shiftGroup)) return;

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
  }, [isShiftDisabled]);

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
    if (!oldSlot && newSlot) return true;
    if (oldSlot && !newSlot) return false;
    const fields = [...STREAMS.map((s) => s.key), 'avgTcl', 'avgAH'];
    return fields.some((f) => {
      let oVal = oldSlot?.[f] ?? null;
      let nVal = newSlot?.[f] ?? null;
      if (nVal === '') nVal = null;
      if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
        return Number(oVal) !== Number(nVal);
      }
      return String(oVal) !== String(nVal);
    });
  };

  const isRowDiff = (oldR, newR) => {
    if (!oldR && newR) return true;
    if (oldR && !newR) return false;
    const fields = [...STREAMS.map((s) => s.key), 'avgAH'];
    return fields.some((f) => {
      let oVal = oldR?.[f] ?? null;
      let nVal = newR?.[f] ?? null;
      if (nVal === '') nVal = null;
      if (oVal !== null && nVal !== null && !isNaN(Number(oVal)) && !isNaN(Number(nVal))) {
        return Number(oVal) !== Number(nVal);
      }
      return String(oVal) !== String(nVal);
    });
  };

  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validateForm()) {
      showToast('Please correct validation errors before saving.', 'error');
      return;
    }

    const shiftsToSave = [];
    let isFinalEdit = false;

    SHIFT_MAPPING.forEach((shift) => {
      if (isShiftDisabled(shift.key)) return;

      const hasAnyData = shift.slotKeys.some((sKey) => {
        const row = timeRows[sKey];
        return row && Object.values(row).some((val) => val !== null && val !== '');
      });

      const hasDiff = shift.slotKeys.some((sKey) => {
        const oldSlot = originalTimeRows ? originalTimeRows[sKey] : null;
        const newSlot = timeRows[sKey];
        return isSlotDiff(oldSlot, newSlot);
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

    const fnh3Diff = isRowDiff(originalFnh3Row, fnh3Row);
    const pclDiff = isRowDiff(originalPclRow, pclRow);

    if (shiftsToSave.length === 0 && (fnh3Diff || pclDiff)) {
      // Find open shift to save with
      if (!isShiftDisabled('shift1')) {
        shiftsToSave.push({ key: 'shift1', name: 'I SHIFT (06:00 – 14:00)', slotKeys: ['t07', 't11'] });
      } else if (!isShiftDisabled('shift2')) {
        shiftsToSave.push({ key: 'shift2', name: 'II SHIFT (14:00 – 22:00)', slotKeys: ['t15', 't19'] });
      } else if (!isShiftDisabled('shift3')) {
        shiftsToSave.push({ key: 'shift3', name: 'III SHIFT (22:00 – 06:00)', slotKeys: ['t23', 't03'] });
        if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) === 0) {
          isFinalEdit = true;
        }
      }
    }

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
      analysisType: 'CR 202 Analysis',
      crystallizer: 'CR 202',
      shift: shiftBeingSaved ? shiftBeingSaved.name : 'I SHIFT',
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
      timeRows,
      fnh3Row,
      pclRow,
    };

    try {
      const response = await api.post('/api/cr-202-analysis', payload);

      if (!response?.data?.success) {
        showToast(response?.data?.message || 'Unable to save CR 202 data. Please try again.', 'error');
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
        const popF = { ...buildEmptyFnh3Row(), ...savedDoc.fnh3Row };
        setFnh3Row(popF);
        setOriginalFnh3Row(JSON.parse(JSON.stringify(popF)));
      }
      if (savedDoc?.pclRow) {
        const popP = { ...buildEmptyPclRow(), ...savedDoc.pclRow };
        setPclRow(popP);
        setOriginalPclRow(JSON.parse(JSON.stringify(popP)));
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
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailRes?.error || emailRes?.status || 'Email delivery failed');
        showToast('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      console.error('[CR202Analysis] Save failed:', err);
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

      {/* ── Breadcrumb Header ──────────────────────────────────────────────── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Titles */}
          <div className="flex items-center gap-3">
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
                <span className="text-blue-600 font-semibold">CR 202</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  CR 202 ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                  ONCE IN A SHIFT
                </span>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  Unit: Kgm/m³
                </span>
              </div>
            </div>
          </div>

          {/* Right: Date Section + Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Date Section (Strictly Today Asia/Kolkata) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label
                htmlFor="cr202-date-input"
                className="text-xs font-bold text-slate-600 flex items-center gap-1 cursor-default shrink-0"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Date:</span>
              </label>
              <input
                id="cr202-date-input"
                type="date"
                value={date}
                readOnly
                disabled
                className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded px-2 py-0.5 shadow-2xs cursor-not-allowed opacity-90"
                title="Date is strictly locked to today's date in Asia/Kolkata timezone"
              />
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Today
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {!isViewOnly && (
                <button
                  type="button"
                  id="btn-cr202-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  title="Reset form to last saved data"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset</span>
                </button>
              )}

              {!isViewOnly && (
                <StatusSaveButton
                  id="btn-cr202-save"
                  saving={saving}
                  savePhase={savePhase}
                  saveSuccess={saveSuccess}
                  onClick={handleSaveClick}
                  defaultLabel="Save Shift"
                  title="Save active shift data and notify assigned user"
                />
              )}
            </div>
          </div>
        </div>
      </div>

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
          {SHIFT_MAPPING.map((shift) => (
            <div key={shift.key} className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600 text-[11px]">{shift.name.split(' ')[0]}:</span>
              {getShiftBadge(shift.key)}
            </div>
          ))}
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
                const shiftLocked = isShiftDisabled(slot.shiftGroup);

                return (
                  <tr
                    key={slot.key}
                    className={`transition-colors duration-100 ${styles.row} ${shiftLocked ? 'opacity-85' : ''}`}
                  >
                    {/* Time slot & shift label */}
                    <td className="px-5 py-2.5 align-top">
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                            {slot.time}
                          </span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap ${styles.badge}`}>
                            {slot.shift}
                          </span>
                          {shiftLocked && (
                            <Lock className="w-3 h-3 text-slate-400" title="Shift is locked or waiting" />
                          )}
                        </div>
                        {['t07', 't15', 't23'].includes(slot.key) && (
                          <div className="mt-0.5">
                            {getShiftBadge(slot.shiftGroup)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Stream CNH3 input cells (A to H) */}
                    {STREAMS.map((stream) => {
                      const fieldKey = `${slot.key}_${stream.key}`;
                      const cellVal = timeRows[slot.key]?.[stream.key] ?? '';
                      const isEdited = Boolean(editedFields[fieldKey]);

                      return (
                        <td key={stream.key} className="px-1.5 py-2 text-center align-top">
                          <CR202Cell
                            id={`cr202-input-${slot.key}-${stream.key}`}
                            value={cellVal}
                            disabled={shiftLocked}
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
                        disabled={shiftLocked}
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgTcl', e.target.value)
                        }
                        limit={limitTCL}
                        isInvalidFormat={!!errors[`${slot.key}_avgTcl`]}
                        formatErrorMessage={errors[`${slot.key}_avgTcl`]}
                        inputFocusStyle="border-2 border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900"
                        ariaLabel={`AVG TCl at ${slot.time}`}
                        maxWidth="max-w-[82px]"
                        isEdited={Boolean(editedFields[`${slot.key}_avgTcl`])}
                      />
                    </td>

                    {/* AVG A-H cell (Auto-calculated / Editable) */}
                    <td className="px-2 py-2 text-center align-top bg-slate-100/50">
                      <CR202Cell
                        id={`cr202-input-${slot.key}-avgah`}
                        value={timeRows[slot.key]?.avgAH ?? ''}
                        disabled={shiftLocked}
                        onChange={(e) =>
                          handleTimeCellChange(slot.key, 'avgAH', e.target.value)
                        }
                        limit={limitCNH3}
                        isInvalidFormat={!!errors[`${slot.key}_avgAH`]}
                        formatErrorMessage={errors[`${slot.key}_avgAH`]}
                        inputFocusStyle="border-2 border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-slate-800"
                        ariaLabel={`AVG A-H at ${slot.time}`}
                        maxWidth="max-w-[82px]"
                        isEdited={Boolean(editedFields[`${slot.key}_avgAH`])}
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
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Confirm Shift Submission
                </h3>
                <p className="text-xs text-slate-500">
                  Please review the shift details before saving.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Plant / Crystallizer:</span>
                <span className="font-bold text-slate-900">ACL Plant → CR 202</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Selected Date:</span>
                <span className="font-bold text-slate-900">{formatDateDisplay(confirmData.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Shift to Save:</span>
                <span className="font-extrabold text-blue-600">{confirmData.shift.name}</span>
              </div>
              {confirmData.isFinalEdit && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] font-bold">
                  ⚠️ Notice: This is the final allowed edit for III SHIFT. After this save, all shifts for today will lock permanently.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Review / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {saving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Confirm & Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CR202AnalysisPage;
