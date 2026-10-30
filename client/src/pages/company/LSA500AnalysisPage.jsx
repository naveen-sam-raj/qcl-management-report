import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import { getCellLimit } from '../../services/analysisValidation';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';

const LSA500_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];

const DEFAULT_ROWS = [
  { id: 'r1',  time: '06:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r2',  time: '08:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r3',  time: '10:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r4',  time: '12:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r5',  time: '14:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r6',  time: '16:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r7',  time: '18:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r8',  time: '20:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r9',  time: '22:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r10', time: '00:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r11', time: '02:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r12', time: '04:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r13', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
  { id: 'r14', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
  { id: 'r15', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const isValDiff = (o, n) => {
  if (o === undefined || o === null || o === '') o = null;
  if (n === undefined || n === null || n === '') n = null;
  if (o === null && n === null) return false;
  if (o === null || n === null) return true;
  if (!isNaN(Number(o)) && !isNaN(Number(n))) {
    return Number(o) !== Number(n);
  }
  return String(o) !== String(n);
};

const LSA500AnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Strict Operating Date) ──
  const [date]                                          = useState(() => getOperatingDateIST());
  const [rows, setRows]                                 = useState(DEFAULT_ROWS);
  const [originalRows, setOriginalRows]                 = useState(null);
  const [errors, setErrors]                             = useState({});
  const [saving, setSaving]                             = useState(false);
  const [lastSaved, setLastSaved]                       = useState(null);

  // Persistence & Locking states
  const [savePhase, setSavePhase]                       = useState('idle');
  const [recordId, setRecordId]                         = useState(null);
  const [recipientEmail, setRecipientEmail]             = useState('');
  const [emailStatusDetail, setEmailStatusDetail]       = useState('');
  const [editedFields, setEditedFields]                 = useState({});
  const [lockedSlots, setLockedSlots]                   = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]         = useState(false);
  const [confirmData, setConfirmData]                   = useState(null);

  const getSlotKey = useCallback((row) => {
    if (!row) return null;
    if (row.id && LSA500_SLOTS.includes(row.id)) return row.id;
    const t = String(row.time || '').trim();
    if (t === '06:30') return 'r1';
    if (t === '08:30') return 'r2';
    if (t === '10:00' || t === '10:30') return 'r3';
    if (t === '12:00' || t === '12:30') return 'r4';
    if (t === '14:30') return 'r5';
    if (t === '16:00' || t === '16:30') return 'r6';
    if (t === '18:00' || t === '18:30') return 'r7';
    if (t === '20:00' || t === '20:30') return 'r8';
    if (t === '22:30') return 'r9';
    if (t === '00:30') return 'r10';
    if (t === '02:00' || t === '02:30') return 'r11';
    if (t === '04:00' || t === '04:30') return 'r12';
    return null;
  }, []);

  const getSlotStatus = useCallback((slotKey) => {
    if (!slotKey || !LSA500_SLOTS.includes(slotKey)) return 'LOCKED';
    const s = lockedSlots[slotKey] || {};
    const idx = LSA500_SLOTS.indexOf(slotKey);

    if (idx === 0) {
      if (s.isLocked) return 'LOCKED';
      const nextKey = LSA500_SLOTS[1];
      if (lockedSlots[nextKey]?.isSaved) return 'LOCKED';
      if (s.isSaved) return 'EDITABLE';
      return 'NEW';
    }

    const prevKey = LSA500_SLOTS[idx - 1];
    if (!lockedSlots[prevKey]?.isSaved) return 'WAITING';

    if (s.isLocked) return 'LOCKED';
    if (idx < LSA500_SLOTS.length - 1) {
      const nextKey = LSA500_SLOTS[idx + 1];
      if (lockedSlots[nextKey]?.isSaved) return 'LOCKED';
    }
    if (s.isSaved) return 'EDITABLE';
    return 'OPEN';
  }, [lockedSlots]);

  const isSlotDisabled = useCallback((slotKey) => {
    if (isViewOnly) return true;
    const status = getSlotStatus(slotKey);
    return status === 'LOCKED' || status === 'WAITING';
  }, [isViewOnly, getSlotStatus]);

  // Fetch existing data for operating day
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/lsa-500-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success) {
          const rec = response.data.record || (Array.isArray(response.data.data) ? response.data.data[0] : response.data.data);
          const returnedSlots = response.data.lockedSlots || rec?.lockedSlots || rec?.data?.lockedSlots || {};
          setLockedSlots(returnedSlots);

          if (rec) {
            setRecordId(rec._id || response.data.recordId || null);
            setRecipientEmail(rec.emailRecipient || response.data.assignedOperatorEmail || '');

            const fetchedRows = rec.rows || rec.data?.rows;
            if (Array.isArray(fetchedRows) && fetchedRows.length > 0) {
              setRows(fetchedRows);
              setOriginalRows(JSON.parse(JSON.stringify(fetchedRows)));
            } else {
              setRows(DEFAULT_ROWS);
              setOriginalRows(null);
            }

            setEditedFields(rec.editedFields || rec.data?.editedFields || response.data.editedFields || {});
          } else {
            setRows(DEFAULT_ROWS);
            setOriginalRows(null);
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing LSA AT 500# data', err);
        setRows(DEFAULT_ROWS);
        setOriginalRows(null);
        setEditedFields({});
      }
    };
    fetchExistingData();
    return () => { active = false; };
  }, [date]);

  // Validate value against limit
  const validateValue = (value, paramKey) => {
    if (!value || value === '') return null;
    const num = Number(value);
    if (isNaN(num)) return null;
    
    const limit = getCellLimit(plantId, 'lsa-500', 'onceIn2Hrs', paramKey);
    if (!limit) return null;
    
    if (limit.min !== undefined && limit.max !== undefined) {
      if (num >= limit.min && num <= limit.max) return 'normal';
      return 'out';
    }
    return null;
  };

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

  const handleCellChange = useCallback((id, field, value) => {
    if (isViewOnly) return;
    if (['nacl', 'bd', 'turbidity'].includes(field) && !isValidDecimal(value)) return;

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
  }, [errors, isViewOnly]);

  const handleReset = useCallback(() => {
    if (isViewOnly) return;
    if (originalRows) {
      setRows(JSON.parse(JSON.stringify(originalRows)));
      showToast?.('Restored values to last saved state.', 'info');
    } else {
      setRows(DEFAULT_ROWS);
      showToast?.('LSA AT 500# analysis form cleared to defaults.', 'info');
    }
    setErrors({});
  }, [originalRows, showToast, isViewOnly]);

  // ── Pre-Save Prompt & Validation ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};
    rows.forEach((r) => {
      ['nacl', 'bd', 'turbidity'].forEach(f => {
        if (r[f] !== '' && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid number';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please fix invalid numeric values before saving.', 'error');
      return;
    }

    // Determine changed slots
    const baseline = originalRows || DEFAULT_ROWS;
    const changedSlotKeys = [];

    LSA500_SLOTS.forEach((sk) => {
      const curRow = rows.find(r => getSlotKey(r) === sk);
      const baseRow = baseline.find(r => getSlotKey(r) === sk);
      const hasDiff = ['nacl', 'bd', 'turbidity'].some(f => isValDiff(baseRow?.[f], curRow?.[f]));
      if (hasDiff) {
        changedSlotKeys.push(sk);
      }
    });

    if (changedSlotKeys.length === 0) {
      showToast?.('No changes', 'info');
      return;
    }

    if (changedSlotKeys.length > 1) {
      showToast?.('Please save one slot at a time.', 'warning');
      return;
    }

    const targetSlot = changedSlotKeys[0];
    const targetRow = rows.find(r => getSlotKey(r) === targetSlot);
    const isEmpty = ['nacl', 'bd', 'turbidity'].every(f => !targetRow?.[f] || String(targetRow[f]).trim() === '');
    if (isEmpty) {
      showToast?.(`Cannot save empty slot ${targetSlot}. At least one measurement is required.`, 'warning');
      return;
    }

    setConfirmData({
      date,
      targetSlot,
      targetRow,
      averageNaCl: stats.avg,
    });
    setShowConfirmModal(true);
  };

  // ── Save Handler ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        plant: 'SA',
        plantCode: 'SA',
        analysisType: 'LSA AT 500# Analysis',
        unit: 'LSA AT 500#',
        targetSlot: confirmData?.targetSlot,
        rows,
        averageNaCl: stats.avg,
        submittedBy: user?.name || 'Plant Operator',
      };

      const res = await api.post('/api/lsa-500-analysis', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save LSA AT 500# Analysis data.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setOriginalRows(JSON.parse(JSON.stringify(rows)));
      setLastSaved(new Date().toLocaleTimeString());

      const returnedDoc = res.data?.data || res.data?.record || {};
      const newEdited = res.data?.editedFields || returnedDoc.editedFields || {};
      const newRecordId = res.data?.recordId || returnedDoc._id || returnedDoc.id;

      setEditedFields(newEdited);
      setLockedSlots(returnedDoc.lockedSlots || res.data?.lockedSlots || {});
      if (newRecordId) setRecordId(newRecordId);

      const statusFromApi = res.data?.emailStatus || res.data?.emailDeliveryStatus;
      if (statusFromApi === 'disabled') {
        setSavePhase('completed');
        setEmailStatusDetail('Saved ✓ (Email disabled for this plant)');
        showToast?.('Saved ✓', 'success');
      } else {
        setSavePhase('completed');
        setEmailStatusDetail('Saved successfully.');
        showToast?.('Saved ✓', 'success');
      }
    } catch (err) {
      console.error('Error saving LSA AT 500# data:', err);
      const msg = err?.response?.data?.message || 'Failed to save LSA AT 500# Analysis data.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  const getCellClass = (val, paramKey, hasErr) => {
    if (hasErr) return 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200';
    if (!val || val === '') return 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:ring-emerald-100 hover:border-slate-400';
    
    const status = validateValue(val, paramKey);
    if (status === 'out') return 'border-red-500 bg-red-50 text-red-900 focus:border-red-600 focus:ring-red-200';
    return 'border-emerald-500 bg-emerald-50 text-emerald-900 focus:border-emerald-600 focus:ring-emerald-200';
  };

  const getLimitText = (paramKey) => {
    const limit = getCellLimit(plantId, 'lsa-500', 'onceIn2Hrs', paramKey);
    return limit ? limit.formattedRange || limit.referenceDisplay : null;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── TOP HEADER BAR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Soda Ash Plant</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-emerald-600">LSA AT 500#</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Frequency: Once in 2 Hrs
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Layers className="w-6 h-6 text-emerald-600 inline" />
              LSA AT 500# ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Controls & Buttons */}
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
            id="lsa500-date-display"
            badgeText="Operating Day"
          />

          <div className="flex items-center gap-2 shrink-0">
            {!isViewOnly && (
              <button
                onClick={handleReset}
                id="btn-lsa500-reset"
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition shadow-xs disabled:opacity-50 cursor-pointer"
                title="Reset fields to last saved state"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Reset
              </button>
            )}

            {!isViewOnly && (
              <StatusSaveButton
                id="btn-lsa500-save"
                saving={saving}
                savePhase={savePhase}
                onClick={handleSaveClick}
                defaultLabel="Save Analysis"
                title="Save LSA AT 500# data"
                alwaysShowSaveText
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner ── */}
      <SaveStatusBanner
        id="lsa500-success-banner"
        saveSuccess={savePhase === 'completed'}
        savePhase={savePhase}
        date={date}
        analysisName="LSA AT 500# Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onDismiss={() => setSavePhase('idle')}
        saving={saving}
      />

      {/* ── Table Container ── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left border-collapse" id="lsa500-table">
            <thead className="sticky top-0 bg-slate-900 text-white z-10 select-none shadow-sm">
              <tr>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center w-14 border-r border-slate-800">#</th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase w-32 border-r border-slate-800">Time</th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center w-28 border-r border-slate-800">Status</th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center border-r border-slate-800">
                  NaCl %
                </th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center border-r border-slate-800">
                  BD
                </th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center border-r border-slate-800">
                  TURBIDITY
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {rows.map((row, index) => {
                const slotKey = getSlotKey(row);
                const disabled = isSlotDisabled(slotKey);
                const slotStatus = getSlotStatus(slotKey);
                const rowKey = row.id || `time_${row.time}`;
                const rowEdits = editedFields[slotKey] || editedFields[rowKey] || {};
                const hasVal = row.nacl !== '' || row.bd !== '' || row.turbidity !== '';

                return (
                  <tr key={row.id} className={`transition-colors ${disabled ? 'bg-slate-50/60' : hasVal ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-400 border-r border-slate-100">{index + 1}</td>
                    
                    {/* Time (Read-only) */}
                    <td className="px-3 py-1.5 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={row.time}
                          readOnly
                          disabled
                          placeholder="HH:MM"
                          className="w-full max-w-[130px] px-2.5 py-1 text-xs font-bold font-mono text-slate-800 bg-slate-100 border border-slate-300 rounded outline-none transition text-center cursor-not-allowed"
                          id={`lsa500-time-${index}`}
                        />
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      <RecordStatusBadge status={slotStatus} />
                    </td>
                    
                    {/* NaCl % */}
                    <td className="px-4 py-2 border-r border-slate-100">
                      <div className="flex flex-col items-center justify-center max-w-[200px] mx-auto gap-1">
                        <div className="relative w-full">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={disabled}
                            value={row.nacl}
                            placeholder="0.00"
                            onChange={(e) => handleCellChange(row.id, 'nacl', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const next = document.getElementById(`lsa500-bd-${index}`);
                                if (next) next.focus();
                              }
                            }}
                            id={`lsa500-nacl-${index}`}
                            className={`w-full px-3 py-1 text-xs font-bold font-mono text-center rounded border transition outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-400 ${getCellClass(row.nacl, 'nacl', errors[`${row.id}_nacl`])}`}
                          />
                          {rowEdits.nacl && (
                            <span
                              className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                              title="Field previously edited"
                            >
                              EDITED
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium tracking-wide">Limit: {getLimitText('nacl') || '0.5 – 2.0 %'}</span>
                      </div>
                    </td>

                    {/* BD */}
                    <td className="px-4 py-2 border-r border-slate-100">
                      <div className="flex flex-col items-center justify-center max-w-[200px] mx-auto gap-1">
                        <div className="relative w-full">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={disabled}
                            value={row.bd}
                            placeholder="0.00"
                            onChange={(e) => handleCellChange(row.id, 'bd', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const next = document.getElementById(`lsa500-turbidity-${index}`);
                                if (next) next.focus();
                              }
                            }}
                            id={`lsa500-bd-${index}`}
                            className={`w-full px-3 py-1 text-xs font-bold font-mono text-center rounded border transition outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-400 ${getCellClass(row.bd, 'bd', errors[`${row.id}_bd`])}`}
                          />
                          {rowEdits.bd && (
                            <span
                              className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                              title="Field previously edited"
                            >
                              EDITED
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium tracking-wide">Limit: {getLimitText('bd') || '500 – 750 g/L'}</span>
                      </div>
                    </td>

                    {/* TURBIDITY */}
                    <td className="px-4 py-2 border-r border-slate-100">
                      <div className="flex flex-col items-center justify-center max-w-[200px] mx-auto gap-1">
                        <div className="relative w-full">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={disabled}
                            value={row.turbidity}
                            placeholder="0.00"
                            onChange={(e) => handleCellChange(row.id, 'turbidity', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const next = document.getElementById(`lsa500-nacl-${index + 1}`);
                                if (next) next.focus();
                              }
                            }}
                            id={`lsa500-turbidity-${index}`}
                            className={`w-full px-3 py-1 text-xs font-bold font-mono text-center rounded border transition outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-400 ${getCellClass(row.turbidity, 'turbidity', errors[`${row.id}_turbidity`])}`}
                          />
                          {rowEdits.turbidity && (
                            <span
                              className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                              title="Field previously edited"
                            >
                              EDITED
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium tracking-wide">Limit: {getLimitText('turbidity') || '75 – 85 NTU'}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100/80 border-t-2 border-slate-300 sticky bottom-0 z-10 font-bold text-xs">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right text-slate-700 uppercase tracking-wider font-extrabold border-r border-slate-300">
                  Average NaCl %:
                </td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-black text-sm border-r border-slate-300">
                  {stats.avg !== null ? `${stats.avg}%` : '—'}
                </td>
                <td colSpan={2} className="px-4 py-2.5 text-slate-500 text-xs italic">
                  ({rows.length} Total Time Slots)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <div>Values for <strong>LSA AT 500#</strong> (NaCl %, BD, Turbidity). Numeric decimal values only. Leave blank if not sampled.</div>
          <div>One correction allowed after first save; saving the next slot locks the previous one.</div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleUp">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Analysis Save</h3>
                  <p className="text-xs text-slate-500">Soda Ash Plant — LSA AT 500# Analysis</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-600">
              <p>
                You are about to persist readings for slot <strong>{confirmData?.targetSlot}</strong> ({confirmData?.targetRow?.time || 'Scheduled Time'}):
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Operating Date:</span>
                  <span className="font-bold text-slate-800">{date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Slot:</span>
                  <span className="font-bold text-slate-800">{confirmData?.targetSlot} ({confirmData?.targetRow?.time})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NaCl %:</span>
                  <span className="font-bold text-slate-800">{confirmData?.targetRow?.nacl || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">BD:</span>
                  <span className="font-bold text-slate-800">{confirmData?.targetRow?.bd || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Turbidity:</span>
                  <span className="font-bold text-slate-800">{confirmData?.targetRow?.turbidity || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Average NaCl:</span>
                  <span className="font-bold text-emerald-700">{confirmData?.averageNaCl !== null ? `${confirmData?.averageNaCl}%` : '—'}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Saving will securely store this slot in MongoDB.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
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

export default LSA500AnalysisPage;
