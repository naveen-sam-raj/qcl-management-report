import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  getCellLimit,
  validateCellValue,
} from '../../services/analysisValidation';
import {
  ArrowLeft,
  RotateCcw,
  AlertCircle,
  ChevronRight,
  Gauge,
  Database,
  FlaskConical,
} from 'lucide-react';
import {
  getTodayAsiaKolkata,
  formatDateDisplay,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  retryAnalysisEmail,
} from '../../utils/co2AnalysisHelper';

// ─── TK1252 Configuration ─────────────────────────────────────────────────────
// Plant: CO2 Plant ONLY
// Analysis: TK1252
// Frequency: Once in a shift
// Parameters and allowed ranges:
// 1. pH: Allowed range 8.0–9.5 (Unit: no unit)
// 2. ALK: Allowed range 2–5 g/L (Unit: g/L)
// TABLE: TIME | pH | ALK

const PARAMETERS = [
  {
    key: 'ph',
    label: 'pH',
    formula: 'pH Value',
    unit: '',
    range: '8.0–9.5',
    placeholder: '8.5',
    colClass: 'min-w-[170px]',
  },
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (g/L)',
    unit: 'g/L',
    range: '2–5 g/L',
    placeholder: '3.0',
    colClass: 'min-w-[170px]',
  },
];

const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    SHIFT_ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const getRowStyles = (shiftId) => {
  if (shiftId === 'shift1')
    return {
      row: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
      inputFocus:
        'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
    };
  if (shiftId === 'shift2')
    return {
      row: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
      inputFocus:
        'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
    };
  return {
    row: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus:
      'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  };
};

const TK1252AnalysisPage = ({ plantId = 'co2' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  const [date] = useState(() => getTodayAsiaKolkata());
  const [data, setData] = useState(buildEmptyData());
  const [originalData, setOriginalData] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [lockedShifts, setLockedShifts] = useState({});
  const [editedFields, setEditedFields] = useState({});

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const isShiftDisabled = useCallback(
    (shiftKey) => {
      if (isViewOnly) return true;
      if (shiftKey === 'shift1') {
        return Boolean(lockedShifts.shift1) || Boolean(lockedShifts.shift2Saved);
      }
      if (shiftKey === 'shift2') {
        if (!lockedShifts.shift1Saved) return true;
        return Boolean(lockedShifts.shift2) || Boolean(lockedShifts.shift3Saved);
      }
      if (shiftKey === 'shift3') {
        if (!lockedShifts.shift2Saved) return true;
        if (lockedShifts.shift3) return true;
        if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
        return false;
      }
      return true;
    },
    [isViewOnly, lockedShifts]
  );

  const getShiftStatus = useCallback(
    (shiftKey) => {
      if (shiftKey === 'shift1') {
        if (lockedShifts.shift1 || lockedShifts.shift2Saved) return 'LOCKED';
        if (lockedShifts.shift1Saved) return 'EDITABLE';
        return 'NEW';
      }
      if (shiftKey === 'shift2') {
        if (lockedShifts.shift2 || lockedShifts.shift3Saved) return 'LOCKED';
        if (lockedShifts.shift2Saved) return 'EDITABLE';
        if (lockedShifts.shift1Saved) return 'EDITABLE';
        return 'WAITING';
      }
      if (shiftKey === 'shift3') {
        if (lockedShifts.shift3 || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1))
          return 'LOCKED';
        if (lockedShifts.shift3Saved) return 'EDITABLE';
        if (lockedShifts.shift2Saved) return 'EDITABLE';
        return 'WAITING';
      }
      return 'WAITING';
    },
    [lockedShifts]
  );

  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/tk1252-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
        }
        if (response.data?.emailStatus) {
          if (response.data.emailStatus === 'sent') setSavePhase('completed');
          else if (response.data.emailStatus === 'failed') setSavePhase('email_failed');
          else setSavePhase('email_pending');
        }

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;

          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }

          if (record) {
            const fetchedRows =
              record.rows || record.shifts || record.readings || record.data?.rows || record.data;
            if (fetchedRows && typeof fetchedRows === 'object') {
              const populated = buildEmptyData();
              SHIFT_ROWS.forEach((shift) => {
                if (fetchedRows[shift.key]) {
                  PARAMETERS.forEach((p) => {
                    const val = fetchedRows[shift.key][p.key];
                    populated[shift.key][p.key] =
                      val !== null && val !== undefined ? String(val) : '';
                  });
                }
              });
              setData(populated);
              setOriginalData(JSON.parse(JSON.stringify(populated)));
            } else {
              setData(buildEmptyData());
              setOriginalData(null);
            }

            setLockedShifts(record.lockedShifts || record.data?.lockedShifts || {});
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setLockedShifts({});
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setLockedShifts({});
        setEditedFields({});
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  const handleChange = useCallback(
    (rowKey, paramKey, value) => {
      if (!isValidDecimal(value)) return;
      if (isShiftDisabled(rowKey)) return;

      setData((prev) => ({
        ...prev,
        [rowKey]: {
          ...(prev[rowKey] || {}),
          [paramKey]: value,
        },
      }));

      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${rowKey}_${paramKey}`];
        return next;
      });
      setSaveSuccess(false);
    },
    [isShiftDisabled]
  );

  const handleReset = useCallback(() => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.('TK1252 analysis form reset.', 'info');
  }, [originalData, showToast]);

  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    SHIFT_ROWS.forEach((row) => {
      PARAMETERS.forEach((p) => {
        const val = data[row.key]?.[p.key];
        if (val !== '' && val !== null && val !== undefined) {
          const num = Number(val);
          if (isNaN(num)) {
            newErrors[`${row.key}_${p.key}`] = 'Must be a valid number';
            isValid = false;
          }
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  }, [data]);

  const isShiftDiff = (oldShift, newShift) => {
    if (!oldShift && newShift) return true;
    if (oldShift && !newShift) return false;
    return PARAMETERS.some((p) => {
      let oldVal = oldShift?.[p.key] ?? null;
      let newVal = newShift?.[p.key] ?? null;
      if (newVal === '') newVal = null;
      if (oldVal !== null && newVal !== null && !isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
        return Number(oldVal) !== Number(newVal);
      }
      return String(oldVal) !== String(newVal);
    });
  };

  const handleSaveClick = () => {
    if (isViewOnly) return;
    if (!validateForm()) {
      showToast?.('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const shiftsToSave = [];
    let isFinalEdit = false;

    SHIFT_ROWS.forEach((shift) => {
      if (isShiftDisabled(shift.key)) return;

      const currentShiftData = data[shift.key];
      const hasAnyValue =
        currentShiftData &&
        Object.values(currentShiftData).some((v) => v !== '' && v !== null && v !== undefined);
      const oldShiftData = originalData ? originalData[shift.key] : null;
      const hasDiff = isShiftDiff(oldShiftData, currentShiftData);

      if (hasAnyValue && hasDiff) {
        shiftsToSave.push({
          key: shift.key,
          label: shift.label,
          time: shift.time,
        });

        if (
          shift.key === 'shift3' &&
          lockedShifts.shift3Saved &&
          (lockedShifts.shift3Edits || 0) === 0
        ) {
          isFinalEdit = true;
        }
      }
    });

    if (shiftsToSave.length === 0) {
      showToast?.('No new or modified shift data found to save.', 'info');
      return;
    }

    if (shiftsToSave.length > 1) {
      showToast?.(
        'Only one shift can be saved at a time. Please save changes shift-by-shift.',
        'warning'
      );
      return;
    }

    const shiftToSave = shiftsToSave[0];
    const summaryItems = PARAMETERS.map((p) => ({
      label: p.label,
      value: data[shiftToSave.key]?.[p.key] || '—',
      unit: p.unit,
    })).filter((item) => item.value !== '—');

    setConfirmData({
      shift: shiftToSave,
      isFinalEdit,
      summaryItems,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setSaveSuccess(false);
    setShowConfirmModal(false);

    const shiftBeingSaved = confirmData?.shift;
    const payload = {
      date,
      plant: 'CO2',
      analysisType: 'TK1252 Analysis',
      tank: 'TK1252',
      unit: 'TK1252',
      frequency: 'Once in a shift',
      shift: shiftBeingSaved ? shiftBeingSaved.label : 'I SHIFT',
      rows: Object.fromEntries(
        SHIFT_ROWS.map((s) => [
          s.key,
          Object.fromEntries(
            PARAMETERS.map((p) => {
              const val = data[s.key]?.[p.key];
              return [
                p.key,
                val !== '' && val !== null && val !== undefined ? parseFloat(val) : null,
              ];
            })
          ),
        ])
      ),
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/tk1252-analysis', payload);

      if (!response?.data?.success) {
        showToast?.(
          response.data?.message || 'Unable to save TK1252 data. Please try again.',
          'error'
        );
        setSavePhase('save_failed');
        return;
      }

      setSaveSuccess(true);
      const savedDoc = response.data?.data;
      if (savedDoc && (savedDoc._id || savedDoc.id)) {
        setRecordId(savedDoc._id || savedDoc.id);
      }
      if (savedDoc?.lockedShifts) {
        setLockedShifts(savedDoc.lockedShifts);
      }
      if (savedDoc?.editedFields) {
        setEditedFields(savedDoc.editedFields);
      }
      if (savedDoc?.rows) {
        const synced = buildEmptyData();
        SHIFT_ROWS.forEach((s) => {
          if (savedDoc.rows[s.key]) {
            PARAMETERS.forEach((p) => {
              const val = savedDoc.rows[s.key][p.key];
              synced[s.key][p.key] = val !== null && val !== undefined ? String(val) : '';
            });
          }
        });
        setData(synced);
        setOriginalData(JSON.parse(JSON.stringify(synced)));
      }

      if (response.data?.emailRecipient) {
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
      } else if (emailPending || statusFromApi === 'pending') {
        setSavePhase('email_pending');
        setEmailStatusDetail('Saved — Email dispatching immediately 🚀');
        showToast?.('Saved — Email Dispatching 🚀', 'info');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(emailRes?.error || emailRes?.status || 'Email delivery failed');
        showToast?.(
          'Data saved to database. Email delivery failed: ' +
            (emailRes?.error || 'Server error'),
          'warning'
        );
      }
    } catch (err) {
      setSavePhase('save_failed');
      console.error('[TK1252Analysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryEmail = async () => {
    if (!recordId) {
      showToast?.('Cannot retry email: Record ID is not available.', 'error');
      return;
    }
    setSaving(true);
    const result = await retryAnalysisEmail({
      recordId,
      endpoint: '/api/tk1252-analysis',
    });
    setSaving(false);

    if (result.success) {
      setSavePhase('completed');
      setEmailStatusDetail('Email delivered successfully on retry ✓');
      showToast?.(result.message, 'success');
    } else {
      setSavePhase('email_failed');
      setEmailStatusDetail(result.error);
      showToast?.(result.message, 'error');
    }
  };

  const isEntireFormLocked =
    isViewOnly ||
    (Boolean(lockedShifts.shift1 || lockedShifts.shift2Saved) &&
      Boolean(lockedShifts.shift2 || lockedShifts.shift3Saved) &&
      Boolean(
        lockedShifts.shift3 ||
          (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)
      ));

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Breadcrumb Header ──────────────── */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                <span>CO2 Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">TK1252</span>
                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  Once in a shift
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                TK1252
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <LockedDateDisplay date={date} id="tk1252-date-display" />

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-tk1252-reset"
                onClick={handleReset}
                disabled={saving || isEntireFormLocked}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-50"
                title="Reset modifications"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <StatusSaveButton
                id="btn-tk1252-save"
                saving={saving}
                isLocked={isEntireFormLocked}
                savePhase={savePhase}
                onClick={handleSaveClick}
                disabled={isEntireFormLocked}
                title="Save Shift Data"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Banner ─────────────────────────────────── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="TK1252 Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Main Analysis Table Card ────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              TK1252 Shift Measurements
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Frequency: Once in a shift</span>
            <span>•</span>
            <span>pH: 8.0–9.5</span>
            <span>•</span>
            <span>ALK: 2–5 g/L</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-sm">
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  TIME / SHIFT
                </th>
                <th className="px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-28 bg-slate-900 text-slate-100 border-r border-slate-800 shrink-0">
                  STATUS
                </th>
                {PARAMETERS.map((p, idx) => {
                  const limit = getCellLimit('co2', 'tk1252', 'shift1', p.key);
                  return (
                    <th
                      key={p.key}
                      className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
                        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
                      } ${p.colClass}`}
                    >
                      <div className="font-extrabold text-blue-300 text-xs">{p.label}</div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        {p.formula}
                      </div>
                      {limit && (
                        <div className="mt-1 inline-block text-[10px] bg-slate-800 text-blue-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                          Allowed: {limit.formattedRange}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {SHIFT_ROWS.map((row) => {
                const styles = getRowStyles(row.shiftId);
                const disabled = isShiftDisabled(row.key);
                const shiftStatus = getShiftStatus(row.key);

                return (
                  <tr key={row.key} className={`transition-colors duration-100 ${styles.row}`}>
                    <td className="px-5 py-3 align-middle border-r border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                          {row.time}
                        </span>
                        <div className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                          {row.label}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 align-middle border-r border-slate-100 text-center">
                      <RecordStatusBadge status={shiftStatus} />
                    </td>

                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const limit = getCellLimit('co2', 'tk1252', row.key, param.key);
                      const validation = validateCellValue(cellVal, limit);
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isNormal = validation.isNormal;
                      const isFormatError = !!errors[fieldKey];
                      const isFieldEdited = Boolean(editedFields[fieldKey]);

                      return (
                        <td
                          key={param.key}
                          className="py-3 px-4 border-r border-slate-100 last:border-r-0 text-center align-top"
                        >
                          <div className="flex flex-col items-center justify-start min-h-[58px] max-w-[200px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`tk1252-input-${row.key}-${param.key}`}
                                type="text"
                                inputMode="decimal"
                                value={cellVal}
                                placeholder={param.placeholder}
                                disabled={disabled}
                                onChange={(e) => handleChange(row.key, param.key, e.target.value)}
                                title={
                                  limit
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${cellVal} ${limit.unit} (Allowed: ${limit.formattedRange})`
                                      : hasValue
                                      ? `Normal: ${cellVal} ${limit.unit} (Allowed: ${limit.formattedRange})`
                                      : `Allowed range: ${limit.formattedRange}`
                                    : ''
                                }
                                className={`w-full text-center font-mono text-sm font-bold py-1.5 px-2.5 rounded-lg border transition shadow-2xs focus:outline-none ${
                                  disabled
                                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed select-none'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                    : isFormatError
                                    ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                    : hasValue
                                    ? 'border-blue-300 bg-blue-50/40 text-blue-950 font-black focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                    : styles.inputFocus
                                }`}
                                aria-label={`${param.label} at ${row.time}`}
                              />

                              {isFieldEdited && (
                                <span
                                  className="absolute -top-2 -left-2 bg-amber-500 text-white font-extrabold text-[9px] px-1.5 py-0.2 rounded-full shadow-xs"
                                  title="Field modified in permitted edit"
                                >
                                  EDITED
                                </span>
                              )}

                              {isOutOfLimit && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit"
                                >
                                  <AlertCircle className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>

                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>{errors[fieldKey] || 'Invalid number'}</span>
                              </div>
                            )}

                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`tk1252-limit-badge-${row.key}-${param.key}`}
                                className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn flex items-center justify-center gap-0.5 shadow-2xs"
                                title={`Allowed: ${limit.formattedRange}`}
                              >
                                <span>Limit: {limit.formattedRange}</span>
                              </div>
                            )}

                            {!isFormatError && isNormal && hasValue && limit && (
                              <span
                                className="text-[10px] text-emerald-600 font-bold mt-1 tracking-tight flex items-center gap-0.5 animate-fadeIn"
                                title={`Normal: ${cellVal} ${limit.unit} (${limit.formattedRange})`}
                              >
                                Normal
                              </span>
                            )}

                            {!isFormatError && !hasValue && limit && (
                              <span
                                className="text-[10px] text-slate-400 font-semibold mt-1 tracking-tight"
                                title={`Allowed range: ${limit.formattedRange}`}
                              >
                                {limit.formattedRange}
                              </span>
                            )}
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

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Values for <strong>TK1252</strong> (pH, ALK). Sequential shift workflow enforced.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Slots: {SHIFT_ROWS.length} (Once in a shift)
          </div>
        </div>
      </div>

      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="TK1252 Analysis"
        date={date}
        shiftOrTime={confirmData?.shift?.label || 'Shift'}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default TK1252AnalysisPage;
