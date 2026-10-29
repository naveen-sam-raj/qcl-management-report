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
  Flame,
  Database,
  FlaskConical,
} from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';

// ─── SA Plant P417 Parameters & Validation Limits ────────────────────────────
// Plant: SA Plant ONLY
// Analysis: P417
// Frequency: Shift Twice (Separate entries for Shift I and Shift II)
//
// Parameters & Limits:
// 1. FNH3: Reference: 2.08 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.98 – 2.18 Kgm/m³
// 2. CNH3: Available without limits/tolerances
// 3. TCl:  Available without limits/tolerances
// 4. NaCl: Available without limits/tolerances

export const SA_P417_LIMITS = {
  fnh3: {
    key: "fnh3",
    paramName: "FNH3",
    label: "FNH₃",
    formula: "Free Ammonia (FNH₃)",
    target: 2.08,
    tolerance: 0.10,
    min: 1.98,
    max: 2.18,
    unit: "Kgm/m³",
    formattedRange: "1.98–2.18 Kgm/m³",
    formattedTarget: "2.08 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "2.08",
    hasLimit: true,
  },
  cnh3: {
    key: "cnh3",
    paramName: "CNH3",
    label: "CNH₃",
    formula: "Combined Ammonia (CNH₃)",
    unit: "",
    placeholder: "0.00",
    hasLimit: false,
  },
  tcl: {
    key: "tcl",
    paramName: "TCL",
    label: "TCl",
    formula: "Total Chlorine (T.Cl)",
    unit: "",
    placeholder: "0.00",
    hasLimit: false,
  },
  nacl: {
    key: "nacl",
    paramName: "NACL",
    label: "NaCl",
    formula: "Sodium Chloride (NaCl)",
    unit: "",
    placeholder: "0.00",
    hasLimit: false,
  },
};

const PARAMETERS = [
  { key: "fnh3", label: "FNH₃", formula: "Free Ammonia (FNH₃)", placeholder: "2.08", hasLimit: true },
  { key: "cnh3", label: "CNH₃", formula: "Combined Ammonia (CNH₃)", placeholder: "0.00", hasLimit: false },
  { key: "tcl",  label: "TCl",  formula: "Total Chlorine (T.Cl)",  placeholder: "0.00", hasLimit: false },
  { key: "nacl", label: "NaCl", formula: "Sodium Chloride (NaCl)", placeholder: "0.00", hasLimit: false },
];

const SHIFTS = [
  {
    key: "s1",
    label: "I SHIFT",
    time: "07:00 – 15:00",
    rowStyle: "bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600",
  },
  {
    key: "s2",
    label: "II SHIFT",
    time: "15:00 – 23:00",
    rowStyle: "bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600",
  },
  {
    key: "s3",
    label: "III SHIFT",
    time: "23:00 – 07:00",
    rowStyle: "bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600",
  },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFTS.map((s) => [
      s.key,
      Object.fromEntries(PARAMETERS.map((p) => [p.key, ""])),
    ])
  );

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

const P4171AnalysisPage = ({ plantId = "sa" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === "user" ? "/portal" : "/admin/tfl";

  // ── States ──
  const [date] = useState(() => getOperatingDateIST());
  const [data, setData] = useState(buildEmptyData());
  const [originalData, setOriginalData] = useState(null);
  const [lockedShifts, setLockedShifts] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/sa-p417-1-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (record?.lockedShifts) {
            setLockedShifts(record.lockedShifts);
          }
          if (!record) {
            setData(buildEmptyData());
            setOriginalData(buildEmptyData());
          } else if (record.shifts) {
            setData(record.shifts);
            setOriginalData(JSON.parse(JSON.stringify(record.shifts)));
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setData(record.readings);
            setOriginalData(JSON.parse(JSON.stringify(record.readings)));
          } else if (record.rows) {
            setData(record.rows);
            setOriginalData(JSON.parse(JSON.stringify(record.rows)));
          } else if (record.data && !Array.isArray(record.data)) {
            setData(record.data);
            setOriginalData(JSON.parse(JSON.stringify(record.data)));
          } else if (Array.isArray(record) && record.length > 0) {
            setData(record);
            setOriginalData(JSON.parse(JSON.stringify(record)));
          } else if (record.data && record.data.rows) {
            setData(record.data.rows);
            setOriginalData(JSON.parse(JSON.stringify(record.data.rows)));
          } else {
            setData(buildEmptyData());
            setOriginalData(buildEmptyData());
          }
        } else {
          setData(buildEmptyData());
          setOriginalData(buildEmptyData());
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
        setOriginalData(buildEmptyData());
      }
    };
    fetchExistingData();
  }, [date]);

  const isShiftDisabled = (shiftKey) => {
    if (user?.role === 'user') return true;
    if (shiftKey === 's1') {
      return Boolean(lockedShifts.s1) || Boolean(lockedShifts.s2Saved);
    }
    if (shiftKey === 's2') {
      if (!lockedShifts.s1Saved) return true;
      return Boolean(lockedShifts.s2) || Boolean(lockedShifts.s3Saved);
    }
    if (shiftKey === 's3') {
      if (!lockedShifts.s2Saved) return true;
      if (lockedShifts.s3) return true;
      if (lockedShifts.s3Saved && (lockedShifts.s3Edits || 0) >= 1) return true;
      return false;
    }
    return false;
  };

  const getActiveShiftKey = () => {
    const s1Changed = originalData?.s1 && Object.keys(data.s1 || {}).some(k => String(data.s1[k] ?? '') !== String(originalData.s1[k] ?? ''));
    if (s1Changed && !lockedShifts.s2Saved && !lockedShifts.s1) {
      return 's1';
    }
    const s2Changed = originalData?.s2 && Object.keys(data.s2 || {}).some(k => String(data.s2[k] ?? '') !== String(originalData.s2[k] ?? ''));
    if (s2Changed && lockedShifts.s1Saved && !lockedShifts.s3Saved && !lockedShifts.s2) {
      return 's2';
    }
    if (!lockedShifts.s1Saved) return 's1';
    if (!lockedShifts.s2Saved) return 's2';
    return 's3';
  };

  const getShiftBadge = (shiftId) => {
    let status = 'Waiting';
    let bg = 'bg-amber-100 text-amber-700';

    if (lockedShifts[shiftId]) {
      status = 'Locked';
      bg = 'bg-slate-200 text-slate-700';
    } else if (shiftId === 's1') {
      if (lockedShifts.s2Saved) {
        status = 'Locked';
        bg = 'bg-slate-200 text-slate-700';
      } else if (lockedShifts.s1Saved) {
        status = 'Editable';
        bg = 'bg-blue-100 text-blue-700';
      } else {
        status = 'OPEN';
        bg = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold';
      }
    } else if (shiftId === 's2') {
      if (!lockedShifts.s1Saved) {
        status = 'Waiting';
        bg = 'bg-amber-100 text-amber-700';
      } else if (lockedShifts.s3Saved) {
        status = 'Locked';
        bg = 'bg-slate-200 text-slate-700';
      } else if (lockedShifts.s2Saved) {
        status = 'Editable';
        bg = 'bg-blue-100 text-blue-700';
      } else {
        status = 'OPEN';
        bg = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold';
      }
    } else if (shiftId === 's3') {
      if (!lockedShifts.s2Saved) {
        status = 'Waiting';
        bg = 'bg-amber-100 text-amber-700';
      } else if (lockedShifts.s3Saved && (lockedShifts.s3Edits || 0) >= 1) {
        status = 'Locked';
        bg = 'bg-slate-200 text-slate-700';
      } else if (lockedShifts.s3Saved) {
        status = 'Final Edit Allowed';
        bg = 'bg-orange-100 text-orange-800 border border-orange-300';
      } else {
        status = 'OPEN';
        bg = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold';
      }
    }

    return (
      <span
        id={`p417-shift-badge-${shiftId}`}
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap shadow-2xs ${bg}`}
      >
        {status}
      </span>
    );
  };


  // ── Cell Value Change Handler ──
  const handleCellChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...(prev[shiftKey] || {}),
        [paramKey]: value,
      },
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${shiftKey}_${paramKey}`];
      return copy;
    });
    setSaveSuccess(false);
    setSavePhase('idle');
  }, []);

  // ── Reset Handler ──
  const handleReset = useCallback(() => {
    setData(buildEmptyData());
    setErrors({});
    setSaveSuccess(false);
    showToast?.("P417 form cleared successfully.", "info");
  }, [showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    if (!date) {
      isValid = false;
    }

    SHIFTS.forEach((s) => {
      PARAMETERS.forEach((p) => {
        const val = data[s.key]?.[p.key];
        if (val !== "" && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            newErrors[`${s.key}_${p.key}`] = "Invalid number";
            isValid = false;
          }
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [date, data]);

  // ── Save Handler ──
  const handleSave = async () => {
    if (!date) {
      showToast?.("Please select an analysis date.", "warning");
      return;
    }

    if (!validateForm()) {
      showToast?.("Please correct highlighted errors before saving.", "error");
      return;
    }

    const hasAnyValue = SHIFTS.some((s) =>
      PARAMETERS.some((p) => {
        const val = data[s.key]?.[p.key];
        return val !== "" && val !== null && val !== undefined;
      })
    );

    if (!hasAnyValue) {
      showToast?.("Please enter at least one measurement value for P417.", "warning");
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    setSavePhase('saving');

    try {
      const shiftKey = getActiveShiftKey();
      const payload = {
        date,
        shiftKey,
        plant: "SA",
        analysisType: "P417 Analysis",
        tank: "P417",
        frequency: "Shift Twice",
        shifts: data,
        rows: data,
        parameters: data[shiftKey] || data.s1 || {},
        submittedBy: user?.name || "Plant Operator",
      };

      const response = await api.post("/api/sa-p417-1-analysis", payload);

      if (response.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes detected — shift already up to date.', 'info');
        return;
      }

      setSaveSuccess(true);
      const savedDoc = response.data?.data;
      if (savedDoc?.lockedShifts) {
        setLockedShifts(savedDoc.lockedShifts);
      }
      if (savedDoc?.shifts || savedDoc?.rows) {
        const docRows = savedDoc.shifts || savedDoc.rows;
        const synced = buildEmptyData();
        SHIFTS.forEach((s) => {
          if (docRows[s.key]) {
            PARAMETERS.forEach((p) => {
              const val = docRows[s.key][p.key];
              synced[s.key][p.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setData(synced);
        setOriginalData(JSON.parse(JSON.stringify(synced)));
      }

      const emailRes = response.data?.emailNotification;
      const emailSent = response.data?.emailSent;
      const statusFromApi = response.data?.emailStatus;
      const emailErrMsg = emailRes?.error || response.data?.emailError || emailRes?.status || '';

      const recipient = response.data?.emailNotification?.recipient ||
                        response.data?.notificationRecipient ||
                        response.data?.recipientEmail ||
                        response.data?.emailRecipient ||
                        response.data?.recipient || '';
      setRecipientEmail(recipient);

      if (emailSent || statusFromApi === 'sent') {
        setSavePhase('completed');
        setEmailStatusDetail(emailRes?.response || 'Delivered to SMTP server ✓');
        showToast?.(response.data?.message || 'Saved — Email Sent ✓', 'success');
      } else if (statusFromApi === 'disabled') {
        setSavePhase('completed');
        setEmailStatusDetail('Email disabled');
        showToast?.('Saved ✓', 'success');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailErrMsg || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (emailErrMsg || 'Server error'), 'warning');
      }
    } catch (err) {
      console.error("[P417Analysis] Save failed:", err);
      setSavePhase('save_failed');
      setSaveSuccess(false);
      const serverMessage =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        err.message ||
        "Failed to save P417 Analysis data.";
      showToast?.("Save Error: " + serverMessage, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb & Top Navigation ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Back button + Breadcrumb + Title */}
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
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-indigo-600 font-semibold">P417</span>
                <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                  Shift Twice
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                P417 ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-p417-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
              title="Reset input fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <StatusSaveButton
              id="btn-p417-save"
              saving={saving}
              savePhase={savePhase}
              saveSuccess={saveSuccess}
              onClick={handleSave}
              defaultLabel="Save Analysis"
              title="Save P417 Analysis"
              alwaysShowSaveText={true}
            />
          </div>
        </div>
      </div>

      {/* ── Status Banner ── */}
      <SaveStatusBanner
        id="p417-success-banner"
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="P417 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Main Data Card ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Bar with Integrated Date Selector */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
                P417 Shift Measurements
              </h2>
            </div>

            {/* Operating Day Display */}
            <LockedDateDisplay date={date} id="p4171-date-display" badgeText="Operating Day" />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>Frequency: Shift Twice</span>
            <span>•</span>
            <span>FNH₃ Limit: 1.98 – 2.18 Kgm/m³</span>
          </div>
        </div>

        {/* The Analysis Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-5 w-44 border-r border-slate-800">
                  Shift / Schedule
                </th>
                {PARAMETERS.map((param) => {
                  return (
                    <th
                      key={param.key}
                      className="py-3 px-4 text-center border-r border-slate-800 min-w-[140px] last:border-r-0"
                    >
                      <div className="font-extrabold text-indigo-300 text-xs">
                        {param.label}
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        {param.hasLimit ? "Kgm/m³" : "—"}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {SHIFTS.map((shift) => (
                <tr key={shift.key} className="hover:bg-slate-50/80 transition-colors">
                  {/* Shift Label & Status Badge */}
                  <td className="py-3 px-5 border-r border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                        <div>
                          <span className="font-extrabold text-slate-900 text-xs tracking-wide">
                            {shift.label}
                          </span>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {shift.time}
                          </div>
                        </div>
                      </div>
                      {getShiftBadge(shift.key)}
                    </div>
                  </td>

                  {/* Parameter Cells */}
                  {PARAMETERS.map((param) => {
                    const cellVal = data[shift.key]?.[param.key] ?? "";
                    const hasValue = cellVal !== "" && cellVal !== null && cellVal !== undefined;
                    const limit = param.hasLimit
                      ? getCellLimit("sa", "p417", shift.key, param.key) || SA_P417_LIMITS[param.key]
                      : null;
                    const validation = validateCellValue(cellVal, limit);
                    const isOutOfLimit = validation.isOutOfLimit;
                    const isNormal = validation.isNormal;
                    const isFormatError = !!errors[`${shift.key}_${param.key}`];

                    return (
                      <td
                        key={param.key}
                        className="py-3 px-4 border-r border-slate-100 last:border-r-0 text-center align-top"
                      >
                        <div className="flex flex-col items-center justify-start min-h-[62px] max-w-[140px] mx-auto">
                          <div className="relative w-full">
                            <input
                              id={`p417-input-${shift.key}-${param.key}`}
                              type="text"
                              inputMode="decimal"
                              value={cellVal}
                              onChange={(e) => handleCellChange(shift.key, param.key, e.target.value)}
                              placeholder={param.placeholder}
                              title={
                                limit
                                  ? isOutOfLimit
                                    ? `OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                    : hasValue
                                    ? `NORMAL: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                    : `Allowed range: ${limit.formattedRange}`
                                  : param.label
                              }
                              disabled={isShiftDisabled(shift.key)}
                              className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs focus:outline-none ${
                                isShiftDisabled(shift.key)
                                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none"
                                  : isOutOfLimit
                                  ? "border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
                                  : isFormatError
                                  ? "border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300"
                                  : hasValue && isNormal && limit
                                  ? "border-2 border-emerald-500 bg-emerald-50/50 text-emerald-950 font-extrabold focus:ring-2 focus:ring-emerald-200"
                                  : hasValue
                                  ? "border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200"
                                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                              }`}
                            />
                            {isOutOfLimit && (
                              <span
                                className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                title="Out of limit"
                              >
                                <AlertCircle className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                          </div>

                          {/* Error Message */}
                          {isFormatError && (
                            <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                              <span>Invalid number</span>
                            </div>
                          )}

                          {/* Status and Allowed Range Display */}
                          {!isFormatError && (
                            <div className="mt-1 flex flex-col items-center justify-center">
                              {hasValue && isNormal && limit && (
                                <span
                                  id={`p417-status-${shift.key}-${param.key}`}
                                  className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                  title={`NORMAL: within ${limit?.formattedRange || ""}`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>NORMAL</span>
                                </span>
                              )}

                              {hasValue && isOutOfLimit && (
                                <span
                                  id={`p417-status-${shift.key}-${param.key}`}
                                  className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                  title={`OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit?.formattedRange || ""})`}
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                  <span>OUT OF LIMIT</span>
                                </span>
                              )}

                              {/* Allowed range displayed below each applicable input field */}
                              {limit?.formattedRange && (
                                <span
                                  id={`p417-range-${shift.key}-${param.key}`}
                                  className={`text-[9.5px] font-semibold mt-0.5 tracking-tight ${
                                    isOutOfLimit
                                      ? "text-rose-700 font-bold"
                                      : hasValue
                                      ? "text-slate-600 font-bold"
                                      : "text-slate-400"
                                  }`}
                                  title={`Target: ${limit?.formattedTarget || ""} (${limit?.formattedTolerance || ""})`}
                                >
                                  {limit?.formattedRange}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Card Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">P417 Shift Analysis:</span>
            <span>Frequency: Shift Twice • Parameters: FNH₃ (Limit: 1.98–2.18 Kgm/m³), CNH₃, TCl, NaCl</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">One correction allowed after first save; saving the next shift locks the previous one.</div>
        </div>
      </div>
    </div>
  );
};

export default P4171AnalysisPage;
