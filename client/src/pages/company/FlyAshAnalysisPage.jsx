import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  getTodayAsiaKolkata,
  formatDateDisplay,
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
  Flame,
} from 'lucide-react';

// Default initial readings matching the laboratory shifts (07:00, 15:00, 23:00)
const DEFAULT_READINGS = [
  { id: '1', time: '07:00', combustible: '1.2', gcv: '94' },
  { id: '2', time: '15:00', combustible: '', gcv: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '' },
];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const FlyAshAnalysisPage = ({ plantId = 'offset' }) => {
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
  const [savePhase, setSavePhase] = useState('idle'); // 'idle' | 'saving' | 'completed'  | 'email_failed'
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
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 2) return true;
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
        const response = await api.get(`/fly-ash-analysis?date=${date}`);
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
        console.warn('Could not fetch existing Fly Ash data', err);
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
      { id: nextId, time: nextTime, combustible: '', gcv: '' },
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
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Summary statistics (Averages) ──
  const stats = useMemo(() => {
    let combTotal = 0;
    let combCount = 0;
    let gcvTotal = 0;
    let gcvCount = 0;

    readings.forEach((r) => {
      if (r.combustible !== '' && !isNaN(Number(r.combustible))) {
        combTotal += Number(r.combustible);
        combCount += 1;
      }
      if (r.gcv !== '' && !isNaN(Number(r.gcv))) {
        gcvTotal += Number(r.gcv);
        gcvCount += 1;
      }
    });

    return {
      combAvg: combCount > 0 ? (combTotal / combCount).toFixed(2) : null,
      gcvAvg: gcvCount > 0 ? (gcvTotal / gcvCount).toFixed(1) : null,
      count: combCount || gcvCount,
    };
  }, [readings]);

  // ── Save flow with confirmation modal ──
  const initiateSave = () => {
    const newErrors = {};

    readings.forEach((r) => {
      if (r.combustible !== '' && isNaN(Number(r.combustible))) {
        newErrors[`${r.id}_combustible`] = 'Invalid number';
      }
      if (r.gcv !== '' && isNaN(Number(r.gcv))) {
        newErrors[`${r.id}_gcv`] = 'Invalid number';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const payload = {
      date,
      plant: 'OFFSET',
      unit: 'FLY ash',
      readings,
      submittedBy: user?.name || 'Shift Chemist',
    };

    setConfirmData(payload);
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (!confirmData) return;
    setSaving(true);
    setSavePhase('saving');

    try {
      const res = await api.post('/fly-ash-analysis', confirmData);

      if (res.data?.success) {
        setSaveSuccess(true);
        const record = res.data.data;
        if (record?._id || record?.id) {
          setRecordId(record._id || record.id);
        }
        if (record?.lockedShifts) {
          setLockedShifts(record.lockedShifts);
        }
        if (record?.editedFields) {
          setEditedFields(record.editedFields);
        }

        const emailSuccess = res.data.emailSent || res.data.emailStatus === 'sent';
        const operatorEmail = res.data.emailRecipient || res.data.assignedOperatorEmail || recipientEmail;
        if (operatorEmail) setRecipientEmail(operatorEmail);

        if (emailSuccess) {
          setSavePhase('completed');
          showToast?.(`Fly Ash Analysis saved & notification sent to ${operatorEmail || 'operator'}!`, 'success');
        } else if (res.data.emailStatus === 'failed') {
          setSavePhase('email_failed');
          setEmailStatusDetail(res.data.emailError || 'SMTP Delivery Failed');
          showToast?.('Fly Ash Analysis saved to MongoDB. Email dispatch failed.', 'warning');
        } else {
          setSavePhase('idle');
          showToast?.('Fly Ash Analysis saved to MongoDB. Email dispatch pending.', 'info');
        }
      } else {
        showToast?.(res.data?.message || 'Error saving Fly Ash data.', 'error');
        setSavePhase('idle');
      }
    } catch (err) {
      console.error('API save error:', err);
      const errMsg = err.response?.data?.message || 'Failed to save Fly Ash Analysis to database.';
      showToast?.(errMsg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
      setShowConfirmModal(false);
    }
  };

  const handleRetryEmail = () => {
    retryAnalysisEmail({
      endpoint: '/fly-ash-analysis',
      recordId,
      setSavePhase,
      setEmailStatusDetail,
      showToast,
      setSaving,
    });
  };

  const summaryItems = useMemo(() => {
    return [
      { label: 'Time Slots Recorded', value: readings.length },
      { label: 'Avg Combustible', value: stats.combAvg ? `${stats.combAvg} %` : '—' },
      { label: 'Avg GCV', value: stats.gcvAvg ? `${stats.gcvAvg} Kcals/kg` : '—' },
    ];
  }, [readings, stats]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── SAVE STATUS BANNER ── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Fly Ash Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── TOP HEADER BAR (TK 203 Clean Theme) ── */}
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
                FLY Ash
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Flame className="w-5 h-5 text-amber-600" />
              FLY ASH ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          <LockedDateDisplay date={date} id="flyash-locked-date" />

          {!isViewOnly && (
            <button
              onClick={handleReset}
              disabled={saving}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly ? (
            <StatusSaveButton
              id="btn-flyash-save"
              saving={saving}
              isLocked={Boolean(lockedShifts.shift1Locked && lockedShifts.shift2Locked && lockedShifts.shift3Locked)}
              savePhase={savePhase}
              onClick={initiateSave}
              title="Save Fly Ash Analysis"
            />
          ) : (
            <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Read-Only
            </span>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: Fly Ash Hourly / Shift Measurements Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Fly Ash Hourly / Shift Measurements
              </h2>
            </div>
          </div>

          {!isViewOnly && (
            <button
              onClick={handleAddRow}
              className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Time Slot
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-4 w-12 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-4 w-36 text-center border-r border-slate-700">
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
                <th className="py-3 px-4 text-center border-r border-slate-700">STATUS</th>
                {!isViewOnly && (
                  <th className="py-3 px-3 w-16 text-center">ACTION</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readings.map((row, idx) => {
                const combErr = errors[`${row.id}_combustible`];
                const gcvErr = errors[`${row.id}_gcv`];
                const combLimit = getCellLimit('offset', 'fly-ash', 'day', 'combustible');
                const combValid = combLimit && row.combustible !== '' ? validateCellValue(row.combustible, combLimit) : { isOutOfLimit: false };

                const gcvLimit = getCellLimit('offset', 'fly-ash', 'day', 'gcv');
                const gcvValid = gcvLimit && row.gcv !== '' ? validateCellValue(row.gcv, gcvLimit) : { isOutOfLimit: false };

                const disabled = isRowDisabled(row, idx);

                // Field-level edit detection
                const isCombEdited = Boolean(
                  editedFields[`${row.id}_combustible`] ||
                  editedFields[`${row.time}_combustible`] ||
                  (idx === 0 && editedFields['1_combustible']) ||
                  (idx === 1 && editedFields['2_combustible']) ||
                  (idx === 2 && editedFields['3_combustible'])
                );

                const isGcvEdited = Boolean(
                  editedFields[`${row.id}_gcv`] ||
                  editedFields[`${row.time}_gcv`] ||
                  (idx === 0 && editedFields['1_gcv']) ||
                  (idx === 1 && editedFields['2_gcv']) ||
                  (idx === 2 && editedFields['3_gcv'])
                );

                // Shift Status Badge
                let shiftBadge = null;
                const time = String(row.time || '');
                if (idx === 0 || time === '07:00') {
                  if (lockedShifts.shift1Locked || lockedShifts.shift2Saved) {
                    shiftBadge = <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
                  } else if (lockedShifts.shift1Saved) {
                    shiftBadge = <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
                  } else {
                    shiftBadge = <RecordStatusBadge status="NEW" subLabel="first entry" />;
                  }
                } else if (idx === 1 || time === '15:00') {
                  if (!lockedShifts.shift1Saved) {
                    shiftBadge = <RecordStatusBadge status="WAITING" subLabel="pending shift 1" />;
                  } else if (lockedShifts.shift2Locked || lockedShifts.shift3Saved) {
                    shiftBadge = <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
                  } else if (lockedShifts.shift2Saved) {
                    shiftBadge = <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
                  } else {
                    shiftBadge = <RecordStatusBadge status="NEW" subLabel="first entry" />;
                  }
                } else if (idx === 2 || time === '23:00') {
                  if (!lockedShifts.shift2Saved) {
                    shiftBadge = <RecordStatusBadge status="WAITING" subLabel="pending shift 2" />;
                  } else if (lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) {
                    shiftBadge = <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
                  } else if (lockedShifts.shift3Saved) {
                    shiftBadge = <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
                  } else {
                    shiftBadge = <RecordStatusBadge status="NEW" subLabel="first entry" />;
                  }
                }

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors group ${disabled ? 'bg-slate-50/60' : 'hover:bg-amber-50/30'}`}
                  >
                    {/* Row Index */}
                    <td className="py-3.5 px-4 text-center font-bold text-xs text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* TIME */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100">
                      <input
                        type="text"
                        value={row.time}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className={`w-full text-center font-mono font-bold text-sm rounded-lg py-1.5 px-2 transition shadow-2xs ${
                          disabled
                            ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                            : 'bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
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
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
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
                      <EditedBadge isEdited={isCombEdited} />
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
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
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
                      <EditedBadge isEdited={isGcvEdited} />
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

                    {/* STATUS */}
                    <td className="py-3.5 px-4 text-center border-r border-slate-100">
                      {shiftBadge || <span className="text-xs text-slate-400">—</span>}
                    </td>

                    {/* ACTION: Delete */}
                    {!isViewOnly && (
                      <td className="py-3.5 px-2 text-center">
                        <button
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={readings.length <= 1 || disabled}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer with quick action and summary info */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {!isViewOnly && (
              <button
                onClick={handleAddRow}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                Add Another Time Reading
              </button>
            )}
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
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="Fly Ash Analysis"
        date={date}
        shiftOrTime={readings.length ? `${readings.length} Slots` : 'Daily'}
        summaryItems={summaryItems}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default FlyAshAnalysisPage;
