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
  Plus,
  Clock,
  Gauge,
  HelpCircle,
  Lock,
  Unlock,
  History,
  Send,
  RefreshCw,
  X,
  AlertTriangle,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import {
  validateCellValue,
  SA_GAS_CONC_LIMITS,
} from '../../services/analysisValidation';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';

// ─── Gas Conc. Limit References ─────────────────────────────────────────────
const RECOVERY_LIMIT = SA_GAS_CONC_LIMITS.recoveryGas; // 75%–85%
const BOTTOM_LIMIT = SA_GAS_CONC_LIMITS.bottomGas;     // 80%–90%
const CLEANING_LIMIT = SA_GAS_CONC_LIMITS.cleaningGas; // 9%–11%

const NUMERIC_FIELDS = ['recoveryCo2Con', 'cleaningGas', 'bottomGas'];

/**
 * Determines which shift a time slot belongs to:
 * - SHIFT 1: 06:00 to 13:59
 * - SHIFT 2: 14:00 to 21:59
 * - SHIFT 3: 22:00 to 05:59
 */
const getShiftFromTime = (timeStr) => {
  if (!timeStr) return 'shift1';
  const parts = String(timeStr).trim().split(':');
  const hour = parseInt(parts[0], 10);
  if (isNaN(hour)) return 'shift1';
  if (hour >= 6 && hour < 14) return 'shift1';
  if (hour >= 14 && hour < 22) return 'shift2';
  return 'shift3';
};

const SHIFT_INFO = {
  shift1: { key: 'shift1', name: 'SHIFT 1', time: '06:00-14:00', defaultTime: '08:00' },
  shift2: { key: 'shift2', name: 'SHIFT 2', time: '14:00-22:00', defaultTime: '16:00' },
  shift3: { key: 'shift3', name: 'SHIFT 3', time: '22:00-06:00', defaultTime: '23:00' },
};

const isValidDecimal = (val) => {
  if (val === '' || val === null || val === undefined) return true;
  return /^-?\d*(\.\d*)?$/.test(String(val).trim());
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

const DEFAULT_ROWS_TEMPLATE = (todayDate) => [
  { id: `gc-1-${Date.now()}`, date: todayDate, time: '08:00', seal: 'OK', recoveryCo2Con: '', cleaningGas: '', bottomGas: '' },
  { id: `gc-2-${Date.now()}`, date: '',        time: '12:00', seal: 'OK', recoveryCo2Con: '', cleaningGas: '', bottomGas: '' },
];

const GasConcAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';
  const [selectedDate] = useState(() => getOperatingDateIST());

  // ── States ──
  const [rows, setRows] = useState([]);
  const [lastSavedRows, setLastSavedRows] = useState([]);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // Sequential shift locking state
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

  // Edit tracking & audit history
  const [editedFields, setEditedFields] = useState({});
  const [editAuditHistory, setEditAuditHistory] = useState([]);
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Email state (kept for banner compatibility)
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  // Save confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingTargetShift, setPendingTargetShift] = useState(null);

  // ── Calculate Resolved/Inherited Dates & Shifts for each row ──
  const rowsWithResolvedDates = useMemo(() => {
    let lastDate = selectedDate;
    return rows.map((r, idx) => {
      const isExplicit = Boolean(r.date && String(r.date).trim());
      if (isExplicit) {
        lastDate = String(r.date).trim();
      }
      const shiftKey = getShiftFromTime(r.time);
      const shiftName = shiftKey === 'shift1' ? 'Shift 1' : shiftKey === 'shift2' ? 'Shift 2' : 'Shift 3';

      return {
        ...r,
        resolvedDate: isExplicit ? String(r.date).trim() : lastDate,
        isInherited: !isExplicit,
        inheritedFrom: isExplicit ? null : lastDate,
        isGroupStart: isExplicit || idx === 0,
        shiftKey,
        shiftName,
      };
    });
  }, [rows, selectedDate]);

  // ── Compute Shift Statuses based on sequential locking state ──
  const shiftStatuses = useMemo(() => {
    const { shift1Saved, shift2Saved, shift3Saved, shift1Locked, shift2Locked, shift3Locked, shift1Edits = 0, shift2Edits = 0, shift3Edits = 0 } = lockedShifts;

    const s1 = (shift1Locked || shift2Saved || shift1Edits > 0)
      ? 'LOCKED'
      : (shift1Saved ? 'EDITABLE' : 'NEW');

    const s2 = !shift1Saved
      ? 'WAITING'
      : ((shift2Locked || shift3Saved || shift2Edits > 0)
          ? 'LOCKED'
          : (shift2Saved ? 'EDITABLE' : 'NEW'));

    const s3 = !shift2Saved
      ? 'WAITING'
      : ((shift3Locked || shift3Edits > 0)
          ? 'LOCKED'
          : (shift3Saved ? 'EDITABLE' : 'NEW'));

    return {
      shift1: s1,
      shift2: s2,
      shift3: s3,
    };
  }, [lockedShifts]);

  // ── Helper to check if a shift/row is disabled by lock ──
  const isRowDisabled = useCallback((shiftKey) => {
    const status = shiftStatuses[shiftKey];
    return status === 'LOCKED' || status === 'WAITING';
  }, [shiftStatuses]);

  // ── Fetch Record for Date ──
  const loadRecordForDate = useCallback(async (dateToLoad) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/gas-conc?date=${dateToLoad}`);
      if (res.data?.success && res.data.data) {
        const d = res.data.data;
        const initialRows = Array.isArray(d.rows) && d.rows.length > 0 ? d.rows : DEFAULT_ROWS_TEMPLATE(dateToLoad);
        setRecordId(d._id || d.id || null);
        setRows(initialRows);
        setLastSavedRows(JSON.parse(JSON.stringify(initialRows)));
        setLockedShifts(d.lockedShifts || {
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
        setEditedFields(d.editedFields || {});
        setEditAuditHistory(d.editAuditHistory || []);
        setEmailStatus(d.emailStatus || null);
        setEmailRecipient(d.emailRecipient || res.data.assignedOperatorEmail || '');
      } else {
        const initialRows = DEFAULT_ROWS_TEMPLATE(dateToLoad);
        setRecordId(null);
        setRows(initialRows);
        setLastSavedRows([]);
        setLockedShifts({
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
        setEditedFields({});
        setEditAuditHistory([]);
        setEmailStatus(null);
        setEmailRecipient(res.data?.assignedOperatorEmail || '');
      }
    } catch (err) {
      console.warn('[GasConc] Fetch warning:', err.message);
      const initialRows = DEFAULT_ROWS_TEMPLATE(dateToLoad);
      setRecordId(null);
      setRows(initialRows);
      setLastSavedRows([]);
      setLockedShifts({
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
      setEditedFields({});
      setEditAuditHistory([]);
      setEmailStatus(null);
      setEmailRecipient('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecordForDate(selectedDate);
  }, [selectedDate, loadRecordForDate]);

  // ── Cell Value Change Handler ──
  const handleCellChange = useCallback((id, field, value) => {
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });

    if (savePhase !== 'idle') {
      setSavePhase('idle');
    }
  }, [savePhase]);

  // ── Add Row Handler ──
  const handleAddRow = (inheritPreviousDate = true) => {
    // Find the current editable or open shift to set reasonable default time
    let defaultTime = '08:00';
    let targetShiftKey = null;

    if (shiftStatuses.shift1 === 'NEW' || shiftStatuses.shift1 === 'EDITABLE') {
      defaultTime = '08:00';
      targetShiftKey = 'shift1';
    } else if (shiftStatuses.shift2 === 'NEW' || shiftStatuses.shift2 === 'EDITABLE') {
      defaultTime = '16:00';
      targetShiftKey = 'shift2';
    } else if (shiftStatuses.shift3 === 'NEW' || shiftStatuses.shift3 === 'EDITABLE') {
      defaultTime = '23:00';
      targetShiftKey = 'shift3';
    }

    if (!targetShiftKey) {
      showToast?.('All shifts are currently locked for this date. No new observations can be added.', 'warning');
      return;
    }

    const newId = `gc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const resolvedLastDate = rowsWithResolvedDates[rowsWithResolvedDates.length - 1]?.resolvedDate || selectedDate;

    const newRow = {
      id: newId,
      date: inheritPreviousDate ? '' : resolvedLastDate,
      time: defaultTime,
      seal: 'OK',
      recoveryCo2Con: '',
      cleaningGas: '',
      bottomGas: '',
    };

    setRows((prev) => [...prev, newRow]);
    if (savePhase !== 'idle') setSavePhase('idle');
    showToast?.(
      inheritPreviousDate
        ? `Added new row inheriting date (${formatDateDisplay(resolvedLastDate)}) for ${SHIFT_INFO[targetShiftKey].name}`
        : `Added new row with independent date for ${SHIFT_INFO[targetShiftKey].name}`,
      'info'
    );
  };

  // ── Delete Row Handler ──
  const handleDeleteRow = (id, shiftKey) => {
    if (lockedShifts[`${shiftKey}Saved`]) {
      showToast?.(`Cannot delete row: ${SHIFT_INFO[shiftKey]?.name} is already saved.`, 'error');
      return;
    }
    if (isRowDisabled(shiftKey)) {
      showToast?.(`Cannot delete row: ${SHIFT_INFO[shiftKey]?.name} is ${shiftStatuses[shiftKey]}.`, 'error');
      return;
    }
    if (rows.length <= 1) {
      showToast?.('At least one row must be maintained.', 'warning');
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (savePhase !== 'idle') setSavePhase('idle');
    showToast?.('Row removed.', 'info');
  };

  // ── Reset Handler ──
  const handleReset = () => {
    loadRecordForDate(selectedDate);
    setErrors({});
    setSavePhase('idle');
    showToast?.('Gas Conc. table reloaded from saved database record.', 'info');
  };

  // ── Detect Changes & Initiate Save ──
  const handleInitiateSave = () => {
    const newErrors = {};
    const seenTimes = new Set();

    rowsWithResolvedDates.forEach((r) => {
      NUMERIC_FIELDS.forEach((f) => {
        if (r[f] !== '' && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid number';
        }
      });
      if (!r.time) {
        newErrors[`${r.id}_time`] = 'Time required';
      } else {
        const key = `${r.resolvedDate}_${r.time}`;
        if (seenTimes.has(key)) {
          newErrors[`${r.id}_time`] = 'Duplicate time in date';
        }
        seenTimes.add(key);
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and correct highlighted errors before saving.', 'error');
      return;
    }

    // Compare current rows against lastSavedRows by shift
    const existingByShift = { shift1: [], shift2: [], shift3: [] };
    lastSavedRows.forEach((r) => {
      const sk = getShiftFromTime(r.time);
      if (existingByShift[sk]) existingByShift[sk].push(r);
    });

    const currentByShift = { shift1: [], shift2: [], shift3: [] };
    rowsWithResolvedDates.forEach((r) => {
      const sk = getShiftFromTime(r.time);
      if (currentByShift[sk]) currentByShift[sk].push(r);
    });

    const changedShifts = [];
    for (const sk of ['shift1', 'shift2', 'shift3']) {
      const extRows = existingByShift[sk];
      const curRows = currentByShift[sk];

      let hasDiff = false;
      if (extRows.length !== curRows.length) {
        hasDiff = true;
      } else {
        for (const cr of curRows) {
          const er = extRows.find((r) => r.id === cr.id);
          if (!er) {
            hasDiff = true;
            break;
          }
          if (
            cr.seal !== er.seal ||
            cr.recoveryCo2Con !== er.recoveryCo2Con ||
            cr.cleaningGas !== er.cleaningGas ||
            cr.bottomGas !== er.bottomGas ||
            cr.time !== er.time ||
            cr.date !== er.date
          ) {
            hasDiff = true;
            break;
          }
        }
      }

      if (hasDiff) {
        changedShifts.push(sk);
      }
    }

    if (changedShifts.length === 0) {
      showToast?.('No changes', 'info');
      return;
    }

    if (changedShifts.length > 1) {
      showToast?.('Cannot save changes across multiple shifts simultaneously. Please save one shift at a time.', 'error');
      return;
    }

    const targetShift = changedShifts[0];

    // Check empty shift
    const targetRows = currentByShift[targetShift] || [];
    const isShiftEmpty =
      targetRows.length === 0 ||
      targetRows.every((r) => {
        const recEmpty = r.recoveryCo2Con === '' || r.recoveryCo2Con === null || r.recoveryCo2Con === undefined;
        const clnEmpty = r.cleaningGas === '' || r.cleaningGas === null || r.cleaningGas === undefined;
        const botEmpty = r.bottomGas === '' || r.bottomGas === null || r.bottomGas === undefined;
        return recEmpty && clnEmpty && botEmpty;
      });

    if (isShiftEmpty) {
      showToast?.(`Cannot save empty shift ${SHIFT_INFO[targetShift].name}. At least one observation value is required.`, 'warning');
      return;
    }

    // Verify sequential rules on client
    if (targetShift === 'shift2' && !lockedShifts.shift1Saved) {
      showToast?.('Cannot save SHIFT 2 before SHIFT 1 is saved.', 'error');
      return;
    }
    if (targetShift === 'shift3' && !lockedShifts.shift2Saved) {
      showToast?.('Cannot save SHIFT 3 before SHIFT 2 is saved.', 'error');
      return;
    }

    setPendingTargetShift(targetShift);
    setShowConfirmModal(true);
  };

  // ── Execute Confirmed Save ──
  const executeSave = async () => {
    setShowConfirmModal(false);
    setSaving(true);

    try {
      const targetShift = pendingTargetShift;
      const saveEventId = `gc_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const payload = {
        date: selectedDate,
        plant: 'SA',
        unit: 'Gas Conc.',
        analysisType: 'Gas Conc. Analysis',
        targetShift,
        rows: rowsWithResolvedDates.map((r) => ({
          id: r.id,
          date: r.date,
          resolvedDate: r.resolvedDate,
          displayDate: r.date ? formatDateDisplay(r.date) : '',
          time: r.time,
          shift: r.shiftName,
          shiftKey: r.shiftKey,
          seal: r.seal || 'NOT OK',
          recoveryCo2Con: r.recoveryCo2Con,
          cleaningGas: r.cleaningGas,
          bottomGas: r.bottomGas,
        })),
        saveEventId,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/gas-conc', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (res.data?.statusFromApi === 'disabled' || res.data?.success) {
        setSaving(false);
        setSavePhase('completed');
        setSaveSuccess(true);
        showToast?.('Saved ✓', 'success');

        const savedData = res.data.data || res.data.record;
        setRecordId(res.data.recordId || savedData?.id || recordId);
        if (savedData?.rows) {
          setRows(savedData.rows);
          setLastSavedRows(JSON.parse(JSON.stringify(savedData.rows)));
        }
        if (res.data.lockedShifts) {
          setLockedShifts(res.data.lockedShifts);
        }
        if (res.data.editedFields) {
          setEditedFields(res.data.editedFields);
        }
        if (res.data.editAuditHistory) {
          setEditAuditHistory(res.data.editAuditHistory);
        }
        setLastSavedTime(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }));
      } else {
        setSaving(false);
        showToast?.(res.data?.message || 'Save completed with notes.', 'warning');
      }
    } catch (err) {
      console.error('[GasConc] Save error:', err);
      setSaving(false);
      setSaveSuccess(false);
      setSavePhase('idle');
      const errMsg = err.response?.data?.message || err.message || 'Failed to save analysis.';
      showToast?.(errMsg, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans">
      {/* ── TOP HEADER BAR ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Back Button + Breadcrumbs + Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 shrink-0 cursor-pointer"
              title="Return to Plants Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-slate-500">Soda Ash Production</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                  Gas Conc.
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-blue-600" />
                GAS CONC. ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Date Picker + Audit History + Reset + Save */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Locked Operating Date Display */}
            <LockedDateDisplay
              date={selectedDate}
              id="gas-conc-locked-date"
              badgeText="Operating Day"
            />

            {/* Audit History Button */}
            {editAuditHistory.length > 0 && (
              <button
                id="btn-gas-conc-audit"
                onClick={() => setShowAuditModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition border border-amber-300 cursor-pointer"
                title="View Field-Level Edit History"
              >
                <History className="w-3.5 h-3.5 text-amber-600" />
                <span>Edits ({editAuditHistory.length})</span>
              </button>
            )}

            {/* Reset Button */}
            <button
              id="btn-gas-conc-reset"
              onClick={handleReset}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-60"
              title="Reload saved database record"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            {/* Save / Submit Button */}
            <StatusSaveButton
              id="btn-gas-conc-save"
              saving={saving}
              savePhase={savePhase}
              saveSuccess={saveSuccess}
              onClick={handleInitiateSave}
              disabled={loading}
              alwaysShowSaveText={true}
              defaultLabel="Save / Submit"
              title="Save Gas Conc. observations with sequential shift-locking"
            />
          </div>
        </div>
      </div>

      {/* ── SEQUENTIAL SHIFT LOCKING STATUS BAR ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Shift 1 Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span>SHIFT 1</span>
              <span className="text-[10px] text-slate-400 font-semibold">(06:00–14:00)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {shiftStatuses.shift1 === 'LOCKED'
                ? 'Locked permanently'
                : (lockedShifts.shift1Saved ? 'Saved & Editable until Shift 2 save' : 'First permitted shift for entry')}
            </div>
          </div>
          <div><RecordStatusBadge status={shiftStatuses.shift1} /></div>
        </div>

        {/* Shift 2 Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span>SHIFT 2</span>
              <span className="text-[10px] text-slate-400 font-semibold">(14:00–22:00)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {shiftStatuses.shift2 === 'WAITING'
                ? 'Waiting for Shift 1 save'
                : (shiftStatuses.shift2 === 'LOCKED'
                    ? 'Locked permanently'
                    : 'Editable until Shift 3 save')}
            </div>
          </div>
          <div><RecordStatusBadge status={shiftStatuses.shift2} /></div>
        </div>

        {/* Shift 3 Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span>SHIFT 3</span>
              <span className="text-[10px] text-slate-400 font-semibold">(22:00–06:00)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {shiftStatuses.shift3 === 'WAITING'
                ? 'Waiting for Shift 2 save'
                : (shiftStatuses.shift3 === 'LOCKED'
                    ? 'Locked permanently'
                    : (lockedShifts.shift3Saved ? '1 final edit permitted before lock' : 'Active shift'))}
            </div>
          </div>
          <div><RecordStatusBadge status={shiftStatuses.shift3} /></div>
        </div>
      </div>

      {/* ── DATA ENTRY TABLE CARD ── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Controls & Subheader */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200/90 bg-slate-50/70">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              Gas Conc. Observations Table
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              {rows.length} Observations
            </span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
              Frequency: Once in a Shift
            </span>
            <span className="text-[11px] text-slate-500 hidden md:inline-flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-slate-400" />
              Blank dates inherit preceding date
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddRow(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-200 cursor-pointer shadow-2xs"
              title="Add another time slot inheriting the active date"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Time Slot</span>
            </button>
            <button
              onClick={() => handleAddRow(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition border border-slate-300 cursor-pointer shadow-2xs"
              title="Add a new row starting a new date group"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Add New Date Group</span>
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[11px] tracking-wider uppercase border-b border-slate-800">
                <th className="py-3 px-2 w-8 text-center text-slate-400 font-semibold border-r border-slate-800">#</th>
                <th className="py-2.5 px-3 w-[16%] text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>DATE</span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 w-[14%] text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>TIME & SHIFT</span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 w-[10%] text-center border-r border-slate-800">
                  <span>SEAL</span>
                </th>
                <th className="py-2.5 px-3 w-[20%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-blue-300">RECOVERY CO2 CON</div>
                  <div className="text-[10px] text-slate-300 font-normal">Conc. (Recovery Gas) [75%–85%]</div>
                </th>
                <th className="py-2.5 px-3 w-[18%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-cyan-300">CLEANING GAS</div>
                  <div className="text-[10px] text-slate-300 font-normal">Conc. (Cleaning Gas) [9%–11%]</div>
                </th>
                <th className="py-2.5 px-3 w-[18%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-indigo-300">BOTTOM GAS</div>
                  <div className="text-[10px] text-slate-300 font-normal">Conc. (Bottom Gas) [80%–90%]</div>
                </th>
                <th className="py-2.5 px-2 w-10 text-center text-slate-400"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {rowsWithResolvedDates.map((r, idx) => {
                const disabled = isRowDisabled(r.shiftKey);
                const isShiftSaved = Boolean(lockedShifts[`${r.shiftKey}Saved`]);
                const isTimeDisabled = disabled || isShiftSaved;
                const shiftStatus = shiftStatuses[r.shiftKey];
                const isGroupStart = r.isGroupStart && idx > 0;
                const rowBg = disabled
                  ? 'bg-slate-100/70 text-slate-400'
                  : isGroupStart
                  ? 'bg-amber-50/20 hover:bg-slate-50/80 border-t-2 border-slate-300'
                  : idx % 2 === 0
                  ? 'bg-white hover:bg-slate-50/70'
                  : 'bg-slate-50/40 hover:bg-slate-100/70';

                return (
                  <tr key={r.id} className={`${rowBg} transition-colors group`}>
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center text-slate-400 font-semibold border-r border-slate-200/80 text-[11px]">
                      {idx + 1}
                    </td>

                    {/* 1. DATE */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      <div className="flex flex-col items-center gap-1 w-full">
                        <input
                          type="date"
                          value={r.date}
                          disabled={isTimeDisabled}
                          onChange={(e) => handleCellChange(r.id, 'date', e.target.value)}
                          className={`w-full px-1.5 py-1 text-xs font-semibold rounded border text-center transition focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                            r.date
                              ? 'bg-white border-slate-300 text-slate-900 font-bold'
                              : 'bg-slate-100/80 border-dashed border-slate-300 text-slate-500'
                          }`}
                        />
                        {r.isInherited ? (
                          <span
                            className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 whitespace-nowrap"
                            title={`Inherited from preceding row (${formatDateDisplay(r.resolvedDate)})`}
                          >
                            ↳ {formatDateDisplay(r.resolvedDate)}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* 2. TIME & SHIFT */}
                    <td className="py-2 px-2 border-r border-slate-200/80 align-top text-center">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="time"
                          value={r.time}
                          disabled={isTimeDisabled}
                          onChange={(e) => handleCellChange(r.id, 'time', e.target.value)}
                          className={`w-full px-1.5 py-1 text-xs font-bold rounded border text-center transition focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                            errors[`${r.id}_time`]
                              ? 'border-red-400 bg-red-50 text-red-700'
                              : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
                          }`}
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {r.shiftName}
                          </span>
                          <RecordStatusBadge status={shiftStatus} />
                        </div>
                        {errors[`${r.id}_time`] && (
                          <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                            {errors[`${r.id}_time`]}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 3. SEAL */}
                    <td className="py-2 px-2 border-r border-slate-200/80 align-top text-center">
                      <div className="flex flex-col items-center gap-1">
                        <select
                          value={r.seal || 'NOT OK'}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(r.id, 'seal', e.target.value)}
                          className={`w-full px-2 py-1 text-xs font-extrabold rounded-lg border text-center transition cursor-pointer focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                            r.seal === 'OK'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 focus:ring-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-300 focus:ring-rose-200'
                          }`}
                        >
                          <option value="NOT OK">NOT OK</option>
                          <option value="OK">OK</option>
                        </select>
                        {editedFields?.[r.id]?.seal && (
                          <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. RECOVERY CO2 CON */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      {(() => {
                        const recVal = validateCellValue(r.recoveryCo2Con, RECOVERY_LIMIT);
                        const hasVal = r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined;
                        const isOutOfLimit = recVal.isOutOfLimit;
                        const isNormal = recVal.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`gas-conc-input-${r.id}-recoveryCo2Con`}
                                type="text"
                                inputMode="decimal"
                                disabled={disabled}
                                value={r.recoveryCo2Con}
                                onChange={(e) => handleCellChange(r.id, 'recoveryCo2Con', e.target.value)}
                                placeholder={RECOVERY_LIMIT.formattedRange}
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${r.recoveryCo2Con}% (Valid: ${RECOVERY_LIMIT.formattedRange})`
                                      : `NORMAL: ${r.recoveryCo2Con}% (Valid: ${RECOVERY_LIMIT.formattedRange})`
                                    : `Valid Range: ${RECOVERY_LIMIT.formattedRange}`
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed ${
                                  errors[`${r.id}_recoveryCo2Con`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title={`Out of limit: ${RECOVERY_LIMIT.formattedRange}`}
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-center gap-1 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">75%–85%</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                              {editedFields?.[r.id]?.recoveryCo2Con && (
                                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                                  EDITED
                                </span>
                              )}
                            </div>
                            {errors[`${r.id}_recoveryCo2Con`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${r.id}_recoveryCo2Con`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. CLEANING GAS */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      {(() => {
                        const cleanVal = validateCellValue(r.cleaningGas, CLEANING_LIMIT);
                        const hasVal = r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined;
                        const isOutOfLimit = cleanVal.isOutOfLimit;
                        const isNormal = cleanVal.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`gas-conc-input-${r.id}-cleaningGas`}
                                type="text"
                                inputMode="decimal"
                                disabled={disabled}
                                value={r.cleaningGas}
                                onChange={(e) => handleCellChange(r.id, 'cleaningGas', e.target.value)}
                                placeholder={CLEANING_LIMIT.formattedRange}
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${r.cleaningGas}% (Valid: ${CLEANING_LIMIT.formattedRange})`
                                      : `NORMAL: ${r.cleaningGas}% (Valid: ${CLEANING_LIMIT.formattedRange})`
                                    : `Valid Range: ${CLEANING_LIMIT.formattedRange}`
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed ${
                                  errors[`${r.id}_cleaningGas`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title={`Out of limit: ${CLEANING_LIMIT.formattedRange}`}
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-center gap-1 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">9%–11%</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                              {editedFields?.[r.id]?.cleaningGas && (
                                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                                  EDITED
                                </span>
                              )}
                            </div>
                            {errors[`${r.id}_cleaningGas`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${r.id}_cleaningGas`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 6. BOTTOM GAS */}
                    <td className="py-2 px-2.5 border-r border-slate-200/80 align-top text-center">
                      {(() => {
                        const botVal = validateCellValue(r.bottomGas, BOTTOM_LIMIT);
                        const hasVal = r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined;
                        const isOutOfLimit = botVal.isOutOfLimit;
                        const isNormal = botVal.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`gas-conc-input-${r.id}-bottomGas`}
                                type="text"
                                inputMode="decimal"
                                disabled={disabled}
                                value={r.bottomGas}
                                onChange={(e) => handleCellChange(r.id, 'bottomGas', e.target.value)}
                                placeholder={BOTTOM_LIMIT.formattedRange}
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${r.bottomGas}% (Valid: ${BOTTOM_LIMIT.formattedRange})`
                                      : `NORMAL: ${r.bottomGas}% (Valid: ${BOTTOM_LIMIT.formattedRange})`
                                    : `Valid Range: ${BOTTOM_LIMIT.formattedRange}`
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed ${
                                  errors[`${r.id}_bottomGas`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title={`Out of limit: ${BOTTOM_LIMIT.formattedRange}`}
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-center gap-1 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">80%–90%</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                              {editedFields?.[r.id]?.bottomGas && (
                                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                                  EDITED
                                </span>
                              )}
                            </div>
                            {errors[`${r.id}_bottomGas`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${r.id}_bottomGas`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Delete Action */}
                    <td className="py-2 px-1 text-center align-middle">
                      {!disabled && !isShiftSaved && (
                        <button
                          onClick={() => handleDeleteRow(r.id, r.shiftKey)}
                          className="text-slate-300 hover:text-rose-600 transition p-1 cursor-pointer"
                          title="Delete row"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Bar with Add Row actions & Footer Note */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs">
          <div>
            <div className="text-slate-500 text-[11px]">
              Showing <strong className="text-slate-700">{rows.length}</strong> observations across{' '}
              <strong className="text-slate-700">
                {new Set(rowsWithResolvedDates.map((r) => r.resolvedDate)).size}
              </strong>{' '}
              date group(s).
            </div>
            <div className="text-[11px] text-slate-400 italic mt-0.5">
              One correction allowed after first save; saving the next shift locks the previous one.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddRow(true)}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-300 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Row (Same Date)</span>
            </button>
            <button
              onClick={() => handleAddRow(false)}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Add Row (New Date)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-sm tracking-wide uppercase">
                <Save className="w-4 h-4 text-blue-400" />
                <span>Confirm Gas Conc. Analysis Submission</span>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Operating Date:</span>
                  <span className="font-extrabold text-slate-900">{formatDateDisplay(selectedDate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Target Shift:</span>
                  <span className="font-extrabold text-blue-700">{SHIFT_INFO[pendingTargetShift]?.name || pendingTargetShift}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Total Observations:</span>
                  <span className="font-extrabold text-slate-900">{rows.length} rows</span>
                </div>
              </div>

              {/* Sequential Locking Transition Alert */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 text-[11px] leading-relaxed">
                <strong>Sequential Shift Locking Notice:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {pendingTargetShift === 'shift1' && !lockedShifts.shift1Saved && <li>Saving will mark <strong>SHIFT 1</strong> as saved and permit SHIFT 2 entries.</li>}
                  {pendingTargetShift === 'shift1' && lockedShifts.shift1Saved && <li>Saving will use the <strong>one allowed correction</strong> for SHIFT 1 and permanently lock it.</li>}
                  {pendingTargetShift === 'shift2' && !lockedShifts.shift2Saved && <li>Saving will mark <strong>SHIFT 2</strong> as saved, permanently lock SHIFT 1, and permit SHIFT 3 entries.</li>}
                  {pendingTargetShift === 'shift2' && lockedShifts.shift2Saved && <li>Saving will use the <strong>one allowed correction</strong> for SHIFT 2 and permanently lock it.</li>}
                  {pendingTargetShift === 'shift3' && !lockedShifts.shift3Saved && <li>Saving will mark <strong>SHIFT 3</strong> as saved and permanently lock SHIFT 2.</li>}
                  {pendingTargetShift === 'shift3' && lockedShifts.shift3Saved && <li>This is the <strong>FINAL EDIT for SHIFT 3</strong>. Submitting will permanently lock all shifts.</li>}
                </ul>
              </div>

              <div className="text-slate-500 text-[11px]">
                Data will be atomically persisted to MongoDB with sequential slot locking.
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeSave}
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

      {/* ── FIELD-LEVEL EDIT HISTORY MODAL ── */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-extrabold text-sm tracking-wide uppercase">
                <History className="w-4 h-4 text-amber-400" />
                <span>Field-Level Edit Audit History ({editAuditHistory.length})</span>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              {editAuditHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  No previous edits recorded for this analysis.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {editAuditHistory.map((item, i) => (
                    <div key={i} className="p-3 bg-white hover:bg-slate-50 transition text-xs">
                      <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
                        <span className="font-bold text-slate-700">
                          {item.shift || 'Shift'} | Time Slot: {item.time || '—'}
                        </span>
                        <span>{new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-blue-700">{item.fieldName || item.field}:</span>
                        <span className="text-slate-400 line-through">{item.oldValue || '—'}</span>
                        <ChevronRight className="w-3 h-3 text-slate-400" />
                        <span className="font-extrabold text-emerald-700">{item.newValue || '—'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Edited by: <span className="font-semibold text-slate-600">{item.editor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GasConcAnalysisPage;
