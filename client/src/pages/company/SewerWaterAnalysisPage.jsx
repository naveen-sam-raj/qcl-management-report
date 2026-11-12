import React, { useState, useCallback, useMemo, useEffect } from 'react';
import AnalysisHeader from '../../components/common/AnalysisHeader';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
import {
  formatDateDisplay,
  SaveStatusBanner,
  EditedBadge,
  LockedDateDisplay,
  StatusSaveButton,
  RecordStatusBadge,
} from '../../utils/offsetAnalysisHelper';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  ChevronRight,
  Clock,
  Waves,
  Lock,
} from 'lucide-react';

const SLOTS = ['t11', 't13', 't15', 't17', 't19', 't21'];

const DEFAULT_READINGS = [
  { id: 't11', time: '11:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't13', time: '13:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't15', time: '15:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't17', time: '17:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't19', time: '19:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't21', time: '21:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
];

const SEWER_PARAMS = [
  ['sec200', 'fnh3'],
  ['sec200', 'cnh3'],
  ['sec400', 'fnh3'],
  ['sec400', 'cnh3'],
  ['sec400', 'hco3'],
  ['finalOutlet', 'fnh3'],
  ['finalOutlet', 'cnh3'],
  ['finalOutlet', 'hco3'],
  ['finalOutlet', 'pcl'],
];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const SewerWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date] = useState(() => getOperatingDateIST());
  const [readings, setReadings] = useState(() => DEFAULT_READINGS.map((r) => JSON.parse(JSON.stringify(r))));
  const [originalReadings, setOriginalReadings] = useState(() => DEFAULT_READINGS.map((r) => JSON.parse(JSON.stringify(r))));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle');
  const [recordId, setRecordId] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [lockedSlots, setLockedSlots] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/sewer-water-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          setRecordId(response.data.recordId || payloadData._id || payloadData.id || null);
          setEditedFields(response.data.editedFields || payloadData.editedFields || {});
          setLockedSlots(response.data.lockedSlots || payloadData.lockedSlots || {});

          const rawReadings = Array.isArray(response.data.readings)
            ? response.data.readings
            : Array.isArray(payloadData.readings)
              ? payloadData.readings
              : [];

          const bySlot = {};
          rawReadings.forEach((r) => {
            const sk = r?.id || r?.time;
            if (sk) bySlot[sk] = r;
          });

          const fetchedReadings = DEFAULT_READINGS.map((def) => {
            const match = bySlot[def.id] || bySlot[def.time] || {};
            return {
              id: def.id,
              time: def.time,
              sec200: {
                fnh3: match.sec200?.fnh3 !== undefined && match.sec200?.fnh3 !== null ? String(match.sec200.fnh3) : '',
                cnh3: match.sec200?.cnh3 !== undefined && match.sec200?.cnh3 !== null ? String(match.sec200.cnh3) : '',
              },
              sec400: {
                fnh3: match.sec400?.fnh3 !== undefined && match.sec400?.fnh3 !== null ? String(match.sec400.fnh3) : '',
                cnh3: match.sec400?.cnh3 !== undefined && match.sec400?.cnh3 !== null ? String(match.sec400.cnh3) : '',
                hco3: match.sec400?.hco3 !== undefined && match.sec400?.hco3 !== null ? String(match.sec400.hco3) : '',
              },
              finalOutlet: {
                fnh3: match.finalOutlet?.fnh3 !== undefined && match.finalOutlet?.fnh3 !== null ? String(match.finalOutlet.fnh3) : '',
                cnh3: match.finalOutlet?.cnh3 !== undefined && match.finalOutlet?.cnh3 !== null ? String(match.finalOutlet.cnh3) : '',
                hco3: match.finalOutlet?.hco3 !== undefined && match.finalOutlet?.hco3 !== null ? String(match.finalOutlet.hco3) : '',
                pcl: match.finalOutlet?.pcl !== undefined && match.finalOutlet?.pcl !== null ? String(match.finalOutlet.pcl) : '',
              },
            };
          });

          setReadings(fetchedReadings);
          setOriginalReadings(fetchedReadings);
        } else {
          setReadings(DEFAULT_READINGS.map((r) => JSON.parse(JSON.stringify(r))));
          setOriginalReadings(DEFAULT_READINGS.map((r) => JSON.parse(JSON.stringify(r))));
          setLockedSlots({});
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        }
        setReadings(DEFAULT_READINGS.map((r) => JSON.parse(JSON.stringify(r))));
        setOriginalReadings(DEFAULT_READINGS.map((r) => JSON.parse(JSON.stringify(r))));
        setLockedSlots({});
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date, showToast]);

  // ── Handle cell change ──
  const handleCellChange = useCallback((id, section, field, value) => {
    if (field === 'pcl') {
      const isNil = ['nil', 'n', 'ni', 'none', '-'].includes(String(value).toLowerCase().trim());
      if (!isNil && !isValidDecimal(value)) return;
    } else {
      if (!isValidDecimal(value)) return;
    }

    setReadings((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          [section]: {
            ...r[section],
            [field]: value,
          },
        };
      })
    );

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${section}_${field}`];
      return copy;
    });
  }, []);

  // ── Reset ──
  const handleReset = () => {
    setReadings(originalReadings.map((r) => JSON.parse(JSON.stringify(r))));
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Save flow with confirmation modal ──
  const initiateSave = () => {
    const newErrors = {};

    readings.forEach((r) => {
      SEWER_PARAMS.forEach(([section, field]) => {
        const val = r[section]?.[field];
        if (field === 'pcl') {
          if (val !== '' && val !== null && val !== undefined) {
            const isNil = ['nil', 'n', 'ni', 'none', '-'].includes(String(val).toLowerCase().trim());
            if (!isNil && isNaN(Number(val))) {
              newErrors[`${r.id}_${section}_${field}`] = 'Invalid';
            }
          }
        } else if (val !== '' && val !== null && val !== undefined && isNaN(Number(val))) {
          newErrors[`${r.id}_${section}_${field}`] = 'Invalid';
        }
      });
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    // Detect which slot was entered or changed relative to originalReadings
    const modifiedSlots = [];
    SLOTS.forEach((sk) => {
      const orig = originalReadings.find((r) => r.id === sk) || {};
      const curr = readings.find((r) => r.id === sk) || {};
      const slotChanged = SEWER_PARAMS.some(([sec, field]) => {
        const ov = String(orig[sec]?.[field] || '').trim();
        const cv = String(curr[sec]?.[field] || '').trim();
        return ov !== cv;
      });
      if (slotChanged) {
        modifiedSlots.push(sk);
      }
    });

    if (modifiedSlots.length === 0) {
      showToast?.('No changes', 'info');
      return;
    }

    if (modifiedSlots.length > 1) {
      showToast?.('Only one slot can be saved per submission.', 'warning');
      return;
    }

    const targetSlot = modifiedSlots[0];
    const payload = {
      date,
      plant: 'OFFSET',
      unit: 'Sewer Water',
      targetSlot,
      readings,
      submittedBy: user?.name || 'Shift Chemist',
    };

    setConfirmData(payload);
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (!confirmData) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const res = await api.post('/sewer-water-analysis', confirmData);

      if (res.data?.noChange) {
        showToast?.('No changes', 'info');
        setSaving(false);
        setSavePhase('idle');
        return;
      }

      if (res.data?.success) {
        setSaveSuccess(true);
        const record = res.data.data;
        if (record?._id || record?.id) {
          setRecordId(record._id || record.id);
        }
        if (res.data.editedFields || record?.editedFields) {
          setEditedFields(res.data.editedFields || record.editedFields);
        }
        if (res.data.lockedSlots || record?.lockedSlots) {
          setLockedSlots(res.data.lockedSlots || record.lockedSlots);
        }
        if (res.data.readings || record?.readings) {
          const nextReadings = res.data.readings || record.readings;
          setReadings(nextReadings);
          setOriginalReadings(nextReadings);
        }

        setSavePhase('completed');
        showToast?.('Saved ✓', 'success');
      }
    } catch (err) {
      setSavePhase('save_failed');
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Summary items for save modal
  const summaryItems = useMemo(() => {
    return [
      { label: 'Total Scheduled Slots', value: '6 Slots (Bi-hourly 11:00 - 21:00)' },
      { label: 'Plant', value: 'OFFSET Plant' },
      { label: 'Unit', value: 'Sewer Water' },
    ];
  }, []);

  const isSlotDisabled = useCallback(
    (slotId, idx) => {
      if (isViewOnly) return true;
      if (lockedSlots[slotId]?.isLocked) return true;
      if (idx > 0 && !lockedSlots[SLOTS[idx - 1]]?.isSaved) return true;
      return false;
    },
    [isViewOnly, lockedSlots]
  );

  const getSlotBadgeStatus = useCallback(
    (slotId, idx) => {
      if (lockedSlots[slotId]?.isLocked) return 'LOCKED';
      if (idx > 0 && !lockedSlots[SLOTS[idx - 1]]?.isSaved) return 'WAITING';
      if (lockedSlots[slotId]?.isSaved) return 'EDITABLE';
      return 'OPEN';
    },
    [lockedSlots]
  );

  const isAllLocked = useMemo(() => {
    return (
      Boolean(lockedSlots['t21']?.isLocked) ||
      (SLOTS.length > 0 && SLOTS.every((sk) => lockedSlots[sk]?.isLocked))
    );
  }, [lockedSlots]);

  const overallBadgeStatus = useMemo(() => {
    if (isAllLocked) return 'LOCKED';
    if (SLOTS.some((sk) => lockedSlots[sk]?.isSaved)) return 'EDITABLE';
    return 'NEW';
  }, [isAllLocked, lockedSlots]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── SAVE STATUS BANNER ── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Sewer Water Analysis"
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── Breadcrumb & Top Navigation ── */}
      <AnalysisHeader
        plantName="OFFSET Plant"
        analysisName="SewerWater"
        title="SEWER WATER ANALYSIS"
        date={date}
        dateId="sewer-locked-date"
        onBack={() => navigate(`${basePath}/plants/${plantId}`)}
        isViewOnly={isViewOnly}
        onSave={initiateSave}
        saving={saving}
        savePhase={savePhase}
        saveSuccess={saveSuccess}
        saveButtonId="btn-sewer-save"
        saveButtonTitle="Save analysis data"
      />

      {/* ── MAIN CONTENT: Sewer Water Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Sewer Water Plant Section Measurements
              </h2>
            </div>
            <LockedDateDisplay date={date} id="sewerwater-date-display" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Super Header Row: Grouped Plant Sections */}
              <tr className="bg-slate-950 text-white text-xs select-none border-b border-slate-800">
                <th rowSpan={2} className="py-2.5 px-3 w-10 text-center border-r border-slate-800">
                  #
                </th>
                <th rowSpan={2} className="py-2.5 px-3 w-24 text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME
                  </div>
                </th>

                {/* 200 # Group */}
                <th
                  colSpan={2}
                  className="py-2 px-3 text-center border-r border-slate-800 bg-sky-950/80 font-black tracking-wider text-sky-300"
                >
                  &lt;------- 200 # -------&gt;
                </th>

                {/* 400 # Group */}
                <th
                  colSpan={3}
                  className="py-2 px-3 text-center border-r border-slate-800 bg-indigo-950/80 font-black tracking-wider text-indigo-300"
                >
                  &lt;--------- 400 # ---------&gt;
                </th>

                {/* FINAL OUTLET Group */}
                <th
                  colSpan={4}
                  className="py-2 px-3 text-center border-r border-slate-800 bg-emerald-950/80 font-black tracking-wider text-emerald-300"
                >
                  &lt;----- FINAL OUTLET -----&gt;
                </th>

                <th rowSpan={2} className="py-2.5 px-3 w-24 text-center border-r border-slate-800">
                  STATUS
                </th>
              </tr>

              {/* Sub Header Row: Parameters */}
              <tr className="bg-slate-900 text-white text-xs font-extrabold select-none">
                {/* 200 # */}
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-sky-200">
                  FNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-sky-200">
                  CNH₃
                </th>

                {/* 400 # */}
                <th className="py-2 px-2 text-center w-24 border-r border-slate-800 text-indigo-200">
                  FNH₃
                </th>
                <th className="py-2 px-2 text-center w-24 border-r border-slate-800 text-indigo-200">
                  CNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-indigo-200">
                  HCO₃
                </th>

                {/* FINAL OUTLET */}
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  FNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  CNH₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  HCO₃
                </th>
                <th className="py-2 px-2 text-center w-20 border-r border-slate-800 text-emerald-200">
                  PCl
                  <div className="text-[9px] font-normal text-emerald-400/80 normal-case mt-0.5">Limit: NIL</div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const getLimit = (category, param) => getCellLimit('offset', 'sewer-water', 'Shift', `${category}_${param}`);

                const sec200Fnh3Limit = getLimit('sec200', 'fnh3');
                const sec200Cnh3Limit = getLimit('sec200', 'cnh3');
                const sec400Fnh3Limit = getLimit('sec400', 'fnh3');
                const sec400Cnh3Limit = getLimit('sec400', 'cnh3');
                const finalOutletFnh3Limit = getLimit('finalOutlet', 'fnh3');
                const finalOutletCnh3Limit = getLimit('finalOutlet', 'cnh3');
                const pclLimit = getLimit('finalOutlet', 'pcl');

                const isValid = (val, limit) => limit && val !== '' ? validateCellValue(val, limit) : { isOutOfLimit: false };
                const vSec200Fnh3 = isValid(row.sec200?.fnh3, sec200Fnh3Limit);
                const vSec200Cnh3 = isValid(row.sec200?.cnh3, sec200Cnh3Limit);
                const vSec400Fnh3 = isValid(row.sec400?.fnh3, sec400Fnh3Limit);
                const vSec400Cnh3 = isValid(row.sec400?.cnh3, sec400Cnh3Limit);
                const vFinalOutletFnh3 = isValid(row.finalOutlet?.fnh3, finalOutletFnh3Limit);
                const vFinalOutletCnh3 = isValid(row.finalOutlet?.cnh3, finalOutletCnh3Limit);

                const isPclNil = row.finalOutlet?.pcl !== undefined && ['nil', 'n', 'ni', 'none', '-'].includes(String(row.finalOutlet.pcl).toLowerCase().trim());
                const vPcl = pclLimit && row.finalOutlet?.pcl !== '' ? (isPclNil ? { isOutOfLimit: false } : { isOutOfLimit: true }) : { isOutOfLimit: false };

                const rowKey = row.id || row.time;
                const slotDisabled = isSlotDisabled(row.id, idx);
                const badgeStatus = getSlotBadgeStatus(row.id, idx);

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-blue-50/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                  >
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100 font-medium">
                      {idx + 1}
                    </td>

                    {/* Time (Read-only) */}
                    <td className="py-2 px-2 text-center border-r border-slate-100">
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {row.time}
                      </span>
                    </td>

                    {/* 200 # FNH3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.sec200?.fnh3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'sec200', 'fnh3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_sec200_fnh3`] || vSec200Fnh3.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.sec200?.fnh3 !== '' && row.sec200?.fnh3 !== '0'
                            ? 'bg-sky-50/50 border-sky-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_sec200_fnh3`] || editedFields[`${row.time}_sec200_fnh3`])} />
                      {vSec200Fnh3.isOutOfLimit && !errors[`${row.id}_sec200_fnh3`] && sec200Fnh3Limit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {sec200Fnh3Limit.formattedLabel || `Limit: ${sec200Fnh3Limit.min}-${sec200Fnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec200Fnh3.isOutOfLimit && !errors[`${row.id}_sec200_fnh3`] && sec200Fnh3Limit && (row.sec200?.fnh3 === '' || row.sec200?.fnh3 === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {sec200Fnh3Limit.formattedRange || `${sec200Fnh3Limit.min}-${sec200Fnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* 200 # CNH3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.sec200?.cnh3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'sec200', 'cnh3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_sec200_cnh3`] || vSec200Cnh3.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.sec200?.cnh3 !== '' && row.sec200?.cnh3 !== '0'
                            ? 'bg-sky-50/50 border-sky-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_sec200_cnh3`] || editedFields[`${row.time}_sec200_cnh3`])} />
                      {vSec200Cnh3.isOutOfLimit && !errors[`${row.id}_sec200_cnh3`] && sec200Cnh3Limit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {sec200Cnh3Limit.formattedLabel || `Limit: ${sec200Cnh3Limit.min}-${sec200Cnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec200Cnh3.isOutOfLimit && !errors[`${row.id}_sec200_cnh3`] && sec200Cnh3Limit && (row.sec200?.cnh3 === '' || row.sec200?.cnh3 === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {sec200Cnh3Limit.formattedRange || `${sec200Cnh3Limit.min}-${sec200Cnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* 400 # FNH3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.sec400?.fnh3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'sec400', 'fnh3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_sec400_fnh3`] || vSec400Fnh3.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.sec400?.fnh3 !== '' && row.sec400?.fnh3 !== '0'
                            ? 'bg-indigo-50/50 border-indigo-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_sec400_fnh3`] || editedFields[`${row.time}_sec400_fnh3`])} />
                      {vSec400Fnh3.isOutOfLimit && !errors[`${row.id}_sec400_fnh3`] && sec400Fnh3Limit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {sec400Fnh3Limit.formattedLabel || `Limit: ${sec400Fnh3Limit.min}-${sec400Fnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec400Fnh3.isOutOfLimit && !errors[`${row.id}_sec400_fnh3`] && sec400Fnh3Limit && (row.sec400?.fnh3 === '' || row.sec400?.fnh3 === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {sec400Fnh3Limit.formattedRange || `${sec400Fnh3Limit.min}-${sec400Fnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* 400 # CNH3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.sec400?.cnh3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'sec400', 'cnh3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_sec400_cnh3`] || vSec400Cnh3.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.sec400?.cnh3 !== '' && row.sec400?.cnh3 !== '0'
                            ? 'bg-indigo-50/50 border-indigo-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_sec400_cnh3`] || editedFields[`${row.time}_sec400_cnh3`])} />
                      {vSec400Cnh3.isOutOfLimit && !errors[`${row.id}_sec400_cnh3`] && sec400Cnh3Limit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {sec400Cnh3Limit.formattedLabel || `Limit: ${sec400Cnh3Limit.min}-${sec400Cnh3Limit.max}`}
                        </div>
                      )}
                      {!vSec400Cnh3.isOutOfLimit && !errors[`${row.id}_sec400_cnh3`] && sec400Cnh3Limit && (row.sec400?.cnh3 === '' || row.sec400?.cnh3 === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {sec400Cnh3Limit.formattedRange || `${sec400Cnh3Limit.min}-${sec400Cnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* 400 # HCO3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.sec400?.hco3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'sec400', 'hco3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : errors[`${row.id}_sec400_hco3`]
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.sec400?.hco3 !== '' && row.sec400?.hco3 !== '0'
                            ? 'bg-indigo-50/50 border-indigo-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_sec400_hco3`] || editedFields[`${row.time}_sec400_hco3`])} />
                    </td>

                    {/* FINAL OUTLET FNH3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.finalOutlet?.fnh3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'fnh3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_finalOutlet_fnh3`] || vFinalOutletFnh3.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.finalOutlet?.fnh3 !== '' && row.finalOutlet?.fnh3 !== '0'
                            ? 'bg-emerald-50/50 border-emerald-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_finalOutlet_fnh3`] || editedFields[`${row.time}_finalOutlet_fnh3`])} />
                      {vFinalOutletFnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_fnh3`] && finalOutletFnh3Limit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {finalOutletFnh3Limit.formattedLabel || `Limit: ${finalOutletFnh3Limit.min}-${finalOutletFnh3Limit.max}`}
                        </div>
                      )}
                      {!vFinalOutletFnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_fnh3`] && finalOutletFnh3Limit && (row.finalOutlet?.fnh3 === '' || row.finalOutlet?.fnh3 === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {finalOutletFnh3Limit.formattedRange || `${finalOutletFnh3Limit.min}-${finalOutletFnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* FINAL OUTLET CNH3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.finalOutlet?.cnh3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'cnh3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_finalOutlet_cnh3`] || vFinalOutletCnh3.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.finalOutlet?.cnh3 !== '' && row.finalOutlet?.cnh3 !== '0'
                            ? 'bg-emerald-50/50 border-emerald-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_finalOutlet_cnh3`] || editedFields[`${row.time}_finalOutlet_cnh3`])} />
                      {vFinalOutletCnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_cnh3`] && finalOutletCnh3Limit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {finalOutletCnh3Limit.formattedLabel || `Limit: ${finalOutletCnh3Limit.min}-${finalOutletCnh3Limit.max}`}
                        </div>
                      )}
                      {!vFinalOutletCnh3.isOutOfLimit && !errors[`${row.id}_finalOutlet_cnh3`] && finalOutletCnh3Limit && (row.finalOutlet?.cnh3 === '' || row.finalOutlet?.cnh3 === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {finalOutletCnh3Limit.formattedRange || `${finalOutletCnh3Limit.min}-${finalOutletCnh3Limit.max}`}
                        </div>
                      )}
                    </td>

                    {/* FINAL OUTLET HCO3 */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.finalOutlet?.hco3 ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'hco3', e.target.value)}
                        placeholder="—"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : errors[`${row.id}_finalOutlet_hco3`]
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.finalOutlet?.hco3 !== '' && row.finalOutlet?.hco3 !== '0'
                            ? 'bg-emerald-50/50 border-emerald-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_finalOutlet_hco3`] || editedFields[`${row.time}_finalOutlet_hco3`])} />
                    </td>

                    {/* FINAL OUTLET PCl */}
                    <td className="py-2 px-1 text-center border-r border-slate-100 relative">
                      <input
                        type="text"
                        value={row.finalOutlet?.pcl ?? ''}
                        disabled={slotDisabled}
                        onChange={(e) => handleCellChange(row.id, 'finalOutlet', 'pcl', e.target.value)}
                        placeholder="NIL"
                        className={`w-full text-center py-1.5 px-1 font-mono text-xs rounded border transition focus:outline-none ${
                          slotDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none'
                            : (errors[`${row.id}_finalOutlet_pcl`] || vPcl.isOutOfLimit)
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : row.finalOutlet?.pcl !== '' && row.finalOutlet?.pcl !== '0'
                            ? 'bg-emerald-50/50 border-emerald-300 text-slate-800 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      />
                      <EditedBadge isEdited={Boolean(editedFields[`${rowKey}_finalOutlet_pcl`] || editedFields[`${row.time}_finalOutlet_pcl`])} />
                      {vPcl.isOutOfLimit && !errors[`${row.id}_finalOutlet_pcl`] && pclLimit && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 whitespace-nowrap">
                          {pclLimit.formattedLabel || `Limit: ${pclLimit.min}-${pclLimit.max}`}
                        </div>
                      )}
                      {!vPcl.isOutOfLimit && !errors[`${row.id}_finalOutlet_pcl`] && pclLimit && (row.finalOutlet?.pcl === '' || row.finalOutlet?.pcl === undefined) && (
                        <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {pclLimit.formattedRange || `${pclLimit.min}-${pclLimit.max}`}
                        </div>
                      )}
                    </td>

                    {/* Slot Status Badge */}
                    <td className="py-2 px-2 text-center border-r border-slate-100">
                      <RecordStatusBadge status={badgeStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── FOOTER NOTE ── */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              One correction allowed after first save; saving the next slot/shift locks the previous one.
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            6 Slots (Bi-hourly 11:00 - 21:00)
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="Sewer Water Analysis"
        date={date}
        shiftOrTime="Bi-hourly (11:00 - 21:00)"
        summarySections={(() => {
          const targetReadings = confirmData?.readings || readings;
          const targetSlotKey = confirmData?.targetSlot;
          const slotsToDisplay = targetSlotKey
            ? targetReadings.filter((r) => r.id === targetSlotKey)
            : targetReadings.filter((r) => !lockedSlots[r.id]?.isLocked);

          return slotsToDisplay
            .filter((r) => SEWER_PARAMS.some(([sec, param]) => r[sec]?.[param] !== '' && r[sec]?.[param] !== null && r[sec]?.[param] !== undefined))
            .map((r) => ({
              title: `Slot ${r.time}:`,
              items: [
                {
                  label: '200# Sec FNH₃',
                  value: r.sec200?.fnh3 !== '' && r.sec200?.fnh3 !== null && r.sec200?.fnh3 !== undefined ? `${r.sec200.fnh3} ppm` : '—',
                },
                {
                  label: '200# Sec CNH₃',
                  value: r.sec200?.cnh3 !== '' && r.sec200?.cnh3 !== null && r.sec200?.cnh3 !== undefined ? `${r.sec200.cnh3} ppm` : '—',
                },
                {
                  label: '400# Sec FNH₃',
                  value: r.sec400?.fnh3 !== '' && r.sec400?.fnh3 !== null && r.sec400?.fnh3 !== undefined ? `${r.sec400.fnh3} ppm` : '—',
                },
                {
                  label: '400# Sec CNH₃',
                  value: r.sec400?.cnh3 !== '' && r.sec400?.cnh3 !== null && r.sec400?.cnh3 !== undefined ? `${r.sec400.cnh3} ppm` : '—',
                },
                {
                  label: '400# Sec HCO₃',
                  value: r.sec400?.hco3 !== '' && r.sec400?.hco3 !== null && r.sec400?.hco3 !== undefined ? r.sec400.hco3 : '—',
                },
                {
                  label: 'Final Outlet FNH₃',
                  value: r.finalOutlet?.fnh3 !== '' && r.finalOutlet?.fnh3 !== null && r.finalOutlet?.fnh3 !== undefined ? `${r.finalOutlet.fnh3} ppm` : '—',
                },
                {
                  label: 'Final Outlet CNH₃',
                  value: r.finalOutlet?.cnh3 !== '' && r.finalOutlet?.cnh3 !== null && r.finalOutlet?.cnh3 !== undefined ? `${r.finalOutlet.cnh3} ppm` : '—',
                },
                {
                  label: 'Final Outlet HCO₃',
                  value: r.finalOutlet?.hco3 !== '' && r.finalOutlet?.hco3 !== null && r.finalOutlet?.hco3 !== undefined ? r.finalOutlet.hco3 : '—',
                },
                {
                  label: 'Final Outlet PCl',
                  value: r.finalOutlet?.pcl !== '' && r.finalOutlet?.pcl !== null && r.finalOutlet?.pcl !== undefined ? r.finalOutlet.pcl : '—',
                },
              ],
            }));
        })()}
      />
    </div>
  );
};

export default SewerWaterAnalysisPage;
