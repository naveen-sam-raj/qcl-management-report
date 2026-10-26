import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import Modal from '../../components/common/Modal';
import api from '../../services/api';
import { resolvePlantCode } from '../../utils/plantCodeHelper';
import {
  FileSpreadsheet,
  Download,
  Filter,
  Calendar,
  Factory,
  User,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  TrendingUp,
  Activity,
  Sparkles,
} from 'lucide-react';

const ReportsPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reports, setReports] = useState([]);
  const [plants, setPlants] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Filter criteria
  const [plantId, setPlantId] = useState('all');
  const [reportType, setReportType] = useState('all');
  const [userId, setUserId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Report Preview Modal state
  const [previewReport, setPreviewReport] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const reportTypes = [
    'All Types',
    'Production',
    'Efficiency',
    'Emissions & Carbon',
    'Maintenance & Safety',
    'Energy Consumption',
  ];

  const fetchReports = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (plantId && plantId !== 'all') params.append('plantId', plantId);
      if (reportType && reportType !== 'all' && reportType !== 'All Types') params.append('reportType', reportType);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (searchTerm) params.append('search', searchTerm);

      const res = await api.get(`/api/reports?${params.toString()}`);
      if (res.data?.success && Array.isArray(res.data.reports)) {
        setReports(res.data.reports);
      } else {
        setReports([]);
      }
    } catch (err) {
      console.warn('[ReportsPage] Fetch error:', err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [plantsRes, usersRes] = await Promise.allSettled([
          api.get('/api/plants'),
          api.get('/api/users'),
        ]);

        if (plantsRes.status === 'fulfilled' && plantsRes.value.data?.success && Array.isArray(plantsRes.value.data.plants)) {
          setPlants(plantsRes.value.data.plants);
        } else {
          setPlants([]);
        }

        if (usersRes.status === 'fulfilled' && usersRes.value.data?.success && Array.isArray(usersRes.value.data.users)) {
          setUsersList(usersRes.value.data.users.filter((u) => u.role === 'user'));
        } else {
          setUsersList([]);
        }
      } catch (err) {
        setPlants([]);
        setUsersList([]);
      }
    };
    loadMetadata();
  }, [user]);

  useEffect(() => {
    fetchReports();
  }, [plantId, reportType, userId, startDate, endDate, searchTerm]);

  // Handle Mock Excel Export (client-side CSV download)
  const handleExportExcel = async () => {
    try {
      setExporting(true);
      showToast('Preparing report export...', 'info');
      await new Promise((r) => setTimeout(r, 800));

      // Generate CSV content from current filtered reports
      const headers = ['Title', 'Type', 'Company', 'Plant', 'Period', 'Status', 'Created At'];
      const rows = reports.map((r) => [
        r.title,
        r.reportType,
        r.company?.name || '',
        r.plant?.name || '',
        r.period || '',
        r.status || '',
        new Date(r.createdAt).toLocaleDateString('en-IN'),
      ]);

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      const companyCode = user?.company?.code || 'GROUP';
      link.setAttribute('download', `Analytics_Report_${companyCode}_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('Report exported successfully!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setPlantId('all');
    setReportType('all');
    setUserId('all');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };

  // ── Generic Plant Management Report Download ──
  const [downloadingGeneric, setDownloadingGeneric] = useState(false);

  const handleDownloadGenericReport = async () => {
    let candidatePlant = null;
    let candidateSource = null;

    if (user?.role === 'user') {
      candidatePlant = user?.plant;
      candidateSource = 'user.plant';
    } else {
      if (!plantId || plantId === 'all') {
        showToast('Please select a plant', 'error');
        return;
      }
      candidatePlant = plants.find((p) => String(p._id || p.id) === String(plantId));
      candidateSource = 'selected plant dropdown';
    }

    const { plantCode, source } = resolvePlantCode([
      { source: candidateSource, value: candidatePlant },
      { source: 'user.plant', value: user?.plant },
    ]);

    if (!plantCode) {
      showToast('Please select a plant', 'error');
      return;
    }

    // Date validation
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim())) {
      showToast('Please select a valid date (YYYY-MM-DD)', 'error');
      return;
    }

    const targetDate = String(startDate).trim();

    console.debug('[Download Report] plant resolved:', plantCode, 'from', source);

    try {
      setDownloadingGeneric(true);
      showToast(`Generating ${plantCode} Management Report for ${targetDate}...`, 'info');

      const response = await api.get('/reports/generic', {
        params: { plant: plantCode, date: targetDate },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${plantCode}_Report_${targetDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast(`${plantCode} Report downloaded successfully!`, 'success');
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
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingGeneric(false);
    }
  };

  // ── All Plants Master Report Download (super_admin, company_admin, admin only) ──
  const [downloadingAllPlants, setDownloadingAllPlants] = useState(false);
  const canDownloadAllPlants = ['super_admin', 'company_admin', 'admin'].includes(user?.role);

  const handleDownloadAllPlantsReport = async () => {
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim())) {
      showToast('Please select a valid date (YYYY-MM-DD)', 'error');
      return;
    }

    const targetDate = String(startDate).trim();

    try {
      setDownloadingAllPlants(true);
      showToast(`Generating All Plants Master Report for ${targetDate}...`, 'info');

      const response = await api.get('/reports/generic-all', {
        params: { date: targetDate },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ALL_PLANTS_Report_${targetDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('All Plants Master Report downloaded successfully!', 'success');
    } catch (err) {
      let errorMessage = 'Failed to download all plants report.';
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
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingAllPlants(false);
    }
  };

  // ── Overall Master Report Download (super_admin, company_admin, admin only) ──
  const [downloadingOverall, setDownloadingOverall] = useState(false);

  const handleDownloadOverallReport = async () => {
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim())) {
      showToast('Please select a valid "from" date (YYYY-MM-DD) in Start Date', 'error');
      return;
    }

    const fromDateStr = String(startDate).trim();
    const toDateStr = endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(endDate).trim())
      ? String(endDate).trim()
      : fromDateStr;

    if (fromDateStr > toDateStr) {
      showToast('Start Date ("from") must be earlier than or equal to End Date ("to")', 'error');
      return;
    }

    const diffDays = Math.ceil((new Date(toDateStr) - new Date(fromDateStr)) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      showToast('Date range cannot exceed 31 days', 'error');
      return;
    }

    try {
      setDownloadingOverall(true);
      showToast(`Generating Overall Master Report for ${fromDateStr} to ${toDateStr}...`, 'info');

      const response = await api.get('/reports/generic-overall', {
        params: { from: fromDateStr, to: toDateStr },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OVERALL_Report_${fromDateStr}_${toDateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('Overall Master Report downloaded successfully!', 'success');
    } catch (err) {
      let errorMessage = 'Failed to download overall report.';
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
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingOverall(false);
    }
  };

  // Aggregate statistics
  const totalOutput = reports.reduce((sum, r) => sum + (r.metrics?.totalOutputTons || 0), 0);
  const avgEfficiency =
    reports.length > 0
      ? (
          reports.reduce((sum, r) => sum + (r.metrics?.efficiencyPercentage || 0), 0) /
          reports.length
        ).toFixed(1)
      : 0;
  const totalCO2 = reports.reduce((sum, r) => sum + (r.metrics?.co2CaptureTons || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
            DYNAMIC REPORTING ENGINE
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Analytics & Operations Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Filter, inspect preview summaries, and download dynamic .xlsx Excel spreadsheets
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchReports}
            title="Refresh Reports"
            className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Prominent Export Excel Button */}
          <button
            id="btn-export-excel"
            onClick={handleExportExcel}
            disabled={exporting || reports.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm shadow-emerald-600/20 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Generating XLSX...' : 'Export Excel (.xlsx)'}</span>
          </button>

          {/* NEW Download Report Button */}
          <button
            id="btn-download-generic-report"
            onClick={handleDownloadGenericReport}
            disabled={downloadingGeneric || exporting || downloadingAllPlants || downloadingOverall}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
            title="Download dynamic multi-sheet plant management report (.xlsx)"
          >
            {downloadingGeneric ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloadingGeneric ? 'Downloading...' : 'Download Report'}</span>
          </button>

          {/* Download All Plants Master Report Button (super_admin, company_admin, admin only) */}
          {canDownloadAllPlants && (
            <button
              id="btn-download-all-plants-report"
              onClick={handleDownloadAllPlantsReport}
              disabled={downloadingAllPlants || downloadingGeneric || exporting || downloadingOverall}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-purple-600 hover:bg-purple-700 transition shadow-sm shadow-purple-600/20 disabled:opacity-50 cursor-pointer"
              title="Download combined Master report for all plants (ACL, SA, OFFSITE, CO2) with SUMMARY sheet"
            >
              {downloadingAllPlants ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{downloadingAllPlants ? 'Downloading All Plants...' : 'Download All Plants Report'}</span>
            </button>
          )}

          {/* Download Overall Master Report Button (super_admin, company_admin, admin only) */}
          {canDownloadAllPlants && (
            <button
              id="btn-download-overall-report"
              onClick={handleDownloadOverallReport}
              disabled={downloadingOverall || downloadingAllPlants || downloadingGeneric || exporting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 hover:bg-teal-700 transition shadow-sm shadow-teal-600/20 disabled:opacity-50 cursor-pointer"
              title="Download multi-day Overall Report (manager shift sheet) for all plants"
            >
              {downloadingOverall ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{downloadingOverall ? 'Downloading Overall...' : 'Download Overall Report'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Reports In View
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{reports.length} Records</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Aggregate Output
          </div>
          <div className="text-xl font-extrabold text-blue-600 mt-1">
            {totalOutput.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Tons</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Mean Efficiency
          </div>
          <div className="text-xl font-extrabold text-emerald-600 mt-1">{avgEfficiency}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Carbon Captured
          </div>
          <div className="text-xl font-extrabold text-indigo-600 mt-1">
            {totalCO2.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Tons CO2</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Filters: Date, Plant, User, Report Type) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Filter Parameters</span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Plant Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {user?.role === 'user' ? 'Assigned Plant Unit' : 'Select Plant'}
            </label>
            {user?.role === 'user' ? (
              <select
                disabled
                value="assigned"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-semibold cursor-not-allowed"
              >
                <option value="assigned">
                  {user?.plant?.name || 'ACL Plant'} (Restricted to Assigned Unit)
                </option>
              </select>
            ) : (
              <select
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Plant Units</option>
                {plants.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Report Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {reportTypes.map((t) => (
                <option key={t} value={t === 'All Types' ? 'all' : t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Author / User</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Users</option>
              {usersList.map((u) => (
                <option key={u._id || u.id} value={u._id || u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Start */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
            />
          </div>

          {/* Date Range End */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
            />
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search report titles, notes, or author names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchReports()}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Reports Table Preview */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
        <div className="overflow-x-auto w-full table-responsive-container">
          <table className="w-full text-left text-xs min-w-[850px] xl:min-w-full">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Report Title</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Plant</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Author</th>
                <th className="px-6 py-3.5">Output (Tons)</th>
                <th className="px-6 py-3.5">Efficiency</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-slate-400">
                    No reports match the active filter criteria. Try adjusting date or plant filters.
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r._id || r.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{r.title}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{r.notes}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {r.reportType}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-blue-700">
                      {r.plantName || (r.plant ? r.plant.name : 'All Plants')}
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono">
                      {new Date(r.date).toISOString().split('T')[0]}
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-medium">
                      {r.generatedByName}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {r.metrics?.totalOutputTons?.toLocaleString() || '—'}
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-600">
                      {r.metrics?.efficiencyPercentage ? `${r.metrics.efficiencyPercentage}%` : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setPreviewReport(r);
                          setIsPreviewOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 hover:text-white hover:bg-blue-600 transition border border-blue-200 hover:border-transparent"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PREVIEW REPORT MODAL */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Audit Report Preview"
        maxWidth="max-w-2xl"
      >
        {previewReport && (
          <div className="space-y-5 text-xs">
            <div className="border-b border-slate-100 pb-4">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 mb-2">
                {previewReport.reportType}
              </span>
              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                {previewReport.title}
              </h3>
              <p className="text-slate-500 mt-1">
                Generated by {previewReport.generatedByName} on {new Date(previewReport.date).toLocaleString()}
              </p>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold">Total Output</div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5">
                  {previewReport.metrics?.totalOutputTons?.toLocaleString() || 0} Tons
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold">Yield Efficiency</div>
                <div className="text-base font-extrabold text-emerald-600 mt-0.5">
                  {previewReport.metrics?.efficiencyPercentage || 0}%
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold">CO2 Captured</div>
                <div className="text-base font-extrabold text-indigo-600 mt-0.5">
                  {previewReport.metrics?.co2CaptureTons?.toLocaleString() || 0} Tons
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold">Power Consumption</div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5">
                  {previewReport.metrics?.powerMWh || 0} MWh
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold">Downtime Minutes</div>
                <div className="text-base font-extrabold text-amber-600 mt-0.5">
                  {previewReport.metrics?.downtimeMinutes || 0} Min
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold">Safety Incidents</div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5">
                  {previewReport.metrics?.incidentsReported || 0}
                </div>
              </div>
            </div>

            {/* Engineer Notes */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-bold text-slate-700 mb-1">Engineering Notes</div>
              <p className="text-slate-600 leading-relaxed">
                {previewReport.notes || 'No additional field notes attached to this telemetry run.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download As XLSX</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReportsPage;
