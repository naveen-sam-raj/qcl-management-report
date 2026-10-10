const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'client', 'src', 'pages', 'company');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('setData(buildEmptyData());') && !content.includes('!record.shifts && !record.readings && !record.rows && !record.data')) {
    content = content.replace(
      /} else {\s*setData\(buildEmptyData\(\)\);\s*}/g,
      `} else if (Object.keys(record).length > 0 && !record.shifts && !record.readings && !record.rows && !record.data && !record.parameters) {
            setData(record);
          } else {
            setData(buildEmptyData());
          }`
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched fallback in', file);
  }
});
