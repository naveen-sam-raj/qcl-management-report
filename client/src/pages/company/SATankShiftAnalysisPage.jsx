import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/common/Toast";
import api from "../../services/api";
import { ArrowLeft, Calendar, Save, RotateCcw, CheckCircle2, AlertCircle, ChevronRight, Flame, Database } from 'lucide-react';
import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';

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
  const [date] = useState(() => getOperatingDateIST());
  const [data, setData] = useState(() => buildEmptyData(parameters));
  const [originalData, setOriginalData] = useState(null);
  const [lockedShifts, setLockedShifts] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [dateError, setDateError] = useState(false);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/${tankKey}-analysis?date=${date}`);
        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          
          if (record?.lockedShifts) {
            setLockedShifts(record.lockedShifts);
          }
          if (!record) {
            setData(buildEmptyData(parameters));
            setOriginalData(buildEmptyData(parameters));
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
            setData(buildEmptyData(parameters));
            setOriginalData(buildEmptyData(parameters));
          }
        } else {
          setData(buildEmptyData(parameters));
          setOriginalData(buildEmptyData(parameters));
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData(parameters));
        setOriginalData(buildEmptyData(parameters));
      }
    };
    fetchExistingData();
  }, [date, tankKey, parameters]);

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
        id={tankKey + "-shift-badge-" + shiftId}
        className={"text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap shadow-2xs " + bg}
      >
        {status}
      </span>
    );
  };


  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (!isValidDecimal(value)) return;
    setData((prev) => ({ ...prev, [shiftKey]: { ...prev[shiftKey], [paramKey]: value } }));
    setErrors((prev) => { const next = { ...prev }; delete next[shiftKey + "_" + paramKey]; return next; });
    setSaveSuccess(false);
    setSavePhase('idle');
  }, []);

  const handleReset = useCallback(() => {
    setData(buildEmptyData(parameters));
    setErrors({});
    setDateError(false);
    setSaveSuccess(false);
    setSavePhase('idle');
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
    setSaving(true);
    setSaveSuccess(false);
    setSavePhase('saving');
    try {
      const shiftKey = getActiveShiftKey();
      const payload = {
        date,
        shiftKey,
        plant: "SA",
        analysisType: tankName + " Analysis",
        tank: tankName,
        shifts: data,
        rows: data,
        parameters: data[shiftKey] || data.s1 || {},
        submittedBy: user?.name || "Plant Operator",
      };
      const response = await api.post("/api/" + tankKey + "-analysis", payload);

      if (response.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast("No changes detected — shift already up to date.", "info");
        return;
      }

      setSaveSuccess(true);
      const savedDoc = response.data?.data;
      if (savedDoc?.lockedShifts) {
        setLockedShifts(savedDoc.lockedShifts);
      }
      if (savedDoc?.shifts || savedDoc?.rows) {
        const docRows = savedDoc.shifts || savedDoc.rows;
        const synced = buildEmptyData(parameters);
        SHIFTS.forEach((s) => {
          if (docRows[s.key]) {
            parameters.forEach((p) => {
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
        showToast(response.data?.message || tankName + " Analysis data saved successfully!", "success");
      } else if (statusFromApi === 'disabled') {
        setSavePhase('completed');
        setEmailStatusDetail('Email disabled');
        showToast(response.data?.message || tankName + " Analysis data saved successfully!", "success");
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailErrMsg || 'Email delivery failed');
        showToast('Data saved to database. Email delivery failed: ' + (emailErrMsg || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('save_failed');
      setSaveSuccess(false);
      showToast(err.response?.data?.message || err.response?.data?.errors?.[0] || "Failed to save " + tankName + " Analysis data.", "error");
    } finally {
      setSaving(false);
    }
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
            <LockedDateDisplay date={date} id={tankKey + "-date-display"} badgeText="Operating Day" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button id={"btn-" + tankKey + "-reset"} onClick={handleReset} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200" title="Clear all fields">
              <RotateCcw className="w-3.5 h-3.5" /><span>Reset</span>
            </button>
            <StatusSaveButton
              id={"btn-" + tankKey + "-save"}
              saving={saving}
              savePhase={savePhase}
              saveSuccess={saveSuccess}
              onClick={handleSave}
              defaultLabel="Save / Submit"
              title={"Save " + tankName + " data"}
              alwaysShowSaveText={true}
            />
          </div>
        </div>
      </div>
      <SaveStatusBanner
        id={tankKey + "-success-banner"}
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName={tankName + " Analysis"}
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />
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
                    <div className="flex items-center gap-2">
                      <span className={"font-mono font-extrabold px-2.5 py-1 rounded text-xs border shadow-2xs inline-block text-center min-w-[32px] " + shift.badgeClass} title={shift.title}>{shift.label}</span>
                      {getShiftBadge(shift.key)}
                    </div>
                  </td>
                  {parameters.map((param) => {
                    const fieldKey = shift.key + "_" + param.key;
                    const cellVal = data[shift.key][param.key];
                    const isInvalid = !!errors[fieldKey];
                    return (
                      <td key={param.key} className="px-4 py-2.5 text-center align-middle">
                        <input id={tankKey + "-input-" + shift.key + "-" + param.key} type="text" inputMode="decimal" value={cellVal} placeholder={param.placeholder || "0.00"} onChange={(e) => handleChange(shift.key, param.key, e.target.value)}
                          disabled={isShiftDisabled(shift.key)}
                          className={"w-full max-w-[120px] mx-auto px-3 py-1.5 text-sm font-mono font-bold text-center rounded-lg transition-all focus:outline-none shadow-2xs " + (isShiftDisabled(shift.key) ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none" : isInvalid ? "border-2 border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200" : cellVal !== "" ? "border-2 border-blue-500 bg-blue-50/50 text-blue-900 font-extrabold focus:ring-2 focus:ring-blue-200" : shift.inputFocus)}
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
          <div className="text-[11px] text-slate-500 font-medium">One correction allowed after first save; saving the next shift locks the previous one.</div>
        </div>
      </div>
    </div>
  );
};

export default SATankShiftAnalysisPage;
