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

// ─── SOX DRAIN LIQ Configuration ──────────────────────────────────────────────
// Plant: CO2 Plant ONLY
// Analysis: SOX DRAIN LIQ
// Frequency: Once in a Week
//
// Parameters and limits:
// 1. Cl: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM, Unit: PPM
// 2. SO4: Target: 300 PPM, Tolerance: ±10 PPM, Allowed range: 290–310 PPM, Unit: PPM
// 3. Fe: Target: 2 PPM, Tolerance: ±1.0 PPM, Allowed range: 1–3 PPM, Unit: PPM
// 4. TSS: Target: 10 PPM, Tolerance: ±10 PPM, Allowed range: 0–20 PPM, Unit: PPM
//
// TABLE: DATE | Cl | SO4 | Fe | TSS

const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '1–3 PPM',
    placeholder: '2',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '0–20 PPM',
    placeholder: '10',
    colClass: 'min-w-[150px]',
  },
];

const WEEKLY_ROWS = [
  {
    key: 'week',
    label: 'Weekly Analysis',
    frequencyBadge: 'Once in a Week',
  },
];

const buildEmptyData = () =>
  Object.fromEntries(
    WEEKLY_ROWS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const SOXDrainLiqAnalysisPage = ({ plantId = 'co2' }) => {
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
  const [isLocked, setIsLocked] = useState(false);
  const [initialSaved, setInitialSaved] = useState(false);
  const [editCount, setEditCount] = useState(0);
  const [editedFields, setEditedFields] = useState({});

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const weeklyStatus = isLocked ? 'LOCKED' : initialSaved ? 'EDITABLE' : 'NEW';

  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/api/sox-drain-liq-analysis?date=${date}`);
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
              WEEKLY_ROWS.forEach((row) => {
                const srcRow = fetchedRows[row.key] || fetchedRows.week || fetchedRows;
                if (srcRow) {
                  PARAMETERS.forEach((p) => {
                    const val = srcRow[p.key];
                    populated[row.key][p.key] =
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

            setIsLocked(Boolean(record.isLocked || record.data?.isLocked));
            setInitialSaved(Boolean(record.initialSaved || record.data?.initialSaved));
            setEditCount(Number(record.editCount || record.data?.editCount || 0));
            setEditedFields(record.editedFields || record.data?.editedFields || {});
          } else {
            setData(buildEmptyData());
            setOriginalData(null);
            setIsLocked(false);
            setInitialSaved(false);
            setEditCount(0);
            setEditedFields({});
          }
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing data', err);
        setData(buildEmptyData());
        setOriginalData(null);
        setIsLocked(false);
        setInitialSaved(false);
        setEditCount(0);
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
      if (isViewOnly || isLocked) return;

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
    [isViewOnly, isLocked]
  );

  const handleReset = useCallback(() => {
    if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData)));
    } else {
      setData(buildEmptyData());
    }
    setErrors({});
    setSaveSuccess(false);
    showToast?.('SOX DRAIN LIQ analysis form reset.', 'info');
  }, [originalData, showToast]);

  const validateForm = useCallback(() => {
    let isValid = true;
    const newErrors = {};

    WEEKLY_ROWS.forEach((row) => {
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

  const handleSaveClick = () => {
    if (isViewOnly || isLocked) return;
    if (!validateForm()) {
      showToast?.('Please correct highlighted errors before saving.', 'error');
      return;
    }

    const hasAnyValue = WEEKLY_ROWS.some((row) =>
      PARAMETERS.some((p) => {
        const val = data[row.key]?.[p.key];
        return val !== '' && val !== null && val !== undefined;
      })
    );

    if (!hasAnyValue) {
      showToast?.('Please enter at least one measurement value.', 'warning');
      return;
    }

    const summaryItems = PARAMETERS.map((p) => ({
      label: p.label,
      value: data.week?.[p.key] || '—',
      unit: p.unit,
    })).filter((item) => item.value !== '—');

    setConfirmData({
      shiftOrTime: 'Weekly Routine',
      isFinalEdit: initialSaved && editCount === 0,
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

    const payload = {
      date,
      plant: 'CO2',
      analysisType: 'SOX DRAIN LIQ Analysis',
      tank: 'SOX DRAIN LIQ',
      unit: 'SOX DRAIN LIQ',
      frequency: 'Once in a Week',
      shift: 'Once in a Week',
      rows: {
        week: Object.fromEntries(
          PARAMETERS.map((p) => {
            const val = data.week?.[p.key];
            return [
              p.key,
              val !== '' && val !== null && val !== undefined ? parseFloat(val) : null,
            ];
          })
        ),
      },
      submittedBy: user?.name || 'Plant Operator',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await api.post('/api/sox-drain-liq-analysis', payload);

      if (!response?.data?.success) {
        showToast?.(
          response.data?.message || 'Unable to save SOX DRAIN LIQ data. Please try again.',
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
      setIsLocked(Boolean(savedDoc?.isLocked));
      setInitialSaved(Boolean(savedDoc?.initialSaved));
      setEditCount(Number(savedDoc?.editCount || 0));
      if (savedDoc?.editedFields) {
        setEditedFields(savedDoc.editedFields);
      }
      if (savedDoc?.rows) {
        const synced = buildEmptyData();
        const srcRow = savedDoc.rows.week || savedDoc.rows;
        if (srcRow) {
          PARAMETERS.forEach((p) => {
            const val = srcRow[p.key];
            synced.week[p.key] = val !== null && val !== undefined ? String(val) : '';
          });
        }
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
      console.error('[SOXDrainLiqAnalysis] Save failed:', err);
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
      endpoint: '/api/sox-drain-liq-analysis',
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

  const isFormDisabled = isViewOnly || isLocked;

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
                <span className="text-blue-600 font-semibold">SOX DRAIN LIQ</span>
                <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  Once in a Week
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                SOX DRAIN LIQ
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <LockedDateDisplay date={date} id="sox-drain-liq-date-display" />

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-sox-drain-liq-reset"
                onClick={handleReset}
                disabled={saving || isFormDisabled}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-50"
                title="Reset modifications"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <StatusSaveButton
                id="btn-sox-drain-liq-save"
                saving={saving}
                isLocked={isFormDisabled}
                savePhase={savePhase}
                onClick={handleSaveClick}
                disabled={isFormDisabled}
                title="Save Weekly Analysis"
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
        analysisName="SOX DRAIN LIQ Analysis"
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
              SOX DRAIN LIQ Weekly Measurements
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Frequency: Once in a Week</span>
            <span>•</span>
            <span>Cl, SO4, Fe, TSS: PPM</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-44 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
                  DATE / ROUTINE
                </th>
                <th className="px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-28 bg-slate-900 text-slate-100 border-r border-slate-800 shrink-0">
                  STATUS
                </th>
                {PARAMETERS.map((p, idx) => {
                  const limit = getCellLimit('co2', 'sox-drain-liq', 'week', p.key);
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
                          Target: {limit.formattedTarget} ± {limit.tolerance} {limit.unit}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {WEEKLY_ROWS.map((row) => (
                <tr
                  key={row.key}
                  className="bg-blue-50/20 hover:bg-blue-50/40 border-l-4 border-l-blue-600 transition-colors duration-100"
                >
                  <td className="px-5 py-3.5 align-middle border-r border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs inline-block">
                        {date || '—'}
                      </span>
                      <div className="text-[11px] font-bold text-slate-700 whitespace-nowrap">
                        {formatDateDisplay(date)}
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle border-r border-slate-100 text-center">
                    <RecordStatusBadge status={weeklyStatus} />
                  </td>

                  {PARAMETERS.map((param) => {
                    const fieldKey = `${row.key}_${param.key}`;
                    const cellVal = data[row.key]?.[param.key] ?? '';
                    const hasValue = cellVal !== '' && cellVal !== null && cellVal !== undefined;
                    const limit = getCellLimit('co2', 'sox-drain-liq', row.key, param.key);
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
                        <div className="flex flex-col items-center justify-start min-h-[58px] max-w-[150px] mx-auto">
                          <div className="relative w-full">
                            <input
                              id={`sox-drain-liq-input-${row.key}-${param.key}`}
                              type="text"
                              inputMode="decimal"
                              value={cellVal}
                              placeholder={param.placeholder}
                              disabled={isFormDisabled}
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
                                isFormDisabled
                                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed select-none'
                                  : isOutOfLimit
                                  ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                                  : isFormatError
                                  ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300'
                                  : hasValue
                                  ? 'border-blue-300 bg-blue-50/40 text-blue-950 font-black focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                  : 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400'
                              }`}
                              aria-label={`${param.label} for Weekly Analysis`}
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
                              id={`sox-drain-liq-limit-badge-${row.key}-${param.key}`}
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>
              Values for <strong>SOX DRAIN LIQ</strong> (Cl, SO4, Fe, TSS in PPM). Weekly 1-time
              edit lock workflow enforced.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Frequency: Once in a Week
          </div>
        </div>
      </div>

      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="SOX DRAIN LIQ Analysis"
        date={date}
        shiftOrTime={confirmData?.shiftOrTime || 'Weekly'}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default SOXDrainLiqAnalysisPage;
