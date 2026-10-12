const fs = require('fs');
const path = require('path');

const backendDir = 'server/routes';
const backendFiles = [
  'acl300Routes.js',
  'aclProductRoutes.js',
  'brineAnalysisRoutes.js',
  'cacl2AnalysisRoutes.js',
  'cr202AnalysisRoutes.js',
  'cr203AnalysisRoutes.js',
  'pclTclAnalysisRoutes.js',
  'pureSaltAnalysisRoutes.js',
  'pureSaltSieveAnalysisRoutes.js',
  'rawSaltRoutes.js',
  'tk203AnalysisRoutes.js',
  'tk204AnalysisRoutes.js',
  'tk204Tk209Routes.js',
  'tk205AnalysisRoutes.js',
  'tk207AnalysisRoutes.js',
  'tk209AnalysisRoutes.js'
];

backendFiles.forEach(f => {
  const p = path.join(backendDir, f);
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');

  // Regex to find the GET route: router.get('/', ... { ... })
  const getRegex = /router\.get\('\/'(?:,\s*protect)?,\s*async\s*\(\s*req,\s*res\s*\)\s*=>\s*\{[\s\S]*?\n\}\);\s*(?:module\.exports)?/m;
  const match = content.match(getRegex);
  
  if (!match) {
    console.log('GET route not found for', f);
    return;
  }

  const postMatch = content.match(/analysisType:\s*(?:payload\.analysisType\s*\|\|\s*)?['"`]([^'"`]+)['"`]/) || content.match(/analysisType:\s*['"`]([^'"`]+)['"`]/);
  let analysisType = 'Unknown';
  if (postMatch) {
    analysisType = postMatch[1];
  } else if (f === 'tk204Tk209Routes.js') {
    analysisType = 'TK 204 / TK 209 Analysis';
  } else if (f === 'cacl2AnalysisRoutes.js') {
    analysisType = 'CaCl2 Analysis';
  }

  const newGet = `router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { PlantAnalysisRecord } = require('../models');

    if (date) {
      const query = { date, plantCode: 'ACL', analysisType: '${analysisType}' };
      if (req.user && req.user.company) {
        query.company = req.user.company;
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
      
      if (doc && doc.data) {
        return res.status(200).json({
          success: true,
          data: [doc.data]
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('[ACL GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports`;

  content = content.replace(getRegex, newGet);
  fs.writeFileSync(p, content, 'utf8');
  console.log('Patched', f, 'with analysisType:', analysisType);
});
