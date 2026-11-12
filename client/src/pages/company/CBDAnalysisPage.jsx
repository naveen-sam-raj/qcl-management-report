import React, { useState, useCallback, useEffect } from 'react';
import AnalysisHeader from '../../components/common/AnalysisHeader';
import AnalysisTableCard from '../../components/common/AnalysisTableCard';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  getOperatingDateIST,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  EditedBadge,
} from '../../utils/co2AnalysisHelper';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  ChevronRight,
  Droplets,
  Lock,
} from 'lucide-react';

const SHIFTS = [
  {
    key: 'iShift',
    lockKey: 'shift1',
    label: 'I SHIFT',
    desc: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
    badgeStyle: 'bg-blue-100 text-blue-900 border border-blue-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiShift',
    lockKey: 'shift2',
    label: 'II SHIFT',
    desc: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiiShift',
    lockKey: 'shift3',
    label: 'III SHIFT',
    desc: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badgeStyle: 'bg-purple-100 text-purple-900 border border-purple-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
];

const PARAMETERS = [
  { key: 'ph',     label: 'pH',     rawLabel: 'pH',     unit: '',    placeholder: '0.00', step: '0.1' },
  { key: 'po4',    label: 'PO₄',    rawLabel: 'PO4',    unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'na2so3', label: 'Na₂SO₃', rawLabel: 'Na2SO3', unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'talk',   label: 'T.Alk',  rawLabel: 'T.Alk',  unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tfe',    label: 'T.Fe',   rawLabel: 'T.Fe',   unit: 'ppm', placeholder: '0.00', step: '0.1' },
  { key: 'sio2',   label: 'SiO₂',   rawLabel: 'SiO2',   unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'ss',     label: 'SS',     rawLabel: 'SS',     unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tds',    label: 'TDS',    rawLabel: 'TDS',    unit: 'ppm', placeholder: '0.00', step: '1' },
];

const PARAM_KEYS = ['ph', 'po4', 'na2so3', 'talk', 'tfe', 'sio2', 'ss', 'tds'];

const buildEmptyData = () => ({
  iShift:   { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
  iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
});

const DEFAULT_LOCKS = {
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift1Locked: false,
  shift2Locked: false,
  shift3Locked: false,
  shift1: false,
  shift2: false,
  shift3: false,
  shift1Edits: 0,
  shift2Edits: 0,
  shift3Edits: 0,
};

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const CBDAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date] = useState(() => getOperatingDateIST());
  const [data, setData] = useState(buildEmptyData);
  const [originalShifts, setOriginalShifts] = useState(buildEmptyData);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [lockedShifts, setLockedShifts] = useState(DEFAULT_LOCKS);
  const [lockedSlots, setLockedSlots] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const isShiftDisabled = useCallback((shiftKey) => {
    if (isViewOnly) return true;
    if (shiftKey === 'iShift') {
      return Boolean(lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved);
    }
    if (shiftKey === 'iiShift') {
      if (!lockedShifts.shift1Saved) return true;
      return Boolean(lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved);
    }
    if (shiftKey === 'iiiShift') {
      if (!lockedShifts.shift2Saved) return true;
      if (lockedShifts.shift3 || lockedShifts.shift3Locked) return true;
      if (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1) return true;
      return false;
    }
    return true;
  }, [isViewOnly, lockedShifts]);

  const getShiftBadgeStatus = useCallback((shiftKey) => {
    if (shiftKey === 'iShift') {
      if (lockedShifts.shift1 || lockedShifts.shift1Locked || lockedShifts.shift2Saved) return 'LOCKED';
      if (lockedShifts.shift1Saved) return 'EDITABLE';
      return 'NEW';
    }
    if (shiftKey === 'iiShift') {
      if (!lockedShifts.shift1Saved) return 'WAITING';
      if (lockedShifts.shift2 || lockedShifts.shift2Locked || lockedShifts.shift3Saved) return 'LOCKED';
      if (lockedShifts.shift2Saved) return 'EDITABLE';
      return 'OPEN';
    }
    if (shiftKey === 'iiiShift') {
      if (!lockedShifts.shift2Saved) return 'WAITING';
      if (lockedShifts.shift3 || lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) return 'LOCKED';
      if (lockedShifts.shift3Saved) return 'EDITABLE';
      return 'OPEN';
    }
    return 'WAITING';
  }, [lockedShifts]);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const res = await api.get(`/api/cbd-analysis?date=${date}`);
        if (!active) return;

        if (res.data?.success && res.data?.data) {
          const fetchedData = res.data.data;
          const shifts = fetchedData.shifts || buildEmptyData();
          const cleanData = buildEmptyData();

          ['iShift', 'iiShift', 'iiiShift'].forEach((sk) => {
            const sSrc = shifts[sk] || {};
            PARAM_KEYS.forEach((pk) => {
              cleanData[sk][pk] = sSrc[pk] !== undefined && sSrc[pk] !== null ? String(sSrc[pk]) : '';
            });
          });

          setData(cleanData);
          setOriginalShifts(JSON.parse(JSON.stringify(cleanData)));
          setRecordId(fetchedData._id || fetchedData.id || res.data.recordId || null);
          setLockedShifts(fetchedData.lockedShifts || res.data.lockedShifts || DEFAULT_LOCKS);
          setLockedSlots(fetchedData.lockedSlots || res.data.lockedSlots || {});
          setEditedFields(fetchedData.editedFields || res.data.editedFields || {});
          setRecipientEmail(res.data.assignedOperatorEmail || fetchedData.emailRecipient || '');
        } else {
          setData(buildEmptyData());
          setOriginalShifts(buildEmptyData());
          setRecordId(null);
          setLockedShifts(res.data?.lockedShifts || DEFAULT_LOCKS);
          setLockedSlots(res.data?.lockedSlots || {});
          setEditedFields({});
          setRecipientEmail(res.data?.assignedOperatorEmail || '');
        }
      } catch (err) {
        if (!active) return;
        if (err?.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        }
        setData(buildEmptyData());
        setOriginalShifts(buildEmptyData());
        setLockedShifts(DEFAULT_LOCKS);
        setLockedSlots({});
        setEditedFields({});
      }
    };

    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date, showToast]);

  // ── Cell Value Change ──
  const handleChange = useCallback((shiftKey, paramKey, value) => {
    if (isViewOnly) return;
    if (!isValidDecimal(value)) return;
    if (isShiftDisabled(shiftKey)) return;

    setData((prev) => ({
      ...prev,
      [shiftKey]: {
        ...prev[shiftKey],
        [paramKey]: value,
      },
    }));

    if (errors[`${shiftKey}_${paramKey}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${shiftKey}_${paramKey}`];
        return next;
      });
    }
  }, [errors, isShiftDisabled, isViewOnly]);

  // ── Form Reset ──
  const handleReset = () => {
    if (isViewOnly) return;
    setData(JSON.parse(JSON.stringify(originalShifts)));
    setErrors({});
  };

  // ── Pre-Save Prompt & Validation ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    SHIFTS.forEach((s) => {
      PARAM_KEYS.forEach((p) => {
        const val = data[s.key][p];
        if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${s.key}_${p}`] = 'Numbers only';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    const modifiedShifts = [];
    SHIFTS.forEach((s) => {
      if (isShiftDisabled(s.key)) return;
      const origShift = originalShifts[s.key] || {};
      const curShift = data[s.key] || {};
      const isDiff = PARAM_KEYS.some((pk) => {
        const ov = origShift[pk] ?? '';
        const cv = curShift[pk] ?? '';
        return String(ov).trim() !== String(cv).trim();
      });
      const hasAnyVal = PARAM_KEYS.some((pk) => curShift[pk] !== '' && curShift[pk] !== null && curShift[pk] !== undefined);
      if (isDiff || (!lockedShifts?.[`${s.lockKey}Saved`] && hasAnyVal)) {
        modifiedShifts.push(s);
      }
    });

    if (modifiedShifts.length === 0) {
      showToast?.('No changes', 'info');
      return;
    }

    if (modifiedShifts.length > 1) {
      showToast?.('Only one shift can be saved at a time. Please save changes shift-by-shift.', 'warning');
      return;
    }

    const targetShift = modifiedShifts[0];
    const targetSlot = targetShift.lockKey;
    const summaryItems = PARAMETERS.map((p) => {
      const val = data[targetShift.key][p.key];
      return {
        label: p.label,
        value: val ? `${val}${p.unit ? ` ${p.unit}` : ''}` : '—',
      };
    });

    setConfirmData({
      date,
      targetSlot,
      shiftKey: targetShift.key,
      shiftOrTime: `${targetShift.label} (${targetShift.desc})`,
      summaryItems,
    });
    setShowConfirmModal(true);
  };

  // ── Save Handler ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        plant: 'OFFSET',
        plantCode: 'OFFSITE',
        unit: 'CBD',
        analysisType: 'CBD Analysis',
        shifts: data,
        targetSlot: confirmData?.targetSlot,
        submittedBy: user?.name || 'Plant Operator',
      };

      const res = await api.post('/api/cbd-analysis', payload);

      if (res.data?.noChange) {
        setSaving(false);
        setSavePhase('idle');
        showToast?.('No changes', 'info');
        return;
      }

      if (!res.data?.success) {
        showToast?.(res.data?.message || 'Failed to save CBD Analysis.', 'error');
        setSavePhase('idle');
        setSaving(false);
        return;
      }

      setOriginalShifts(JSON.parse(JSON.stringify(data)));
      setLastSaved(new Date().toLocaleTimeString());

      const returnedDoc = res.data?.data || res.data?.record || {};
      const newEdited = res.data?.editedFields || returnedDoc.editedFields || {};
      const newRecordId = res.data?.recordId || returnedDoc._id || returnedDoc.id;

      setEditedFields(newEdited);
      setLockedShifts(returnedDoc.lockedShifts || res.data?.lockedShifts || DEFAULT_LOCKS);
      setLockedSlots(returnedDoc.lockedSlots || res.data?.lockedSlots || {});
      if (newRecordId) setRecordId(newRecordId);

      setSavePhase('completed');
      setEmailStatusDetail('Saved ✓');
      showToast?.('Saved ✓', 'success');
    } catch (err) {
      console.error('Error saving CBD Analysis data:', err);
      const msg = err?.response?.data?.message || 'Failed to save CBD Analysis data.';
      showToast?.(msg, 'error');
      setSavePhase('idle');
    } finally {
      setSaving(false);
    }
  };

  const isAllLocked = Boolean(
    (lockedShifts.shift3Locked || (lockedShifts.shift3Saved && (lockedShifts.shift3Edits || 0) >= 1)) &&
    (lockedShifts.shift2Locked || lockedShifts.shift3Saved) &&
    (lockedShifts.shift1Locked || lockedShifts.shift2Saved)
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Breadcrumb & Top Navigation ── */}
      <AnalysisHeader
        plantName="OFFSET Plant"
        analysisName="Continuous Blowdown"
        title="CBD ANALYSIS (CONTINUOUS BLOWDOWN)"
        date={date}
        dateId="cbd-locked-date"
        onBack={() => navigate(`${basePath}/plants/${plantId}`)}
        isViewOnly={isViewOnly}
        onSave={handleSaveClick}
        saving={saving}
        savePhase={savePhase}
        saveButtonId="btn-cbd-save"
        saveButtonTitle="Save CBD Analysis"
      />

      {/* ── Status Banner (Save Status) ── */}
      <SaveStatusBanner
        id="cbd-status-banner"
        saveSuccess={savePhase === 'completed'}
        savePhase={savePhase}
        date={date}
        analysisName="CBD Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={() => {}}
        onDismiss={() => setSavePhase('idle')}
      />

      
      {/* ── Main Data Table ── */}
      <AnalysisTableCard
        title="CBD Shift Measurements"
        frequencyText="Frequency: Once in a Shift"
        unitText="Unit: mg/L / pH / TDS"
        footerTitle="CBD Shift Analysis"
        footerMeta="Frequency: Once in a Shift • Parameters: pH, PO₄, Na₂SO₃, T.Alk, T.Fe, SiO₂, SS, TDS"
        footerNote="One correction allowed after first save; saving the next shift locks the previous one."
      >
        {/* Scrollable table container */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]" id="cbd-table">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-5 text-left text-xs font-extrabold uppercase tracking-wider w-40 border-r border-slate-800 shrink-0">
                  SHIFT
                </th>

                {PARAMETERS.map((p) => (
                  <th
                    key={p.key}
                    className="py-3 px-3 text-center border-r border-slate-800 last:border-r-0 min-w-[120px]"
                  >
                    <div className="font-extrabold text-indigo-300 text-xs">{p.label}</div>
                    {p.unit && (
                      <div className="text-[10px] text-slate-300 font-medium normal-case tracking-normal">
                        {p.unit}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {SHIFTS.map((shift) => {
                const disabled = isShiftDisabled(shift.key);
                const status = getShiftBadgeStatus(shift.key);

                return (
                  <tr
                    key={shift.key}
                    className={`transition-colors duration-100 ${shift.rowStyle} ${disabled ? 'opacity-85' : ''}`}
                  >
                    {/* Shift Label Badge */}
                    <td className="py-3 px-5 border-r border-slate-100 bg-slate-50/50 align-top">
                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                          <div>
                            <span className="font-extrabold text-slate-900 text-xs tracking-wide">
                              {shift.label}
                            </span>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {shift.desc}
                            </div>
                          </div>
                        </div>
                        <div className="mt-1">
                          <RecordStatusBadge status={status} />
                        </div>
                      </div>
                    </td>

                    {/* Parameter Input Cells */}
                    {PARAMETERS.map((param) => {
                      const cellVal = data[shift.key]?.[param.key] || '';
                      const isInvalid = !!errors[`${shift.key}_${param.key}`];
                      const errorMessage = errors[`${shift.key}_${param.key}`];
                      const limit = getCellLimit('offset', 'cbd', 'day', param.key);
                      const validation = limit && cellVal !== '' ? validateCellValue(cellVal, limit) : { isOutOfLimit: false };
                      const isOutOfLimit = validation.isOutOfLimit;
                      const isEdited = Boolean(
                        editedFields[`${shift.key}_${param.key}`] ||
                        editedFields[`${shift.lockKey}_${param.key}`]
                      );

                      return (
                        <td key={param.key} className="px-3 py-2.5 text-center align-middle border-r border-slate-100">
                          <div className="flex flex-col items-center">
                            <input
                              id={`cbd-input-${shift.key}-${param.key}`}
                              type="text"
                              inputMode="decimal"
                              value={cellVal}
                              disabled={disabled}
                              onChange={(e) =>
                                handleChange(shift.key, param.key, e.target.value)
                              }
                              placeholder={param.placeholder}
                              className={`w-full max-w-[95px] mx-auto text-center text-sm font-mono font-bold px-3 py-1.5 rounded-lg border-2 shadow-2xs transition-all focus:outline-none ${
                                disabled
                                  ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed select-text'
                                  : isInvalid || isOutOfLimit
                                  ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-300/60'
                                  : shift.inputFocus
                              }`}
                              aria-label={`${shift.label} ${param.label}`}
                            />

                            <EditedBadge isEdited={isEdited} />

                            {/* Error Message if invalid format */}
                            {isInvalid && (
                              <div className="text-[9px] text-red-600 font-extrabold leading-tight mt-0.5 animate-fadeIn flex items-center justify-center gap-0.5 whitespace-nowrap">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                <span>{errorMessage}</span>
                              </div>
                            )}
                          
                            {isOutOfLimit && !isInvalid && limit && (
                              <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                                {limit.formattedLabel || `Limit: ${limit.min}-${limit.max}`}
                              </div>
                            )}
                            {!isOutOfLimit && !isInvalid && limit && cellVal === '' && (
                              <div className="text-[9.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                                {limit.formattedRange || `${limit.min}-${limit.max}`}
                              </div>
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

      {/* ── Save Confirmation Modal ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="CBD Analysis"
        date={date}
        shiftOrTime={confirmData?.shiftOrTime}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default CBDAnalysisPage;
