import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  AlertCircle,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';

export const BICARBONATE_MOISTURE_LIMITS = {
  m404_a: {
    key: 'm404_a',
    option: 'A',
    paramName: 'Moisture Option A',
    label: 'Option A',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
  m404_b: {
    key: 'm404_b',
    option: 'B',
    paramName: 'Moisture Option B',
    label: 'Option B',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
  m404_c: {
    key: 'm404_c',
    option: 'C',
    paramName: 'Moisture Option C',
    label: 'Option C',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
};

const DEFAULT_READINGS = [
  { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
];

const NUMERIC_FIELDS = [
  'm404_a',
  'm404_b',
  'm404_c',
  'm405_outlet',
  'sb_turb1',
  'sb_turb2',
];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const BicarbonateMoistureAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  const [date]                                      = useState(() => getOperatingDateIST());
  const [readings, setReadings]                     = useState(DEFAULT_READINGS);
  const [originalReadings, setOriginalReadings]     = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [lastSaved, setLastSaved]                   = useState(null);

  const [savePhase, setSavePhase]                   = useState('idle');
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [editedFields, setEditedFields]             = useState({});
  const [lockedShifts, setLockedShifts]             = useState({});
  const [lockedSlots, setLockedSlots]               = useState({
    shift1: { isSaved: false, isLocked: false, correctionUsed: false },
    shift2: { isSaved: false, isLocked: false, correctionUsed: false },
    shift3: { isSaved: false, isLocked: false, correctionUsed: false },
    addl:   { isSaved: false, isLocked: false, correctionUsed: false },
    sample: { isSaved: false, isLocked: false, correctionUsed: false },
  });

  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  const getSlotKey = useCallback((reading) => {
    if (!reading) return null;
    const idStr = String(reading.id || '').trim();
    const shiftStr = String(reading.shift || '').trim().toUpperCase();
    if (idStr === '3' || shiftStr.includes('III SHIFT') || shiftStr === 'III' || shiftStr === '3') return 'shift3';
    if (idStr === '2' || shiftStr.includes('II SHIFT') || shiftStr === 'II' || shiftStr === '2') return 'shift2';
    if (idStr === '1' || shiftStr.includes('I SHIFT') || shiftStr === 'I' || shiftStr === '1') return 'shift1';
    if (idStr === '4' || shiftStr.includes('ADDL') || shiftStr.includes('SAPL1') || shiftStr === '4') return 'addl';
    if (idStr === '5' || shiftStr.includes('SAMPLE') || shiftStr === '5') return 'sample';
    return null;
  }, []);

  const getSlotStatus = useCallback((slotKey) => {
    if (!slotKey) return 'LOCKED';
    const s = lockedSlots[slotKey] || {};
    if (slotKey === 'shift1') {
      if (s.isLocked || lockedSlots.shift2?.isSaved) return 'LOCKED';
      if (s.isSaved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'shift2') {
      if (!lockedSlots.shift1?.isSaved) return 'WAITING';
      if (s.isLocked || lockedSlots.shift3?.isSaved) return 'LOCKED';
      if (s.isSaved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'shift3') {
      if (!lockedSlots.shift2?.isSaved) return 'WAITING';
      if (s.isLocked) return 'LOCKED';
      if (s.isSaved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'addl' || slotKey === 'sample') {
      if (s.isLocked) return 'LOCKED';
      if (s.isSaved) return 'EDITABLE';
      return 'OPEN';
    }
    return 'LOCKED';
  }, [lockedSlots]);

  const isSlotDisabled = useCallback((slotKey) => {
    if (isViewOnly) return true;
    const st = getSlotStatus(slotKey);
    return st === 'LOCKED' || st === 'WAITING';
  }, [isViewOnly, getSlotStatus]);

  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/bicarbonate-moisture?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success) {
          const rec = response.data.record || (Array.isArray(response.data.data) ? response.data.data[0] : response.data.data);
          if (rec) {
            setRecordId(rec._id || response.data.recordId || null);
            setRecipientEmail(rec.emailRecipient || response.data.assignedOperatorEmail || '');

            const fetchedReadings = rec.readings || rec.data?.readings;
            if (Array.isArray(fetchedReadings) && fetchedReadings.length > 0) {
              setReadings(fetchedReadings);
              setOriginalReadings(JSON.parse(JSON.stringify(fetchedReadings)));
            } else {
              setReadings(DEFAULT_READINGS);
              setOriginalReadings(null);
            }

            setEditedFields(rec.editedFields || response.data.editedFields || {});
            setLockedShifts(rec.lockedShifts || response.data.lockedShifts || {});
            setLockedSlots(rec.lockedSlots || response.data.lockedSlots || {
              shift1: { isSaved: false, isLocked: false, correctionUsed: false },
              shift2: { isSaved: false, isLocked: false, correctionUsed: false },
              shift3: { isSaved: false, isLocked: false, correctionUsed: false },
              addl:   { isSaved: false, isLocked: false, correctionUsed: false },
              sample: { isSaved: false, isLocked: false, correctionUsed: false },
            });
          } else {
            setReadings(DEFAULT_READINGS);
            setOriginalReadings(null);
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing Bicarbonate Moisture data', err);
        setReadings(DEFAULT_READINGS);
        setOriginalReadings(null);
        setEditedFields({});
      }
    };
    fetchExistingData();
    return () => { active = false; };
  }, [date]);

  const handleCellChange = useCallback((id, field, value) => {
    if (isViewOnly) return;
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, [isViewOnly]);

  const handleReset = () => {
    if (isViewOnly) return;
    if (originalReadings && Array.isArray(originalReadings)) {
      setReadings(JSON.parse(JSON.stringify(originalReadings)));
      showToast?.('Restored readings to last persisted state.', 'info');
    } else {
      setReadings(DEFAULT_READINGS);
      showToast?.('Values reset to defaults.', 'info');
    }
    setErrors({});
  };

  const getModifiedSlots = useCallback(() => {
    const origList = originalReadings || DEFAULT_READINGS;
    const changed = [];
    ['shift1', 'shift2', 'shift3', 'addl', 'sample'].forEach((sk) => {
      const curR = readings.find((r) => getSlotKey(r) === sk) || {};
      const origR = origList.find((r) => getSlotKey(r) === sk) || {};
      const hasDiff = NUMERIC_FIELDS.some((f) => {
        const cv = curR[f] === undefined || curR[f] === null ? '' : String(curR[f]).trim();
        const ov = origR[f] === undefined || origR[f] === null ? '' : String(origR[f]).trim();
        return cv !== ov;
      });
      if (hasDiff) changed.push(sk);
    });
    return changed;
  }, [readings, originalReadings, getSlotKey]);

  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    readings.forEach((r) => {
      NUMERIC_FIELDS.forEach((f) => {
        if (r[f] !== '' && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const modified = getModifiedSlots();
    if (modified.length === 0) {
      showToast?.('No changes', 'info');
      return;
    }

    if (modified.length > 1) {
      showToast?.('Only one shift or slot can be entered and saved at a time.', 'warning');
      return;
    }

    const targetSlot = modified[0];
    const targetReading = readings.find((r) => getSlotKey(r) === targetSlot);
    const hasAnyValue = NUMERIC_FIELDS.some((f) => targetReading && targetReading[f] !== '' && targetReading[f] !== null && targetReading[f] !== undefined);

    if (!hasAnyValue && !lockedSlots[targetSlot]?.isSaved) {
      showToast?.('Cannot save an empty slot. At least one measurement is required.', 'warning');
      return;
    }

    setConfirmData({
      date,
      targetSlot,
      reading: targetReading,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        plant: 'SA',
        unit: 'Bicarbonate Moisture',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/bicarbonate-moisture', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save Bicarbonate Moisture Analysis.', 'error');
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
      setLockedShifts(returnedDoc.lockedShifts || res.data?.lockedShifts || {});
      setLockedSlots(returnedDoc.lockedSlots || res.data?.lockedSlots || {});
      if (newRecordId) setRecordId(newRecordId);

      setSavePhase('completed');
      setEmailStatusDetail('Saved ✓ (Email disabled for this plant)');
      showToast?.('Saved ✓', 'success');
    } catch (err) {
      console.error('Error saving Bicarbonate Moisture data:', err);
      const msg = err?.response?.data?.message || 'Failed to save Bicarbonate Moisture Analysis data.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  const averages = useMemo(() => {
    const res = {};
    NUMERIC_FIELDS.forEach((f) => {
      const nums = readings
        .map((r) => r[f])
        .filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
        .map(Number);
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        res[f] = (sum / nums.length).toFixed(2);
      } else {
        res[f] = '—';
      }
    });
    return res;
  }, [readings]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* TOP HEADER BAR */}
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
              <span className="text-xs font-semibold text-slate-500">
                SA Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Soda Ash Production
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200/60">
                Bicarbonate Moisture
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Frequency: Once in 4 Hours
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Droplets className="w-5 h-5 text-cyan-600" />
              BICARBONATE MOISTURE ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
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
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly && (
            <StatusSaveButton
              id="btn-bicarbonate-moisture-save"
              saving={saving}
              savePhase={savePhase}
              saveSuccess={savePhase === 'completed'}
              onClick={handleSaveClick}
              alwaysShowSaveText
              defaultLabel="Save / Submit"
              title="Save Bicarbonate Moisture data"
            />
          )}
        </div>
      </div>

      <SaveStatusBanner
        id="bicarb-moisture-status-banner"
        saveSuccess={savePhase === 'completed'}
        savePhase={savePhase}
        date={date}
        analysisName="Bicarbonate Moisture Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onDismiss={() => setSavePhase('idle')}
        saving={saving}
      />

      {/* MAIN ANALYSIS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table top title banner with LockedDateDisplay */}
        <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Bicarbonate Moisture Readings
              </span>
              <span className="text-[11px] font-bold text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
                Once in 4 Hours
              </span>
            </div>

            <LockedDateDisplay
              date={date}
              id="bicarbonate-moisture-date-display"
              badgeText="Operating Day"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-10 text-center border-r border-b border-slate-800"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-4 w-48 border-r border-b border-slate-800"
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Shift / Sample</span>
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-28 border-r border-b border-slate-800 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Time</span>
                  </div>
                </th>
                <th
                  colSpan={3}
                  className="py-2 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-cyan-300 font-extrabold"
                >
                  <div className="text-xs font-black tracking-wide">M 404 (Moisture %)</div>
                  <div className="text-[10px] text-cyan-200 font-medium normal-case tracking-normal">
                    Limit: 18% – 22% (Target: 20% ±2.0%)
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-center border-r border-b border-slate-800 w-32"
                >
                  <span className="text-cyan-200">M 405 OUTLET</span>
                </th>
                <th
                  colSpan={2}
                  className="py-2 px-3 text-center border-b border-slate-800 bg-slate-800/90 text-cyan-300 font-extrabold"
                >
                  SB TURBIDITY
                </th>
              </tr>
              <tr className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider text-center">
                <th className="py-2 px-2 border-r border-slate-700 min-w-[96px] text-center">
                  <div className="font-extrabold text-cyan-200">A</div>
                  <div className="text-[9px] text-slate-300 font-medium normal-case">18% – 22%</div>
                </th>
                <th className="py-2 px-2 border-r border-slate-700 min-w-[96px] text-center">
                  <div className="font-extrabold text-cyan-200">B</div>
                  <div className="text-[9px] text-slate-300 font-medium normal-case">18% – 22%</div>
                </th>
                <th className="py-2 px-2 border-r border-slate-700 min-w-[96px] text-center">
                  <div className="font-extrabold text-cyan-200">C</div>
                  <div className="text-[9px] text-slate-300 font-medium normal-case">18% – 22%</div>
                </th>
                <th className="py-2 px-3 border-r border-slate-700 w-24">TURB 1</th>
                <th className="py-2 px-3 border-slate-700 w-24">TURB 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((reading, index) => {
                const slotKey = getSlotKey(reading);
                const slotStatus = getSlotStatus(slotKey);
                const disabled = isSlotDisabled(slotKey);
                const rowKey = reading.id || `shift_${reading.shift}`;
                const rowEdits = editedFields[rowKey] || {};

                return (
                  <tr
                    key={reading.id || index}
                    className={`transition-colors group ${disabled ? 'bg-slate-50/60' : 'hover:bg-cyan-50/20'}`}
                  >
                    <td className="py-2 px-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    <td className="py-2 px-3 border-r border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-black text-slate-800 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-300">
                          {reading.shift}
                        </span>
                        <RecordStatusBadge status={slotStatus} />
                      </div>
                    </td>

                    <td className="py-2 px-3 border-r border-slate-100 text-center">
                      <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                        {reading.time}
                      </span>
                    </td>

                    {/* M 404 Option A */}
                    <td className="py-2 px-2 border-r border-slate-100 text-center relative">
                      <input
                        type="text"
                        value={reading.m404_a ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(reading.id, 'm404_a', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center px-2 py-1 rounded border text-xs transition ${
                          errors[`${reading.id}_m404_a`] ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white text-slate-800'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rowEdits.m404_a && (
                        <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs" title="Field edited">
                          E
                        </span>
                      )}
                    </td>

                    {/* M 404 Option B */}
                    <td className="py-2 px-2 border-r border-slate-100 text-center relative">
                      <input
                        type="text"
                        value={reading.m404_b ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(reading.id, 'm404_b', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center px-2 py-1 rounded border text-xs transition ${
                          errors[`${reading.id}_m404_b`] ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white text-slate-800'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rowEdits.m404_b && (
                        <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs" title="Field edited">
                          E
                        </span>
                      )}
                    </td>

                    {/* M 404 Option C */}
                    <td className="py-2 px-2 border-r border-slate-100 text-center relative">
                      <input
                        type="text"
                        value={reading.m404_c ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(reading.id, 'm404_c', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center px-2 py-1 rounded border text-xs transition ${
                          errors[`${reading.id}_m404_c`] ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white text-slate-800'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rowEdits.m404_c && (
                        <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs" title="Field edited">
                          E
                        </span>
                      )}
                    </td>

                    {/* M 405 Outlet */}
                    <td className="py-2 px-2 border-r border-slate-100 text-center relative">
                      <input
                        type="text"
                        value={reading.m405_outlet ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(reading.id, 'm405_outlet', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center px-2 py-1 rounded border text-xs transition ${
                          errors[`${reading.id}_m405_outlet`] ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white text-slate-800'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rowEdits.m405_outlet && (
                        <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs" title="Field edited">
                          E
                        </span>
                      )}
                    </td>

                    {/* SB Turbidity 1 */}
                    <td className="py-2 px-2 border-r border-slate-100 text-center relative">
                      <input
                        type="text"
                        value={reading.sb_turb1 ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(reading.id, 'sb_turb1', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center px-2 py-1 rounded border text-xs transition ${
                          errors[`${reading.id}_sb_turb1`] ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white text-slate-800'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rowEdits.sb_turb1 && (
                        <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs" title="Field edited">
                          E
                        </span>
                      )}
                    </td>

                    {/* SB Turbidity 2 */}
                    <td className="py-2 px-2 text-center relative">
                      <input
                        type="text"
                        value={reading.sb_turb2 ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(reading.id, 'sb_turb2', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center px-2 py-1 rounded border text-xs transition ${
                          errors[`${reading.id}_sb_turb2`] ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white text-slate-800'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rowEdits.sb_turb2 && (
                        <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs" title="Field edited">
                          E
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Averages Row */}
            <tfoot>
              <tr className="bg-slate-100/80 font-bold text-slate-800 text-xs border-t-2 border-slate-300">
                <td colSpan={3} className="py-2.5 px-4 text-right border-r border-slate-200 font-extrabold uppercase">
                  <div className="flex items-center justify-end gap-1.5 text-cyan-900">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Average:</span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono text-cyan-900 font-black">
                  {averages.m404_a}
                </td>
                <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono text-cyan-900 font-black">
                  {averages.m404_b}
                </td>
                <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono text-cyan-900 font-black">
                  {averages.m404_c}
                </td>
                <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono text-cyan-900 font-black">
                  {averages.m405_outlet}
                </td>
                <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono text-cyan-900 font-black">
                  {averages.sb_turb1}
                </td>
                <td className="py-2.5 px-2 text-center font-mono text-cyan-900 font-black">
                  {averages.sb_turb2}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Table Footer with Lock Rules Note */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Notice:</span>
            <span>One correction allowed after first save; saving the next slot locks the previous one. Additional Sample and Sample are independent.</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Total Slots: {readings.length}
          </span>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scaleUp">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-4 h-4 text-cyan-400" />
                <span>Confirm Analysis Submission</span>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to save data for <strong>{confirmData.reading?.shift}</strong>. Saving this slot allows exactly one correction until the subsequent slot is saved.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={saving}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Confirm & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BicarbonateMoistureAnalysisPage;
