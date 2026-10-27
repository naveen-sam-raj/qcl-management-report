import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import {
  Factory,
  Flame,
  Globe,
  Gauge,
  RefreshCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  HelpCircle,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/common/Toast';

// Plant metadata and branding
const PLANT_CONFIG = {
  ACL: { name: 'ACL Plant', icon: Factory, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  SA: { name: 'SA Plant', icon: Flame, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  OFFSITE: { name: 'OFFSITE Plant', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  CO2: { name: 'CO2 Plant', icon: Gauge, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
};

const PLANT_ORDER = ['ACL', 'SA', 'OFFSITE', 'CO2'];

// Curated 16 distinct categorical colors for Inner Ring (Analyses)
// Excludes pure alert red (#ef4444) and pure emerald green (#10b981) to avoid status confusion
const ANALYSIS_PALETTE = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#f97316', // Orange
  '#a855f7', // Violet
  '#0284c7', // Sky
  '#d946ef', // Fuchsia
  '#84cc16', // Lime
  '#64748b', // Slate
  '#0ea5e9', // Light Blue
  '#eab308', // Yellow
  '#4f46e5', // Deep Indigo
];

// Status colors strictly standardized for Outer Ring
const STATUS_COLORS = {
  outOfLimit: '#ef4444', // Red
  inLimit: '#10b981',    // Emerald Green
  noRange: '#94a3b8',    // Slate Grey
};

/**
 * Returns today's date in IST format: YYYY-MM-DD
 */
function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Computes donut chart data and complete analysis breakdown for a plant
 */
function computePlantDonutData(plantData, sortBy = 'count') {
  if (!plantData || !plantData.hasData || !plantData.analyses) {
    return {
      analysesList: [],
      innerRingData: [],
      outerRingData: [],
      totalEntered: 0,
      totalInLimit: 0,
      totalOutOfLimit: 0,
      totalNoRange: 0,
      totalNoData: 0,
      plantOutPercent: 0,
    };
  }

  const rawAnalyses = plantData.analyses || {};
  const processedList = [];

  let plantInLimit = 0;
  let plantOutOfLimit = 0;
  let plantNoRange = 0;
  let plantNoData = 0;

  for (const [analysisType, aObj] of Object.entries(rawAnalyses)) {
    let aInLimit = 0;
    let aOutOfLimit = 0;
    let aNoRange = 0;
    let aNoData = 0;

    const params = aObj.parameters || {};
    for (const p of Object.values(params)) {
      for (const pt of p.points || []) {
        if (pt.status === 'IN_LIMIT') aInLimit++;
        else if (pt.status === 'OUT_OF_LIMIT') aOutOfLimit++;
        else if (pt.status === 'NO_RANGE') aNoRange++;
        else if (pt.status === 'NO_DATA') aNoData++;
      }
    }

    const aTotalEntered = aInLimit + aOutOfLimit + aNoRange;
    const aOutPercent = aTotalEntered > 0 ? parseFloat(((aOutOfLimit / aTotalEntered) * 100).toFixed(1)) : 0;
    const isPureNoRange = aTotalEntered > 0 && aOutOfLimit === 0 && aInLimit === 0 && aNoRange > 0;

    plantInLimit += aInLimit;
    plantOutOfLimit += aOutOfLimit;
    plantNoRange += aNoRange;
    plantNoData += aNoData;

    processedList.push({
      analysisType,
      title: aObj.title || analysisType,
      totalEntered: aTotalEntered,
      inLimit: aInLimit,
      outOfLimit: aOutOfLimit,
      noRange: aNoRange,
      noData: aNoData,
      outPercent: aOutPercent,
      isPureNoRange,
    });
  }

  const plantTotalEntered = plantInLimit + plantOutOfLimit + plantNoRange;
  const plantOutPercent = plantTotalEntered > 0 ? parseFloat(((plantOutOfLimit / plantTotalEntered) * 100).toFixed(1)) : 0;

  // Sorting
  processedList.sort((a, b) => {
    // Zero-value analyses always sink to the bottom
    if (a.totalEntered === 0 && b.totalEntered > 0) return 1;
    if (b.totalEntered === 0 && a.totalEntered > 0) return -1;
    if (a.totalEntered === 0 && b.totalEntered === 0) return a.title.localeCompare(b.title);

    if (sortBy === 'outPercent') {
      if (b.outPercent !== a.outPercent) return b.outPercent - a.outPercent;
      if (b.outOfLimit !== a.outOfLimit) return b.outOfLimit - a.outOfLimit;
      return b.totalEntered - a.totalEntered;
    }
    // Default: 'count' descending
    if (b.totalEntered !== a.totalEntered) return b.totalEntered - a.totalEntered;
    return b.outPercent - a.outPercent;
  });

  // Assign distinct categorical colors
  processedList.forEach((item, idx) => {
    item.color = item.totalEntered > 0 ? ANALYSIS_PALETTE[idx % ANALYSIS_PALETTE.length] : '#cbd5e1';
    item.percentageOfPlant = plantTotalEntered > 0 ? parseFloat(((item.totalEntered / plantTotalEntered) * 100).toFixed(1)) : 0;
  });

  // Build Inner Ring Data (Analyses)
  const innerRingData = [];
  // Build Outer Ring Data (Status Breakdown per Analysis)
  const outerRingData = [];

  processedList.forEach((item) => {
    if (item.totalEntered <= 0) return;

    innerRingData.push({
      name: item.title,
      value: item.totalEntered,
      color: item.color,
      analysis: item,
      isInner: true,
    });

    // Outer segments for this analysis (Out of limit, Normal, No range)
    if (item.outOfLimit > 0) {
      outerRingData.push({
        name: `${item.title} (Out of Limit)`,
        statusLabel: 'Out of Limit',
        value: item.outOfLimit,
        color: STATUS_COLORS.outOfLimit,
        analysis: item,
        isOuter: true,
      });
    }
    if (item.inLimit > 0) {
      outerRingData.push({
        name: `${item.title} (Normal)`,
        statusLabel: 'Normal (In Limit)',
        value: item.inLimit,
        color: STATUS_COLORS.inLimit,
        analysis: item,
        isOuter: true,
      });
    }
    if (item.noRange > 0) {
      outerRingData.push({
        name: `${item.title} (No Range)`,
        statusLabel: 'No Range',
        value: item.noRange,
        color: STATUS_COLORS.noRange,
        analysis: item,
        isOuter: true,
      });
    }
  });

  return {
    analysesList: processedList,
    innerRingData,
    outerRingData,
    totalEntered: plantTotalEntered,
    totalInLimit: plantInLimit,
    totalOutOfLimit: plantOutOfLimit,
    totalNoRange: plantNoRange,
    totalNoData: plantNoData,
    plantOutPercent,
  };
}

/**
 * Custom Tooltip for Donut Charts
 */
const CustomDonutTooltip = ({ active, payload, plantName }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const a = data.analysis;
    if (!a) return null;

    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[230px] max-w-[300px] z-50">
        <div className="font-bold text-slate-300 border-b border-slate-700 pb-1.5 mb-2 flex items-center justify-between">
          <span className="truncate">{plantName}</span>
          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
            {a.percentageOfPlant}% of Plant
          </span>
        </div>
        <div className="mb-2">
          <p className="font-extrabold text-sm text-white tracking-tight leading-snug">
            {a.title}
          </p>
          {data.isOuter && (
            <p className="text-[11px] font-semibold text-slate-300 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
              <span>Segment: {data.statusLabel} ({data.value} values)</span>
            </p>
          )}
        </div>
        <div className="space-y-1.5 pt-1.5 border-t border-slate-800 text-[11px]">
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-400">Total Entered:</span>
            <span className="font-bold font-mono text-white">{a.totalEntered}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Out of Limit:
            </span>
            <span className="font-bold font-mono text-red-400">{a.outOfLimit} ({a.outPercent}%)</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Normal (In Limit):
            </span>
            <span className="font-bold font-mono text-emerald-400">{a.inLimit}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-300 flex items-center gap-1">
              <Info className="w-3 h-3" /> No Range:
            </span>
            <span className="font-bold font-mono text-slate-300">{a.noRange}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-400 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" /> No Data:
            </span>
            <span className="font-mono text-slate-400">{a.noData}</span>
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium">Compliance:</span>
          {a.totalEntered === 0 ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              No Data
            </span>
          ) : a.isPureNoRange ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
              No Standard Range
            </span>
          ) : (
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${a.outPercent > 0 ? 'bg-red-950/80 text-red-300 border border-red-800/60' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'}`}>
              {a.outPercent}% Out of Limit
            </span>
          )}
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Small percentage labels on large slices of the inner ring (>= 8% share)
 */
const renderInnerSliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.08) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[10px] font-extrabold pointer-events-none drop-shadow-xs"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const TFLAdminDashboard = () => {
  const { showToast } = useToast();

  const todayStr = getTodayIST();
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  // Dashboard API response data
  const [dashboardData, setDashboardData] = useState(null);

  // Per-plant sorting mode: { [plantCode]: 'count' | 'outPercent' }
  const [sortModes, setSortModes] = useState({
    ACL: 'count',
    SA: 'count',
    OFFSITE: 'count',
    CO2: 'count',
  });

  const timerRef = useRef(null);

  // Fetch live dashboard data
  const fetchLiveData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else if (!dashboardData) setLoading(true);

    setApiError(null);

    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        ...(isManualRefresh ? { refresh: 'true' } : {}),
      });

      const res = await api.get(`/dashboard/live?${params.toString()}`);
      if (res.data?.success) {
        setDashboardData(res.data);
        setLastUpdated(res.data.asOfIST || new Date().toLocaleTimeString());
      } else {
        setApiError(res.data?.message || 'Failed to fetch live analytics.');
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching live data:', err);
      setApiError(err.response?.data?.message || 'Failed to load live data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, dashboardData]);

  // Initial load and on date range change
  useEffect(() => {
    fetchLiveData();
  }, [fromDate, toDate]);

  // 45-second auto-refresh with tab visibility pausing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLiveData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchLiveData();
      }
    }, 45000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchLiveData]);

  // Quick date filters
  const handleQuickFilter = (type) => {
    const today = getTodayIST();
    if (type === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (type === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else if (type === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    }
  };

  const handleFromChange = (e) => {
    const val = e.target.value;
    if (val > toDate) {
      showToast('"From" date cannot be after "To" date.', 'warning');
      return;
    }
    setFromDate(val);
  };

  const handleToChange = (e) => {
    const val = e.target.value;
    if (val < fromDate) {
      showToast('"To" date cannot be before "From" date.', 'warning');
      return;
    }
    setFromDate(fromDate);
    setToDate(val);
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-8">
      {/* Heading Block */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-1.5">
          <Factory className="w-3.5 h-3.5 text-blue-600" />
          <span>TUTICORIN ALKALI CHEMICALS AND FERTILIZERS LIMITED</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Plant Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Live operational parameter status and analytics across all 4 plant units
        </p>
      </div>

      {/* ── 1. Top Controls Bar: Date Filter + Live Status + Refresh ── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Date Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">From:</span>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={handleFromChange}
              className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">To:</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={todayStr}
              onChange={handleToChange}
              className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleQuickFilter('today')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                fromDate === todayStr && toDate === todayStr
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleQuickFilter('7days')}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleQuickFilter('30days')}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Live Status + Refresh Action */}
        <div className="flex items-center gap-3 self-end lg:self-auto">
          {/* Live Pulse Indicator */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>LIVE</span>
          </div>

          {/* Last updated label */}
          {lastUpdated && (
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Updated: <strong className="font-mono text-slate-700">{lastUpdated}</strong></span>
            </div>
          )}

          {/* Manual Refresh Button */}
          <button
            onClick={() => fetchLiveData(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{apiError}</span>
          </div>
          <button
            onClick={() => fetchLiveData(true)}
            className="font-bold underline hover:text-red-900 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── 2. Grid of 4 Plant Donut Chart Panels ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {PLANT_ORDER.map((plantCode) => {
          const cfg = PLANT_CONFIG[plantCode];
          const Icon = cfg.icon;
          const pData = dashboardData?.plants?.[plantCode];
          const isAccessible = pData?.accessible !== false;

          const currentSort = sortModes[plantCode] || 'count';
          const computed = computePlantDonutData(pData, currentSort);

          // Status summary counts directly from plant payload
          const statusSummary = pData?.statusSummary || { inLimit: 0, outOfLimit: 0, noRange: 0, noData: 0 };

          return (
            <div
              key={plantCode}
              className="bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between overflow-hidden"
            >
              {/* Card Header: Plant info + Compliance Strip */}
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg ${cfg.bg} ${cfg.border} border flex items-center justify-center ${cfg.color} shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                      {cfg.name}
                    </h2>
                    <p className="text-[11px] text-slate-500">Live operational parameter status</p>
                  </div>
                </div>

                {/* Status Summary Strip (Plant Badge Totals) */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{statusSummary.inLimit} In Limit</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{statusSummary.outOfLimit} Out of Limit</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    <span>{statusSummary.noRange} No Range</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 border border-slate-200 inline-flex items-center gap-1">
                    <span>— {statusSummary.noData} No Data</span>
                  </span>
                </div>
              </div>

              {/* Sub-header Controls Bar: Section title + Sort Toggle */}
              <div className="bg-slate-50/70 px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Analysis Distribution & Compliance
                </span>

                {/* Sort Toggle: By Count vs By Out % */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-slate-500">Sort:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold">
                    <button
                      onClick={() => setSortModes((prev) => ({ ...prev, [plantCode]: 'count' }))}
                      className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                        currentSort === 'count'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      By Count
                    </button>
                    <button
                      onClick={() => setSortModes((prev) => ({ ...prev, [plantCode]: 'outPercent' }))}
                      className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                        currentSort === 'outPercent'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      By Out %
                    </button>
                  </div>
                </div>
              </div>

              {/* Card Content Body */}
              <div className="p-4 flex-1 flex flex-col justify-center min-h-[340px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-semibold">Loading live operational data...</span>
                  </div>
                ) : !isAccessible ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <p className="text-xs font-bold">Access Restricted</p>
                    <p className="text-[11px]">You are not authorized to view {cfg.name} analytics.</p>
                  </div>
                ) : !pData?.hasData || computed.totalEntered === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-1.5">
                    <Info className="w-8 h-8 text-slate-300 stroke-1" />
                    <p className="text-xs font-bold text-slate-600">
                      No data for {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      No analysis readings recorded for this operational unit.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 w-full">
                    {/* ── Left: Dual-Ring Concentric Donut Chart + Center Summary ── */}
                    <div className="shrink-0 flex flex-col items-center justify-center self-center lg:self-start pt-2">
                      <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
                        <ResponsiveContainer width={280} height={280}>
                          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            {/* Outer Ring: Compliance status breakdown (Thick 24px) */}
                            <Pie
                              data={computed.outerRingData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={90}
                              outerRadius={114}
                              paddingAngle={1}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              animationDuration={400}
                            >
                              {computed.outerRingData.map((entry, index) => (
                                <Cell key={`outer-${index}`} fill={entry.color} />
                              ))}
                            </Pie>

                            {/* Inner Ring: Analysis distribution (Distinct colors) */}
                            <Pie
                              data={computed.innerRingData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={84}
                              paddingAngle={1}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              label={renderInnerSliceLabel}
                              labelLine={false}
                              animationDuration={400}
                            >
                              {computed.innerRingData.map((entry, index) => (
                                <Cell key={`inner-${index}`} fill={entry.color} />
                              ))}
                            </Pie>

                            <Tooltip content={<CustomDonutTooltip plantName={cfg.name} />} />
                          </PieChart>
                        </ResponsiveContainer>

                        {/* Center Ring Summary */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                          <span className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                            {computed.totalEntered.toLocaleString()}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            values entered
                          </span>
                          <span
                            className={`mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              computed.totalEntered === 0
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : computed.plantOutPercent > 0
                                ? 'bg-red-50 text-red-700 border-red-200 shadow-2xs'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs'
                            }`}
                          >
                            {computed.plantOutPercent}% Out of Limit
                          </span>
                        </div>
                      </div>

                      {/* Small visual guide underneath donut */}
                      <div className="mt-3 flex items-center justify-center gap-3 text-[10px] font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" /> Out of Limit
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-slate-400" /> No Range
                        </span>
                      </div>
                    </div>

                    {/* ── Right: Comprehensive Interactive Legend (No inner scroll, card grows) ── */}
                    <div className="w-full flex-1">
                      <div className="space-y-1.5">
                        {computed.analysesList.map((a) => (
                          <div
                            key={a.analysisType}
                            className={`p-2 rounded-lg border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                              a.totalEntered === 0
                                ? 'bg-slate-50/60 border-dashed border-slate-200 opacity-60'
                                : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs'
                            }`}
                          >
                            {/* Left: Color dot + Analysis Name + Count (%) */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: a.color }}
                              />
                              <div className="truncate">
                                <span className="font-bold text-slate-800 text-[12px] truncate block">
                                  {a.title}
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {a.totalEntered} {a.totalEntered === 1 ? 'value' : 'values'} ({a.percentageOfPlant}%)
                                </span>
                              </div>
                            </div>

                            {/* Right: Out | Normal | No Range + Out % Badge */}
                            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                                <span className="text-red-600 font-semibold">
                                  Out <strong className="font-bold">{a.outOfLimit}</strong>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="text-emerald-600 font-semibold">
                                  Normal <strong className="font-bold">{a.inLimit}</strong>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-500">
                                  No range <strong className="font-semibold text-slate-700">{a.noRange}</strong>
                                </span>
                              </div>

                              {/* Out % Badge */}
                              <div className="shrink-0 min-w-[72px] text-right">
                                {a.totalEntered === 0 ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                                    No data
                                  </span>
                                ) : a.isPureNoRange ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    No range
                                  </span>
                                ) : a.outPercent > 0 ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-50 text-red-700 border border-red-200">
                                    {a.outPercent}% Out
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    0% Out
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TFLAdminDashboard;
