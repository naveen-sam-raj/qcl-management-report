import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, Flame, Globe, Gauge, ArrowRight } from 'lucide-react';

const TFL_PLANTS = [
  {
    id: 'acl',
    name: 'ACL Plant',
    icon: Factory,
    description: 'Ammonium Chloride Unit',
    badge: '15 Options',
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

  const handlePlantSelect = (plantId) => {
    navigate(`/admin/tfl/plants/${plantId}`);
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-8">
      {/* Compact Header Banner */}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
        <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 self-start sm:self-auto">
          4 Plant Units
        </span>
      </div>

      {/* 4 Compact Plant Option Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
