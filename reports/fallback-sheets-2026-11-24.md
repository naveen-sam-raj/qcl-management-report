# Root Cause Analysis: Fallback Worksheets and Cell Rendering Mechanics

**Date**: 2026-11-24  
**Scope**: Code audit of `server/services/genericPlantReportService.js`, `server/routes/reportRoutes.js`, and `server/config/analysisLabels.js`.  
**Target Incidents from `trace-range.js`**:
1. **ACL (Oct 2026) "ACL Product Analysis"**: DB docs on `2026-10-10` (2 docs), `10-13`, `10-29` → Master sheet is fallback with 0 real data dates.
2. **SA (Oct 2026) "LSA Bagging Analysis"**: DB doc on `2026-10-21` → Master sheet is fallback with 0 real data dates.
3. **ACL "TK 204 Analysis"**: 8 snapshots collected across October, but only 7 real data dates recorded in the master sheet.

---

## 1. What Makes an Analysis Sheet "Fallback" in the Route?

In `server/routes/reportRoutes.js:284-309`, the consolidation algorithm inspects the very first worksheet snapshot of each analysis:

```javascript
// [VERIFIED: server/routes/reportRoutes.js:291-309]
const r3c1Val = firstSheet.getCell(3, 1).value;
const isSingleBlock = String(r3c1Val || '').trim() === 'SHIFT / SAMPLE / TIME';
const hasSubFirst = String(firstSheet.getCell(4, 1).value || '').trim() === 'Unit & Range';

// ─── 7. Layout Consistency Check ───
let layoutMismatch = false;
if (isSingleBlock) {
  for (let i = 1; i < snapshots.length; i++) {
    const sSheet = snapshots[i].sheet;
    const sR3C1 = String(sSheet.getCell(3, 1).value || '').trim();
    const sHasSub = String(sSheet.getCell(4, 1).value || '').trim() === 'Unit & Range';
    if (sR3C1 !== 'SHIFT / SAMPLE / TIME' || sHasSub !== hasSubFirst) {
      layoutMismatch = true;
      break;
    }
  }
}

if (isSingleBlock && !layoutMismatch) {
  // Single-Block Master Table Generation
} else {
  // ─── 4 / 7. Dual-Block / Unrecognised Layout Fallback ───
  fallbackAnalyses.push(analysisName);
  // Direct Sheet-by-Sheet Vertical Stacking
}
```

### The Exact Trigger Conditions for Fallback:
1. **Condition 1 (Non-Single-Block First Snapshot)**: If `firstSheet.getCell(3, 1).value` is NOT `'SHIFT / SAMPLE / TIME'`. This happens whenever the daily report service renders a **section title** on row 3 (e.g. `'CHEMICAL & PHYSICAL PARAMETERS'`, `'SHIFT ANALYSIS'`, `'DAY ROUTINE'`, or `'UNIT <X>'`) or renders the empty state (`'No data values recorded for this analysis.'`).
2. **Condition 2 (Layout Mismatch Across Dates)**: Even if `firstSheet` is single-block, if any subsequent date's snapshot has a different row 3 header or a subheader discrepancy (`sHasSub !== hasSubFirst`), `layoutMismatch` is set to `true` and the entire analysis drops into Fallback.

---

## 2. Rendering Patterns in `genericPlantReportService.js`

In `renderAnalysisSheet` ([VERIFIED: server/services/genericPlantReportService.js:1541-2201]), the data payload is evaluated against sequential pattern detectors:

### Pattern 1: Chemical Specs & BSS Sieves (`ACL Product Analysis`)
- **Detector** [VERIFIED: server/services/genericPlantReportService.js:1542]:
  ```javascript
  if (data.chemical && typeof data.chemical === 'object' && data.bss && typeof data.bss === 'object')
  ```
- **Rendering**: Sets `isDualBlock = true`. Calls `renderTableBlock` with `sectionTitle = 'CHEMICAL & PHYSICAL PARAMETERS'`.
- **Row Placement**: Line 1361 writes `secRow.getCell(1).value = sectionTitle;` at row 3. Row 4 gets `'SHIFT / SAMPLE / TIME'`.
- **Fallback Consequence**: Because row 3 cell 1 is `'CHEMICAL & PHYSICAL PARAMETERS'` instead of `'SHIFT / SAMPLE / TIME'`, `isSingleBlock` evaluates to **`false`**.

### Pattern 1B: Shift Analysis & Hourly Readings (`LSA Bagging Analysis`)
- **Detector** [VERIFIED: server/services/genericPlantReportService.js:1603-1607]:
  ```javascript
  else if (
    data.shiftAnalysis &&
    typeof data.shiftAnalysis === 'object' &&
    (Array.isArray(data.hourlyReadings) || Array.isArray(data.hourly))
  )
  ```
- **Rendering**: Sets `isDualBlock = true`. Calls `renderTableBlock` with `sectionTitle = 'SHIFT ANALYSIS'`.
- **Row Placement**: Row 3 cell 1 gets `'SHIFT ANALYSIS'`. Row 4 gets `'SHIFT / SAMPLE / TIME'`.
- **Fallback Consequence**: Row 3 cell 1 is `'SHIFT ANALYSIS'`. `isSingleBlock` evaluates to **`false`**, forcing Fallback.

### Pattern 1C: Nested Unit Towers (`T 401 Analysis`)
- **Detector** [VERIFIED: server/services/genericPlantReportService.js:1699-1706]:
  ```javascript
  else if (
    (data.units || (!data.units && data.towers)) &&
    typeof (data.units || data.towers) === 'object' &&
    !Array.isArray(data.units || data.towers) &&
    Object.values(data.units || data.towers).some(...)
  )
  ```
- **Rendering**: Sets `isDualBlock = true`. Calls `renderTableBlock` with `sectionTitle = ub.unitTitle` (`'UNIT ' + uk.toUpperCase()`). Row 3 cell 1 gets the unit title. `isSingleBlock` evaluates to **`false`**.

### Pattern 2: Readings Array (`Sewer Water`, `BFW`, `DM Water`, `CaCl2`, `Cooling Water`)
- **Detector** [VERIFIED: server/services/genericPlantReportService.js:1791]:
  ```javascript
  else if (Array.isArray(data.readings) && data.readings.length > 0)
  ```
- **Rendering**: Calls `renderTableBlock` with `sectionTitle = null`. Row 3 gets `'SHIFT / SAMPLE / TIME'`. Evaluates to Single-Block.

### Pattern 4: Flat Parameters (`Raw Salt`)
- **Detector** [VERIFIED: server/services/genericPlantReportService.js:1909]:
  ```javascript
  else if (data.parameters && typeof data.parameters === 'object')
  ```
- **Rendering**: Calls `renderTableBlock` with `sectionTitle = null`. Row 3 gets `'SHIFT / SAMPLE / TIME'`. Evaluates to Single-Block.

### Pattern 3: Generalized Keyed Rows (`TK 204`, `TK 203`, `Brine`, `Lean Analysis`)
- **Detector** [VERIFIED: server/services/genericPlantReportService.js:1950-2090]:
  ```javascript
  else {
    const rowContainer = findRowContainer(data);
    if (rowContainer && typeof rowContainer === 'object' && Object.keys(rowContainer).length > 0) {
      const rowKeys = Object.keys(rowContainer);
      const hasDay = rowKeys.some((k) => k.toLowerCase() === 'day');
      const hasShift = rowKeys.some((k) => ['shift1', 'shift2', 'shift3', 's1', 's2', 's3'].includes(k.toLowerCase()));
      const isLeanShiftDay = hasDay && hasShift;
  ```
- **Subcase 3A (`isLeanShiftDay`)**: Sets `isDualBlock = true`. Section title `'SHIFT ANALYSIS'` is rendered at row 3. Evaluates to Fallback.
- **Subcase 3B (Standard Keyed Rows - `TK 204`)**: `sectionTitle = null`. Row 3 gets `'SHIFT / SAMPLE / TIME'`. Evaluates to Single-Block.

### Pattern 5 & Unmatched Fallback:
- **Flat dictionary fallback** [VERIFIED: server/services/genericPlantReportService.js:2148]: `flatKeys = Object.keys(data).filter(...)`. Single block.
- **Empty data state** [VERIFIED: server/services/genericPlantReportService.js:2186-2200]:
  ```javascript
  emptyRow.getCell(1).value = 'No data values recorded for this analysis.';
  ```
  Row 3 gets `'No data values recorded for this analysis.'`. Evaluates to Fallback.

---

## 3. Detailed Root Cause for Each Target Incident

### Incident A: ACL "ACL Product Analysis" (Fallback, 0 Real Data Dates in `trace-range.js`)
1. **Why it is Fallback**:
   - `ACL Product Analysis` renders via Pattern 1 (`data.chemical` and `data.bss`).
   - Line 1573 calls `renderTableBlock` with `sectionTitle = 'CHEMICAL & PHYSICAL PARAMETERS'`.
   - Cell (3, 1) receives `'CHEMICAL & PHYSICAL PARAMETERS'`.
   - In `reportRoutes.js:292`, `r3c1Val === 'SHIFT / SAMPLE / TIME'` evaluates to `false`. Fallback is triggered.
2. **Why `trace-range.js` Reported 0 Real Data Dates**:
   - In Fallback mode ([VERIFIED: server/routes/reportRoutes.js:581-591]), worksheets are stacked directly. The daily sheet's layout is retained, so Column 1 contains **row labels** (`Product Specifications`, `Mesh Analysis`), and the date only exists inside the merged title banner on Row 1 (`ACL PLANT — ACL PRODUCT ANALYSIS | DATE: 2026-10-10`).
   - `trace-range.js:586` checked: `typeof col1Val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(col1Val.trim())`.
   - Because Column 1 does not contain raw date strings in Fallback sheets, the script's cell counter found 0 rows with dates in Column 1.
3. **Alternative Document Shape Cause (POSSIBLE pending `peek4.js`)**:
   - If the DB documents on `2026-10-10`, `10-13`, or `10-29` stored their data under `data.rows` or `data.parameters` instead of `{ chemical: {...}, bss: {...} }`, Pattern 1 failed to match, falling through to line 2198 (`'No data values recorded for this analysis.'`).

---

### Incident B: SA "LSA Bagging Analysis" (Fallback, 0 Real Data Dates in `trace-range.js`)
1. **Why it is Fallback**:
   - `LSA Bagging Analysis` renders via Pattern 1B (`data.shiftAnalysis` and `data.hourlyReadings` / `data.hourly`).
   - Line 1672 calls `renderTableBlock` with `sectionTitle = 'SHIFT ANALYSIS'`.
   - Cell (3, 1) receives `'SHIFT ANALYSIS'`.
   - In `reportRoutes.js:292`, `r3c1Val === 'SHIFT / SAMPLE / TIME'` evaluates to `false`. Fallback is triggered.
2. **Why `trace-range.js` Reported 0 Real Data Dates**:
   - For the same reason as Incident A: Fallback vertically stacks the source sheet where Column 1 holds shift names (`I Shift`, `II Shift`, `07:00`) rather than date strings. The date regex check on Column 1 finds 0 dates.
3. **Alternative Document Shape Cause (POSSIBLE pending `peek4.js`)**:
   - If the document on `2026-10-21` lacked either `data.shiftAnalysis` or `data.hourlyReadings`, Pattern 1B failed to match, potentially rendering empty data rows.

---

### Incident C: ACL "TK 204 Analysis" (8 Snapshots, 7 Real Data Dates)
1. **Why it is Single-Block**:
   - `TK 204 Analysis` renders via Pattern 3B (Standard Keyed Rows).
   - In `analysisLabels.js:24-37`, it has row labels `shift1`, `shift2`, `shift3` and parameter columns `fnh3`, `cnh3`, `tcl`, `pcl`.
   - `renderTableBlock` is called with `sectionTitle = null`, so Cell (3, 1) receives `'SHIFT / SAMPLE / TIME'`. `isSingleBlock` evaluates to `true`.
2. **Why 8 Snapshots Yielded Only 7 Real Data Dates**:
   - **Candidate 1 (Duplicate Snapshots on One Date - Strongest)**: If two documents exist in MongoDB for the same date (e.g. separate shift submissions), `analysisSnapshots` collects both sheets. However, in `trace-range.js:577`, `datesWithRealData` is a JavaScript `Set`. Adding the same date twice results in `datesWithRealData.size === 7`.
   - **Candidate 2 (One All-Empty Snapshot)**: If one of the 8 snapshots contained only empty/null values (`'*'`), `hasData` evaluated to `false` for that snapshot, so its date was added to `datesWithTemplateStar` instead of `datesWithRealData`.
   - **Candidate 3 (`findDataEndRow` Early Break)**: If one snapshot lacked a label in Column 1 at `firstDataRow`, `findDataEndRow` returned `firstDataRow - 1`, writing zero rows for that date.

---

## 4. Verification and Diagnostic File Creation

- Created [`server/peek4.js`](file:///d:/qcl-management-report-main/server/peek4.js):
  - Strictly **READ-ONLY** on MongoDB (`col.find().toArray()`).
  - Zero database writes (`insert`, `update`, `delete`, `bulkWrite`, `drop`).
  - `process.env.MONGODB_URI` is never logged or printed.
  - Queries the target documents for `ACL Product Analysis`, `LSA Bagging Analysis`, and all October `TK 204 Analysis` records.
  - Prints document ID, shift, top-level keys, data key names, array lengths, types, and filled/total measurement counts without printing values.
  - The script was **not** run by the assistant.
