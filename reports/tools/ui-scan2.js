const fs = require('fs');
const path = require('path');

// Base directory paths
const CLIENT_SRC_DIR = path.join(__dirname, '..', '..', 'client', 'src');
const COMPANY_DIR = path.join(CLIENT_SRC_DIR, 'pages', 'company');
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

// Extract full opening tag (handles multi-line and curlies/quotes)
function extractOpeningTags(lines, tagNames) {
  const tagPattern = new RegExp(`^<(${tagNames.join('|')})\\b`);
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (tagPattern.test(trimmed)) {
      let depthCurly = 0;
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let inTemplate = false;
      let endLine = i;
      const tagLines = [];

      for (let j = i; j < lines.length; j++) {
        const curLine = lines[j];
        tagLines.push(curLine);

        let tagClosed = false;
        for (let k = 0; k < curLine.length; k++) {
          const ch = curLine[k];
          const prev = k > 0 ? curLine[k - 1] : '';

          if (ch === "'" && !inDoubleQuote && !inTemplate && prev !== '\\') {
            inSingleQuote = !inSingleQuote;
          } else if (ch === '"' && !inSingleQuote && !inTemplate && prev !== '\\') {
            inDoubleQuote = !inDoubleQuote;
          } else if (ch === '`' && !inSingleQuote && !inDoubleQuote && prev !== '\\') {
            inTemplate = !inTemplate;
          } else if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
            if (ch === '{') depthCurly++;
            else if (ch === '}') depthCurly--;
            else if (ch === '>' && depthCurly === 0) {
              endLine = j;
              tagClosed = true;
              break;
            }
          }
        }
        if (tagClosed) break;
      }

      matches.push({
        startLine: i + 1,
        endLine: endLine + 1,
        text: tagLines.join('\n'),
      });

      i = endLine;
    }
  }

  return matches.length > 0 ? matches : 'NOT FOUND';
}

// Recursive file collector
function getAllFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, extensions));
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// Main scan runner
function runScan2() {
  if (!fs.existsSync(COMPANY_DIR)) {
    console.error(`Company directory not found: ${COMPANY_DIR}`);
    process.exit(1);
  }

  const allCompanyFiles = fs.readdirSync(COMPANY_DIR);
  const analysisFiles = allCompanyFiles
    .filter((f) => f.endsWith('AnalysisPage.jsx'))
    .sort();

  console.log(`Scanning ${analysisFiles.length} analysis page files...`);

  let md = `# QCL UI Scan 2 (Detailed Template & Component Analysis)\n\n`;
  const today = getTodayString();
  md += `**Scan Date**: ${today}\n`;
  md += `**Target Directory**: \`client/src/pages/company/*AnalysisPage.jsx\`\n\n`;
  md += `---\n\n`;

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION 1: Page-by-Page Scan
  // ═════════════════════════════════════════════════════════════════════════════
  md += `# SECTION 1: Analysis Pages Scan\n\n`;

  const TARGET_TAGS = [
    'StatusSaveButton',
    'ConfirmSaveModal',
    'SaveConfirmationModal',
    'RecordStatusBadge',
    'LockedDateDisplay',
  ];

  for (const fileName of analysisFiles) {
    const filePath = path.join(COMPANY_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    md += `## ${fileName} (${lines.length} lines)\n\n`;

    // 1. Lines matching <Breadcrumb, <h1, <h2 (first 3 each)
    const breadcrumbs = [];
    const h1s = [];
    const h2s = [];

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const lineNum = i + 1;
      if (lineText.includes('<Breadcrumb') && breadcrumbs.length < 3) {
        breadcrumbs.push({ lineNum, text: lineText.trim() });
      }
      if (lineText.includes('<h1') && h1s.length < 3) {
        h1s.push({ lineNum, text: lineText.trim() });
      }
      if (lineText.includes('<h2') && h2s.length < 3) {
        h2s.push({ lineNum, text: lineText.trim() });
      }
    }

    md += `### 1. Headings & Breadcrumbs (First 3 each of <Breadcrumb, <h1, <h2)\n`;
    md += `**<Breadcrumb**:\n`;
    if (breadcrumbs.length === 0) md += `NOT FOUND\n`;
    else {
      md += `\`\`\`jsx\n`;
      for (const b of breadcrumbs) md += `L${b.lineNum}: ${b.text}\n`;
      md += `\`\`\`\n`;
    }

    md += `**<h1**:\n`;
    if (h1s.length === 0) md += `NOT FOUND\n`;
    else {
      md += `\`\`\`jsx\n`;
      for (const h of h1s) md += `L${h.lineNum}: ${h.text}\n`;
      md += `\`\`\`\n`;
    }

    md += `**<h2**:\n`;
    if (h2s.length === 0) md += `NOT FOUND\n`;
    else {
      md += `\`\`\`jsx\n`;
      for (const h of h2s) md += `L${h.lineNum}: ${h.text}\n`;
      md += `\`\`\`\n`;
    }
    md += `\n`;

    // 2. First 2 lines containing "rounded-xl border"
    const roundedLines = [];
    for (let i = 0; i < lines.length && roundedLines.length < 2; i++) {
      if (lines[i].includes('rounded-xl border')) {
        roundedLines.push({ lineNum: i + 1, text: lines[i].trim() });
      }
    }
    md += `### 2. First 2 lines containing "rounded-xl border"\n`;
    if (roundedLines.length === 0) md += `NOT FOUND\n\n`;
    else {
      md += `\`\`\`jsx\n`;
      for (const r of roundedLines) md += `L${r.lineNum}: ${r.text}\n`;
      md += `\`\`\`\n\n`;
    }

    // 3. First 5 lines containing "border-l-4"
    const borderL4Lines = [];
    for (let i = 0; i < lines.length && borderL4Lines.length < 5; i++) {
      if (lines[i].includes('border-l-4')) {
        borderL4Lines.push({ lineNum: i + 1, text: lines[i].trim() });
      }
    }
    md += `### 3. First 5 lines containing "border-l-4"\n`;
    if (borderL4Lines.length === 0) md += `NOT FOUND\n\n`;
    else {
      md += `\`\`\`jsx\n`;
      for (const b of borderL4Lines) md += `L${b.lineNum}: ${b.text}\n`;
      md += `\`\`\`\n\n`;
    }

    // 4. Lines matching activeTab|setActiveTab|role="tab"|<Tabs
    const tabRegex = /activeTab|setActiveTab|role="tab"|<Tabs/;
    const tabLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (tabRegex.test(lines[i])) {
        tabLines.push({ lineNum: i + 1, text: lines[i].trim() });
      }
    }
    md += `### 4. Tab mechanism lines (activeTab | setActiveTab | role="tab" | <Tabs)\n`;
    if (tabLines.length === 0) md += `NOT FOUND\n\n`;
    else {
      md += `\`\`\`jsx\n`;
      for (const t of tabLines) md += `L${t.lineNum}: ${t.text}\n`;
      md += `\`\`\`\n\n`;
    }

    // 5. Full opening tag of target components
    const openingTags = extractOpeningTags(lines, TARGET_TAGS);
    md += `### 5. Full Opening Tags of Target Shared Components\n`;
    if (typeof openingTags === 'string') {
      md += `${openingTags}\n\n`;
    } else {
      for (const tag of openingTags) {
        md += `#### Lines ${tag.startLine}-${tag.endLine}\n`;
        md += `\`\`\`jsx\n${tag.text}\n\`\`\`\n\n`;
      }
    }

    md += `---\n\n`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION B
  // ═════════════════════════════════════════════════════════════════════════════
  md += `# SECTION B: Component Definitions, Cross-References & Special Files\n\n`;

  // B.a: Shared helpers and modals export/mention lines
  md += `## B.a: Helper and Modal Definitions and Exports\n\n`;

  const candidateHelpers = [
    'components/common/AnalysisStatusBanner.jsx',
    'components/common/ConfirmSaveModal.jsx',
    'utils/co2AnalysisHelper.jsx',
    'utils/co2AnalysisHelper.js',
    'utils/offsetAnalysisHelper.jsx',
    'utils/offsetAnalysisHelper.js',
  ];

  const mentionRegex = /(export|StatusSaveButton|SaveConfirmationModal|ConfirmSaveModal|RecordStatusBadge|LockedDateDisplay)/;

  for (const rel of candidateHelpers) {
    const full = path.join(CLIENT_SRC_DIR, rel);
    if (!fs.existsSync(full)) continue;

    const fileContent = fs.readFileSync(full, 'utf8');
    const fLines = fileContent.split(/\r?\n/);
    const matches = [];

    for (let i = 0; i < fLines.length; i++) {
      if (mentionRegex.test(fLines[i])) {
        matches.push({ lineNum: i + 1, text: fLines[i].trim() });
      }
    }

    md += `### File: \`client/src/${rel}\` (${fLines.length} lines)\n`;
    if (matches.length === 0) md += `NOT FOUND\n\n`;
    else {
      md += `\`\`\`javascript\n`;
      for (const m of matches) md += `L${m.lineNum}: ${m.text}\n`;
      md += `\`\`\`\n\n`;
    }
  }

  // B.b: Search client/src for specific component strings
  md += `## B.b: Cross-Reference Search in \`client/src\`\n\n`;

  const searchStrings = [
    'TK204TK209AnalysisPage',
    'TK419AnalysisPage',
    'P4172AnalysisPage',
    'P4173AnalysisPage',
    'P417AnalysisPage',
    'SATankShiftAnalysisPage',
  ];

  const allSrcFiles = getAllFiles(CLIENT_SRC_DIR);
  console.log(`Searching across ${allSrcFiles.length} files under client/src...`);

  for (const targetStr of searchStrings) {
    md += `### Matches for "${targetStr}":\n`;
    const occurrences = [];

    for (const filePath of allSrcFiles) {
      const relPath = path.relative(CLIENT_SRC_DIR, filePath).replace(/\\/g, '/');
      const text = fs.readFileSync(filePath, 'utf8');
      if (!text.includes(targetStr)) continue;

      const fLines = text.split(/\r?\n/);
      for (let i = 0; i < fLines.length; i++) {
        if (fLines[i].includes(targetStr)) {
          occurrences.push({
            file: `client/src/${relPath}`,
            lineNum: i + 1,
            text: fLines[i].trim(),
          });
        }
      }
    }

    if (occurrences.length === 0) {
      md += `NOT FOUND\n\n`;
    } else {
      md += `\`\`\`\n`;
      for (const occ of occurrences) {
        md += `${occ.file}:${occ.lineNum}: ${occ.text}\n`;
      }
      md += `\`\`\`\n\n`;
    }
  }

  // B.c: Full contents of P417AnalysisPage.jsx, P4172AnalysisPage.jsx, P4173AnalysisPage.jsx
  md += `## B.c: Full Contents of Target Files\n\n`;

  const specialFiles = [
    'P417AnalysisPage.jsx',
    'P4172AnalysisPage.jsx',
    'P4173AnalysisPage.jsx',
  ];

  for (const sFile of specialFiles) {
    const fullPath = path.join(COMPANY_DIR, sFile);
    md += `### File: \`client/src/pages/company/${sFile}\`\n`;

    if (!fs.existsSync(fullPath)) {
      md += `NOT FOUND\n\n`;
    } else {
      const sContent = fs.readFileSync(fullPath, 'utf8');
      const sTotalLines = sContent.split(/\r?\n/).length;
      md += `Total lines: ${sTotalLines}\n\n`;
      md += `\`\`\`jsx\n${sContent}\n\`\`\`\n\n`;
    }
  }

  // Output file generation under reports/
  const rawMdPath = path.join(REPORTS_DIR, `qcl-ui-scan2-${today}.md`);
  const safeMdPath = getSafePath(rawMdPath);

  fs.writeFileSync(safeMdPath, md, 'utf8');
  console.log(`Saved Output: ${safeMdPath}`);
}

runScan2();
