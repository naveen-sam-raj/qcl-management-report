import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import OverallExcelReportModal from '../../components/common/OverallExcelReportModal';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
} from 'recharts';
import {
  ArrowLeft,
  BarChart3,
  FileSpreadsheet,
  RefreshCw,
  Factory,
  Flame,
  Globe,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Building2,
  Calendar,
  Filter,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';

const PLANT_OPTIONS = [
  { id: 'ACL', label: 'ACL Plant', icon: Factory },
  { id: 'SA', label: 'SA Plant', icon: Flame },
  { id: 'OFFSET', label: 'OFFSET Plant', icon: Globe },
  { id: 'CO2', label: 'CO2 Plant', icon: Gauge },
];

// Custom top label for bars
const renderCustomBarLabel = (props) => {
  const { x, y, width, value } = props;
  if (value === undefined || value === null) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#1e293b"
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
    >
      {value}
    </text>
  );
};

// Custom Tooltip for bar charts
const CustomBarTooltip = ({ active, payload, label, unit = '' }) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg border border-slate-800 text-xs">
        <p className="font-semibold text-slate-200">{label}</p>
        <p className="text-blue-400 font-bold mt-0.5">
          {item.value} {unit}
        </p>
      </div>
    );
  }
  return null;
};

const TFLOverallGraphPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getNDaysAgoStr = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };

  // Filter State
  const [fromDate, setFromDate] = useState(getNDaysAgoStr(30));
  const [toDate, setToDate] = useState(getTodayStr());
  const [selectedPlants, setSelectedPlants] = useState(['ACL', 'SA', 'OFFSET', 'CO2']);

  // Fetch State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);

  // Modal State for Excel Report
  const [showExcelModal, setShowExcelModal] = useState(false);

  // Quick Preset Filters
  const handleQuickFilter = (type) => {
    const today = getTodayStr();
    if (type === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (type === '7days') {
      setFromDate(getNDaysAgoStr(7));
      setToDate(today);
    } else if (type === '30days') {
      setFromDate(getNDaysAgoStr(30));
      setToDate(today);
    }
  };

  const togglePlant = (plantId) => {
    if (selectedPlants.includes(plantId)) {
      if (selectedPlants.length === 1) {
        showToast('At least one plant must be selected.', 'warning');
        return;
      }
      setSelectedPlants(selectedPlants.filter((p) => p !== plantId));
    } else {
      setSelectedPlants([...selectedPlants, plantId]);
    }
  };

  // Fetch real database records from backend API
  const fetchOverallData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setApiError(null);

    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        plants: selectedPlants.join(','),
      });

      const res = await api.get(`/api/tfl/overall-analytics?${params.toString()}`);
      if (res.data?.success) {
        setAnalyticsData(res.data);
      } else {
        setApiError(res.data?.message || 'Unable to load live data.');
      }
    } catch (err) {
      console.error('[TFLOverallGraph] Error fetching real analytics:', err);
      setApiError(err.response?.data?.message || 'Unable to load live data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOverallData();
  }, []);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    if (fromDate > toDate) {
      showToast('From Date cannot be after To Date.', 'error');
      return;
    }
    fetchOverallData();
  };

  const hasRealData = analyticsData?.hasData && analyticsData?.totalRecords > 0;
  const summary = analyticsData?.summary;
  const plantWiseAnalysisCount = analyticsData?.plantWiseAnalysisCount || [];
  const top5QualityTests = analyticsData?.top5QualityTests || [];
  const top5Products = analyticsData?.top5Products || [];
  const plantComplianceList = analyticsData?.plantComplianceList || [];

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── 1. Top Header Banner ── */}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/tfl')}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs cursor-pointer"
            title="Back to TFL Admin Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-1">
              <span>TUTICORIN ALKALI CHEMICALS AND FERTILIZERS LIMITED</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <span>Overall Plant Analytics</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Live Database Query
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict database records only across ACL, SA, OFFSET, and CO2 operational units
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Refresh Button */}
          <button
            onClick={() => fetchOverallData(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Overall Excel Report Download Button */}
          <button
            id="btn-overall-excel-report-header"
            onClick={() => setShowExcelModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-300 rounded-lg transition shadow-xs cursor-pointer"
            title="Open Overall Excel Report Dialog"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Overall Excel Report</span>
          </button>

          {/* Back to TFL Dashboard */}
          <button
            onClick={() => navigate('/admin/tfl')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>

      {/* ── 2. DATE & PLANT FILTER SELECTION PANEL (Requirement 1) ── */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              OVERALL ANALYTICS FILTER
            </h2>
          </div>
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">Presets:</span>
            <button
              type="button"
              onClick={() => handleQuickFilter('today')}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 transition"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickFilter('7days')}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 transition"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handleQuickFilter('30days')}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 transition"
            >
              Last 30 Days
            </button>
          </div>
        </div>

        <form onSubmit={handleApplyFilter} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* From Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                From Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* To Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                To Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* Apply Filter Button */}
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{loading ? 'Querying Database...' : 'Apply Filter'}</span>
              </button>
            </div>
          </div>

          {/* Plant Selection Checkboxes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
              Plant Selection
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PLANT_OPTIONS.map((plant) => {
                const isSelected = selectedPlants.includes(plant.id);
                const Icon = plant.icon;
                return (
                  <button
                    key={plant.id}
                    type="button"
                    onClick={() => togglePlant(plant.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs text-left transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/60 text-blue-900 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-medium'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                    <span>{plant.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </div>

      {/* ── 3. STATE HANDLERS (Loading / Error / Empty / Real Data) ── */}

      {/* Loading State (Requirement 14) */}
      {loading && (
        <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <h3 className="text-base font-bold text-slate-800">Loading live data...</h3>
          <p className="text-xs text-slate-500">Querying real database records for selected plants and dates.</p>
        </div>
      )}

      {/* API Error State (Requirement 13) */}
      {!loading && apiError && (
        <div className="bg-red-50 p-8 rounded-xl border border-red-200 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
          <h3 className="text-base font-extrabold text-red-900">Unable to load live data</h3>
          <p className="text-xs text-red-700 max-w-md mx-auto">{apiError}</p>
          <button
            onClick={() => fetchOverallData(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty Result Behavior (Requirement 3: Strict No Data Available Box) */}
      {!loading && !apiError && !hasRealData && (
        <div className="bg-white p-12 rounded-xl border-2 border-dashed border-slate-200 text-center space-y-3 max-w-lg mx-auto shadow-xs my-6">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Data Available</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            No analysis records were found for the selected date range ({fromDate} to {toDate}) across the chosen plants.
          </p>
          <p className="text-xs text-blue-600 font-semibold">
            Please select another date range or verify that analysis entries have been saved.
          </p>
        </div>
      )}

      {/* ── 4. REAL LIVE DATABASE RESULTS (Rendered ONLY when records exist) ── */}
      {!loading && !apiError && hasRealData && (
        <div className="space-y-4">
          {/* Summary KPI Cards (Strict real counts) */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Total Plants */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Selected Plants</span>
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{summary?.totalPlants || selectedPlants.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">{selectedPlants.join(' • ')}</div>
            </div>

            {/* Total Analysis Records */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Total Analysis Records</span>
                <Activity className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{summary?.totalRecords}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Live database count</div>
            </div>

            {/* Normal Records */}
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/30 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
                <span>Normal (In-Spec)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-700">{summary?.normalRecords}</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Passed tolerance limits</div>
            </div>

            {/* Out of Limit Records */}
            <div className="bg-white p-4 rounded-xl border border-red-200 bg-gradient-to-br from-white to-red-50/30 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-red-700">
                <span>Out of Limit</span>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div className="mt-2 text-2xl font-black text-red-700">{summary?.outOfLimitRecords}</div>
              <div className="text-[11px] text-red-600 font-medium mt-0.5">Deviations flagged</div>
            </div>

            {/* Overall Compliance % */}
            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-gradient-to-br from-white to-blue-50/30 shadow-xs col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-700">
                <span>Overall Compliance</span>
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 text-2xl font-black text-blue-700">
                {summary?.overallCompliance !== null ? `${summary.overallCompliance}%` : 'N/A'}
              </div>
              <div className="text-[11px] text-blue-600 font-medium mt-0.5">Calculated from live records</div>
            </div>
          </div>

          {/* 3 PRIMARY BAR CHARTS IN 1 HORIZONTAL ROW */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  TFL Combined Analytics Overview ({fromDate} to {toDate})
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Live MongoDB Data
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                Top Categories
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
              {/* ── Chart A: Plant-wise Analysis Count ── */}
              <div className="p-4 sm:p-5 flex flex-col justify-between min-w-0">
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      Plant-wise Analysis Count
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-400">Selected Plants</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Actual logged records per plant
                  </p>
                </div>

                <div className="w-full h-[240px] sm:h-[260px] pt-2">
                  {plantWiseAnalysisCount.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={plantWiseAnalysisCount}
                        margin={{ top: 22, right: 12, left: -18, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          label={{
                            value: 'Plants',
                            position: 'insideBottom',
                            offset: -12,
                            fontSize: 11,
                            fontWeight: 600,
                            fill: '#64748b',
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomBarTooltip unit="records" />}
                          cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#2563eb"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={44}
                        >
                          <LabelList
                            dataKey="value"
                            position="top"
                            content={renderCustomBarLabel}
                          />
                          {plantWiseAnalysisCount.map((entry, index) => (
                            <Cell key={`cell-plant-${index}`} fill="#2563eb" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No plant records in date range
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Categories with data: <strong className="text-slate-700">{plantWiseAnalysisCount.length}</strong></span>
                  <span>Total: <strong className="text-slate-800">{summary?.totalRecords}</strong></span>
                </div>
              </div>

              {/* ── Chart B: Top 5 Quality Tests ── */}
              <div className="p-4 sm:p-5 flex flex-col justify-between min-w-0">
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      Top Quality Tests
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {top5QualityTests.length > 0 ? `Showing ${top5QualityTests.length}` : 'No data'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Real parameters tested in database
                  </p>
                </div>

                <div className="w-full h-[240px] sm:h-[260px] pt-2">
                  {top5QualityTests.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top5QualityTests}
                        margin={{ top: 22, right: 12, left: -18, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          label={{
                            value: 'Tests',
                            position: 'insideBottom',
                            offset: -12,
                            fontSize: 11,
                            fontWeight: 600,
                            fill: '#64748b',
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomBarTooltip unit="readings" />}
                          cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#0891b2"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={44}
                        >
                          <LabelList
                            dataKey="value"
                            position="top"
                            content={renderCustomBarLabel}
                          />
                          {top5QualityTests.map((entry, index) => (
                            <Cell key={`cell-test-${index}`} fill="#0891b2" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No quality test readings recorded
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Categories with data: <strong className="text-slate-700">{top5QualityTests.length}</strong></span>
                  <span>Top: <strong className="text-slate-800">{top5QualityTests[0]?.name || '—'}</strong></span>
                </div>
              </div>

              {/* ── Chart C: Top 5 Products / Chemicals ── */}
              <div className="p-4 sm:p-5 flex flex-col justify-between min-w-0 md:col-span-2 lg:col-span-1">
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      Top Products / Chemicals
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {top5Products.length > 0 ? `Showing ${top5Products.length}` : 'No data'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Outputs tracked in database records
                  </p>
                </div>

                <div className="w-full h-[240px] sm:h-[260px] pt-2">
                  {top5Products.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top5Products}
                        margin={{ top: 22, right: 12, left: -18, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          label={{
                            value: 'Chemicals / Products',
                            position: 'insideBottom',
                            offset: -12,
                            fontSize: 11,
                            fontWeight: 600,
                            fill: '#64748b',
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomBarTooltip unit="batches" />}
                          cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#6366f1"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={44}
                        >
                          <LabelList
                            dataKey="value"
                            position="top"
                            content={renderCustomBarLabel}
                          />
                          {top5Products.map((entry, index) => (
                            <Cell key={`cell-prod-${index}`} fill="#6366f1" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No product analysis logged
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Categories with data: <strong className="text-slate-700">{top5Products.length}</strong></span>
                  <span>Top: <strong className="text-slate-800">{top5Products[0]?.name || '—'}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Consolidated Performance Table ── */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Consolidated Operational Performance (Real Records Only)
              </h3>
              <button
                onClick={() => setShowExcelModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>Export Excel</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-4 text-left">Plant Name</th>
                    <th className="py-2.5 px-3 text-center">Plant Code</th>
                    <th className="py-2.5 px-3 text-right">Actual Records</th>
                    <th className="py-2.5 px-3 text-right text-emerald-700">Normal (In Spec)</th>
                    <th className="py-2.5 px-3 text-right text-red-600">Deviations</th>
                    <th className="py-2.5 px-3 text-center">Compliance</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plantComplianceList.map((p) => (
                    <tr key={p.code} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {p.name}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-600">
                        {p.code}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        {p.totalSamples}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                        {p.normal}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">
                        {p.outOfLimit}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        {p.compliance !== null ? `${p.compliance}%` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.compliance >= 95
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {p.compliance >= 95 ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                          )}
                          {p.compliance >= 95 ? 'COMPLIANT' : 'REVIEW'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Date Range: <strong>{fromDate}</strong> to <strong>{toDate}</strong></span>
              <span>Total Live Records: <strong className="text-slate-800">{summary?.totalRecords}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Date & Plant Selection Modal for Real Excel Report */}
      <OverallExcelReportModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
      />
    </div>
  );
};

export default TFLOverallGraphPage;
