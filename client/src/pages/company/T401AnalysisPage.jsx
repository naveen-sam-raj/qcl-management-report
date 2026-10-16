import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/common/Toast";
import api from "../../services/api";
import {
  getCellLimit,
  validateCellValue,
} from "../../services/analysisValidation";
import {
  ArrowLeft,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Factory,
  Layers,
  FlaskConical,
  Lock,
  RefreshCw,
  Send,
  Mail,
} from "lucide-react";
import { StatusSaveButton, SaveStatusBanner } from "../../components/common/AnalysisStatusBanner";

// ─── SA Plant T 401 Parameters & Validation Limits ───────────────────────────
// Plant: SA Plant
// Analysis: T401 (Options A, B, C, D, E, F)
// Parameters: FNH3, CNH3, TCL, PCL
// Frequency: Once in a Shift
//
// Parameters & Limits (Applied independently to each Option A, B, C, D, E, F):
// 1. FNH3: Reference: 0.98 Kgm/m³, Tolerance: ±0.10, Valid Range: 0.88 – 1.08 Kgm/m³
// 2. CNH3: Reference: 4.50 Kgm/m³, Tolerance: ±0.10, Valid Range: 4.40 – 4.60 Kgm/m³
// 3. TCL:  Reference: 5.80 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.70 – 5.90 Kgm/m³
// 4. PCL:  Reference: 1.12 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.02 – 1.22 Kgm/m³

export const SA_T401_LIMITS = {
  fnh3: {
    key: "fnh3",
    paramName: "FNH3",
    label: "FNH₃",
    formula: "Free Ammonia (FNH₃)",
    target: 0.98,
    tolerance: 0.10,
    min: 0.88,
    max: 1.08,
    unit: "Kgm/m³",
    formattedRange: "0.88–1.08 Kgm/m³",
    formattedTarget: "0.98 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "0.98",
    hasLimit: true,
  },
  cnh3: {
    key: "cnh3",
    paramName: "CNH3",
    label: "CNH₃",
    formula: "Combined Ammonia (CNH₃)",
    target: 4.50,
    tolerance: 0.10,
    min: 4.40,
    max: 4.60,
    unit: "Kgm/m³",
    formattedRange: "4.40–4.60 Kgm/m³",
    formattedTarget: "4.50 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "4.50",
    hasLimit: true,
  },
  tcl: {
    key: "tcl",
    paramName: "TCL",
    label: "TCl",
    formula: "Total Chlorine (T.Cl)",
    target: 5.80,
    tolerance: 0.10,
    min: 5.70,
    max: 5.90,
    unit: "Kgm/m³",
    formattedRange: "5.70–5.90 Kgm/m³",
    formattedTarget: "5.80 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "5.80",
    hasLimit: true,
  },
  pcl: {
    key: "pcl",
    paramName: "PCL",
    label: "PCl",
    formula: "Polymer Chloride (P.Cl)",
    target: 1.12,
    tolerance: 0.10,
    min: 1.02,
    max: 1.22,
    unit: "Kgm/m³",
    formattedRange: "1.02–1.22 Kgm/m³",
    formattedTarget: "1.12 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "1.12",
    hasLimit: true,
  },
};

// 6 Tower Units / Options (A through F)
const UNITS = [
  { key: "a", label: "T 401 A", subLabel: "Tower Unit A", option: "A" },
  { key: "b", label: "T 401 B", subLabel: "Tower Unit B", option: "B" },
  { key: "c", label: "T 401 C", subLabel: "Tower Unit C", option: "C" },
  { key: "d", label: "T 401 D", subLabel: "Tower Unit D", option: "D" },
  { key: "e", label: "T 401 E", subLabel: "Tower Unit E", option: "E" },
  { key: "f", label: "T 401 F", subLabel: "Tower Unit F", option: "F" },
];

// 3 Shifts (I, II, III)
const SHIFTS = [
  { key: "s1", label: "I",   title: "I Shift (07:00 – 15:00)",  name: "I SHIFT",   badgeColor: "bg-sky-100 text-sky-800 border-sky-300" },
  { key: "s2", label: "II",  title: "II Shift (15:00 – 23:00)", name: "II SHIFT",  badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { key: "s3", label: "III", title: "III Shift (23:00 – 07:00)", name: "III SHIFT", badgeColor: "bg-purple-100 text-purple-800 border-purple-300" },
];

// 4 Parameters per shift
const PARAMETERS = [
  { key: "fnh3", label: "FNH₃", placeholder: "0.98", hasLimit: true },
  { key: "cnh3", label: "CNH₃", placeholder: "4.50", hasLimit: true },
  { key: "tcl",  label: "TCl",  placeholder: "5.80", hasLimit: true },
  { key: "pcl",  label: "PCl",  placeholder: "1.12", hasLimit: true },
];

const buildEmptyData = () =>
  Object.fromEntries(
    UNITS.map((u) => [
      u.key,
      Object.fromEntries(
        SHIFTS.map((s) => [
          s.key,
          Object.fromEntries(PARAMETERS.map((p) => [p.key, ""])),
        ])
      ),
    ])
  );

const getTodayAsiaKolkata = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const isValidDecimal = (val) => val === "" || /^-?\d*\.?\d*$/.test(val);

const formatDateDisplay = (isoDate) => {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return isoDate;
  }
};

const T401AnalysisPage = ({ plantId = "sa" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === "user";
  const basePath = isViewOnly ? "/portal" : "/admin/tfl";

  // ── States (Strict Current-Date Restriction) ──
  const [date]                              = useState(() => getTodayAsiaKolkata());
  const [data, setData]                     = useState(buildEmptyData());
  const [originalData, setOriginalData]     = useState(null);
  const [errors, setErrors]                 = useState({});
  const [saving, setSaving]                 = useState(false);
  const [saveSuccess, setSaveSuccess]       = useState(false);
  const [selectedOption, setSelectedOption] = useState("all");
  
  // Save & Email tracking states
  const [savePhase, setSavePhase]                   = useState('idle'); // 'idle' | 'saving'  | 'completed' | 'email_failed'
  const [recordId, setRecordId]                     = useState(null);
  const [recipientEmail, setRecipientEmail]         = useState('');
  const [emailStatusDetail, setEmailStatusDetail]   = useState('');
  const [isPermanentMailError, setIsPermanentMailError] = useState(false);
  const [lockedShifts, setLockedShifts]             = useState({});
  const [editedFields, setEditedFields]             = useState({});
  const [retryingEmail, setRetryingEmail]           = useState(false);

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal]     = useState(false);
  const [confirmData, setConfirmData]               = useState(null);

  // ── Sequential Shift Workflow per Tower (Options A–F operate independently) ──
  // - Initially: Only I SHIFT (s1) is editable (NEW); s2 and s3 are WAITING.
  // - Once s1 is saved: s1 remains editable until s2 is saved; s2 becomes EDITABLE.
  // - Once s2 is saved: s1 is permanently LOCKED; s2 remains editable until s3 is saved; s3 becomes EDITABLE.
  // - Once s3 is saved: s2 is permanently LOCKED; s3 enters FINAL EDIT ALLOWED (exactly 1 final edit).
  // - After s3 final edit: all shifts for that tower are permanently LOCKED.
  const isShiftDisabled = useCallback((towerKey, shiftKey) => {
    if (isViewOnly) return true;
    const uLocks = lockedShifts[towerKey] || {};
    if (shiftKey === 's1') {
      return Boolean(uLocks.s1) || Boolean(uLocks.s2Saved);
    }
    if (shiftKey === 's2') {
      if (!uLocks.s1Saved) return true;
      return Boolean(uLocks.s2) || Boolean(uLocks.s3Saved);
    }
    if (shiftKey === 's3') {
      if (!uLocks.s2Saved) return true;
      if (uLocks.s3) return true;
      if (uLocks.s3Saved && (uLocks.s3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  const getShiftBadgeStatus = useCallback((towerKey, shiftKey) => {
    const uLocks = lockedShifts[towerKey] || {};
    if (shiftKey === 's1') {
      if (uLocks.s1 || uLocks.s2Saved) return { label: 'LOCKED', color: 'bg-rose-100 text-rose-800 border-rose-300' };
      if (uLocks.s1Saved) return { label: 'EDITABLE', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      return { label: 'NEW', color: 'bg-sky-100 text-sky-800 border-sky-300' };
    }
    if (shiftKey === 's2') {
      if (uLocks.s2 || uLocks.s3Saved) return { label: 'LOCKED', color: 'bg-rose-100 text-rose-800 border-rose-300' };
      if (uLocks.s2Saved) return { label: 'EDITABLE', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      if (uLocks.s1Saved) return { label: 'EDITABLE', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      return { label: 'WAITING', color: 'bg-slate-100 text-slate-500 border-slate-300' };
    }
    if (shiftKey === 's3') {
      if (uLocks.s3 || (uLocks.s3Saved && (uLocks.s3Edits || 0) >= 1)) {
        return { label: 'LOCKED', color: 'bg-rose-100 text-rose-800 border-rose-300' };
      }
      if (uLocks.s3Saved && (uLocks.s3Edits || 0) === 0) {
        return { label: 'FINAL EDIT', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      }
      if (uLocks.s2Saved) return { label: 'EDITABLE', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      return { label: 'WAITING', color: 'bg-slate-100 text-slate-500 border-slate-300' };
    }
    return { label: 'WAITING', color: 'bg-slate-100 text-slate-500 border-slate-300' };
  }, [lockedShifts]);

  // Fetch existing data for today
  useEffect(() => {
    let active = true;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/t-401-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success) {
          const rec = response.data.record || (Array.isArray(response.data.data) ? response.data.data[0] : response.data.data);
          if (rec) {
            setRecordId(rec._id || response.data.recordId || null);
            setRecipientEmail(rec.emailRecipient || response.data.assignedOperatorEmail || response.data.emailRecipient || '');
            
            if (rec.emailStatus === 'sent') {
              setSavePhase('completed');
              setEmailStatusDetail(`Email sent to ${rec.emailRecipient || response.data.assignedOperatorEmail || 'plant operator'}`);
            } else if (rec.emailStatus === 'failed') {
              setSavePhase('email_failed');
              setEmailStatusDetail('Database save succeeded. Email dispatch failed.');
            }

            const fetchedUnits = rec.units || rec.towers || rec.shifts || rec.data?.units || rec.data?.towers || rec.data;
            if (fetchedUnits && typeof fetchedUnits === 'object') {
              const populated = buildEmptyData();
              UNITS.forEach((unit) => {
                const uSource = fetchedUnits[unit.key] || fetchedUnits[unit.option] || {};
                SHIFTS.forEach((shift) => {
                  const sSource = uSource[shift.key] || uSource[`shift${shift.key.slice(1)}`] || {};
                  PARAMETERS.forEach((p) => {
                    const val = sSource[p.key];
                    populated[unit.key][shift.key][p.key] = val !== null && val !== undefined ? String(val) : '';
                  });
                });
              });
              setData(populated);
              setOriginalData(JSON.parse(JSON.stringify(populated)));
            } else {
              setData(buildEmptyData());
              setOriginalData(null);
            }

            setLockedShifts(rec.lockedShifts || response.data.lockedShifts || {});
            setEditedFields(rec.editedFields || response.data.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing T 401 data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setLockedShifts({});
        setEditedFields({});
      }
    };
    fetchExistingData();
    return () => { active = false; };
  }, [date]);

  // ── Input Changes ──
  const handleCellChange = useCallback((unitKey, shiftKey, paramKey, value) => {
    if (isShiftDisabled(unitKey, shiftKey)) return;
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [unitKey]: {
        ...prev[unitKey],
        [shiftKey]: {
          ...prev[unitKey][shiftKey],
          [paramKey]: value,
        },
      },
    }));

    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${unitKey}_${shiftKey}_${paramKey}`];
      return next;
    });
    setSaveSuccess(false);
    setSavePhase('idle');
  }, [isShiftDisabled]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.("Restored unsaved fields to last persisted state.", "info");
  }, [originalData, showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    UNITS.forEach((u) => {
      SHIFTS.forEach((s) => {
        PARAMETERS.forEach((p) => {
          const val = data[u.key][s.key][p.key];
          if (val !== "" && isNaN(Number(val))) {
            newErrors[`${u.key}_${s.key}_${p.key}`] = "Invalid";
            isValid = false;
          }
        });
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [data]);

  const isParamDiff = (oldVal, newVal) => {
    if (oldVal === undefined || oldVal === null || oldVal === '') oldVal = null;
    if (newVal === undefined || newVal === null || newVal === '') newVal = null;
    if (oldVal === null && newVal === null) return false;
    if (oldVal === null || newVal === null) return true;
    if (!isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
      return Number(oldVal) !== Number(newVal);
    }
    return String(oldVal) !== String(newVal);
  };

  const isShiftDiff = (oldShift, newShift) => {
    if (!oldShift && newShift) return true;
    if (oldShift && !newShift) return false;
    return PARAMETERS.some((p) => isParamDiff(oldShift?.[p.key], newShift?.[p.key]));
  };

  // ── Pre-Save Click & Modal Prompt ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validateForm()) {
      showToast?.("Please correct numeric errors before saving.", "error");
      return;
    }

    const towersToCheck = (selectedOption && selectedOption !== 'all')
      ? UNITS.filter(u => u.key === selectedOption)
      : UNITS;

    const changes = [];
    towersToCheck.forEach((u) => {
      SHIFTS.forEach((s) => {
        if (isShiftDisabled(u.key, s.key)) return;
        const currentShiftData = data[u.key][s.key];
        const hasAnyVal = Object.values(currentShiftData).some(v => v !== '' && v !== null && v !== undefined);
        const oldShiftData = originalData ? originalData[u.key]?.[s.key] : null;
        const hasDiff = isShiftDiff(oldShiftData, currentShiftData);

        if (hasAnyVal && hasDiff) {
          changes.push({
            towerKey: u.key,
            towerLabel: u.label,
            option: u.option,
            shiftKey: s.key,
            shiftLabel: s.name,
            shiftTitle: s.title,
            data: currentShiftData,
          });
        }
      });
    });

    if (changes.length === 0) {
      showToast?.("No new or modified shift data found to save for the active tower selection.", "info");
      return;
    }

    // If single option is selected, enforce single-shift saving
    if (selectedOption !== 'all') {
      const distinctShifts = [...new Set(changes.map(c => c.shiftKey))];
      if (distinctShifts.length > 1) {
        showToast?.("Only one shift can be saved at a time. Please save changes shift-by-shift.", "warning");
        return;
      }
    }

    setConfirmData({
      selectedOption,
      changes,
      date,
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

    const payload = {
      date,
      plant: "SA",
      analysisType: "T 401 Analysis",
      tower: "T 401",
      targetTower: selectedOption,
      selectedOption,
      units: data,
      towers: data,
      submittedBy: user?.name || "Shift Chemist",
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post("/api/t-401-analysis", payload);

      if (!response?.data?.success) {
        showToast?.(response.data?.message || "Failed to save T 401 Analysis.", "error");
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setSaveSuccess(true);
      setOriginalData(JSON.parse(JSON.stringify(data)));

      const returnedDoc = response.data?.data || response.data?.analysis || {};
      const newLocked = response.data?.lockedShifts || returnedDoc.lockedShifts || {};
      const newEdited = response.data?.editedFields || returnedDoc.editedFields || {};
      const newRecordId = response.data?.recordId || returnedDoc._id || returnedDoc.id;

      setLockedShifts(newLocked);
      setEditedFields(newEdited);
      if (newRecordId) setRecordId(newRecordId);

      const deliveryStatus = response.data?.emailDeliveryStatus || response.data?.emailStatus;
      const recipient = response.data?.emailRecipient;
      if (recipient) setRecipientEmail(recipient);

      if (deliveryStatus === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(`Notification email delivered successfully to ${recipient || 'SA Plant operator'}.`);
        showToast?.(`T 401 Analysis saved & notification sent to ${recipient || 'operator'}!`, 'success');
      } else if (deliveryStatus === 'failed') {
        setSavePhase('email_failed');
        const smtpErr = response.data?.emailError || response.data?.message || 'SMTP delivery rejected';
        if (smtpErr.toLowerCase().includes('550') || smtpErr.toLowerCase().includes('access denied')) {
          setIsPermanentMailError(true);
        }
        setEmailStatusDetail(`Database save succeeded. Email failed: ${smtpErr}`);
        showToast?.('Data saved, but notification email delivery failed.', 'warning');
      } else {
        setSavePhase('idle');
        setEmailStatusDetail('Saved — Email notification queued.');
        showToast?.('T 401 Analysis data saved successfully!', 'success');
      }
    } catch (err) {
      console.error("[T 401 Save] Error:", err);
      const msg = err.response?.data?.message || err.message || "Failed to save T 401 Analysis.";
      showToast?.(msg, "error");
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
      const response = await api.post(`/t-401-analysis/${recordId}/retry-email`);
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
      console.error("[T 401 Retry Email] Error:", err);
      const msg = err.response?.data?.message || err.message || "Failed to retry email delivery.";
      setEmailStatusDetail(`Retry failed: ${msg}`);
      showToast?.(msg, 'error');
    } finally {
      setRetryingEmail(false);
    }
  };

  // Filter visible units based on selected option tab
  const visibleUnits = selectedOption === "all"
    ? UNITS
    : UNITS.filter((u) => u.key === selectedOption);

  return (
    <div className="space-y-2 animate-fadeIn">
      {/* ── Breadcrumb & Action Header ── */}
      <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Left: Back, Breadcrumb & Title */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium leading-none">
                <Factory className="w-3 h-3 text-slate-400" />
                <span>SA Plant</span>
                <ChevronRight className="w-2.5 h-2.5" />
                <span className="text-blue-600 font-bold">T 401</span>
              </div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-none ml-1">
                T 401 ANALYSIS
              </h1>
              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200 leading-none">
                Once in a Shift
              </span>
            </div>

            {/* Date Display (Strict Current Date Lock) */}
            <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                <span>Date:</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-blue-900 bg-blue-50/80 border border-blue-200 rounded-lg">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>{formatDateDisplay(date)}</span>
                <span className="text-[9.5px] font-semibold text-blue-600 bg-blue-100/80 px-1 py-0.2 rounded">
                  Today (Asia/Kolkata)
                </span>
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {!isViewOnly && (
              <button
                id="btn-t401-reset"
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer h-7"
                title="Restore unsaved fields"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}

            {!isViewOnly && (
              <StatusSaveButton
                id="btn-t401-save"
                saving={saving}
                savePhase={savePhase}
                saveSuccess={saveSuccess}
                onClick={handleSaveClick}
                defaultLabel="Save / Submit"
                title="Save T 401 data"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Status Banners (Email Sent / Pending / Failed) ── */}
      <SaveStatusBanner
        id="t401-success-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="T 401 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving || retryingEmail}
      />

      {/* ── Selectable Options Tabs (A, B, C, D, E, F) ── */}
      <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Selectable Tower Options:
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            id="tab-option-all"
            onClick={() => setSelectedOption("all")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
              selectedOption === "all"
                ? "bg-blue-600 text-white shadow-2xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All Options (A–F)
          </button>
          {UNITS.map((u) => (
            <button
              key={u.key}
              type="button"
              id={`tab-option-${u.key}`}
              onClick={() => setSelectedOption(u.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                selectedOption === u.key
                  ? "bg-blue-600 text-white shadow-2xs ring-2 ring-blue-300"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Option {u.option}
            </button>
          ))}
        </div>
      </div>

      {/* ── 6 Tower Units Grid (Options A–F) ── */}
      <div
        className={`grid gap-2 ${
          selectedOption === "all"
            ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
            : "grid-cols-1 w-full max-w-3xl mx-auto"
        }`}
      >
        {visibleUnits.map((unit) => (
          <div
            key={unit.key}
            id={`unit-card-${unit.key}`}
            className="bg-white rounded-lg border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col hover:border-slate-300 transition-colors"
          >
            {/* Unit Header (compact) */}
            <div className="px-3 py-1 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="font-mono font-black text-xs text-slate-100 tracking-wide">
                  {unit.label}
                </span>
                <span className="text-[9.5px] font-bold text-blue-200 bg-blue-900/80 px-1.5 py-0.2 rounded border border-blue-700/60 leading-tight">
                  Option {unit.option}
                </span>
              </div>
              <span className="text-[9.5px] font-semibold text-slate-300 uppercase tracking-wider">
                {unit.subLabel}
              </span>
            </div>

            {/* Unit Table */}
            <div className="p-1.5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="pb-1 text-left w-12 font-extrabold text-[10px] text-slate-500">
                      SHIFT
                    </th>
                    {PARAMETERS.map((p) => {
                      const limit = SA_T401_LIMITS[p.key];
                      return (
                        <th
                          key={p.key}
                          className="pb-1 text-center font-extrabold text-[10px] text-slate-700"
                        >
                          <div className="font-bold text-blue-700 leading-tight">{p.label}</div>
                          <div className="text-[8.5px] text-slate-500 font-semibold tracking-tight leading-none mt-0.5">
                            {limit ? limit.formattedRange.replace(" Kgm/m³", "") : "Kgm/m³"}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SHIFTS.map((shift) => {
                    const isDisabled = isShiftDisabled(unit.key, shift.key);
                    const shiftStatus = getShiftBadgeStatus(unit.key, shift.key);

                    return (
                      <tr
                        key={shift.key}
                        className={`transition-colors ${isDisabled ? 'bg-slate-50/70 opacity-90' : 'hover:bg-slate-50/80'}`}
                      >
                        {/* Shift Badge & Status */}
                        <td className="py-1 pr-1 align-middle">
                          <div className="flex flex-col items-center">
                            <span
                              className={`font-mono font-extrabold px-1.5 py-0.5 rounded text-[10px] border shadow-2xs inline-block text-center w-7 ${shift.badgeColor}`}
                              title={shift.title}
                            >
                              {shift.label}
                            </span>
                            <span
                              className={`text-[7.5px] font-black uppercase px-1 py-0.2 rounded border mt-0.5 whitespace-nowrap leading-none ${shiftStatus.color}`}
                            >
                              {shiftStatus.label}
                            </span>
                          </div>
                        </td>

                        {/* Inputs (FNH3, CNH3, TCl, PCl) */}
                        {PARAMETERS.map((param) => {
                          const cellVal = data[unit.key][shift.key][param.key];
                          const hasValue = cellVal !== "" && cellVal !== null && cellVal !== undefined;
                          const fieldKey = `${unit.key}_${shift.key}_${param.key}`;
                          const isFormatError = !!errors[fieldKey];
                          const isFieldEdited = Boolean(editedFields[unit.key]?.[shift.key]?.[param.key]);

                          const limit = getCellLimit("sa", "t401", shift.key, param.key) || SA_T401_LIMITS[param.key];
                          const validation = validateCellValue(cellVal, limit);
                          const isOutOfLimit = validation.isOutOfLimit;
                          const isNormal = validation.isNormal;

                          return (
                            <td key={param.key} className="py-0.5 px-0.5 text-center align-middle">
                              <div className="flex flex-col items-center justify-center mx-auto">
                                <div className="relative w-full max-w-[80px]">
                                  <input
                                    id={`t401-input-${unit.key}-${shift.key}-${param.key}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={cellVal}
                                    disabled={isDisabled}
                                    placeholder={param.placeholder}
                                    onChange={(e) =>
                                      handleCellChange(unit.key, shift.key, param.key, e.target.value)
                                    }
                                    title={
                                      isDisabled
                                        ? `Locked / Read-only (${shiftStatus.label})`
                                        : limit
                                        ? isOutOfLimit
                                          ? `OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                          : hasValue
                                          ? `NORMAL: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                          : `Allowed range: ${limit.formattedRange}`
                                        : param.label
                                    }
                                    className={`w-full px-1 py-0.5 h-6 text-xs font-mono font-bold text-center rounded-md transition-all focus:outline-none shadow-2xs ${
                                      isDisabled
                                        ? "bg-slate-100/90 text-slate-500 border border-slate-200 cursor-not-allowed"
                                        : isOutOfLimit
                                        ? "border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-1 focus:ring-rose-200"
                                        : isFormatError
                                        ? "border-red-500 bg-red-50 text-red-950 ring-1 ring-red-300"
                                        : hasValue && isNormal && limit
                                        ? "border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-1 focus:ring-emerald-200"
                                        : hasValue
                                        ? "border-2 border-blue-500 bg-blue-50/60 text-blue-900 font-extrabold focus:ring-1 focus:ring-blue-200"
                                        : "border border-slate-300 bg-white hover:border-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-100 text-slate-800"
                                    }`}
                                    aria-label={`Option ${unit.option} Shift ${shift.label} ${param.label}`}
                                  />
                                  {isOutOfLimit && (
                                    <span
                                      className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3 h-3 shadow-xs flex items-center justify-center pointer-events-none"
                                      title="Out of limit"
                                    >
                                      <AlertCircle className="w-2 h-2 text-white" />
                                    </span>
                                  )}
                                  {isFieldEdited && (
                                    <span
                                      id={`badge-edited-${unit.key}-${shift.key}-${param.key}`}
                                      className="absolute -top-1.5 -left-1 bg-amber-500 text-white text-[7px] font-black px-1 rounded shadow-2xs pointer-events-none tracking-tight uppercase"
                                      title="Field modified after initial save"
                                    >
                                      EDITED
                                    </span>
                                  )}
                                </div>

                                {/* Micro Status / Range */}
                                <div className="h-3 flex items-center justify-center mt-0.5">
                                  {isFormatError ? (
                                    <span className="text-[7.5px] text-red-600 font-extrabold leading-none">
                                      Invalid
                                    </span>
                                  ) : hasValue && isNormal && limit ? (
                                    <span
                                      id={`t401-status-${unit.key}-${shift.key}-${param.key}`}
                                      className="text-[8px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 leading-none"
                                    >
                                      <CheckCircle2 className="w-2 h-2 text-emerald-600 shrink-0" />
                                      <span>NORMAL</span>
                                    </span>
                                  ) : hasValue && isOutOfLimit ? (
                                    <span
                                      id={`t401-status-${unit.key}-${shift.key}-${param.key}`}
                                      className="px-1 py-0 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[7.5px] font-black tracking-tight whitespace-nowrap leading-none"
                                    >
                                      OUT OF LIMIT
                                    </span>
                                  ) : (
                                    <span
                                      id={`t401-range-${unit.key}-${shift.key}-${param.key}`}
                                      className="text-[8px] text-slate-400 font-medium leading-none"
                                    >
                                      {limit?.formattedRange ? limit.formattedRange.replace(" Kgm/m³", "") : ""}
                                    </span>
                                  )}
                                </div>
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
          </div>
        ))}
      </div>

      {/* ── Pre-Save Confirmation Modal ── */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden transform transition-all">
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-blue-400" />
                <h3 className="font-extrabold text-sm tracking-wide">Confirm T 401 Save</h3>
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
                Are you sure you want to save the following changes for <strong>{formatDateDisplay(confirmData.date)}</strong>?
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto space-y-2">
                {confirmData.changes.map((ch, idx) => (
                  <div key={idx} className="bg-white p-2.5 rounded border border-slate-200 text-xs shadow-2xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-blue-900">{ch.towerLabel} ({ch.shiftLabel})</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Option {ch.option}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                      {PARAMETERS.map((p) => (
                        <div key={p.key} className="bg-slate-50 p-1 rounded border border-slate-100">
                          <div className="text-[9px] text-slate-500 font-bold">{p.label}</div>
                          <div className="text-xs font-black text-slate-800">{ch.data[p.key] || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Saving will lock previous shifts according to sequential shift policy and dispatch email notifications to the assigned SA Plant operator.
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
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition shadow-xs cursor-pointer"
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

export default T401AnalysisPage;
