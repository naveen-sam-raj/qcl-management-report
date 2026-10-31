import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  Lock,
  Activity,
} from 'lucide-react';
import {
  getOperatingDateIST,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  EditedBadge,
} from '../../utils/co2AnalysisHelper';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';

const DEFAULT_READINGS = [
  { id: '1', time: '07:00', fnh3: '', cnh3: '', ca: '' },
  { id: '2', time: '15:00', fnh3: '', cnh3: '', ca: '' },
  { id: '3', time: '23:00', fnh3: '', cnh3: '', ca: '' },
];

const DEFAULT_LOCKS = {
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift1Locked: false,
  shift2Locked: false,
  shift3Locked: false,
  shift1: false,
  shift2: false,
  shift3: false,
  shift1Edits: 0,
  shift2Edits: 0,
  shift3Edits: 0,
};

const PARAM_FIELDS = ['fnh3', 'cnh3', 'ca'];
const NUMERIC_FIELDS = ['fnh3', 'cnh3'];
const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const VacuumSealWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date] = useState(() => getOperatingDateIST());
  const [readings, setReadings] = useState(() => DEFAULT_READINGS.map((r) => ({ ...r })));
  const [originalReadings, setOriginalReadings] = useState(() => DEFAULT_READINGS.map((r) => ({ ...r })));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [lockedShifts, setLockedShifts] = useState(DEFAULT_LOCKS);
  const [lockedSlots, setLockedSlots] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const getShiftSlotKey = useCallback((row) => {
    if (!row) return 'shift1';
    const idStr = String(row.id || '').trim();
    const timeStr = String(row.time || '').trim();
    if (idStr === '1' || timeStr === '07:00') return 'shift1';
    if (idStr === '2' || timeStr === '15:00') return 'shift2';
    if (idStr === '3' || timeStr === '23:00') return 'shift3';
    return 'shift1';
  }, []);

  const isShiftDisabled = useCallback((slotKey) => {
    if (isViewOnly) return true;
    if (slotKey === 'shift1') {
      return Boolean(lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved);
    }
    if (slotKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved);
    }
    if (slotKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3 || lockedShifts.shift3Locked) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  const getShiftBadgeStatus = useCallback((slotKey) => {
    if (slotKey === 'shift1') {
      if (lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved) return 'LOCKED';
      if (lockedShifts.shift1Saved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return 'WAITING';
      if (lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved) return 'LOCKED';
      if (lockedShifts.shift2Saved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return 'WAITING';
      if (lockedShifts.shift3 || lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) return 'LOCKED';
      if (lockedShifts.shift3Saved) return 'EDITABLE';
      return 'OPEN';
    }
    return 'WAITING';
  }, [lockedShifts]);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const res = await api.get(`/api/vacuum-seal-water-analysis?date=${date}`);
        if (!active) return;

        if (res.data?.success && res.data?.data) {
          const fetchedData = res.data.data;
          const rawReadings = fetchedData.readings || fetchedData.shifts || fetchedData.rows || [];

          const merged = DEFAULT_READINGS.map((defRow) => {
            const slotKey = getShiftSlotKey(defRow);
            const found = rawReadings.find((r) => getShiftSlotKey(r) === slotKey);
            if (found) {
              return {
                id: defRow.id,
                time: defRow.time,
                fnh3: found.fnh3 !== undefined && found.fnh3 !== null ? String(found.fnh3) : '',
                cnh3: found.cnh3 !== undefined && found.cnh3 !== null ? String(found.cnh3) : '',
                ca: found.ca !== undefined && found.ca !== null ? String(found.ca).trim() : '',
              };
            }
            return { ...defRow };
          });

          setReadings(merged);
          setOriginalReadings(JSON.parse(JSON.stringify(merged)));
          setRecordId(fetchedData._id || fetchedData.id || res.data.recordId || null);
          setLockedShifts(fetchedData.lockedShifts || res.data.lockedShifts || DEFAULT_LOCKS);
          setLockedSlots(fetchedData.lockedSlots || res.data.lockedSlots || {});
          setEditedFields(fetchedData.editedFields || res.data.editedFields || {});
          setRecipientEmail(res.data.assignedOperatorEmail || fetchedData.emailRecipient || '');
        } else {
          setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          setOriginalReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          setRecordId(null);
          setLockedShifts(res.data?.lockedShifts || DEFAULT_LOCKS);
          setLockedSlots(res.data?.lockedSlots || {});
          setEditedFields({});
          setRecipientEmail(res.data?.assignedOperatorEmail || '');
        }
      } catch (err) {
        if (!active) return;
        if (err?.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        }
        setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
        setOriginalReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
        setLockedShifts(DEFAULT_LOCKS);
        setLockedSlots({});
        setEditedFields({});
      }
    };

    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date, getShiftSlotKey]);

  // ── Cell Value Change ──
  const handleCellChange = (rowId, field, value) => {
    if (isViewOnly) return;
    if (!isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => {
        if (r.id === rowId) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );

    // Clear field-level error
    const errKey = `${rowId}_${field}`;
    if (errors[errKey]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    }
  };

  // ── Form Reset ──
  const handleReset = () => {
    if (isViewOnly) return;
    setReadings(JSON.parse(JSON.stringify(originalReadings)));
    setErrors({});
  };

  // ── Summary Calculations ──
  const stats = useMemo(() => {
    const calcAvg = (field) => {
      const vals = readings
        .map((r) => parseFloat(r[field]))
        .filter((n) => !isNaN(n));
      return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    };

    return {
      fnh3Avg: calcAvg('fnh3'),
      cnh3Avg: calcAvg('cnh3'),
    };
  }, [readings]);

  // ── Pre-Save Prompt & Validation ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    readings.forEach((r) => {
      NUMERIC_FIELDS.forEach((f) => {
        if (r[f] !== '' && r[f] !== null && r[f] !== undefined && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const modifiedShifts = [];
    readings.forEach((r) => {
      const slotKey = getShiftSlotKey(r);
      if (isShiftDisabled(slotKey)) return;
      const origRow = originalReadings?.find((o) => o.id === r.id);
      const isDiff = NUMERIC_FIELDS.some((f) => {
        const origVal = origRow?.[f] ?? '';
        const curVal = r[f] ?? '';
        return String(origVal).trim() !== String(curVal).trim();
      });
      const hasAnyVal = NUMERIC_FIELDS.some((f) => r[f] !== '' && r[f] !== null && r[f] !== undefined);
      if (isDiff || (!lockedShifts?.[`${slotKey}Saved`] && hasAnyVal)) {
        modifiedShifts.push(slotKey);
      }
    });

    if (modifiedShifts.length === 0) {
      showToast?.('No changes', 'info');
      return;
    }

    if (modifiedShifts.length > 1) {
      showToast?.('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    const targetSlot = modifiedShifts[0];
    const targetRow = readings.find((r) => getShiftSlotKey(r) === targetSlot);
    const summaryItems = [
      { label: 'FNH3', value: targetRow?.fnh3 ? `${targetRow.fnh3} ppm` : '—' },
      { label: 'CNH3', value: targetRow?.cnh3 ? `${targetRow.cnh3} ppm` : '—' },
      { label: 'Ca', value: targetRow?.ca ? `${targetRow.ca}` : '—' },
    ];

    setConfirmData({
      date,
      readings,
      targetSlot,
      shiftOrTime: targetSlot === 'shift1' ? 'I SHIFT (07:00)' : targetSlot === 'shift2' ? 'II SHIFT (15:00)' : 'III SHIFT (23:00)',
      summaryItems,
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
        plant: 'OFFSET',
        plantCode: 'OFFSITE',
        unit: 'Bottom ash',
        analysisType: 'Vacuum Seal Water Analysis',
        readings,
        targetSlot: confirmData?.targetSlot,
        submittedBy: user?.name || 'Plant Operator',
      };

      const res = await api.post('/api/vacuum-seal-water-analysis', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save Vacuum Seal Water Analysis.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setOriginalReadings(JSON.parse(JSON.stringify(readings)));
      setLastSaved(new Date().toLocaleTimeString());

      const returnedDoc = res.data?.data || res.data?.record || {};
      const newEdited = res.data?.editedFields || returnedDoc.editedFields || {};
      const newRecordId = res.data?.recordId || returnedDoc._id || returnedDoc.id;

      setEditedFields(newEdited);
      setLockedShifts(returnedDoc.lockedShifts || res.data?.lockedShifts || DEFAULT_LOCKS);
      setLockedSlots(returnedDoc.lockedSlots || res.data?.lockedSlots || {});
      if (newRecordId) setRecordId(newRecordId);

      const deliveryStatus = res.data?.emailDeliveryStatus || res.data?.emailStatus;
      if (deliveryStatus === 'disabled' || res.data?.emailStatus === 'disabled') {
        setSavePhase('completed');
        setEmailStatusDetail('Saved ✓');
        showToast?.('Saved ✓', 'success');
      } else {
        setSavePhase('completed');
        setEmailStatusDetail('Saved ✓');
        showToast?.('Saved ✓', 'success');
      }
    } catch (err) {
      console.error('Error saving Vacuum Seal Water data:', err);
      const msg = err?.response?.data?.message || 'Failed to save Vacuum Seal Water Analysis data.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Top Header Navigation ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">OFFSITE Plant</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                Vacuum Seal Water
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Frequency: 3 Shifts (07:00, 15:00, 23:00)
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Activity className="w-5 h-5 text-amber-600" />
              BOTTOM ASH ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Controls & Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {lastSaved && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Saved at {lastSaved}
            </span>
          )}

          {!isViewOnly && (
            <button
              onClick={handleReset}
              disabled={saving}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly && (
            <StatusSaveButton
              id="btn-vacuum-seal-water-save"
              saving={saving}
              savePhase={savePhase}
              onClick={handleSaveClick}
              defaultLabel="Save Vacuum Seal Water Data"
              title="Save Vacuum Seal Water observations"
              alwaysShowSaveText={true}
            />
          )}
        </div>
      </div>

      {/* ── Status Banner (Save Status) ── */}
      <SaveStatusBanner
        id="vacuum-seal-water-status-banner"
        saveSuccess={savePhase === 'completed'}
        savePhase={savePhase}
        date={date}
        analysisName="Vacuum Seal Water Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={() => {}}
        onDismiss={() => setSavePhase('idle')}
      />

      {/* ── Control Bar: Operating Day Display ── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <LockedDateDisplay
          date={date}
          id="vacuum-seal-water-date"
          badgeText="Operating Day"
        />

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="font-semibold">Sequential Shift Lock:</span>
            <span>I (07:00) → II (15:00) → III (23:00)</span>
          </div>
        </div>
      </div>

      {/* ── Analytical Observations Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">Shift Observations & Measurements</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white font-semibold text-xs border-b border-slate-700">
                <th className="py-2.5 px-3 text-center border-r border-slate-700 w-12">#</th>
                <th className="py-2.5 px-4 text-center border-r border-slate-700 w-44">SHIFT & STATUS</th>
                <th className="py-2.5 px-4 text-center border-r border-slate-700 w-32">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-300" />
                    TIME
                  </div>
                </th>
                <th className="py-2.5 px-4 text-center border-r border-slate-700">
                  FNH3 <span className="text-[10px] text-slate-300 font-normal">(ppm)</span>
                </th>
                <th className="py-2.5 px-4 text-center border-r border-slate-700">
                  CNH3 <span className="text-[10px] text-slate-300 font-normal">(ppm)</span>
                </th>
                <th className="py-2.5 px-4 text-center border-r border-slate-700">
                  Ca <span className="text-[10px] text-slate-300 font-normal">(ppm)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, index) => {
                const slotKey = getShiftSlotKey(row);
                const disabled = isShiftDisabled(slotKey);
                const shiftStatus = getShiftBadgeStatus(slotKey);
                const shiftLabel = slotKey === 'shift1' ? 'I SHIFT' : slotKey === 'shift2' ? 'II SHIFT' : 'III SHIFT';

                const fnh3Err = errors[`${row.id}_fnh3`];
                const cnh3Err = errors[`${row.id}_cnh3`];
                const caErr = errors[`${row.id}_ca`];

                const fnh3Limit = getCellLimit('offset', 'vacuum-seal-water', 'Day', 'fnh3');
                const fnh3Valid = fnh3Limit && row.fnh3 !== '' ? validateCellValue(row.fnh3, fnh3Limit) : { isOutOfLimit: false };

                const caLimit = getCellLimit('offset', 'vacuum-seal-water', 'Day', 'ca');
                const isCaNil = row.ca !== undefined && ['nil', 'n', 'ni', 'none', '-'].includes(String(row.ca).toLowerCase().trim());
                const caValid = caLimit && row.ca !== '' ? (isCaNil ? { isOutOfLimit: false } : { isOutOfLimit: true }) : { isOutOfLimit: false };

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      disabled ? 'bg-slate-50/60' : 'hover:bg-amber-50/20'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-3 px-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Shift & Lock Status */}
                    <td className="py-3 px-4 text-center border-r border-slate-100 align-middle">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <span className="font-mono text-xs font-black text-slate-800 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-300">
                          {shiftLabel}
                        </span>
                        <RecordStatusBadge status={shiftStatus} />
                      </div>
                    </td>

                    {/* Sampling Time (read-only) */}
                    <td className="py-3 px-4 text-center border-r border-slate-100">
                      <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100/80 px-2.5 py-1 rounded-md border border-slate-200">
                        {row.time}
                      </span>
                    </td>

                    {/* FNH3 (ppm) */}
                    <td className="py-3 px-4 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.fnh3}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'fnh3', e.target.value)}
                          placeholder="0"
                          className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                            disabled
                              ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                              : fnh3Err || fnh3Valid.isOutOfLimit
                              ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                              : row.fnh3 !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-sky-600 focus:ring-2 focus:ring-sky-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-sky-600 focus:bg-white focus:ring-2 focus:ring-sky-100'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">
                          ppm
                        </span>
                      </div>
                      <EditedBadge isEdited={editedFields[`${row.id}_fnh3`] || editedFields[`${row.time}_fnh3`] || editedFields[`${slotKey}_fnh3`]} />
                      {fnh3Err && (
                        <div className="text-[10px] text-red-600 font-semibold mt-1">
                          {fnh3Err}
                        </div>
                      )}
                      {fnh3Valid.isOutOfLimit && !fnh3Err && fnh3Limit && (
                        <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {fnh3Limit.formattedLabel || `Limit: ${fnh3Limit.min}-${fnh3Limit.max}`}
                        </div>
                      )}
                      {!fnh3Valid.isOutOfLimit && !fnh3Err && fnh3Limit && row.fnh3 === '' && (
                        <div className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {fnh3Limit.formattedRange || `${fnh3Limit.min}-${fnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* CNH3 (ppm) */}
                    <td className="py-3 px-4 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.cnh3}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'cnh3', e.target.value)}
                          placeholder="0"
                          className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                            disabled
                              ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                              : cnh3Err
                              ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200'
                              : row.cnh3 !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-100'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">
                          ppm
                        </span>
                      </div>
                      <EditedBadge isEdited={editedFields[`${row.id}_cnh3`] || editedFields[`${row.time}_cnh3`] || editedFields[`${slotKey}_cnh3`]} />
                      {cnh3Err && (
                        <div className="text-[10px] text-red-600 font-semibold mt-1">
                          {cnh3Err}
                        </div>
                      )}
                    </td>

                    {/* Ca (ppm) - Free text */}
                    <td className="py-3 px-4 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={row.ca !== undefined ? row.ca : ''}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'ca', e.target.value)}
                          placeholder="Nil"
                          className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                            disabled
                              ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                              : caErr || caValid.isOutOfLimit
                              ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                              : row.ca !== undefined && row.ca !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-100'
                          }`}
                        />
                      </div>
                      <EditedBadge isEdited={editedFields[`${row.id}_ca`] || editedFields[`${row.time}_ca`] || editedFields[`${slotKey}_ca`]} />
                      {caErr && (
                        <div className="text-[10px] text-red-600 font-semibold mt-1">
                          {caErr}
                        </div>
                      )}
                      {caValid.isOutOfLimit && !caErr && caLimit && (
                        <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          Limit: NIL
                        </div>
                      )}
                      {!caValid.isOutOfLimit && !caErr && caLimit && (row.ca === '' || row.ca === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          NIL
                        </div>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Summary Info and Spec Note */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium italic">
            One correction allowed after first save; saving the next slot/shift locks the previous one.
          </div>

          <div className="flex items-center gap-4">
            {stats.fnh3Avg && (
              <span className="font-bold text-slate-700">
                Avg FNH3:{' '}
                <span className="text-sky-700 font-mono">{stats.fnh3Avg} ppm</span>
              </span>
            )}
            {stats.cnh3Avg && (
              <span className="font-bold text-slate-700">
                Avg CNH3:{' '}
                <span className="text-indigo-700 font-mono">{stats.cnh3Avg} ppm</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Save Confirmation Modal ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="Vacuum Seal Water Analysis"
        date={date}
        shiftOrTime={confirmData?.shiftOrTime}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default VacuumSealWaterAnalysisPage;
