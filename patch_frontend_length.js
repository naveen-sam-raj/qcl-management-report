const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'client', 'src', 'pages', 'company');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('record.readings.length > 0')) {
    content = content.replace(
      /record\.readings\.length > 0/g,
      "Object.keys(record.readings).length > 0"
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched length bug in', file);
  }
});
