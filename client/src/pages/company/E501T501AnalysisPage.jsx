import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  Activity,
  TrendingUp,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
import {
  validateCellValue,
  SA_E501_LIMITS,
  SA_T501_LIMITS,
} from '../../services/analysisValidation';

// Default initial readings matching the 3 required shifts
const DEFAULT_READINGS = [
  {
    id: '1',
    shift: 'I',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '',
    t501_na2co3: '',
  },
  {
    id: '2',
    shift: 'II',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '',
    t501_na2co3: '',
  },
  {
    id: '3',
    shift: 'III',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '',
    t501_na2co3: '',
  },
];

const NUMERIC_FIELDS = [
  'e501_fnh3',
  'e501_na2co3',
  't501_fnh3',
  't501_na2co3',
];

const getTodayAsiaKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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

const E501T501AnalysisPage = ({ plantId = 'sa', optionName = 'E 501 / T 501' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // Option selection: 'all' | 'e501' | 't501'
  const [selectedOption, setSelectedOption] = useState(() => {
    const opt = (optionName || '').toLowerCase();
    if (opt.includes('e') && !opt.includes('t')) return 'e501';
    if (opt.includes('t') && !opt.includes('e')) return 't501';
    return 'all';
  });

  // ── States (Strict Current-Date Restriction) ──
  const [date]                                          = useState(() => getOperatingDateIST());
  const [readings, setReadings]                         = useState(DEFAULT_READINGS);
  const [originalReadings, setOriginalReadings]         = useState(null);
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

  const getShiftSlotKey = useCallback((readingId, shift) => {
    if (readingId === '1' || shift === 'I') return 'shift1';
    if (readingId === '2' || shift === 'II') return 'shift2';
    if (readingId === '3' || shift === 'III') return 'shift3';
    return 'shift1';
  }, []);

  const isShiftDisabled = useCallback((slotKey) => {
    if (isViewOnly) return true;
    if (slotKey === 'shift1') {
      return Boolean(lockedShifts.shift1) || Boolean(lockedShifts.shift2Saved);
    }
    if (slotKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2) || Boolean(lockedShifts.shift3Saved);
    }
    if (slotKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  const getShiftBadgeStatus = useCallback((slotKey) => {
    if (slotKey === 'shift1') {
      if (lockedShifts.shift1 || lockedShifts.shift2Saved) return 'LOCKED';
      if (lockedShifts.shift1Saved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'shift2') {
      if (!lockedShifts.shift1Saved) return 'WAITING';
      if (lockedShifts.shift2 || lockedShifts.shift3Saved) return 'LOCKED';
      if (lockedShifts.shift2Saved) return 'EDITABLE';
      return 'OPEN';
    }
    if (slotKey === 'shift3') {
      if (!lockedShifts.shift2Saved) return 'WAITING';
      if (lockedShifts.shift3 || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) return 'LOCKED';
      if (lockedShifts.shift3Saved) return 'EDITABLE';
      return 'OPEN';
    }
    return 'WAITING';
  }, [lockedShifts]);

  // Fetch existing data for today
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/e501-t501-analysis?date=${date}`);
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

            const fetchedReadings = rec.readings || rec.data?.readings;
            if (Array.isArray(fetchedReadings) && fetchedReadings.length > 0) {
              setReadings(fetchedReadings);
              setOriginalReadings(JSON.parse(JSON.stringify(fetchedReadings)));
            } else {
              setReadings(DEFAULT_READINGS);
              setOriginalReadings(null);
            }

            setLockedShifts(rec.lockedShifts || response.data.lockedShifts || {});
            setLockedSlots(rec.lockedSlots || response.data.lockedSlots || {});
            setEditedFields(rec.editedFields || response.data.editedFields || {});
          } else {
            setReadings(DEFAULT_READINGS);
            setOriginalReadings(null);
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing E 501 / T 501 data', err);
        setReadings(DEFAULT_READINGS);
        setOriginalReadings(null);
        setEditedFields({});
      }
    };
    fetchExistingData();
    return () => { active = false; };
  }, [date]);

  // ── Handle reading cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (isViewOnly) return;
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, [isViewOnly, getShiftSlotKey, isShiftDisabled]);

  // ── Reset ──
  const handleReset = () => {
    if (isViewOnly) return;
    if (originalReadings) {
      setReadings(JSON.parse(JSON.stringify(originalReadings)));
      showToast?.('Restored values to last saved state.', 'info');
    } else {
      setReadings(DEFAULT_READINGS);
      showToast?.('Values reset to defaults.', 'info');
    }
    setErrors({});
  };

  // ── Summary Calculations ──
  const stats = useMemo(() => {
    const calcAvg = (field) => {
      const vals = readings
        .map((r) => parseFloat(r[field]))
        .filter((n) => !isNaN(n));
      return vals.length > 0
        ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
        : '—';
    };

    return {
      e501_fnh3_avg: calcAvg('e501_fnh3'),
      e501_na2co3_avg: calcAvg('e501_na2co3'),
      t501_fnh3_avg: calcAvg('t501_fnh3'),
      t501_na2co3_avg: calcAvg('t501_na2co3'),
    };
  }, [readings]);

  // ── Pre-Save Prompt & Validation ──
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

    const modifiedShifts = [];
    readings.forEach((r) => {
      const slotKey = getShiftSlotKey(r.id, r.shift);
      if (isShiftDisabled(slotKey)) return;
      const origRow = originalReadings?.find(o => o.id === r.id);
      const isDiff = NUMERIC_FIELDS.some(f => {
        const origVal = origRow?.[f] ?? '';
        const curVal = r[f] ?? '';
        return origVal !== curVal;
      });
      const hasAnyVal = NUMERIC_FIELDS.some(f => r[f] !== '' && r[f] !== null && r[f] !== undefined);
      if (hasAnyVal && isDiff) {
        modifiedShifts.push(slotKey);
      }
    });

    if (modifiedShifts.length === 0) {
      showToast?.('No new or modified measurement values found to save.', 'info');
      return;
    }

    if (modifiedShifts.length > 1) {
      showToast?.('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    const filledRows = readings.filter(r =>
      NUMERIC_FIELDS.some(f => r[f] !== '' && r[f] !== null && r[f] !== undefined)
    );

    setConfirmData({
      date,
      readings: filledRows,
      totalCount: readings.length,
      targetSlot: modifiedShifts[0],
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
        unit: 'E 501 / T 501',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/e501-t501-analysis', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes detected', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save E 501 / T 501 Analysis.', 'error');
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

      const deliveryStatus = res.data?.emailDeliveryStatus || res.data?.emailStatus;
      const recipient = res.data?.emailRecipient;
      if (recipient) setRecipientEmail(recipient);

      if (deliveryStatus === 'disabled' || res.data?.emailStatus === 'disabled') {
        setSavePhase('completed');
        setEmailStatusDetail('Saved ✓ (Email disabled for this plant)');
        showToast?.('E 501 / T 501 data saved successfully!', 'success');
      } else if (deliveryStatus === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(`Email sent to ${recipient || 'plant operator'}`);
        showToast?.('Saved & Email Sent Successfully!', 'success');
      } else if (deliveryStatus === 'failed') {
        setSavePhase('email_failed');
        const errDetail = res.data?.message || 'SMTP delivery rejected';
        setEmailStatusDetail(errDetail);
        if (errDetail.includes('550') || errDetail.includes('Access denied')) {
          setIsPermanentMailError(true);
        }
        showToast?.('Analysis Saved, but notification email delivery failed.', 'warning');
      } else {
        setSavePhase('completed');
        setEmailStatusDetail('Saved successfully. Email notification is processing in background.');
        showToast?.('E 501 / T 501 data saved successfully!', 'success');
      }
    } catch (err) {
      console.error('Error saving E 501 / T 501 data:', err);
      const msg = err?.response?.data?.message || 'Failed to save E 501 / T 501 Analysis data.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  // ── Retry Email Handler ──
  const handleRetryEmail = async () => {
    if (!recordId || retryingEmail) return;
    setRetryingEmail(true);

    try {
      const res = await api.post(`/api/e501-t501-analysis/${recordId}/retry-email`);
      if (res.data?.success && res.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail(`Notification email re-sent to ${res.data.emailRecipient || recipientEmail}`);
        showToast?.('Email successfully re-sent!', 'success');
      } else {
        setSavePhase('email_failed');
        const errMsg = res.data?.emailError || res.data?.message || 'Retry failed';
        setEmailStatusDetail(`Retry failed: ${errMsg}`);
        if (errMsg.includes('550') || errMsg.includes('Access denied')) {
          setIsPermanentMailError(true);
        }
        showToast?.('Email retry failed.', 'error');
      }
    } catch (err) {
      console.error('Retry email error:', err);
      const msg = err.response?.data?.message || err.message || 'Retry failed';
      setEmailStatusDetail(`Retry failed: ${msg}`);
      showToast?.('Email retry failed.', 'error');
    } finally {
      setRetryingEmail(false);
    }
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
                SA Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Soda Ash Production
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60">
                E 501 / T 501
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Frequency: Once in a Shift
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Activity className="w-5 h-5 text-indigo-600" />
              E 501 / T 501 ANALYSIS
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
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly && (
            <StatusSaveButton
              id="btn-e501-save"
              saving={saving}
              savePhase={savePhase}
              onClick={handleSaveClick}
              defaultLabel="Save E 501 / T 501 Data"
              title="Save E 501 / T 501 observations"
              alwaysShowSaveText={true}
            />
          )}
        </div>
      </div>

      {/* ── Status Banner (Email / Save Status) ── */}
      <SaveStatusBanner
        id="e501-status-banner"
        saveSuccess={savePhase === 'completed' || savePhase === 'email_failed'}
        savePhase={savePhase}
        date={date}
        analysisName="E 501 / T 501 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => setSavePhase('idle')}
        saving={saving || retryingEmail}
      />

      {/* ── MAIN ANALYSIS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table top title banner with Date Locked to Today & Tank Filter */}
        <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                E 501 / T 501 Readings
              </span>
              <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100/80 px-2 py-0.5 rounded border border-indigo-300">
                Once in a Shift
              </span>
            </div>

            {/* Operating Day Display */}
            <LockedDateDisplay date={date} id="e501-t501-date-display" badgeText="Operating Day" />
          </div>

          <div className="flex items-center gap-3">
            {/* Option Selection Toggle */}
            <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300 shadow-2xs">
              <button
                type="button"
                id="btn-option-all"
                onClick={() => setSelectedOption('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  selectedOption === 'all'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View and enter both E 501 and T 501"
              >
                All (E 501 &amp; T 501)
              </button>
              <button
                type="button"
                id="btn-option-e501"
                onClick={() => setSelectedOption('e501')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  selectedOption === 'e501'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Select E 501 only (Limits: FNH₃ 10–40 g/L, Na₂CO₃ 2–10 g/L)"
              >
                E 501
              </button>
              <button
                type="button"
                id="btn-option-t501"
                onClick={() => setSelectedOption('t501')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  selectedOption === 't501'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Select T 501 only (Limits: FNH₃ 1–5 g/L, Na₂CO₃ 20–60 g/L)"
              >
                T 501
              </button>
            </div>

            {!isViewOnly && (
              <button
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Shift Row
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Row 1: Groups */}
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-12 text-center border-r border-b border-slate-800"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-4 w-28 text-center border-r border-b border-slate-800"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Shift</span>
                  </div>
                </th>
                {(selectedOption === 'all' || selectedOption === 'e501') && (
                  <th
                    colSpan={2}
                    className="py-2.5 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-indigo-300 font-extrabold tracking-wide"
                  >
                    E 501 <span className="text-[10px] text-indigo-200 font-normal">(g/l)</span>
                  </th>
                )}
                {(selectedOption === 'all' || selectedOption === 't501') && (
                  <th
                    colSpan={2}
                    className="py-2.5 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-indigo-300 font-extrabold tracking-wide"
                  >
                    T 501 <span className="text-[10px] text-indigo-200 font-normal">(g/l)</span>
                  </th>
                )}

              </tr>
              {/* Row 2: Sub-columns */}
              <tr className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider text-center">
                {(selectedOption === 'all' || selectedOption === 'e501') && (
                  <>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      FNH₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      Na₂CO₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                  </>
                )}
                {(selectedOption === 'all' || selectedOption === 't501') && (
                  <>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      FNH₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                    <th className="py-2 px-3 border-r border-slate-700 w-36">
                      Na₂CO₃ <span className="text-[9px] text-slate-400 font-normal">(g/l)</span>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((reading, index) => {
                const rowKey = reading.id || `shift_${reading.shift}`;
                const rowEdits = editedFields[rowKey] || {};
                const slotKey = getShiftSlotKey(reading.id, reading.shift);
                const shiftDisabled = isShiftDisabled(slotKey);
                const shiftStatus = getShiftBadgeStatus(slotKey);

                return (
                  <tr
                    key={reading.id}
                    className="hover:bg-indigo-50/20 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-2.5 px-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Shift */}
                    <td className="py-2.5 px-3 text-center border-r border-slate-100 align-middle">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <span className="font-mono text-xs font-black text-slate-800 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-300">
                          {reading.shift === 'I' ? 'I SHIFT' : reading.shift === 'II' ? 'II SHIFT' : reading.shift === 'III' ? 'III SHIFT' : `SHIFT ${reading.shift}`}
                        </span>
                        <RecordStatusBadge status={shiftStatus} />
                      </div>
                    </td>

                    {/* E 501 Cells (Limits: FNH3 10–40 g/L, Na2CO3 2–10 g/L) */}
                    {(selectedOption === 'all' || selectedOption === 'e501') && (
                      <>
                        {/* E 501 FNH3 */}
                        {(() => {
                          const field = 'e501_fnh3';
                          const cellVal = reading[field];
                          const limit = SA_E501_LIMITS.fnh3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];
                          const isEdited = !!rowEdits[field];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isViewOnly || shiftDisabled}
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} E 501 FNH3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })()}

                        {/* E 501 Na2CO3 */}
                        {(() => {
                          const field = 'e501_na2co3';
                          const cellVal = reading[field];
                          const limit = SA_E501_LIMITS.na2co3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];
                          const isEdited = !!rowEdits[field];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isViewOnly || shiftDisabled}
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} E 501 Na2CO3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })()}
                      </>
                    )}

                    {/* T 501 Cells (Limits: FNH3 1–5 g/L, Na2CO3 20–60 g/L) */}
                    {(selectedOption === 'all' || selectedOption === 't501') && (
                      <>
                        {/* T 501 FNH3 */}
                        {(() => {
                          const field = 't501_fnh3';
                          const cellVal = reading[field];
                          const limit = SA_T501_LIMITS.fnh3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];
                          const isEdited = !!rowEdits[field];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isViewOnly || shiftDisabled}
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} T 501 FNH3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })()}

                        {/* T 501 Na2CO3 */}
                        {(() => {
                          const field = 't501_na2co3';
                          const cellVal = reading[field];
                          const limit = SA_T501_LIMITS.na2co3;
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;
                          const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                          const isFormatError = !!errors[`${reading.id}_${field}`];
                          const isEdited = !!rowEdits[field];

                          return (
                            <td className="py-2.5 px-3 border-r border-slate-100 align-top">
                              <div className="flex flex-col items-center justify-start min-h-[58px]">
                                <div className="relative w-full max-w-[110px]">
                                  <input
                                    id={`input-${reading.id}-${field}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isViewOnly || shiftDisabled}
                                    value={cellVal}
                                    onChange={(e) =>
                                      handleCellChange(reading.id, field, e.target.value)
                                    }
                                    placeholder="0.00"
                                    title={
                                      isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} g/L (Valid range: ${limit.formattedRange})`
                                        : `Valid range: ${limit.formattedRange}`
                                    }
                                    className={`w-full max-w-[110px] mx-auto text-center font-mono text-xs font-bold py-1.5 px-2 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                      isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200 shadow-xs'
                                        : isFormatError
                                        ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                        : hasValue && isNormal
                                        ? 'border-2 border-emerald-400/80 bg-emerald-50/40 text-emerald-950 font-bold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                                        : 'border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-800'
                                    }`}
                                    aria-label={`${reading.shift} T 501 Na2CO3`}
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

                                {isFormatError ? (
                                  <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                    <span>Invalid</span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-col items-center justify-center">
                                    {hasValue && isOutOfLimit && (
                                      <div
                                        id={`limit-badge-${reading.id}-${field}`}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs mb-0.5"
                                        title={`OUT OF LIMIT: ${cellVal} g/L (Valid range: ${limit.formattedRange})`}
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>OUT OF LIMIT</span>
                                      </div>
                                    )}
                                    {hasValue && isNormal && (
                                      <div
                                        id={`status-${reading.id}-${field}`}
                                        className="text-[9.5px] text-emerald-700 font-extrabold tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn mb-0.5"
                                        title={`NORMAL: within ${limit.formattedRange}`}
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>NORMAL</span>
                                      </div>
                                    )}
                                    <span
                                      id={`range-${reading.id}-${field}`}
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
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })()}
                      </>
                    )}


                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Table Summary Footer ── */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-600">
            {(selectedOption === 'all' || selectedOption === 'e501') && (
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-700">E 501 Avg:</span>
                <span className="font-mono text-slate-900 font-bold">
                  FNH₃: {stats.e501_fnh3_avg} g/l | Na₂CO₃: {stats.e501_na2co3_avg} g/l
                </span>
              </span>
            )}
            {selectedOption === 'all' && (
              <span className="hidden md:inline text-slate-300">|</span>
            )}
            {(selectedOption === 'all' || selectedOption === 't501') && (
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">T 501 Avg:</span>
                <span className="font-mono text-slate-900 font-bold">
                  FNH₃: {stats.t501_fnh3_avg} g/l | Na₂CO₃: {stats.t501_na2co3_avg} g/l
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[11px] text-slate-500 font-medium">
              One correction allowed after first save; saving the next shift locks the previous one.
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Shifts:
              </span>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-800 font-mono font-extrabold rounded-md border border-indigo-300">
                3 Fixed (I, II, III)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleUp">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Analysis Save</h3>
                  <p className="text-xs text-slate-500">SA Plant — E 501 / T 501 Analysis</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-600">
              <p>
                You are about to persist readings for <strong>{confirmData?.readings?.length || 0}</strong> active shift entries for today:
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-bold text-slate-800">{date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">E 501 Avg:</span>
                  <span className="font-bold text-indigo-700">FNH₃: {stats.e501_fnh3_avg} | Na₂CO₃: {stats.e501_na2co3_avg}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">T 501 Avg:</span>
                  <span className="font-bold text-indigo-700">FNH₃: {stats.t501_fnh3_avg} | Na₂CO₃: {stats.t501_na2co3_avg}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Operator:</span>
                  <span className="font-bold text-slate-800">{recipientEmail || ''}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Saving will securely store all rows to MongoDB and dispatch an official notification email with an Excel report.
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
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
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

export default E501T501AnalysisPage;
