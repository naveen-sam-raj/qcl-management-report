import React, { useState, useEffect, useCallback } from 'react';
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
  Flame,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
import {
  getCellLimit,
  validateCellValue,
  SA_LSA_LIMITS,
} from '../../services/analysisValidation';

// ─── Shift Rows ───────────────────────────────────────────────────────────────
const SHIFTS = [
  {
    key: 'iShift',
    label: 'I SHIFT',
    desc: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
    badgeStyle: 'bg-blue-100 text-blue-900 border border-blue-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiShift',
    label: 'II SHIFT',
    desc: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiiShift',
    label: 'III SHIFT',
    desc: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badgeStyle: 'bg-purple-100 text-purple-900 border border-purple-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'composite',
    label: 'COMPOSITE',
    desc: '24-Hour Composite',
    isComposite: true,
    rowStyle: 'bg-amber-50/50 hover:bg-amber-100/70 border-l-4 border-l-amber-500',
    badgeStyle: 'bg-amber-100 text-amber-950 border border-amber-300 font-black',
    inputFocus: 'border-2 border-amber-300 bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-100 text-slate-950 font-bold hover:border-amber-400',
  },
];

// ─── Parameters Matching Original Lab Form ────────────────────────────────────
const PARAMETERS = [
  { key: 'na2co3',    label: 'Na₂CO₃', rawLabel: 'Na2CO3', unit: '%', isPercent: true,  placeholder: '0.00', step: '0.1' },
  { key: 'nacl',      label: 'NaCl',   rawLabel: 'NaCl',   unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
  { key: 'fe',        label: 'Fe',     rawLabel: 'Fe',     unit: '%', isPercent: true,  placeholder: '0.0000', step: '0.0001' },
  { key: 'na2so4',    label: 'Na₂SO₄', rawLabel: 'Na2SO4', unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
  { key: 'vm',        label: 'VM',     rawLabel: 'VM',     unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
  { key: 'ir',        label: 'IR',     rawLabel: 'IR',     unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
  { key: 'bd',        label: 'BD',     rawLabel: 'BD',     unit: 'g/L', isPercent: false, placeholder: '0.00', step: '1' },
  { key: 'turbidity', label: 'TURBIDITY SOLUTION', rawLabel: 'TURBIDITY', unit: 'NTU', isPercent: false, placeholder: '0.00', step: '1' },
];

const buildEmptyData = () => ({
  iShift:    { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  iiShift:   { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  iiiShift:  { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
  composite: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
});

const getTodayAsiaKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

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

const LSAShiftAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Strict Current-Date Restriction) ──
  const [date]                                          = useState(() => getOperatingDateIST());
  const [data, setData]                                 = useState(buildEmptyData());
  const [originalData, setOriginalData]                 = useState(null);
  const [errors, setErrors]                             = useState({});
  const [saving, setSaving]                             = useState(false);
  const [lastSaved, setLastSaved]                       = useState(null);

  // Email & Persistence states
  const [savePhase, setSavePhase]                       = useState('idle'); // 'idle' | 'saving' | 'completed' | 'email_failed'
  const [recordId, setRecordId]                         = useState(null);
  const [recipientEmail, setRecipientEmail]             = useState('');
  const [emailStatusDetail, setEmailStatusDetail]       = useState('');
  const [isPermanentMailError, setIsPermanentMailError] = useState(false);
  const [lockedShifts, setLockedShifts]                 = useState({});
  const [lockedSlots, setLockedSlots]                   = useState({});
  const [editedFields, setEditedFields]                 = useState({});
  const [retryingEmail, setRetryingEmail]               = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]         = useState(false);
  const [confirmData, setConfirmData]                   = useState(null);

  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 'iShift') {
      return Boolean(lockedShifts.iShift) || Boolean(lockedShifts.iiShiftSaved);
    }
    if (shiftKey === 'iiShift') {
      if (!lockedShifts.iShiftSaved) return true;
      return Boolean(lockedShifts.iiShift) || Boolean(lockedShifts.iiiShiftSaved);
    }
    if (shiftKey === 'iiiShift') {
      if (!lockedShifts.iiShiftSaved) return true;
      if (lockedShifts.iiiShift) return true;
      if (lockedShifts.iiiShiftSaved && (lockedShifts.iiiShiftEdits || 0) >= 1) return true;
      return false;
    }
    if (shiftKey === 'composite') {
      if (lockedShifts.composite) return true;
      if (lockedShifts.compositeSaved && (lockedShifts.compositeEdits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  const getShiftBadgeStatus = useCallback((shiftKey) => {
    if (shiftKey === 'iShift') {
      if (lockedShifts.iShift || lockedShifts.iiShiftSaved) return 'LOCKED';
      if (lockedShifts.iShiftSaved) return 'EDITABLE';
      return 'OPEN';
    }
    if (shiftKey === 'iiShift') {
      if (!lockedShifts.iShiftSaved) return 'WAITING';
      if (lockedShifts.iiShift || lockedShifts.iiiShiftSaved) return 'LOCKED';
      if (lockedShifts.iiShiftSaved) return 'EDITABLE';
      return 'OPEN';
    }
    if (shiftKey === 'iiiShift') {
      if (!lockedShifts.iiShiftSaved) return 'WAITING';
      if (lockedShifts.iiiShift || (lockedShifts.iiiShiftSaved && (lockedShifts.iiiShiftEdits || 0) >= 1)) return 'LOCKED';
      if (lockedShifts.iiiShiftSaved) return 'EDITABLE';
      return 'OPEN';
    }
    if (shiftKey === 'composite') {
      if (lockedShifts.composite || (lockedShifts.compositeSaved && (lockedShifts.compositeEdits || 0) >= 1)) return 'LOCKED';
      if (lockedShifts.compositeSaved) return 'EDITABLE';
      return 'OPEN';
    }
    return 'WAITING';
  }, [lockedShifts]);

  // Fetch existing data when date mounts / loads
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/lsa-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success) {
          const rec = response.data.record || (Array.isArray(response.data.data) ? response.data.data[0] : response.data.data);
          if (rec) {
            setRecordId(rec._id || response.data.recordId || null);
            setRecipientEmail(rec.emailRecipient || response.data.assignedOperatorEmail || '');

            if (rec.emailStatus === 'sent') {
              setSavePhase('completed');
              setEmailStatusDetail(`Email sent to ${rec.emailRecipient || response.data.assignedOperatorEmail || 'plant operator'}`);
            } else if (rec.emailStatus === 'failed') {
              setSavePhase('email_failed');
              setEmailStatusDetail('Database save succeeded. Email dispatch failed.');
            }

            const shifts = rec.shifts || rec.data?.shifts;
            if (shifts && typeof shifts === 'object') {
              setData(shifts);
              setOriginalData(JSON.parse(JSON.stringify(shifts)));
            } else {
              setData(buildEmptyData());
              setOriginalData(null);
            }

            setLockedShifts(rec.lockedShifts || response.data.lockedShifts || {});
            setLockedSlots(rec.lockedSlots || response.data.lockedSlots || {});
            setEditedFields(rec.editedFields || response.data.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setLockedShifts({});
            setLockedSlots({});
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing LSA Shift data:', err);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Input Changes ──
  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (isViewOnly) return;
    if (isShiftDisabled(shiftKey)) return;
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [paramKey]: value,
      },
    }));

    // Clear cell error if any
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${shiftKey}_${paramKey}`];
      return next;
    });

    if (savePhase !== 'idle') {
      setSavePhase('idle');
    }
  }, [savePhase, isViewOnly, isShiftDisabled]);

  // ── Reset ──
  const handleReset = () => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSavePhase('idle');
    showToast?.('LSA Shift analysis form cleared / reset to last saved state.', 'info');
  };

  // ── Validation ──
  const validate = () => {
    const newErrors = {};
    let hasError = false;

    SHIFTS.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined) {
          if (isNaN(Number(val))) {
            newErrors[`${s.key}_${p.key}`] = 'Numbers only';
            hasError = true;
          }
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // ── Open Save Confirmation Modal ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validate()) {
      showToast?.('Please enter valid numeric values for highlighted fields.', 'error');
      return;
    }

    const changedShifts = [];
    SHIFTS.forEach((s) => {
      if (isShiftDisabled(s.key)) return;
      const currentVals = data[s.key] || {};
      const hasAny = Object.values(currentVals).some(v => v !== '' && v !== null && v !== undefined);
      const origVals = originalData ? (originalData[s.key] || {}) : {};
      const isDiff = PARAMETERS.some(p => {
        const oVal = origVals[p.key] ?? '';
        const cVal = currentVals[p.key] ?? '';
        return oVal !== cVal;
      });
      if (hasAny && isDiff) {
        changedShifts.push(s.key);
      }
    });

    if (changedShifts.length === 0) {
      showToast?.('No new or modified measurement values found to save.', 'info');
      return;
    }

    if (changedShifts.length > 1) {
      showToast?.('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    const activeShiftKey = changedShifts[0];
    const activeShiftObj = SHIFTS.find(s => s.key === activeShiftKey);

    setConfirmData({
      date,
      targetShift: activeShiftKey,
      activeShifts: [activeShiftObj],
      data,
    });
    setShowConfirmModal(true);
  };

  // ── Confirm Save Execution ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const targetShift = confirmData?.targetShift || 'iShift';
      const payload = {
        date,
        plant: 'SA',
        unit: 'LSA',
        analysisType: 'LSA Shift Analysis',
        shift: targetShift,
        shifts: data,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/lsa-analysis', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes detected', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save LSA Shift Analysis.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setOriginalData(JSON.parse(JSON.stringify(data)));
      setLastSaved(new Date().toLocaleTimeString());

      const returnedDoc = res.data?.data || res.data?.record || {};
      const newEdited = res.data?.editedFields || returnedDoc.editedFields || {};
      const newRecordId = res.data?.recordId || returnedDoc._id || returnedDoc.id;

      setRecordId(newRecordId || recordId);
      setEditedFields(newEdited);
      setLockedShifts(returnedDoc.lockedShifts || res.data?.lockedShifts || {});
      setLockedSlots(returnedDoc.lockedSlots || res.data?.lockedSlots || {});
      setRecipientEmail(res.data?.emailRecipient || returnedDoc.emailRecipient || '');

      const isEmailSent = res.data?.emailDeliveryStatus === 'sent' || res.data?.emailStatus === 'sent';
      const isEmailFailed = res.data?.emailDeliveryStatus === 'failed' || res.data?.emailStatus === 'failed';
      const isEmailDisabled = res.data?.emailDeliveryStatus === 'disabled' || res.data?.emailStatus === 'disabled';

      if (isEmailDisabled) {
        setSavePhase('completed');
        setEmailStatusDetail('Saved ✓ (Email disabled for this plant)');
        showToast?.('LSA Shift Analysis saved successfully!', 'success');
      } else if (isEmailSent) {
        setSavePhase('completed');
        setEmailStatusDetail(`Notification dispatched to ${res.data?.emailRecipient || 'SA Plant operator'}`);
        showToast?.('LSA Shift Analysis saved and email notification sent!', 'success');
      } else if (isEmailFailed) {
        setSavePhase('email_failed');
        setEmailStatusDetail(res.data?.message || 'Email delivery failed.');
        showToast?.('Data saved to MongoDB, but email dispatch failed.', 'warning');
      } else {
        setSavePhase('completed');
        setEmailStatusDetail('Saved successfully. Email notification is processing in background.');
        showToast?.('LSA Shift Analysis saved successfully.', 'success');
      }
    } catch (err) {
      console.error('[LSAShiftAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  // ── Retry Email Dispatch ──
  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('No saved record reference found to retry email.', 'warning');
      return;
    }
    setRetryingEmail(true);
    try {
      const res = await api.post(`/api/lsa-analysis/${recordId}/retry-email`);
      if (res.data?.success && (res.data?.emailSent || res.data?.emailDeliveryStatus === 'sent')) {
        setSavePhase('completed');
        setEmailStatusDetail(`Notification email successfully re-sent to ${res.data?.emailRecipient || res.data?.recipient || recipientEmail}`);
        showToast?.('Notification email re-sent successfully!', 'success');
      } else {
        const errorMsg = res.data?.message || 'SMTP delivery rejected.';
        if (errorMsg.includes('550') || errorMsg.includes('NoSuchUser') || errorMsg.includes('Invalid recipient')) {
          setIsPermanentMailError(true);
        }
        setEmailStatusDetail(`Retry failed: ${errorMsg}`);
        showToast?.(`Email retry failed: ${errorMsg}`, 'error');
      }
    } catch (err) {
      console.error('[LSAShiftAnalysis] Retry email failed:', err);
      const msg = err.response?.data?.message || err.message;
      if (msg.includes('550') || msg.includes('NoSuchUser')) {
        setIsPermanentMailError(true);
      }
      setEmailStatusDetail(`Retry failed: ${msg}`);
      showToast?.(`Email retry failed: ${msg}`, 'error');
    } finally {
      setRetryingEmail(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Breadcrumb Header ─────────────────────────────────────────────── */}
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
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">LSA</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-slate-600 font-bold">Once in a Shift</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                LSA SHIFT ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {lastSaved && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Saved at {lastSaved}
              </span>
            )}

            {!isViewOnly && (
              <button
                id="btn-lsa-reset"
                onClick={handleReset}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                title="Clear all fields or revert to last saved state"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            {!isViewOnly && (
              <StatusSaveButton
                id="btn-lsa-save"
                saving={saving}
                savePhase={savePhase}
                onClick={handleSaveClick}
                defaultLabel="Save / Submit"
                title="Save LSA Shift data"
                alwaysShowSaveText={true}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner (Email / Save Status) ── */}
      <SaveStatusBanner
        id="lsa-shift-status-banner"
        saveSuccess={savePhase === 'completed' || savePhase === 'email_failed'}
        savePhase={savePhase}
        date={date}
        analysisName="LSA Shift Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => setSavePhase('idle')}
        saving={saving || retryingEmail}
      />

      {/* ── Analysis Table Card ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

        {/* Table header with Integrated Date Selector Locked to Today */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-blue-600" />
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                LSA Shift Analysis Data Entry (I, II, III Shift &amp; Composite)
              </span>
            </div>

            {/* Operating Day Display */}
            <LockedDateDisplay date={date} id="lsa-shift-date-display" badgeText="Operating Day" />
          </div>
          <span className="text-[11px] font-bold text-slate-400 font-mono hidden sm:inline">
            Na₂CO₃ · NaCl · Fe · Na₂SO₄ · VM · IR · BD · Turbidity
          </span>
        </div>

        {/* Scrollable table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            {/* Column headers with dark navy styling */}
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
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
                    <div className="text-[10px] font-normal text-slate-400 lowercase tracking-normal">
                      {p.unit}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows with shift styling */}
            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => {
                const shiftEdits = editedFields[shift.key] || {};
                const shiftDisabled = isShiftDisabled(shift.key);
                const shiftStatus = getShiftBadgeStatus(shift.key);

                return (
                  <tr
                    key={shift.key}
                    className={`transition-colors duration-100 ${shift.rowStyle}`}
                  >
                    {/* Shift Label Badge */}
                    <td className="px-5 py-3 align-middle whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={`text-xs font-mono px-2.5 py-1 rounded shadow-2xs inline-block text-center ${shift.badgeStyle}`}>
                          {shift.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium text-center">
                          {shift.desc}
                        </span>
                        <RecordStatusBadge status={shiftStatus} />
                      </div>
                    </td>

                    {/* Parameter Input Cells */}
                    {PARAMETERS.map((param) => {
                      const fieldKey = `${shift.key}_${param.key}`;
                      const cellVal = data[shift.key]?.[param.key] ?? '';
                      const isInvalid = !!errors[fieldKey];
                      const errorMessage = errors[fieldKey];
                      const isEdited = !!shiftEdits[param.key];

                      const limit = getCellLimit(plantId || 'sa', 'lsa', shift.key, param.key) || SA_LSA_LIMITS[param.key];
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;

                      return (
                        <td key={param.key} className="px-3 py-2.5 text-center align-top">
                          <div className="flex flex-col items-center justify-start min-h-[58px]">
                            <div className="relative w-full max-w-[105px]">
                              <input
                                id={`lsa-input-${shift.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                disabled={isViewOnly || shiftDisabled}
                                value={cellVal}
                                onChange={(e) =>
                                  handleChange(shift.key, param.key, e.target.value)
                                }
                                placeholder={param.placeholder}
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} ${limit.unit} (Valid range: ${limit.formattedRange})`
                                      : hasValue
                                      ? `Normal: ${cellVal} ${limit.unit} (Valid range: ${limit.formattedRange})`
                                      : `Valid range: ${limit.formattedRange}`
                                    : ''
                                }
                                className={`w-full max-w-[105px] mx-auto text-center text-sm font-mono font-bold px-2.5 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                    : isInvalid
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                    : shift.inputFocus
                                }`}
                                aria-label={`${shift.label} ${param.label}`}
                              />

                              {isEdited && (
                                <span
                                  className="absolute -top-2 -left-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                                  title="Field previously edited"
                                >
                                  EDITED
                                </span>
                              )}

                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Error / Validation Status & Range Display */}
                            {isInvalid ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>{errorMessage}</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {/* Out of limit alert badge */}
                                {hasValue && isOutOfLimit && (
                                  <div
                                    id={`lsa-limit-badge-${shift.key}-${param.key}`}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                    title={`OUT OF LIMIT: ${cellVal} ${limit?.unit || ''} (Valid range: ${limit?.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </div>
                                )}

                                {/* Normal status badge */}
                                {hasValue && isNormal && limit && (
                                  <div
                                    id={`lsa-status-${shift.key}-${param.key}`}
                                    className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </div>
                                )}

                                {/* Range display near input field */}
                                {limit && (
                                  <span
                                    id={`lsa-range-${shift.key}-${param.key}`}
                                    className={`text-[9.5px] font-medium tracking-tight whitespace-nowrap ${
                                      isOutOfLimit
                                        ? 'text-rose-700 font-bold'
                                        : hasValue && isNormal
                                        ? 'text-emerald-700/80 font-semibold'
                                        : 'text-slate-400'
                                    }`}
                                    title={`Valid range: ${limit.formattedRange}`}
                                  >
                                    {limit.formattedRange}
                                  </span>
                                )}
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

        {/* Table footer hint */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <p className="text-xs text-slate-500 font-medium">
              Values for <strong>LSA Shift Analysis</strong> (Frequency: <strong>Once in a Shift</strong> · Na₂CO₃, NaCl, Fe, Na₂SO₄, VM, IR, BD, Turbidity). Numeric values only. Boundary values are considered normal.
            </p>
            <span className="text-xs text-indigo-700 font-medium">
              One correction allowed after first save; saving the next shift locks the previous one. 24-Hour Composite is independent.
            </span>
          </div>
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
                  <p className="text-xs text-slate-500">SA Plant — LSA Shift Analysis</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-600">
              <p>
                You are about to persist readings for <strong>{confirmData?.activeShifts?.length || 0}</strong> active shift entries for today:
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-bold text-slate-800">{date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Shifts:</span>
                  <span className="font-bold text-blue-700">
                    {confirmData?.activeShifts?.map(s => s.label).join(', ') || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Operator:</span>
                  <span className="font-bold text-slate-800">{recipientEmail || ''}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Saving will securely store all parameters to MongoDB and dispatch an official notification email with an Excel report.
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

export default LSAShiftAnalysisPage;
