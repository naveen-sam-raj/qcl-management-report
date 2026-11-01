import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  formatDateDisplay,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  EditedBadge,
} from '../../utils/offsetAnalysisHelper';
import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Clock,
  FlaskRound,
  Lock,
} from 'lucide-react';

// Default initial readings with empty measurement fields (visual order 06:30 - 11:30)
const DEFAULT_READINGS = [
  { id: 't0630', time: '06:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0730', time: '07:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0830', time: '08:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0930', time: '09:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't1030', time: '10:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't1130', time: '11:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
];

const SLOTS = ['t0630', 't0730', 't0830', 't0930', 't1030', 't1130'];
const NUMERIC_FIELDS = ['exCao', 'fnh3', 'cnh3', 'tnh3', 'nahco3'];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const DistillerWasteAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date] = useState(() => getOperatingDateIST());
  const [readings, setReadings] = useState(() => DEFAULT_READINGS.map((r) => ({ ...r })));
  const [originalReadings, setOriginalReadings] = useState(() => DEFAULT_READINGS.map((r) => ({ ...r })));
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
        const response = await api.get(`/distiller-waste-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }
          if (response.data.editedFields || record?.editedFields) {
            setEditedFields(response.data.editedFields || record.editedFields);
          } else {
            setEditedFields({});
          }
          if (response.data.lockedSlots || record?.lockedSlots) {
            setLockedSlots(response.data.lockedSlots || record.lockedSlots);
          } else {
            setLockedSlots({});
          }

          const fetchedReadings = response.data.readings || record?.readings || DEFAULT_READINGS.map((r) => ({ ...r }));
          setReadings(fetchedReadings);
          setOriginalReadings(fetchedReadings);
        } else {
          setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          setOriginalReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
          setLockedSlots({});
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        }
        setReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
        setOriginalReadings(DEFAULT_READINGS.map((r) => ({ ...r })));
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
  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };

        // Auto-calculate TNH3 = FNH3 + CNH3 if modifying FNH3 or CNH3 (safe decimal addition)
        if (field === 'fnh3' || field === 'cnh3') {
          const fnh3Val = field === 'fnh3' ? value : r.fnh3;
          const cnh3Val = field === 'cnh3' ? value : r.cnh3;
          if (fnh3Val !== '' && cnh3Val !== '' && !isNaN(Number(fnh3Val)) && !isNaN(Number(cnh3Val))) {
            const sum = Number(fnh3Val) + Number(cnh3Val);
            updated.tnh3 = String(parseFloat(sum.toFixed(4)));
          }
        }

        return updated;
      })
    );

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // ── Reset ──
  const handleReset = () => {
    setReadings(originalReadings.map((r) => ({ ...r })));
    setErrors({});
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Save flow with confirmation modal ──
  const initiateSave = () => {
    const newErrors = {};

    readings.forEach((r) => {
      NUMERIC_FIELDS.forEach((f) => {
        if (r[f] !== '' && r[f] !== null && r[f] !== undefined && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid';
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
      if (NUMERIC_FIELDS.some((f) => String(orig[f] || '').trim() !== String(curr[f] || '').trim())) {
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
      unit: 'Distiller waste',
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
      const res = await api.post('/distiller-waste-analysis', confirmData);

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
      { label: 'Total Scheduled Slots', value: '6 Slots (Hourly 06:30 - 11:30)' },
      { label: 'Plant', value: 'OFFSET Plant' },
      { label: 'Unit', value: 'Distiller waste' },
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
      Boolean(lockedSlots['t1130']?.isLocked) ||
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
        analysisName="Distiller Waste Water Analysis"
        onDismiss={() => {
          setSaveSuccess(false);
          setSavePhase('idle');
        }}
        saving={saving}
      />

      {/* ── TOP HEADER BAR (TK 203 Clean Theme) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                OFFSET Plant
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Utilities & Facilities
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200/60">
                Distiller Waste Water
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <FlaskRound className="w-5 h-5 text-violet-600" />
              DISTILLER WASTE WATER ANALYSIS
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          <LockedDateDisplay date={date} badgeText="Operating Day" id="distiller-locked-date" />

          <RecordStatusBadge
            status={overallBadgeStatus}
            subLabel={isAllLocked ? 'all slots locked' : lockedSlots['t0630']?.isSaved ? 'in progress' : 'first slot ready'}
          />

          {!isViewOnly && (
            <button
              onClick={handleReset}
              disabled={saving || isAllLocked}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly ? (
            <StatusSaveButton
              id="btn-distiller-save"
              saving={saving}
              isLocked={isAllLocked}
              savePhase={savePhase}
              onClick={initiateSave}
              alwaysShowSaveText={true}
              title="Save Distiller Waste Analysis"
            />
          ) : (
            <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Read-Only
            </span>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: Distiller Waste Water Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                Distiller Waste Water Hourly Laboratory Measurements
              </h2>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-3 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    TIME
                  </div>
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  Ex.CaO (%)
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  F.NH3 (ppm)
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  C.NH3 (ppm)
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  T.NH3 (ppm)
                </th>
                <th className="py-3 px-3 w-28 text-center border-r border-slate-700">
                  NaHCO3 (ppm)
                </th>
                <th className="py-3 px-3 w-24 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs font-medium text-slate-700">
              {readings.map((row, idx) => {
                const exCaoLimit = getCellLimit('offset', 'distiller-waste', '1 Hrs Once', 'exCao');
                const fnh3Limit = getCellLimit('offset', 'distiller-waste', '1 Hrs Once', 'fnh3');
                const cnh3Limit = getCellLimit('offset', 'distiller-waste', '1 Hrs Once', 'cnh3');
                const tnh3Limit = getCellLimit('offset', 'distiller-waste', '1 Hrs Once', 'tnh3');

                const slotId = row.id || SLOTS[idx];
                const slotDisabled = isSlotDisabled(slotId, idx);
                const slotBadgeStatus = getSlotBadgeStatus(slotId, idx);

                const isExCaoEdited = Boolean(editedFields[`${slotId}_exCao`] || editedFields[`${row.time}_exCao`]);
                const isFnh3Edited = Boolean(editedFields[`${slotId}_fnh3`] || editedFields[`${row.time}_fnh3`]);
                const isCnh3Edited = Boolean(editedFields[`${slotId}_cnh3`] || editedFields[`${row.time}_cnh3`]);
                const isTnh3Edited = Boolean(editedFields[`${slotId}_tnh3`] || editedFields[`${row.time}_tnh3`]);
                const isNahco3Edited = Boolean(editedFields[`${slotId}_nahco3`] || editedFields[`${row.time}_nahco3`]);

                const exCaoVal = validateCellValue(row.exCao, exCaoLimit);
                const fnh3Val = validateCellValue(row.fnh3, fnh3Limit);
                const cnh3Val = validateCellValue(row.cnh3, cnh3Limit);
                const tnh3Val = validateCellValue(row.tnh3, tnh3Limit);

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${slotDisabled ? 'bg-slate-50/60' : 'hover:bg-violet-50/30'}`}
                  >
                    {/* ROW INDEX */}
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-bold border-r border-slate-200">
                      {idx + 1}
                    </td>

                    {/* TIME (READ-ONLY) */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 border-r border-slate-200">
                      <span className="w-full text-center bg-slate-100 py-1 px-2 rounded font-semibold text-slate-800 border border-slate-200 block">
                        {row.time}
                      </span>
                    </td>

                    {/* EX.CAO */}
                    <td className="py-2 px-2 border-r border-slate-200">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.exCao}
                          disabled={slotDisabled}
                          onChange={(e) => handleCellChange(row.id, 'exCao', e.target.value)}
                          placeholder="00.00"
                          className={`w-full text-center font-mono text-xs py-1 px-1.5 rounded border transition outline-hidden ${slotDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : exCaoVal.isOutOfLimit
                                ? 'bg-rose-50 border-rose-300 text-rose-800 font-bold focus:ring-2 focus:ring-rose-400'
                                : errors[`${row.id}_exCao`]
                                  ? 'bg-red-50 border-red-400 text-red-900'
                                  : 'bg-white border-slate-300 text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-400'
                            }`}
                        />
                        {isExCaoEdited && <EditedBadge />}
                      </div>
                    </td>

                    {/* F.NH3 */}
                    <td className="py-2 px-2 border-r border-slate-200">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.fnh3}
                          disabled={slotDisabled}
                          onChange={(e) => handleCellChange(row.id, 'fnh3', e.target.value)}
                          placeholder="272"
                          className={`w-full text-center font-mono text-xs py-1 px-1.5 rounded border transition outline-hidden ${slotDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : fnh3Val.isOutOfLimit
                                ? 'bg-rose-50 border-rose-300 text-rose-800 font-bold focus:ring-2 focus:ring-rose-400'
                                : errors[`${row.id}_fnh3`]
                                  ? 'bg-red-50 border-red-400 text-red-900'
                                  : 'bg-white border-slate-300 text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-400'
                            }`}
                        />
                        {isFnh3Edited && <EditedBadge />}
                      </div>
                    </td>

                    {/* C.NH3 */}
                    <td className="py-2 px-2 border-r border-slate-200">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.cnh3}
                          disabled={slotDisabled}
                          onChange={(e) => handleCellChange(row.id, 'cnh3', e.target.value)}
                          placeholder="1190"
                          className={`w-full text-center font-mono text-xs py-1 px-1.5 rounded border transition outline-hidden ${slotDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : cnh3Val.isOutOfLimit
                                ? 'bg-rose-50 border-rose-300 text-rose-800 font-bold focus:ring-2 focus:ring-rose-400'
                                : errors[`${row.id}_cnh3`]
                                  ? 'bg-red-50 border-red-400 text-red-900'
                                  : 'bg-white border-slate-300 text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-400'
                            }`}
                        />
                        {isCnh3Edited && <EditedBadge />}
                      </div>
                    </td>

                    {/* T.NH3 (Auto-calculated, client side) */}
                    <td className="py-2 px-2 border-r border-slate-200">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.tnh3}
                          disabled={slotDisabled}
                          onChange={(e) => handleCellChange(row.id, 'tnh3', e.target.value)}
                          placeholder="1462"
                          className={`w-full text-center font-mono text-xs py-1 px-1.5 rounded border transition outline-hidden ${slotDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : tnh3Val.isOutOfLimit
                                ? 'bg-rose-50 border-rose-300 text-rose-800 font-bold focus:ring-2 focus:ring-rose-400'
                                : errors[`${row.id}_tnh3`]
                                  ? 'bg-red-50 border-red-400 text-red-900'
                                  : 'bg-white border-slate-300 text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-400'
                            }`}
                        />
                        {isTnh3Edited && <EditedBadge />}
                      </div>
                    </td>

                    {/* NAHCO3 */}
                    <td className="py-2 px-2 border-r border-slate-200">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.nahco3}
                          disabled={slotDisabled}
                          onChange={(e) => handleCellChange(row.id, 'nahco3', e.target.value)}
                          placeholder="0"
                          className={`w-full text-center font-mono text-xs py-1 px-1.5 rounded border transition outline-hidden ${slotDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : errors[`${row.id}_nahco3`]
                                ? 'bg-red-50 border-red-400 text-red-900'
                                : 'bg-white border-slate-300 text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-400'
                            }`}
                        />
                        {isNahco3Edited && <EditedBadge />}
                      </div>
                    </td>

                    {/* STATUS BADGE */}
                    <td className="py-2.5 px-2 text-center">
                      <RecordStatusBadge status={slotBadgeStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            One correction allowed after first save; saving the next slot/shift locks the previous one.
          </div>

          <div className="text-slate-500 text-xs">
            Formulas: <span className="font-semibold text-slate-700">TNH₃ = FNH₃ + CNH₃ | Ex.CaO in % | Ammonia in ppm</span>
          </div>
        </div>
      </div>

      {/* ── SAVE CONFIRMATION MODAL ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="Distiller Waste Water Analysis"
        date={date}
        shiftOrTime="Hourly (06:30 - 11:30)"
        summaryItems={summaryItems}
      />
    </div>
  );
};

export default DistillerWasteAnalysisPage;
