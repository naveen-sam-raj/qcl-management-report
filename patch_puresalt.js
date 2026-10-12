const fs = require('fs');

const p = 'server/routes/pureSaltAnalysisRoutes.js';
let content = fs.readFileSync(p, 'utf8');

// Replace the GET handler
const oldGet = `router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { PlantAnalysisRecord } = require('../models');

    if (date) {
      const query = { date, plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Analysis' };
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
});`;

const newGet = `router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    const { PureSaltAnalysis } = require('../models');

    if (date) {
      const query = { date, plant: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] }, analysisType: 'Pure Salt Analysis' };
      if (req.user && req.user.company) {
        query.company = req.user.company;
      }

      const doc = await PureSaltAnalysis.findOne(query).sort({ createdAt: -1 }).lean();
      
      if (doc) {
        return res.status(200).json({
          success: true,
          data: [doc]
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('[PureSalt GET] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});`;

content = content.replace(oldGet, newGet);
fs.writeFileSync(p, content, 'utf8');
console.log('Fixed PureSaltAnalysisRoute GET');
