const fs = require('fs');
const path = require('path');

const dir = 'client/src/pages/company';
const filesToPatch = [
  { name: 'BrineAnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'PureSaltSieveAnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'TK203AnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'TK204AnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'TK209AnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'TK204TK209AnalysisPage.jsx', resetCode: 'setParameters(DEFAULT_PARAMETERS);' },
  { name: 'TK205AnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'TK207AnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'CaCl2AnalysisPage.jsx', resetCode: 'setData(buildEmptyData());' },
  { name: 'RawSaltAnalysisPage.jsx', resetCode: 'setFormData(buildEmptyData());' }
];

filesToPatch.forEach(f => {
  const p = path.join(dir, f.name);
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');

  // Replace "// Leave default" with the actual resetCode
  // Be careful to keep formatting
  const newContent = content.replace(/\/\/\s*Leave default/g, f.resetCode);
  
  if (content !== newContent) {
    fs.writeFileSync(p, newContent, 'utf8');
    console.log('Patched', f.name);
  } else {
    console.log('No change in', f.name);
  }
});
