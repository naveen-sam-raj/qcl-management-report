import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, Flame, Globe, Gauge, ArrowRight, BarChart3, FileSpreadsheet } from 'lucide-react';
import LicenseInfoCard from '../../components/common/LicenseInfoCard';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import { generateAndDownloadTFLOverallExcel } from '../../services/tflOverallExcel';

import OverallExcelReportModal from '../../components/common/OverallExcelReportModal';

const TFL_PLANTS = [
  {
    id: 'acl',
    name: 'ACL Plant',
    icon: Factory,
    description: 'Ammonium Chloride Unit',
    badge: '14 Options',
  },
  {
    id: 'sa',
    name: 'SA Plant',
    icon: Flame,
    description: 'Soda Ash Production Unit',
    badge: '17 Options',
  },
  {
    id: 'offset',
    name: 'OFFSET Plant',
    icon: Globe,
    description: 'Offsite Utilities & Facilities',
    badge: '12 Options',
  },
  {
    id: 'co2',
    name: 'CO2 Plant',
    icon: Gauge,
    description: 'Carbon Dioxide Recovery',
    badge: '14 Options',
  },
];

const TFLAdminDashboard = () => {
  const navigate = useNavigate();
  const [showExcelModal, setShowExcelModal] = useState(false);

  const handlePlantSelect = (plantId) => {
    navigate(`/admin/tfl/plants/${plantId}`);
  };

  return (
    <div className="space-y-3.5 animate-fadeIn">
      {/* Compact Header Banner */}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-1">
            <span>TUTICORIN ALKALI CHEMICALS AND FERTILIZERS LIMITED</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            TFL Admin Dashboard
          </h1>
          <p className="text-xs text-slate-500">
            Select a plant below to view options and operational parameters.
          </p>
        </div>

        {/* Top-Right Header Actions: Badge + Overall Graph + Overall Excel Report */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
            4 Plant Units
          </span>

          {/* 📊 Overall Graph Button */}
          <button
            id="btn-tfl-overall-graph"
            onClick={() => navigate('/admin/tfl/overall-graph')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded-lg transition shadow-xs cursor-pointer"
            title="View Consolidated 4-Plant Analytics Graph"
          >
            <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
            <span>Overall Graph</span>
          </button>

          {/* 📄 Overall Excel Report Button */}
          <button
            id="btn-tfl-overall-excel"
            onClick={() => setShowExcelModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-300 rounded-lg transition shadow-xs cursor-pointer"
            title="Download Consolidated 5-Sheet Excel Workbook for All 4 Plants"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Overall Excel Report</span>
          </button>
        </div>
      </div>

      {/* Date & Plant Selection Modal for Real Excel Report */}
      <OverallExcelReportModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
      />

      {/* License Information & Expiry Warning (Requirement 9) */}
      <LicenseInfoCard />

      {/* 4 Compact Plant Option Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
        {TFL_PLANTS.map((plant) => {
          const Icon = plant.icon;
          return (
            <div
              key={plant.id}
              onClick={() => handlePlantSelect(plant.id)}
              className="group bg-white rounded-xl border-2 border-slate-200/80 hover:border-blue-500 p-4 sm:p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all duration-200 shadow-xs">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200 transition">
                    {plant.badge}
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition tracking-tight">
                  {plant.name}
                </h2>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {plant.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-blue-600 transition">
                <span>Open {plant.name}</span>
                <div className="w-6 h-6 rounded-md bg-slate-100 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition">
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TFLAdminDashboard;
