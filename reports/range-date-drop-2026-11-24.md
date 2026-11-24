# Root Cause Analysis: Multi-Date Range Report Date Omission

**Date**: 2026-11-24  
**Target Plant**: SA  
**Target Range**: 2026-10-01 to 2026-10-31  
**Given Fact**: Database has 38 documents across exactly 11 dates (`06, 07, 08, 09, 10, 13, 14, 20, 21, 29, 30`), single company, no plantCode or date format variants. Downloaded range report shows data for only 2-3 dates.  
**Mode**: Strictly READ-ONLY on production code and DB.

---

## 1. Trace of Date and Analysis Processing in `reportRoutes.js`

Every place where a date's data can be skipped, overwritten, masked, or excluded from the master workbook is cataloged below with verbatim quotes and line numbers.

### A. Record Count Check in Date Loop
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:717-733]
```javascript
717:     for (const d of dates) {
718:       const { workbook, recordCount } = await generateGenericPlantReportWorkbook({
719:         plant: normPlant,
720:         date: d,
721:         user: req.user,
722:       });
723: 
724:       if (workbook && recordCount > 0 && Array.isArray(workbook.worksheets) && workbook.worksheets.length > 0) {
725:         for (const srcSheet of workbook.worksheets) {
726:           const name = srcSheet.name;
727:           if (!analysisSnapshots.has(name)) {
728:             analysisSnapshots.set(name, []);
729:           }
730:           analysisSnapshots.get(name).push({ date: d, sheet: srcSheet });
731:         }
732:       }
733:     }
```
- **Behavior**: If `recordCount === 0`, `workbook` is null, or `workbook.worksheets` is empty for date `d`, that date produces zero snapshots and is omitted from `analysisSnapshots`.

---

### B. Snapshot Keying Strictly by Exact Worksheet Name
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:725-731]
```javascript
725:         for (const srcSheet of workbook.worksheets) {
726:           const name = srcSheet.name;
727:           if (!analysisSnapshots.has(name)) {
728:             analysisSnapshots.set(name, []);
729:           }
730:           analysisSnapshots.get(name).push({ date: d, sheet: srcSheet });
731:         }
```
- **Behavior**: `analysisSnapshots` is a JavaScript `Map` keyed strictly by `srcSheet.name`. If the sheet name generated on date A differs from date B (due to casing, whitespace, or name sanitization collisions such as `_1`), the snapshots are placed into different Map buckets and rendered into completely separate worksheets in `masterWorkbook`.

---

### C. Master Sheet Creation and Layout Mismatch Check
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:284-307]
```javascript
284:   for (const [analysisName, snapshots] of analysisSnapshots.entries()) {
285:     if (!snapshots || snapshots.length === 0) continue;
286: 
287:     const firstSnapshot = snapshots[0];
288:     const firstSheet = firstSnapshot.sheet;
289:     const dstSheet = masterWorkbook.addWorksheet(analysisName);
290: 
291:     const r3c1Val = firstSheet.getCell(3, 1).value;
292:     const isSingleBlock = String(r3c1Val || '').trim() === 'SHIFT / SAMPLE / TIME';
293:     const hasSubFirst = String(firstSheet.getCell(4, 1).value || '').trim() === 'Unit & Range';
294: 
295:     // ─── 7. Layout Consistency Check ───
296:     let layoutMismatch = false;
297:     if (isSingleBlock) {
298:       for (let i = 1; i < snapshots.length; i++) {
299:         const sSheet = snapshots[i].sheet;
300:         const sR3C1 = String(sSheet.getCell(3, 1).value || '').trim();
301:         const sHasSub = String(sSheet.getCell(4, 1).value || '').trim() === 'Unit & Range';
302:         if (sR3C1 !== 'SHIFT / SAMPLE / TIME' || sHasSub !== hasSubFirst) {
303:           layoutMismatch = true;
304:           break;
305:         }
306:       }
307:     }
```
- **Behavior**: If `snapshots[0]` has `r3c1Val !== 'SHIFT / SAMPLE / TIME'` (e.g. an empty analysis message or dual-block), or if subsequent snapshots have a mismatch in header/subheader layout, `layoutMismatch` is flagged and execution branches to the Fallback path (lines 560-607).

---

### D. `findDataEndRow` Early Break on Blank Column 1 Cell
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:198-208, 434-436]
```javascript
198: function findDataEndRow(sheet, firstDataRow) {
199:   let scanRow = firstDataRow;
200:   while (scanRow <= sheet.rowCount) {
201:     const val = sheet.getCell(scanRow, 1).value;
202:     if (val === null || val === undefined || String(val).trim() === '') {
203:       break;
204:     }
205:     scanRow++;
206:   }
207:   return scanRow - 1;
208: }
...
434:           const snapDataEnd = findDataEndRow(snapSheet, firstDataRow);
435: 
436:           for (let r = firstDataRow; r <= snapDataEnd; r++) {
```
- **Behavior**: If a snapshot's data rows do not have a text label in column 1 at `firstDataRow` (e.g., if null or empty string), `findDataEndRow` returns `firstDataRow - 1`. The loop `for (let r = firstDataRow; r <= snapDataEnd; r++)` executes 0 times, dropping all measurement rows for that date.
- Furthermore, if `snapshots[0]` has a blank column 1 at `firstDataRow`, `templateRows` is initialized as empty `[]` (lines 407-415).

---

### E. `dateSnapshotMap` Deduplication / Overwrite
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:417-420]
```javascript
417:       const dateSnapshotMap = new Map();
418:       for (const snap of snapshots) {
419:         dateSnapshotMap.set(snap.date, snap);
420:       }
```
- **Behavior**: If `snapshots` contains multiple snapshots for the same calendar date `snap.date`, `dateSnapshotMap.set` overwrites previous entries, retaining only the last snapshot for that date.

---

### F. Sequential Date Loop Emits Template Rows With `*` For Missing Dates
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:424-495]
```javascript
424:       for (const d of dates) {
425:         if (dateSnapshotMap.has(d)) {
...
469:             currentDstRow++;
470:           }
471:         } else {
472:           // No-data date: emit template rows
473:           for (const tpl of templateRows) {
...
489:               cell.value = '*';
490:               applyStyleToCell(cell, NO_DATA_CELL_STYLE);
491:             }
492:             currentDstRow++;
493:           }
494:         }
495:       }
```
- **Behavior**: The loop iterates over all sequential days of the month `[fromDateStr..toDateStr]`. For any day where the analysis was NOT recorded (or absent from `dateSnapshotMap`), it fills template rows with `'*'`. If an analysis only exists on 2-3 dates, the remaining 28-29 dates are filled with `'*'`.

---

### G. Column Key Mismatch Masking Data With `*`
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:458-468]
```javascript
458:               if (snapKeyColMap.has(mCol.key)) {
459:                 const srcColIdx = snapKeyColMap.get(mCol.key);
460:                 const srcCell = srcRow.getCell(srcColIdx);
461:                 dstCell.value = srcCell.value;
462:                 applyStyleToCell(dstCell, cloneStyle(srcCell));
463:                 if (srcCell.note) dstCell.note = srcCell.note;
464:               } else {
465:                 dstCell.value = '*';
466:                 applyStyleToCell(dstCell, NO_DATA_CELL_STYLE);
467:               }
```
- **Behavior**: If a snapshot date has parameter keys that do not match the key format `${label}#${count}` generated by `extractSnapshotColumns` on earlier snapshots, the value is replaced with `'*'`.

---

### H. Dual-Block Fallback Layout Stacking
**File & Lines**: [VERIFIED: server/routes/reportRoutes.js:575-607]
```javascript
575:       let currentDstRow = 1;
576:       for (const snap of snapshots) {
577:         const srcSheet = snap.sheet;
578:         const startRow = currentDstRow;
579:         let maxSrcRow = 0;
...
605:         currentDstRow = startRow + maxSrcRow + 1; // 1 blank row between dates
606:       }
```
- **Behavior**: In fallback mode, each snapshot in `snapshots` is stacked vertically. The sequential calendar loop `for (const d of dates)` is bypassed entirely. Only dates with snapshots appear.

---

## 2. Diagnostic Script Created: `server/trace-range.js`

- **Location**: [`server/trace-range.js`](file:///d:/qcl-management-report-main/server/trace-range.js)
- **Permissions**: Strictly READ-ONLY (no DB writes, no edits to other files, no commits, `process.env.MONGODB_URI` never printed).
- **Functionality**:
  1. Iterates sequential dates `2026-10-01` to `2026-10-31` for Plant `SA` using `{ role: 'super_admin' }`.
  2. For each date: queries `PlantAnalysisRecord.find` for raw count and distinct analysis names, calls `generateGenericPlantReportWorkbook`, and logs counts and sheet names.
  3. Consolidates snapshots using the exact same logic as `reportRoutes.js`.
  4. Scans the resulting `masterWorkbook` to report, per worksheet, which dates have real data vs `'*'`.
  5. Saves output Excel files exclusively under `reports/` with automatic counter incrementing to prevent overwriting.
- **Execution**: The script was NOT run by the assistant. It is awaiting execution by the user (`node server/trace-range.js`).

---

## 3. Candidate Cause Ranking

| Rank | Candidate Cause | Status | Technical Explanation |
| :--- | :--- | :--- | :--- |
| **1** | **Analysis-Specific Date Sparsity (Multi-Sheet Distribution)** | **POSSIBLE (Highest Probability)** | Plant SA contains 10-15 distinct analysis types (e.g., TK 203, TK 204, TK 205, TK 207, TK 209, Brine, CaCl2, CR 202, CR 203, PCL/TCL). The 38 DB documents across 11 dates represent ~3.45 documents per date. If an individual analysis type was only sampled on 2 to 3 dates in October 2026, its dedicated worksheet in the master workbook will only display data for those 2 to 3 dates (with all other dates displaying template rows with `'*'` per [VERIFIED: server/routes/reportRoutes.js:471-494]). |
| **2** | **Worksheet Name Inconsistency / Fragmentation** | **POSSIBLE** | `analysisSnapshots` is keyed strictly by exact `srcSheet.name` [VERIFIED: server/routes/reportRoutes.js:726-731]. If minor differences in `analysisType` string, casing, whitespace, or suffix collision (`_1`) occur across dates, snapshots for the same test are split into separate master worksheets [VERIFIED: server/routes/reportRoutes.js:289], resulting in 2-3 dates per worksheet. |
| **3** | **`findDataEndRow` Premature Break on Blank Label** | **POSSIBLE** | `findDataEndRow` terminates when `sheet.getCell(scanRow, 1).value` is null or empty [VERIFIED: server/routes/reportRoutes.js:198-208]. If column 1 was unpopulated on certain dates, `findDataEndRow` returns `firstDataRow - 1`, causing zero rows to be written for those dates [VERIFIED: server/routes/reportRoutes.js:434-436]. |
| **4** | **Company ID Filtering Mismatch** | **POSSIBLE** | If the range report was downloaded by a non-`super_admin` user whose assigned `company` did not match all 38 documents, `generateGenericPlantReportWorkbook` excluded them [VERIFIED: server/services/genericPlantReportService.js:2281-2287], yielding `recordCount: 0` and dropping the date [VERIFIED: server/routes/reportRoutes.js:724]. |
| **5** | **Legacy Shift Infill Parameter Deletion** | **POSSIBLE** | In multi-record daily merges, `hasInfilledLegacyShift` triggers `delete mergedData.parameters` [VERIFIED: server/services/genericPlantReportService.js:728-730], which could result in empty data objects and unrecognised row layouts. |

*Note on CONFIRMED status*: Per instructions, a cause is classified as CONFIRMED only when verified code combined with the 11-date fact conclusively proves the exact 2-3 date symptom without remaining variables. Until `node server/trace-range.js` is run by the user to reveal the exact distribution of the 38 records across the specific analysis types, Cause 1 is designated the strongest **POSSIBLE** candidate.
