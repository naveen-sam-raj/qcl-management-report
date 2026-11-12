import React, { useState, useCallback, useEffect } from 'react';
import AnalysisHeader from '../../components/common/AnalysisHeader';
import AnalysisTableCard from '../../components/common/AnalysisTableCard';
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
  AlertCircle,
  ChevronRight,
  Gauge,
  Database,
  FlaskConical,
} from 'lucide-react';
import {
  getOperatingDateIST,
  formatDateDisplay,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  retryAnalysisEmail,
} from '../../utils/co2AnalysisHelper';

// ─── P1256 Configuration ──────────────────────────────────────────────────────
// Plant: CO2 Plant ONLY
// Analysis: P1256
// Frequency: Once in a shift
// Parameter: ALK: Target 0.20%, Tolerance ±0.10%, Allowed range 0.10%–0.30% (Unit: %)
// TABLE: TIME | ALK

const PARAMETERS = [
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (%)',
    unit: '%',
    target: '0.20%',
    tolerance: '±0.10%',
    range: '0.10–0.30%',
    placeholder: '0.20',
    colClass: 'min-w-[180px]',
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

const P1256AnalysisPage = ({ plantId = 'co2' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  const [date] = useState(() => getOperatingDateIST());
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
        return Boolean(lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved);
      }
      if (shiftKey === 'shift2') {
        if (!lockedShifts.shift1Saved) return true;
        return Boolean(lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved);
      }
      if (shiftKey === 'shift3') {
        if (!lockedShifts.shift2Saved) return true;
        if (lockedShifts.shift3 || lockedShifts.shift3Locked) return true;
        if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
        return false;
      }
      return true;
    },
    [isViewOnly, lockedShifts]
  );

  // Get status for shift badge: NEW, OPEN, EDITABLE, WAITING, LOCKED
  const getShiftStatus = useCallback(
    (shiftKey) => {
      if (shiftKey === 'shift1') {
        if (lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved) return 'LOCKED';
        if (lockedShifts.shift1Saved) return 'EDITABLE';
        return 'NEW';
      }
      if (shiftKey === 'shift2') {
        if (lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved) return 'LOCKED';
        if (lockedShifts.shift2Saved) return 'EDITABLE';
        if (lockedShifts.shift1Saved) return 'OPEN';
        return 'WAITING';
      }
      if (shiftKey === 'shift3') {
        if (lockedShifts.shift3 || lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1))
          return 'LOCKED';
        if (lockedShifts.shift3Saved) return 'EDITABLE';
        if (lockedShifts.shift2Saved) return 'OPEN';
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
        const response = await api.get(`/api/p1256-analysis?date=${date}`);
        if (!active) return;

        if (response.data?.assignedOperatorEmail || response.data?.emailRecipient) {
          setRecipientEmail(response.data.emailRecipient || response.data.assignedOperatorEmail);
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
        } else {
          setData(buildEmptyData());
          setOriginalData(null);
          setLockedShifts({});
          setEditedFields({});
          setRecordId(null);
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
    showToast?.('P1256 analysis form reset.', 'info');
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
      analysisType: 'P1256 Analysis',
      tank: 'P1256',
      unit: 'P1256',
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
      const response = await api.post('/api/p1256-analysis', payload);

      if (!response?.data?.success) {
        showToast?.(
          response.data?.message || 'Unable to save P1256 data. Please try again.',
          'error'
        );
        setSavePhase('save_failed');
        return;
      }

      if (response.data?.noChange) {
        setSavePhase('idle');
        showToast?.('No changes', 'info');
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
      } else if (statusFromApi === 'disabled') {
        setSavePhase('completed');
        showToast?.('Saved ✓', 'success');
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
      console.error('[P1256Analysis] Save failed:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.(serverMessage, 'error');
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
      endpoint: '/api/p1256-analysis',
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
      {/* ── Breadcrumb & Top Navigation ── */}
      <AnalysisHeader
        plantName="CO2 Plant"
        analysisName="P1256"
        title="P1256"
        date={date}
        dateId="p1256-date-display"
        onBack={() => navigate(`${basePath}/plants/${plantId}`)}
        isViewOnly={isViewOnly}
        onSave={handleSaveClick}
        saving={saving}
        savePhase={savePhase}
        saveSuccess={saveSuccess}
        saveButtonId="btn-p1256-save"
        saveButtonTitle="Save Shift Data"
      />

      {/* ── Status Banner ─────────────────────────────────── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="P1256 Analysis"
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
      <AnalysisTableCard
        title="P1256 Shift Measurements"
        frequencyText="Frequency: Once in a shift"
        unitText="ALK: %"
        footerTitle="P1256 Shift Analysis"
        footerMeta="Frequency: Once in a shift • Parameters: ALK"
        footerNote="One correction allowed after first save; saving the next shift locks the previous one."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-sm">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-5 text-left text-xs font-extrabold uppercase tracking-wider w-44 border-r border-slate-800 shrink-0">
                  TIME / SHIFT
                </th>
                <th className="py-3 px-3 text-center text-xs font-extrabold uppercase tracking-wider w-28 border-r border-slate-800 shrink-0">
                  STATUS
                </th>
                {PARAMETERS.map((p) => {
                  const limit = getCellLimit('co2', 'p1256', 'shift1', p.key);
                  return (
                    <th
                      key={p.key}
                      className={`py-3 px-4 text-center border-r border-slate-800 last:border-r-0 ${p.colClass || ''}`}
                    >
                      <div className="font-extrabold text-indigo-300 text-xs">{p.label}</div>
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        {p.formula}
                      </div>
                      {limit && (
                        <div className="mt-1 inline-block text-[10px] bg-slate-800 text-indigo-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                          Target: {limit.formattedTarget} ± {limit.tolerance} {limit.unit}
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
                    <td className="py-3 px-5 border-r border-slate-100 bg-slate-50/50 align-top">
                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                          <div>
                            <span className="font-extrabold text-slate-900 text-xs tracking-wide">
                              {row.label}
                            </span>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {row.time}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 align-middle border-r border-slate-100 text-center bg-slate-50/30">
                      <RecordStatusBadge status={shiftStatus} />
                    </td>

                    {PARAMETERS.map((param) => {
                      const fieldKey = `${row.key}_${param.key}`;
                      const cellVal = data[row.key]?.[param.key] ?? '';
                      const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                      const limit = getCellLimit('co2', 'p1256', row.key, param.key);
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
                                id={`p1256-input-${row.key}-${param.key}`}
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

                            {/* EDITED label directly below the corresponding edited value */}
                            {isFieldEdited && (
                              <span
                                className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 mt-1 shadow-2xs select-none"
                                title="Field modified in permitted edit"
                              >
                                Edited
                              </span>
                            )}

                            {isFormatError && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-1 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>{errors[fieldKey] || 'Invalid number'}</span>
                              </div>
                            )}

                            {!isFormatError && isOutOfLimit && limit && (
                              <div
                                id={`p1256-limit-badge-${row.key}-${param.key}`}
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
      </AnalysisTableCard>

      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="P1256 Analysis"
        date={date}
        shiftOrTime={confirmData?.shift?.label || 'Shift'}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default P1256AnalysisPage;
