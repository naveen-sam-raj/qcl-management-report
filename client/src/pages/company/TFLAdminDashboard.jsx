import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ReferenceLine,
  ReferenceArea,
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
  TrendingUp,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/common/Toast';

// Plant metadata and icons
const PLANT_CONFIG = {
  ACL: { name: 'ACL Plant', icon: Factory, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  SA: { name: 'SA Plant', icon: Flame, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  OFFSITE: { name: 'OFFSITE Plant', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  CO2: { name: 'CO2 Plant', icon: Gauge, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
};

const PLANT_ORDER = ['ACL', 'SA', 'OFFSITE', 'CO2'];

/**
 * Returns today's date in IST format: YYYY-MM-DD
 */
function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Custom Tooltip for Bar Charts
 */
const CustomBarTooltip = ({ active, payload, plantName, paramLabel, unit, range }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isNoData = data.value === null || data.status === 'NO_DATA';

    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs min-w-[200px] z-50">
        <div className="font-bold text-slate-300 border-b border-slate-700 pb-1.5 mb-2 flex items-center justify-between">
          <span>{plantName}</span>
          <span className="text-[10px] font-mono text-slate-400">{data.date}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Parameter:</span>
            <span className="font-semibold text-white">{paramLabel}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Shift / Slot:</span>
            <span className="font-semibold text-slate-200">{data.slot}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Standard Range:</span>
            <span className="font-mono text-slate-300">{range ? `${range} ${unit}` : 'No Standard Range'}</span>
          </div>
          <div className="flex justify-between gap-2 pt-1 border-t border-slate-800">
            <span className="text-slate-400">Measured Value:</span>
            <span className="font-bold text-base text-white">
              {isNoData ? '— (No Data)' : `${data.value} ${unit}`}
            </span>
          </div>
          <div className="pt-1 flex items-center gap-1.5 font-bold text-[11px]">
            {data.status === 'IN_LIMIT' && (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> IN LIMIT
              </span>
            )}
            {data.status === 'OUT_OF_LIMIT' && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> OUT OF LIMIT
              </span>
            )}
            {data.status === 'NO_RANGE' && (
              <span className="text-blue-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> NO RANGE
              </span>
            )}
            {isNoData && (
              <span className="text-slate-400 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" /> NO DATA
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  return null;
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

  // Per-plant user selection: { [plantCode]: { analysis: '...', parameter: '...' } }
  const [userSelections, setUserSelections] = useState({});

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

        // Update / initialize user selections for each plant
        setUserSelections((prev) => {
          const updated = { ...prev };
          const plants = res.data.plants || {};

          for (const p of PLANT_ORDER) {
            const pData = plants[p];
            if (!pData || !pData.hasData) continue;

            // If user hasn't selected an analysis for this plant yet or current selection is invalid
            const currentSel = updated[p];
            const hasValidAnalysis = currentSel?.analysis && pData.analyses?.[currentSel.analysis];
            const hasValidParam = hasValidAnalysis && pData.analyses[currentSel.analysis]?.parameters?.[currentSel.parameter];

            if (!hasValidAnalysis || !hasValidParam) {
              // Default to first analysis and parameter with data
              if (pData.defaultSelection) {
                updated[p] = {
                  analysis: pData.defaultSelection.analysis,
                  parameter: pData.defaultSelection.parameter,
                };
              } else if (pData.availableAnalyses?.length > 0) {
                const firstA = pData.availableAnalyses[0];
                const firstP = firstA.parameters?.[0]?.key || '';
                updated[p] = { analysis: firstA.analysisType, parameter: firstP };
              }
            }
          }
          return updated;
        });
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

  const handleAnalysisChange = (plantCode, analysisType) => {
    const pData = dashboardData?.plants?.[plantCode];
    const aObj = pData?.analyses?.[analysisType];
    const firstParamKey = aObj ? Object.keys(aObj.parameters || {})[0] || '' : '';

    setUserSelections((prev) => ({
      ...prev,
      [plantCode]: {
        analysis: analysisType,
        parameter: firstParamKey,
      },
    }));
  };

  const handleParamChange = (plantCode, paramKey) => {
    setUserSelections((prev) => ({
      ...prev,
      [plantCode]: {
        ...prev[plantCode],
        parameter: paramKey,
      },
    }));
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-8">
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

      {/* ── 2. Grid of 4 Plant Bar Chart Panels ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {PLANT_ORDER.map((plantCode) => {
          const cfg = PLANT_CONFIG[plantCode];
          const Icon = cfg.icon;
          const pData = dashboardData?.plants?.[plantCode];
          const isAccessible = pData?.accessible !== false;

          const sel = userSelections[plantCode] || {};
          const selectedAnalysis = sel.analysis;
          const selectedParamKey = sel.parameter;

          const currentAnalysis = pData?.analyses?.[selectedAnalysis];
          const currentParam = currentAnalysis?.parameters?.[selectedParamKey];
          const points = currentParam?.points || [];
          const limit = currentParam?.limit;

          // Status summary counts
          const statusSummary = pData?.statusSummary || { inLimit: 0, outOfLimit: 0, noRange: 0, noData: 0 };

          // Y-axis domain calculation
          const nonNullValues = points.filter((pt) => pt.value !== null).map((pt) => pt.value);
          let yMin = 'auto';
          let yMax = 'auto';
          if (nonNullValues.length > 0) {
            const minVal = Math.min(...nonNullValues);
            const maxVal = Math.max(...nonNullValues);
            const refMin = limit?.min !== undefined ? limit.min : minVal;
            const refMax = limit?.max !== undefined ? limit.max : maxVal;
            const overallMin = Math.min(minVal, refMin);
            const overallMax = Math.max(maxVal, refMax);
            const padding = (overallMax - overallMin) * 0.15 || 1;
            yMin = Math.max(0, Math.floor((overallMin - padding) * 10) / 10);
            yMax = Math.ceil((overallMax + padding) * 10) / 10;
          }

          // Dynamic minWidth for horizontal scrolling on multi-day/dense ranges
          const scrollWidth = points.length > 8 ? `${Math.max(500, points.length * 45)}px` : '100%';

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

                {/* Status Summary Strip */}
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

              {/* Selectors Bar: Analysis & Parameter Dropdowns */}
              <div className="bg-slate-50/70 px-4 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {/* Analysis Selector */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-[11px] font-semibold text-slate-500">Analysis:</span>
                    <select
                      value={selectedAnalysis || ''}
                      onChange={(e) => handleAnalysisChange(plantCode, e.target.value)}
                      disabled={!isAccessible || !pData?.availableAnalyses?.length}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500 cursor-pointer max-w-[200px] truncate"
                    >
                      {pData?.availableAnalyses?.map((a) => (
                        <option key={a.analysisType} value={a.analysisType}>
                          {a.title} {a.hasData ? '' : '(No Data)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Parameter Selector */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-[11px] font-semibold text-slate-500">Parameter:</span>
                    <select
                      value={selectedParamKey || ''}
                      onChange={(e) => handleParamChange(plantCode, e.target.value)}
                      disabled={!isAccessible || !currentAnalysis?.parameters}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500 cursor-pointer max-w-[160px] truncate"
                    >
                      {currentAnalysis?.parameters &&
                        Object.values(currentAnalysis.parameters).map((param) => (
                          <option key={param.key} value={param.key}>
                            {param.label} {param.unit ? `(${param.unit})` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Parameter Range Badge */}
                {currentParam && (
                  <div className="text-[11px] font-mono shrink-0">
                    {currentParam.range ? (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        Range: {currentParam.range} {currentParam.unit}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                        No Standard Range
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Chart Content Body */}
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
                ) : !pData?.hasData || points.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-1.5">
                    <Info className="w-8 h-8 text-slate-300 stroke-1" />
                    <p className="text-xs font-bold text-slate-600">No data for {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}</p>
                    <p className="text-[11px] text-slate-400">No analysis readings recorded for this operational unit.</p>
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <div style={{ minWidth: scrollWidth, width: '100%', height: 320 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={points}
                          margin={{ top: 25, right: 25, left: 0, bottom: points.length > 7 ? 25 : 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                            interval={0}
                            angle={points.length > 7 ? -30 : 0}
                            textAnchor={points.length > 7 ? 'end' : 'middle'}
                            height={points.length > 7 ? 40 : 25}
                          />
                          <YAxis
                            domain={[yMin, yMax]}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            width={42}
                          />
                          <Tooltip
                            content={
                              <CustomBarTooltip
                                plantName={cfg.name}
                                paramLabel={currentParam?.label || selectedParamKey}
                                unit={currentParam?.unit || ''}
                                range={currentParam?.range || null}
                              />
                            }
                          />

                          {/* Min / Max ReferenceLines & Light Corridor Area */}
                          {limit?.min !== undefined && limit?.max !== undefined && (
                            <>
                              <ReferenceArea
                                y1={limit.min}
                                y2={limit.max}
                                fill="#10b981"
                                fillOpacity={0.08}
                                ifOverflow="extendDomain"
                              />
                              <ReferenceLine
                                y={limit.min}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                  value: `Min: ${limit.min}`,
                                  fill: '#dc2626',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  position: 'insideBottomLeft',
                                }}
                              />
                              <ReferenceLine
                                y={limit.max}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                  value: `Max: ${limit.max}`,
                                  fill: '#dc2626',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  position: 'insideTopLeft',
                                }}
                              />
                            </>
                          )}

                          {/* Colored Bars strictly by status */}
                          <Bar
                            dataKey="value"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={45}
                            animationDuration={400}
                          >
                            <LabelList
                              dataKey="value"
                              position="top"
                              style={{ fontSize: 10, fontWeight: 700, fill: '#1e293b' }}
                            />
                            {points.map((pt, idx) => {
                              let barColor = '#94a3b8'; // grey default
                              if (pt.status === 'IN_LIMIT') barColor = '#10b981'; // green
                              else if (pt.status === 'OUT_OF_LIMIT') barColor = '#ef4444'; // red
                              else if (pt.status === 'NO_RANGE') barColor = '#3b82f6'; // blue
                              return <Cell key={`cell-${idx}`} fill={barColor} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
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
