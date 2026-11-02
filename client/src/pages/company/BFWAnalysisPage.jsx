import React, { useState, useCallback, useEffect } from 'react';
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
  Droplets,
  Flame,
} from 'lucide-react';
import {
  validateCellValue,
  OFFSET_BFW_LIMITS,
  OFFSET_SHS_LIMITS,
} from '../../services/analysisValidation';
import {
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  EditedBadge,
} from '../../utils/offsetAnalysisHelper';
import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';

const DEFAULT_BFW_READINGS = [
  {
    id: 'r1',
    stream: 'Boiler Feed Water (BFW)',
    frequency: 'Day',
    time: '15:00',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    tAlk: '',
    sio2: '',
    fe2o3: '',
  },
];

const DEFAULT_SHS_READINGS = [
  {
    id: 'r2',
    stream: 'Super Heated Steam (SHS)',
    frequency: 'Day',
    time: '15:00',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    tAlk: '',
    sio2: '',
    fe2o3: '',
  },
];

const NUMERIC_FIELDS = ['ph', 'cond', 'alk', 'sio2'];

const isValidInput = (val, field) => {
  if (val === '' || val === null || val === undefined) return true;
  if (field === 'th') {
    const s = String(val).toLowerCase();
    if (s === 'nil' || s === 'n' || s === 'ni' || s === 'none' || s === '-' || s === '–') return true;
  }
  return /^-?\d*\.?\d*$/.test(val);
};

const BFWAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // Active Selected Option ('bfw' | 'shs')
  const [selectedOption, setSelectedOption] = useState('bfw');

  // States
  const [date] = useState(() => getOperatingDateIST());
  const [bfwReadings, setBfwReadings] = useState(() => DEFAULT_BFW_READINGS.map((r) => ({ ...r })));
  const [shsReadings, setShsReadings] = useState(() => DEFAULT_SHS_READINGS.map((r) => ({ ...r })));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [lockedSlots, setLockedSlots] = useState({
    bfw: { isSaved: false, isLocked: false, correctionUsed: false },
    shs: { isSaved: false, isLocked: false, correctionUsed: false },
  });

  // Active configuration based on selected option
  const isBfwSelected = selectedOption === 'bfw';
  const activeLimits = isBfwSelected ? OFFSET_BFW_LIMITS : OFFSET_SHS_LIMITS;
  const activeOptionLabel = isBfwSelected ? 'Boiler Feed Water (BFW)' : 'Super Heated Steam (SHS)';
  const activeReadings = isBfwSelected ? bfwReadings : shsReadings;
  const setActiveReadings = isBfwSelected ? setBfwReadings : setShsReadings;

  const activeSlotLock = lockedSlots[selectedOption] || {};
  const isSlotLocked = Boolean(activeSlotLock.isLocked);

  let badgeStatus = 'WAITING';
  if (selectedOption === 'bfw') {
    if (!activeSlotLock.isSaved) badgeStatus = 'NEW';
    else if (activeSlotLock.isLocked) badgeStatus = 'LOCKED';
    else badgeStatus = 'EDITABLE';
  } else {
    const bfwLock = lockedSlots.bfw || {};
    if (!activeSlotLock.isSaved) {
      badgeStatus = bfwLock.isSaved ? 'NEW' : 'WAITING';
    } else if (activeSlotLock.isLocked) {
      badgeStatus = 'LOCKED';
    } else {
      badgeStatus = 'EDITABLE';
    }
  }

  const isEditable = !isViewOnly && badgeStatus !== 'LOCKED' && badgeStatus !== 'WAITING';

  const hydrateReadings = (rawReadings) => {
    if (!Array.isArray(rawReadings) || rawReadings.length === 0) return;
    const bfw = rawReadings.find((r) => {
      const idStr = String(r?.id || '').toLowerCase();
      const sStr = String(r?.stream || '').toLowerCase();
      return idStr === 'r1' || idStr === 'bfw_1' || sStr.includes('boiler') || sStr.includes('bfw');
    });
    const shs = rawReadings.find((r) => {
      const idStr = String(r?.id || '').toLowerCase();
      const sStr = String(r?.stream || '').toLowerCase();
      return idStr === 'r2' || idStr === 'shs_1' || sStr.includes('super') || sStr.includes('shs');
    });

    if (bfw) setBfwReadings([{ ...bfw }]);
    if (shs) setShsReadings([{ ...shs }]);
  };

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/bfw-analysis?date=${date}`);
        if (!active) return;

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }
          if (response.data?.editedFields || record?.editedFields) {
            setEditedFields(response.data.editedFields || record.editedFields);
          } else {
            setEditedFields({});
          }

          if (response.data?.lockedSlots || record?.lockedSlots) {
            setLockedSlots(response.data.lockedSlots || record.lockedSlots);
          }

          const rawReadings = record?.readings || record?.data?.readings || record?.shifts || [];
          if (Array.isArray(rawReadings) && rawReadings.length > 0) {
            hydrateReadings(rawReadings);
          } else {
            setBfwReadings(DEFAULT_BFW_READINGS.map((r) => ({ ...r })));
            setShsReadings(DEFAULT_SHS_READINGS.map((r) => ({ ...r })));
          }
        } else {
          setBfwReadings(DEFAULT_BFW_READINGS.map((r) => ({ ...r })));
          setShsReadings(DEFAULT_SHS_READINGS.map((r) => ({ ...r })));
          setEditedFields({});
          setRecordId(null);
          if (response.data?.lockedSlots) {
            setLockedSlots(response.data.lockedSlots);
          }
        }
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        } else {
          console.warn('Could not fetch existing BFW data', err);
        }
        setBfwReadings(DEFAULT_BFW_READINGS.map((r) => ({ ...r })));
        setShsReadings(DEFAULT_SHS_READINGS.map((r) => ({ ...r })));
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date, showToast]);

  // Handle cell change
  const handleCellChange = useCallback(
    (id, field, value) => {
      if ((NUMERIC_FIELDS.includes(field) || field === 'th') && !isValidInput(value, field)) return;

      setActiveReadings((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, [field]: value };
          if (field === 'alk') {
            updated.tAlk = value;
          } else if (field === 'tAlk') {
            updated.alk = value;
          }
          return updated;
        })
      );

      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[`${id}_${field}`];
        return copy;
      });
    },
    [setActiveReadings]
  );

  // Reset active option fields
  const handleReset = () => {
    if (isSlotLocked) return;
    if (isBfwSelected) {
      setBfwReadings((prev) => [
        {
          id: prev[0]?.id || 'r1',
          stream: 'Boiler Feed Water (BFW)',
          frequency: 'Day',
          time: '15:00',
          ph: '',
          cond: '',
          th: '',
          alk: '',
          tAlk: '',
          sio2: '',
          fe2o3: '',
        },
      ]);
      showToast?.('BFW values reset to defaults.', 'info');
    } else {
      setShsReadings((prev) => [
        {
          id: prev[0]?.id || 'r2',
          stream: 'Super Heated Steam (SHS)',
          frequency: 'Day',
          time: '15:00',
          ph: '',
          cond: '',
          th: '',
          alk: '',
          tAlk: '',
          sio2: '',
          fe2o3: '',
        },
      ]);
      showToast?.('SHS values reset to defaults.', 'info');
    }
    setErrors({});
  };

  // Save active slot
  const handleSave = async () => {
    if (isViewOnly || saving || !isEditable) return;

    const currentErrors = {};
    const targetRow = isBfwSelected ? bfwReadings[0] : shsReadings[0];
    if (!targetRow) return;

    if (targetRow.th !== '' && targetRow.th !== null && targetRow.th !== undefined) {
      const s = String(targetRow.th).trim().toLowerCase();
      if (s !== 'nil' && s !== 'n' && s !== 'none' && s !== '-' && s !== '–' && isNaN(Number(targetRow.th))) {
        currentErrors[`${targetRow.id}_th`] = 'Invalid';
      }
    }

    NUMERIC_FIELDS.forEach((f) => {
      const val = targetRow[f];
      if (val !== '' && val !== null && val !== undefined) {
        const norm = String(val).trim();
        if (norm !== '' && norm !== '-' && norm !== '–' && isNaN(Number(norm))) {
          currentErrors[`${targetRow.id}_${f}`] = 'Invalid';
        }
      }
    });

    if (Object.keys(currentErrors).length > 0) {
      setErrors(currentErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date,
        targetSlot: selectedOption,
        readings: [
          {
            ...targetRow,
            alk: targetRow.alk || targetRow.tAlk || '',
            tAlk: targetRow.alk || targetRow.tAlk || '',
          },
        ],
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/bfw-analysis', payload);
      if (res.data?.noChange) {
        showToast?.('No changes', 'info');
      } else {
        showToast?.('Saved ✓', 'success');
      }

      if (res.data?.lockedSlots) {
        setLockedSlots(res.data.lockedSlots);
      }
      if (res.data?.editedFields) {
        setEditedFields(res.data.editedFields);
      }
      if (res.data?.recordId) {
        setRecordId(res.data.recordId);
      }
      if (res.data?.data?.readings) {
        hydrateReadings(res.data.data.readings);
      }
    } catch (err) {
      console.error('[BFWAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── TOP HEADER BAR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
            title="Back to Plant"
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
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                Boiler Feed Water / Super Heated Steam
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              {isBfwSelected ? (
                <Droplets className="w-5 h-5 text-blue-600" />
              ) : (
                <Flame className="w-5 h-5 text-amber-600" />
              )}
              BOILER FEED WATER / SUPER HEATED STEAM
            </h1>
          </div>
        </div>

        {/* Action Buttons: StatusBadge, Reset & StatusSaveButton */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          <LockedDateDisplay date={date} badgeText="Operating Day" id="bfw-locked-date" />

          <RecordStatusBadge
            status={badgeStatus}
            subLabel={isSlotLocked ? 'permanently locked' : activeSlotLock.isSaved ? '1 correction available' : 'initial entry'}
          />

          <button
            onClick={handleReset}
            disabled={saving || !isEditable}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>

          {!isViewOnly ? (
            <StatusSaveButton
              id="btn-bfw-save"
              saving={saving}
              isLocked={!isEditable}
              onClick={handleSave}
              alwaysShowSaveText={true}
              title={`Save ${activeOptionLabel} analysis`}
            />
          ) : (
            <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold">
              Read-Only
            </span>
          )}
        </div>
      </div>

      {/* ── SEPARATE SELECTABLE OPTIONS SWITCHER ── */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">
            Select Analysis:
          </span>

          {/* Option 1: BFW */}
          <button
            type="button"
            onClick={() => setSelectedOption('bfw')}
            className={`flex-1 sm:flex-none flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition border cursor-pointer ${
              isBfwSelected
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Droplets className={`w-4 h-4 ${isBfwSelected ? 'text-white' : 'text-blue-600'}`} />
            <span>Boiler Feed Water (BFW)</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                isBfwSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
              }`}
            >
              Slot 1
            </span>
          </button>

          {/* Option 2: SHS */}
          <button
            type="button"
            onClick={() => setSelectedOption('shs')}
            className={`flex-1 sm:flex-none flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition border cursor-pointer ${
              !isBfwSelected
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-500/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Flame className={`w-4 h-4 ${!isBfwSelected ? 'text-white' : 'text-amber-600'}`} />
            <span>Super Heated Steam (SHS)</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                !isBfwSelected ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-600'
              }`}
            >
              Slot 2
            </span>
          </button>
        </div>
      </div>

      {/* ── MEASUREMENTS TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                {activeOptionLabel} Analysis
              </h2>
            </div>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md">
              Frequency: Day
            </span>
          </div>
        </div>

        <div>
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
                <th className="py-3 px-2 w-10 text-center border-r border-slate-700">#</th>
                <th className="py-3 px-3 w-48 border-r border-slate-700">STREAM / SAMPLE</th>
                <th className="py-3 px-2 w-20 text-center border-r border-slate-700">TIME</th>

                {/* 1. pH */}
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">pH</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">Direct Range</div>
                </th>

                {/* 2. Cond */}
                <th className="py-3 px-2.5 w-32 text-center border-r border-slate-700">
                  <div className="text-white font-bold">Cond</div>
                  <div className="text-[10px] font-normal text-sky-300 normal-case">umho/cm</div>
                </th>

                {/* 3. TH */}
                <th className="py-3 px-2.5 w-24 text-center border-r border-slate-700">
                  <div className="text-white font-bold">TH</div>
                  <div className="text-[10px] font-normal text-emerald-300 normal-case">Nil</div>
                </th>

                {/* 4. Alk */}
                <th className="py-3 px-2.5 w-28 text-center border-r border-slate-700">
                  <div className="text-white font-bold">Alk</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>

                {/* 5. SiO2 */}
                <th className="py-3 px-2.5 w-32 text-center">
                  <div className="text-white font-bold">SiO₂</div>
                  <div className="text-[10px] font-normal text-amber-300 normal-case">ppm</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {activeReadings.map((row, idx) => {
                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isBfwSelected ? 'hover:bg-blue-50/40 bg-white' : 'hover:bg-amber-50/40 bg-slate-50/30'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-2.5 px-2 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* Stream Name */}
                    <td className="py-2.5 px-3 font-bold border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isBfwSelected ? 'bg-blue-600' : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-bold text-slate-800 text-xs px-1 py-0.5">
                          {row.stream}
                        </span>
                      </div>
                    </td>

                    {/* Time (Read-only) */}
                    <td className="py-2.5 px-2 text-center border-r border-slate-100">
                      <span className="font-mono font-bold text-xs text-slate-700">
                        {row.time || '15:00'}
                      </span>
                    </td>

                    {/* 1. pH */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.ph, activeLimits.ph);
                        const hasVal = row.ph !== '' && row.ph !== null && row.ph !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-ph`}
                                type="text"
                                inputMode="decimal"
                                value={row.ph}
                                disabled={!isEditable}
                                onChange={(e) => handleCellChange(row.id, 'ph', e.target.value)}
                                placeholder="7.0 – 9.5"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.ph} (Valid Range: 7.0 – 9.5)`
                                      : `NORMAL: ${row.ph} (Valid Range: 7.0 – 9.5)`
                                    : 'Direct Valid Range: 7.0 – 9.5'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !isEditable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_ph`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100'
                                }`}
                              />
                              {isOutOfLimit && (
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
                              <EditedBadge isEdited={Boolean(editedFields[`${row.id}_ph`])} />
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
                            {errors[`${row.id}_ph`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_ph`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 2. Cond */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.cond, activeLimits.cond);
                        const hasVal = row.cond !== '' && row.cond !== null && row.cond !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-cond`}
                                type="text"
                                inputMode="decimal"
                                value={row.cond}
                                disabled={!isEditable}
                                onChange={(e) => handleCellChange(row.id, 'cond', e.target.value)}
                                placeholder="5 – 15"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.cond} umho/cm (Valid: 5 – 15 umho/cm)`
                                      : `NORMAL: ${row.cond} umho/cm (Valid: 5 – 15 umho/cm)`
                                    : 'Valid Range: 5 – 15 umho/cm'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !isEditable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_cond`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100'
                                }`}
                              />
                              {isOutOfLimit && (
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
                              <EditedBadge isEdited={Boolean(editedFields[`${row.id}_cond`])} />
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
                            {errors[`${row.id}_cond`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_cond`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. TH */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <input
                              id={`${selectedOption}-input-${row.id}-th`}
                              type="text"
                              value={row.th}
                              disabled={!isEditable}
                              onChange={(e) => handleCellChange(row.id, 'th', e.target.value)}
                              placeholder="Nil"
                              title="Limit: Nil"
                              className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                !isEditable
                                  ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                  : errors[`${row.id}_th`]
                                  ? 'border-red-400 bg-red-50 text-red-700'
                                  : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-100'
                              }`}
                            />
                            <div className="flex items-center justify-center gap-1.5 w-full text-[10px] leading-tight">
                              <span className="text-slate-400 font-medium">Limit: Nil</span>
                              <EditedBadge isEdited={Boolean(editedFields[`${row.id}_th`])} />
                            </div>
                            {errors[`${row.id}_th`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_th`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 4. Alk */}
                    <td className="py-2 px-2 border-r border-slate-100 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.alk, activeLimits.alk);
                        const hasVal = row.alk !== '' && row.alk !== null && row.alk !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-alk`}
                                type="text"
                                inputMode="decimal"
                                value={row.alk}
                                disabled={!isEditable}
                                onChange={(e) => handleCellChange(row.id, 'alk', e.target.value)}
                                placeholder="1 – 9"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.alk} ppm (Valid: 1 – 9 ppm)`
                                      : `NORMAL: ${row.alk} ppm (Valid: 1 – 9 ppm)`
                                    : 'Valid Range: 1 – 9 ppm'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !isEditable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_alk`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100'
                                }`}
                              />
                              {isOutOfLimit && (
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
                              <EditedBadge isEdited={Boolean(editedFields[`${row.id}_alk`])} />
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
                            {errors[`${row.id}_alk`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_alk`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 5. SiO2 */}
                    <td className="py-2 px-2 align-top text-center">
                      {(() => {
                        const valRes = validateCellValue(row.sio2, activeLimits.sio2);
                        const hasVal = row.sio2 !== '' && row.sio2 !== null && row.sio2 !== undefined;
                        const isOutOfLimit = valRes.isOutOfLimit;
                        const isNormal = valRes.isNormal;

                        return (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <div className="relative w-full">
                              <input
                                id={`${selectedOption}-input-${row.id}-sio2`}
                                type="text"
                                inputMode="decimal"
                                value={row.sio2}
                                disabled={!isEditable}
                                onChange={(e) => handleCellChange(row.id, 'sio2', e.target.value)}
                                placeholder="0.20 ± 5"
                                title={
                                  hasVal
                                    ? isOutOfLimit
                                      ? `OUT OF LIMIT: ${row.sio2} ppm (Reference: 0.20 ± 5 ppm)`
                                      : `NORMAL: ${row.sio2} ppm (Reference: 0.20 ± 5 ppm)`
                                    : 'Reference: 0.20 ± 5 ppm'
                                }
                                className={`w-full px-2 py-1 text-xs font-bold text-center rounded border transition focus:outline-none ${
                                  !isEditable
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : errors[`${row.id}_sio2`]
                                    ? 'border-red-400 bg-red-50 text-red-700'
                                    : isOutOfLimit
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 font-black focus:ring-2 focus:ring-rose-200'
                                    : hasVal && isNormal
                                    ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950 font-bold focus:ring-2 focus:ring-emerald-200'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-100'
                                }`}
                              />
                              {isOutOfLimit && (
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
                              <EditedBadge isEdited={Boolean(editedFields[`${row.id}_sio2`])} />
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
                            {errors[`${row.id}_sio2`] && (
                              <div className="text-[10px] text-red-500 font-bold text-center mt-0.5">
                                {errors[`${row.id}_sio2`]}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center text-xs text-slate-500 font-medium py-3">
        One correction allowed after first save; saving the next slot/shift locks the previous one.
      </div>
    </div>
  );
};

export default BFWAnalysisPage;
