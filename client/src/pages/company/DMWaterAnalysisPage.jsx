import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  Droplets,
} from 'lucide-react';
import {
  getCellLimit,
  validateCellValue,
  OFFSET_DM_WATER_LIMITS,
} from '../../services/analysisValidation';
import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
import {
  formatDateDisplay,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  EditedBadge,
} from '../../utils/offsetAnalysisHelper';

// Centralized Limit Configs for Offset Plant -> DM Water (Frequency: Day)
const PH_LIMIT = OFFSET_DM_WATER_LIMITS.ph;
const COND_LIMIT = OFFSET_DM_WATER_LIMITS.cond;
const TH_LIMIT = OFFSET_DM_WATER_LIMITS.th;
const ALK_LIMIT = OFFSET_DM_WATER_LIMITS.alk;
const SIO2_LIMIT = OFFSET_DM_WATER_LIMITS.sio2;

const SLOT_KEYS = ['dm_water', 'a_unit'];
const USER_FIELDS = ['ph', 'cond', 'th', 'alk', 'sio2'];

const createInitialRows = () => [
  {
    id: 'r_dm_water',
    unit: 'DM WATER',
    time: '',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    sio2: '',
    p: '0',
    m: '0',
    isDefault: true,
    accent: 'blue',
  },
  {
    id: 'r_anion_unit',
    unit: 'A.UNIT',
    time: '',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    sio2: '',
    p: '0',
    m: '0',
    isDefault: true,
    accent: 'indigo',
  },
];

const DEFAULT_ROWS = createInitialRows();

const isValidInput = (val, field) => {
  if (val === '' || val === null || val === undefined || val === '–' || val === '-') return true;
  if (field === 'th') {
    const s = String(val).toLowerCase();
    if (s === 'nil' || s === 'n' || s === 'ni' || s === 'none' || s === '-' || s === '–' || s === '0') return true;
  }
  return /^-?\d*\.?\d*$/.test(val);
};

function getSlotKey(row) {
  if (!row || typeof row !== 'object') return null;
  const idStr = String(row.id || '').trim().toLowerCase();
  const unitStr = String(row.unit || '').trim().toLowerCase();
  if (idStr === 'r_dm_water' || unitStr === 'dm water' || unitStr.includes('dm water')) {
    return 'dm_water';
  }
  if (idStr === 'r_anion_unit' || unitStr === 'a.unit' || unitStr === 'a_unit' || unitStr.includes('anion')) {
    return 'a_unit';
  }
  return null;
}

const DMWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // Enforce today's operating date (06:00-06:00 IST), read-only without setter
  const [date] = useState(() => getOperatingDateIST());
  const [readings, setReadings] = useState(() => createInitialRows());
  const [originalReadings, setOriginalReadings] = useState(() => createInitialRows());
  const [lockedSlots, setLockedSlots] = useState({});
  const [initialSaved, setInitialSaved] = useState(false);
  const [editCount, setEditCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [editedFields, setEditedFields] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Fetch existing data on mount
  useEffect(() => {
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/dm-water-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success && response.data.data) {
          const rec = response.data.data;
          const sLocked = response.data.lockedSlots || rec.lockedSlots || {};
          setLockedSlots(sLocked);
          setInitialSaved(Boolean(response.data.initialSaved || rec.initialSaved));
          setEditCount(response.data.editCount ?? rec.editCount ?? 0);
          setIsLocked(Boolean(response.data.isLocked || rec.isLocked));
          setEditedFields(response.data.editedFields || rec.editedFields || {});

          const loaded = rec.readings || rec.shifts || rec.rows || [];
          if (Array.isArray(loaded) && loaded.length > 0) {
            const normalized = loaded.map((r, idx) => ({
              ...r,
              id: r.id || (idx === 0 ? 'r_dm_water' : idx === 1 ? 'r_anion_unit' : `r_custom_${idx}`),
              unit: r.unit || (idx === 0 ? 'DM WATER' : idx === 1 ? 'A.UNIT' : `Stream ${idx + 1}`),
              time: r.time !== undefined && r.time !== null ? String(r.time) : '',
              ph: r.ph === '–' || r.ph === '-' ? '' : (r.ph || ''),
              cond: r.cond === '–' || r.cond === '-' ? '' : (r.cond || ''),
              th: r.th === '–' || r.th === '-' ? '' : (r.th || ''),
              alk: r.alk === '–' || r.alk === '-' ? '' : (r.alk || ''),
              sio2: r.sio2 === '–' || r.sio2 === '-' ? '' : (r.sio2 || ''),
              p: r.p || '0',
              m: r.m || r.alk || '0',
              isDefault: idx < 2,
              accent: idx % 2 === 0 ? 'blue' : 'indigo',
            }));

            if (normalized.length === 1) {
              const firstIsDM = String(normalized[0].unit).toUpperCase().includes('DM');
              normalized.push({
                id: firstIsDM ? 'r_anion_unit' : 'r_dm_water',
                unit: firstIsDM ? 'A.UNIT' : 'DM WATER',
                time: '',
                ph: '',
                cond: '',
                th: '',
                alk: '',
                sio2: '',
                p: '0',
                m: '0',
                isDefault: true,
                accent: firstIsDM ? 'indigo' : 'blue',
              });
            }

            setReadings(normalized);
            setOriginalReadings(normalized);
          } else {
            setReadings(createInitialRows());
            setOriginalReadings(createInitialRows());
          }
        } else {
          setReadings(createInitialRows());
          setOriginalReadings(createInitialRows());
          setLockedSlots({});
          setInitialSaved(false);
          setEditCount(0);
          setIsLocked(false);
          setEditedFields({});
        }
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        } else {
          console.warn('[DMWater GET] Fetch error note:', err.message);
        }
        setReadings(createInitialRows());
        setOriginalReadings(createInitialRows());
        setLockedSlots({});
        setInitialSaved(false);
        setEditCount(0);
        setIsLocked(false);
        setEditedFields({});
      }
    };

    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date, showToast]);

  // Handle cell change
  const handleCellChange = useCallback((id, field, value) => {
    let cleanVal = value;
    if (typeof cleanVal === 'string' && cleanVal.includes('–')) {
      cleanVal = cleanVal.replace(/–/g, '');
    }
    if (USER_FIELDS.includes(field) && !isValidInput(cleanVal, field)) return;

    setReadings((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: cleanVal } : row))
    );

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  // Reset restores initial/original state for current operating date
  const handleReset = () => {
    setReadings(originalReadings.map((r) => ({ ...r })));
    setErrors({});
    showToast?.('Values reset to initial unentered state.', 'info');
  };

  // Validate numeric fields before save
  const validate = () => {
    const newErrors = {};
    let hasError = false;

    readings.forEach((row) => {
      const sk = getSlotKey(row);
      if (!sk) return;
      USER_FIELDS.forEach((field) => {
        const val = row[field];
        if (val !== '' && val !== null && val !== undefined && val !== '–' && val !== '-') {
          if (field === 'th') {
            const s = String(val).toLowerCase();
            if (s === 'nil' || s === 'none' || s === '-' || s === '–' || !isNaN(Number(val))) {
              return;
            }
          }
          if (isNaN(Number(val))) {
            newErrors[`${row.id}_${field}`] = 'Invalid number';
            hasError = true;
          }
        }
      });
    });

    setErrors(newErrors);
    return !hasError;
  };

  // Direct save handler
  const handleSave = async () => {
    if (isViewOnly || saving) return;

    if (!validate()) {
      showToast?.('Please correct invalid numeric entries.', 'error');
      return;
    }

    // Identify changed slot
    const diffSlots = [];
    SLOT_KEYS.forEach((sk) => {
      const origRow = originalReadings.find((r) => getSlotKey(r) === sk) || {};
      const currRow = readings.find((r) => getSlotKey(r) === sk) || {};
      let changed = false;
      USER_FIELDS.forEach((f) => {
        const oVal = origRow[f] === undefined || origRow[f] === null || origRow[f] === '–' || origRow[f] === '-' ? '' : String(origRow[f]).trim();
        const cVal = currRow[f] === undefined || currRow[f] === null || currRow[f] === '–' || currRow[f] === '-' ? '' : String(currRow[f]).trim();
        if (oVal !== cVal) {
          changed = true;
        }
      });
      if (changed) {
        diffSlots.push(sk);
      }
    });

    if (diffSlots.length > 1) {
      showToast?.('Only one slot can be saved per submission.', 'warning');
      return;
    }

    let targetSlot = null;
    if (diffSlots.length === 1) {
      targetSlot = diffSlots[0];
    } else {
      const firstUnsaved = SLOT_KEYS.find((sk) => !lockedSlots[sk]?.isSaved);
      targetSlot = firstUnsaved || SLOT_KEYS[0];
    }

    // Check target slot emptiness on user fields
    const targetCurrRow = readings.find((r) => getSlotKey(r) === targetSlot) || {};
    const hasAnyTargetValue = USER_FIELDS.some((f) => {
      const v = targetCurrRow[f];
      return v !== '' && v !== null && v !== undefined && v !== '–' && v !== '-';
    });

    const isTargetSaved = Boolean(lockedSlots[targetSlot]?.isSaved);
    if (!hasAnyTargetValue && !isTargetSaved) {
      showToast?.('Please enter at least one analytical reading value.', 'warning');
      return;
    }

    setSaving(true);
    const payload = {
      date,
      targetSlot,
      readings: readings.map((r) => ({
        ...r,
        ph: r.ph === '–' || r.ph === '-' ? '' : r.ph,
        cond: r.cond === '–' || r.cond === '-' ? '' : r.cond,
        th: r.th === '–' || r.th === '-' ? '' : r.th,
        alk: r.alk === '–' || r.alk === '-' ? '' : r.alk,
        sio2: r.sio2 === '–' || r.sio2 === '-' ? '' : r.sio2,
        p: r.p !== undefined && r.p !== '' && r.p !== '–' && r.p !== '-' ? r.p : '0',
        m: (r.alk !== undefined && r.alk !== '' && r.alk !== '–' && r.alk !== '-')
          ? r.alk
          : (r.m && r.m !== '–' && r.m !== '-' ? r.m : '0'),
      })),
      submittedBy: user?.name || 'Shift Chemist',
    };

    try {
      const response = await api.post('/dm-water-analysis', payload);
      if (response.data?.noChange) {
        showToast?.('No changes', 'info');
        return;
      }

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Database save not confirmed');
      }

      const savedDoc = response.data?.data;
      const sLocked = response.data?.lockedSlots || savedDoc?.lockedSlots || {};
      setLockedSlots(sLocked);
      setInitialSaved(Boolean(response.data?.initialSaved || savedDoc?.initialSaved));
      setEditCount(response.data?.editCount ?? savedDoc?.editCount ?? 0);
      setIsLocked(Boolean(response.data?.isLocked || savedDoc?.isLocked));

      if (response.data?.editedFields || savedDoc?.editedFields) {
        setEditedFields(response.data.editedFields || savedDoc.editedFields);
      }

      const updatedReadings = readings.map((r) => ({ ...r }));
      setReadings(updatedReadings);
      setOriginalReadings(updatedReadings);

      showToast?.('Saved ✓', 'success');
    } catch (err) {
      console.error('[DMWaterAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getSlotStatusInfo = (sk) => {
    const s = lockedSlots[sk];
    if (s?.isLocked) {
      return { status: 'LOCKED', label: 'LOCKED' };
    }
    if (s?.isSaved && !s?.correctionUsed) {
      return { status: 'EDITABLE', label: 'EDITABLE' };
    }
    if (sk === 'a_unit' && !lockedSlots.dm_water?.isSaved) {
      return { status: 'WAITING', label: 'WAITING' };
    }
    return { status: 'NEW', label: 'OPEN' };
  };

  const isSlotEditable = (sk) => {
    if (isViewOnly) return false;
    const s = lockedSlots[sk];
    if (s?.isLocked) return false;
    if (sk === 'a_unit' && !lockedSlots.dm_water?.isSaved) return false;
    return true;
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Breadcrumb & Top Navigation */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Plant Navigation + Title */}
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
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                <span>OFFSET Plant</span>
                <ChevronRight className="w-3 h-3" />
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-600 font-semibold">DM Water</span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
                DM WATER ANALYSIS
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            <LockedDateDisplay date={date} badgeText="Operating Day" id="dm-locked-date" />

            <RecordStatusBadge
              status={isLocked ? 'LOCKED' : initialSaved ? 'SAVED' : 'NEW'}
              subLabel={isLocked ? 'permanently locked' : initialSaved ? 'saved record' : 'unsaved'}
            />

            <button
              id="btn-dm-reset"
              onClick={handleReset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-50"
              title="Reset to initial unentered values"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            {!isViewOnly ? (
              <StatusSaveButton
                id="btn-dm-save"
                saving={saving}
                isLocked={isLocked}
                alwaysShowSaveText={true}
                onClick={handleSave}
                title="Save DM Water analysis"
              />
            ) : (
              <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold">
                Read-Only
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Meta Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              DM Water Observations Table
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              {readings.length} Stream{readings.length > 1 ? 's' : ''}
            </span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
              Frequency: Day
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LockedDateDisplay date={date} id="dm-date-display" />
          </div>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto w-full table-responsive-container">
          <table className="w-full text-center border-collapse min-w-[900px] xl:min-w-full">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                <th className="py-3 px-2 w-12 min-w-[48px] text-center text-slate-400 font-semibold border-r border-slate-800">
                  #
                </th>
                <th className="py-2.5 px-3 min-w-[160px] w-[18%] text-center border-r border-slate-800">
                  Unit / Stream
                </th>
                <th className="py-2.5 px-2 min-w-[100px] w-[11%] text-center border-r border-slate-800">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Time</span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[120px] w-[14%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-blue-300">pH</div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[130px] w-[15%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-cyan-300">Cond</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(umho/cm)</div>
                </th>
                <th className="py-2.5 px-2 min-w-[110px] w-[12%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-amber-300">TH</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(ppm)</div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[120px] w-[14%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-emerald-300">Alk</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(ppm)</div>
                </th>
                <th className="py-2.5 px-2.5 min-w-[120px] w-[14%] text-center border-r border-slate-800">
                  <div className="font-extrabold text-indigo-300">SiO₂</div>
                  <div className="text-[10px] text-slate-300 font-normal normal-case">(ppm)</div>
                </th>
                <th className="py-2.5 px-2 w-28 min-w-[100px] text-center">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const sk = getSlotKey(row);
                const isDM = sk === 'dm_water';
                const isAnion = sk === 'a_unit';
                const editable = sk ? isSlotEditable(sk) : false;
                const slotInfo = sk ? getSlotStatusInfo(sk) : { status: 'CUSTOM', label: 'LEGACY' };

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${isDM
                        ? 'bg-blue-50/20 hover:bg-blue-50/40'
                        : isAnion
                          ? 'bg-indigo-50/20 hover:bg-indigo-50/40'
                          : 'hover:bg-slate-50'
                      }`}
                  >
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center text-slate-400 font-semibold border-r border-slate-100 text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Unit / Stream Name */}
                    <td className="py-2.5 px-3 border-r border-slate-100 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${isDM
                              ? 'bg-blue-600'
                              : isAnion
                                ? 'bg-indigo-600'
                                : 'bg-emerald-500'
                            }`}
                        />
                        <div className="font-extrabold text-slate-900 tracking-wide text-xs text-center">
                          {row.unit}
                          <div className="text-[10px] text-slate-400 font-medium">
                            {isDM ? 'Demineralized Water' : isAnion ? 'Anion Exchange Unit' : 'Legacy Stream'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Time (Read-only) */}
                    <td className="py-2.5 px-2 border-r border-slate-100 text-center font-mono font-bold text-slate-700 bg-slate-50/40">
                      {row.time || '–'}
                    </td>

                    {/* 1. pH: Direct Valid Range 7.0 – 9.5 */}
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ph === '–' ? '' : row.ph, PH_LIMIT);
                        const hasVal = row.ph !== '' && row.ph !== null && row.ph !== undefined && row.ph !== '–' && row.ph !== '-';
                        const isOutOfLimit = hasVal && valRes.isOutOfLimit;
                        const isNormal = hasVal && valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-ph`}
                                type="text"
                                inputMode="decimal"
                                value={row.ph}
                                disabled={!editable}
                                onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                                placeholder="7.0 – 9.5"
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${!editable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_ph`]
                                      ? 'border-red-400 bg-red-50 text-red-700'
                                      : hasVal && isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                        : hasVal && isNormal
                                          ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                          : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                                  }`}
                              />
                              {hasVal && isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 7.0 – 9.5"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">7.0 – 9.5</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            <EditedBadge isEdited={editedFields[`${row.id}_ph`] || editedFields[`${row.unit}_ph`] || editedFields[`${sk}_ph`]} />
                            {errors[`${row.id}_ph`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_ph`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 2. Cond: Target 10 umho/cm, Tolerance ±5 -> Valid Range 5 – 15 umho/cm */}
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.cond === '–' ? '' : row.cond, COND_LIMIT);
                        const hasVal = row.cond !== '' && row.cond !== null && row.cond !== undefined && row.cond !== '–' && row.cond !== '-';
                        const isOutOfLimit = hasVal && valRes.isOutOfLimit;
                        const isNormal = hasVal && valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-cond`}
                                type="text"
                                inputMode="decimal"
                                value={row.cond}
                                disabled={!editable}
                                onChange={(e) => handleCellChange(row.id, 'cond', e.target.value)}
                                placeholder="5 – 15"
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${!editable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_cond`]
                                      ? 'border-red-400 bg-red-50 text-red-700'
                                      : hasVal && isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                        : hasVal && isNormal
                                          ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                          : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100'
                                  }`}
                              />
                              {hasVal && isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 5 – 15 umho/cm"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">5 – 15 umho/cm</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            <EditedBadge isEdited={editedFields[`${row.id}_cond`] || editedFields[`${row.unit}_cond`] || editedFields[`${sk}_cond`]} />
                            {errors[`${row.id}_cond`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_cond`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. TH: Limit Nil */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const hasVal = row.th !== '' && row.th !== null && row.th !== undefined && row.th !== '–' && row.th !== '-';

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <input
                              id={`dm-water-input-${row.id}-th`}
                              type="text"
                              value={row.th}
                              disabled={!editable}
                              onChange={(e) => handleCellChange(row.id, 'th', e.target.value)}
                              placeholder="Nil"
                              className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${!editable
                                  ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                  : errors[`${row.id}_th`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : hasVal
                                      ? 'border-slate-300 bg-white text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                                      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                                }`}
                            />
                            <div className="flex items-center justify-center gap-1 w-full text-[10px] leading-tight">
                              <span className="text-slate-400 font-medium">Limit: Nil</span>
                            </div>
                            <EditedBadge isEdited={editedFields[`${row.id}_th`] || editedFields[`${row.unit}_th`] || editedFields[`${sk}_th`]} />
                            {errors[`${row.id}_th`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_th`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 4. Alk: Target 5 ppm, Tolerance ±4 -> Valid Range 1 – 9 ppm */}
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.alk === '–' ? '' : row.alk, ALK_LIMIT);
                        const hasVal = row.alk !== '' && row.alk !== null && row.alk !== undefined && row.alk !== '–' && row.alk !== '-';
                        const isOutOfLimit = hasVal && valRes.isOutOfLimit;
                        const isNormal = hasVal && valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-alk`}
                                type="text"
                                inputMode="decimal"
                                value={row.alk}
                                disabled={!editable}
                                onChange={(e) => handleCellChange(row.id, 'alk', e.target.value)}
                                placeholder="1 – 9"
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${!editable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_alk`]
                                      ? 'border-red-400 bg-red-50 text-red-700'
                                      : hasVal && isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                        : hasVal && isNormal
                                          ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                          : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
                                  }`}
                              />
                              {hasVal && isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 1 – 9 ppm"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">1 – 9 ppm</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            <EditedBadge isEdited={editedFields[`${row.id}_alk`] || editedFields[`${row.unit}_alk`] || editedFields[`${sk}_alk`]} />
                            {errors[`${row.id}_alk`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_alk`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. SiO2: Reference 0.20 ppm, Tolerance ±5 */}
                    <td className="py-2 px-2.5 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.sio2 === '–' ? '' : row.sio2, SIO2_LIMIT);
                        const hasVal = row.sio2 !== '' && row.sio2 !== null && row.sio2 !== undefined && row.sio2 !== '–' && row.sio2 !== '-';
                        const isOutOfLimit = hasVal && valRes.isOutOfLimit;
                        const isNormal = hasVal && valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full max-w-[200px] 2xl:max-w-[260px] mx-auto">
                            <div className="relative w-full">
                              <input
                                id={`dm-water-input-${row.id}-sio2`}
                                type="text"
                                inputMode="decimal"
                                value={row.sio2}
                                disabled={!editable}
                                onChange={(e) => handleCellChange(row.id, 'sio2', e.target.value)}
                                placeholder="0.20 ± 5"
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${!editable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_sio2`]
                                      ? 'border-red-400 bg-red-50 text-red-700'
                                      : hasVal && isOutOfLimit
                                        ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                        : hasVal && isNormal
                                          ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                          : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                                  }`}
                              />
                              {hasVal && isOutOfLimit && (
                                <span
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-3.5 h-3.5 shadow-xs flex items-center justify-center pointer-events-none"
                                  title="Out of limit: 0.20 ± 5 ppm"
                                >
                                  <AlertCircle className="w-2 h-2 text-white" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight flex-wrap">
                              <span className="text-slate-400 font-medium">0.20 ± 5 ppm</span>
                              {hasVal && (
                                isOutOfLimit ? (
                                  <span className="font-black text-rose-700 bg-rose-100 px-1 py-0.2 rounded border border-rose-300 text-[9px] whitespace-nowrap">
                                    OUT OF LIMIT
                                  </span>
                                ) : isNormal ? (
                                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[9px] whitespace-nowrap inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> NORMAL
                                  </span>
                                ) : null
                              )}
                            </div>
                            <EditedBadge isEdited={editedFields[`${row.id}_sio2`] || editedFields[`${row.unit}_sio2`] || editedFields[`${sk}_sio2`]} />
                            {errors[`${row.id}_sio2`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_sio2`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-2 text-center align-top">
                      <RecordStatusBadge
                        status={slotInfo.status}
                        subLabel={slotInfo.label}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-700">Total Stream Rows: {readings.length}</span>
            <span>•</span>
            <span className="text-slate-500">Frequency: <strong className="text-slate-700">Day</strong></span>
            <span>•</span>
            <span>Click any cell to edit numeric values</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium italic">
            One correction allowed after first save; saving the next slot/shift locks the previous one.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DMWaterAnalysisPage;
