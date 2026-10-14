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
  PackageCheck,
  FlaskConical,
  Lock,
  Mail,
  RefreshCw,
  X,
} from 'lucide-react';

// ─── Raw Salt Chemical Parameters ─────────────────────────────────────────────

const RAW_SALT_PARAMETERS = [
  { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', unit: '%', placeholder: '98.20' },
  { key: 'ca',   label: 'Ca %',   subLabel: 'Calcium Content',         unit: '%', placeholder: '0.18' },
  { key: 'mg',   label: 'Mg %',   subLabel: 'Magnesium Content',       unit: '%', placeholder: '0.09' },
  { key: 'so4',  label: 'SO₄ %',  subLabel: 'Sulphate Content',        unit: '%', placeholder: '0.35' },
  { key: 'ir',   label: 'IR %',   subLabel: 'Insoluble Residue',       unit: '%', placeholder: '0.12' },
  { key: 'h2o',  label: 'H₂O %',  subLabel: 'Moisture Content',        unit: '%', placeholder: '1.06' },
];

const buildEmptyData = () =>
  Object.fromEntries(RAW_SALT_PARAMETERS.map((p) => [p.key, '']));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

// Strict Current Date helper in Asia/Kolkata timezone
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

// ─── Main Component ───────────────────────────────────────────────────────────

const RawSaltAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Date is strictly locked to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [formData, setFormData]                     = useState(buildEmptyData());
  const [originalFormData, setOriginalFormData]     = useState(null);
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
        const response = await api.get(`/raw-salt-analysis?date=${date}`);
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
            const fetchedParams =
              record.parameters ||
              record.data?.parameters ||
              (record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : null);

            if (fetchedParams && typeof fetchedParams === 'object') {
              const populated = buildEmptyData();
              RAW_SALT_PARAMETERS.forEach((p) => {
                const val = fetchedParams[p.key];
                populated[p.key] = val !== undefined && val !== null ? String(val) : '';
              });
              setFormData(populated);
              setOriginalFormData(JSON.parse(JSON.stringify(populated)));
            } else {
              setFormData(buildEmptyData());
              setOriginalFormData(null);
            }

            const recEditCount = record.editCount ?? record.data?.editCount ?? (record.isSaved ? 1 : 0);
            const recIsLocked = record.isLocked ?? record.data?.isLocked ?? (recEditCount >= 2);
            setEditCount(recEditCount);
            setIsLocked(recIsLocked);
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setFormData(buildEmptyData());
            setOriginalFormData(null);
            setEditCount(0);
            setIsLocked(false);
            setEditedFields({});
          }
        } else {
          setFormData(buildEmptyData());
          setOriginalFormData(null);
          setEditCount(0);
          setIsLocked(false);
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing Raw Salt data', err);
        setFormData(buildEmptyData());
        setOriginalFormData(null);
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

  // ── Input Change Handler ──
  const handleInputChange = useCallback((key, val) => {
    if (!canEdit) return;
    if (!isValidDecimal(val)) return;

    setFormData((prev) => ({
      ...prev,
      [key]: val,
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    setSaveSuccess(false);
  }, [canEdit]);

  // ── Reset Handler ──
  const handleReset = useCallback(() => {
    if (!canEdit) return;
    if (originalFormData) {
      setFormData(JSON.parse(JSON.stringify(originalFormData)));
    } else {
      setFormData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.('Raw Salt analysis form reset.', 'info');
  }, [canEdit, originalFormData, showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    RAW_SALT_PARAMETERS.forEach((p) => {
      const val = formData[p.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[p.key] = 'Must be a valid number';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [formData]);

  // ── Save Trigger: Open Confirmation Modal ──
  const handleSaveClick = () => {
    if (!canEdit) {
      showToast?.('This analysis is locked and cannot be edited.', 'warning');
      return;
    }

    if (!validateForm()) {
      showToast?.('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasData = Object.values(formData).some((v) => v !== '');
    if (!hasData) {
      showToast?.('Please enter at least one measurement value for Raw Salt.', 'warning');
      return;
    }

    const isFinalEdit = editCount === 1;

    setConfirmData({
      date,
      formData,
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
        plantId: 'acl',
        analysisType: 'Raw Salt Analysis',
        parameters: Object.fromEntries(
          RAW_SALT_PARAMETERS.map((p) => {
            const v = formData[p.key];
            return [p.key, v !== '' && v !== null && v !== undefined ? parseFloat(v) : ''];
          })
        ),
        submittedBy: user?.name || 'Plant Operator',
      };

      let response;
      try {
        response = await api.post('/raw-salt-analysis', payload);
      } catch (postErr) {
        response = await api.post('/raw-salt', payload);
      }

      if (response?.data && response.data.success) {
        setSaveSuccess(true);
        setLastSaved(new Date().toLocaleTimeString());
        setOriginalFormData(JSON.parse(JSON.stringify(formData)));

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
      setSavePhase('idle');
      console.error('[RawSaltAnalysis] Save failed:', err);
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
    setEmailRetrying(true);
    try {
      let response;
      try {
        response = await api.post(`/raw-salt-analysis/${recordId}/retry-email`);
      } catch (err1) {
        response = await api.post(`/raw-salt/${recordId}/retry-email`);
      }

      if (response?.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Email sent successfully on retry.');
        showToast?.('Email resent successfully!', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(response?.data?.error || 'Email delivery failed on retry.');
        showToast?.('Email retry failed: ' + (response?.data?.error || 'Rejected by server'), 'error');
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
    <div className="space-y-4 animate-fadeIn font-sans">
      {/* ── Top Header Bar with Locked Current Date ────────────────────────── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back Button + Breadcrumb + Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Return to Plants Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <PackageCheck className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">Raw Salt</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  RAW SALT
                </h1>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                    <Lock className="w-3 h-3 text-slate-500" /> Locked (Max Edits Reached)
                  </span>
                ) : editCount === 1 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Edit Mode (1 Edit Remaining)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Initial Entry
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Date Section + Actions */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Integrated Locked Current-Date Section */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider leading-none">
                  DATE (TODAY ONLY)
                </span>
                <span className="text-xs font-black text-slate-800 leading-tight">
                  {formatDateDisplay(date)}
                </span>
              </div>
              <span className="ml-1 text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.2 rounded border border-blue-200 uppercase">
                Asia/Kolkata
              </span>
            </div>

            {lastSaved && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Saved at {lastSaved}
              </span>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <button
                  id="btn-rawsalt-reset"
                  onClick={handleReset}
                  disabled={saving || emailRetrying}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              {!isViewOnly && (
                <button
                  id="btn-rawsalt-save"
                  onClick={handleSaveClick}
                  disabled={saving || emailRetrying || !canEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
                  title="Save Raw Salt Data"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : isLocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Locked</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{editCount === 0 ? 'Save / Submit' : 'Save Final Edit'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Banner for Email Dispatch State ── */}
      {savePhase === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-emerald-900 text-xs animate-fadeIn shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-extrabold">Saved — Email Sent ✓</span>
              <span className="text-emerald-700 ml-1.5">
                Delivered to registered ACL operator ({recipientEmail || 'assigned user'}).
              </span>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
            {emailStatusDetail}
          </span>
        </div>
      )}

      

      {savePhase === 'email_failed' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-rose-900 text-xs animate-fadeIn shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span className="font-extrabold">Saved — Email Failed</span>
              <span className="text-rose-700 ml-1.5">
                Analysis data is safely saved in the database, but email delivery to{' '}
                <strong>{recipientEmail || 'operator'}</strong> encountered an issue: {emailStatusDetail}
              </span>
            </div>
          </div>
          <button
            onClick={handleRetryEmail}
            disabled={emailRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition shadow-2xs cursor-pointer shrink-0 disabled:opacity-60"
            title="Retry sending notification email"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${emailRetrying ? 'animate-spin' : ''}`} />
            <span>{emailRetrying ? 'Retrying...' : 'Retry Email'}</span>
          </button>
        </div>
      )}

      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {saveSuccess && savePhase !== 'email_failed' && savePhase !== 'completed' && (
        <div
          id="rawsalt-success-banner"
          className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-800">
              Analysis Saved Successfully:
            </span>{' '}
            <span className="text-emerald-700">
              Raw Salt Chemical Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
            </span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 transition text-base leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Main Data Entry Section ────────────────────────────────────────── */}
      <div className="w-full">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="px-4 py-2 sm:px-5 sm:py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-blue-600/30 rounded-md border border-blue-400/30">
                <FlaskConical className="w-3.5 h-3.5 text-blue-300" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                  Chemical Characteristics
                </h2>
                <p className="text-[10px] sm:text-[11px] text-slate-300">
                  NaCl, Ca, Mg, SO₄, IR & H₂O Quality Specifications
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
              {RAW_SALT_PARAMETERS.length} Parameters
            </span>
          </div>

          {/* Parameters List */}
          <div className="divide-y divide-slate-100 p-1 sm:px-3 sm:py-1">
            {RAW_SALT_PARAMETERS.map((param) => {
              const val = formData[param.key];
              const isInvalid = !!errors[param.key];
              const errorMessage = errors[param.key];
              const isFieldEdited = !!editedFields[`param_${param.key}`];

              return (
                <div
                  key={param.key}
                  className="flex items-center justify-between py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg hover:bg-slate-50/80 transition-colors"
                >
                  {/* Parameter Label & Sublabel */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight shrink-0">
                      {param.label}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-400 truncate hidden sm:inline">
                      ({param.subLabel})
                    </span>

                    {/* EDITED Badge */}
                    {isFieldEdited && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-amber-500 text-white shadow-2xs animate-fadeIn">
                        EDITED
                      </span>
                    )}
                  </div>

                  {/* Input Box */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <input
                        id={`rawsalt-${param.key}`}
                        type="text"
                        inputMode="decimal"
                        value={val}
                        placeholder={param.placeholder}
                        disabled={!canEdit}
                        onChange={(e) => handleInputChange(param.key, e.target.value)}
                        className={`w-28 sm:w-32 px-2.5 py-1 text-xs sm:text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          isInvalid
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : !canEdit
                            ? 'border-2 border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed'
                            : val !== ''
                            ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                            : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                        }`}
                        aria-label={param.label}
                      />
                      {isInvalid && (
                        <p className="text-[10px] text-red-600 font-bold mt-0.5 text-center animate-fadeIn absolute -bottom-3.5 left-0 right-0">
                          {errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card Footer Info */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Raw Salt Input: Dissolution Stream & Brine Preparation Base</span>
            <span className="font-semibold text-slate-600">Standard Specs</span>
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-400/30">
                  <PackageCheck className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-100">
                    Confirm Raw Salt Analysis Save
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    ACL Plant — {formatDateDisplay(confirmData.date)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              {confirmData.isFinalEdit && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 px-3.5 py-2.5 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Final Edit Warning:</span> This is your 2nd and final permitted edit for today’s record. Once saved, this record will be permanently locked against further edits.
                  </div>
                </div>
              )}

              {/* Data Summary */}
              <div>
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
                  <span>Chemical Parameters (6 Fields)</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {RAW_SALT_PARAMETERS.map((p) => {
                    const val = confirmData.formData[p.key];
                    return (
                      <div key={p.key} className="flex justify-between items-center py-1 border-b border-slate-200/60 last:border-0">
                        <span className="font-semibold text-slate-600">{p.label}:</span>
                        <span className="font-mono font-bold text-blue-900">
                          {val !== '' ? `${val} %` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notification Notice */}
              <div className="bg-blue-50 border border-blue-200 text-blue-900 px-3.5 py-2.5 rounded-xl flex items-start gap-2">
                <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Email Notification:</span> Saving will automatically generate the official report Excel sheet and dispatch an email to the registered ACL Plant operator ({recipientEmail || 'assigned user'}).
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm cursor-pointer disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
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

export default RawSaltAnalysisPage;
