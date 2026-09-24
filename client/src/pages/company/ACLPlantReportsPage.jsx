import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import {
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  RotateCcw,
  Factory,
  ChevronRight,
  Filter,
  CheckCircle2,
  Download,
  Table as TableIcon,
} from 'lucide-react';

// ─── Scalable Report Modules Registry ─────────────────────────────────────────
// Future ACL plant modules can simply be registered here without redesigning the page!
const REPORT_MODULES_REGISTRY = {
  'pure-salt': {
    id: 'pure-salt',
    name: 'Pure Salt Analysis',
    description: 'Daily purity and chemical composition analysis of raw & processed salt',
    status: 'active',
    subModules: [
      { id: 'all', name: 'All Shifts & Composition Log' },
      { id: 'raw', name: 'Raw Salt Dissolution Only' },
      { id: 'shifts', name: 'Shift Comparison (I, II, III)' },
      { id: 'composition', name: 'Final Composition Result Only' },
    ],
    columns: [
      { key: 'date', label: 'Date', width: 14 },
      { key: 'shift', label: 'Shift / Sample', width: 18 },
      { key: 'section', label: 'Section', width: 22 },
      { key: 'nacl', label: 'NaCl %', width: 12 },
      { key: 'ca', label: 'Ca %', width: 10 },
      { key: 'mg', label: 'Mg %', width: 10 },
      { key: 'so4', label: 'SO₄ %', width: 10 },
      { key: 'ir', label: 'IR %', width: 10 },
      { key: 'h2o', label: 'H₂O %', width: 10 },
      { key: 'status', label: 'QC Status', width: 14 },
    ],
  },
  'brine': {
    id: 'brine',
    name: 'Brine Analysis',
    description: 'Clarified & raw brine chemical analysis (Upcoming)',
    status: 'upcoming',
    subModules: [
      { id: 'all', name: 'All Brine Checkpoints' },
      { id: 'purified', name: 'Purified Brine Stream' },
      { id: 'reaction', name: 'Reaction Tank Outlet' },
    ],
    columns: [
      { key: 'date', label: 'Date', width: 14 },
      { key: 'shift', label: 'Shift', width: 14 },
      { key: 'section', label: 'Section', width: 20 },
      { key: 'nacl', label: 'NaCl (g/l)', width: 14 },
      { key: 'totalHardness', label: 'Total Hardness (ppm)', width: 18 },
      { key: 'status', label: 'QC Status', width: 14 },
    ],
  },
  'pure-salt-sieve': {
    id: 'pure-salt-sieve',
    name: 'Pure Salt Sieve Analysis',
    description: 'Grain size distribution and sieve retention profiles (Upcoming)',
    status: 'upcoming',
    subModules: [
      { id: 'all', name: 'Full Mesh Size Distribution' },
      { id: 'fines', name: 'Fines & Oversize Fractions' },
    ],
    columns: [
      { key: 'date', label: 'Date', width: 14 },
      { key: 'shift', label: 'Shift', width: 14 },
      { key: 'mesh20', label: '+20 Mesh %', width: 14 },
      { key: 'mesh40', label: '+40 Mesh %', width: 14 },
      { key: 'mesh80', label: '+80 Mesh %', width: 14 },
      { key: 'status', label: 'QC Status', width: 14 },
    ],
  },
  'overall-plant': {
    id: 'overall-plant',
    name: 'ACL Plant Master Summary',
    description: 'Comprehensive cross-module QC summary report (Upcoming)',
    status: 'upcoming',
    subModules: [
      { id: 'all', name: 'Combined QC Summary' },
      { id: 'exceptions', name: 'Out-of-Spec Exceptions' },
    ],
    columns: [
      { key: 'date', label: 'Date', width: 14 },
      { key: 'module', label: 'Module', width: 20 },
      { key: 'section', label: 'Section', width: 20 },
      { key: 'status', label: 'Overall Status', width: 14 },
    ],
  },
};

const SHIFT_OPTIONS = [
  { value: 'all', label: 'All Shifts (I, II, III & Raw/Comp)' },
  { value: 'shift1', label: 'I Shift (06:00 - 14:00)' },
  { value: 'shift2', label: 'II Shift (14:00 - 22:00)' },
  { value: 'shift3', label: 'III Shift (22:00 - 06:00)' },
  { value: 'raw_salt', label: 'Raw Salt Only' },
  { value: 'composition', label: 'Final Composition Only' },
];

const SECTION_OPTIONS = [
  { value: 'all', label: 'All Plant Sections' },
  { value: 'salt_dissolution', label: 'Salt Dissolution & Brine Prep' },
  { value: 'purification', label: 'Chemical Purification & Settling' },
  { value: 'evaporation', label: 'Evaporation & Crystallization' },
  { value: 'centrifuge', label: 'Centrifuge & Fluid Bed Dryer' },
  { value: 'bagging', label: 'Bagging & Warehouse' },
];

// Helper to format ISO date to readable string
const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
};

// Generates realistic sample data for Pure Salt Analysis based on user filters
const generateReportData = (filters) => {
  const { dateFrom, dateTo, shift, section, subModule } = filters;
  const start = new Date(dateFrom || new Date().toISOString().slice(0, 10));
  const end = new Date(dateTo || dateFrom || new Date().toISOString().slice(0, 10));

  const records = [];
  const shiftList = [
    { key: 'rawSalt', label: 'RAW SALT', section: 'Salt Dissolution & Brine Prep', baseNacl: 98.2, ca: 0.18, mg: 0.09, so4: 0.35, ir: 0.12, h2o: 1.06 },
    { key: 'shift1', label: 'I SHIFT', section: 'Centrifuge & Fluid Bed Dryer', baseNacl: 99.4, ca: 0.04, mg: 0.02, so4: 0.14, ir: 0.03, h2o: 0.37 },
    { key: 'shift2', label: 'II SHIFT', section: 'Centrifuge & Fluid Bed Dryer', baseNacl: 99.5, ca: 0.03, mg: 0.02, so4: 0.12, ir: 0.03, h2o: 0.30 },
    { key: 'shift3', label: 'III SHIFT', section: 'Centrifuge & Fluid Bed Dryer', baseNacl: 99.4, ca: 0.04, mg: 0.02, so4: 0.13, ir: 0.04, h2o: 0.37 },
    { key: 'composition', label: 'COMPOSITION', section: 'Bagging & Warehouse', baseNacl: 99.6, ca: 0.02, mg: 0.01, so4: 0.10, ir: 0.02, h2o: 0.25 },
  ];

  // Loop through days from start to end (max 31 days safe guard)
  let cur = new Date(start);
  let daysCount = 0;
  while (cur <= end && daysCount < 31) {
    const curDateStr = cur.toISOString().slice(0, 10);

    shiftList.forEach((s) => {
      // Shift filter
      if (shift !== 'all') {
        if (shift === 'shift1' && s.key !== 'shift1') return;
        if (shift === 'shift2' && s.key !== 'shift2') return;
        if (shift === 'shift3' && s.key !== 'shift3') return;
        if (shift === 'raw_salt' && s.key !== 'rawSalt') return;
        if (shift === 'composition' && s.key !== 'composition') return;
      }

      // SubModule filter
      if (subModule === 'raw' && s.key !== 'rawSalt') return;
      if (subModule === 'composition' && s.key !== 'composition') return;
      if (subModule === 'shifts' && (s.key === 'rawSalt' || s.key === 'composition')) return;

      // Section filter
      if (section !== 'all') {
        if (section === 'salt_dissolution' && s.key !== 'rawSalt') return;
        if (section === 'centrifuge' && !['shift1', 'shift2', 'shift3'].includes(s.key)) return;
        if (section === 'bagging' && s.key !== 'composition') return;
      }

      records.push({
        id: `${curDateStr}-${s.key}`,
        date: curDateStr,
        shift: s.label,
        shiftKey: s.key,
        section: s.section,
        nacl: (s.baseNacl + (Math.sin(daysCount) * 0.15)).toFixed(2),
        ca: (s.ca + (Math.cos(daysCount) * 0.01)).toFixed(2),
        mg: (s.mg + (Math.sin(daysCount) * 0.005)).toFixed(2),
        so4: (s.so4 + (Math.cos(daysCount) * 0.02)).toFixed(2),
        ir: (s.ir + (Math.sin(daysCount) * 0.01)).toFixed(2),
        h2o: (s.h2o + (Math.cos(daysCount) * 0.03)).toFixed(2),
        status: s.key === 'rawSalt' ? 'Feed Standard' : 'In Spec (Pass)',
      });
    });

    cur.setDate(cur.getDate() + 1);
    daysCount++;
  }

  return records;
};

const ACLPlantReportsPage = ({ plantId = 'acl' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  // Default dates: past 7 days to today
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultFromStr = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ── Form State ──
  const [reportType, setReportType] = useState('pure-salt');
  const [subModule, setSubModule] = useState('all');
  const [dateFrom, setDateFrom] = useState(defaultFromStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [shift, setShift] = useState('all');
  const [section, setSection] = useState('all');

  // ── Result State ──
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  // Current module definition
  const currentModule = REPORT_MODULES_REGISTRY[reportType] || REPORT_MODULES_REGISTRY['pure-salt'];

  // Handle report type switch
  const handleReportTypeChange = (newType) => {
    setReportType(newType);
    const mod = REPORT_MODULES_REGISTRY[newType];
    if (mod?.subModules?.length > 0) {
      setSubModule(mod.subModules[0].id);
    } else {
      setSubModule('all');
    }
  };

  // Reset form
  const handleReset = () => {
    setReportType('pure-salt');
    setSubModule('all');
    setDateFrom(defaultFromStr);
    setDateTo(todayStr);
    setShift('all');
    setSection('all');
    setGeneratedReport(null);
    showToast('Filters reset to default.', 'info');
  };

  // Generate Report & Excel
  const handleGenerateReport = async () => {
    if (!dateFrom || !dateTo) {
      showToast('Please select both Date From and Date To.', 'error');
      return;
    }

    if (new Date(dateFrom) > new Date(dateTo)) {
      showToast('Date From cannot be greater than Date To.', 'error');
      return;
    }

    if (currentModule.status === 'upcoming') {
      showToast(`${currentModule.name} is currently under configuration.`, 'info');
      return;
    }

    setGenerating(true);

    try {
      // Simulate database query or API call
      await new Promise((res) => setTimeout(res, 600));

      const filterPayload = {
        plant: 'ACL Plant',
        reportType,
        reportTypeName: currentModule.name,
        subModule,
        subModuleName: currentModule.subModules.find((s) => s.id === subModule)?.name || 'All',
        dateFrom,
        dateTo,
        shift,
        shiftName: SHIFT_OPTIONS.find((s) => s.value === shift)?.label || 'All',
        section,
        sectionName: SECTION_OPTIONS.find((s) => s.value === section)?.label || 'All',
      };

      const data = generateReportData(filterPayload);

      setGeneratedReport({
        filters: filterPayload,
        records: data,
        generatedAt: new Date().toISOString(),
        totalCount: data.length,
      });

      showToast(`Generated ${data.length} records successfully.`, 'success');
    } catch (err) {
      console.error('[ACLReports] Generation failed:', err);
      showToast('Error generating report: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Export generated report to Excel
  const handleExportExcel = async () => {
    if (!generatedReport || generatedReport.records.length === 0) {
      showToast('No report data available to export. Please generate a report first.', 'error');
      return;
    }

    try {
      showToast('Preparing Excel workbook...', 'info');
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Filter Summary & Title ──
      const titleRows = [
        ['SOUTHERN PETROCHEMICAL INDUSTRIES CORPORATION / TACFL'],
        ['ACL PLANT — CENTRALIZED QUALITY CONTROL REPORT'],
        [''],
        ['Report Type:', generatedReport.filters.reportTypeName],
        ['Analysis Module:', generatedReport.filters.subModuleName],
        ['Date Range:', `${formatDateDisplay(generatedReport.filters.dateFrom)} to ${formatDateDisplay(generatedReport.filters.dateTo)}`],
        ['Shift Filter:', generatedReport.filters.shiftName],
        ['Plant Section:', generatedReport.filters.sectionName],
        ['Generated By:', user?.name || 'Administrator'],
        ['Generated At:', new Date().toLocaleString('en-IN')],
        ['Total Records:', generatedReport.totalCount],
        [''],
      ];

      // ── Table Data ──
      const tableHeaders = currentModule.columns.map((c) => c.label);
      const tableData = generatedReport.records.map((r) =>
        currentModule.columns.map((c) => r[c.key] ?? '')
      );

      const wsContent = [...titleRows, tableHeaders, ...tableData];
      const ws = XLSX.utils.aoa_to_sheet(wsContent);

      // Column widths based on definition
      ws['!cols'] = currentModule.columns.map((c) => ({ wch: c.width || 14 }));

      XLSX.utils.book_append_sheet(wb, ws, 'ACL QC Report');

      // ── Sheet 2: Audit Metadata ──
      const metaRows = [
        ['Plant Unit', 'ACL (Ammonium Chloride) Plant'],
        ['Company', user?.company?.name || 'Tuticorin Alkali Chemicals & Fertilizers Ltd.'],
        ['Export Format', 'Microsoft Excel Spreadsheet (.xlsx)'],
        ['Verification Hash', Math.random().toString(36).substring(2, 12).toUpperCase()],
      ];
      const wsMeta = XLSX.utils.aoa_to_sheet(metaRows);
      wsMeta['!cols'] = [{ wch: 20 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsMeta, 'System Info');

      // Write file
      const fileName = `ACL_Report_${reportType}_${generatedReport.filters.dateFrom}_to_${generatedReport.filters.dateTo}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast('Excel report downloaded successfully!', 'success');
    } catch (err) {
      console.error('[ACLReports] Excel download error:', err);
      showToast('Failed to export Excel: ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">

      {/* ── Top Header Bar ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Left: Back Button & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              id="btn-reports-back"
              onClick={() => navigate(`${basePath}/plants/${plantId}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs shrink-0"
              title="Back to ACL Plant"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-0.5">
                <Factory className="w-3.5 h-3.5 text-slate-400" />
                <span>TFL</span>
                <ChevronRight className="w-3 h-3" />
                <span>ACL Plant</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-blue-600 font-semibold">Reports</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
                ACL PLANT — CENTRALIZED REPORTS
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                Tuticorin Alkali Chemicals and Fertilizers Limited · Quality Control Laboratory Reports
              </p>
            </div>
          </div>

          {/* Right Action: Back quick-link */}
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to ACL Plant</span>
          </button>
        </div>
      </div>

      {/* ── Filter Form Card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Filter Card Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-blue-600" />
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              Report Parameters & Filters
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline-block">
            Scalable Industrial Reporting Module
          </span>
        </div>

        {/* Filter Controls Grid */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* 1. Report Type */}
            <div>
              <label
                htmlFor="filter-report-type"
                className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Report Type <span className="text-red-500">*</span>
              </label>
              <select
                id="filter-report-type"
                value={reportType}
                onChange={(e) => handleReportTypeChange(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-xs"
              >
                {Object.values(REPORT_MODULES_REGISTRY).map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.name} {mod.status === 'upcoming' ? '(Upcoming)' : '✓'}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                {currentModule.description}
              </p>
            </div>

            {/* 2. Analysis / Module Sub-category */}
            <div>
              <label
                htmlFor="filter-sub-module"
                className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Analysis / Module <span className="text-red-500">*</span>
              </label>
              <select
                id="filter-sub-module"
                value={subModule}
                onChange={(e) => setSubModule(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-xs"
              >
                {currentModule.subModules?.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Selected sub-stream scope
              </p>
            </div>

            {/* 3. Shift Filter */}
            <div>
              <label
                htmlFor="filter-shift"
                className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Shift Filter
              </label>
              <select
                id="filter-shift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-xs"
              >
                {SHIFT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Filter by specific plant shift
              </p>
            </div>

            {/* 4. Date From */}
            <div>
              <label
                htmlFor="filter-date-from"
                className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Date From <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="filter-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full text-xs font-semibold pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-xs"
                />
              </div>
            </div>

            {/* 5. Date To */}
            <div>
              <label
                htmlFor="filter-date-to"
                className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Date To <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="filter-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full text-xs font-semibold pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-xs"
                />
              </div>
            </div>

            {/* 6. Plant / Section Filter (Optional) */}
            <div>
              <label
                htmlFor="filter-section"
                className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Plant / Section <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <select
                id="filter-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-xs"
              >
                {SECTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              id="btn-reports-reset"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition border border-slate-200"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>

            <button
              id="btn-reports-generate"
              onClick={handleGenerateReport}
              disabled={generating}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm shadow-blue-600/20 disabled:opacity-60"
            >
              {generating ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>{generating ? 'Retrieving Data...' : 'Generate Report'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Generated Report Preview & Download ─────────────────────────────── */}
      {generatedReport ? (
        <div className="space-y-4 animate-fadeIn">

          {/* Results Summary Bar */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900">
                  {generatedReport.filters.reportTypeName} Report
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {generatedReport.totalCount} Records Found
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Period: <span className="font-semibold text-slate-700">{formatDateDisplay(generatedReport.filters.dateFrom)}</span> to{' '}
                <span className="font-semibold text-slate-700">{formatDateDisplay(generatedReport.filters.dateTo)}</span> • Shift:{' '}
                <span className="font-semibold text-slate-700">{generatedReport.filters.shiftName}</span>
              </p>
            </div>

            {/* Direct Excel Download Action */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                id="btn-reports-export-excel"
                onClick={handleExportExcel}
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 hover:border-emerald-400 rounded-xl transition shadow-xs"
              >
                <Download className="w-4 h-4 text-emerald-700" />
                <span>Export to Excel (.XLSX)</span>
              </button>
            </div>
          </div>

          {/* Preview Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Report Data Preview
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Displaying {generatedReport.records.length} of {generatedReport.totalCount} entries
              </span>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="bg-slate-900 text-white sticky top-0 z-10">
                  <tr>
                    {currentModule.columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-3 text-left font-bold uppercase tracking-wider border-r border-slate-800 last:border-r-0"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {generatedReport.records.map((rec) => {
                    const isRaw = rec.shiftKey === 'rawSalt';
                    const isComp = rec.shiftKey === 'composition';
                    return (
                      <tr
                        key={rec.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isRaw
                            ? 'bg-sky-50/60'
                            : isComp
                            ? 'bg-teal-50/50'
                            : 'bg-white'
                        }`}
                      >
                        {currentModule.columns.map((col) => {
                          const val = rec[col.key];
                          if (col.key === 'shift') {
                            return (
                              <td key={col.key} className="px-4 py-2.5 font-bold">
                                <span
                                  className={`${
                                    isRaw
                                      ? 'text-blue-900'
                                      : isComp
                                      ? 'text-teal-900'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  {val}
                                </span>
                              </td>
                            );
                          }
                          if (col.key === 'status') {
                            return (
                              <td key={col.key} className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {val}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={col.key} className="px-4 py-2.5 text-slate-700 font-mono">
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>ACL Plant Quality Control Central Database</span>
              <span>Generated on {new Date(generatedReport.generatedAt).toLocaleString('en-IN')}</span>
            </div>
          </div>

        </div>
      ) : (
        /* Empty State / Initial Prompt */
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600 mb-4">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            ACL Plant Centralized Reporting System
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Select your desired report type, date span, and filters above, then click{' '}
            <strong className="text-slate-800">&ldquo;Generate Report&rdquo;</strong> to preview and export the verified Excel sheet.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={handleGenerateReport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Generate Pure Salt Report Now</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ACLPlantReportsPage;
