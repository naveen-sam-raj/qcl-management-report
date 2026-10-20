const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const clientPagesDir = path.join(projectRoot, 'client', 'src', 'pages', 'company');
const routesDir = path.join(projectRoot, 'server', 'routes');

// Map of Plant to analyses
const PLANT_ANALYSES = {
  ACL: [
    { name: 'Pure salt analysis', page: 'PureSaltAnalysisPage.jsx', route: 'pureSaltAnalysisRoutes.js' },
    { name: 'Brine analysis', page: 'BrineAnalysisPage.jsx', route: 'brineAnalysisRoutes.js' },
    { name: 'Pure salt sieve analysis', page: 'PureSaltSieveAnalysisPage.jsx', route: 'pureSaltSieveAnalysisRoutes.js' },
    { name: 'TK 203', page: 'TK203AnalysisPage.jsx', route: 'tk203AnalysisRoutes.js' },
    { name: 'TK 204', page: 'TK204AnalysisPage.jsx', route: 'tk204AnalysisRoutes.js' },
    { name: 'TK 209', page: 'TK209AnalysisPage.jsx', route: 'tk209AnalysisRoutes.js' },
    { name: 'TK 205', page: 'TK205AnalysisPage.jsx', route: 'tk205AnalysisRoutes.js' },
    { name: 'TK 207', page: 'TK207AnalysisPage.jsx', route: 'tk207AnalysisRoutes.js' },
    { name: 'Cr 202', page: 'CR202AnalysisPage.jsx', route: 'cr202AnalysisRoutes.js' },
    { name: 'Cr 203', page: 'CR203AnalysisPage.jsx', route: 'cr203AnalysisRoutes.js' },
    { name: 'PCL/TCL', page: 'PclTclAnalysisPage.jsx', route: 'pclTclAnalysisRoutes.js' },
    { name: 'Cacl2', page: 'CaCl2AnalysisPage.jsx', route: 'cacl2AnalysisRoutes.js' },
    { name: 'ACL Product', page: 'ACLProductAnalysisPage.jsx', route: 'aclProductRoutes.js' },
    { name: 'ACL 300#', page: 'ACL300AnalysisPage.jsx', route: 'acl300Routes.js' },
    { name: 'Raw salt', page: 'RawSaltAnalysisPage.jsx', route: 'rawSaltRoutes.js' },
  ],
  SA: [
    { name: 'TK 401', page: 'TK401SAAnalysisPage.jsx', route: 'saTk401AnalysisRoutes.js' },
    { name: 'TK 405', page: 'TK405SAAnalysisPage.jsx', route: 'saTk405AnalysisRoutes.js' },
    { name: 'TK 414 TSC TANK', page: 'TK414TSCTankAnalysisPage.jsx', route: 'saTk414TscAnalysisRoutes.js' },
    { name: 'P413 WSC TANK', page: 'P413WSCTankAnalysisPage.jsx', route: 'saP413WscAnalysisRoutes.js' },
    { name: 'TK 419 SC TANK', page: 'TK419SCTankAnalysisPage.jsx', route: 'saTk419ScAnalysisRoutes.js' },
    { name: 'P417', page: 'P417AnalysisPage.jsx', route: 'saP4171AnalysisRoutes.js' },
    { name: 'T 401', page: 'T401AnalysisPage.jsx', route: 't401AnalysisRoutes.js' },
    { name: 'Bi carbonate', page: 'BicarbonateAnalysisPage.jsx', route: 'bicarbonateAnalysisRoutes.js' },
    { name: 'Bicarbonate Moisture', page: 'BicarbonateMoistureAnalysisPage.jsx', route: 'bicarbonateMoistureRoutes.js' },
    { name: 'LSA at 500#', page: 'LSA500AnalysisPage.jsx', route: 'lsa500AnalysisRoutes.js' },
    { name: 'LSA', page: 'LSAShiftAnalysisPage.jsx', route: 'lsaAnalysisRoutes.js' },
    { name: 'E 501 / T 501', page: 'E501T501AnalysisPage.jsx', route: 'e501T501Routes.js' },
    { name: 'LSA Bagging', page: 'LSABaggingAnalysisPage.jsx', route: 'lsaBaggingRoutes.js' },
    { name: 'LSA Bagging sieve', page: 'LSABaggingSieveAnalysisPage.jsx', route: 'lsaBaggingSieveRoutes.js' },
    { name: 'Gas Conc', page: 'GasConcAnalysisPage.jsx', route: 'gasConcRoutes.js' },
  ],
  OFFSITE: [
    { name: 'DM water', page: 'DMWaterAnalysisPage.jsx', route: 'dmWaterAnalysisRoutes.js' },
    { name: 'Boiler Feed Water / Super Heated Steam', page: 'BFWAnalysisPage.jsx', route: 'bfwAnalysisRoutes.js' },
    { name: 'Raw Water', page: 'RawWaterAnalysisPage.jsx', route: 'rawWaterAnalysisRoutes.js' },
    { name: 'CBD', page: 'CBDAnalysisPage.jsx', route: 'cbdAnalysisRoutes.js' },
    { name: 'Bottom ash', page: 'BottomAshAnalysisPage.jsx', route: 'bottomAshAnalysisRoutes.js' },
    { name: 'FLY ash', page: 'FlyAshAnalysisPage.jsx', route: 'flyAshAnalysisRoutes.js' },
    { name: 'Distiller waste', page: 'DistillerWasteAnalysisPage.jsx', route: 'distillerWasteAnalysisRoutes.js' },
    { name: 'Vaccum seal water', page: 'VacuumSealWaterAnalysisPage.jsx', route: 'vacuumSealWaterRoutes.js' },
    { name: 'Sewar Water', page: 'SewerWaterAnalysisPage.jsx', route: 'sewerWaterAnalysisRoutes.js' },
    { name: 'cooling water', page: 'CoolingWaterAnalysisPage.jsx', route: 'coolingWaterAnalysisRoutes.js' },
    { name: 'cooling water/200#', page: 'CoolingWaterAnalysisPage.jsx', route: 'coolingWaterAnalysisRoutes.js' },
  ],
  CO2: [
    { name: 'BL1204/BL1203', page: 'BL1204BL1203AnalysisPage.jsx', route: 'bl1204AnalysisRoutes.js' },
    { name: 'Absorber inlet', page: 'AbsorberInletAnalysisPage.jsx', route: 'absorberInletAnalysisRoutes.js' },
    { name: 'Outlet', page: 'OutletAnalysisPage.jsx', route: 'outletAnalysisRoutes.js' },
    { name: 'Lean', page: 'LeanAnalysisPage.jsx', route: 'leanAnalysisRoutes.js' },
    { name: 'Rich', page: 'RichAnalysisPage.jsx', route: 'richAnalysisRoutes.js' },
    { name: 'Washwater', page: 'WashwaterAnalysisPage.jsx', route: 'washwaterAnalysisRoutes.js' },
    { name: 'P1256', page: 'P1256AnalysisPage.jsx', route: 'p1256AnalysisRoutes.js' },
    { name: 'Reflux', page: 'RefluxAnalysisPage.jsx', route: 'refluxAnalysisRoutes.js' },
    { name: 'TK1251', page: 'TK1251AnalysisPage.jsx', route: 'tk1251AnalysisRoutes.js' },
    { name: 'TK1252', page: 'TK1252AnalysisPage.jsx', route: 'tk1252AnalysisRoutes.js' },
    { name: 'DCC DRAIN LIQ', page: 'DCCDrainLiqAnalysisPage.jsx', route: 'dccDrainLiqAnalysisRoutes.js' },
    { name: 'SOX DRAIN LIQ', page: 'SOXDrainLiqAnalysisPage.jsx', route: 'soxDrainLiqAnalysisRoutes.js' },
    { name: 'ABSORBER DRAIN LIQ', page: 'AbsorberDrainLiqAnalysisPage.jsx', route: 'absorberDrainLiqAnalysisRoutes.js' },
    { name: 'LEAN', page: 'LeanWeeklyAnalysisPage.jsx', route: 'leanWeeklyAnalysisRoutes.js' },
  ]
};

console.log('--- Plant Analyses Inventory ---');
for (const [plant, analyses] of Object.entries(PLANT_ANALYSES)) {
  console.log(`\n=== Plant: ${plant} (${analyses.length} analyses) ===`);
  for (const a of analyses) {
    const pageExists = fs.existsSync(path.join(clientPagesDir, a.page));
    const routeExists = fs.existsSync(path.join(routesDir, a.route));
    
    // Check page content
    let entryType = 'Unknown';
    if (pageExists) {
      const pageCode = fs.readFileSync(path.join(clientPagesDir, a.page), 'utf8');
      const hasShifts = /shift1|shift 1|shift i|\bI SHIFT\b/i.test(pageCode) && (/shift2|shift 2|\bII SHIFT\b/i.test(pageCode) || /shift3|shift 3|\bIII SHIFT\b/i.test(pageCode));
      const times = pageCode.match(/\b\d{1,2}:\d{2}\b/g) || [];
      const distinctTimes = [...new Set(times)];
      
      if (hasShifts && distinctTimes.length > 3) {
        entryType = `Shifts (${distinctTimes.length} times)`;
      } else if (hasShifts) {
        entryType = 'Shifts only';
      } else if (distinctTimes.length > 2) {
        entryType = `Timings only (${distinctTimes.length} times)`;
      } else {
        entryType = 'Neither (Daily/Single)';
      }
    }
    console.log(`- ${a.name.padEnd(30)} | Page: ${a.page.padEnd(30)} [${pageExists?'✓':'✗'}] | Route: ${a.route.padEnd(28)} [${routeExists?'✓':'✗'}] | Type: ${entryType}`);
  }
}
