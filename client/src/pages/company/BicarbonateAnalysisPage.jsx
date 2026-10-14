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
  FlaskConical,
  Filter as FilterIcon,
  TrendingUp,
  RefreshCw,
  Mail,
} from 'lucide-react';

// Default initial readings matching the standard 12 time slots
const DEFAULT_READINGS = [
  { id: '1', time: '06:30', filter: 'F-1', naclNa2co3: '' },
  { id: '2', time: '08:30', filter: 'F-1', naclNa2co3: '' },
  { id: '3', time: '10:30', filter: '', naclNa2co3: '' },
  { id: '4', time: '12:30', filter: 'F-2', naclNa2co3: '' },
  { id: '5', time: '14:30', filter: 'F-2', naclNa2co3: '' },
  { id: '6', time: '16:30', filter: 'F-3', naclNa2co3: '' },
  { id: '7', time: '18:30', filter: 'F-3', naclNa2co3: '' },
  { id: '8', time: '20:30', filter: 'F-4', naclNa2co3: '' },
  { id: '9', time: '22:30', filter: 'F-4', naclNa2co3: '' },
  { id: '10', time: '00:30', filter: 'F-5', naclNa2co3: '' },
  { id: '11', time: '02:30', filter: 'F-5', naclNa2co3: '' },
  { id: '12', time: '04:30', filter: '', naclNa2co3: '' },
];

const FILTER_OPTIONS = [
  { value: '', label: 'Select Filter' },
  { value: 'F-1', label: 'F-1 (Filter 1)' },
  { value: 'F-2', label: 'F-2 (Filter 2)' },
  { value: 'F-3', label: 'F-3 (Filter 3)' },
  { value: 'F-4', label: 'F-4 (Filter 4)' },
  { value: 'F-5', label: 'F-5 (Filter 5)' },
  { value: 'F-6', label: 'F-6 (Filter 6)' },
  { value: 'F-7', label: 'F-7 (Filter 7)' },
  { value: 'F-8', label: 'F-8 (Filter 8)' },
  { value: 'All', label: 'All Filters' },
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

const BicarbonateAnalysisPage = ({ plantId = 'sa' }) => {
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
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
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
        const response = await api.get(`/bicarbonate-analysis?date=${date}`);
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
        console.warn('Could not fetch existing Bi Carbonate data', err);
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
    if (field === 'naclNa2co3' && !isValidDecimal(value)) return;

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
        time: '06:00',
        filter: '',
        naclNa2co3: '',
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
    const validValues = readings
      .map((r) => parseFloat(r.naclNa2co3))
      .filter((v) => !isNaN(v));

    if (validValues.length === 0) {
      return { count: 0, avg: '—', min: '—', max: '—' };
    }

    const sum = validValues.reduce((acc, curr) => acc + curr, 0);
    const avg = (sum / validValues.length).toFixed(2);
    const min = Math.min(...validValues).toFixed(2);
    const max = Math.max(...validValues).toFixed(2);

    return {
      count: validValues.length,
      avg,
      min,
      max,
    };
  }, [readings]);

  // ── Pre-Save Prompt & Validation ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    readings.forEach((r) => {
      if (r.naclNa2co3 !== '' && isNaN(Number(r.naclNa2co3))) {
        newErrors[`${r.id}_naclNa2co3`] = 'Invalid';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const filledRows = readings.filter(r => r.naclNa2co3 !== '' || r.filter !== '');
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
        unit: 'Bi carbonate',
        readings,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/api/bicarbonate-analysis', payload);

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save Bi Carbonate Analysis.', 'error');
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
        setEmailStatusDetail(`Notification email delivered successfully to ${recipient || 'SA Plant operator'}.`);
        showToast?.(`Bi Carbonate Analysis saved & notification sent to ${recipient || 'operator'}!`, 'success');
      } else if (deliveryStatus === 'failed') {
        setSavePhase('email_failed');
        const smtpErr = res.data?.emailError || res.data?.message || 'SMTP delivery rejected';
        if (smtpErr.toLowerCase().includes('550') || smtpErr.toLowerCase().includes('access denied')) {
          setIsPermanentMailError(true);
        }
        setEmailStatusDetail(`Database save succeeded. Email failed: ${smtpErr}`);
        showToast?.('Data saved, but notification email delivery failed.', 'warning');
      } else {
        setSavePhase('idle');
        setEmailStatusDetail('Saved — Email notification queued.');
        showToast?.('Bi Carbonate Analysis saved successfully!', 'success');
      }
    } catch (err) {
      console.error('[Bi Carbonate Save] Error:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to save Bi Carbonate Analysis.';
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
      const response = await api.post(`/bicarbonate-analysis/${recordId}/retry-email`);
      if (response.data && response.data.emailSent) {
        setSavePhase('completed');
        setIsPermanentMailError(false);
        setEmailStatusDetail(`Notification email delivered successfully to ${response.data.emailRecipient || recipientEmail}.`);
        showToast?.(`Notification email delivered to ${response.data.emailRecipient || recipientEmail}!`, 'success');
      } else {
        setSavePhase('email_failed');
        const errDetail = response.data?.emailError || response.data?.message || 'SMTP delivery failed';
        if (errDetail.toLowerCase().includes('550') || errDetail.toLowerCase().includes('access denied')) {
          setIsPermanentMailError(true);
        }
        setEmailStatusDetail(`Retry failed: ${errDetail}`);
        showToast?.(`Email retry failed: ${errDetail}`, 'error');
      }
    } catch (err) {
      console.error('[Bi Carbonate Retry Email] Error:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to retry email delivery.';
      setEmailStatusDetail(`Retry failed: ${msg}`);
      showToast?.(msg, 'error');
    } finally {
      setRetryingEmail(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── TOP HEADER BAR (TK 203 Clean Theme) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
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
              <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60">
                Bi Carbonate
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <FlaskConical className="w-5 h-5 text-teal-600" />
              BI CARBONATE NaCl/Na₂CO₃ ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
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
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly && (
            <button
              onClick={handleSaveClick}
              disabled={saving}
              className={`px-4 py-1.5 rounded-lg text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer ${
                savePhase === 'completed'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : savePhase === 'email_failed'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : savePhase === 'completed' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : savePhase === 'email_failed' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Saved (Email Failed)</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Bi Carbonate Data</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Status Banners (Email Sent / Pending / Failed) ── */}
      {savePhase === 'completed' && (
        <div
          id="bicarb-success-banner"
          className="flex items-center gap-2.5 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-lg shadow-2xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="text-xs text-emerald-800 font-medium">
            <span className="font-bold">Saved — Email Sent:</span> {emailStatusDetail || 'Bi Carbonate Analysis recorded and email sent.'}
          </div>
          <button
            onClick={() => setSavePhase('idle')}
            className="ml-auto text-emerald-500 hover:text-emerald-700 text-sm leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {savePhase === 'email_failed' && (
        <div
          id="bicarb-failed-banner"
          className="flex items-center gap-2.5 px-3.5 py-2 bg-amber-50 border border-amber-300 rounded-lg shadow-2xs animate-fadeIn justify-between flex-wrap"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="text-xs text-amber-900 font-medium">
              <span className="font-bold">Saved — Email Failed:</span> {emailStatusDetail}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {!isPermanentMailError && (
              <button
                onClick={handleRetryEmail}
                disabled={retryingEmail}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-400 rounded-md transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${retryingEmail ? 'animate-spin' : ''}`} />
                <span>{retryingEmail ? 'Retrying...' : 'Retry Email'}</span>
              </button>
            )}
            <button
              onClick={() => setSavePhase('idle')}
              className="text-amber-600 hover:text-amber-800 text-sm leading-none cursor-pointer"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Summary KPI Tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Readings</div>
          <div className="text-xl font-black text-slate-800 mt-1">{stats.count}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Average (%)</div>
          <div className="text-xl font-black text-teal-600 mt-1">{stats.avg}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Min Value (%)</div>
          <div className="text-xl font-black text-slate-700 mt-1">{stats.min}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Max Value (%)</div>
          <div className="text-xl font-black text-slate-700 mt-1">{stats.max}</div>
        </div>
      </div>

      {/* ── MAIN ANALYSIS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table top title banner with Integrated Strict Date Selector */}
        <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                BI CARBONATE NaCl/Na₂CO₃ Readings
              </span>
            </div>

            {/* Strict Current Date Display (Asia/Kolkata) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <span>Date:</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-teal-900 bg-teal-50/80 border border-teal-200 rounded-lg">
                <Calendar className="w-3.5 h-3.5 text-teal-600" />
                <span>{formatDateDisplay(date)}</span>
                <span className="text-[9.5px] font-semibold text-teal-700 bg-teal-100/80 px-1 py-0.2 rounded">
                  Today (Asia/Kolkata)
                </span>
              </span>
            </div>
          </div>

          {!isViewOnly && (
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100/80 border border-teal-200 px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Time Slot
            </button>
          )}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center border-r border-slate-800">
                  #
                </th>
                <th className="py-3 px-4 w-36 border-r border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />
                    <span>Time</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-48 border-r border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <FilterIcon className="w-3.5 h-3.5 text-teal-400" />
                    <span>Filter</span>
                  </div>
                </th>
                <th className="py-3 px-4 text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-teal-400" />
                    <span>NaCl / Na₂CO₃ (%)</span>
                  </div>
                </th>
                {!isViewOnly && (
                  <th className="py-3 px-4 w-20 text-center">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((reading, index) => {
                const hasError = errors[`${reading.id}_naclNa2co3`];
                const rowKey = reading.id || `time_${reading.time}`;
                const isValEdited = Boolean(editedFields[rowKey]?.naclNa2co3);
                const isFilterEdited = Boolean(editedFields[rowKey]?.filter);

                return (
                  <tr
                    key={reading.id}
                    className="hover:bg-teal-50/20 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-2.5 px-4 text-center font-bold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Time Input */}
                    <td className="py-2.5 px-4 border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          value={reading.time}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(reading.id, 'time', e.target.value)
                          }
                          placeholder="HH:MM"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition disabled:opacity-75"
                        />
                      </div>
                    </td>

                    {/* Filter Selector */}
                    <td className="py-2.5 px-4 border-r border-slate-100">
                      <div className="relative">
                        <select
                          value={reading.filter}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(reading.id, 'filter', e.target.value)
                          }
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition disabled:opacity-75"
                        >
                          {FILTER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {isFilterEdited && (
                          <span
                            className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[7px] font-black px-1 rounded shadow-2xs pointer-events-none uppercase"
                            title="Filter modified after save"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* NaCl / Na2CO3 Value Input */}
                    <td className="py-2.5 px-4 text-center border-r border-slate-100">
                      <div className="relative max-w-[200px] mx-auto">
                        <input
                          type="text"
                          value={reading.naclNa2co3}
                          disabled={isViewOnly}
                          onChange={(e) =>
                            handleCellChange(
                              reading.id,
                              'naclNa2co3',
                              e.target.value
                            )
                          }
                          placeholder="0.00"
                          className={`w-full text-center font-mono text-xs font-bold py-1.5 px-3 rounded-lg border transition ${
                            hasError
                              ? 'border-rose-400 bg-rose-50 text-rose-800 ring-2 ring-rose-200'
                              : reading.naclNa2co3 !== ''
                              ? 'border-teal-300 bg-teal-50/50 text-teal-900 font-extrabold focus:bg-white'
                              : 'border-slate-200 bg-white text-slate-700'
                          } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-75`}
                        />
                        {isValEdited && (
                          <span
                            className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[7px] font-black px-1 rounded shadow-2xs pointer-events-none uppercase"
                            title="Value modified after save"
                          >
                            EDITED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Delete Row Button */}
                    {!isViewOnly && (
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => handleRemoveRow(reading.id)}
                          disabled={readings.length <= 1}
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
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
      </div>

      {/* ── Pre-Save Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden transform transition-all">
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-teal-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-teal-400" />
                <h3 className="font-extrabold text-sm tracking-wide">Confirm Bi Carbonate Save</h3>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer text-base leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs text-slate-600">
                Are you sure you want to save <strong>{confirmData.readings.length}</strong> entered reading(s) for <strong>{formatDateDisplay(confirmData.date)}</strong>?
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto space-y-1.5">
                {confirmData.readings.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded border border-slate-200 text-xs font-mono">
                    <span className="font-bold text-slate-700">{r.time} ({r.filter || 'No Filter'})</span>
                    <span className="font-black text-teal-700">{r.naclNa2co3 || '—'}%</span>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Persisting will record all readings in MongoDB and dispatch notifications to the assigned SA Plant user.
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg transition shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BicarbonateAnalysisPage;
