import React, { useState, useCallback, useEffect, useMemo } from 'react';
import AnalysisHeader from '../../components/common/AnalysisHeader';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  Calendar,
  Save,
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
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';

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

  // ── States (Date is strictly locked to Operating Date in Asia/Kolkata) ──
  const [date]                                      = useState(() => getOperatingDateIST());
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
    setSavePhase('idle');
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
    setSavePhase('idle');
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
          showToast?.('Saved', 'success');
        } else {
          setSavePhase('email_failed');
          setEmailStatusDetail(emailRes?.error || 'Email delivery failed');
          showToast?.('Saved', 'success');
        }
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
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
      {/* ── Breadcrumb & Top Navigation ── */}
      <AnalysisHeader
        plantName="ACL Plant"
        analysisName="Raw Salt"
        title="RAW SALT"
        date={date}
        dateId="analysis-date-display"
        onBack={() => navigate(`${basePath}/plants/${plantId}`)}
        isViewOnly={isViewOnly}
        onSave={handleSaveClick}
        saving={saving}
        savePhase={savePhase}
        saveSuccess={saveSuccess}
        saveButtonId="btn-rawsalt-save"
        saveButtonTitle="Save Raw Salt Data"
      />

      {/* ── Status Banner for Email Dispatch State ── */}
      <SaveStatusBanner
        id="rawsalt-success-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Raw Salt Chemical Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving || emailRetrying}
      />

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
      <ConfirmSaveModal
        isOpen={Boolean(showConfirmModal && confirmData)}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        title="Confirm Save — Raw Salt Analysis"
        subtitle={`ACL Plant for ${formatDateDisplay(confirmData?.date)}`}
        prompt={`Are you sure you want to save Raw Salt Analysis measurements for ${formatDateDisplay(confirmData?.date)}?`}
        isFinalEdit={confirmData?.isFinalEdit}
        warningNotice={
          confirmData?.isFinalEdit
            ? 'Final Edit Warning: This is your 2nd and final permitted edit for today’s record. Once saved, this record will be permanently locked against further edits.'
            : null
        }
        sectionTitle="Chemical Parameters (6 Fields)"
        items={confirmData ? RAW_SALT_PARAMETERS.map((p) => ({
          label: p.label,
          value: confirmData.formData[p.key] !== '' && confirmData.formData[p.key] !== null && confirmData.formData[p.key] !== undefined
            ? `${confirmData.formData[p.key]} %`
            : '—',
        })) : []}
        columns={2}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default RawSaltAnalysisPage;
