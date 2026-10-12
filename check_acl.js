const fs = require('fs');
const path = require('path');

const dir = 'client/src/pages/company';
const files = [
  'PureSaltAnalysisPage.jsx',
  'BrineAnalysisPage.jsx',
  'PureSaltSieveAnalysisPage.jsx',
  'TK203AnalysisPage.jsx',
  'TK204AnalysisPage.jsx',
  'TK209AnalysisPage.jsx',
  'TK204TK209AnalysisPage.jsx',
  'TK205AnalysisPage.jsx',
  'TK207AnalysisPage.jsx',
  'CR202AnalysisPage.jsx',
  'CR203AnalysisPage.jsx',
  'PclTclAnalysisPage.jsx',
  'CaCl2AnalysisPage.jsx',
  'ACLProductAnalysisPage.jsx',
  'ACL300AnalysisPage.jsx',
  'RawSaltAnalysisPage.jsx'
];

files.forEach(f => {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    if (!content.includes('api.get(') && !content.includes('api.get`')) {
      console.log('Missing api.get:', f);
    }
  } else {
    console.log('File not found:', f);
  }
});
