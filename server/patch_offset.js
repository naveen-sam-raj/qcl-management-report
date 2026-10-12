const fs = require('fs');
const path = require('path');

const routesDir = '/home/naveen/Downloads/qcl-management-report-main/server/routes';

// List of offset analysis routes (based on OFFSITE_ANALYSIS_OPTIONS + others)
const offsetRoutes = [
  'bottomAshAnalysisRoutes.js',
  'flyAshAnalysisRoutes.js',
  'dmWaterAnalysisRoutes.js',
  'coolingWaterAnalysisRoutes.js',
  'roWaterAnalysisRoutes.js',
  'fireWaterAnalysisRoutes.js',
  'serviceWaterAnalysisRoutes.js',
  'potableWaterAnalysisRoutes.js',
  'roRejectAnalysisRoutes.js',
  'boilerFeedWaterRoutes.js',
  'bfwAnalysisRoutes.js',
  'vacuumSealWaterRoutes.js',
  'lsaBaggingSieveRoutes.js'
];

for (const file of offsetRoutes) {
  const filePath = path.join(routesDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file}, not found.`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Fix 1: query.company = req.user.company._id || req.user.company;
  const companyRegex = /query\.company = req\.user\.company;/g;
  if (companyRegex.test(content)) {
    content = content.replace(companyRegex, 'query.company = req.user.company._id || req.user.company;');
    changed = true;
  }

  // Fix 2: add plantCode to query
  // Example: const query = { date, analysisType: 'Bottom Ash Analysis' };
  const queryRegex = /const query = \{ date, analysisType: '([^']+)' \};/g;
  if (queryRegex.test(content)) {
    content = content.replace(queryRegex, (match, p1) => {
      return `const query = { date, analysisType: '${p1}', plantCode: plant || 'OFFSET' };`;
    });
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`No changes made to ${file}`);
  }
}
