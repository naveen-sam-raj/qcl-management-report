import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  Grid3X3,
  Mail,
  RefreshCw,
  Lock,
} from 'lucide-react';

// ─── Chemical & Physical Parameters ──────────────────────────────────────────

const CHEMICAL_PARAMETERS = [
  { key: 'nh4cl', label: 'NH₄Cl %', subLabel: 'Ammonium Chloride', unit: '%', placeholder: '97.40' },
  { key: 'nacl',  label: 'NaCl %',  subLabel: 'Sodium Chloride',   unit: '%', placeholder: '0.72' },
  { key: 'fe2o3', label: 'Fe₂O₃ %', subLabel: 'Ferric Oxide',      unit: '%', placeholder: '0.0055' },
  { key: 'h2o',   label: 'H₂O %',   subLabel: 'Moisture',          unit: '%', placeholder: '0.12' },
  { key: 'ir',    label: 'IR %',    subLabel: 'Insoluble Residue', unit: '%', placeholder: '0.32' },
  { key: 'bd',    label: 'BD',      subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '1000' },
  { key: 'p18_spec', label: '+18 %', subLabel: 'Oversize Particle Spec', unit: '%', placeholder: '00.5' },
];

// ─── BSS Sieve Parameters ────────────────────────────────────────────────────

const BSS_PARAMETERS = [
  { key: 'p6',    label: '+6 %',   mesh: '+6 Mesh',   placeholder: '0.0' },
  { key: 'p8',    label: '+8 %',   mesh: '+8 Mesh',   placeholder: '0.0' },
  { key: 'p12',   label: '+12 %',  mesh: '+12 Mesh',  placeholder: '0.0' },
  { key: 'p16',   label: '+16 %',  mesh: '+16 Mesh',  placeholder: '0.0' },
  { key: 'p18',   label: '+18 %',  mesh: '+18 Mesh',  placeholder: '00.5' },
  { key: 'p44',   label: '+44 %',  mesh: '+44 Mesh',  placeholder: '71.8' },
  { key: 'p60',   label: '+60 %',  mesh: '+60 Mesh',  placeholder: '17.9' },
  { key: 'p100',  label: '+100 %', mesh: '+100 Mesh', placeholder: '09.4' },
  { key: 'm100',  label: '-100 %', mesh: '-100 Mesh', placeholder: '00.4' },
];

const buildEmptyChemicalData = () =>
  Object.fromEntries(CHEMICAL_PARAMETERS.map((p) => [p.key, '']));

const buildEmptyBssData = () =>
  Object.fromEntries(BSS_PARAMETERS.map((p) => [p.key, '']));

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

const ACLProductAnalysisPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States (Date is locked strictly to Today in Asia/Kolkata) ──
  const [date]                                      = useState(() => getTodayAsiaKolkata());
  const [chemicalData, setChemicalData]             = useState(buildEmptyChemicalData());
  const [bssData, setBssData]                       = useState(buildEmptyBssData());
  const [originalChemData, setOriginalChemData]     = useState(null);
  const [originalBssData, setOriginalBssData]       = useState(null);
  const [errors, setErrors]                         = useState({});
  const [saving, setSaving]                         = useState(false);
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
        const response = await api.get(`/acl-product?date=${date}`);
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
            const fetchedChem = record.chemicalData || record.chemical || record.data?.chemicalData || record.data?.chemical;
            const fetchedBss = record.bssData || record.bss || record.data?.bssData || record.data?.bss;

            if (fetchedChem && typeof fetchedChem === 'object') {
              const populatedChem = buildEmptyChemicalData();
              CHEMICAL_PARAMETERS.forEach((p) => {
                const val = fetchedChem[p.key];
                populatedChem[p.key] = val !== undefined && val !== null ? String(val) : '';
              });
              setChemicalData(populatedChem);
              setOriginalChemData(JSON.parse(JSON.stringify(populatedChem)));
            } else {
              setChemicalData(buildEmptyChemicalData());
              setOriginalChemData(null);
            }

            if (fetchedBss && typeof fetchedBss === 'object') {
              const populatedBss = buildEmptyBssData();
              BSS_PARAMETERS.forEach((p) => {
                const val = fetchedBss[p.key];
                populatedBss[p.key] = val !== undefined && val !== null ? String(val) : '';
              });
              setBssData(populatedBss);
              setOriginalBssData(JSON.parse(JSON.stringify(populatedBss)));
            } else {
              setBssData(buildEmptyBssData());
              setOriginalBssData(null);
            }

            const recEditCount = record.editCount ?? record.data?.editCount ?? (record.isSaved ? 1 : 0);
            const recIsLocked = record.isLocked ?? record.data?.isLocked ?? (recEditCount >= 2);
            setEditCount(recEditCount);
            setIsLocked(recIsLocked);
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setChemicalData(buildEmptyChemicalData());
            setBssData(buildEmptyBssData());
            setOriginalChemData(null);
            setOriginalBssData(null);
            setEditCount(0);
            setIsLocked(false);
            setEditedFields({});
          }
        } else {
          setChemicalData(buildEmptyChemicalData());
          setBssData(buildEmptyBssData());
          setOriginalChemData(null);
          setOriginalBssData(null);
          setEditCount(0);
          setIsLocked(false);
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing ACL Product data', err);
        setChemicalData(buildEmptyChemicalData());
        setBssData(buildEmptyBssData());
        setOriginalChemData(null);
        setOriginalBssData(null);
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

  // ── Calculate Live BSS Total ──
  const bssTotal = useMemo(() => {
    let sum = 0;
    let count = 0;
    BSS_PARAMETERS.forEach((p) => {
      const val = bssData[p.key];
      if (val !== '' && !isNaN(Number(val))) {
        sum += Number(val);
        count += 1;
      }
    });
    return { sum: parseFloat(sum.toFixed(3)), count };
  }, [bssData]);

  // ── Input Changes ──
  const handleChemicalChange = useCallback((key, value) => {
    if (!canEdit) return;
    if (!isValidDecimal(value)) return;

    setChemicalData((prev) => {
      const updated = { ...prev, [key]: value };
      // Sync +18 % to BSS if operator updates on chemical side
      if (key === 'p18_spec') {
        setBssData((bPrev) => (bPrev.p18 === '' || bPrev.p18 === prev.p18_spec ? { ...bPrev, p18: value } : bPrev));
      }
      return updated;
    });

    setErrors((prev) => {
      const next = { ...prev };
      delete next[`chem_${key}`];
      return next;
    });
    setSaveSuccess(false);
  }, [canEdit]);

  const handleBssChange = useCallback((key, value) => {
    if (!canEdit) return;
    if (!isValidDecimal(value)) return;

    setBssData((prev) => ({ ...prev, [key]: value }));
    // Sync +18 % to chemical card if entered under BSS
    if (key === 'p18') {
      setChemicalData((cPrev) => (cPrev.p18_spec === '' || cPrev.p18_spec === bssData.p18 ? { ...cPrev, p18_spec: value } : cPrev));
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`bss_${key}`];
      return next;
    });
    setSaveSuccess(false);
  }, [canEdit, bssData]);

  // ── Reset Form ──
  const handleReset = useCallback(() => {
    if (!canEdit) return;
    if (originalChemData && originalBssData) {
      setChemicalData(JSON.parse(JSON.stringify(originalChemData)));
      setBssData(JSON.parse(JSON.stringify(originalBssData)));
    } else {
      setChemicalData(buildEmptyChemicalData());
      setBssData(buildEmptyBssData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.('ACL Product analysis form reset.', 'info');
  }, [canEdit, originalChemData, originalBssData, showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    CHEMICAL_PARAMETERS.forEach((p) => {
      const val = chemicalData[p.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[`chem_${p.key}`] = 'Invalid number';
        isValid = false;
      }
    });

    BSS_PARAMETERS.forEach((p) => {
      const val = bssData[p.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[`bss_${p.key}`] = 'Invalid number';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [chemicalData, bssData]);

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

    const hasChemData = Object.values(chemicalData).some((v) => v !== '');
    const hasBssData  = Object.values(bssData).some((v) => v !== '');

    if (!hasChemData && !hasBssData) {
      showToast?.('Please enter at least one measurement value.', 'warning');
      return;
    }

    const isFinalEdit = editCount === 1;

    setConfirmData({
      date,
      chemicalData,
      bssData,
      bssTotal,
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
        analysisType: 'ACL Product Analysis',
        chemical: Object.fromEntries(
          CHEMICAL_PARAMETERS.map((p) => {
            const v = chemicalData[p.key];
            return [p.key, v !== '' && v !== null && v !== undefined ? parseFloat(v) : null];
          })
        ),
        bss: Object.fromEntries(
          BSS_PARAMETERS.map((p) => {
            const v = bssData[p.key];
            return [p.key, v !== '' && v !== null && v !== undefined ? parseFloat(v) : null];
          })
        ),
        submittedBy: user?.name || 'Plant Operator',
      };

      const response = await api.post('/api/acl-product', payload);

      if (response.data && response.data.success) {
        setSaveSuccess(true);
        setLastSaved(new Date().toLocaleTimeString());
        setOriginalChemData(JSON.parse(JSON.stringify(chemicalData)));
        setOriginalBssData(JSON.parse(JSON.stringify(bssData)));

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
      console.error('[ACLProductAnalysis] Save failed:', err);
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
    setSaving(true);
    try {
      const response = await api.post(`/api/acl-product/${recordId}/retry-email`);
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
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb Header with Restricted Today Date ── */}
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
                <PackageCheck className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">ACL Product</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-blue-600" />
                  ACL PRODUCT ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200">
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

          {/* Right: Restricted Today Date + Action Buttons */}
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
                  id="btn-aclproduct-reset"
                  onClick={handleReset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
                  title="Clear all fields"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              {!isViewOnly && (
                <button
                  id="btn-aclproduct-save"
                  onClick={handleSaveClick}
                  disabled={saving || !canEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60 cursor-pointer"
                  title="Save ACL Product data"
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
                Database persistence confirmed, but email delivery was rejected: {emailStatusDetail}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetryEmail}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${saving ? 'animate-spin' : ''}`} />
            <span>Retry Email</span>
          </button>
        </div>
      )}

      {/* ── Main Data Entry Section (2 Columns: Chemical Specs & BSS Sieve) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ── CARD 1: Chemical & Physical Parameters ────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="px-5 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-600/30 rounded-lg border border-blue-400/30">
                <FlaskConical className="w-4 h-4 text-blue-300" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                  Chemical & Physical Characteristics
                </h2>
                <p className="text-[11px] text-slate-300">
                  Assay, Impurities & Bulk Density
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
              {CHEMICAL_PARAMETERS.length} Parameters
            </span>
          </div>

          {/* Parameters List */}
          <div className="divide-y divide-slate-100 p-2 sm:p-3">
            {CHEMICAL_PARAMETERS.map((param) => {
              const val = chemicalData[param.key];
              const isInvalid = !!errors[`chem_${param.key}`];
              const errorMessage = errors[`chem_${param.key}`];
              const isEdited = editedFields[`chem_${param.key}`];

              return (
                <div
                  key={param.key}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/80 transition-colors"
                >
                  {/* Parameter Label & Sublabel */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-extrabold text-slate-900 font-mono tracking-tight shrink-0">
                      {param.label}
                    </span>
                    <span className="text-xs text-slate-400 truncate hidden sm:inline">
                      ({param.subLabel})
                    </span>
                    {isEdited && (
                      <span
                        id={`aclproduct-badge-chem-${param.key}`}
                        className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
                        title="Value modified after initial save"
                      >
                        EDITED
                      </span>
                    )}
                  </div>

                  {/* Input Box */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <input
                        id={`aclproduct-chem-${param.key}`}
                        type="text"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={val}
                        placeholder={param.placeholder}
                        onChange={(e) => handleChemicalChange(param.key, e.target.value)}
                        className={`w-28 sm:w-32 px-3 py-1.5 text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          !canEdit
                            ? 'bg-slate-50 cursor-not-allowed border-2 border-slate-200 text-slate-700'
                            : isInvalid
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : val !== ''
                            ? 'border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200'
                            : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                        }`}
                        aria-label={param.label}
                      />
                      {isInvalid && (
                        <p className="text-[10px] text-red-600 font-bold mt-1 text-center animate-fadeIn absolute -bottom-4 left-0 right-0">
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
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>NH₄Cl purity, NaCl, Fe₂O₃, H₂O, IR & BD</span>
            <span className="font-semibold text-slate-600">Standard Specs</span>
          </div>
        </div>

        {/* ── CARD 2: B S S (Sieve Analysis / Particle Distribution) ───────── */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-600/30 rounded-lg border border-indigo-400/30">
                <Grid3X3 className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                  B S S (Sieve Analysis)
                </h2>
                <p className="text-[11px] text-slate-300">
                  British Standard Sieve Particle Distribution (%)
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
              {BSS_PARAMETERS.length} Mesh Sizes
            </span>
          </div>

          {/* BSS Sieve Parameters List */}
          <div className="divide-y divide-slate-100 p-2 sm:p-3">
            {BSS_PARAMETERS.map((param) => {
              const val = bssData[param.key];
              const isInvalid = !!errors[`bss_${param.key}`];
              const errorMessage = errors[`bss_${param.key}`];
              const isEdited = editedFields[`bss_${param.key}`];

              return (
                <div
                  key={param.key}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/80 transition-colors"
                >
                  {/* Mesh Label */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-extrabold text-slate-900 font-mono tracking-tight shrink-0">
                      {param.label}
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      ({param.mesh})
                    </span>
                    {isEdited && (
                      <span
                        id={`aclproduct-badge-bss-${param.key}`}
                        className="inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100/90 border border-amber-300/70 text-amber-900 text-[8.5px] font-extrabold uppercase tracking-wider leading-none shadow-2xs select-none"
                        title="Value modified after initial save"
                      >
                        EDITED
                      </span>
                    )}
                  </div>

                  {/* Input Box */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <input
                        id={`aclproduct-bss-${param.key}`}
                        type="text"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={val}
                        placeholder={param.placeholder}
                        onChange={(e) => handleBssChange(param.key, e.target.value)}
                        className={`w-28 sm:w-32 px-3 py-1.5 text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs ${
                          !canEdit
                            ? 'bg-slate-50 cursor-not-allowed border-2 border-slate-200 text-slate-700'
                            : isInvalid
                            ? 'border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
                            : val !== ''
                            ? 'border-2 border-indigo-500 bg-indigo-50/50 text-indigo-900 font-extrabold focus:ring-2 focus:ring-indigo-200'
                            : 'border-2 border-slate-200 bg-white hover:border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900'
                        }`}
                        aria-label={param.label}
                      />
                      {isInvalid && (
                        <p className="text-[10px] text-red-600 font-bold mt-1 text-center animate-fadeIn absolute -bottom-4 left-0 right-0">
                          {errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card Footer: Live Total Recovery Counter */}
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">
              Total Sieve Recovery:
            </span>
            <div className="flex items-center gap-2">
              <span
                id="aclproduct-total-sieve-recovery"
                className={`font-mono font-extrabold px-2.5 py-0.5 rounded text-xs border ${
                  Math.abs(bssTotal.sum - 100) < 0.2
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : bssTotal.count > 0
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {bssTotal.count > 0 ? `${bssTotal.sum.toFixed(1)} %` : '—'}
              </span>
              {Math.abs(bssTotal.sum - 100) < 0.2 && (
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                  ✓ 100%
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── Save Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PackageCheck className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Confirm ACL Product Analysis Submission
                </h3>
              </div>
              <span className="text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded font-mono font-bold">
                {formatDateDisplay(confirmData.date)}
              </span>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs text-slate-600 max-h-[75vh] overflow-y-auto">
              <p className="text-slate-700 font-medium leading-relaxed">
                Are you sure you want to save measurements for{' '}
                <strong className="text-blue-700">ACL Plant → ACL Product Analysis</strong> on{' '}
                <strong className="text-slate-900">{formatDateDisplay(confirmData.date)}</strong>?
              </p>

              {confirmData.isFinalEdit && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium text-[11px]">
                    <strong>Final Edit Notice:</strong> This is the final permitted edit for today's ACL Product Analysis. After this save, all parameters for today ({formatDateDisplay(confirmData.date)}) will be permanently locked.
                  </span>
                </div>
              )}

              {/* Chemical Section Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Chemical & Physical Characteristics (7):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  {CHEMICAL_PARAMETERS.map((p) => {
                    const val = confirmData.chemicalData[p.key];
                    return (
                      <div key={p.key} className="bg-white p-1.5 rounded border border-slate-200">
                        <span className="text-[9.5px] text-slate-400 block font-sans truncate">{p.label}</span>
                        <strong className="text-xs text-slate-800">
                          {val !== '' && val !== null && val !== undefined ? val : '—'}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* BSS Sieve Section Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>BSS Sieve Analysis (9 Mesh Sizes):</span>
                  <span className="text-emerald-700 font-mono font-bold">
                    Recovery: {confirmData.bssTotal?.count > 0 ? `${confirmData.bssTotal.sum.toFixed(1)} %` : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 font-mono text-[11px]">
                  {BSS_PARAMETERS.map((p) => {
                    const val = confirmData.bssData[p.key];
                    return (
                      <div key={p.key} className="bg-white p-1.5 rounded border border-slate-200">
                        <span className="text-[9.5px] text-slate-400 block font-sans">{p.label}</span>
                        <strong className="text-xs text-slate-800">
                          {val !== '' && val !== null && val !== undefined ? val : '—'}
                        </strong>
                      </div>
                    );
                  })}
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
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer flex items-center gap-1.5"
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

export default ACLProductAnalysisPage;
