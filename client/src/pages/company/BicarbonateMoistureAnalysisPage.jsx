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
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Droplets,
  Layers,
  TrendingUp,
  RefreshCw,
  Mail,
} from 'lucide-react';

// ─── SA Plant Bi Carbonate Moisture Parameters & Validation Limits ───────────
// Plant: SA Plant ONLY (Bi Carbonate Section)
// Parameter: Moisture
// Options: A, B, C (Separate options under M 404)
// Frequency: Once in 4 Hours
//
// Moisture:
// - Reference Value: 20%
// - Tolerance: ±2.0%
// - Valid Range: 18% – 22%
// Applied independently to Options A, B, and C
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

// Default initial readings matching the 5 required row types
const DEFAULT_READINGS = [
  {
    id: '1',
    shift: 'I SHIFT',
    time: '07:00',
    m404_a: '',
    m404_b: '',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
  {
    id: '2',
    shift: 'II SHIFT',
    time: '15:00',
    m404_a: '',
    m404_b: '',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
  {
    id: '3',
    shift: 'III SHIFT',
    time: '23:00',
    m404_a: '',
    m404_b: '',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
  {
    id: '4',
    shift: 'ADDL SAPL1',
    time: '11:00',
    m404_a: '',
    m404_b: '',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
  {
    id: '5',
    shift: 'SAMPLE',
    time: '',
    m404_a: '',
    m404_b: '',
    m404_c: '',
    m405_outlet: '',
    sb_turb1: '',
    sb_turb2: '',
  },
];

const NUMERIC_FIELDS = [
  'm404_a',
  'm404_b',
  'm404_c',
  'm405_outlet',
  'sb_turb1',
  'sb_turb2',
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

const BicarbonateMoistureAnalysisPage = ({ plantId = 'sa' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Strict Current-Date Restriction) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [readings, setReadings]                     = useState(DEFAULT_READINGS);
  const [originalReadings, setOriginalReadings]     = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
  const [lastSaved, setLastSaved]                   = useState(null);

  // Email & Persistence states
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving' | 'email_pending' | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [isPermanentMailError, setIsPermanentMailError] = useState(false);
  const [editedFields, setEditedFields]             = useState({});
  const [retryingEmail, setRetryingEmail]           = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // Fetch existing data when mounted or date changes
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

            setEditedFields(rec.editedFields || response.data.editedFields || {});
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
  }, [isViewOnly]);

  // ── Add new reading row ──
  const handleAddRow = () => {
    if (isViewOnly) return;
    const nextId = String(Date.now());
    setReadings((prev) => [
      ...prev,
      {
        id: nextId,
        shift: `EXTRA #${prev.length + 1}`,
        time: '',
        m404_a: '',
        m404_b: '',
        m404_c: '',
        m405_outlet: '',
        sb_turb1: '',
        sb_turb2: '',
      },
    ]);
  };

  // ── Remove reading row ──
  const handleRemoveRow = (id) => {
    if (isViewOnly) return;
    if (readings.length <= 1) {
      showToast?.('At least one reading row is required.', 'warning');
      return;
    }
    setReadings((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Reset ──
  const handleReset = () => {
    if (originalReadings) {
      setReadings(JSON.parse(JSON.stringify(originalReadings)));
      showToast?.('Restored readings to last persisted state.', 'info');
    } else {
      setReadings(DEFAULT_READINGS);
      showToast?.('Values reset to defaults.', 'info');
    }
    setErrors({});
  };

  // ── Summary Calculations ──
  const stats = useMemo(() => {
    const m404Vals = [];
    const turbVals = [];

    readings.forEach((r) => {
      ['m404_a', 'm404_b', 'm404_c'].forEach((f) => {
        const n = parseFloat(r[f]);
        if (!isNaN(n)) m404Vals.push(n);
      });
      ['sb_turb1', 'sb_turb2'].forEach((f) => {
        const n = parseFloat(r[f]);
        if (!isNaN(n)) turbVals.push(n);
      });
    });

    const m404Avg =
      m404Vals.length > 0
        ? (m404Vals.reduce((a, b) => a + b, 0) / m404Vals.length).toFixed(2)
        : '—';

    const turbAvg =
      turbVals.length > 0
        ? (turbVals.reduce((a, b) => a + b, 0) / turbVals.length).toFixed(1)
        : '—';

    return {
      m404Count: m404Vals.length,
      m404Avg,
      turbCount: turbVals.length,
      turbAvg,
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

    const filledRows = readings.filter(r =>
      NUMERIC_FIELDS.some(f => r[f] !== '' && r[f] !== null && r[f] !== undefined)
    );

    if (filledRows.length === 0) {
      showToast?.('Please enter at least one measurement value before saving.', 'warning');
      return;
    }

    setConfirmData({
      date,
      readings: filledRows,
      totalCount: readings.length,
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
        unit: 'Bicarbonate Moisture',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/bicarbonate-moisture', payload);

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save Bicarbonate Moisture Analysis.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setOriginalReadings(JSON.parse(JSON.stringify(readings)));
      setLastSaved(new Date().toLocaleTimeString());

      const returnedDoc = res.data?.data || res.data?.analysis || {};
      const newEdited = res.data?.editedFields || returnedDoc.editedFields || {};
      const newRecordId = res.data?.recordId || returnedDoc._id || returnedDoc.id;

      setEditedFields(newEdited);
      if (newRecordId) setRecordId(newRecordId);

      const deliveryStatus = res.data?.emailDeliveryStatus || res.data?.emailStatus;
      const recipient = res.data?.emailRecipient;
      if (recipient) setRecipientEmail(recipient);

      if (deliveryStatus === 'sent') {
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
        showToast?.('Analysis Saved successfully!', 'success');
      }
    } catch (err) {
      console.error('Save error:', err);
      const errMsg = err.response?.data?.message || err.message || 'Error occurred while saving.';
      showToast?.(errMsg, 'error');
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
      const res = await api.post(`/api/bicarbonate-moisture/${recordId}/retry-email`);
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
            <button
              onClick={handleSaveClick}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Moisture Data</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Status Banner (Email / Save Status) ── */}
      {savePhase === 'completed' && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Saved — Email Sent</strong>: {emailStatusDetail || `Notification sent to registered SA Plant Operator (${recipientEmail || 'operator'}).`}
            </span>
          </div>
        </div>
      )}

      {savePhase === 'email_failed' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span><strong>Saved — Email Failed</strong>: Database record persisted. {emailStatusDetail}</span>
              {recipientEmail && <span className="block text-[11px] text-amber-700 font-normal">Target recipient: {recipientEmail}</span>}
            </div>
          </div>
          <button
            onClick={handleRetryEmail}
            disabled={retryingEmail || isPermanentMailError}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs shrink-0 ${
              isPermanentMailError
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
            }`}
            title={isPermanentMailError ? 'Permanent recipient rejection. Update recipient in User Management.' : 'Retry sending notification email'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retryingEmail ? 'animate-spin' : ''}`} />
            <span>{retryingEmail ? 'Retrying...' : 'Retry Email'}</span>
          </button>
        </div>
      )}

      {/* ── MAIN ANALYSIS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table top title banner with Date Locked to Today */}
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

            {/* Date Input inside Table Header - Locked to Today */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="moisture-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="moisture-date-input"
                  type="date"
                  value={date}
                  readOnly
                  disabled
                  className="pl-2.5 pr-2 py-1 text-xs font-bold border border-slate-300 rounded-lg text-slate-800 bg-slate-100 cursor-not-allowed select-none"
                  title="Date is automatically locked to today (Asia/Kolkata timezone)"
                />
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-cyan-800 font-bold bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md">
                <Calendar className="w-3 h-3 text-cyan-600" />
                {formatDateDisplay(date)} (Today)
              </span>
            </div>
          </div>

          {!isViewOnly && (
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100/80 border border-cyan-200 px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Slot
            </button>
          )}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Row 1: Group Headers */}
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-10 text-center border-r border-b border-slate-800"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-4 w-32 border-r border-b border-slate-800"
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Shift / Sample</span>
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 w-28 border-r border-b border-slate-800"
                >
                  <div className="flex items-center gap-1.5">
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
                  className="py-2 px-3 text-center border-r border-b border-slate-800 bg-slate-800/90 text-cyan-300 font-extrabold"
                >
                  SB
                </th>
                {!isViewOnly && (
                  <th
                    rowSpan={2}
                    className="py-3 px-3 w-14 text-center border-b border-slate-800"
                  >
                    Action
                  </th>
                )}
              </tr>
              {/* Row 2: Sub-columns */}
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
                <th className="py-2 px-3 border-r border-slate-700 w-24">TURB</th>
                <th className="py-2 px-3 border-r border-slate-700 w-24">TURB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((reading, index) => {
                const rowKey = reading.id || `shift_${reading.shift}`;
                const rowEdits = editedFields[rowKey] || {};

                return (
                  <tr
                    key={reading.id}
                    className="hover:bg-cyan-50/20 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-2 px-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Shift Label / Input */}
                    <td className="py-2 px-3 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={reading.shift}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(reading.id, 'shift', e.target.value)
                          }
                          placeholder="Shift name"
                          className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition disabled:bg-slate-100"
                        />
                        {rowEdits.shift && (
                          <span
                            className="absolute -top-2 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs pointer-events-none"
                            title="Field previously edited"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Time Input */}
                    <td className="py-2 px-3 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={reading.time}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(reading.id, 'time', e.target.value)
                          }
                          placeholder="HH:MM"
                          className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition disabled:bg-slate-100"
                        />
                        {rowEdits.time && (
                          <span
                            className="absolute -top-2 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded shadow-2xs pointer-events-none"
                            title="Field previously edited"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* M 404 A */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top">
                      {(() => {
                        const cellVal = reading.m404_a;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const limit = getCellLimit('sa', 'bicarbonate-moisture', reading.shift, 'm404_a') || BICARBONATE_MOISTURE_LIMITS.m404_a;
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const isFormatError = !!errors[`${reading.id}_m404_a`];
                        const isEdited = !!rowEdits.m404_a;

                        return (
                          <div className="flex flex-col items-center justify-start min-h-[58px] min-w-[92px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`moisture-input-${reading.id}-a`}
                                type="text"
                                inputMode="decimal"
                                disabled={isViewOnly}
                                value={cellVal}
                                onChange={(e) =>
                                  handleCellChange(reading.id, 'm404_a', e.target.value)
                                }
                                placeholder="—"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : 'Option A'
                                }
                                className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border-2 transition focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-cyan-500 bg-cyan-50/50 text-cyan-900 font-extrabold focus:ring-2 focus:ring-cyan-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                                }`}
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

                            {/* Error / Validation Status & Range */}
                            {isFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`moisture-status-${reading.id}-a`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}
                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`moisture-status-${reading.id}-a`}
                                    className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}
                                <span
                                  id={`moisture-range-${reading.id}-a`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue
                                      ? 'text-slate-600 font-bold'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {limit?.formattedRange || '18% – 22%'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* M 404 B */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top">
                      {(() => {
                        const cellVal = reading.m404_b;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const limit = getCellLimit('sa', 'bicarbonate-moisture', reading.shift, 'm404_b') || BICARBONATE_MOISTURE_LIMITS.m404_b;
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const isFormatError = !!errors[`${reading.id}_m404_b`];
                        const isEdited = !!rowEdits.m404_b;

                        return (
                          <div className="flex flex-col items-center justify-start min-h-[58px] min-w-[92px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`moisture-input-${reading.id}-b`}
                                type="text"
                                inputMode="decimal"
                                disabled={isViewOnly}
                                value={cellVal}
                                onChange={(e) =>
                                  handleCellChange(reading.id, 'm404_b', e.target.value)
                                }
                                placeholder="—"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : 'Option B'
                                }
                                className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border-2 transition focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-cyan-500 bg-cyan-50/50 text-cyan-900 font-extrabold focus:ring-2 focus:ring-cyan-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                                }`}
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

                            {/* Error / Validation Status & Range */}
                            {isFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`moisture-status-${reading.id}-b`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}
                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`moisture-status-${reading.id}-b`}
                                    className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}
                                <span
                                  id={`moisture-range-${reading.id}-b`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue
                                      ? 'text-slate-600 font-bold'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {limit?.formattedRange || '18% – 22%'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* M 404 C */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top">
                      {(() => {
                        const cellVal = reading.m404_c;
                        const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                        const limit = getCellLimit('sa', 'bicarbonate-moisture', reading.shift, 'm404_c') || BICARBONATE_MOISTURE_LIMITS.m404_c;
                        const validation = validateCellValue(cellVal, limit);
                        const isOutOfLimit = validation.isOutOfLimit;
                        const isNormal = validation.isNormal;
                        const isFormatError = !!errors[`${reading.id}_m404_c`];
                        const isEdited = !!rowEdits.m404_c;

                        return (
                          <div className="flex flex-col items-center justify-start min-h-[58px] min-w-[92px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`moisture-input-${reading.id}-c`}
                                type="text"
                                inputMode="decimal"
                                disabled={isViewOnly}
                                value={cellVal}
                                onChange={(e) =>
                                  handleCellChange(reading.id, 'm404_c', e.target.value)
                                }
                                placeholder="—"
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `NORMAL: ${cellVal}% (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : 'Option C'
                                }
                                className={`w-full text-center font-mono text-xs font-bold py-1.5 px-2 rounded-md border-2 transition focus:outline-none ${
                                  isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue && isNormal && limit
                                    ? 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200'
                                    : hasValue
                                    ? 'border-2 border-cyan-500 bg-cyan-50/50 text-cyan-900 font-extrabold focus:ring-2 focus:ring-cyan-200'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                                }`}
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

                            {/* Error / Validation Status & Range */}
                            {isFormatError ? (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>Invalid</span>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-col items-center justify-center">
                                {hasValue && isNormal && limit && (
                                  <span
                                    id={`moisture-status-${reading.id}-c`}
                                    className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                    title={`NORMAL: within ${limit.formattedRange}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>NORMAL</span>
                                  </span>
                                )}
                                {hasValue && isOutOfLimit && (
                                  <span
                                    id={`moisture-status-${reading.id}-c`}
                                    className="px-1 py-0.2 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[9.5px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                    title={`OUT OF LIMIT: ${cellVal}% (Allowed: ${limit.formattedRange})`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                    <span>OUT OF LIMIT</span>
                                  </span>
                                )}
                                <span
                                  id={`moisture-range-${reading.id}-c`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? 'text-rose-700 font-bold'
                                      : hasValue
                                      ? 'text-slate-600 font-bold'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {limit?.formattedRange || '18% – 22%'}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* M 405 OUTLET */}
                    <td className="py-2 px-2 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={reading.m405_outlet}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(
                              reading.id,
                              'm405_outlet',
                              e.target.value
                            )
                          }
                          placeholder="—"
                          className={`w-full text-center font-mono text-xs font-bold py-1 px-2 rounded-md border transition ${
                            errors[`${reading.id}_m405_outlet`]
                              ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                              : reading.m405_outlet !== ''
                              ? 'border-cyan-300 bg-cyan-50/50 text-cyan-900 font-extrabold focus:bg-white'
                              : 'border-slate-200 bg-white text-slate-700'
                          } focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-100`}
                        />
                        {rowEdits.m405_outlet && (
                          <span
                            className="absolute -top-2 -right-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                            title="Field previously edited"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SB TURB 1 */}
                    <td className="py-2 px-2 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={reading.sb_turb1}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(
                              reading.id,
                              'sb_turb1',
                              e.target.value
                            )
                          }
                          placeholder="—"
                          className={`w-full text-center font-mono text-xs font-bold py-1 px-2 rounded-md border transition ${
                            errors[`${reading.id}_sb_turb1`]
                              ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                              : reading.sb_turb1 !== ''
                              ? 'border-cyan-300 bg-cyan-50/50 text-cyan-900 font-extrabold focus:bg-white'
                              : 'border-slate-200 bg-white text-slate-700'
                          } focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-100`}
                        />
                        {rowEdits.sb_turb1 && (
                          <span
                            className="absolute -top-2 -right-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                            title="Field previously edited"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SB TURB 2 */}
                    <td className="py-2 px-2 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={reading.sb_turb2}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(
                              reading.id,
                              'sb_turb2',
                              e.target.value
                            )
                          }
                          placeholder="—"
                          className={`w-full text-center font-mono text-xs font-bold py-1 px-2 rounded-md border transition ${
                            errors[`${reading.id}_sb_turb2`]
                              ? 'border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                              : reading.sb_turb2 !== ''
                              ? 'border-cyan-300 bg-cyan-50/50 text-cyan-900 font-extrabold focus:bg-white'
                              : 'border-slate-200 bg-white text-slate-700'
                          } focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-100`}
                        />
                        {rowEdits.sb_turb2 && (
                          <span
                            className="absolute -top-2 -right-1 bg-amber-500 text-white text-[8.5px] font-black px-1 rounded shadow-2xs pointer-events-none"
                            title="Field previously edited"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Delete Row Button */}
                    {!isViewOnly && (
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => handleRemoveRow(reading.id)}
                          disabled={readings.length <= 1}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
                          title="Delete slot"
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

        {/* ── Table Summary Footer ── */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-cyan-600" />
              <span className="font-medium">M 404 Avg Moisture:</span>{' '}
              <strong className="text-slate-900 font-mono">
                {stats.m404Avg !== '—' ? `${stats.m404Avg} %` : '—'}
              </strong>
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium">SB Avg Turb:</span>{' '}
              <strong className="text-slate-900 font-mono">
                {stats.turbAvg !== '—' ? stats.turbAvg : '—'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Active Shift Entries:
            </span>
            <span className="px-3 py-1 bg-cyan-100 text-cyan-800 font-mono font-extrabold rounded-md border border-cyan-300">
              {readings.length} Rows
            </span>
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleUp">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-cyan-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-100 text-cyan-700 rounded-lg">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Analysis Save</h3>
                  <p className="text-xs text-slate-500">SA Plant — Bicarbonate Moisture Analysis</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-600">
              <p>
                You are about to persist readings for <strong>{confirmData?.readings?.length || 0}</strong> active entries for today:
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-bold text-slate-800">{date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">M 404 Avg Moisture:</span>
                  <span className="font-bold text-cyan-700">{stats.m404Avg !== '—' ? `${stats.m404Avg}%` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SB Avg Turbidity:</span>
                  <span className="font-bold text-slate-800">{stats.turbAvg !== '—' ? stats.turbAvg : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Operator:</span>
                  <span className="font-bold text-slate-800">{recipientEmail || 'sa_operator@tfl.com'}</span>
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
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
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

export default BicarbonateMoistureAnalysisPage;
