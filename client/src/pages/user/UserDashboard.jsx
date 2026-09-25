import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ALL_PLANTS_CONFIG } from '../../services/plantOptions';
import {
  Factory,
  Flame,
  Globe,
  Gauge,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  Shield,
  Activity,
} from 'lucide-react';

const UserDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Determine user's assigned plant strictly from their profile
  const plantStr = (
    user?.plant?.code ||
    user?.plant?.name ||
    user?.plant?._id ||
    user?.plant?.id ||
    (typeof user?.plant === 'string' ? user.plant : '') ||
    'acl'
  ).toUpperCase();

  const assignedPlantId = plantStr.includes('SA')
    ? 'sa'
    : plantStr.includes('OFFSET') || plantStr.includes('OFFSITE')
    ? 'offset'
    : plantStr.includes('CO2') || plantStr.includes('C02')
    ? 'co2'
    : 'acl';

  // The ONLY plant this user is authorized to view
  const myPlant =
    ALL_PLANTS_CONFIG.find((p) => p.id === assignedPlantId) || ALL_PLANTS_CONFIG[0];

  const PlantIcon = myPlant.icon;

  const handleOptionClick = (optionName) => {
    navigate(`/portal/plants/${assignedPlantId}/options/${encodeURIComponent(optionName)}`);
  };

  const handleReportsClick = () => {
    navigate(`/portal/plants/${assignedPlantId}/options/Reports`);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── User Header Profile ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-sm">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
                {user?.name || 'Operator'}
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                <Eye className="w-3 h-3" /> PLANT OPERATOR
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-500 mt-0.5">
              <span>@{user?.username || 'user'}</span>
              <span>•</span>
              <span>{user?.company?.name || 'TFL'}</span>
              <span>•</span>
              <span className="font-semibold text-blue-600">
                Dedicated Unit: {myPlant.name}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
          {/* Centralized Reports button */}
          <button
            id="btn-user-acl-reports"
            onClick={handleReportsClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded-lg transition shadow-xs"
            title={`${myPlant.name} Centralized Quality Control Reports`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Centralized Reports</span>
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
            <PlantIcon className="w-4 h-4 text-blue-600" />
            <span>Assigned: {myPlant.name}</span>
          </div>
        </div>
      </div>

      {/* ── Assigned Plant's Analysis Options ONLY ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
              <PlantIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {myPlant.name}
                </h2>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {myPlant.options.length} Options
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {myPlant.subtitle} • Authorized Analysis & Quality Control Modules
              </p>
            </div>
          </div>

          <span className="text-xs text-slate-400 font-medium">
            Select any analysis module below
          </span>
        </div>

        {/* The compact option boxes for THIS PLANT ONLY */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {myPlant.options.map((name, index) => (
            <div
              key={index}
              onClick={() => handleOptionClick(name)}
              className="group relative p-3.5 rounded-xl border-2 border-slate-200/90 hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 bg-white transition-all duration-200 cursor-pointer flex flex-col justify-between text-center min-h-[72px] shadow-xs"
            >
              <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors tracking-tight">
                {name}
              </span>
              <div className="flex items-center justify-end text-[10px] font-semibold text-slate-400 group-hover:text-blue-600 transition-colors mt-2">
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;

