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
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';

const SIEVE_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];

const TIME_TO_SLOT = {
  '09:30': 'r1', '10:30': 'r2', '11:30': 'r3', '14:30': 'r4',
  '16:30': 'r5', '18:30': 'r6', '20:30': 'r7', '22:30': 'r8',
  '00:30': 'r9', '02:30': 'r10', '04:30': 'r11', '06:30': 'r12',
};

// Sieve size parameters: BSS 10, BSS 30 (1.5%–2.0%), -30, BSS 60 (5.5%–6.0%)
const PARAMETERS = [
  { key: 'bss10', legacyKey: 'p10', label: 'BSS 10', unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss30', legacyKey: 'p30', label: 'BSS 30', unit: '%', placeholder: '1.8', colClass: 'min-w-[130px]' },
  { key: 'm30',   legacyKey: 'p60', label: '-30',    unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss60', legacyKey: 'm60', label: 'BSS 60', unit: '%', placeholder: '5.8', colClass: 'min-w-[130px]' },
];

const DEFAULT_ROWS = [
  { id: 'r1',  time: '09:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r2',  time: '10:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r3',  time: '11:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r4',  time: '14:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r5',  time: '16:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r6',  time: '18:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r7',  time: '20:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r8',  time: '22:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r9',  time: '00:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r10', time: '02:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r11', time: '04:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r12', time: '06:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
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

const LSABaggingSieveAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Strict Operating Date) ──
  const [date]                                          = useState(() => getOperatingDateIST());
  const [rows, setRows]                                 = useState(DEFAULT_ROWS);
  const [initialRows, setInitialRows]                   = useState(null);
  const [errors, setErrors]                             = useState({});
  const [saving, setSaving]                             = useState(false);
  const [savePhase, setSavePhase]                       = useState('idle');
  const [recordId, setRecordId]                         = useState(null);
  const [editedFields, setEditedFields]                 = useState({});
  const [lockedSlots, setLockedSlots]                   = useState({});
  const [recipientEmail, setRecipientEmail]             = useState('');
  const [emailStatusDetail, setEmailStatusDetail]       = useState('');
  const [showConfirmModal, setShowConfirmModal]         = useState(false);
  const [confirmData, setConfirmData]                   = useState(null);

  const getSlotKey = useCallback((row) => {
    if (!row) return null;
    const t = String(row.time || '').trim();
    if (TIME_TO_SLOT[t]) return TIME_TO_SLOT[t];
    const idStr = String(row.id || '').trim();
    const defaultRow = DEFAULT_ROWS.find(d => d.id === idStr);
    if (defaultRow && (!row.time || row.time === defaultRow.time)) return idStr;
    return null;
  }, []);

  const getSlotStatus = useCallback((slotKey) => {
    if (!slotKey || !SIEVE_SLOTS.includes(slotKey)) return 'LOCKED';
    const s = lockedSlots[slotKey] || {};
    const idx = SIEVE_SLOTS.indexOf(slotKey);

    if (idx === 0) {
      if (s.isLocked) return 'LOCKED';
      const nextKey = SIEVE_SLOTS[1];
      if (lockedSlots[nextKey]?.isSaved) return 'LOCKED';
      if (s.isSaved) return 'EDITABLE';
      return 'NEW';
    }

    const prevKey = SIEVE_SLOTS[idx - 1];
    if (!lockedSlots[prevKey]?.isSaved) return 'WAITING';

    if (s.isLocked) return 'LOCKED';
    if (idx < SIEVE_SLOTS.length - 1) {
      const nextKey = SIEVE_SLOTS[idx + 1];
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

  // Fetch today's persisted data on mount
  const fetchPersistedData = useCallback(async (selectedDate) => {
    try {
      const res = await api.get(`/api/lsa-bagging-sieve?date=${selectedDate}`);
      const payload = res.data?.record || (Array.isArray(res.data?.data) && res.data.data[0]) || null;
      const returnedSlots = res.data?.lockedSlots || payload?.lockedSlots || payload?.data?.lockedSlots || {};
      setLockedSlots(returnedSlots);

      if (payload && Array.isArray(payload.rows) && payload.rows.length > 0) {
        setRecordId(res.data?.recordId || payload.id || null);
        setEditedFields(payload.editedFields || res.data?.editedFields || {});
        setRecipientEmail(payload.emailRecipient || res.data?.assignedOperatorEmail || '');

        const savedRows = payload.rows;
        const merged = DEFAULT_ROWS.map((defRow) => {
          const found = savedRows.find((s) => (getSlotKey(s) === defRow.id) || (s.id === defRow.id && (!s.time || s.time === defRow.time)));
          if (found) {
            return {
              ...defRow,
              ...found,
              id: defRow.id,
              time: defRow.time,
              isDefault: true,
            };
          }
          return { ...defRow };
        });

        const customRows = savedRows.filter((s) => !getSlotKey(s));
        customRows.forEach((cRow) => {
          if (!merged.some(m => m.id === cRow.id || (m.time && cRow.time && m.time === cRow.time))) {
            merged.push({
              ...cRow,
              isDefault: false,
            });
          }
        });

        setRows(merged);
        setInitialRows(JSON.parse(JSON.stringify(merged)));
      } else {
        setRows(DEFAULT_ROWS);
        setInitialRows(null);
        setRecordId(null);
        setEditedFields({});
      }
    } catch (err) {
      console.warn('[LSABaggingSieve] Fetch note:', err);
      setRows(DEFAULT_ROWS);
      setInitialRows(null);
      setRecordId(null);
      setEditedFields({});
    }
  }, []);

  useEffect(() => {
    fetchPersistedData(date);
  }, [date, fetchPersistedData]);

  // Cell Value Change
  const handleCellChange = useCallback((id, field, value) => {
    if (isViewOnly) return;
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
  }, [errors, isViewOnly]);

  const handleReset = useCallback(() => {
    if (isViewOnly) return;
    if (initialRows) {
      setRows(JSON.parse(JSON.stringify(initialRows)));
      showToast?.('Restored values to last saved state.', 'info');
    } else {
      setRows(DEFAULT_ROWS);
      showToast?.('LSA Bagging Sieve form cleared.', 'info');
    }
    setErrors({});
  }, [initialRows, showToast, isViewOnly]);

  // Save Click
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    rows.forEach((r) => {
      PARAMETERS.forEach((p) => {
        const val = r[p.key] !== undefined && r[p.key] !== '' ? r[p.key] : r[p.legacyKey];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.id}_${p.key}`] = 'Invalid';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please resolve highlighted errors before saving.', 'error');
      return;
    }

    const baseline = initialRows || DEFAULT_ROWS;
    const changedSlotKeys = [];

    SIEVE_SLOTS.forEach((sk) => {
      const curRow = rows.find(r => getSlotKey(r) === sk);
      const baseRow = baseline.find(r => getSlotKey(r) === sk);
      const hasDiff = PARAMETERS.some((p) => {
        const oVal = baseRow?.[p.key] !== undefined && baseRow?.[p.key] !== '' ? baseRow?.[p.key] : baseRow?.[p.legacyKey];
        const nVal = curRow?.[p.key] !== undefined && curRow?.[p.key] !== '' ? curRow?.[p.key] : curRow?.[p.legacyKey];
        return isValDiff(oVal, nVal);
      });
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
    const isEmpty = PARAMETERS.every((p) => {
      const val = targetRow?.[p.key] !== undefined && targetRow?.[p.key] !== '' ? targetRow?.[p.key] : targetRow?.[p.legacyKey];
      return !val || String(val).trim() === '';
    });

    if (isEmpty) {
      showToast?.(`Cannot save empty slot ${targetSlot}. At least one measurement is required.`, 'warning');
      return;
    }

    setConfirmData({
      date,
      targetSlot,
      targetRow,
    });
    setShowConfirmModal(true);
  };

  // Confirm Save
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        targetSlot: confirmData?.targetSlot,
        rows,
        submittedBy: user?.name || 'Plant Operator',
      };

      const res = await api.post('/api/lsa-bagging-sieve', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save LSA Bagging Sieve data.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setInitialRows(JSON.parse(JSON.stringify(rows)));

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
      console.error('[LSABaggingSieve] Save error:', err);
      const msg = err?.response?.data?.message || 'Failed to save LSA Bagging Sieve data.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
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
              <span className="text-xs font-semibold text-blue-600">LSA Bagging Sieve</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Frequency: 1 Hour Once
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Layers className="w-6 h-6 text-blue-600 inline" />
              LSA BAGGING SIEVE ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Controls & Buttons */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {/* Locked Operating Date Display */}
          <LockedDateDisplay
            date={date}
            id="lsa-bagging-sieve-date-display"
            badgeText="Operating Day"
          />

          <div className="flex items-center gap-2 shrink-0">
            {!isViewOnly && (
              <button
                onClick={handleReset}
                id="btn-sieve-reset"
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition shadow-xs disabled:opacity-50 cursor-pointer"
                title="Reset fields to last saved state"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Reset
              </button>
            )}

            {!isViewOnly && (
              <StatusSaveButton
                id="btn-sieve-save"
                saving={saving}
                savePhase={savePhase}
                onClick={handleSaveClick}
                defaultLabel="Save Analysis"
                title="Save LSA Bagging Sieve data"
                alwaysShowSaveText
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner ── */}
      <SaveStatusBanner
        id="sieve-success-banner"
        saveSuccess={savePhase === 'completed'}
        savePhase={savePhase}
        date={date}
        analysisName="LSA Bagging Sieve Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onDismiss={() => setSavePhase('idle')}
        saving={saving}
      />

      {/* ── Table Container ── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left border-collapse" id="sieve-table">
            <thead className="sticky top-0 bg-slate-900 text-white z-10 select-none shadow-sm">
              <tr>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center w-14 border-r border-slate-800">#</th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase w-32 border-r border-slate-800">Time</th>
                <th className="px-4 py-2.5 text-xs font-extrabold tracking-wider uppercase text-center w-28 border-r border-slate-800">Status</th>
                {PARAMETERS.map((p) => {
                  const limit = getCellLimit(plantId, 'lsa-bagging-sieve', 'hourly', p.key);
                  return (
                    <th
                      key={p.key}
                      className="px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 border-r border-slate-800"
                    >
                      <div>{p.label} ({p.unit})</div>
                      {limit && (
                        <div className="text-[10px] text-blue-300 font-medium">
                          {limit.formattedRange}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {rows.map((row, index) => {
                const slotKey = getSlotKey(row);
                const disabled = isSlotDisabled(slotKey);
                const slotStatus = getSlotStatus(slotKey);
                const rowKey = row.id || row.time;

                return (
                  <tr key={row.id || index} className={`transition-colors ${disabled ? 'bg-slate-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-400 border-r border-slate-100">{index + 1}</td>
                    
                    {/* Time Input (Strictly Read-only and Disabled, ensuring isViewOnly respected) */}
                    <td className="px-3 py-1.5 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={row.time}
                          readOnly
                          disabled
                          placeholder="HH:MM"
                          className="w-full max-w-[110px] px-2.5 py-1 text-xs font-mono font-bold text-center text-slate-800 bg-slate-100 border border-slate-300 rounded outline-none transition cursor-not-allowed"
                          id={`sieve-time-${index}`}
                        />
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      <RecordStatusBadge status={slotStatus} />
                    </td>

                    {/* Parameter inputs */}
                    {PARAMETERS.map((param) => {
                      const cellVal = row[param.key] !== undefined && row[param.key] !== '' ? row[param.key] : (row[param.legacyKey] !== undefined ? row[param.legacyKey] : '');
                      const limit = getCellLimit(plantId, 'lsa-bagging-sieve', 'hourly', param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const err = errors[`${row.id}_${param.key}`];

                      const isEdited = Boolean(
                        editedFields?.[slotKey]?.[param.key] ||
                        editedFields?.[slotKey]?.[param.legacyKey] ||
                        editedFields?.[rowKey]?.[param.key] ||
                        editedFields?.[rowKey]?.[param.legacyKey]
                      );

                      return (
                        <td key={param.key} className="px-3 py-1.5 text-center border-r border-slate-100">
                          <div className="relative inline-block w-full max-w-[110px]">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={disabled}
                              value={cellVal}
                              placeholder={param.placeholder}
                              onChange={(e) => handleCellChange(row.id, param.key, e.target.value)}
                              className={`w-full px-2.5 py-1 text-xs font-mono font-bold text-center rounded border transition outline-none disabled:bg-slate-100 disabled:text-slate-400 ${
                                err ? 'border-red-500 bg-red-50' :
                                isOutOfLimit ? 'border-amber-400 bg-amber-50 text-amber-900' :
                                isNormal && hasValue ? 'border-emerald-500 bg-emerald-50 text-emerald-900' :
                                'border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-200'
                              }`}
                              id={`sieve-${param.key}-${index}`}
                            />
                            {isEdited && (
                              <span
                                className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                                title="Field previously edited"
                              >
                                EDITED
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
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <div>Values for <strong>LSA Bagging Sieve</strong>. Numeric decimal values only. Leave blank if not sampled.</div>
          <div>One correction allowed after first save; saving the next slot locks the previous one.</div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleUp">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Analysis Save</h3>
                  <p className="text-xs text-slate-500">Soda Ash Plant — LSA Bagging Sieve Analysis</p>
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
                {PARAMETERS.map((p) => (
                  <div key={p.key} className="flex justify-between">
                    <span className="text-slate-500">{p.label}:</span>
                    <span className="font-bold text-slate-800">{confirmData?.targetRow?.[p.key] || '—'}</span>
                  </div>
                ))}
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
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

export default LSABaggingSieveAnalysisPage;
