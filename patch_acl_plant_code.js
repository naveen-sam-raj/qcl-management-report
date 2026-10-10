const fs = require('fs');
const path = require('path');

const routesDir = 'server/routes';
const files = [
  'pureSaltAnalysisRoutes.js',
  'brineAnalysisRoutes.js',
  'pureSaltSieveAnalysisRoutes.js',
  'tk203AnalysisRoutes.js',
  'tk204AnalysisRoutes.js',
  'tk209AnalysisRoutes.js',
  'tk205AnalysisRoutes.js',
  'tk207AnalysisRoutes.js',
  'cr202AnalysisRoutes.js',
  'cr203AnalysisRoutes.js',
  'pclTclAnalysisRoutes.js',
  'cacl2AnalysisRoutes.js',
  'aclProductRoutes.js',
  'acl300Routes.js',
  'rawSaltRoutes.js'
];

files.forEach(file => {
  const p = path.join(routesDir, file);
  if (!fs.existsSync(p)) return;
  
  let content = fs.readFileSync(p, 'utf8');
  
  // Replace plantCode: 'ACL' with plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }
  content = content.replace(/plantCode:\s*'ACL'/g, "plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }");
  
  fs.writeFileSync(p, content, 'utf8');
  console.log('Patched', file);
});
