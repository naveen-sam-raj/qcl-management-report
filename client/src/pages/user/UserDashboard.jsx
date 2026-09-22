import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ALL_PLANTS_CONFIG } from '../../services/plantOptions';
import {
  Factory,
  Flame,
  Globe,
  Gauge,
  User,
  Building2,
  Eye,
  ArrowLeft,
  Inbox,
  CheckCircle2,
} from 'lucide-react';

const UserDashboard = () => {
  const { user } = useAuth();
  const [selectedOption, setSelectedOption] = useState(null);

  // Determine user's assigned plant strictly from their profile
  const plantStr = (
    user?.plant?.code ||
    user?.plant?.name ||
    user?.plant?._id ||
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

  // ── VIEW 1: Option clicked -> "Empty" state view ──
  if (selectedOption) {
    return (
      <div className="space-y-6 animate-fadeIn pb-12">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedOption(null)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
              title={`Back to ${myPlant.name}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  {myPlant.name}
                </span>
                <span className="text-xs text-slate-300">/</span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {selectedOption}
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tuticorin Alkali Chemicals and Fertilizers Limited • {myPlant.subtitle}
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedOption(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to {myPlant.name}</span>
          </button>
        </div>

        {/* Empty Box State */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 sm:p-16 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Inbox className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Empty
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
            No data or parameters have been configured yet for{' '}
            <span className="font-semibold text-slate-700">{selectedOption}</span>.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setSelectedOption(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Options</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW 2: User Dashboard (Strictly ONLY user's assigned plant & options) ──
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
                Unit: {myPlant.name}
              </span>
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold self-start sm:self-auto">
          <PlantIcon className="w-4 h-4" />
          <span>Assigned: {myPlant.name}</span>
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
                {myPlant.subtitle} • Dedicated Plant Operator Options
              </p>
            </div>
          </div>

          <span className="text-xs text-slate-400 font-medium">
            Click any option below to open
          </span>
        </div>

        {/* The compact option boxes for THIS PLANT ONLY */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {myPlant.options.map((name, index) => (
            <div
              key={index}
              onClick={() => setSelectedOption(name)}
              className="group relative p-3.5 rounded-xl border-2 border-slate-200/90 hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 bg-white transition-all duration-200 cursor-pointer flex items-center justify-center text-center min-h-[68px] shadow-xs"
            >
              <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors tracking-tight">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
