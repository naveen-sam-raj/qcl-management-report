const fs = require('fs');
const path = require('path');

const dir = 'client/src/pages/company';

function ensureUseEffectImport(content) {
  if (content.includes('useEffect')) return content;
  return content.replace(/import React, \{ (.*?) \} from 'react';/, "import React, { $1, useEffect } from 'react';");
}

function injectFetch(file, endpoint, stateSetters, fallbackCode) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');

  content = ensureUseEffectImport(content);

  // Find the insertion point (after dateError state)
  const regex = /(const \[dateError, setDateError\]\s*=\s*useState\(false\);)/;
  
  if (!content.match(regex)) {
    console.log('Could not find insertion point for', file);
    return;
  }

  const setCode = stateSetters.map(s => {
    return `
            if (record.${s.key}) {
              ${s.setter}(record.${s.key});
            } else {
              ${s.setter}(${s.fallback});
            }`;
  }).join('');

  const emptyCode = stateSetters.map(s => `          ${s.setter}(${s.fallback});`).join('\n');

  const useEffectCode = `

  useEffect(() => {
    if (!date) return;
    const fetchExistingData = async () => {
      try {
        const response = await api.get(\`${endpoint}?date=\${date}\`);
        if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
          const record = response.data.data[0];
          if (record) {${setCode}
          } else {
${emptyCode}
          }
        } else {
${emptyCode}
        }
      } catch (err) {
        console.warn('Could not fetch existing data', err);
${emptyCode}
      }
    };
    fetchExistingData();
  }, [date]);
`;

  if (!content.includes('fetchExistingData')) {
    content = content.replace(regex, `$1${useEffectCode}`);
    fs.writeFileSync(p, content, 'utf8');
    console.log('Patched', file);
  } else {
    console.log('Already has fetchExistingData', file);
  }
}

// 1. ACL300AnalysisPage
injectFetch('ACL300AnalysisPage.jsx', '/api/acl-300-analysis', [
  { key: 'shifts', setter: 'setShiftsData', fallback: 'buildInitialShiftData()' }
]);

// 2. ACLProductAnalysisPage
injectFetch('ACLProductAnalysisPage.jsx', '/api/acl-product', [
  { key: 'chemicalData', setter: 'setChemicalData', fallback: 'buildEmptyChemicalData()' },
  { key: 'bssData', setter: 'setBssData', fallback: 'buildEmptyBssData()' }
]);

// 3. PclTclAnalysisPage
injectFetch('PclTclAnalysisPage.jsx', '/api/pcl-tcl-analysis', [
  { key: 'shiftRows', setter: 'setShiftRows', fallback: 'buildEmptyShiftRows()' }
]);

// 4. CR202AnalysisPage
injectFetch('CR202AnalysisPage.jsx', '/api/cr-202-analysis', [
  { key: 'timeRows', setter: 'setTimeRows', fallback: 'buildEmptyTimeRows()' },
  { key: 'fnh3Row', setter: 'setFnh3Row', fallback: 'buildEmptyFnh3Row()' },
  { key: 'pclRow', setter: 'setPclRow', fallback: 'buildEmptyPclRow()' }
]);

// 5. CR203AnalysisPage
injectFetch('CR203AnalysisPage.jsx', '/api/cr-203-analysis', [
  { key: 'timeRows', setter: 'setTimeRows', fallback: 'buildEmptyTimeRows()' },
  { key: 'fnh3Row', setter: 'setFnh3Row', fallback: 'buildEmptyFnh3Row()' },
  { key: 'pclRow', setter: 'setPclRow', fallback: 'buildEmptyPclRow()' }
]);

