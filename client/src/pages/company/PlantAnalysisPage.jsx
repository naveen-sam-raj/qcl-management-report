import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Factory, Flame, Globe, Gauge, Inbox, Layers, FileSpreadsheet, BarChart3 } from 'lucide-react';
import PureSaltAnalysisPage from './PureSaltAnalysisPage';
import BrineAnalysisPage from './BrineAnalysisPage';
import PureSaltSieveAnalysisPage from './PureSaltSieveAnalysisPage';
import TK203AnalysisPage from './TK203AnalysisPage';
import TK205AnalysisPage from './TK205AnalysisPage';
import TK207AnalysisPage from './TK207AnalysisPage';
import ACLProductAnalysisPage from './ACLProductAnalysisPage';
import ACL300AnalysisPage from './ACL300AnalysisPage';
import RawSaltAnalysisPage from './RawSaltAnalysisPage';
import PclTclAnalysisPage from './PclTclAnalysisPage';
import CR203AnalysisPage from './CR203AnalysisPage';
import CR202AnalysisPage from './CR202AnalysisPage';
import T401AnalysisPage from './T401AnalysisPage';
import TK419AnalysisPage from './TK419AnalysisPage';
import LSA500AnalysisPage from './LSA500AnalysisPage';
import LSAShiftAnalysisPage from './LSAShiftAnalysisPage';
import LSABaggingSieveAnalysisPage from './LSABaggingSieveAnalysisPage';
import LSABaggingAnalysisPage from './LSABaggingAnalysisPage';
import TK401SAAnalysisPage from './TK401SAAnalysisPage';
import TK405SAAnalysisPage from './TK405SAAnalysisPage';
import TK414TSCTankAnalysisPage from './TK414TSCTankAnalysisPage';
import P413WSCTankAnalysisPage from './P413WSCTankAnalysisPage';
import TK419SCTankAnalysisPage from './TK419SCTankAnalysisPage';
import P4171AnalysisPage from './P4171AnalysisPage';
import P4172AnalysisPage from './P4172AnalysisPage';
import P4173AnalysisPage from './P4173AnalysisPage';
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
import GasConcAnalysisPage from './GasConcAnalysisPage';
import DMWaterAnalysisPage from './DMWaterAnalysisPage';
import CaCl2AnalysisPage from './CaCl2AnalysisPage';
import ACLPlantReportsPage from './ACLPlantReportsPage';
import PlantAnalyticsGraphPage from './PlantAnalyticsGraphPage';
import TK204AnalysisPage from './TK204AnalysisPage';
import TK209AnalysisPage from './TK209AnalysisPage';
import TK204TK209AnalysisPage from './TK204TK209AnalysisPage';
import BL1204BL1203AnalysisPage from './BL1204BL1203AnalysisPage';
import AbsorberInletAnalysisPage from './AbsorberInletAnalysisPage';
import OutletAnalysisPage from './OutletAnalysisPage';
import LeanAnalysisPage from './LeanAnalysisPage';
import RichAnalysisPage from './RichAnalysisPage';
import WashwaterAnalysisPage from './WashwaterAnalysisPage';
import P1256AnalysisPage from './P1256AnalysisPage';
import RefluxAnalysisPage from './RefluxAnalysisPage';
import TK1251AnalysisPage from './TK1251AnalysisPage';
import TK1252AnalysisPage from './TK1252AnalysisPage';
import DCCDrainLiqAnalysisPage from './DCCDrainLiqAnalysisPage';
import SOXDrainLiqAnalysisPage from './SOXDrainLiqAnalysisPage';
import AbsorberDrainLiqAnalysisPage from './AbsorberDrainLiqAnalysisPage';
import LeanWeeklyAnalysisPage from './LeanWeeklyAnalysisPage';

// 15 ACL Plant analysis options
const ACL_ANALYSIS_OPTIONS = [
  'Pure salt analysis',
  'Brine analysis',
  'Pure salt sieve analysis',
  'TK 203',
  'TK 204',
  'TK 209',
  'TK 205',
  'TK 207',
  'Cr 202',
  'Cr 203',
  'PCL/TCL',
  'Cacl2',
  'ACL Product',
  'ACL 300#',
  'Raw salt',
];

// 18 SA Plant analysis options
const SA_ANALYSIS_OPTIONS = [
  'TK 401',
  'TK 405',
  'TK 414 TSC TANK',
  'P413 WSC TANK',
  'TK 419 SC TANK',
  'P417-1',
  'P417-2',
  'P417-3',
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
  'P1256',
  'Reflux',
  'TK1251',
  'TK1252',
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
    badge: '14 Analysis Options',
    icon: Factory,
  },
  plant_acl: {
    title: 'ACL Plant',
    subtitle: 'Ammonium Chloride Production Unit',
    options: ACL_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Factory,
  },
  sa: {
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    options: SA_ANALYSIS_OPTIONS,
    badge: '19 Analysis Options',
    icon: Flame,
  },
  plant_sa: {
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    options: SA_ANALYSIS_OPTIONS,
    badge: '19 Analysis Options',
    icon: Flame,
  },
  offset: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  offsite: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  plant_offset: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  plant_offsite: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
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

  // Extract user's assigned plant identifier
  const userPlantStr = (
    user?.plant?.code ||
    user?.plant?.name ||
    user?.plant?._id ||
    user?.plant?.id ||
    (typeof user?.plant === 'string' ? user.plant : '') ||
    'acl'
  ).toUpperCase();

  const userAssignedPlantId = userPlantStr.includes('SA')
    ? 'sa'
    : userPlantStr.includes('OFFSET') || userPlantStr.includes('OFFSITE')
    ? 'offset'
    : userPlantStr.includes('CO2') || userPlantStr.includes('C02')
    ? 'co2'
    : 'acl';

  // Strict Plant Isolation: Normal operators can ONLY access their assigned plant
  React.useEffect(() => {
    if (user?.role === 'user') {
      const currentParamId = (id || '').toLowerCase();
      if (!currentParamId) return; // At /portal root, defaults to user's plant
      const isAllowed =
        currentParamId === userAssignedPlantId ||
        currentParamId === `plant_${userAssignedPlantId}`;
      if (!isAllowed) {
        if (optionName) {
          navigate(`/portal/plants/${userAssignedPlantId}/options/${encodeURIComponent(optionName)}`, { replace: true });
        } else {
          navigate('/portal', { replace: true });
        }
      }
    }
  }, [user, id, optionName, navigate, userAssignedPlantId]);

  const effectivePlantId = (id || (user?.role === 'user' ? userAssignedPlantId : 'acl')).toLowerCase();
  const plantKey = effectivePlantId.replace('plant_', '');
  const plant = PLANT_CONFIG[plantKey] || PLANT_CONFIG.acl || {
    title: `${plantKey.toUpperCase()} Plant`,
    subtitle: 'Industrial Plant Operations',
    options: ACL_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Factory,
  };

  const decodedOptionName = optionName ? decodeURIComponent(optionName) : null;

  // Handle clicking on an option -> navigate inside
  const handleOptionClick = (option) => {
    navigate(`${basePath}/plants/${plantKey}/options/${encodeURIComponent(option)}`);
  };

  // ── VIEW 1: Dedicated module or empty state for a clicked option ──
  if (decodedOptionName) {
    // ── Reports → dedicated centralized ACL Plant reporting dashboard ──
    if (decodedOptionName.toLowerCase() === 'reports') {
      return <ACLPlantReportsPage plantId={id} />;
    }

    // ── Graph / Trend Analytics with Limit Violation Detection ──
    if (
      decodedOptionName.toLowerCase() === 'graph' ||
      decodedOptionName.toLowerCase() === 'graphs' ||
      decodedOptionName.toLowerCase() === 'analytics'
    ) {
      return <PlantAnalyticsGraphPage plantId={id || plantKey} plantTitle={plant.title} />;
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

    // ── TK 204 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk 204' ||
      decodedOptionName.toLowerCase() === 'tk204'
    ) {
      return <TK204AnalysisPage plantId={id} />;
    }

    // ── TK 209 → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk 209' ||
      decodedOptionName.toLowerCase() === 'tk209'
    ) {
      return <TK209AnalysisPage plantId={id} />;
    }

    // Legacy combined route if accessed directly via URL
    if (
      decodedOptionName.toLowerCase() === 'tk 204 / tk 209' ||
      decodedOptionName.toLowerCase() === 'tk 204/tk 209' ||
      decodedOptionName.toLowerCase() === 'tk 204/ tk 209' ||
      (decodedOptionName.toLowerCase().includes('204') && decodedOptionName.toLowerCase().includes('209'))
    ) {
      return <TK204AnalysisPage plantId={id} />;
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

    // ── ACL 300# → dedicated shift-basis module ──
    if (
      decodedOptionName.toLowerCase() === 'acl 300#' ||
      decodedOptionName.toLowerCase() === 'acl 300' ||
      decodedOptionName.toLowerCase() === 'acl300' ||
      decodedOptionName.toLowerCase() === 'acl-300' ||
      decodedOptionName.toLowerCase() === 'acl-300#' ||
      decodedOptionName.toLowerCase() === 'acl 300 mesh' ||
      decodedOptionName.toLowerCase() === 'acl 300mesh'
    ) {
      return <ACL300AnalysisPage plantId={id} />;
    }

    // ── Raw Salt → dedicated module ──
    if (
      decodedOptionName.toLowerCase() === 'raw salt' ||
      decodedOptionName.toLowerCase() === 'rawsalt' ||
      decodedOptionName.toLowerCase() === 'raw-salt'
    ) {
      return <RawSaltAnalysisPage plantId={id} />;
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

    // ── CaCl2 (ACL Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'cacl2' ||
      decodedOptionName.toLowerCase() === 'cacl 2' ||
      decodedOptionName.toLowerCase() === 'cacl-2' ||
      decodedOptionName.toLowerCase() === 'cacl_2' ||
      decodedOptionName.toLowerCase() === 'cacl2 analysis' ||
      decodedOptionName.toLowerCase() === 'cacl2-analysis'
    ) {
      return <CaCl2AnalysisPage plantId={id || 'acl'} />;
    }

    // ── TK 401 (SA Plant - New: SHIFT | FNH3 | CNH3 | TCl | CO2 | Fe | TCaO) ──
    if (
      decodedOptionName.toLowerCase() === 'tk 401' ||
      decodedOptionName.toLowerCase() === 'tk401'
    ) {
      return <TK401SAAnalysisPage plantId={id || 'sa'} />;
    }

    // ── TK 405 (SA Plant - New: SHIFT | FNH3 | CNH3 | TCl | NaCl | Fe | TCaO) ──
    if (
      decodedOptionName.toLowerCase() === 'tk 405' ||
      decodedOptionName.toLowerCase() === 'tk405'
    ) {
      return <TK405SAAnalysisPage plantId={id || 'sa'} />;
    }

    // ── TK 414 TSC TANK (SA Plant) ──
    if (
      decodedOptionName.toLowerCase() === 'tk 414 tsc tank' ||
      decodedOptionName.toLowerCase() === 'tk414 tsc tank' ||
      decodedOptionName.toLowerCase() === 'tk-414-tsc-tank' ||
      decodedOptionName.toLowerCase().includes('tk 414 tsc') ||
      decodedOptionName.toLowerCase().includes('tk414 tsc') ||
      decodedOptionName.toLowerCase() === 'tk 414' ||
      decodedOptionName.toLowerCase() === 'tk414' ||
      decodedOptionName.toLowerCase() === 'tk-414'
    ) {
      return <TK414TSCTankAnalysisPage plantId={id || 'sa'} />;
    }

    // ── P413 WSC TANK (SA Plant) ──
    if (
      decodedOptionName.toLowerCase() === 'p413 wsc tank' ||
      decodedOptionName.toLowerCase() === 'p413wsc tank' ||
      decodedOptionName.toLowerCase() === 'p413-wsc-tank' ||
      decodedOptionName.toLowerCase().includes('p413 wsc') ||
      decodedOptionName.toLowerCase().includes('p413wsc') ||
      decodedOptionName.toLowerCase() === 'p413' ||
      decodedOptionName.toLowerCase() === 'p 413' ||
      decodedOptionName.toLowerCase() === 'p-413'
    ) {
      return <P413WSCTankAnalysisPage plantId={id || 'sa'} />;
    }

    // ── TK 419 SC TANK (SA Plant) ──
    if (
      decodedOptionName.toLowerCase() === 'tk 419 sc tank' ||
      decodedOptionName.toLowerCase() === 'tk419 sc tank' ||
      decodedOptionName.toLowerCase() === 'tk-419-sc-tank' ||
      decodedOptionName.toLowerCase().includes('tk 419 sc') ||
      decodedOptionName.toLowerCase().includes('tk419 sc') ||
      decodedOptionName.toLowerCase() === 'tk 419' ||
      decodedOptionName.toLowerCase() === 'tk419' ||
      decodedOptionName.toLowerCase() === 'tk-419'
    ) {
      return <TK419SCTankAnalysisPage plantId={id || 'sa'} />;
    }

    // ── P417 / P417-1 (SA Plant) ──
    if (
      decodedOptionName.toLowerCase() === 'p417-1' ||
      decodedOptionName.toLowerCase() === 'p417 1' ||
      decodedOptionName.toLowerCase() === 'p4171' ||
      decodedOptionName.toLowerCase() === 'p417' ||
      decodedOptionName.toLowerCase() === 'p 417' ||
      decodedOptionName.toLowerCase() === 'p-417'
    ) {
      return <P4171AnalysisPage plantId={id || 'sa'} />;
    }

    // ── P417-2 (SA Plant) ──
    if (
      decodedOptionName.toLowerCase() === 'p417-2' ||
      decodedOptionName.toLowerCase() === 'p417 2' ||
      decodedOptionName.toLowerCase() === 'p4172'
    ) {
      return <P4172AnalysisPage plantId={id || 'sa'} />;
    }

    // ── P417-3 (SA Plant) ──
    if (
      decodedOptionName.toLowerCase() === 'p417-3' ||
      decodedOptionName.toLowerCase() === 'p417 3' ||
      decodedOptionName.toLowerCase() === 'p4173'
    ) {
      return <P4173AnalysisPage plantId={id || 'sa'} />;
    }

    // ── T 401 (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 't 401' ||
      decodedOptionName.toLowerCase() === 't401'
    ) {
      return <T401AnalysisPage plantId={id || 'sa'} />;
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

    // ── LSA Bagging (SA Plant) → dedicated chemical & hourly analysis module ──
    if (
      decodedOptionName.toLowerCase() === 'lsa bagging' ||
      decodedOptionName.toLowerCase() === 'lsa-bagging' ||
      decodedOptionName.toLowerCase() === 'lsa bagging analysis'
    ) {
      return <LSABaggingAnalysisPage plantId={id || 'sa'} />;
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
      return <E501T501AnalysisPage plantId={id || 'sa'} optionName={decodedOptionName} />;
    }

    // ── Gas Conc. (SA Plant) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'gas conc' ||
      decodedOptionName.toLowerCase() === 'gas conc.' ||
      decodedOptionName.toLowerCase() === 'gas concentration' ||
      decodedOptionName.toLowerCase() === 'gas-conc' ||
      decodedOptionName.toLowerCase().includes('gas conc')
    ) {
      return <GasConcAnalysisPage plantId={id || 'sa'} />;
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

    // ── BL1204/BL1203 Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'bl1204/bl1203' ||
      decodedOptionName.toLowerCase() === 'bl1204 / bl1203' ||
      decodedOptionName.toLowerCase() === 'bl1204-bl1203' ||
      decodedOptionName.toLowerCase() === 'bl1204' ||
      decodedOptionName.toLowerCase() === 'bl1203' ||
      (decodedOptionName.toLowerCase().includes('1204') && decodedOptionName.toLowerCase().includes('1203'))
    ) {
      return <BL1204BL1203AnalysisPage plantId={id || 'co2'} />;
    }

    // ── Absorber Inlet Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'absorber inlet' ||
      decodedOptionName.toLowerCase() === 'absorber-inlet' ||
      decodedOptionName.toLowerCase() === 'absorberinlet' ||
      decodedOptionName.toLowerCase() === 'absorber'
    ) {
      return <AbsorberInletAnalysisPage plantId={id || 'co2'} />;
    }

    // ── Outlet Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'outlet' ||
      decodedOptionName.toLowerCase() === 'outlet analysis' ||
      decodedOptionName.toLowerCase() === 'outlet-analysis'
    ) {
      return <OutletAnalysisPage plantId={id || 'co2'} />;
    }

    // ── LEAN Weekly Analysis (CO2 Plant ONLY - Last Option) ──
    if (
      decodedOptionName === 'LEAN' ||
      decodedOptionName.toLowerCase() === 'lean (week)' ||
      decodedOptionName.toLowerCase() === 'lean (weekly)' ||
      decodedOptionName.toLowerCase() === 'lean weekly' ||
      decodedOptionName.toLowerCase() === 'lean-weekly' ||
      decodedOptionName.toLowerCase() === 'lean weekly analysis' ||
      decodedOptionName.toLowerCase() === 'lean ppm'
    ) {
      return <LeanWeeklyAnalysisPage plantId={id || 'co2'} />;
    }

    // ── Lean Analysis (CO2 Plant ONLY - Shift / Day) ──
    if (
      decodedOptionName.toLowerCase() === 'lean' ||
      decodedOptionName.toLowerCase() === 'lean analysis' ||
      decodedOptionName.toLowerCase() === 'lean-analysis'
    ) {
      return <LeanAnalysisPage plantId={id || 'co2'} />;
    }

    // ── Rich Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'rich' ||
      decodedOptionName.toLowerCase() === 'rich analysis' ||
      decodedOptionName.toLowerCase() === 'rich-analysis'
    ) {
      return <RichAnalysisPage plantId={id || 'co2'} />;
    }

    // ── Washwater Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'washwater' ||
      decodedOptionName.toLowerCase() === 'wash water' ||
      decodedOptionName.toLowerCase() === 'wash-water' ||
      decodedOptionName.toLowerCase() === 'washwater analysis'
    ) {
      return <WashwaterAnalysisPage plantId={id || 'co2'} />;
    }

    // ── P1256 Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'p1256' ||
      decodedOptionName.toLowerCase() === 'p-1256' ||
      decodedOptionName.toLowerCase() === 'p 1256' ||
      decodedOptionName.toLowerCase() === 'p1256 cyclone' ||
      decodedOptionName.toLowerCase().includes('p1256')
    ) {
      return <P1256AnalysisPage plantId={id || 'co2'} />;
    }

    // ── Reflux Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'reflux' ||
      decodedOptionName.toLowerCase() === 'reflux analysis' ||
      decodedOptionName.toLowerCase() === 'reflux-analysis' ||
      decodedOptionName.toLowerCase().includes('reflux')
    ) {
      return <RefluxAnalysisPage plantId={id || 'co2'} />;
    }

    // ── TK1251 Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk1251' ||
      decodedOptionName.toLowerCase() === 'tk 1251' ||
      decodedOptionName.toLowerCase() === 'tk-1251' ||
      decodedOptionName.toLowerCase() === 'tk1251 analysis' ||
      decodedOptionName.toLowerCase().includes('tk1251') ||
      decodedOptionName.toLowerCase().includes('tk-1251')
    ) {
      return <TK1251AnalysisPage plantId={id || 'co2'} />;
    }

    // ── TK1252 Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'tk1252' ||
      decodedOptionName.toLowerCase() === 'tk 1252' ||
      decodedOptionName.toLowerCase() === 'tk-1252' ||
      decodedOptionName.toLowerCase() === 'tk1252 analysis' ||
      decodedOptionName.toLowerCase().includes('tk1252') ||
      decodedOptionName.toLowerCase().includes('tk-1252')
    ) {
      return <TK1252AnalysisPage plantId={id || 'co2'} />;
    }

    // ── DCC DRAIN LIQ Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'dcc drain liq' ||
      decodedOptionName.toLowerCase() === 'dcc-drain-liq' ||
      decodedOptionName.toLowerCase() === 'dcc drain liq analysis' ||
      decodedOptionName.toLowerCase().includes('dcc drain') ||
      decodedOptionName.toLowerCase().includes('dcc-drain') ||
      decodedOptionName.toLowerCase() === 'dcc'
    ) {
      return <DCCDrainLiqAnalysisPage plantId={id || 'co2'} />;
    }

    // ── SOX DRAIN LIQ Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'sox drain liq' ||
      decodedOptionName.toLowerCase() === 'sox-drain-liq' ||
      decodedOptionName.toLowerCase() === 'sox drain liq analysis' ||
      decodedOptionName.toLowerCase().includes('sox drain') ||
      decodedOptionName.toLowerCase().includes('sox-drain') ||
      decodedOptionName.toLowerCase() === 'sox'
    ) {
      return <SOXDrainLiqAnalysisPage plantId={id || 'co2'} />;
    }

    // ── ABSORBER DRAIN LIQ Analysis (CO2 Plant ONLY) → dedicated full-featured module ──
    if (
      decodedOptionName.toLowerCase() === 'absorber drain liq' ||
      decodedOptionName.toLowerCase() === 'absorber-drain-liq' ||
      decodedOptionName.toLowerCase() === 'absorber drain liq analysis' ||
      decodedOptionName.toLowerCase().includes('absorber drain') ||
      decodedOptionName.toLowerCase().includes('absorber-drain')
    ) {
      return <AbsorberDrainLiqAnalysisPage plantId={id || 'co2'} />;
    }

    // ── All other options → generic empty placeholder ──
    return (
      <div className="space-y-3.5 animate-fadeIn">
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
    <div className="space-y-3.5 animate-fadeIn">
      {/* Header bar with Plant Name and Reports button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          {user?.role !== 'user' && (
            <button
              onClick={() => navigate(basePath)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
              title="Back to Plants"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
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
          {/* Reports button for all plants */}
          <button
            id={`btn-${plantKey}-header-reports`}
            onClick={() => {
              if (plantKey.includes('acl')) {
                handleOptionClick('Reports');
              } else {
                navigate(`${basePath}/reports`);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded-lg transition shadow-xs cursor-pointer"
            title={`${plant.title} Reports`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Reports</span>
          </button>

          {/* Graph button */}
          <button
            id={`btn-${plantKey}-header-graph`}
            onClick={() => handleOptionClick('Graph')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 rounded-lg transition shadow-xs cursor-pointer"
            title={`${plant.title} Quality Limit & Trend Graphs`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Graph</span>
          </button>

          {user?.role !== 'user' && (
            <button
              onClick={() => navigate(basePath)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Plants</span>
            </button>
          )}
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
          {user?.role !== 'user' && (
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
          )}
        </div>
      )}
    </div>
  );
};

export default PlantAnalysisPage;
