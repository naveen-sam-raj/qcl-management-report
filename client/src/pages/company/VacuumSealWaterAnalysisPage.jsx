import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  getTodayAsiaKolkata,
  formatDateDisplay,
  SaveStatusBanner,
  SaveConfirmationModal,
  EditedBadge,
  retryAnalysisEmail,
  LockedDateDisplay,
  StatusSaveButton,
  RecordStatusBadge,
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
  Gauge,
  Lock,
} from 'lucide-react';

// Default initial readings with empty measurement fields
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
  shift3Edits: 0,
};

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const VacuumSealWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => getTodayAsiaKolkata());
  const [readings, setReadings] = useState(() => DEFAULT_READINGS.map((r) => ({ ...r })));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle'); // 'idle' | 'saving' | 'completed'  | 'email_failed'
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [lockedShifts, setLockedShifts] = useState(DEFAULT_LOCKS);
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
        const response = await api.get(`/vacuum-seal-water?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        const effectiveEmailStatus = response.data?.emailStatus || (Array.isArray(response.data?.data) ? response.data?.data[0]?.emailStatus : null);
        if (effectiveEmailStatus) {
          if (effectiveEmailStatus === 'sent') setSavePhase('completed');
          else if (effectiveEmailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('idle');
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          const rId = response.data?.recordId || (record && (record._id || record.id));
          if (rId) {
            setRecordId(rId);
          }
          if (record?.lockedShifts || record?.data?.lockedShifts) {
            setLockedShifts(record.lockedShifts || record.data.lockedShifts);
          }
          if (record?.editedFields || record?.data?.editedFields) {
            setEditedFields(record.editedFields || record.data.editedFields);
          } else {
            setEditedFields({});
          }

          if (!record) {
            setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          } else if (record.shifts) {
            setReadings(record.shifts);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setReadings(record.readings);
          } else if (record.data && Array.isArray(record.data) && record.data.length > 0) {
            setReadings(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setReadings(record);
          } else {
            setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          }
        } else {
          setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          setLockedShifts(DEFAULT_LOCKS);
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing Vacuum Seal Water data', err);
        setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
        setLockedShifts(DEFAULT_LOCKS);
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Handle reading cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && field !== 'ca' && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Add new reading row ──
  const handleAddRow = () => {
    const nextId = String(Date.now());
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        time: '11:00',
        fnh3: '',
        cnh3: '',
        ca: 'Nil',
      },
    ]);
  };

  // ── Remove reading row ──
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

  // ── Save flow with confirmation modal ──
  const initiateSave = () => {
    const newErrors = {};

    readings.forEach((r) => {
      ['fnh3', 'cnh3'].forEach((f) => {
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

    const payload = {
      date,
      plant: 'OFFSET',
      unit: 'Vaccum seal water',
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
      const res = await api.post('/vacuum-seal-water', confirmData);

      if (res.data?.success) {
        setSaveSuccess(true);
        const record = res.data.data;
        const recId = res.data?.recordId || (record && (record._id || record.id));
        if (recId) {
          setRecordId(recId);
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
          showToast?.(`Vacuum Seal Water Analysis saved & notification sent to ${operatorEmail || 'operator'}!`, 'success');
        } else if (res.data.emailStatus === 'failed') {
          setSavePhase('email_failed');
          setEmailStatusDetail(res.data.emailError || 'SMTP Delivery Failed');
          showToast?.('Vacuum Seal Water Analysis saved to MongoDB. Email dispatch failed.', 'warning');
        } else {
          setSavePhase('idle');
          showToast?.('Vacuum Seal Water Analysis saved to MongoDB. Email dispatch pending.', 'info');
        }
      } else {
        showToast?.(res.data?.message || 'Error saving Vacuum Seal Water data.', 'error');
        setSavePhase('idle');
      }
    } catch (err) {
      console.error('API save error:', err);
      const errMsg = err.response?.data?.message || 'Failed to save Vacuum Seal Water Analysis to database.';
      showToast?.(errMsg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
      setShowConfirmModal(false);
    }
  };

  const handleRetryEmail = () => {
    retryAnalysisEmail({
      endpoint: '/vacuum-seal-water',
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
      { label: 'Latest Slot Time', value: readings[readings.length - 1]?.time || '—' },
      { label: 'Latest FNH3', value: readings[readings.length - 1]?.fnh3 ? `${readings[readings.length - 1].fnh3} ppm` : '—' },
      { label: 'Latest CNH3', value: readings[readings.length - 1]?.cnh3 ? `${readings[readings.length - 1].cnh3} ppm` : '—' },
    ];
  }, [readings]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── SAVE STATUS BANNER ── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Vacuum Seal Water Analysis"
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
              <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/60">
                Vacuum Seal Water
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Gauge className="w-5 h-5 text-sky-600" />
              VACUUM SEAL WATER ANALYSIS
            </h1>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {!isViewOnly && (
            <button
              onClick={handleReset}
              disabled={saving}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly && (
            <StatusSaveButton
              saving={saving}
              isLocked={lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)}
              savePhase={savePhase}
              onClick={initiateSave}
              className="px-4 py-1.5 text-xs"
            />
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: Vacuum Seal Water Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden w-full">
        {/* Table Top Controls with Date */}
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Vacuum Seal Water Shift Measurements
              </h2>
            </div>

            {/* Read-Only Date Badge */}
            <LockedDateDisplay date={date} id="vsw-date-display" />
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

        <div className="overflow-x-auto w-full table-responsive-container">
          <table className="w-full text-left border-collapse min-w-[750px] xl:min-w-full">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-3 w-12 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-4 w-36 text-center border-r border-slate-700">
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME / SHIFT
                  </div>
                </th>
                <th className="py-3 px-5 text-center border-r border-slate-700">
                  <div>FNH₃</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">ppm (Free Ammonia)</div>
                </th>
                <th className="py-3 px-5 text-center border-r border-slate-700">
                  <div>CNH₃</div>
                  <div className="text-[10px] font-normal text-indigo-300 normal-case">ppm (Combined Ammonia)</div>
                </th>
                <th className="py-3 px-5 text-center border-r border-slate-700">
                  <div>Ca</div>
                  <div className="text-[10px] font-normal text-teal-300 normal-case">Limit: NIL</div>
                </th>
                <th className="py-3 px-4 text-center border-r border-slate-700">STATUS</th>
                {!isViewOnly && (
                  <th className="py-3 px-2 w-16 text-center">ACTION</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const fnh3Limit = getCellLimit('offset', 'vacuum-seal-water', 'Day', 'fnh3');
                const fnh3Valid = fnh3Limit && row.fnh3 !== '' ? validateCellValue(row.fnh3, fnh3Limit) : { isOutOfLimit: false };

                const caLimit = getCellLimit('offset', 'vacuum-seal-water', 'Day', 'ca');
                const isCaNil = row.ca !== undefined && ['nil', 'n', 'ni', 'none', '-'].includes(String(row.ca).toLowerCase().trim());
                const caValid = caLimit && row.ca !== '' ? (isCaNil ? { isOutOfLimit: false } : { isOutOfLimit: true }) : { isOutOfLimit: false };

                const disabled = isRowDisabled(row, idx);

                // Field-level edit detection
                const isFnh3Edited = Boolean(
                  editedFields[`${row.id}_fnh3`] ||
                  editedFields[`${row.time}_fnh3`] ||
                  (idx === 0 && editedFields['1_fnh3']) ||
                  (idx === 1 && editedFields['2_fnh3']) ||
                  (idx === 2 && editedFields['3_fnh3'])
                );

                const isCnh3Edited = Boolean(
                  editedFields[`${row.id}_cnh3`] ||
                  editedFields[`${row.time}_cnh3`] ||
                  (idx === 0 && editedFields['1_cnh3']) ||
                  (idx === 1 && editedFields['2_cnh3']) ||
                  (idx === 2 && editedFields['3_cnh3'])
                );

                const isCaEdited = Boolean(
                  editedFields[`${row.id}_ca`] ||
                  editedFields[`${row.time}_ca`] ||
                  (idx === 0 && editedFields['1_ca']) ||
                  (idx === 1 && editedFields['2_ca']) ||
                  (idx === 2 && editedFields['3_ca'])
                );

                // Shift Status Badge
                let shiftBadge = null;
                const time = String(row.time || '');
                if (idx === 0 || time === '07:00') {
                  if (lockedShifts.shift1Locked || lockedShifts.shift2Saved) {
                    shiftBadge = <RecordStatusBadge status="locked" subLabel="shift locked" />;
                  } else if (lockedShifts.shift1Saved) {
                    shiftBadge = <RecordStatusBadge status="editable" subLabel="saved" />;
                  } else {
                    shiftBadge = <RecordStatusBadge status="new" subLabel="first entry" />;
                  }
                } else if (idx === 1 || time === '15:00') {
                  if (!lockedShifts.shift1Saved) {
                    shiftBadge = <RecordStatusBadge status="waiting" subLabel="pending shift 1" />;
                  } else if (lockedShifts.shift2Locked || lockedShifts.shift3Saved) {
                    shiftBadge = <RecordStatusBadge status="locked" subLabel="shift locked" />;
                  } else if (lockedShifts.shift2Saved) {
                    shiftBadge = <RecordStatusBadge status="editable" subLabel="saved" />;
                  } else {
                    shiftBadge = <RecordStatusBadge status="new" subLabel="first entry" />;
                  }
                } else if (idx === 2 || time === '23:00') {
                  if (!lockedShifts.shift2Saved) {
                    shiftBadge = <RecordStatusBadge status="waiting" subLabel="pending shift 2" />;
                  } else if (lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) {
                    shiftBadge = <RecordStatusBadge status="locked" subLabel="shift locked" />;
                  } else if (lockedShifts.shift3Saved) {
                    shiftBadge = <RecordStatusBadge status="editable" subLabel="1 edit left" />;
                  } else {
                    shiftBadge = <RecordStatusBadge status="new" subLabel="first entry" />;
                  }
                }

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${disabled ? 'bg-slate-50/60' : 'hover:bg-sky-50/30'}`}
                  >
                    {/* Row index */}
                    <td className="py-3 px-3 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* TIME */}
                    <td className="py-3 px-3 text-center border-r border-slate-100 bg-slate-50/30">
                      <input
                        type="text"
                        value={row.time}
                        disabled={disabled}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className={`w-full text-center font-mono font-bold text-sm rounded-md py-1.5 px-2 transition shadow-2xs ${
                          disabled
                            ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                            : 'bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100'
                        }`}
                      />
                    </td>

                    {/* FNH3 */}
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
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                              : errors[`${row.id}_fnh3`] || fnh3Valid.isOutOfLimit
                              ? 'border-red-500 bg-red-50 text-red-900'
                              : row.fnh3 !== '' && row.fnh3 !== '0'
                              ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                              : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                          }`}
                        />
                      </div>
                      <EditedBadge isEdited={isFnh3Edited} />
                      {fnh3Valid.isOutOfLimit && !errors[`${row.id}_fnh3`] && fnh3Limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {fnh3Limit.formattedLabel || `Limit: ${fnh3Limit.min}-${fnh3Limit.max}`}
                        </div>
                      )}
                      {!fnh3Valid.isOutOfLimit && !errors[`${row.id}_fnh3`] && fnh3Limit && row.fnh3 === '' && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {fnh3Limit.formattedRange || `${fnh3Limit.min}-${fnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* CNH3 */}
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
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                              : errors[`${row.id}_cnh3`]
                              ? 'border-red-500 bg-red-50 text-red-900'
                              : row.cnh3 !== '' && row.cnh3 !== '0'
                              ? 'border-indigo-300 bg-indigo-50/30 font-bold text-indigo-950 focus:border-indigo-600'
                              : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                          }`}
                        />
                      </div>
                      <EditedBadge isEdited={isCnh3Edited} />
                    </td>

                    {/* Ca */}
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
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                              : errors[`${row.id}_ca`] || caValid.isOutOfLimit
                              ? 'border-red-500 bg-red-50 text-red-900'
                              : row.ca !== undefined && row.ca !== ''
                              ? 'border-teal-300 bg-teal-50/30 font-bold text-teal-950 focus:border-teal-600'
                              : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                          }`}
                        />
                      </div>
                      <EditedBadge isEdited={isCaEdited} />
                      {caValid.isOutOfLimit && !errors[`${row.id}_ca`] && caLimit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          Limit: NIL
                        </div>
                      )}
                      {!caValid.isOutOfLimit && !errors[`${row.id}_ca`] && caLimit && (row.ca === '' || row.ca === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          NIL
                        </div>
                      )}
                    </td>

                    {/* STATUS */}
                    <td className="py-3 px-4 text-center border-r border-slate-100">
                      {shiftBadge || <span className="text-xs text-slate-400">—</span>}
                    </td>

                    {/* ACTION */}
                    {!isViewOnly && (
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={readings.length <= 1 || disabled}
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
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

        {/* Table Footer */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {!isViewOnly && (
              <button
                onClick={handleAddRow}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                Add Another Time Slot
              </button>
            )}
            <span className="text-slate-500 font-medium">
              {readings.length} {readings.length === 1 ? 'slot' : 'slots'} recorded
            </span>
          </div>

          <div className="text-slate-500 text-xs">
            Parameters: <span className="font-semibold text-slate-700">FNH₃ (Free Ammonia) | CNH₃ (Combined Ammonia) in ppm</span>
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="Vacuum Seal Water Analysis"
        date={date}
        shiftOrTime={readings.length ? `${readings.length} Slots` : 'Daily'}
        summaryItems={summaryItems}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default VacuumSealWaterAnalysisPage;
