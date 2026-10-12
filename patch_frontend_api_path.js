const fs = require('fs');
const path = require('path');

const dir = 'client/src/pages/company';
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (!file.endsWith('.jsx')) return;
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  
  // Find instances of api.get(\`/api/... and replace with api.get(\`/...
  // Or api.get('/api/...
  
  if (content.includes("api.get(`/api/")) {
    content = content.replace(/api\.get\(\`\/api\//g, "api.get(`/");
    fs.writeFileSync(p, content, 'utf8');
    console.log(`Fixed ${file}`);
  } else if (content.includes("api.get('/api/")) {
    content = content.replace(/api\.get\('\/api\//g, "api.get('/");
    fs.writeFileSync(p, content, 'utf8');
    console.log(`Fixed ${file}`);
  }
});

console.log('Done matching API paths');
