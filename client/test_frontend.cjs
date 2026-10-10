const fs = require('fs');
const file = fs.readFileSync('src/pages/company/ACL300AnalysisPage.jsx', 'utf8');
console.log('API path:', file.match(/api\.get\((['`])(.*?)\1\)/)[2]);
