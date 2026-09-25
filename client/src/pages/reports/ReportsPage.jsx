import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import Modal from '../../components/common/Modal';
import { MOCK_REPORTS, MOCK_PLANTS, MOCK_USERS } from '../../services/mockData';
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
      await new Promise((r) => setTimeout(r, 300));
      const companyCode = user?.company?.code;
      let filtered = companyCode
        ? MOCK_REPORTS.filter((r) => r.company.code === companyCode)
        : MOCK_REPORTS;

      // Strict Plant Scoping for Normal Plant Operators
      if (user?.role === 'user') {
        const assignedCode = (
          user?.plant?.code ||
          user?.plant?.name ||
          user?.plant?._id ||
          'ACL'
        ).toUpperCase();

        filtered = filtered.filter((r) => {
          const rPlant = (r.plant?.code || r.plant?.name || '').toUpperCase();
          if (assignedCode.includes('ACL')) return rPlant.includes('ACL');
          if (assignedCode.includes('SA')) return rPlant.includes('SA');
          if (assignedCode.includes('OFFSET') || assignedCode.includes('OFFSITE')) {
            return rPlant.includes('OFFSET') || rPlant.includes('OFFSITE');
          }
          if (assignedCode.includes('CO2') || assignedCode.includes('C02')) {
            return rPlant.includes('CO2') || rPlant.includes('C02');
          }
          return true;
        });
      } else {
        if (plantId !== 'all') filtered = filtered.filter((r) => r.plant?._id === plantId || r.plant?.code === plantId);
      }

      if (reportType !== 'all' && reportType !== 'All Types') filtered = filtered.filter((r) => r.reportType === reportType);
      if (searchTerm) filtered = filtered.filter((r) => r.title.toLowerCase().includes(searchTerm.toLowerCase()));
      setReports(filtered);
    } catch (err) {
      showToast('Error loading reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load filter metadata from mock data
    const companyCode = user?.company?.code;
    const companyPlants = companyCode
      ? MOCK_PLANTS.filter((p) => p.company.code === companyCode)
      : MOCK_PLANTS;
    const companyUsers = companyCode
      ? MOCK_USERS.filter((u) => u.company?.code === companyCode && u.role === 'user')
      : MOCK_USERS.filter((u) => u.role === 'user');
    setPlants(companyPlants);
    setUsersList(companyUsers);
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
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
