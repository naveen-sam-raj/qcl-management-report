import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  LockedDateDisplay,
  StatusSaveButton,
  RecordStatusBadge,
  EditedBadge,
} from '../../utils/offsetAnalysisHelper';
import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
import {
  ArrowLeft,
  RotateCcw,
  ChevronRight,
  Clock,
  ThermometerSnowflake,
  AlertCircle,
} from 'lucide-react';

const emptyRowCW = { ph: '', frc: '', cl: '', opo4: '', turbidity: '', tds: '', fe: '', sio2: '', alk: '', so4: '', th: '', cah: '', mgh: '', ammn: '' };
const emptyRow200 = { ph: '', frc: '', opo4: '', cl: '' };

const DEFAULT_READINGS_DAY = [
  { id: 't07', time: '07:00', ...emptyRowCW },
  { id: 't09', time: '09:00', ...emptyRowCW },
  { id: 't11', time: '11:00', ...emptyRowCW },
  { id: 't13', time: '13:00', ...emptyRowCW },
  { id: 't15', time: '15:00', ...emptyRowCW },
  { id: 't17', time: '17:00', ...emptyRowCW },
];

const DEFAULT_READINGS_200 = [
  { id: 't07', time: '07:00', ...emptyRow200 },
  { id: 't19', time: '19:00', ...emptyRow200 },
];

const SLOTS_CW = ['t07', 't09', 't11', 't13', 't15', 't17'];
const SLOTS_200 = ['t07', 't19'];

const CW_NUMERIC_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh'];
const CW_ALL_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh', 'ammn'];

const CW200_NUMERIC_FIELDS = ['ph', 'frc', 'opo4', 'cl'];
const CW200_ALL_FIELDS = ['ph', 'frc', 'opo4', 'cl'];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const CoolingWaterAnalysisPage = ({ plantId = 'offset', is200 = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  const slots = is200 ? SLOTS_200 : SLOTS_CW;
  const fields = is200 ? CW200_ALL_FIELDS : CW_ALL_FIELDS;
  const numericFields = is200 ? CW200_NUMERIC_FIELDS : CW_NUMERIC_FIELDS;
  const defaultReadings = is200 ? DEFAULT_READINGS_200 : DEFAULT_READINGS_DAY;

  // ── States ──
  const [date] = useState(() => getOperatingDateIST());
  const [readings, setReadings] = useState(() => defaultReadings.map((r) => ({ ...r })));
  const [originalReadings, setOriginalReadings] = useState(() => defaultReadings.map((r) => ({ ...r })));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [lockedSlots, setLockedSlots] = useState({});
  const [editedFields, setEditedFields] = useState({});

  // Fetch existing data when date or is200 changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const unitParam = is200 ? 'cooling water 200#' : 'cooling water';
        const response = await api.get(`/cooling-water-analysis?date=${date}&unit=${encodeURIComponent(unitParam)}`);
        if (!active) return;

        if (response.data && response.data.success && response.data.data) {
          const payloadData = response.data.data;
          const record = Array.isArray(payloadData) ? payloadData[0] : payloadData;
          if (record && (record._id || record.id)) {
            setRecordId(record._id || record.id);
          }
          if (response.data.lockedSlots || record?.lockedSlots) {
            setLockedSlots(response.data.lockedSlots || record.lockedSlots);
          } else {
            setLockedSlots({});
          }
          if (response.data.editedFields || record?.editedFields) {
            setEditedFields(response.data.editedFields || record.editedFields);
          } else {
            setEditedFields({});
          }

          const fetchedReadings = response.data.readings || record?.readings || defaultReadings.map((r) => ({ ...r }));
          setReadings(fetchedReadings);
          setOriginalReadings(fetchedReadings);
        } else {
          setReadings(defaultReadings.map((r) => ({ ...r })));
          setOriginalReadings(defaultReadings.map((r) => ({ ...r })));
          setLockedSlots({});
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 403) {
          showToast?.('Access restricted to admins.', 'error');
        } else {
          console.warn('Could not fetch existing Cooling Water data', err);
        }
        setReadings(defaultReadings.map((r) => ({ ...r })));
        setOriginalReadings(defaultReadings.map((r) => ({ ...r })));
        setLockedSlots({});
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date, is200]);

  const handleCellChange = useCallback((id, field, value) => {
    if (field !== 'time' && field !== 'ammn' && !isValidDecimal(value)) return;

    setReadings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}_${field}`];
      return copy;
    });
  }, []);

  const handleReset = () => {
    setReadings(originalReadings.map((r) => ({ ...r })));
    setErrors({});
    showToast?.('Values reset to saved state.', 'info');
  };

  const isSlotDisabled = useCallback((slotId, idx) => {
    if (isViewOnly) return true;
    if (lockedSlots[slotId]?.isLocked) return true;
    if (idx > 0 && !lockedSlots[slots[idx - 1]]?.isSaved) return true;
    return false;
  }, [isViewOnly, lockedSlots, slots]);

  const getSlotStatus = useCallback((slotId, idx) => {
    if (lockedSlots[slotId]?.isLocked) return 'LOCKED';
    if (idx > 0 && !lockedSlots[slots[idx - 1]]?.isSaved) return 'WAITING';
    if (lockedSlots[slotId]?.isSaved) return 'EDITABLE';
    return 'NEW';
  }, [lockedSlots, slots]);

  const isAllLocked = useMemo(() => {
    return slots.length > 0 && slots.every((sk) => lockedSlots[sk]?.isLocked);
  }, [slots, lockedSlots]);

  const overallStatus = useMemo(() => {
    if (isAllLocked) return 'locked';
    if (slots.some((sk) => lockedSlots[sk]?.isSaved)) return 'editable';
    return 'new';
  }, [isAllLocked, slots, lockedSlots]);

  // ── Save flow: single targetSlot submission ──
  const handleSave = async () => {
    const newErrors = {};

    readings.forEach((r) => {
      numericFields.forEach((f) => {
        if (r[f] !== '' && r[f] !== null && r[f] !== undefined && isNaN(Number(r[f]))) {
          newErrors[`${r.id}_${f}`] = 'Invalid';
        }
      });
      if (!is200 && r.ammn !== '' && r.ammn !== null && r.ammn !== undefined) {
        const isNil = ['nil', 'n', 'ni', 'none', '-'].includes(String(r.ammn).toLowerCase().trim());
        if (!isNil && isNaN(Number(r.ammn))) {
          newErrors[`${r.id}_ammn`] = 'Invalid';
        }
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please check and fix highlighted cell errors.', 'error');
      return;
    }

    // Detect which slot was entered or changed relative to originalReadings
    const modifiedSlots = slots.filter((sk) => {
      const current = readings.find((r) => r.id === sk) || {};
      const orig = originalReadings.find((r) => r.id === sk) || {};
      return fields.some((f) => {
        const cv = current[f] !== undefined && current[f] !== null ? String(current[f]).trim() : '';
        const ov = orig[f] !== undefined && orig[f] !== null ? String(orig[f]).trim() : '';
        return cv !== ov;
      });
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
    setSaving(true);

    try {
      const payload = {
        date,
        plant: 'OFFSET',
        unit: is200 ? 'cooling water 200#' : 'cooling water',
        targetSlot,
        readings,
        submittedBy: user?.name || 'Authorized Admin',
      };

      const res = await api.post('/cooling-water-analysis', payload);

      if (res.data?.success) {
        if (res.data.recordId) {
          setRecordId(res.data.recordId);
        }
        if (res.data.lockedSlots) {
          setLockedSlots(res.data.lockedSlots);
        }
        if (res.data.editedFields) {
          setEditedFields(res.data.editedFields);
        }
        if (res.data.data?.readings) {
          setReadings(res.data.data.readings);
          setOriginalReadings(res.data.data.readings);
        }

        if (res.data.noChange) {
          showToast?.('No changes', 'info');
        } else {
          showToast?.('Saved ✓', 'success');
        }
      } else {
        showToast?.(res.data?.message || 'Error saving Cooling Water data.', 'error');
      }
    } catch (err) {
      console.error('API save error:', err);
      const errMsg = err.response?.data?.message || 'Failed to save Cooling Water Analysis to database.';
      showToast?.(errMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── TOP HEADER BAR ── */}
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
              <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200/60">
                {is200 ? 'Cooling Water / 200#' : 'Cooling Water (C.W Water)'}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <ThermometerSnowflake className="w-5 h-5 text-cyan-600" />
              {is200 ? 'COOLING WATER / 200# ANALYSIS' : 'COOLING WATER ANALYSIS (C.W WATER)'}
            </h1>
          </div>
        </div>

        {/* Action Buttons: Reset & Save */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <LockedDateDisplay date={date} badgeText="Operating Day" id="cw-locked-date" />

          <div className="mr-2">
            <RecordStatusBadge
              status={overallStatus}
              subLabel={isAllLocked ? 'all slots locked' : lockedSlots[slots[0]]?.isSaved ? 'in progress' : 'first slot ready'}
            />
          </div>

          {!isViewOnly && (
            <button
              onClick={handleReset}
              disabled={saving || isAllLocked}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          )}

          {!isViewOnly && (
            <StatusSaveButton
              saving={saving}
              isLocked={isAllLocked}
              savePhase="idle"
              onClick={handleSave}
              alwaysShowSaveText={true}
              className="px-4 py-2 text-xs"
            />
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: Cooling Water Table ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase">
                {is200 ? 'Cooling Water / 200# Shift Readings (07:00, 19:00)' : 'Cooling Water (C.W Water) Laboratory Readings'}
              </h2>
            </div>
            <LockedDateDisplay date={date} id="cw-date-display" />
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
                    {is200 ? 'SHIFT / TIME' : 'TIME'}
                  </div>
                </th>
                <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                  <div>pH</div>
                </th>
                <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                  <div>FRC</div>
                  <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                </th>
                {is200 ? (
                  <>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>O-PO₄</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Cl</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                  </>
                ) : (
                  <>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Cl</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>O-PO₄</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Turbidity</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">NTU</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>TDS</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Fe</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>SiO₂</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>ALK</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>SO₄</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>TH</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>CaH</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>MgH</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">ppm</div>
                    </th>
                    <th className="py-3 px-3 min-w-[80px] text-center border-r border-slate-700">
                      <div>Amm.N</div>
                      <div className="text-[9px] font-normal text-emerald-400/80 normal-case mt-0.5">Limit: NIL</div>
                    </th>
                  </>
                )}
                <th className="py-3 px-4 text-center border-r border-slate-700">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {readings.map((row, idx) => {
                const getLimit = (param) => getCellLimit('offset', 'cooling-water', is200 ? 'shiftTwice' : 'Day', is200 ? `sec200${param}` : param);

                const limits = {
                  ph: getLimit('ph'),
                  frc: getLimit('frc'),
                  cl: getLimit('cl'),
                  opo4: getLimit('opo4'),
                  turbidity: getLimit('turbidity'),
                  tds: getLimit('tds'),
                  fe: getLimit('fe'),
                  sio2: getLimit('sio2'),
                  alk: getLimit('alk'),
                  so4: getLimit('so4'),
                  th: getLimit('th'),
                  cah: getLimit('cah'),
                  mgh: getLimit('mgh'),
                  ammn: getLimit('ammn'),
                };

                const isValid = (val, limit) => limit && val !== '' ? validateCellValue(val, limit) : { isOutOfLimit: false };

                const validations = {};
                Object.keys(limits).forEach((key) => {
                  validations[key] = isValid(row[key], limits[key]);
                });

                const isAmmnNil = row.ammn !== undefined && ['nil', 'n', 'ni', 'none', '-'].includes(String(row.ammn).toLowerCase().trim());
                validations.ammn = limits.ammn && row.ammn !== '' ? (isAmmnNil ? { isOutOfLimit: false } : { isOutOfLimit: true }) : { isOutOfLimit: false };

                const disabled = isSlotDisabled(row.id, idx);
                const status = getSlotStatus(row.id, idx);

                const renderInput = (field) => {
                  const errorMsg = errors[`${row.id}_${field}`];
                  const vResult = validations[field];
                  const isOutOfLimit = vResult?.isOutOfLimit;
                  const limit = limits[field];
                  const isNilLimit = field === 'ammn';

                  const rowKey = row.id || row.time;
                  const isEdited = Boolean(
                    editedFields[`${rowKey}_${field}`] ||
                    editedFields[`${row.time}_${field}`]
                  );

                  return (
                    <td key={field} className="py-2.5 px-1.5 text-center border-r border-slate-100">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode={isNilLimit ? 'text' : 'decimal'}
                          value={row[field] ?? ''}
                          disabled={disabled}
                          onChange={(e) => handleCellChange(row.id, field, e.target.value)}
                          placeholder={isNilLimit ? 'NIL' : '0'}
                          className={`w-full text-center font-mono text-xs py-1 px-1 rounded border transition ${disabled
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                              : errorMsg || isOutOfLimit
                                ? 'border-red-500 bg-red-50'
                                : row[field] !== '' && row[field] !== '0'
                                  ? 'border-sky-300 bg-sky-50/30 font-bold text-sky-950 focus:border-blue-600'
                                  : 'border-slate-200 bg-white text-slate-800 focus:border-blue-600'
                            }`}
                        />
                      </div>
                      <EditedBadge isEdited={isEdited} />
                      {isOutOfLimit && !errorMsg && limit && (
                        <div className="text-[9px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 mt-1 font-bold whitespace-nowrap mx-auto w-max shadow-2xs">
                          {limit.formattedLabel || `Limit: ${limit.min}-${limit.max}`}
                        </div>
                      )}
                      {!isOutOfLimit && !errorMsg && limit && (row[field] === '' || row[field] === undefined) && (
                        <div className="text-[8.5px] text-slate-400 font-semibold mt-1 tracking-tight text-center">
                          {limit.formattedRange || `${limit.min}-${limit.max}`}
                        </div>
                      )}
                    </td>
                  );
                };

                const displayFields = is200
                  ? ['ph', 'frc', 'opo4', 'cl']
                  : ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh', 'ammn'];

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${disabled ? 'bg-slate-50/60' : 'hover:bg-cyan-50/30'}`}
                  >
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500 bg-slate-50/50 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-2 text-center border-r border-slate-100 bg-slate-50/30 font-mono font-bold text-slate-800">
                      {row.time}
                    </td>

                    {displayFields.map(renderInput)}

                    <td className="py-2.5 px-4 text-center border-r border-slate-100">
                      <RecordStatusBadge
                        status={status.toLowerCase()}
                        subLabel={status === 'EDITABLE' ? '1 edit left' : undefined}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2 text-slate-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>One correction allowed after first save; saving the next slot/shift locks the previous one.</span>
          </div>

          <div className="text-slate-400">
            <span>{readings.length} slots recorded</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoolingWaterAnalysisPage;
