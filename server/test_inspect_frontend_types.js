const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const clientPagesDir = path.join(projectRoot, 'client', 'src', 'pages', 'company');

const files = fs.readdirSync(clientPagesDir).filter(f => f.endsWith('AnalysisPage.jsx'));

console.log(`Found ${files.length} AnalysisPage components.`);

const analysisCatalog = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(clientPagesDir, file), 'utf8');
  
  // Extract API endpoint
  const apiMatch = content.match(/api\.(get|post)\(['"`]([^'"`]+)['"`]/) || content.match(/fetch\(['"`]([^'"`]+)['"`]/);
  const endpoint = apiMatch ? apiMatch[2] : 'unknown';

  // Check shifts
  const hasShift1 = /shift1|shift 1|shift i|\bI SHIFT\b/i.test(content);
  const hasShift2 = /shift2|shift 2|shift ii|\bII SHIFT\b/i.test(content);
  const hasShift3 = /shift3|shift 3|shift iii|\bIII SHIFT\b/i.test(content);
  const hasShifts = hasShift1 && (hasShift2 || hasShift3);

  // Check timings / times
  const timeRegex = /\b\d{1,2}:\d{2}\b/g;
  const times = [...new Set(content.match(timeRegex) || [])];

  // Check entry structure
  let type = 'neither';
  if (hasShifts && times.length > 3) {
    type = 'both';
  } else if (hasShifts) {
    type = 'shift-based';
  } else if (times.length > 2) {
    type = 'timing-based';
  }

  analysisCatalog.push({
    file,
    endpoint,
    type,
    hasShifts,
    timesCount: times.length,
    sampleTimes: times.slice(0, 5),
  });
}

console.log(JSON.stringify(analysisCatalog, null, 2));
