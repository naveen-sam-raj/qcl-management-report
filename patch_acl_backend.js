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
  const getRegex = /router\.get\('\/',[\s\S]*?module\.exports/m;
  const match = content.match(getRegex);
  if (!match) return;

  // We want to replace the entire GET route implementation.
  // First, extract the route up to module.exports
  
  // Actually, a simpler way is to replace the GET block if it exists.
  const newGet = `router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const { PlantAnalysisRecord } = require('../models');

    if (date) {
      const query = { date, plantCode: 'ACL' };
      if (req.user && req.user.company) {
        query.company = req.user.company;
      }
      
      // Determine analysisType based on file name or leave it open
      // Actually, since we save with a specific analysisType in the POST route, we should just query by date and plantCode and maybe we can extract the analysisType from the file.
      // But we can just find records for this plant and date, and we'll let the frontend filter, or we find all.
      // Wait, PlantAnalysisRecord has analysisType. We need to match it.
      // Let's parse the POST route to find the analysisType used.
      
      const postMatch = content.match(/analysisType:\\s*(?:req\\.body\\.analysisType\\s*\\|\\|\\s*)?['"\`]+([^'"\`]+)['"\`]+/);
      let analysisType = '';
      if (postMatch) {
        analysisType = postMatch[1];
        query.analysisType = analysisType;
      }

      const doc = await PlantAnalysisRecord.findOne(query).sort({ createdAt: -1 }).lean();
      
      if (doc && doc.data) {
        return res.status(200).json({
          success: true,
          data: [doc.data]
        });
      } else {
        return res.status(200).json({
          success: true,
          data: []
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('GET Error in ${f}:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports`;

  content = content.replace(getRegex, newGet);
  fs.writeFileSync(p, content, 'utf8');
  console.log('Patched', f);
});
