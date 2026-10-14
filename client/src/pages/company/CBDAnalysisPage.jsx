import React, { useState, useCallback, useEffect } from 'react';
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
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Droplets,
  Lock,
} from 'lucide-react';

// Shift rows matching laboratory shifts
const SHIFTS = [
  {
    key: 'iShift',
    lockKey: 'shift1',
    label: 'I SHIFT',
    desc: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
    badgeStyle: 'bg-blue-100 text-blue-900 border border-blue-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiShift',
    lockKey: 'shift2',
    label: 'II SHIFT',
    desc: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiiShift',
    lockKey: 'shift3',
    label: 'III SHIFT',
    desc: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badgeStyle: 'bg-purple-100 text-purple-900 border border-purple-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
];

// Parameters matching CBD laboratory report screenshot
const PARAMETERS = [
  { key: 'ph',     label: 'pH',     rawLabel: 'pH',     unit: '',    placeholder: '0.00', step: '0.1' },
  { key: 'po4',    label: 'PO₄',    rawLabel: 'PO4',    unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'na2so3', label: 'Na₂SO₃', rawLabel: 'Na2SO3', unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'talk',   label: 'T.Alk',  rawLabel: 'T.Alk',  unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tfe',    label: 'T.Fe',   rawLabel: 'T.Fe',   unit: 'ppm', placeholder: '0.00', step: '0.1' },
  { key: 'sio2',   label: 'SiO₂',   rawLabel: 'SiO2',   unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'ss',     label: 'SS',     rawLabel: 'SS',     unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tds',    label: 'TDS',    rawLabel: 'TDS',    unit: 'ppm', placeholder: '0.00', step: '1' },
];

const buildEmptyData = () => ({
  iShift:   { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
});

const SCREENSHOT_DATA = {
  iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
  iiShift:  { ph: '',     po4: '',   na2so3: '',   talk: '',    tfe: '',  sio2: '',  ss: '',   tds: '' },
  iiiShift: { ph: '',     po4: '',   na2so3: '',   talk: '',    tfe: '',  sio2: '',  ss: '',   tds: '' },
};

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const CBDAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => getTodayAsiaKolkata());
  const [data, setData] = useState(SCREENSHOT_DATA);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle'); // 'idle' | 'saving' | 'completed' | 'email_pending' | 'email_failed'
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
  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 'iShift') {
      return Boolean(lockedShifts.shift1Locked || lockedShifts.shift2Saved);
    }
    if (shiftKey === 'iiShift') {
      if (!lockedShifts.shift1Saved) return true; // Waiting for Shift 1
      return Boolean(lockedShifts.shift2Locked || lockedShifts.shift3Saved);
    }
    if (shiftKey === 'iiiShift') {
      if (!lockedShifts.shift2Saved) return true; // Waiting for Shift 2
      if (lockedShifts.shift3Locked) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 2) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/cbd-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        if (response.data?.emailStatus) {
          if (response.data.emailStatus === 'sent') setSavePhase('completed');
          else if (response.data.emailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('email_pending');
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
            setData(record.shifts);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setData(record.readings);
          } else if (record.rows) {
            setData(record.rows);
          } else if (record.data && !Array.isArray(record.data)) {
            setData(record.data);
          }
        } else {
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing CBD data', err);
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Cell Value Change ──
  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    if (isShiftDisabled(shiftKey)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [paramKey]: value,
      },
    }));

    if (errors[`${shiftKey}_${paramKey}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${shiftKey}_${paramKey}`];
        return next;
      });
    }

    setSaveSuccess(false);
  }, [errors, isShiftDisabled]);

  // ── Reset ──
  const handleReset = () => {
    setData(buildEmptyData());
    setDate(getTodayAsiaKolkata());
    setErrors({});
    setSaveSuccess(false);
    showToast('CBD analysis form reset.', 'info');
  };

  // ── Save Click (Opens Confirmation Modal) ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    let hasError = false;
    const newErrors = {};

    SHIFTS.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key][p.key];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${s.key}_${p.key}`] = 'Numbers only';
          hasError = true;
        }
      });
    });

    if (hasError) {
      setErrors(newErrors);
      showToast('Please correct highlighted cell errors before saving.', 'error');
      return;
    }

    const hasValues = Object.values(data).some((sObj) =>
      Object.values(sObj).some((val) => val !== '' && val !== null && val !== undefined)
    );

    if (!hasValues) {
      showToast('Please enter at least one measurement value.', 'warning');
      return;
    }

    // Determine which shifts are being submitted
    const activeShifts = SHIFTS.filter((s) => !isShiftDisabled(s.key));
    const summaryItems = [];
    activeShifts.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key][p.key];
        if (val !== '' && val !== null && val !== undefined) {
          summaryItems.push({ label: `${s.label} ${p.label}`, value: val });
        }
      });
    });

    setConfirmData({
      shiftOrTime: activeShifts.map((s) => s.label).join(', '),
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

    const payload = {
      date,
      plant: 'OFFSET',
      unit: 'CBD',
      analysisType: 'CBD Analysis',
      submittedBy: user?.name || 'Plant Operator',
      shifts: data,
    };

    try {
      const response = await api.post('/api/cbd-analysis', payload);
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
      if (response.data?.emailRecipient) {
        setRecipientEmail(response.data.emailRecipient);
      }

      const emailStatus = response.data?.emailStatus;
      if (emailStatus === 'sent' || response.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Delivered to SMTP server ✓');
        showToast('Saved & Emailed Successfully ✓', 'success');
      } else if (emailStatus === 'pending' || response.data?.emailPending) {
        setSavePhase('email_pending');
        setEmailStatusDetail('Saved — Email dispatching immediately 🚀');
        showToast('Saved — Email Dispatching 🚀', 'info');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data?.emailError || 'Email delivery failed');
        showToast('Data saved to database. Email delivery failed: ' + (response.data?.emailError || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('idle');
      console.error('[CBDAnalysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryEmail = () => {
    retryAnalysisEmail({
      endpoint: '/api/cbd-analysis',
      recordId,
      setSavePhase,
      setEmailStatusDetail,
      showToast,
      setSaving,
    });
  };

  // Helper for Shift Status Badge
  const getShiftBadge = (shiftKey) => {
    if (shiftKey === 'iShift') {
      if (lockedShifts.shift1Locked || lockedShifts.shift2Saved) {
        return <RecordStatusBadge status="LOCKED" subLabel="shift locked" />;
      }
      if (lockedShifts.shift1Saved) {
        return <RecordStatusBadge status="EDITABLE" subLabel="1 edit left" />;
      }
      return <RecordStatusBadge status="NEW" subLabel="first entry" />;
    }
    if (shiftKey === 'iiShift') {
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
    if (shiftKey === 'iiiShift') {
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
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb Header ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Title */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <span>OFFSET Plant</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-blue-600 font-semibold">Utilities</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-slate-600 font-semibold">Continuous Blowdown</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5 flex items-center gap-2">
                <Droplets className="w-5 h-5 text-blue-600 shrink-0" />
                CBD ANALYSIS (CONTINUOUS BLOWDOWN)
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            <LockedDateDisplay date={date} id="cbd-locked-date" />

            <button
              onClick={handleReset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-50"
              title="Reset form"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            {!isViewOnly ? (
              <StatusSaveButton
                id="btn-cbd-save"
                saving={saving}
                isLocked={Boolean(lockedShifts.shift1Locked && lockedShifts.shift2Locked && lockedShifts.shift3Locked)}
                savePhase={savePhase}
                onClick={handleSaveClick}
                title="Save CBD Analysis"
              />
            ) : (
              <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                Read-Only View
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner (Success, Pending, or Email Failed) ── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="CBD Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => setSaveSuccess(false)}
        saving={saving}
      />

      {/* ── Main Data Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-blue-600" />
              <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                CBD Analysis (3-Shift Sequential Workflow)
              </h2>
            </div>
          </div>

          <span className="text-[11px] font-mono text-slate-400 font-bold hidden sm:inline">
            pH · PO₄ · Na₂SO₃ · T.Alk · T.Fe · SiO₂ · SS · TDS
          </span>
        </div>

        {/* Scrollable table container */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]" id="cbd-table">
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-40 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  SHIFT
                </th>

                {PARAMETERS.map((p, idx) => (
                  <th
                    key={p.key}
                    className={`px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 border-r border-slate-800/50 ${
                      idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                    }`}
                  >
                    <div>{p.label}</div>
                    {p.unit && (
                      <div className="text-[10px] font-normal text-slate-400 lowercase tracking-normal">
                        {p.unit}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => {
                const disabled = isShiftDisabled(shift.key);

                return (
                  <tr
                    key={shift.key}
                    className={`transition-colors duration-100 ${shift.rowStyle} ${disabled ? 'opacity-85' : ''}`}
                  >
                    {/* Shift Label Badge */}
                    <td className="px-5 py-3 align-middle whitespace-nowrap border-r border-slate-200">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-mono px-2.5 py-1 rounded shadow-2xs inline-block text-center ${shift.badgeStyle}`}>
                            {shift.label}
                          </span>
                          {getShiftBadge(shift.key)}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {shift.desc}
                        </span>
                      </div>
                    </td>

                    {/* Parameter Input Cells */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${shift.key}_${param.key}`;
                      const cellVal = data[shift.key]?.[param.key] || '';
                      const isInvalid = !!errors[fieldKey];
                      const errorMessage = errors[fieldKey];
                      const limit = getCellLimit('offset', 'cbd', 'day', param.key);
                      const validation = limit && cellVal !== '' ? validateCellValue(cellVal, limit) : { isOutOfLimit: false };
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isEdited = Boolean(editedFields[`${shift.key}_${param.key}`]);

                      return (
                        <td key={param.key} className="px-3 py-2.5 text-center align-middle border-r border-slate-100">
                          <div className="flex flex-col items-center">
                            <input
                              id={`cbd-input-${shift.key}-${param.key}`}
                              type="text"
                              inputMode="decimal"
                              value={cellVal}
                              disabled={disabled}
                              onChange={(e) =>
                                handleChange(shift.key, param.key, e.target.value)
                              }
                              placeholder={param.placeholder}
                              className={`w-full max-w-[95px] mx-auto text-center text-sm font-mono font-bold px-3 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                disabled
                                  ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                                  : isInvalid || isOutOfLimit
                                  ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                  : shift.inputFocus
                              }`}
                              aria-label={`${shift.label} ${param.label}`}
                            />

                            <EditedBadge isEdited={isEdited} />

                            {/* Error Message if invalid format */}
                            {isInvalid && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>{errorMessage}</span>
                              </div>
                            )}
                          
                            {isOutOfLimit && !isInvalid && limit && (
                              <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                                {limit.formattedLabel || `Limit: ${limit.min}-${limit.max}`}
                              </div>
                            )}
                            {!isOutOfLimit && !isInvalid && limit && cellVal === '' && (
                              <div className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                                {limit.formattedRange || `${limit.min}-${limit.max}`}
                              </div>
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

        {/* Bottom helper bar */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 font-medium">
            Sequential Shift Workflow: <strong>I SHIFT</strong> must be saved first → enables <strong>II SHIFT</strong> → enables <strong>III SHIFT</strong> (locks preceding shifts).
          </p>
        </div>
      </div>

      {/* ── Save Confirmation Modal ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="CBD Analysis"
        date={date}
        shiftOrTime={confirmData?.shiftOrTime}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default CBDAnalysisPage;
