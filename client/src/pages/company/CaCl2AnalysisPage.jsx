import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  Factory,
  Clock,
  Plus,
  Trash2,
  FlaskConical,
  Mail,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import {
  validateCellValue,
  ACL_CACL2_LIMITS,
} from '../../services/analysisValidation';

// Default initial readings matching laboratory reference (Frequency: Day)
const DEFAULT_READINGS = [
  {
    id: 'cacl2_1',
    sample: 'CaCl2 Solution',
    frequency: 'Day',
    time: '08:00',
    ph: '7.7',
    conc: '20',
    fnh3: '1000',
    cnh3: '500',
    ss: '60',
  },
];

const NUMERIC_FIELDS = ['ph', 'conc', 'fnh3', 'cnh3', 'ss'];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

// Helper for exact date in Asia/Kolkata timezone (YYYY-MM-DD)
const getTodayAsiaKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

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

const CaCl2AnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Date is locked strictly to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [readings, setReadings]                     = useState(DEFAULT_READINGS);
  const [originalData, setOriginalData]             = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [emailRetrying, setEmailRetrying]           = useState(false);
  const [saveSuccess, setSaveSuccess]               = useState(false);
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [lastSaved, setLastSaved]                   = useState(null);

  // Locking and Edit History States
  const [editCount, setEditCount]                   = useState(0);
  const [isLocked, setIsLocked]                     = useState(false);
  const [editedFields, setEditedFields]             = useState({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Fetch existing data when date loads or changes
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/cacl2-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail) {
          setRecipientEmail(response.data.assignedOperatorEmail);
        }
        if (response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient);
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

          if (record) {
            const fetchedReadings =
              record.readings ||
              record.data?.readings ||
              (Array.isArray(record.data) ? record.data : null) ||
              (Array.isArray(record) ? record : null);

            if (fetchedReadings && Array.isArray(fetchedReadings) && fetchedReadings.length > 0) {
              setReadings(fetchedReadings);
              setOriginalData(JSON.parse(JSON.stringify(fetchedReadings)));
            } else {
              setReadings(DEFAULT_READINGS);
              setOriginalData(null);
            }

            const recEditCount = record.editCount ?? record.data?.editCount ?? (record.isSaved ? 1 : 0);
            const recIsLocked = record.isLocked ?? record.data?.isLocked ?? (recEditCount >= 2);
            setEditCount(recEditCount);
            setIsLocked(recIsLocked);
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setReadings(DEFAULT_READINGS);
            setOriginalData(null);
            setEditCount(0);
            setIsLocked(false);
            setEditedFields({});
          }
        } else {
          setReadings(DEFAULT_READINGS);
          setOriginalData(null);
          setEditCount(0);
          setIsLocked(false);
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing CaCl2 data', err);
        setReadings(DEFAULT_READINGS);
        setOriginalData(null);
        setEditCount(0);
        setIsLocked(false);
        setEditedFields({});
      }
    };

    fetchExistingData();
    return () => {
      active = false;
    };
  }, [date]);

  // Can user edit this date's analysis?
  const canEdit = !isViewOnly && !isLocked && editCount < 2;

  // ── Handle cell change ──
  const handleCellChange = useCallback((id, field, value) => {
    if (!canEdit) return;
    if (NUMERIC_FIELDS.includes(field) && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Clear error for this field
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });

    setSaveSuccess(false);
    setSavePhase('idle');
  }, [canEdit]);

  // ── Add new reading row ──
  const handleAddRow = () => {
    if (!canEdit) {
      showToast?.('Analysis is locked. Cannot add sampling rows.', 'warning');
      return;
    }
    const nextId = `cacl2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        sample: `CaCl2 Sample #${prev.length + 1}`,
        frequency: 'Day',
        time: '08:00',
        ph: '',
        conc: '',
        fnh3: '',
        cnh3: '',
        ss: '',
      },
    ]);
    showToast?.('Added new sampling row for CaCl2.', 'info');
  };

  // ── Remove reading row ──
  const handleRemoveRow = (id) => {
    if (!canEdit) {
      showToast?.('Analysis is locked. Cannot delete sampling rows.', 'warning');
      return;
    }
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
    showToast?.('Row removed.', 'info');
  };

  // ── Reset ──
  const handleReset = () => {
    if (!canEdit) return;
    if (originalData) {
      setReadings(JSON.parse(JSON.stringify(originalData)));
    } else {
      setReadings(DEFAULT_READINGS);
    }
    setErrors({});
    setSaveSuccess(false);
    setSavePhase('idle');
    showToast?.('Values reset.', 'info');
  };

  // ── Validation ──
  const validateForm = () => {
    const newErrors = {};
    let isValid = true;

    readings.forEach((r, idx) => {
      NUMERIC_FIELDS.forEach((f) => {
        const val = r[f];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.id}_${f}`] = 'Invalid';
          isValid = false;
        }
      });
    });

    if (!isValid) {
      setErrors(newErrors);
    }
    return isValid;
  };

  // Check if readings differ from originalData
  const hasUnsavedChanges = useMemo(() => {
    if (!originalData) return true;
    if (originalData.length !== readings.length) return true;
    return readings.some((r, idx) => {
      const o = originalData[idx];
      if (!o) return true;
      if (r.sample !== o.sample || r.time !== o.time) return true;
      return NUMERIC_FIELDS.some((f) => {
        const nVal = r[f] !== '' && r[f] !== null && r[f] !== undefined ? String(r[f]) : '';
        const oVal = o[f] !== '' && o[f] !== null && o[f] !== undefined ? String(o[f]) : '';
        return nVal !== oVal;
      });
    });
  }, [readings, originalData]);

  // ── Save Trigger: Open Confirmation Modal ──
  const handleSaveClick = () => {
    if (!canEdit) {
      showToast?.('This analysis is locked and cannot be edited.', 'warning');
      return;
    }

    if (!validateForm()) {
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const isFinalEdit = editCount === 1;

    setConfirmData({
      date,
      readings,
      isFinalEdit,
    });
    setShowConfirmModal(true);
  };

  // ── Confirm Save Handler ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        plant: 'ACL',
        unit: 'CaCl2',
        frequency: 'Day',
        analysisType: 'CaCl2 Analysis',
        readings: readings.map((r) => ({
          ...r,
          ph: r.ph !== '' && r.ph !== null && r.ph !== undefined ? parseFloat(r.ph) : null,
          conc: r.conc !== '' && r.conc !== null && r.conc !== undefined ? parseFloat(r.conc) : null,
          fnh3: r.fnh3 !== '' && r.fnh3 !== null && r.fnh3 !== undefined ? parseFloat(r.fnh3) : null,
          cnh3: r.cnh3 !== '' && r.cnh3 !== null && r.cnh3 !== undefined ? parseFloat(r.cnh3) : null,
          ss: r.ss !== '' && r.ss !== null && r.ss !== undefined ? parseFloat(r.ss) : null,
        })),
        submittedBy: user?.name || 'Shift Chemist',
      };

      const response = await api.post('/api/cacl2-analysis', payload);

      if (response.data && response.data.success) {
        setSaveSuccess(true);
        setLastSaved(new Date().toLocaleTimeString());
        setOriginalData(JSON.parse(JSON.stringify(readings)));

        if (response.data.recordId) {
          setRecordId(response.data.recordId);
        }
        if (response.data.data) {
          const rec = response.data.data;
          setEditCount(rec.editCount || 1);
          setIsLocked(rec.isLocked || (rec.editCount >= 2));
          if (rec.editedFields) setEditedFields(rec.editedFields);
        }
        if (response.data.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient);
        }

        const emailRes = response.data?.emailNotification;
        const emailSent = response.data?.emailSent;
        const emailPending = response.data?.emailPending;
        const statusFromApi = response.data?.emailStatus;

        if (emailSent || statusFromApi === 'sent') {
          setSavePhase('completed');
          setEmailStatusDetail(emailRes?.response || 'Delivered to SMTP server ✓');
          showToast?.('Saved — Email Sent ✓', 'success');
        } else {
          setSavePhase('email_failed');
          setEmailStatusDetail(emailRes?.error || 'Email delivery failed');
          showToast?.('Data saved to database. Email delivery failed: ' + (emailRes?.error || 'Server error'), 'warning');
        }
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      console.error('[CaCl2Analysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Retry Email Dispatch ──
  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('Cannot retry email: Record ID is not available.', 'error');
      return;
    }
    if (emailRetrying) return;
    setEmailRetrying(true);
    try {
      const response = await api.post(`/api/cacl2-analysis/${recordId}/retry-email`);
      if (response.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Email sent successfully on retry.');
        showToast?.('Email resent successfully!', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response.data?.error || 'Email delivery failed on retry.');
        showToast?.('Email retry failed: ' + (response.data?.error || 'Rejected by server'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setSavePhase('email_failed');
      setEmailStatusDetail(msg);
      showToast?.('Retry Email Error: ' + msg, 'error');
    } finally {
      setEmailRetrying(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── TOP BREADCRUMB HEADER (ACL Theme) ── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Titles */}
          <div className="flex items-center gap-3">
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
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <FlaskConical className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-indigo-600 font-semibold">Cacl2</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-indigo-600" />
                  CACL2 ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                  FREQUENCY: DAY
                </span>
                {isLocked ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> LOCKED
                  </span>
                ) : editCount === 1 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                    FINAL EDIT ALLOWED
                  </span>
                ) : editCount === 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                    NEW
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap self-end sm:self-auto">
            {/* Integrated Locked Current-Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider leading-none">
                  DATE (TODAY ONLY)
                </span>
                <span className="text-xs font-black text-slate-800 leading-tight">
                  {formatDateDisplay(date)}
                </span>
              </div>
              <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-800 font-extrabold px-1.5 py-0.2 rounded border border-indigo-200 uppercase">
                Asia/Kolkata
              </span>
            </div>

            {lastSaved && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Saved at {lastSaved}
              </span>
            )}

            {canEdit && (
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
                id="btn-cacl2-save"
                saving={saving}
                isLocked={isLocked}
                savePhase={savePhase}
                saveSuccess={saveSuccess}
                onClick={handleSaveClick}
                disabled={!canEdit}
                defaultLabel={editCount === 0 ? 'Save Analysis Data' : 'Save Final Edit'}
                title="Save CaCl2 Analysis data"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banner for Email Dispatch State ── */}
      <SaveStatusBanner
        id="cacl2-status-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="CaCl2 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving || emailRetrying}
      />

      {/* ── MEASUREMENTS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                CaCl2 Parameters Table
              </h2>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md border border-indigo-200/60">
              Frequency: Day
            </span>
          </div>

          {canEdit && (
            <button
              onClick={handleAddRow}
              className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </button>
          )}
        </div>

        <div>
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-2 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-40 border-r border-slate-700">SAMPLE / STREAM</th>
                <th className="py-3 px-2 w-20 text-center border-r border-slate-700">TIME</th>

                {/* 1. pH */}
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">pH</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 7.7 ±1</div>
                </th>

                {/* 2. CONC */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">CONC</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Target: 20% ±5.0</div>
                </th>

                {/* 3. FNH3 */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">FNH₃</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">PPM (±50)</div>
                </th>

                {/* 4. CNH3 */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">CNH₃</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">PPM (±100)</div>
                </th>

                {/* 5. SS */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">SS</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">PPM (±10)</div>
                </th>

                <th className="py-3 px-2 w-12 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-indigo-50/30 transition-colors bg-white"
                  >
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* Sample Name */}
                    <td className="py-2.5 px-3 font-bold border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                        <input
                          type="text"
                          value={row.sample}
                          disabled={!canEdit}
                          onChange={(e) => handleCellChange(row.id, 'sample', e.target.value)}
                          className={`w-full font-bold text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition text-xs ${
                            !canEdit ? 'cursor-not-allowed opacity-80' : ''
                          }`}
                        />
                      </div>
                    </td>

                    {/* Time */}
                    <td className="py-2.5 px-2 text-center border-r border-slate-100">
                      <input
                        type="text"
                        value={row.time}
                        disabled={!canEdit}
                        onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                        placeholder="HH:mm"
                        className={`w-full text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded-lg py-1 px-1 text-slate-800 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 transition shadow-2xs ${
                          !canEdit ? 'bg-slate-50 cursor-not-allowed' : ''
                        }`}
                      />
                    </td>

                    {/* 1. pH: Reference 7.7, Tolerance ±1 -> Range 6.7 – 8.7 */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ph, ACL_CACL2_LIMITS.ph);
                        const hasVal = row.ph !== '' && row.ph !== null && row.ph !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;
                        const isEdited = editedFields[`${row.id}_ph`];

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-ph`}
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                value={row.ph}
                                onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                                placeholder="6.7 – 8.7"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ph} (Valid Range: 6.7 – 8.7)`
                                      : `NORMAL: ${row.ph} (Valid Range: 6.7 – 8.7)`
                                    : 'Valid Range: 6.7 – 8.7'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !canEdit
                                    ? 'bg-slate-50 cursor-not-allowed border-slate-200 text-slate-700'
                                    : errors[`${row.id}_ph`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 6.7 – 8.7"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Small EDITED badge */}
                            {isEdited && (
                              <span
                                id={`cacl2-badge-${row.id}-ph`}
                                className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8px] font-extrabold uppercase tracking-wider leading-none select-none"
                                title="Value modified after initial save"
                              >
                                EDITED
                              </span>
                            )}

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">6.7 – 8.7</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_ph`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_ph`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 2. CONC: Reference 20, Tolerance ±5.0 -> Range 15.0 – 25.0 % */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.conc, ACL_CACL2_LIMITS.conc);
                        const hasVal = row.conc !== '' && row.conc !== null && row.conc !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;
                        const isEdited = editedFields[`${row.id}_conc`];

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-conc`}
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                value={row.conc}
                                onChange={(e) => handleCellChange(row.id, 'conc', e.target.value)}
                                placeholder="15 – 25%"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.conc} (Valid Range: 15.0 – 25.0 %)`
                                      : `NORMAL: ${row.conc} (Valid Range: 15.0 – 25.0 %)`
                                    : 'Valid Range: 15.0 – 25.0 %'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !canEdit
                                    ? 'bg-slate-50 cursor-not-allowed border-slate-200 text-slate-700'
                                    : errors[`${row.id}_conc`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 15.0 – 25.0 %"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Small EDITED badge */}
                            {isEdited && (
                              <span
                                id={`cacl2-badge-${row.id}-conc`}
                                className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8px] font-extrabold uppercase tracking-wider leading-none select-none"
                                title="Value modified after initial save"
                              >
                                EDITED
                              </span>
                            )}

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">15 – 25%</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_conc`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_conc`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. FNH3: Reference 1000, Tolerance ±50 -> Range 950 – 1050 PPM */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.fnh3, ACL_CACL2_LIMITS.fnh3);
                        const hasVal = row.fnh3 !== '' && row.fnh3 !== null && row.fnh3 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;
                        const isEdited = editedFields[`${row.id}_fnh3`];

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-fnh3`}
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                value={row.fnh3}
                                onChange={(e) => handleCellChange(row.id, 'fnh3', e.target.value)}
                                placeholder="950 – 1050"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.fnh3} (Valid Range: 950 – 1050 PPM)`
                                      : `NORMAL: ${row.fnh3} (Valid Range: 950 – 1050 PPM)`
                                    : 'Valid Range: 950 – 1050 PPM'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !canEdit
                                    ? 'bg-slate-50 cursor-not-allowed border-slate-200 text-slate-700'
                                    : errors[`${row.id}_fnh3`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 950 – 1050 PPM"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Small EDITED badge */}
                            {isEdited && (
                              <span
                                id={`cacl2-badge-${row.id}-fnh3`}
                                className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8px] font-extrabold uppercase tracking-wider leading-none select-none"
                                title="Value modified after initial save"
                              >
                                EDITED
                              </span>
                            )}

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">950 – 1050 PPM</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_fnh3`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_fnh3`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 4. CNH3: Reference 500, Tolerance ±100 -> Range 400 – 600 PPM */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.cnh3, ACL_CACL2_LIMITS.cnh3);
                        const hasVal = row.cnh3 !== '' && row.cnh3 !== null && row.cnh3 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;
                        const isEdited = editedFields[`${row.id}_cnh3`];

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-cnh3`}
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                value={row.cnh3}
                                onChange={(e) => handleCellChange(row.id, 'cnh3', e.target.value)}
                                placeholder="400 – 600"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.cnh3} (Valid Range: 400 – 600 PPM)`
                                      : `NORMAL: ${row.cnh3} (Valid Range: 400 – 600 PPM)`
                                    : 'Valid Range: 400 – 600 PPM'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !canEdit
                                    ? 'bg-slate-50 cursor-not-allowed border-slate-200 text-slate-700'
                                    : errors[`${row.id}_cnh3`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 400 – 600 PPM"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Small EDITED badge */}
                            {isEdited && (
                              <span
                                id={`cacl2-badge-${row.id}-cnh3`}
                                className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8px] font-extrabold uppercase tracking-wider leading-none select-none"
                                title="Value modified after initial save"
                              >
                                EDITED
                              </span>
                            )}

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">400 – 600 PPM</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_cnh3`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_cnh3`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. SS: Reference 60, Tolerance ±10 -> Range 50 – 70 PPM */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ss, ACL_CACL2_LIMITS.ss);
                        const hasVal = row.ss !== '' && row.ss !== null && row.ss !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;
                        const isEdited = editedFields[`${row.id}_ss`];

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`cacl2-input-${row.id}-ss`}
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                value={row.ss}
                                onChange={(e) => handleCellChange(row.id, 'ss', e.target.value)}
                                placeholder="50 – 70"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ss} (Valid Range: 50 – 70 PPM)`
                                      : `NORMAL: ${row.ss} (Valid Range: 50 – 70 PPM)`
                                    : 'Valid Range: 50 – 70 PPM'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !canEdit
                                    ? 'bg-slate-50 cursor-not-allowed border-slate-200 text-slate-700'
                                    : errors[`${row.id}_ss`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100'
                                }`}
                              />
                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 50 – 70 PPM"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>

                            {/* Small EDITED badge */}
                            {isEdited && (
                              <span
                                id={`cacl2-badge-${row.id}-ss`}
                                className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8px] font-extrabold uppercase tracking-wider leading-none select-none"
                                title="Value modified after initial save"
                              >
                                EDITED
                              </span>
                            )}

                            {/* Range display near input & dynamic status centered */}
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">50 – 70 PPM</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            {errors[`${row.id}_ss`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_ss`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* ACTION */}
                    <td className="py-2.5 px-2 text-center align-top">
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={!canEdit || readings.length <= 1}
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

        {/* Table Footer */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={handleAddRow}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                Add Another Sampling Row
              </button>
            )}
            <span className="text-slate-500 font-medium">
              {readings.length} {readings.length === 1 ? 'row' : 'rows'} recorded for CaCl2
            </span>
          </div>

          <div className="text-slate-500 text-xs">
            Units: <span className="font-semibold text-slate-700">CONC in % | FNH₃, CNH₃, SS in PPM</span>
          </div>
        </div>
      </div>

      {/* ── Save Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FlaskConical className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Confirm CaCl2 Analysis Submission
                </h3>
              </div>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded font-mono font-bold">
                {formatDateDisplay(confirmData.date)}
              </span>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs text-slate-600">
              <p className="text-slate-700 font-medium leading-relaxed">
                Are you sure you want to save measurements for{' '}
                <strong className="text-indigo-700">ACL Plant → CaCl2 Analysis</strong> on{' '}
                <strong className="text-slate-900">{formatDateDisplay(confirmData.date)}</strong>?
              </p>

              {confirmData.isFinalEdit && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium text-[11px]">
                    <strong>Final Edit Notice:</strong> This is the final permitted edit for today's CaCl2 Analysis. After this save, all sampling rows for today ({formatDateDisplay(confirmData.date)}) will be permanently locked.
                  </span>
                </div>
              )}

              {/* Snapshot of sampling rows */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Sampling Rows to be Persisted ({confirmData.readings.length}):
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {confirmData.readings.map((r, i) => (
                    <div key={r.id || i} className="bg-white p-2 rounded border border-slate-200 flex flex-col gap-1">
                      <div className="flex items-center justify-between font-bold text-slate-800 font-sans">
                        <span>#{i + 1} {r.sample || 'CaCl2 Solution'}</span>
                        <span className="text-slate-500 font-mono text-[10px]">⏰ {r.time || '—'}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-[10px] text-center text-slate-700">
                        <div className="bg-slate-50 rounded p-0.5">pH: <strong>{r.ph || '—'}</strong></div>
                        <div className="bg-slate-50 rounded p-0.5">Conc: <strong>{r.conc || '—'}%</strong></div>
                        <div className="bg-slate-50 rounded p-0.5">FNH3: <strong>{r.fnh3 || '—'}</strong></div>
                        <div className="bg-slate-50 rounded p-0.5">CNH3: <strong>{r.cnh3 || '—'}</strong></div>
                        <div className="bg-slate-50 rounded p-0.5">SS: <strong>{r.ss || '—'}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {recipientEmail && (
                <div className="text-[11px] text-slate-500">
                  📧 An email notification will be dispatched to registered plant operator:{' '}
                  <strong className="text-slate-800">{recipientEmail}</strong>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {saving && (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaCl2AnalysisPage;
