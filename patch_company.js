const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'server', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('query.company = req.user.company;')) {
    content = content.replace(
      /query\.company = req\.user\.company;/g,
      "query.$or = [{ company: req.user.company }, { company: null }];"
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched', file);
  }
});
