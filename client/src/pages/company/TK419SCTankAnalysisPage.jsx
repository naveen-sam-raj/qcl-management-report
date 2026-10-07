import React, { useState, useCallback } from "react";
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
} from "lucide-react";

// ─── SA Plant TK 419 Parameters & Validation Limits ──────────────────────────
// Plant: SA Plant ONLY
// Analysis: TK419 / TK 419 SC TANK
// Frequency: Once in a Shift (I Shift, II Shift, III Shift)
//
// Parameters & Limits:
// 1. FNH3: Reference: 2.08 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.98 – 2.18 Kgm/m³
// 2. CNH3: Reference: 4.06 Kgm/m³, Tolerance: ±0.10, Valid Range: 3.96 – 4.16 Kgm/m³
// 3. TCL:  Reference: 5.41 Kgm/m³, Tolerance: ±0.10, Valid Range: 5.31 – 5.51 Kgm/m³
// 4. PCL:  Reference: 1.35 Kgm/m³, Tolerance: ±0.10, Valid Range: 1.25 – 1.45 Kgm/m³

export const SA_TK419_LIMITS = {
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
    target: 4.06,
    tolerance: 0.10,
    min: 3.96,
    max: 4.16,
    unit: "Kgm/m³",
    formattedRange: "3.96–4.16 Kgm/m³",
    formattedTarget: "4.06 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "4.06",
    hasLimit: true,
  },
  tcl: {
    key: "tcl",
    paramName: "TCL",
    label: "TCl",
    formula: "Total Chlorine (T.Cl)",
    target: 5.41,
    tolerance: 0.10,
    min: 5.31,
    max: 5.51,
    unit: "Kgm/m³",
    formattedRange: "5.31–5.51 Kgm/m³",
    formattedTarget: "5.41 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "5.41",
    hasLimit: true,
  },
  pcl: {
    key: "pcl",
    paramName: "PCL",
    label: "PCl",
    formula: "Polymer Chloride (P.Cl)",
    target: 1.35,
    tolerance: 0.10,
    min: 1.25,
    max: 1.45,
    unit: "Kgm/m³",
    formattedRange: "1.25–1.45 Kgm/m³",
    formattedTarget: "1.35 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "1.35",
    hasLimit: true,
  },
};

const PARAMETERS = [
  { key: "fnh3", label: "FNH₃", formula: "Free Ammonia (FNH₃)", placeholder: "2.08", hasLimit: true },
  { key: "cnh3", label: "CNH₃", formula: "Combined Ammonia (CNH₃)", placeholder: "4.06", hasLimit: true },
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

const TK419SCTankAnalysisPage = ({ plantId = "sa" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === "user" ? "/portal" : "/admin/tfl";

  // ── States ──
  const [date, setDate] = useState("");
  const [data, setData] = useState(buildEmptyData());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
  }, []);

  // ── Reset Handler ──
  const handleReset = useCallback(() => {
    setData(buildEmptyData());
    setErrors({});
    setSaveSuccess(false);
    showToast?.("TK 419 form cleared successfully.", "info");
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
      showToast?.("Please enter at least one measurement value for TK 419.", "warning");
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: "SA",
        analysisType: "TK 419 SC TANK Analysis",
        tank: "TK 419 SC TANK",
        frequency: "Once in a Shift",
        shifts: data,
        rows: data,
        parameters: data.s1 || {},
        submittedBy: user?.name || "Plant Operator",
      };

      const response = await api.post("/api/sa-tk-419-sc-analysis", payload);
      setSaveSuccess(true);
      showToast?.(response.data?.message || "TK 419 SC TANK Analysis data saved successfully!", "success");
    } catch (err) {
      console.error("[TK419SCTankAnalysis] Save failed:", err);
      const serverMessage =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        err.message ||
        "Failed to save TK 419 Analysis data.";
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
                <span className="text-indigo-600 font-semibold">TK 419 SC TANK</span>
                <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                  Once in a Shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                TK 419 SC TANK ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-tk419-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer"
              title="Reset input fields"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-tk419-save"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                saveSuccess
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {saveSuccess && (
        <div
          id="tk419-success-banner"
          className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-bold shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>TK 419 SC TANK Analysis data saved successfully to database!</span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-700 hover:text-emerald-900 font-extrabold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main Data Card ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Bar with Integrated Date Selector */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
                TK 419 Shift Measurements
              </h2>
            </div>

            {/* Date Input */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="tk419-date-input"
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <Calendar className="w-3 h-3 text-indigo-600" />
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                id="tk419-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-2.5 pr-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-700 bg-white shadow-2xs hover:border-slate-400 transition"
                required
              />
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium bg-slate-200/60 px-2 py-0.5 rounded-md">
                {formatDateDisplay(date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>Frequency: Once in a Shift</span>
            <span>•</span>
            <span>Unit: Kgm/m³</span>
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
                        Kgm/m³
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {SHIFTS.map((shift) => (
                <tr key={shift.key} className="hover:bg-slate-50/80 transition-colors">
                  {/* Shift Label */}
                  <td className="py-3 px-5 border-r border-slate-100 bg-slate-50/50">
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
                  </td>

                  {/* Parameter Cells */}
                  {PARAMETERS.map((param) => {
                    const cellVal = data[shift.key]?.[param.key] ?? "";
                    const hasValue = cellVal !== "" && cellVal !== null && cellVal !== undefined;
                    const limit = getCellLimit("sa", "tk419", shift.key, param.key) || SA_TK419_LIMITS[param.key];
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
                              id={`tk419-input-${shift.key}-${param.key}`}
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
                              className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs focus:outline-none ${
                                isOutOfLimit
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
                                  id={`tk419-status-${shift.key}-${param.key}`}
                                  className="text-[10px] text-emerald-700 font-black tracking-tight flex items-center justify-center gap-0.5 animate-fadeIn"
                                  title={`NORMAL: within ${limit?.formattedRange || ""}`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>NORMAL</span>
                                </span>
                              )}

                              {hasValue && isOutOfLimit && (
                                <span
                                  id={`tk419-status-${shift.key}-${param.key}`}
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
                                  id={`tk419-range-${shift.key}-${param.key}`}
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
            <span className="font-semibold text-slate-700">TK 419 Shift Analysis:</span>
            <span>Frequency: Once in a Shift • Parameters: FNH₃, CNH₃</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TK419SCTankAnalysisPage;
