import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  getTodayAsiaKolkata,
  formatDateDisplay,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  EditedBadge,
  retryAnalysisEmail,
} from '../../utils/offsetAnalysisHelper';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Layers,
  Lock,
} from 'lucide-react';

// Default initial readings matching the laboratory shifts (07:00, 15:00, 23:00)
const DEFAULT_READINGS = [
  { id: '1', time: '07:00', combustible: '1.0', gcv: '78', moisture: '23.7' },
  { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const BottomAshAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => getTodayAsiaKolkata());
  const [readings, setReadings] = useState(DEFAULT_READINGS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle'); // 'idle' | 'saving' | 'completed'  | 'email_failed' | 'save_failed'
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [lockedShifts, setLockedShifts] = useState({
    shift1Saved: false,
    shift2Saved: false,
    shift3Saved: false,
    shift1Locked: false,
    shift2Locked: false,
    shift3Locked: false,
    shift3Edits: 0,
  });
  const [editedFields, setEditedFields] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Sequential shift permissions
  const isRowDisabled = useCallback((row, idx) => {
    if (isViewOnly) return true;
    const time = String(row.time || '');
    if (idx === 0 || time === '07:00') {
      return Boolean(lockedShifts.shift1Locked || lockedShifts.shift2Saved);
    }
    if (idx === 1 || time === '15:00') {
      if (!lockedShifts.shift1Saved) return true; // Waiting for Shift 1
      return Boolean(lockedShifts.shift2Locked || lockedShifts.shift3Saved);
    }
    if (idx === 2 || time === '23:00') {
      if (!lockedShifts.shift2Saved) return true; // Waiting for Shift 2
      if (lockedShifts.shift3Locked) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return false;
  }, [isViewOnly, lockedShifts]);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/bottom-ash-analysis?date=${date}`);
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
          if (record?.lockedShifts) {
            setLockedShifts(record.lockedShifts);
          }
          if (record?.editedFields) {
            setEditedFields(record.editedFields);
          } else {
            setEditedFields({});
          }
          
          if (!record) {
             // Leave default
          } else if (record.shifts) {
            setReadings(record.shifts);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setReadings(record.readings);
          } else if (record.data && Array.isArray(record.data) && record.data.length > 0) {
            setReadings(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setReadings(record);
          }
        } else {
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing Bottom Ash data', err);
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Handle reading change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Clear error for this field
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Add new time slot reading ──
  const handleAddRow = () => {
    const nextId = String(Date.now());
    const nextTime = readings.length === 0 ? '07:00' : '11:00';
    setReadings((prev) => [
      ...prev,
      { id: nextId, time: nextTime, combustible: '', gcv: '', moisture: '' },
    ]);
  };

  // ── Remove time slot reading ──
  const handleRemoveRow = (id) => {
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Reset ──
  const handleReset = () => {
    setReadings(DEFAULT_READINGS);
    setDate(getTodayAsiaKolkata());
    setErrors({});
    setSaveSuccess(false);
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Summary statistics (Averages) ──
  const stats = useMemo(() => {
    let combTotal = 0;
    let combCount = 0;
    let gcvTotal = 0;
    let gcvCount = 0;
    let moistTotal = 0;
    let moistCount = 0;

    readings.forEach((r) => {
      if (r.combustible !== '' && !isNaN(Number(r.combustible))) {
        combTotal += Number(r.combustible);
        combCount += 1;
      }
      if (r.gcv !== '' && !isNaN(Number(r.gcv))) {
        gcvTotal += Number(r.gcv);
        gcvCount += 1;
      }
      if (r.moisture !== '' && !isNaN(Number(r.moisture))) {
        moistTotal += Number(r.moisture);
        moistCount += 1;
      }
    });

    return {
      combAvg: combCount > 0 ? (combTotal / combCount).toFixed(2) : null,
      gcvAvg: gcvCount > 0 ? (gcvTotal / gcvCount).toFixed(1) : null,
      moistAvg: moistCount > 0 ? (moistTotal / moistCount).toFixed(2) : null,
      count: combCount || gcvCount || moistCount,
    };
  }, [readings]);

  // ── Save Click (Opens Confirmation Modal) ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    readings.forEach((r) => {
      if (r.combustible !== '' && isNaN(Number(r.combustible))) {
        newErrors[`${r.id}_combustible`] = 'Invalid number';
      }
      if (r.gcv !== '' && isNaN(Number(r.gcv))) {
        newErrors[`${r.id}_gcv`] = 'Invalid number';
      }
      if (r.moisture !== '' && isNaN(Number(r.moisture))) {
        newErrors[`${r.id}_moisture`] = 'Invalid number';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const summaryItems = [];
    readings.forEach((r, idx) => {
      if (!isRowDisabled(r, idx)) {
        if (r.combustible) summaryItems.push({ label: `${r.time} Combustible`, value: `${r.combustible}%` });
        if (r.gcv) summaryItems.push({ label: `${r.time} GCV`, value: `${r.gcv} kcal` });
        if (r.moisture) summaryItems.push({ label: `${r.time} Moisture`, value: `${r.moisture}%` });
      }
    });

    if (summaryItems.length === 0) {
      showToast?.('No permitted active shift entries found to save.', 'warning');
      return;
    }

    setConfirmData({
      shiftOrTime: readings.filter((r, idx) => !isRowDisabled(r, idx)).map((r) => r.time).join(', '),
      summaryItems,
    });
    setShowConfirmModal(true);
  };

  // ── Confirm Save (Submits to Backend) ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        plant: 'OFFSET',
        unit: 'Bottom ash',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/bottom-ash-analysis', payload);
      setSaveSuccess(true);
      const savedDoc = res.data?.data;
      if (savedDoc && (savedDoc._id || savedDoc.id)) {
        setRecordId(savedDoc._id || savedDoc.id);
      }
      if (savedDoc?.lockedShifts) {
        setLockedShifts(savedDoc.lockedShifts);
      }
      if (savedDoc?.editedFields) {
        setEditedFields(savedDoc.editedFields);
      }
      if (res.data?.emailRecipient) {
        setRecipientEmail(res.data.emailRecipient);
      }

      const emailStatus = res.data?.emailStatus;
      if (emailStatus === 'sent' || res.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Delivered to SMTP server ✓');
        showToast?.('Saved & Emailed Successfully ✓', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(res.data?.emailError || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (res.data?.emailError || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('save_failed');
      console.error('[BottomAshAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryEmail = () => {
    retryAnalysisEmail({
      endpoint: '/api/bottom-ash-analysis',
      recordId,
      setSavePhase,
      setEmailStatusDetail,
      showToast,
      setSaving,
    });
  };

  const getShiftBadge = (row, idx) => {
    const time = String(row.time || '');
    if (idx === 0 || time === '07:00') {
      if (lockedShifts.shift1Locked || lockedShifts.shift2Saved) {
        return <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
      }
      if (lockedShifts.shift1Saved) {
        return <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
      }
      return <RecordStatusBadge status="NEW" subLabel="first entry" />;
    }
    if (idx === 1 || time === '15:00') {
      if (!lockedShifts.shift1Saved) {
        return <RecordStatusBadge status="WAITING" subLabel="pending shift 1" />;
      }
      if (lockedShifts.shift2Locked || lockedShifts.shift3Saved) {
        return <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
      }
      if (lockedShifts.shift2Saved) {
        return <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
      }
      return <RecordStatusBadge status="NEW" subLabel="first entry" />;
    }
    if (idx === 2 || time === '23:00') {
      if (!lockedShifts.shift2Saved) {
        return <RecordStatusBadge status="WAITING" subLabel="pending shift 2" />;
      }
      if (lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) {
        return <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
      }
      if (lockedShifts.shift3Saved) {
        return <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
      }
      return <RecordStatusBadge status="NEW" subLabel="first entry" />;
    }
    return null;
  };

  return (
    <div className="space-y-5 animate-fadeIn">
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
              <span className="text-xs font-semibold text-slate-500">
                OFFSET Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Utilities & Facilities
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                Bottom Ash
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Layers className="w-5 h-5 text-amber-700" />
              BOTTOM ASH ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          <LockedDateDisplay date={date} id="bottomash-locked-date" />

          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>

          {!isViewOnly ? (
            <StatusSaveButton
              id="btn-bottomash-save"
              saving={saving}
              isLocked={Boolean(lockedShifts.shift1Locked && lockedShifts.shift2Locked && lockedShifts.shift3Locked)}
              savePhase={savePhase}
              onClick={handleSaveClick}
              title="Save Bottom Ash analysis"
            />
          ) : (
            <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Read-Only
            </span>
          )}
        </div>
      </div>

      {/* ── Status Banner (Success, Pending, or Email Failed) ── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Bottom Ash Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => setSaveSuccess(false)}
        saving={saving}
      />

      {/* ── MAIN CONTENT: Bottom Ash Hourly / Shift Measurements Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Bottom Ash (3-Shift Sequential Workflow)
              </h2>
            </div>
          </div>

          <button
            onClick={handleAddRow}
            className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Time Slot
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-4 w-12 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-4 w-44 text-center border-r border-slate-700">
                  <span className="flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME / SHIFT
                  </span>
                </th>
                <th className="py-3 px-5 text-center border-r border-slate-700">
                  <div>COMBUSTIBLE</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">%</div>
                </th>
                <th className="py-3 px-5 text-center border-r border-slate-700">
                  <div>GCV</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">Kcals / kg</div>
                </th>
                <th className="py-3 px-5 text-center border-r border-slate-700">
                  <div>MOISTURE</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">%</div>
                </th>
                <th className="py-3 px-3 w-16 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readings.map((row, idx) => {
                const disabled = isRowDisabled(row, idx);
                const combErr = errors[`${row.id}_combustible`];
                const gcvErr = errors[`${row.id}_gcv`];
                const moistErr = errors[`${row.id}_moisture`];
                const combLimit = getCellLimit('offset', 'bottom-ash', 'day', 'combustible');
                const combValid = combLimit && row.combustible !== '' ? validateCellValue(row.combustible, combLimit) : { isOutOfLimit: false };

                const gcvLimit = getCellLimit('offset', 'bottom-ash', 'day', 'gcv');
                const gcvValid = gcvLimit && row.gcv !== '' ? validateCellValue(row.gcv, gcvLimit) : { isOutOfLimit: false };

                const moistLimit = getCellLimit('offset', 'bottom-ash', 'day', 'moisture');
                const moistValid = moistLimit && row.moisture !== '' ? validateCellValue(row.moisture, moistLimit) : { isOutOfLimit: false };

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-amber-50/30 transition-colors group ${disabled ? 'opacity-85' : ''}`}
                  >
                    {/* Row Index */}
                    <td className="py-3.5 px-4 text-center font-bold text-xs text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* TIME / SHIFT */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="text"
                          value={row.time}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                          placeholder="HH:mm"
                          className="w-full text-center font-mono font-bold text-sm bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition shadow-2xs disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        {getShiftBadge(row, idx)}
                      </div>
                    </td>

                    {/* COMBUSTIBLE % */}
                    <td className="py-3.5 px-4 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.combustible}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'combustible', e.target.value)}
                          placeholder="0.00"
                          className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                            disabled
                              ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                              : combErr || combValid.isOutOfLimit
                              ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                              : row.combustible !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 pointer-events-none">
                          %
                        </span>
                      </div>
                      <EditedBadge isEdited={editedFields[`${row.id}_combustible`] || editedFields[`${row.time}_combustible`]} />
                      {combErr && (
                        <div className="text-[10px] text-red-600 font-semibold mt-1">
                          {combErr}
                        </div>
                      )}
                      {combValid.isOutOfLimit && !combErr && combLimit && (
                        <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {combLimit.formattedLabel || `Limit: ${combLimit.min}-${combLimit.max}`}
                        </div>
                      )}
                      {!combValid.isOutOfLimit && !combErr && combLimit && row.combustible === '' && (
                        <div className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {combLimit.formattedRange || `${combLimit.min}-${combLimit.max}`}
                        </div>
                      )}
                    </td>

                    {/* GCV Kcals/kg */}
                    <td className="py-3.5 px-4 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.gcv}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'gcv', e.target.value)}
                          placeholder="0000"
                          className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                            disabled
                              ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                              : gcvErr || gcvValid.isOutOfLimit
                              ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                              : row.gcv !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-amber-600 focus:bg-white focus:ring-2 focus:ring-amber-100'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">
                          kcal
                        </span>
                      </div>
                      <EditedBadge isEdited={editedFields[`${row.id}_gcv`] || editedFields[`${row.time}_gcv`]} />
                      {gcvErr && (
                        <div className="text-[10px] text-red-600 font-semibold mt-1">
                          {gcvErr}
                        </div>
                      )}
                      {gcvValid.isOutOfLimit && !gcvErr && gcvLimit && (
                        <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {gcvLimit.formattedLabel || `Limit: ${gcvLimit.min}-${gcvLimit.max}`}
                        </div>
                      )}
                      {!gcvValid.isOutOfLimit && !gcvErr && gcvLimit && row.gcv === '' && (
                        <div className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {gcvLimit.formattedRange || `${gcvLimit.min}-${gcvLimit.max}`}
                        </div>
                      )}
                    </td>

                    {/* MOISTURE % */}
                    <td className="py-3.5 px-4 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.moisture}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, 'moisture', e.target.value)}
                          placeholder="0.00"
                          className={`w-full text-center font-mono text-sm py-1.5 px-3 rounded-lg border-2 transition shadow-2xs ${
                            disabled
                              ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                              : moistErr || moistValid.isOutOfLimit
                              ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-200'
                              : row.moisture !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 pointer-events-none">
                          %
                        </span>
                      </div>
                      <EditedBadge isEdited={editedFields[`${row.id}_moisture`] || editedFields[`${row.time}_moisture`]} />
                      {moistErr && (
                        <div className="text-[10px] text-red-600 font-semibold mt-1">
                          {moistErr}
                        </div>
                      )}
                      {moistValid.isOutOfLimit && !moistErr && moistLimit && (
                        <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {moistLimit.formattedLabel || `Limit: ${moistLimit.min}-${moistLimit.max}`}
                        </div>
                      )}
                      {!moistValid.isOutOfLimit && !moistErr && moistLimit && row.moisture === '' && (
                        <div className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {moistLimit.formattedRange || `${moistLimit.min}-${moistLimit.max}`}
                        </div>
                      )}
                    </td>

                    {/* ACTION: Delete */}
                    <td className="py-3.5 px-2 text-center">
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={readings.length <= 1}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer with quick action and summary info */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddRow}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              Add Another Time Reading
            </button>
            <span className="text-slate-500 font-medium">
              {readings.length} {readings.length === 1 ? 'slot' : 'slots'} recorded
            </span>
          </div>

          <div className="flex items-center gap-4">
            {stats.combAvg && (
              <span className="font-bold text-slate-700">
                Avg Combustible:{' '}
                <span className="text-blue-700 font-mono">{stats.combAvg}%</span>
              </span>
            )}
            {stats.gcvAvg && (
              <span className="font-bold text-slate-700">
                Avg GCV:{' '}
                <span className="text-amber-700 font-mono">{stats.gcvAvg} Kcals/kg</span>
              </span>
            )}
            {stats.moistAvg && (
              <span className="font-bold text-slate-700">
                Avg Moisture:{' '}
                <span className="text-emerald-700 font-mono">{stats.moistAvg}%</span>
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
        analysisName="Bottom Ash Analysis"
        date={date}
        shiftOrTime={confirmData?.shiftOrTime}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default BottomAshAnalysisPage;
