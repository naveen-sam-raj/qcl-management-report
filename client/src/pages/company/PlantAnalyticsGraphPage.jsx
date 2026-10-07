import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
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
  RefreshCw,
  Factory,
  Flame,
  Globe,
  Gauge,
  Layers,
  FlaskConical,
  Package,
  Calendar,
  Filter,
  AlertCircle,
  UserCheck,
  Pill,
} from 'lucide-react';

const PLANT_METADATA = {
  acl: {
    key: 'acl',
    title: 'ACL Plant',
    subtitle: 'Ammonium Chloride Production Unit',
    icon: Factory,
  },
  sa: {
    key: 'sa',
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    icon: Flame,
  },
  offset: {
    key: 'offset',
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities',
    icon: Globe,
  },
  co2: {
    key: 'co2',
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Recovery',
    icon: Gauge,
  },
};

// Custom top label for bars (display numeric value above each bar)
const renderCustomBarLabel = (props) => {
  const { x, y, width, value } = props;
  if (value === undefined || value === null) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill="#0f172a"
      textAnchor="middle"
      fontSize={12}
      fontWeight={800}
    >
      {value}
    </text>
  );
};

// Custom X-axis label with title and clean truncation
const renderCustomXAxisTick = (props) => {
  const { x, y, payload } = props;
  const label = payload?.value || '';
  const displayLabel = label.length > 12 ? `${label.substring(0, 11)}…` : label;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill="#334155"
        fontSize={11}
        fontWeight={600}
      >
        <title>{label}</title>
        {displayLabel}
      </text>
    </g>
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

const PlantAnalyticsGraphPage = ({ plantId, plantTitle }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // Normalize plant identifier strictly from props or route params
  const rawKey = (plantId || id || 'acl').toString().toLowerCase().replace('plant_', '');
  const plantKey = rawKey.includes('sa')
    ? 'sa'
    : rawKey.includes('offset') || rawKey.includes('offsite')
    ? 'offset'
    : rawKey.includes('co2') || rawKey.includes('c02')
    ? 'co2'
    : 'acl';

  const meta = PLANT_METADATA[plantKey] || PLANT_METADATA.acl;
  const currentPlantTitle = plantTitle || meta.title;
  const IconComponent = meta.icon;

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getNDaysAgoStr = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };

  // Filter State
  const [fromDate, setFromDate] = useState(getNDaysAgoStr(30));
  const [toDate, setToDate] = useState(getTodayStr());

  // Fetch State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [plantData, setPlantData] = useState(null);

  const fetchLivePlantData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setApiError(null);

    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
      });

      const res = await api.get(`/api/tfl/plant-analytics/${plantKey}?${params.toString()}`);
      if (res.data?.success) {
        setPlantData(res.data);
      } else {
        setApiError(res.data?.message || 'Unable to load live data.');
      }
    } catch (err) {
      console.error('[PlantAnalyticsGraphPage] Error:', err);
      setApiError(err.response?.data?.message || 'Unable to load live data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLivePlantData();
  }, [plantKey]);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    if (fromDate > toDate) {
      showToast('From Date cannot be after To Date.', 'error');
      return;
    }
    fetchLivePlantData();
  };

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

  const hasData = plantData?.hasData && plantData?.totalRecords > 0;
  const top5Consultants = plantData?.top5Consultants || plantData?.charts?.consultants || plantData?.charts?.options || [];
  const top5Tests = plantData?.top5Tests || plantData?.charts?.tests || [];
  const top5Medicines = plantData?.top5Medicines || plantData?.charts?.medicines || plantData?.charts?.products || [];

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── 1. Top Header Bar ── */}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantKey}`)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs cursor-pointer"
            title={`Back to ${currentPlantTitle} Options`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                <IconComponent className="w-3.5 h-3.5" />
                {currentPlantTitle}
              </span>
              <span className="text-xs text-slate-300">/</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <span>{currentPlantTitle} Graph Analytics</span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live database records and metrics strictly for {currentPlantTitle}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchLivePlantData(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
            title="Refresh Plant Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => navigate(`${basePath}/plants/${plantKey}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to {currentPlantTitle}</span>
          </button>
        </div>
      </div>

      {/* ── 2. DATE FILTER SELECTION PANEL (Requirement 10) ── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              {currentPlantTitle} Analytics Filter
            </h2>
          </div>
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Presets:</span>
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

        <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{loading ? 'Querying...' : 'Apply Filter'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ── 3. STATE HANDLERS ── */}

      {/* Loading State */}
      {loading && (
        <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <h3 className="text-sm font-bold text-slate-800">Loading live data...</h3>
          <p className="text-xs text-slate-500">Querying real database records for {currentPlantTitle}.</p>
        </div>
      )}

      {/* API Error State */}
      {!loading && apiError && (
        <div className="bg-red-50 p-6 rounded-xl border border-red-200 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-red-600 mx-auto" />
          <h3 className="text-sm font-bold text-red-900">Unable to load live data</h3>
          <p className="text-xs text-red-700">{apiError}</p>
          <button
            onClick={() => fetchLivePlantData(false)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty Result State */}
      {!loading && !apiError && !hasData && (
        <div className="bg-white p-12 rounded-xl border-2 border-dashed border-slate-200 text-center space-y-3 max-w-lg mx-auto shadow-xs my-6">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Data Available</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            No analysis records were found for {currentPlantTitle} in the selected date range ({fromDate} to {toDate}).
          </p>
          <p className="text-xs text-indigo-600 font-semibold">
            Please select another date range.
          </p>
        </div>
      )}

      {/* ── 4. REAL LIVE DATABASE METRICS & CHARTS ── */}
      {!loading && !apiError && hasData && (
        <div className="space-y-4">
          {/* Plant Operational Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Analysis Records Logged */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">Live Analysis Records</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{plantData?.totalRecords}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Saved database entries</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            {/* Quality Test Parameters Monitored */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">Parameters Logged</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{testsChart.length}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Parameters with live readings</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600">
                <FlaskConical className="w-5 h-5" />
              </div>
            </div>

            {/* Products / Chemicals Tracked */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">Outputs Tracked</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{productsChart.length}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Categories with data</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Package className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* 3 PRIMARY BAR CHARTS IN 1 HORIZONTAL ROW (Top 5 Consultants | Top 5 Tests | Top 5 Medicines) */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {currentPlantTitle} — Live Database Metrics ({fromDate} to {toDate})
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {currentPlantTitle} Only
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Top 5 Metrics Breakdown
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 bg-white">
              {/* ── Chart 1: Top 5 Consultants ── */}
              <div className="p-4 sm:p-5 flex flex-col justify-between min-w-0 bg-white">
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                        Top 5 Consultants
                      </h3>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {top5Consultants.length > 0 ? `Showing ${top5Consultants.length}` : 'No data'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Highest logged records by consultant/operator
                  </p>
                </div>

                <div className="w-full h-[250px] sm:h-[270px] pt-2">
                  {top5Consultants.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top5Consultants}
                        margin={{ top: 25, right: 12, left: -18, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={renderCustomXAxisTick}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          interval={0}
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
                          {top5Consultants.map((entry, index) => (
                            <Cell key={`cell-consultant-${index}`} fill="#2563eb" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
                      <p className="font-semibold text-slate-500">No data available</p>
                      <p className="text-[11px] text-slate-400 mt-1">No consultant records found</p>
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Count: <strong className="text-slate-700">{top5Consultants.length}</strong></span>
                  <span>Top: <strong className="text-slate-800">{top5Consultants[0]?.name || '—'}</strong></span>
                </div>
              </div>

              {/* ── Chart 2: Top 5 Tests ── */}
              <div className="p-4 sm:p-5 flex flex-col justify-between min-w-0 bg-white">
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <FlaskConical className="w-4 h-4 text-cyan-600" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                        Top 5 Tests
                      </h3>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {top5Tests.length > 0 ? `Showing ${top5Tests.length}` : 'No data'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Most frequently performed quality tests
                  </p>
                </div>

                <div className="w-full h-[250px] sm:h-[270px] pt-2">
                  {top5Tests.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top5Tests}
                        margin={{ top: 25, right: 12, left: -18, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={renderCustomXAxisTick}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          interval={0}
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
                          {top5Tests.map((entry, index) => (
                            <Cell key={`cell-test-${index}`} fill="#0891b2" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
                      <p className="font-semibold text-slate-500">No data available</p>
                      <p className="text-[11px] text-slate-400 mt-1">No test records found</p>
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Count: <strong className="text-slate-700">{top5Tests.length}</strong></span>
                  <span>Top: <strong className="text-slate-800">{top5Tests[0]?.name || '—'}</strong></span>
                </div>
              </div>

              {/* ── Chart 3: Top 5 Medicines ── */}
              <div className="p-4 sm:p-5 flex flex-col justify-between min-w-0 bg-white">
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Pill className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                        Top 5 Medicines
                      </h3>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {top5Medicines.length > 0 ? `Showing ${top5Medicines.length}` : 'No data'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Most recorded medicines & products in database
                  </p>
                </div>

                <div className="w-full h-[250px] sm:h-[270px] pt-2">
                  {top5Medicines.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top5Medicines}
                        margin={{ top: 25, right: 12, left: -18, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={renderCustomXAxisTick}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickLine={{ stroke: '#cbd5e1' }}
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomBarTooltip unit="entries" />}
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
                          {top5Medicines.map((entry, index) => (
                            <Cell key={`cell-med-${index}`} fill="#6366f1" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
                      <p className="font-semibold text-slate-500">No data available</p>
                      <p className="text-[11px] text-slate-400 mt-1">No medicine/product records found</p>
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Count: <strong className="text-slate-700">{top5Medicines.length}</strong></span>
                  <span>Top: <strong className="text-slate-800">{top5Medicines[0]?.name || '—'}</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlantAnalyticsGraphPage;
