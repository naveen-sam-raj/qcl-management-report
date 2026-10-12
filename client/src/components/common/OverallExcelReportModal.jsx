import React, { useState } from 'react';
import { X, FileSpreadsheet, Calendar, CheckSquare, Square, Download, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { generateAndDownloadTFLOverallExcel } from '../../services/tflOverallExcel';
import { useToast } from './Toast';

const ALL_PLANTS = [
  { id: 'ACL', label: 'ACL Plant' },
  { id: 'SA', label: 'SA Plant' },
  { id: 'OFFSET', label: 'OFFSET Plant' },
  { id: 'CO2', label: 'CO2 Plant' },
];

const OverallExcelReportModal = ({ isOpen, onClose }) => {
  const { showToast } = useToast();

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getNDaysAgoStr = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };

  const [fromDate, setFromDate] = useState(getNDaysAgoStr(30));
  const [toDate, setToDate] = useState(getTodayStr());
  const [selectedPlants, setSelectedPlants] = useState(['ACL', 'SA', 'OFFSET', 'CO2']);
  const [generating, setGenerating] = useState(false);

  if (!isOpen) return null;

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

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      showToast('Please select valid From and To dates.', 'error');
      return;
    }
    if (fromDate > toDate) {
      showToast('From Date cannot be after To Date.', 'error');
      return;
    }

    try {
      setGenerating(true);
      showToast('Querying live MongoDB records for Excel export...', 'info');

      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        plants: selectedPlants.join(','),
      });

      const [analyticsRes, reportRes] = await Promise.all([
        api.get(`/api/tfl/overall-analytics?${params.toString()}`),
        api.get(`/api/tfl/overall-report?${params.toString()}`),
      ]);

      const summary = analyticsRes.data?.data?.summary || analyticsRes.data?.summary || {};
      const plantComplianceList = analyticsRes.data?.data?.plantComplianceList || analyticsRes.data?.plantComplianceList || [];
      const plantsData = reportRes.data?.plantsData || {};

      const filename = await generateAndDownloadTFLOverallExcel({
        summaryData: summary,
        plantComplianceList,
        plantsData,
        dateRange: { from: fromDate, to: toDate },
        selectedPlants,
      });

      showToast(`Excel generated with live database records: ${filename}`, 'success');
      onClose();
    } catch (err) {
      console.error('[OverallExcelReportModal] Export failed:', err);
      showToast('Export failed: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">OVERALL EXCEL REPORT</h2>
              <p className="text-xs text-slate-500">Generate consolidated workbook with real database records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Quick Filter Buttons */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Quick Date Presets
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickFilter('today')}
                className="px-2.5 py-1 rounded-md border border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 text-slate-700 font-semibold transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleQuickFilter('7days')}
                className="px-2.5 py-1 rounded-md border border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 text-slate-700 font-semibold transition"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickFilter('30days')}
                className="px-2.5 py-1 rounded-md border border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 text-slate-700 font-semibold transition"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">From Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">To Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Plant Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
              Plant Selection
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_PLANTS.map((plant) => {
                const isSelected = selectedPlants.includes(plant.id);
                return (
                  <button
                    key={plant.id}
                    type="button"
                    onClick={() => togglePlant(plant.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition ${
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
                    <span>{plant.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Strict Data Accuracy:</strong> The generated Excel workbook will query MongoDB directly and only include actual saved database records for the selected period.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{generating ? 'Generating...' : 'Generate Report'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverallExcelReportModal;
