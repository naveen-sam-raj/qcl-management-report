import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/common/Toast";
import api from "../../services/api";
import { ArrowLeft, Calendar, Save, RotateCcw, CheckCircle2, AlertCircle, ChevronRight, Flame, Database } from "lucide-react";

const SHIFTS = [
  { key: "s1", label: "I", title: "I Shift (07:00 - 15:00)", rowClass: "bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600", badgeClass: "bg-sky-100 text-sky-800 border-sky-300", inputFocus: "border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400" },
  { key: "s2", label: "II", title: "II Shift (15:00 - 23:00)", rowClass: "bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600", badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300", inputFocus: "border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400" },
  { key: "s3", label: "III", title: "III Shift (23:00 - 07:00)", rowClass: "bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600", badgeClass: "bg-purple-100 text-purple-800 border-purple-300", inputFocus: "border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400" },
];

const isValidDecimal = (val) => val === "" || /^-?\d*\.?\d*$/.test(val);

const formatDateDisplay = (isoDate) => {
  if (!isoDate) return "-";
  try { return new Date(isoDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "2-digit" }); }
  catch { return isoDate; }
};

const buildEmptyData = (parameters) =>
  Object.fromEntries(SHIFTS.map((s) => [s.key, Object.fromEntries(parameters.map((p) => [p.key, ""]))]));

const DEFAULT_PARAMS = [
  { key: "fnh3", label: "FNH3", placeholder: "0.00" },
  { key: "cnh3", label: "CNH3", placeholder: "0.00" },
  { key: "tcl",  label: "TCl",  placeholder: "0.00" },
  { key: "nacl", label: "NaCl", placeholder: "0.00" },
];

const SATankShiftAnalysisPage = ({ tankName = "Tank Analysis", tankKey = "sa-tank", parameters = DEFAULT_PARAMS, plantId = "sa" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const basePath = user?.role === "user" ? "/portal" : "/admin/tfl";
  const [date, setDate] = useState("");
  const [data, setData] = useState(() => buildEmptyData(parameters));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dateError, setDateError] = useState(false);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (!record) {
             // Leave default
          } else if (record.shifts) {
            setData(record.shifts);
          } else if (record.readings && record.readings.length > 0) {
            setData(record.readings);
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


  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setData((prev) => ({ ...prev, [shiftKey]: { ...prev[shiftKey], [paramKey]: value } }));
    setErrors((prev) => { const next = { ...prev }; delete next[shiftKey + "_" + paramKey]; return next; });
    setSaveSuccess(false);
  }, []);

  const handleReset = useCallback(() => {
    setData(buildEmptyData(parameters));
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    showToast(tankName + " form cleared successfully.", "info");
  }, [showToast, parameters, tankName]);

  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};
    if (!date) { setDateError(true); isValid = false; } else { setDateError(false); }
    SHIFTS.forEach((s) => {
      parameters.forEach((p) => {
        const val = data[s.key][p.key];
        if (val !== "" && isNaN(Number(val))) { newErrors[s.key + "_" + p.key] = "Must be a valid number"; isValid = false; }
      });
    });
    setErrors(newErrors);
    return isValid;
  }, [date, data, parameters]);

  const handleSave = async () => {
    if (!validateForm()) { showToast("Please correct highlighted errors before saving.", "error"); return; }
    const hasData = SHIFTS.some((s) => parameters.some((p) => data[s.key][p.key] !== ""));
    if (!hasData) { showToast("Please enter at least one measurement value.", "warning"); return; }
    setSaving(true); setSaveSuccess(false);
    try {
      const payload = { date, plant: "SA", analysisType: tankName + " Analysis", tank: tankName, shifts: data, submittedBy: user?.name || "Plant Operator" };
      const response = await api.post("/api/" + tankKey + "-analysis", payload);
      setSaveSuccess(true);
      showToast(response.data?.message || tankName + " Analysis data saved successfully!", "success");
    } catch (err) {
      showToast(err.response?.data?.message || err.response?.data?.errors?.[0] || "Failed to save " + tankName + " Analysis data.", "error");
    } finally { setSaving(false); }
  };

  const displayTitle = tankName.toUpperCase() + " ANALYSIS";
  const paramSummary = parameters.map((p) => p.label).join(" / ");

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => navigate(basePath + "/plants/" + plantId)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer" title="Back">
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" /><span>Back</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Flame className="w-3.5 h-3.5 text-slate-400" /><span>SA Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">{tankName}</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">{displayTitle}</h1>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <label htmlFor={tankKey + "-date-input"} className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <span>Date:</span><span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input id={tankKey + "-date-input"} type="date" value={date} onChange={(e) => { setDate(e.target.value); setDateError(false); setSaveSuccess(false); }} className={"pl-7 pr-2 py-1 text-xs font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-800 bg-white " + (dateError ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-slate-300 hover:border-slate-400")} />
              </div>
              {date && <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">{formatDateDisplay(date)}</span>}
              {dateError && <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium"><AlertCircle className="w-3 h-3" /> Required</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button id={"btn-" + tankKey + "-reset"} onClick={handleReset} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200" title="Clear all fields">
              <RotateCcw className="w-3.5 h-3.5" /><span>Reset</span>
            </button>
            <button id={"btn-" + tankKey + "-save"} onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs disabled:opacity-60" title={"Save " + tankName + " data"}>
              {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? "Saving..." : "Save / Submit"}</span>
            </button>
          </div>
        </div>
      </div>
      {saveSuccess && (
        <div id={tankKey + "-success-banner"} className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs"><span className="font-bold text-emerald-800">Analysis Saved Successfully:</span>{" "}
            <span className="text-emerald-700">{tankName} Analysis for <strong>{formatDateDisplay(date)}</strong> has been recorded.</span>
          </div>
          <button onClick={() => setSaveSuccess(false)} className="ml-auto text-emerald-500 hover:text-emerald-700 transition text-base leading-none shrink-0" aria-label="Dismiss">x</button>
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden w-full">
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-blue-600" />
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">{tankName} - Data Entry</span>
          </div>
          <span className="text-[11px] font-bold text-slate-500">3 Shifts</span>
        </div>
        <div className="overflow-x-auto w-full table-responsive-container">
          <table className="w-full text-sm min-w-[700px] xl:min-w-full">
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-24 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">SHIFT</th>
                {parameters.map((p, idx) => (
                  <th key={p.key} className={"px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 " + (idx % 2 === 0 ? "bg-slate-900/95" : "bg-slate-900/85")}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => (
                <tr key={shift.key} className={"transition-colors duration-100 " + shift.rowClass}>
                  <td className="px-5 py-3 align-middle">
                    <span className={"font-mono font-extrabold px-2.5 py-1 rounded text-xs border shadow-2xs inline-block text-center min-w-[32px] " + shift.badgeClass} title={shift.title}>{shift.label}</span>
                  </td>
                  {parameters.map((param) => {
                    const fieldKey = shift.key + "_" + param.key;
                    const cellVal = data[shift.key][param.key];
                    const isInvalid = !!errors[fieldKey];
                    return (
                      <td key={param.key} className="px-4 py-2.5 text-center align-middle">
                        <input id={tankKey + "-input-" + shift.key + "-" + param.key} type="text" inputMode="decimal" value={cellVal} placeholder={param.placeholder || "0.00"} onChange={(e) => handleChange(shift.key, param.key, e.target.value)}
                          className={"w-full max-w-[120px] mx-auto px-3 py-1.5 text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs " + (isInvalid ? "border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200" : cellVal !== "" ? "border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200" : shift.inputFocus)}
                          aria-label={param.label + " for Shift " + shift.label} />
                        {isInvalid && <p className="text-[10px] text-red-600 font-bold mt-1 text-center animate-fadeIn">{errors[fieldKey]}</p>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span>Values for <strong>{tankName}</strong> ({paramSummary}). Numeric values only. Leave blank if not sampled.</span></div>
          <div className="font-mono text-[11px] text-slate-400">3 Shifts / SA Plant</div>
        </div>
      </div>
    </div>
  );
};

export default SATankShiftAnalysisPage;
