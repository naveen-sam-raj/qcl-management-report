import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Factory, Flame, Globe, Gauge, Inbox, Layers } from 'lucide-react';

// 15 ACL Plant analysis options
const ACL_ANALYSIS_OPTIONS = [
  'Pure salt analysis',
  'Bine analysis',
  'Pure salt seive analysis',
  'TK 203',
  'TK 204',
  'TK 205',
  'TK 207',
  'TK 209',
  'Cr 202',
  'Cr 203',
  'PCL/TCL',
  'Cacl2',
  'ACL Product',
  'ACL 300#',
  'Raw salt',
];

// 17 SA Plant analysis options requested by user
const SA_ANALYSIS_OPTIONS = [
  'TK 401',
  'TK 405',
  'TK 414',
  'P 413',
  'TK 419',
  'P 417',
  'T 407',
  'T 401',
  'Bi carbonate',
  'Bi Carbonate',
  'LSA at 500#',
  'LSA',
  'E 501',
  'T 501',
  'LSA Bagging',
  'LSA Bagging sieve',
  'Gas Conc',
];

// 12 OFFSITE / OFFSET Plant analysis options requested by user
const OFFSITE_ANALYSIS_OPTIONS = [
  'DM water',
  'BFW',
  'SHS',
  'Raw Water',
  'CBD',
  'Bottom ash',
  'FLY ash',
  'Distiller waste',
  'Vaccum seal water',
  'Sewar Water',
  'cooling water',
  'cooling water/200#',
];

// 14 CO2 Plant analysis options requested by user
const CO2_ANALYSIS_OPTIONS = [
  'BL1204/BL1203',
  'Absorber inlet',
  'Outlet',
  'Lean',
  'Rich',
  'Washwater',
  'P1256 Cyclone',
  'Reflux',
  'Tk1251',
  'Tk1252',
  'DCC DRAIN LIQ',
  'SOX DRAIN LIQ',
  'ABSORBER DRAIN LIQ',
  'LEAN',
];

const PLANT_CONFIG = {
  acl: {
    title: 'ACL Plant',
    subtitle: 'Ammonium Chloride Production Unit',
    options: ACL_ANALYSIS_OPTIONS,
    badge: '15 Analysis Options',
    icon: Factory,
  },
  plant_acl: {
    title: 'ACL Plant',
    subtitle: 'Ammonium Chloride Production Unit',
    options: ACL_ANALYSIS_OPTIONS,
    badge: '15 Analysis Options',
    icon: Factory,
  },
  sa: {
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    options: SA_ANALYSIS_OPTIONS,
    badge: '17 Analysis Options',
    icon: Flame,
  },
  plant_sa: {
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    options: SA_ANALYSIS_OPTIONS,
    badge: '17 Analysis Options',
    icon: Flame,
  },
  offset: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '12 Analysis Options',
    icon: Globe,
  },
  offsite: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '12 Analysis Options',
    icon: Globe,
  },
  plant_offset: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '12 Analysis Options',
    icon: Globe,
  },
  plant_offsite: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '12 Analysis Options',
    icon: Globe,
  },
  co2: {
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Capture & Recovery Unit',
    options: CO2_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Gauge,
  },
  c02: {
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Capture & Recovery Unit',
    options: CO2_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Gauge,
  },
  plant_co2: {
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Capture & Recovery Unit',
    options: CO2_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Gauge,
  },
};

const PlantAnalysisPage = () => {
  const { id, optionName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  const plantKey = (id || '').toLowerCase();
  const plant = PLANT_CONFIG[plantKey] || {
    title: `${id?.toUpperCase()} Plant`,
    subtitle: 'Industrial Plant Operations',
    options: [],
    badge: 'Operational',
    icon: Factory,
  };

  const decodedOptionName = optionName ? decodeURIComponent(optionName) : null;

  // Handle clicking on an option -> navigate inside to show empty page
  const handleOptionClick = (option) => {
    navigate(`${basePath}/plants/${id}/options/${encodeURIComponent(option)}`);
  };

  // ── VIEW 1: Empty state view when inside a clicked option ──
  if (decodedOptionName) {
    return (
      <div className="space-y-6 animate-fadeIn pb-12">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${id}`)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
              title={`Back to ${plant.title}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  {plant.title}
                </span>
                <span className="text-xs text-slate-300">/</span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {decodedOptionName}
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tuticorin Alkali Chemicals and Fertilizers Limited
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate(`${basePath}/plants/${id}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to {plant.title}</span>
          </button>
        </div>

        {/* Empty Content Box as requested by user ("emty nu kattanum bro") */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 sm:p-16 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Inbox className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Empty
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
            No data or parameters have been configured yet for <span className="font-semibold text-slate-700">{decodedOptionName}</span>.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(`${basePath}/plants/${id}`)}
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

  // ── VIEW 2: Options Grid View ──
  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header bar with Back button and Plant Name */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(basePath)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {plant.title}
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {plant.badge}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tuticorin Alkali Chemicals and Fertilizers Limited • {plant.subtitle}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(basePath)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Plants</span>
        </button>
      </div>

      {/* Content Area */}
      {plant.options.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {plant.options.map((name, index) => (
            <div
              key={index}
              onClick={() => handleOptionClick(name)}
              className="group relative p-3.5 rounded-xl border-2 border-slate-200/90 hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 bg-white transition-all duration-200 cursor-pointer flex items-center justify-center text-center min-h-[68px] shadow-xs"
            >
              <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors tracking-tight">
                {name}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* Empty/Pending state for other plants (OFFSET, CO2) */
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Factory className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">
            {plant.title} Options
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Analysis options for this unit are being configured. Please check ACL Plant or SA Plant.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => navigate('/admin/tfl/plants/acl')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <span>View ACL Plant</span>
            </button>
            <button
              onClick={() => navigate('/admin/tfl/plants/sa')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <span>View SA Plant</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlantAnalysisPage;
