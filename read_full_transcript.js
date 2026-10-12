const fs = require('fs');

const transcriptFullPath = 'C:\\Users\\IFMS3\\.gemini\\antigravity-ide\\brain\\874778d6-03bd-420b-8ae5-eb0a21dd7292\\.system_generated\\logs\\transcript_full.jsonl';
console.log('Exists?', fs.existsSync(transcriptFullPath));

if (fs.existsSync(transcriptFullPath)) {
  const lines = fs.readFileSync(transcriptFullPath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('client/src/routes/AppRoutes.jsx') && l.includes('const AppRoutes = () => {')) {
      console.log('Found full AppRoutes in transcript_full at line', i);
      const obj = JSON.parse(l);
      if (obj.content) {
        fs.writeFileSync('C:\\Users\\IFMS3\\Downloads\\qcl-management-report-main\\full_AppRoutes_raw.txt', obj.content);
        console.log('Wrote full raw AppRoutes, length:', obj.content.length);
        break;
      }
    }
  }
}
