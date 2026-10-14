import React, { useState, useCallback, useEffect } from 'react';
import { getCellLimit, validateCellValue } from '../../services/analysisValidation';
import {
  getTodayAsiaKolkata,
  formatDateDisplay,
  LockedDateDisplay,
  RecordStatusBadge,
  StatusSaveButton,
  SaveStatusBanner,
  SaveConfirmationModal,
  EditedBadge,
  retryAnalysisEmail,
} from '../../utils/offsetAnalysisHelper';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  ArrowLeft,
  Calendar,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  FlaskConical,
  Gauge,
  Info,
  AlertCircle,
} from 'lucide-react';

// Screenshot values for Raw Water
const SCREENSHOT_DATA = {
  ph: '7.6',
  cond: '211',
  turbidity: '8',
  tds: '137',
  freeCl2: '0',
  fe: '0.30',
  sio2: '5',
  mAlk: '56',
  th: '60',
  caH: '36',
  mgH: '24',
  cl: '30',
  so4: '15',
  ema: '45',
};

// Left Column Parameters: Physical & Dissolved Solids
const LEFT_PARAMETERS = [
  { key: 'ph',        label: 'pH',           formula: 'pH',         unit: '',        step: '0.1', placeholder: '7.00', desc: 'Acidity / Basicity' },
  { key: 'cond',      label: 'Cond',         formula: 'EC',         unit: 'µS/cm',   step: '1',   placeholder: '0000', desc: 'Conductivity' },
  { key: 'turbidity', label: 'Turbidity',    formula: 'Turb',       unit: 'NTU',     step: '1',   placeholder: '00',   desc: 'Water Clarity' },
  { key: 'tds',       label: 'TDS',          formula: 'TDS',        unit: 'ppm',     step: '1',   placeholder: '0000', desc: 'Total Dissolved Solids' },
  { key: 'freeCl2',   label: 'Free Cl2',     formula: 'Free Cl₂',   unit: 'ppm',     step: '0.1', placeholder: '0.00', desc: 'Residual Chlorine' },
  { key: 'fe',        label: 'Fe',           formula: 'Iron (Fe)',  unit: 'ppm',     step: '0.01',placeholder: '0.00', desc: 'Total Iron' },
  { key: 'sio2',      label: 'SiO2',         formula: 'SiO₂',       unit: 'ppm',     step: '1',   placeholder: '00',   desc: 'Reactive Silica' },
];

// Right Column Parameters: Alkalinity, Hardness & Anions
const RIGHT_PARAMETERS = [
  { key: 'mAlk',      label: 'M Alk',        formula: 'M.Alk',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Methyl Orange Alk.' },
  { key: 'th',        label: 'TH',           formula: 'TH',         unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Total Hardness' },
  { key: 'caH',       label: 'Ca H',         formula: 'Ca-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Calcium Hardness' },
  { key: 'mgH',       label: 'Mg H',         formula: 'Mg-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Magnesium Hardness' },
  { key: 'cl',        label: 'Cl',           formula: 'Cl⁻',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Chloride' },
  { key: 'so4',       label: 'SO4',          formula: 'SO₄²⁻',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Sulphate' },
  { key: 'ema',       label: 'EMA',          formula: 'EMA',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Equiv. Mineral Acidity' },
];

const isValidDecimal = (val) => val === '' || /^-?\d*\.?\d*$/.test(val);

const RawWaterAnalysisPage = ({ plantId = 'offset' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isViewOnly = user?.role === 'user';
  const basePath = isViewOnly ? '/portal' : '/admin/tfl';

  // ── States ──
  const [date, setDate] = useState(() => getTodayAsiaKolkata());
  const [time, setTime] = useState('08:00');
  const [data, setData] = useState(SCREENSHOT_DATA);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savePhase, setSavePhase] = useState('idle'); // 'idle' | 'saving' | 'completed' | 'email_pending' | 'email_failed' | 'save_failed'
  const [recordId, setRecordId] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailStatusDetail, setEmailStatusDetail] = useState('');
  const [editedFields, setEditedFields] = useState({});
  const [initialSaved, setInitialSaved] = useState(false);
  const [editCount, setEditCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Fetch existing data when date changes
  useEffect(() => {
    if (!date) return;
    let active = true;

    const fetchExistingData = async () => {
      try {
        const response = await api.get(`/raw-water-analysis?date=${date}`);
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
          if (record?.editedFields) {
            setEditedFields(record.editedFields);
          } else {
            setEditedFields({});
          }

          const hasSaved = Boolean(record?.initialSaved || record?.data?.initialSaved || record?._id || record?.id);
          const currentEdits = record?.editCount ?? record?.data?.editCount ?? 0;
          const lockStatus = Boolean(record?.isLocked || record?.data?.isLocked || currentEdits >= 1);

          setInitialSaved(hasSaved);
          setEditCount(currentEdits);
          setIsLocked(lockStatus);

          if (record?.time) {
            setTime(record.time);
          }
          
          if (!record) {
             // Leave default
          } else if (record.parameters) {
            setData(record.parameters);
          } else if (record.shifts) {
            setData(record.shifts);
          } else if (record.readings && Object.keys(record.readings).length > 0) {
            setData(record.readings);
          } else if (record.rows) {
            setData(record.rows);
          } else if (record.data && !Array.isArray(record.data)) {
            setData(record.data);
          } else if (Array.isArray(record) && record.length > 0) {
            setData(record);
          }
        } else {
          setEditedFields({});
          setRecordId(null);
        }
      } catch (err) {
        if (!active) return;
        console.warn('Could not fetch existing Raw Water data', err);
        setEditedFields({});
        setRecordId(null);
      }
    };
    fetchExistingData();

    return () => {
      active = false;
    };
  }, [date]);

  // ── Handle field change ──
  const handleInputChange = useCallback((field, value) => {
    if (!isValidDecimal(value)) return;

    setData((prev) => ({ ...prev, [field]: value }));

    // Clear error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
  }, []);

  // ── Reset ──
  const handleReset = () => {
    setData(SCREENSHOT_DATA);
    setTime('08:00');
    setDate(getTodayAsiaKolkata());
    setErrors({});
    setSaveSuccess(false);
    showToast?.('Values reset to defaults.', 'info');
  };

  // ── Save Click (Opens Confirmation Modal) ──
  const handleSaveClick = () => {
    if (isViewOnly) return;
    const newErrors = {};

    [...LEFT_PARAMETERS, ...RIGHT_PARAMETERS].forEach((param) => {
      const val = data[param.key];
      if (val !== '' && isNaN(Number(val))) {
        newErrors[param.key] = 'Enter numeric value';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast?.('Please resolve the highlighted field errors.', 'error');
      return;
    }

    const summaryItems = [...LEFT_PARAMETERS, ...RIGHT_PARAMETERS].map((p) => ({
      label: p.label,
      value: data[p.key],
    })).filter((i) => i.value !== '' && i.value !== null && i.value !== undefined);

    setConfirmData({
      summaryItems,
    });
    setShowConfirmModal(true);
  };

  // ── Confirm Save (Submits to Backend) ──
  const handleConfirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('saving');
    setShowConfirmModal(false);

    try {
      const payload = {
        date,
        time,
        plant: 'OFFSET',
        unit: 'Raw Water',
        parameters: data,
        submittedBy: user?.name || 'Shift Chemist',
      };

      const res = await api.post('/raw-water-analysis', payload);
      setSaveSuccess(true);
      const savedDoc = res.data?.data;
      if (savedDoc && (savedDoc._id || savedDoc.id)) {
        setRecordId(savedDoc._id || savedDoc.id);
      }
      if (savedDoc?.editedFields) {
        setEditedFields(savedDoc.editedFields);
      }
      if (res.data?.emailRecipient) {
        setRecipientEmail(res.data.emailRecipient);
      }

      // Update one-time edit state
      const nextEdits = initialSaved ? editCount + 1 : 0;
      setInitialSaved(true);
      setEditCount(nextEdits);
      if (initialSaved || nextEdits >= 1) {
        setIsLocked(true);
      }

      const emailStatus = res.data?.emailStatus;
      if (emailStatus === 'sent' || res.data?.emailSent) {
        setSavePhase('completed');
        setEmailStatusDetail('Delivered to SMTP server ✓');
        showToast?.('Saved & Emailed Successfully ✓', 'success');
      } else if (emailStatus === 'pending' || res.data?.emailPending) {
        setSavePhase('email_pending');
        setEmailStatusDetail('Saved — Email dispatching immediately 🚀');
        showToast?.('Saved — Email Dispatching 🚀', 'info');
      } else {
        setSavePhase('email_failed');
        setEmailStatusDetail(res.data?.emailError || 'Email delivery failed');
        showToast?.('Data saved to database. Email delivery failed: ' + (res.data?.emailError || 'Server error'), 'warning');
      }
    } catch (err) {
      setSavePhase('save_failed');
      console.error('[RawWaterAnalysis] Save error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      showToast?.('Save Error: ' + serverMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryEmail = () => {
    retryAnalysisEmail({
      endpoint: '/api/raw-water-analysis',
      recordId,
      setSavePhase,
      setEmailStatusDetail,
      showToast,
      setSaving,
    });
  };

  return (
    <div className="space-y-5 animate-fadeIn">
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
              <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/60">
                Raw Water
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Droplets className="w-5 h-5 text-sky-600" />
              RAW WATER ANALYSIS
            </h1>
          </div>
        </div>

        {/* Right: Date/Time + Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          <LockedDateDisplay date={date} id="rawwater-locked-date" />

          {/* Time input */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
            <span className="text-xs font-bold text-slate-600">Time:</span>
            <input
              id="rawwater-time-input"
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={isLocked}
              placeholder="HH:mm"
              className="w-16 text-center font-mono font-bold text-xs bg-white text-slate-900 border border-slate-300 rounded-md py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
          </div>

          <RecordStatusBadge
            status={isLocked ? 'LOCKED' : initialSaved ? 'EDITABLE' : 'NEW'}
            subLabel={isLocked ? 'all edits exhausted' : initialSaved ? '1 edit remaining' : 'first entry'}
          />

          {/* Action Buttons: Reset & Save */}
          <button
            onClick={handleReset}
            disabled={saving || isLocked}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>

          {!isViewOnly ? (
            <StatusSaveButton
              id="btn-rawwater-save"
              saving={saving}
              isLocked={isLocked}
              savePhase={savePhase}
              onClick={handleSaveClick}
              title="Save Raw Water analysis"
            />
          ) : (
            <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 font-semibold">
              Read-Only
            </span>
          )}
        </div>
      </div>

      {/* ── Status Banner (Success, Pending, or Email Failed) ── */}
      <SaveStatusBanner
        saveSuccess={saveSuccess}
        savePhase={savePhase}
        date={date}
        analysisName="Raw Water Analysis"
        recipientEmail={recipientEmail}
        emailStatusDetail={emailStatusDetail}
        onRetryEmail={handleRetryEmail}
        onDismiss={() => setSaveSuccess(false)}
        saving={saving}
      />

      {/* ── MAIN CONTENT: 2-Column Chemical Analysis Parameters Card ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table / Card Header */}
        <div className="px-5 py-2.5 border-b border-slate-200/80 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-black tracking-wider uppercase">
              Raw Water Laboratory Quality Parameters
            </h2>
          </div>

          <span className="text-[11px] font-mono font-semibold bg-white/10 px-2.5 py-0.5 rounded text-sky-200">
            14 Parameters (08:00 AM Routine)
          </span>
        </div>

        {/* 2-Column Grid matching the legacy screen layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
          {/* ── LEFT COLUMN: Physical & Dissolved Solids ── */}
          <div className="p-5 space-y-3 bg-white">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              Physical & Inorganics
            </div>

            <div className="space-y-2.5 pt-1">
              {LEFT_PARAMETERS.map((param) => {
                const val = data[param.key] || '';
                const err = errors[param.key];
                const limit = getCellLimit('offset', 'raw-water', 'day', param.key);
                const validation = limit && val !== '' ? validateCellValue(val, limit) : { isOutOfLimit: false };
                const isOutOfLimit = validation.isOutOfLimit;

                return (
                  <div
                    key={param.key}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200/60"
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-extrabold text-sm text-slate-800 tracking-wide">
                          {param.label} :
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {param.formula}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{param.desc}</div>
                    </div>

                    <div className="w-40 flex flex-col items-end gap-1">
                      <div className="w-36 flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => handleInputChange(param.key, e.target.value)}
                          placeholder={param.placeholder}
                          className={`w-full text-center font-mono text-sm py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs ${
                            err || isOutOfLimit
                              ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200'
                              : val !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        {param.unit && (
                          <span className="text-[10px] font-bold text-slate-500 min-w-[36px]">
                            {param.unit}
                          </span>
                        )}
                      </div>
                      <EditedBadge isEdited={editedFields[param.key]} />
                      {isOutOfLimit && !err && limit && (
                        <div className="mt-0.5 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn shadow-2xs">
                          {limit.formattedLabel || `Limit: ${limit.min.toFixed(2)}–${limit.max.toFixed(2)} ${limit.unit}`}
                        </div>
                      )}
                      {!isOutOfLimit && !err && limit && val === '' && (
                        <div className="text-[9.5px] text-slate-400 font-semibold mt-0.5 tracking-tight text-right w-full pr-1">
                          {limit.formattedRange || `${limit.min.toFixed(2)}–${limit.max.toFixed(2)} ${limit.unit}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Alkalinity, Hardness & Anions ── */}
          <div className="p-5 space-y-3 bg-white">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-sky-500" />
              Alkalinity, Hardness & Anions
            </div>

            <div className="space-y-2.5 pt-1">
              {RIGHT_PARAMETERS.map((param) => {
                const val = data[param.key] || '';
                const err = errors[param.key];
                const limit = getCellLimit('offset', 'raw-water', 'day', param.key);
                const validation = limit && val !== '' ? validateCellValue(val, limit) : { isOutOfLimit: false };
                const isOutOfLimit = validation.isOutOfLimit;

                return (
                  <div
                    key={param.key}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200/60"
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-extrabold text-sm text-slate-800 tracking-wide">
                          {param.label} :
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {param.formula}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{param.desc}</div>
                    </div>

                    <div className="w-40 flex flex-col items-end gap-1">
                      <div className="w-36 flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => handleInputChange(param.key, e.target.value)}
                          placeholder={param.placeholder}
                          className={`w-full text-center font-mono text-sm py-1.5 px-2.5 rounded-lg border-2 transition shadow-2xs ${
                            err || isOutOfLimit
                              ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200'
                              : val !== ''
                              ? 'border-slate-300 bg-white font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                              : 'border-slate-200 bg-slate-50/50 text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        {param.unit && (
                          <span className="text-[10px] font-bold text-slate-500 min-w-[36px]">
                            {param.unit}
                          </span>
                        )}
                      </div>
                      <EditedBadge isEdited={editedFields[param.key]} />
                      {isOutOfLimit && !err && limit && (
                        <div className="mt-0.5 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black tracking-tight whitespace-nowrap animate-fadeIn shadow-2xs">
                          {limit.formattedLabel || `Limit: ${limit.min.toFixed(2)}–${limit.max.toFixed(2)} ${limit.unit}`}
                        </div>
                      )}
                      {!isOutOfLimit && !err && limit && val === '' && (
                        <div className="text-[9.5px] text-slate-400 font-semibold mt-0.5 tracking-tight text-right w-full pr-1">
                          {limit.formattedRange || `${limit.min.toFixed(2)}–${limit.max.toFixed(2)} ${limit.unit}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card Footer: Summary of Values */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>
              All parameters measured for date <strong className="text-slate-800">{date}</strong> at{' '}
              <strong className="text-slate-800">{time || '—'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-semibold">
              pH: <strong className="text-blue-700 font-mono">{data.ph || '—'}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold">
              TDS: <strong className="text-slate-900 font-mono">{data.tds || '—'} ppm</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold">
              Total Hardness: <strong className="text-slate-900 font-mono">{data.th || '—'} ppm</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Save Confirmation Modal ── */}
      <SaveConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        saving={saving}
        analysisName="Raw Water Analysis"
        date={date}
        shiftOrTime={`Sampling Time: ${time || '08:00'}`}
        summaryItems={confirmData?.summaryItems || []}
        recipientEmail={recipientEmail}
      />
    </div>
  );
};

export default RawWaterAnalysisPage;
