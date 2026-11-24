const fs = require('fs');
const path = require('path');

// Base directory paths
const COMPANY_DIR = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'company');
const REPORTS_DIR = path.join(__dirname, '..');

// Helper to guarantee safe output file path without overwriting existing files
function getSafePath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;
  const ext = path.extname(basePath);
  const name = basePath.slice(0, -ext.length);
  let counter = 1;
  while (fs.existsSync(`${name}-${counter}${ext}`)) {
    counter++;
  }
  return `${name}-${counter}${ext}`;
}

// Format date YYYY-MM-DD
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Extract top-level uppercase const array/object declarations
function extractTopLevelConsts(lines) {
  const declarations = [];
  const startRegex = /^(?:export\s+)?const\s+([A-Z_0-9]+)\s*=\s*([\[\{])/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(startRegex);
    if (match) {
      const constName = match[1];
      const opener = match[2];
      const closer = opener === '[' ? ']' : '}';

      let depth = 0;
      let endLine = i;
      const declLines = [];

      for (let j = i; j < lines.length; j++) {
        const curLine = lines[j];
        declLines.push(curLine);

        for (let k = 0; k < curLine.length; k++) {
          const ch = curLine[k];
          if (ch === opener) depth++;
          else if (ch === closer) {
            depth--;
            if (depth === 0) {
              endLine = j;
              break;
            }
          }
        }
        if (depth === 0) break;
      }

      declarations.push({
        name: constName,
        startLine: i + 1,
        endLine: endLine + 1,
        sourceText: declLines.join('\n'),
      });

      // Advance outer loop to end of declaration
      i = endLine;
    }
  }

  return declarations.length > 0 ? declarations : 'NOT FOUND';
}

// Extract the first thead block matching lines
function extractTheadLines(lines) {
  let theadStart = -1;
  let theadEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<thead')) {
      theadStart = i;
      break;
    }
  }

  if (theadStart === -1) {
    return 'NOT FOUND';
  }

  for (let i = theadStart; i < lines.length; i++) {
    if (lines[i].includes('</thead>')) {
      theadEnd = i;
      break;
    }
  }

  if (theadEnd === -1) {
    theadEnd = lines.length - 1;
  }

  const matches = [];
  for (let i = theadStart; i <= theadEnd; i++) {
    const line = lines[i];
    const hasThead = line.includes('<thead');
    const hasTrBg = /<tr[^>]*className=[^>]*bg-/.test(line);
    const hasBgGradient = line.includes('bg-gradient');

    if (hasThead || hasTrBg || hasBgGradient) {
      matches.push({
        lineNum: i + 1,
        text: line.trim(),
      });
    }
  }

  return matches.length > 0 ? matches : 'NOT FOUND';
}

// Main execution function
function runScan() {
  if (!fs.existsSync(COMPANY_DIR)) {
    console.error(`Company directory not found: ${COMPANY_DIR}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(COMPANY_DIR);
  const targetFiles = allFiles
    .filter((file) => file.endsWith('AnalysisPage.jsx'))
    .sort();

  console.log(`Found ${targetFiles.length} analysis page files in ${COMPANY_DIR}`);

  const results = [];

  for (const fileName of targetFiles) {
    const filePath = path.join(COMPANY_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;

    // 2. Imports from ../../components/ and ../../utils/
    const importMatches = [];
    // 4. analysisType and unit literals in payload
    const payloadLiterals = [];
    // 6. Date mechanism
    const dateMatches = [];
    // 7. Modals and buttons
    const controlMatches = [];

    const dateRegex = /(LockedDateDisplay|type=["']date["']|getOperatingDateIST|\bCalendar\b)/;
    const controlRegex = /(StatusSaveButton|ConfirmSaveModal|SaveConfirmationModal|EditHistoryModal|RecordStatusBadge|LockedStatusBadge)/;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const lineText = lines[i];

      // Imports
      if (lineText.includes('../../components/') || lineText.includes('../../utils/')) {
        importMatches.push({
          lineNum,
          text: lineText.trim(),
        });
      }

      // Payload literals (analysisType, unit)
      const analysisTypeMatch = lineText.match(/analysisType\s*:\s*['"`]([^'"`]+)['"`]/);
      if (analysisTypeMatch) {
        payloadLiterals.push({
          lineNum,
          field: 'analysisType',
          value: analysisTypeMatch[1],
          text: lineText.trim(),
        });
      }

      const unitMatch = lineText.match(/unit\s*:\s*['"`]([^'"`]+)['"`]/);
      if (unitMatch) {
        payloadLiterals.push({
          lineNum,
          field: 'unit',
          value: unitMatch[1],
          text: lineText.trim(),
        });
      }

      // Date mechanism
      if (dateRegex.test(lineText)) {
        dateMatches.push({
          lineNum,
          text: lineText.trim(),
        });
      }

      // Controls / Modals
      if (controlRegex.test(lineText)) {
        controlMatches.push({
          lineNum,
          text: lineText.trim(),
        });
      }
    }

    // 3. Top-level const array/object declarations
    const constDeclarations = extractTopLevelConsts(lines);

    // 5. thead lines
    const theadLines = extractTheadLines(lines);

    results.push({
      fileName,
      totalLines,
      imports: importMatches.length > 0 ? importMatches : 'NOT FOUND',
      constDeclarations,
      payloadLiterals: payloadLiterals.length > 0 ? payloadLiterals : 'NOT FOUND',
      theadLines,
      dateMechanism: dateMatches.length > 0 ? dateMatches : 'NOT FOUND',
      controlsAndModals: controlMatches.length > 0 ? controlMatches : 'NOT FOUND',
    });
  }

  // Generate output files under reports/
  const today = getTodayString();
  const rawJsonPath = path.join(REPORTS_DIR, `qcl-ui-scan-${today}.json`);
  const rawMdPath = path.join(REPORTS_DIR, `qcl-ui-scan-${today}.md`);

  const jsonOutputPath = getSafePath(rawJsonPath);
  const mdOutputPath = getSafePath(rawMdPath);

  // Write JSON
  fs.writeFileSync(jsonOutputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Saved JSON output: ${jsonOutputPath}`);

  // Build Markdown
  let md = `# QCL Analysis Pages UI Scan\n\n`;
  md += `**Scan Date**: ${today}\n`;
  md += `**Total Analysis Files Scanned**: ${results.length}\n`;
  md += `**Source Directory**: \`client/src/pages/company/*AnalysisPage.jsx\`\n\n`;
  md += `---\n\n`;

  for (const item of results) {
    md += `## ${item.fileName} (${item.totalLines} lines)\n\n`;

    // 1. Imports
    md += `### 1. Imports from \`../../components/\` and \`../../utils/\`\n`;
    if (typeof item.imports === 'string') {
      md += `${item.imports}\n\n`;
    } else {
      md += `\`\`\`javascript\n`;
      for (const imp of item.imports) {
        md += `L${imp.lineNum}: ${imp.text}\n`;
      }
      md += `\`\`\`\n\n`;
    }

    // 2. Top-level const declarations
    md += `### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)\n`;
    if (typeof item.constDeclarations === 'string') {
      md += `${item.constDeclarations}\n\n`;
    } else {
      for (const decl of item.constDeclarations) {
        md += `#### ${decl.name} (Lines ${decl.startLine}-${decl.endLine})\n`;
        md += `\`\`\`javascript\n${decl.sourceText}\n\`\`\`\n\n`;
      }
    }

    // 3. Payload Literals
    md += `### 3. Payload Literals (analysisType, unit)\n`;
    if (typeof item.payloadLiterals === 'string') {
      md += `${item.payloadLiterals}\n\n`;
    } else {
      md += `\`\`\`javascript\n`;
      for (const lit of item.payloadLiterals) {
        md += `L${lit.lineNum} [${lit.field} = '${lit.value}']: ${lit.text}\n`;
      }
      md += `\`\`\`\n\n`;
    }

    // 4. thead block lines
    md += `### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)\n`;
    if (typeof item.theadLines === 'string') {
      md += `${item.theadLines}\n\n`;
    } else {
      md += `\`\`\`jsx\n`;
      for (const th of item.theadLines) {
        md += `L${th.lineNum}: ${th.text}\n`;
      }
      md += `\`\`\`\n\n`;
    }

    // 5. Date Mechanism
    md += `### 5. Date Mechanism Lines\n`;
    if (typeof item.dateMechanism === 'string') {
      md += `${item.dateMechanism}\n\n`;
    } else {
      md += `\`\`\`jsx\n`;
      for (const d of item.dateMechanism) {
        md += `L${d.lineNum}: ${d.text}\n`;
      }
      md += `\`\`\`\n\n`;
    }

    // 6. Controls and Modals
    md += `### 6. Control & Modal Lines\n`;
    if (typeof item.controlsAndModals === 'string') {
      md += `${item.controlsAndModals}\n\n`;
    } else {
      md += `\`\`\`jsx\n`;
      for (const c of item.controlsAndModals) {
        md += `L${c.lineNum}: ${c.text}\n`;
      }
      md += `\`\`\`\n\n`;
    }

    md += `---\n\n`;
  }

  fs.writeFileSync(mdOutputPath, md, 'utf8');
  console.log(`Saved Markdown output: ${mdOutputPath}`);
}

runScan();
