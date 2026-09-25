import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Factory, Flame, Globe, Gauge, Inbox, Layers, FileSpreadsheet } from 'lucide-react';
import PureSaltAnalysisPage from './PureSaltAnalysisPage';
import BrineAnalysisPage from './BrineAnalysisPage';
import PureSaltSieveAnalysisPage from './PureSaltSieveAnalysisPage';
import TK203AnalysisPage from './TK203AnalysisPage';
import TK205AnalysisPage from './TK205AnalysisPage';
import TK207AnalysisPage from './TK207AnalysisPage';
import ACLProductAnalysisPage from './ACLProductAnalysisPage';
import PclTclAnalysisPage from './PclTclAnalysisPage';
import CR203AnalysisPage from './CR203AnalysisPage';
import CR202AnalysisPage from './CR202AnalysisPage';
import T401AnalysisPage from './T401AnalysisPage';
import TK419AnalysisPage from './TK419AnalysisPage';
import LSA500AnalysisPage from './LSA500AnalysisPage';
import LSAShiftAnalysisPage from './LSAShiftAnalysisPage';
import LSABaggingSieveAnalysisPage from './LSABaggingSieveAnalysisPage';
import CBDAnalysisPage from './CBDAnalysisPage';
import FlyAshAnalysisPage from './FlyAshAnalysisPage';
import BottomAshAnalysisPage from './BottomAshAnalysisPage';
import RawWaterAnalysisPage from './RawWaterAnalysisPage';
import BFWAnalysisPage from './BFWAnalysisPage';
import SewerWaterAnalysisPage from './SewerWaterAnalysisPage';
import CoolingWaterAnalysisPage from './CoolingWaterAnalysisPage';
import DistillerWasteAnalysisPage from './DistillerWasteAnalysisPage';
import VacuumSealWaterAnalysisPage from './VacuumSealWaterAnalysisPage';
import BicarbonateAnalysisPage from './BicarbonateAnalysisPage';
import BicarbonateMoistureAnalysisPage from './BicarbonateMoistureAnalysisPage';
import E501T501AnalysisPage from './E501T501AnalysisPage';
import DMWaterAnalysisPage from './DMWaterAnalysisPage';
import ACLPlantReportsPage from './ACLPlantReportsPage';

// 15 ACL Plant analysis options
const ACL_ANALYSIS_OPTIONS = [
  'Pure salt analysis',
  'Brine analysis',
  'Pure salt sieve analysis',
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

// 16 SA Plant analysis options requested by user
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
  'Bicarbonate Moisture',
  'LSA at 500#',
  'LSA',
  'E 501 / T 501',
  'LSA Bagging',
  'LSA Bagging sieve',
  'Gas Conc',
];

// 12 OFFSITE / OFFSET Plant analysis options requested by user
const OFFSITE_ANALYSIS_OPTIONS = [
  'DM water',
  'Boiler Feed Water / Super Heated Steam',
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

  // ── VIEW 1: Dedicated module or empty state for a clicked option ──
  if (decodedOptionName) {
    // ── Reports → dedicated centralized ACL Plant reporting dashboard ──
    if (decodedOptionName.toLowerCase() === 'reports') {
      return <ACLPlantReportsPage plantId={id} />;
    }

    // ── Pure Salt Analysis → dedicated full-featured module ──
    if (decodedOptionName.toLowerCase() === 'pure salt analysis') {
      return <PureSaltAnalysisPage plantId={id} />;
    }

    // ── Brine Analysis → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'brine analysis' ||
      decodedOptionName.toLowerCase() === 'bine analysis'
    ) {
      return <BrineAnalysisPage plantId={id} />;
    }

    // ── Pure Salt Sieve Analysis → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'pure salt sieve analysis' ||
      decodedOptionName.toLowerCase() === 'pure salt seive analysis' ||
      decodedOptionName.toLowerCase() === 'sieve analysis'
    ) {
      return <PureSaltSieveAnalysisPage plantId={id} />;
    }

    // ── TK 203 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk 203' ||
      decodedOptionName.toLowerCase() === 'tk203'
    ) {
      return <TK203AnalysisPage plantId={id} />;
    }

    // ── TK 205 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk 205' ||
      decodedOptionName.toLowerCase() === 'tk205'
    ) {
      return <TK205AnalysisPage plantId={id} />;
    }

    // ── TK 207 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk 207' ||
      decodedOptionName.toLowerCase() === 'tk207'
    ) {
      return <TK207AnalysisPage plantId={id} />;
    }

    // ── ACL Product → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'acl product' ||
      decodedOptionName.toLowerCase() === 'aclproduct'
    ) {
      return <ACLProductAnalysisPage plantId={id} />;
    }

    // ── PCL/TCL → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'pcl/tcl' ||
      decodedOptionName.toLowerCase() === 'pcl / tcl' ||
      decodedOptionName.toLowerCase() === 'pcl-tcl' ||
      decodedOptionName.toLowerCase() === 'pcl'
    ) {
      return <PclTclAnalysisPage plantId={id} />;
    }

    // ── CR 203 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'cr 203' ||
      decodedOptionName.toLowerCase() === 'cr203'
    ) {
      return <CR203AnalysisPage plantId={id} />;
    }

    // ── CR 202 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'cr 202' ||
      decodedOptionName.toLowerCase() === 'cr202'
    ) {
      return <CR202AnalysisPage plantId={id} />;
    }

    // ── T 401 (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 't 401' ||
      decodedOptionName.toLowerCase() === 't401'
    ) {
      return <T401AnalysisPage plantId={id || 'sa'} />;
    }

    // ── TK 419 (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk 419' ||
      decodedOptionName.toLowerCase() === 'tk419'
    ) {
      return <TK419AnalysisPage plantId={id || 'sa'} />;
    }

    // ── LSA at 500# (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'lsa at 500#' ||
      decodedOptionName.toLowerCase() === 'lsa 500#' ||
      decodedOptionName.toLowerCase() === 'lsa at 500' ||
      decodedOptionName.toLowerCase() === 'lsa 500' ||
      decodedOptionName.toLowerCase().includes('500#')
    ) {
      return <LSA500AnalysisPage plantId={id || 'sa'} />;
    }

    // ── LSA (LSA Shift Analysis - SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'lsa' ||
      decodedOptionName.toLowerCase() === 'lsa shift' ||
      decodedOptionName.toLowerCase() === 'lsa-shift' ||
      decodedOptionName.toLowerCase() === 'lsa shift analysis'
    ) {
      return <LSAShiftAnalysisPage plantId={id || 'sa'} />;
    }

    // ── LSA Bagging Sieve (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'lsa bagging sieve' ||
      decodedOptionName.toLowerCase() === 'lsa bagging seive' ||
      decodedOptionName.toLowerCase() === 'bagging sieve' ||
      decodedOptionName.toLowerCase() === 'bagging seive' ||
      decodedOptionName.toLowerCase().includes('bagging sieve') ||
      decodedOptionName.toLowerCase().includes('bagging seive')
    ) {
      return <LSABaggingSieveAnalysisPage plantId={id || 'sa'} />;
    }

    // ── Bicarbonate Moisture (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase().includes('moisture') ||
      decodedOptionName === 'Bi Carbonate' ||
      decodedOptionName.toLowerCase() === 'bicarbonate moisture' ||
      decodedOptionName.toLowerCase() === 'bi carbonate moisture' ||
      decodedOptionName.toLowerCase() === 'bi-carbonate moisture'
    ) {
      return <BicarbonateMoistureAnalysisPage plantId={id || 'sa'} />;
    }

    // ── Bi Carbonate NaCl/Na2CO3 (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'bi carbonate' ||
      decodedOptionName.toLowerCase() === 'bi-carbonate' ||
      decodedOptionName.toLowerCase() === 'bicarbonate' ||
      decodedOptionName.toLowerCase().includes('carbonate')
    ) {
      return <BicarbonateAnalysisPage plantId={id || 'sa'} />;
    }

    // ── E 501 / T 501 (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'e 501 / t 501' ||
      decodedOptionName.toLowerCase() === 'e 501/t 501' ||
      decodedOptionName.toLowerCase() === 'e 501/ t 501' ||
      decodedOptionName.toLowerCase() === 'e501 / t501' ||
      decodedOptionName.toLowerCase() === 'e501/t501' ||
      decodedOptionName.toLowerCase() === 'e 501' ||
      decodedOptionName.toLowerCase() === 't 501' ||
      decodedOptionName.toLowerCase() === 'e501' ||
      decodedOptionName.toLowerCase() === 't501' ||
      (decodedOptionName.toLowerCase().includes('501') && !decodedOptionName.toLowerCase().includes('500'))
    ) {
      return <E501T501AnalysisPage plantId={id || 'sa'} />;
    }

    // ── CBD Analysis (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'cbd' ||
      decodedOptionName.toLowerCase() === 'cbd analysis'
    ) {
      return <CBDAnalysisPage plantId={id || 'offset'} />;
    }

    // ── FLY Ash Analysis (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'fly ash' ||
      decodedOptionName.toLowerCase() === 'flyash' ||
      decodedOptionName.toLowerCase() === 'fly-ash' ||
      decodedOptionName.toLowerCase().includes('fly ash')
    ) {
      return <FlyAshAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Bottom Ash Analysis (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'bottom ash' ||
      decodedOptionName.toLowerCase() === 'bottomash' ||
      decodedOptionName.toLowerCase() === 'bottom-ash' ||
      decodedOptionName.toLowerCase().includes('bottom ash')
    ) {
      return <BottomAshAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Raw Water Analysis (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'raw water' ||
      decodedOptionName.toLowerCase() === 'rawwater' ||
      decodedOptionName.toLowerCase() === 'raw-water' ||
      decodedOptionName.toLowerCase().includes('raw water')
    ) {
      return <RawWaterAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Boiler Feed Water / Super Heated Steam (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'boiler feed water / super heated steam' ||
      decodedOptionName.toLowerCase() === 'boiler feed water/super heated steam' ||
      decodedOptionName.toLowerCase().includes('boiler feed water') ||
      decodedOptionName.toLowerCase().includes('boiled feed water') ||
      decodedOptionName.toLowerCase().includes('super heated steam') ||
      decodedOptionName.toLowerCase().includes('super heated system') ||
      decodedOptionName.toLowerCase() === 'bfw' ||
      decodedOptionName.toLowerCase() === 'shs'
    ) {
      return <BFWAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Sewer / Sewar Water Analysis (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'sewar water' ||
      decodedOptionName.toLowerCase() === 'sewer water' ||
      decodedOptionName.toLowerCase() === 'sewar' ||
      decodedOptionName.toLowerCase() === 'sewer' ||
      decodedOptionName.toLowerCase().includes('sewar') ||
      decodedOptionName.toLowerCase().includes('sewer')
    ) {
      return <SewerWaterAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Cooling Water (C.W Water) & Cooling Water / 200# (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'cooling water' ||
      decodedOptionName.toLowerCase() === 'cooling water/200#' ||
      decodedOptionName.toLowerCase() === 'cooling water / 200#' ||
      decodedOptionName.toLowerCase() === 'c.w water' ||
      decodedOptionName.toLowerCase() === 'cw water' ||
      decodedOptionName.toLowerCase().includes('cooling water') ||
      decodedOptionName.toLowerCase().includes('c.w water')
    ) {
      return <CoolingWaterAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Distiller Waste / Distiller Waste Water (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'distiller waste' ||
      decodedOptionName.toLowerCase() === 'distiller waste water' ||
      decodedOptionName.toLowerCase() === 'distiller' ||
      decodedOptionName.toLowerCase() === 'distiller waste' ||
      decodedOptionName.toLowerCase().includes('distiller')
    ) {
      return <DistillerWasteAnalysisPage plantId={id || 'offset'} />;
    }

    // ── Vacuum / Vaccum Seal Water (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'vaccum seal water' ||
      decodedOptionName.toLowerCase() === 'vacuum seal water' ||
      decodedOptionName.toLowerCase() === 'vaccum seal' ||
      decodedOptionName.toLowerCase() === 'vacuum seal' ||
      decodedOptionName.toLowerCase().includes('vaccum') ||
      decodedOptionName.toLowerCase().includes('vacuum')
    ) {
      return <VacuumSealWaterAnalysisPage plantId={id || 'offset'} />;
    }

    // ── DM Water / Anion Unit Analysis (OFFSET Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'dm water' ||
      decodedOptionName.toLowerCase() === 'dmwater' ||
      decodedOptionName.toLowerCase() === 'dm-water' ||
      decodedOptionName.toLowerCase().includes('dm water') ||
      decodedOptionName.toLowerCase().includes('anion unit')
    ) {
      return <DMWaterAnalysisPage plantId={id || 'offset'} />;
    }

    // ── All other options → generic empty placeholder ──
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

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {/* Dedicated Reports button at the ACL Plant level */}
          {plantKey.includes('acl') && (
            <button
              id="btn-acl-header-reports"
              onClick={() => handleOptionClick('Reports')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded-lg transition shadow-xs"
              title="ACL Plant Centralized Reports"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>Reports</span>
            </button>
          )}

          <button
            onClick={() => navigate(basePath)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Plants</span>
          </button>
        </div>
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
