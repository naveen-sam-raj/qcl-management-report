import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import { resolvePlantCode } from '../../utils/plantCodeHelper';
import {
  FileSpreadsheet,
  Download,
  Factory,
  AlertCircle,
} from 'lucide-react';

const pad2 = (n) => String(n).padStart(2, '0');
const toLocalYMD = (date) => {
  const d = date instanceof Date ? date : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const addDaysLocal = (ymd, n) => {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(y, m - 1, d + n);
  return toLocalYMD(target);
};

const ReportsPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const todayStr = toLocalYMD(new Date());

  const [plants, setPlants] = useState([]);

  // ── Section 1: Single Plant Management Report State ──
  const [plantId, setPlantId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [downloadingGeneric, setDownloadingGeneric] = useState(false);
  const [singlePlantError, setSinglePlantError] = useState('');


  // Load plants metadata
  useEffect(() => {
    const loadPlants = async () => {
      try {
        const res = await api.get('/api/plants');
        if (res.data?.success && Array.isArray(res.data.plants)) {
          setPlants(res.data.plants);
        } else {
          setPlants([]);
        }
      } catch (err) {
        console.warn('[ReportsPage] Error loading plants:', err.message);
        setPlants([]);
      }
    };
    loadPlants();
  }, [user]);

  // ── Section 1 Handler: Download Single Plant Report ──
  const handleDownloadGenericReport = async () => {
    setSinglePlantError('');

    let candidatePlant = null;
    let candidateSource = null;

    if (user?.role === 'user') {
      candidatePlant = user?.plant;
      candidateSource = 'user.plant';
    } else {
      if (!plantId || plantId.trim() === '') {
        const msg = 'Please select a plant';
        setSinglePlantError(msg);
        showToast(msg, 'error');
        return;
      }
      candidatePlant = plants.find((p) => String(p._id || p.id) === String(plantId));
      candidateSource = 'selected plant dropdown';
    }

    const { plantCode } = resolvePlantCode([
      { source: candidateSource, value: candidatePlant },
      { source: 'user.plant', value: user?.plant },
    ]);

    if (!plantCode) {
      const msg = 'Please select a plant';
      setSinglePlantError(msg);
      showToast(msg, 'error');
      return;
    }

    // Date validation
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim())) {
      const msg = 'Valid Start Date is required';
      setSinglePlantError(msg);
      showToast(msg, 'error');
      return;
    }

    const fromDateStr = String(startDate).trim();
    const toDateStr = endDate ? String(endDate).trim() : '';
    const isRange = Boolean(toDateStr && toDateStr !== fromDateStr);

    if (fromDateStr > todayStr || (toDateStr && toDateStr > todayStr)) {
      const msg = 'Future dates are not allowed';
      setSinglePlantError(msg);
      showToast(msg, 'error');
      return;
    }

    if (isRange) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDateStr)) {
        const msg = 'Valid End Date (YYYY-MM-DD) is required';
        setSinglePlantError(msg);
        showToast(msg, 'error');
        return;
      }
      if (fromDateStr > toDateStr) {
        const msg = '"End Date" must be greater than or equal to "Start Date"';
        setSinglePlantError(msg);
        showToast(msg, 'error');
        return;
      }
      const diffDays = Math.ceil((new Date(toDateStr) - new Date(fromDateStr)) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 31) {
        const msg = 'Date range cannot exceed 31 days';
        setSinglePlantError(msg);
        showToast(msg, 'error');
        return;
      }
    }

    try {
      setDownloadingGeneric(true);

      if (isRange) {
        showToast(`Generating ${plantCode} Reports from ${fromDateStr} to ${toDateStr}...`, 'info');

        const response = await api.get('/reports/generic-range', {
          params: { plant: plantCode, from: fromDateStr, to: toDateStr },
          responseType: 'blob',
        });

        const blob = new Blob([response.data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${plantCode}_Report_${fromDateStr}_to_${toDateStr}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        showToast(`${plantCode} Reports downloaded successfully!`, 'success');
      } else {
        showToast(`Generating ${plantCode} Management Report for ${fromDateStr}...`, 'info');

        const response = await api.get('/reports/generic', {
          params: { plant: plantCode, date: fromDateStr },
          responseType: 'blob',
        });

        const blob = new Blob([response.data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${plantCode}_Report_${fromDateStr}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        showToast(`${plantCode} Report downloaded successfully!`, 'success');
      }
    } catch (err) {
      let errorMessage = 'Failed to download report.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.message) {
            errorMessage = json.message;
          }
        } catch (parseErr) {
          console.warn('Could not parse error blob as JSON:', parseErr);
        }
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setSinglePlantError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingGeneric(false);
    }
  };


  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      {/* ── 1. Heading Block (Preserved) ── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
          <span>DYNAMIC REPORTING ENGINE</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Analytics & Operations Reports
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Filter, inspect preview summaries, and download dynamic .xlsx Excel spreadsheets
        </p>
      </div>

      {/* ── 2. Section 1: Single Plant Management Report ── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Factory className="w-5 h-5 text-blue-600" />
            <span>Single Plant Operational Report</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Download a detailed multi-sheet management workbook (.xlsx) for an individual plant.
          </p>
        </div>

        {/* Form Fields: Select Plant, Start Date, End Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Select Plant */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {user?.role === 'user' ? 'Assigned Plant Unit' : 'Select Plant'}
            </label>
            {user?.role === 'user' ? (
              <select
                disabled
                value="assigned"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-semibold cursor-not-allowed"
              >
                <option value="assigned">
                  {user?.plant?.name || 'Assigned Plant'} (Restricted to Assigned Unit)
                </option>
              </select>
            ) : (
              <select
                value={plantId}
                onChange={(e) => {
                  setPlantId(e.target.value);
                  if (singlePlantError) setSinglePlantError('');
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 cursor-pointer"
              >
                <option value="">-- Choose Plant Unit --</option>
                {plants.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Start Date</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && val > todayStr) {
                    showToast('Future dates are not allowed', 'error');
                    return;
                  }
                  setStartDate(val);
                  if (endDate && val && endDate < val) {
                    setEndDate('');
                  }
                  if (singlePlantError) setSinglePlantError('');
                }}
                max={todayStr}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 cursor-pointer"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                const val = e.target.value;
                if (val && val > todayStr) {
                  showToast('Future dates are not allowed', 'error');
                  return;
                }
                setEndDate(val);
                if (singlePlantError) setSinglePlantError('');
              }}
              min={startDate || undefined}
              max={(() => {
                if (!startDate) return todayStr;
                const maxRange = addDaysLocal(startDate, 30);
                return maxRange && maxRange < todayStr ? maxRange : todayStr;
              })()}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Leave empty or same as Start Date for a single day. Max 31 days (one workbook, separate sheets per date).
            </p>
          </div>
        </div>

        {/* Inline Error Notice */}
        {singlePlantError && (
          <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5 pt-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{singlePlantError}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <button
            id="btn-download-generic-report"
            onClick={handleDownloadGenericReport}
            disabled={downloadingGeneric}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Download dynamic multi-sheet plant management report (.xlsx)"
          >
            {downloadingGeneric ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloadingGeneric ? 'Generating Report...' : 'Download Report'}</span>
          </button>
        </div>
      </div>


    </div>
  );
};

export default ReportsPage;
