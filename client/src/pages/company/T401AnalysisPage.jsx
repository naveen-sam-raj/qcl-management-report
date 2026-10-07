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
} from "lucide-react";

// ─── SA Plant T 401 Parameters & Validation Limits ───────────────────────────
// Plant: SA Plant
// Analysis: T401
// Options: A, B, C, D, E, F
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
  { key: "s1", label: "I",   title: "I Shift (07:00 – 15:00)",  badgeColor: "bg-sky-100 text-sky-800 border-sky-300" },
  { key: "s2", label: "II",  title: "II Shift (15:00 – 23:00)", badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { key: "s3", label: "III", title: "III Shift (23:00 – 07:00)", badgeColor: "bg-purple-100 text-purple-800 border-purple-300" },
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

  const basePath = user?.role === "user" ? "/portal" : "/admin/tfl";

  // ── States ──
  const [date, setDate]                     = useState("");
  const [data, setData]                     = useState(buildEmptyData());
  const [errors, setErrors]                 = useState({});
  const [saving, setSaving]                 = useState(false);
  const [saveSuccess, setSaveSuccess]       = useState(false);
  const [dateError, setDateError]           = useState(false);
  const [selectedOption, setSelectedOption] = useState("all");

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/t-401-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.rows) {
            setData(record.rows);
          } else if (record.data && !Array.isArray(record.data)) {
            setData(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setData(record);
          } else if (record.data && record.data.rows) {
            setData(record.data.rows);
          } else {
            // Leave default
          }
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
      }
    };
    fetchExistingData();
  }, [date]);


  // ── Input Changes ──
  const handleCellChange = useCallback((unitKey, shiftKey, paramKey, value) => {
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
  }, []);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setData(buildEmptyData());
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast?.("T 401 analysis form cleared successfully.", "info");
  }, [showToast]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    if (!date) {
      setDateError(true);
      isValid = false;
    } else {
      setDateError(false);
    }

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
  }, [date, data]);

  // ── Save / Submit ──
  const handleSave = async () => {
    if (!validateForm()) {
      showToast?.("Please correct highlighted errors before saving.", "error");
      return;
    }

    const hasData = UNITS.some((u) =>
      SHIFTS.some((s) =>
        PARAMETERS.some((p) => data[u.key][s.key][p.key] !== "")
      )
    );

    if (!hasData) {
      showToast?.("Please enter at least one measurement value for T 401.", "warning");
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        date,
        plant: "SA",
        analysisType: "T 401 Analysis",
        tower: "T 401",
        frequency: "Once in a Shift",
        units: data,
        submittedBy: user?.name || "Plant Operator",
      };

      const response = await api.post("/api/t-401-analysis", payload);

      setSaveSuccess(true);
      showToast?.(response.data?.message || "T 401 Analysis data saved successfully!", "success");
    } catch (err) {
      console.error("[T401Analysis] Save failed:", err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        err.message ||
        "Failed to save T 401 Analysis data.";
      showToast?.(msg, "error");
    } finally {
      setSaving(false);
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

            {/* Date Input inside Header */}
            <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
              <label
                htmlFor="t401-date-input"
                className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-0.5"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                id="t401-date-input"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateError(false);
                  setSaveSuccess(false);
                }}
                className={`px-2 py-0.5 text-xs font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 h-7 ${
                  dateError
                    ? "border-red-400 bg-red-50 focus:ring-red-400"
                    : "border-slate-300 bg-white hover:border-slate-400"
                }`}
                required
              />
              {date && (
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-md leading-none h-7">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {formatDateDisplay(date)}
                </span>
              )}
              {dateError && (
                <span className="text-[10px] text-red-500 font-bold">Required</span>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-t401-reset"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer h-7"
              title="Clear all fields"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            <button
              id="btn-t401-save"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer h-7 ${
                saveSuccess
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              title="Save T 401 data"
            >
              {saving ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                  <span>Save / Submit</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Success Banner ── */}
      {saveSuccess && (
        <div
          id="t401-success-banner"
          className="flex items-center gap-2.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg shadow-2xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="text-xs text-emerald-800 font-medium">
            <span className="font-bold">Saved:</span> T 401 Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 text-sm leading-none shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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

      {/* ── 6 Tower Units Grid (3 Columns x 2 Rows, compact fit on single screen without scrolling) ── */}
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
                    <th className="pb-1 text-left w-10 font-extrabold text-[10px] text-slate-500">
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
                  {SHIFTS.map((shift) => (
                    <tr
                      key={shift.key}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Shift Badge */}
                      <td className="py-1 pr-1 align-middle">
                        <span
                          className={`font-mono font-extrabold px-1.5 py-0.5 rounded text-[10px] border shadow-2xs inline-block text-center w-7 ${shift.badgeColor}`}
                          title={shift.title}
                        >
                          {shift.label}
                        </span>
                      </td>

                      {/* Inputs (FNH3, CNH3, TCl, PCl) */}
                      {PARAMETERS.map((param) => {
                        const cellVal = data[unit.key][shift.key][param.key];
                        const hasValue = cellVal !== "" && cellVal !== null && cellVal !== undefined;
                        const fieldKey = `${unit.key}_${shift.key}_${param.key}`;
                        const isFormatError = !!errors[fieldKey];

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
                                  placeholder={param.placeholder}
                                  onChange={(e) =>
                                    handleCellChange(unit.key, shift.key, param.key, e.target.value)
                                  }
                                  title={
                                    limit
                                      ? isOutOfLimit
                                        ? `OUT OF LIMIT: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                        : hasValue
                                        ? `NORMAL: ${cellVal} Kgm/m³ (Allowed: ${limit.formattedRange})`
                                        : `Allowed range: ${limit.formattedRange}`
                                      : param.label
                                  }
                                  className={`w-full px-1 py-0.5 h-6 text-xs font-mono font-bold text-center rounded-md transition-all focus:outline-none shadow-2xs ${
                                    isOutOfLimit
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default T401AnalysisPage;
