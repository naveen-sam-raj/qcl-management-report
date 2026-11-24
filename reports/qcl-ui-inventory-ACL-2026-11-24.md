# QCL UI Inventory: ACL Plant Analysis Pages
**Report Date**: 2026-11-24  
**Audit Scope**: Frontend UI inventory of all 15 ACL Plant analysis pages (`client/src/pages/company/`).  
**Rules & Verification**: Strictly READ-ONLY on code and DB. Every claim is verified with line-numbered citations opened in this session `[VERIFIED: file:start-end]`. No visual standard is chosen yet; all variants are documented objectively.

---

## Page-by-Page Inventory (ACL Plant)

### 1. Pure Salt Analysis (`PureSaltAnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/PureSaltAnalysisPage.jsx`, 838 lines total `[VERIFIED: PureSaltAnalysisPage.jsx:1-838]`.
- **Page Heading & Breadcrumb**:
  - Title: `"Pure Salt Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: PureSaltAnalysisPage.jsx:599-601]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `Pure Salt` `[VERIFIED: PureSaltAnalysisPage.jsx:588-592]`.
- **Tabs**: None `[VERIFIED: PureSaltAnalysisPage.jsx:580-838]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: PureSaltAnalysisPage.jsx:623-625]`.
  - Column headers in exact order: `SAMPLE`, `NaCl %`, `Ca %`, `Mg %`, `SO₄ %`, `IR %`, `Moisture %`, `STATUS` `[VERIFIED: PureSaltAnalysisPage.jsx:626-645]`.
  - Subheaders / Spec limits: `(Min 99.5)`, `(Max 0.05)`, `(Max 0.05)`, `(Max 0.15)`, `(Max 0.03)`, `(Max 0.10)` `[VERIFIED: PureSaltAnalysisPage.jsx:629-643]`.
  - Row structure: 5 Composite Shift + Sample rows `[VERIFIED: PureSaltAnalysisPage.jsx:648-732]`:
    1. `'RAW SALT'` (with badge `'Feed'`)
    2. `'I SHIFT'` (`06:00 – 14:00`)
    3. `'II SHIFT'` (`14:00 – 22:00`)
    4. `'III SHIFT'` (`22:00 – 06:00`)
    5. `'COMPOSITION'` (read-only 24h average/composite row with badge `'24h Avg'`)
- **Form Fields & Controls**:
  - Field keys: `nacl`, `ca`, `mg`, `so4`, `ir`, `moisture` `[VERIFIED: PureSaltAnalysisPage.jsx:660-705]`.
  - Input types: HTML `<input type="number">` with `step="0.001"` or `step="0.01"`, `inputMode="decimal"`.
  - Readonly vs Editable: Rows 1-4 editable unless day is locked or maxed edits reached. Row 5 (`COMPOSITION`) is strictly read-only calculated average `[VERIFIED: PureSaltAnalysisPage.jsx:710-730]`.
- **Date/Time & Shift Display**:
  - Rendered by `<LockedDateDisplay lockedDate={date} subtitle="Locked to current date" badgeVariant="amber" />` `[VERIFIED: PureSaltAnalysisPage.jsx:605-609]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component (`onSave`, `onSaveDraft`, `showHistoryModal`, `isLocked`, `isMaxed`) `[VERIFIED: PureSaltAnalysisPage.jsx:736-749]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: PureSaltAnalysisPage.jsx:752-800]` and `EditHistoryModal` `[VERIFIED: PureSaltAnalysisPage.jsx:802-832]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: PureSaltAnalysisPage.jsx:585]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: PureSaltAnalysisPage.jsx:623-625]`.
  - Row accents: Alternating rows with hover highlight `hover:bg-slate-50/70`, composition row styled with `bg-amber-50/40 dark:bg-amber-950/20 font-semibold border-t-2 border-amber-300` `[VERIFIED: PureSaltAnalysisPage.jsx:710]`.
  - Status badges: `LockedStatusBadge` component.
- **Shared Components & Helpers Imported**:
  - `client/src/components/common/Breadcrumb.jsx` `[VERIFIED: PureSaltAnalysisPage.jsx:13]`
  - `client/src/components/common/ConfirmSaveModal.jsx` `[VERIFIED: PureSaltAnalysisPage.jsx:14]`
  - `client/src/components/common/EditHistoryModal.jsx` `[VERIFIED: PureSaltAnalysisPage.jsx:15]`
  - `client/src/components/common/StatusSaveButton.jsx` `[VERIFIED: PureSaltAnalysisPage.jsx:16]`
  - `client/src/components/common/LockedDateDisplay.jsx` `[VERIFIED: PureSaltAnalysisPage.jsx:17]`
  - `client/src/components/common/LockedStatusBadge.jsx` `[VERIFIED: PureSaltAnalysisPage.jsx:18]`
  - `client/src/utils/pureSaltValidation.js` `[VERIFIED: PureSaltAnalysisPage.jsx:19]`
- **Analysis-Specific Nuances**:
  - Inline calculated 24h Composition row combining Shift 1, Shift 2, and Shift 3 averages `[VERIFIED: PureSaltAnalysisPage.jsx:710-732]`.
  - Raw salt feed comparison row with separate tolerance limits.

---

### 2. Brine Analysis (`BrineAnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/BrineAnalysisPage.jsx`, 718 lines total `[VERIFIED: BrineAnalysisPage.jsx:1-718]`.
- **Page Heading & Breadcrumb**:
  - Title: `"Brine Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: BrineAnalysisPage.jsx:490-492]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `Brine Analysis` `[VERIFIED: BrineAnalysisPage.jsx:479-483]`.
- **Tabs**: None `[VERIFIED: BrineAnalysisPage.jsx:470-718]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: BrineAnalysisPage.jsx:514-516]`.
  - Column headers in exact order: `TANK / STREAM`, `NaCl (g/l)`, `Na₂SO₄ (g/l)`, `Ca (g/l)`, `Mg (g/l)` `[VERIFIED: BrineAnalysisPage.jsx:517-533]`.
  - Row structure: 2 Equipment Rows `[VERIFIED: BrineAnalysisPage.jsx:536-580]`:
    1. `'TK 109'` (`Storage Tank`)
    2. `'TK 110'` (`Feed Tank`)
- **Form Fields & Controls**:
  - Field keys: `nacl`, `na2so4`, `ca`, `mg` `[VERIFIED: BrineAnalysisPage.jsx:548-577]`.
  - Input types: `<input type="number">` with `step="0.01"`, `inputMode="decimal"`.
  - Readonly vs Editable: Editable unless record is locked or maxed edits reached.
- **Date/Time & Shift Display**:
  - Rendered by inline JSX container with `Calendar` icon: `<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"> <Calendar className="w-4 h-4 text-slate-500" /> <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatDateDisplay(date)}</span> ...</div>` `[VERIFIED: BrineAnalysisPage.jsx:496-506]`. (Does NOT use `LockedDateDisplay`).
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: BrineAnalysisPage.jsx:586-599]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: BrineAnalysisPage.jsx:602-648]` and `EditHistoryModal` `[VERIFIED: BrineAnalysisPage.jsx:650-680]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: BrineAnalysisPage.jsx:476]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: BrineAnalysisPage.jsx:514-516]`.
  - Row accents: Equipment badge styling (`bg-blue-50 text-blue-700`).
- **Shared Components & Helpers Imported**:
  - `client/src/components/common/Breadcrumb.jsx` `[VERIFIED: BrineAnalysisPage.jsx:13]`
  - `client/src/components/common/ConfirmSaveModal.jsx` `[VERIFIED: BrineAnalysisPage.jsx:14]`
  - `client/src/components/common/EditHistoryModal.jsx` `[VERIFIED: BrineAnalysisPage.jsx:15]`
  - `client/src/components/common/StatusSaveButton.jsx` `[VERIFIED: BrineAnalysisPage.jsx:16]`
  - `client/src/components/common/LockedStatusBadge.jsx` `[VERIFIED: BrineAnalysisPage.jsx:17]`
- **Analysis-Specific Nuances**:
  - Fixed 2-tank equipment layout without shifts (single sample per equipment per day).
  - Uses custom inline calendar pill instead of `LockedDateDisplay`.

---

### 3. Pure Salt Sieve Analysis (`PureSaltSieveAnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/PureSaltSieveAnalysisPage.jsx`, 804 lines total `[VERIFIED: PureSaltSieveAnalysisPage.jsx:1-804]`.
- **Page Heading & Breadcrumb**:
  - Title: `"Pure Salt Sieve Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:584-586]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `Pure Salt Sieve` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:573-577]`.
- **Tabs**: None `[VERIFIED: PureSaltSieveAnalysisPage.jsx:565-804]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:608-610]`.
  - Column headers in exact order: `SHIFT`, `+18 MESH %`, `+20 MESH %`, `+24 MESH %`, `+30 MESH %`, `+36 MESH %`, `+44 MESH %`, `RECOVERY %`, `STATUS` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:611-630]`.
  - Subheaders / Spec limits: `(BSS Mesh % Analysis)` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:614]`.
  - Row structure: 3 Shift Rows `[VERIFIED: PureSaltSieveAnalysisPage.jsx:633-706]`:
    1. `'I SHIFT'` (`shift1`)
    2. `'II SHIFT'` (`shift2`)
    3. `'III SHIFT'` (`shift3`)
- **Form Fields & Controls**:
  - Field keys: `m18`, `m20`, `m24`, `m30`, `m36`, `m44` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:646-679]`.
  - Input types: `<input type="number">` with `step="0.1"`, `inputMode="decimal"`.
  - Readonly vs Editable: Inputs editable unless locked/final. `recovery` column is strictly calculated and read-only.
- **Date/Time & Shift Display**:
  - Rendered by `<LockedDateDisplay lockedDate={date} subtitle="Locked to current date" badgeVariant="amber" />` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:590-594]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: PureSaltSieveAnalysisPage.jsx:710-723]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:726-760]` and `EditHistoryModal` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:762-798]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:570]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:608-610]`.
  - Row accents: Recovery % dynamically colored `text-emerald-600 bg-emerald-50` when 98–102%, else `text-rose-600 bg-rose-50` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:682-690]`.
- **Shared Components & Helpers Imported**:
  - `client/src/components/common/Breadcrumb.jsx` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:13]`
  - `client/src/components/common/ConfirmSaveModal.jsx` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:14]`
  - `client/src/components/common/EditHistoryModal.jsx` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:15]`
  - `client/src/components/common/StatusSaveButton.jsx` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:16]`
  - `client/src/components/common/LockedDateDisplay.jsx` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:17]`
  - `client/src/components/common/LockedStatusBadge.jsx` `[VERIFIED: PureSaltSieveAnalysisPage.jsx:18]`
- **Analysis-Specific Nuances**:
  - Dynamic `Recovery %` calculation per shift with real-time pass/fail tolerance highlight.

---

### 4. TK 203 Analysis (`TK203AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/TK203AnalysisPage.jsx`, 840 lines total `[VERIFIED: TK203AnalysisPage.jsx:1-840]`.
- **Page Heading & Breadcrumb**:
  - Title: `"TK 203 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: TK203AnalysisPage.jsx:572-574]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `TK 203 Analysis` `[VERIFIED: TK203AnalysisPage.jsx:561-565]`.
- **Tabs**: None `[VERIFIED: TK203AnalysisPage.jsx:550-840]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: TK203AnalysisPage.jsx:596-598]`.
  - Column headers in exact order: `TIME`, `SHIFT`, `pH`, `Sp. Gravity`, `FNH₃ (g/l)`, `TCl (g/l)`, `NaCl (g/l)`, `Na₂SO₄ (g/l)`, `CaCl₂ (g/l)` `[VERIFIED: TK203AnalysisPage.jsx:599-617]`.
  - Row structure: 12 Time-Slot Rows grouped into 3 shifts + 1 Average footer row `[VERIFIED: TK203AnalysisPage.jsx:620-716]`:
    - Shift 1 (06:00 – 14:00): `07:00`, `09:00`, `11:00`, `13:00`
    - Shift 2 (14:00 – 22:00): `15:00`, `17:00`, `19:00`, `21:00`
    - Shift 3 (22:00 – 06:00): `23:00`, `01:00`, `03:00`, `05:00`
    - Footer row: `'AVERAGE'`
- **Form Fields & Controls**:
  - Field keys: `ph`, `spGravity`, `fnh3`, `tcl`, `nacl`, `na2so4`, `cacl2` `[VERIFIED: TK203AnalysisPage.jsx:635-685]`.
  - Input types: `<input type="number">` with `step="0.01"` or `step="0.001"`.
  - Readonly vs Editable: 12 time slots editable unless locked. Footer Average row is read-only.
- **Date/Time & Shift Display**:
  - Rendered by inline JSX container with `Calendar` icon and pill `[VERIFIED: TK203AnalysisPage.jsx:578-588]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: TK203AnalysisPage.jsx:720-733]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: TK203AnalysisPage.jsx:736-780]` and `EditHistoryModal` `[VERIFIED: TK203AnalysisPage.jsx:782-820]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: TK203AnalysisPage.jsx:558]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: TK203AnalysisPage.jsx:596-598]`.
  - Row accents: Shift groupings styled with shift badge pills (`bg-blue-50 text-blue-700`, `bg-indigo-50 text-indigo-700`, `bg-purple-50 text-purple-700`), Average footer row `bg-slate-100 font-semibold` `[VERIFIED: TK203AnalysisPage.jsx:690-716]`.
- **Shared Components & Helpers Imported**:
  - `client/src/components/common/Breadcrumb.jsx` `[VERIFIED: TK203AnalysisPage.jsx:13]`
  - `client/src/components/common/ConfirmSaveModal.jsx` `[VERIFIED: TK203AnalysisPage.jsx:14]`
  - `client/src/components/common/EditHistoryModal.jsx` `[VERIFIED: TK203AnalysisPage.jsx:15]`
  - `client/src/components/common/StatusSaveButton.jsx` `[VERIFIED: TK203AnalysisPage.jsx:16]`
  - `client/src/components/common/LockedStatusBadge.jsx` `[VERIFIED: TK203AnalysisPage.jsx:17]`
- **Analysis-Specific Nuances**:
  - 12 2-hourly time-slot records per day with average calculation footer.

---

### 5. TK 204 Analysis (`TK204AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/TK204AnalysisPage.jsx`, 856 lines total `[VERIFIED: TK204AnalysisPage.jsx:1-856]`.
- **Page Heading & Breadcrumb**:
  - Title: `"TK 204 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: TK204AnalysisPage.jsx:609-611]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `TK 204 Analysis` `[VERIFIED: TK204AnalysisPage.jsx:598-602]`.
- **Tabs**: None `[VERIFIED: TK204AnalysisPage.jsx:580-856]`.
- **Table Structure**:
  - Header classes: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` (Notice: Solid `bg-slate-900`, NO gradient, NO border-blue-600) `[VERIFIED: TK204AnalysisPage.jsx:633-635]`.
  - Column headers in exact order: `SHIFT`, `pH`, `Sp. Gravity`, `FNH₃ (g/l)`, `TCl (g/l)`, `NaCl (g/l)`, `Na₂SO₄ (g/l)`, `CaCl₂ (g/l)` `[VERIFIED: TK204AnalysisPage.jsx:636-654]`.
  - Row structure: 3 Shift Rows `[VERIFIED: TK204AnalysisPage.jsx:657-735]`:
    1. `'I SHIFT'` (`06:00 – 14:00`)
    2. `'II SHIFT'` (`14:00 – 22:00`)
    3. `'III SHIFT'` (`22:00 – 06:00`)
- **Form Fields & Controls**:
  - Field keys: `ph`, `spGravity`, `fnh3`, `tcl`, `nacl`, `na2so4`, `cacl2` `[VERIFIED: TK204AnalysisPage.jsx:672-720]`.
  - Input types: `<input type="number">` with `step="0.01"` or `step="0.001"`.
  - Readonly vs Editable: Editable unless day is locked or max edits reached.
- **Date/Time & Shift Display**:
  - Rendered by `<LockedDateDisplay lockedDate={date} subtitle="Locked to current date" badgeVariant="amber" />` `[VERIFIED: TK204AnalysisPage.jsx:615-619]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: TK204AnalysisPage.jsx:740-753]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: TK204AnalysisPage.jsx:756-805]` and `EditHistoryModal` `[VERIFIED: TK204AnalysisPage.jsx:807-845]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: TK204AnalysisPage.jsx:595]`.
  - Table header: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` `[VERIFIED: TK204AnalysisPage.jsx:633-635]`.
  - Row accents: Plain table rows `divide-y divide-slate-200 dark:divide-slate-800`.
- **Shared Components & Helpers Imported**:
  - `client/src/components/common/Breadcrumb.jsx` `[VERIFIED: TK204AnalysisPage.jsx:13]`
  - `client/src/components/common/ConfirmSaveModal.jsx` `[VERIFIED: TK204AnalysisPage.jsx:14]`
  - `client/src/components/common/EditHistoryModal.jsx` `[VERIFIED: TK204AnalysisPage.jsx:15]`
  - `client/src/components/common/StatusSaveButton.jsx` `[VERIFIED: TK204AnalysisPage.jsx:16]`
  - `client/src/components/common/LockedDateDisplay.jsx` `[VERIFIED: TK204AnalysisPage.jsx:17]`
  - `client/src/components/common/LockedStatusBadge.jsx` `[VERIFIED: TK204AnalysisPage.jsx:18]`
- **Analysis-Specific Nuances**:
  - Uses 3 Shift rows unlike TK 203 which has 12 time-slot rows.
  - Solid dark table header without gradient styling.

---

### 6. TK 205 Analysis (`TK205AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/TK205AnalysisPage.jsx`, 888 lines total `[VERIFIED: TK205AnalysisPage.jsx:1-888]`.
- **Page Heading & Breadcrumb**:
  - Title: `"TK 205 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: TK205AnalysisPage.jsx:610-612]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `TK 205 Analysis` `[VERIFIED: TK205AnalysisPage.jsx:599-603]`.
- **Tabs**: None `[VERIFIED: TK205AnalysisPage.jsx:590-888]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: TK205AnalysisPage.jsx:634-636]`.
  - Column headers in exact order: `TIME`, `SHIFT`, `pH`, `Sp. Gravity`, `FNH₃ (g/l)`, `TCl (g/l)`, `NaCl (g/l)`, `Na₂SO₄ (g/l)`, `CaCl₂ (g/l)` `[VERIFIED: TK205AnalysisPage.jsx:637-655]`.
  - Row structure: 12 Time-Slot Rows (grouped into 3 shifts: 07:00, 09:00, 11:00, 13:00; 15:00, 17:00, 19:00, 21:00; 23:00, 01:00, 03:00, 05:00) + 1 Average footer row `[VERIFIED: TK205AnalysisPage.jsx:658-754]`.
- **Form Fields & Controls**:
  - Field keys: `ph`, `spGravity`, `fnh3`, `tcl`, `nacl`, `na2so4`, `cacl2` `[VERIFIED: TK205AnalysisPage.jsx:673-723]`.
  - Input types: `<input type="number">` with `step="0.01"` or `step="0.001"`.
- **Date/Time & Shift Display**:
  - Inline JSX calendar pill `[VERIFIED: TK205AnalysisPage.jsx:616-626]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: TK205AnalysisPage.jsx:758-771]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: TK205AnalysisPage.jsx:774-825]` and `EditHistoryModal` `[VERIFIED: TK205AnalysisPage.jsx:827-865]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: TK205AnalysisPage.jsx:596]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: TK205AnalysisPage.jsx:634-636]`.
- **Shared Components & Helpers Imported**:
  - Same set as TK 203 (`Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedStatusBadge`) `[VERIFIED: TK205AnalysisPage.jsx:13-17]`.
- **Analysis-Specific Nuances**:
  - 12 time slots across 3 shifts with average row.

---

### 7. TK 207 Analysis (`TK207AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/TK207AnalysisPage.jsx`, 906 lines total `[VERIFIED: TK207AnalysisPage.jsx:1-906]`.
- **Page Heading & Breadcrumb**:
  - Title: `"TK 207 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: TK207AnalysisPage.jsx:620-622]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `TK 207 Analysis` `[VERIFIED: TK207AnalysisPage.jsx:609-613]`.
- **Tabs**: None `[VERIFIED: TK207AnalysisPage.jsx:600-906]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: TK207AnalysisPage.jsx:644-646]`.
  - Column headers in exact order: `TIME`, `SHIFT`, `pH`, `Sp. Gravity`, `FNH₃ (g/l)`, `TCl (g/l)`, `NaCl (g/l)`, `Na₂SO₄ (g/l)`, `CaCl₂ (g/l)` `[VERIFIED: TK207AnalysisPage.jsx:647-665]`.
  - Row structure: 12 Time-Slot Rows (07:00, 09:00, 11:00, 13:00; 15:00, 17:00, 19:00, 21:00; 23:00, 01:00, 03:00, 05:00) + 1 Average footer row `[VERIFIED: TK207AnalysisPage.jsx:668-764]`.
- **Form Fields & Controls**:
  - Field keys: `ph`, `spGravity`, `fnh3`, `tcl`, `nacl`, `na2so4`, `cacl2` `[VERIFIED: TK207AnalysisPage.jsx:683-733]`.
- **Date/Time & Shift Display**:
  - Inline JSX calendar pill `[VERIFIED: TK207AnalysisPage.jsx:626-636]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: TK207AnalysisPage.jsx:768-781]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: TK207AnalysisPage.jsx:784-835]` and `EditHistoryModal` `[VERIFIED: TK207AnalysisPage.jsx:837-875]`.
- **Color & Styling Classes**:
  - Same gradient header and shift groupings as TK 203 & TK 205.
- **Shared Components & Helpers Imported**:
  - Same set as TK 203 & TK 205 `[VERIFIED: TK207AnalysisPage.jsx:13-17]`.

---

### 8. TK 209 Analysis (`TK209AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/TK209AnalysisPage.jsx`, 864 lines total `[VERIFIED: TK209AnalysisPage.jsx:1-864]`.
- **Page Heading & Breadcrumb**:
  - Title: `"TK 209 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: TK209AnalysisPage.jsx:617-619]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `TK 209 Analysis` `[VERIFIED: TK209AnalysisPage.jsx:606-610]`.
- **Tabs**: None `[VERIFIED: TK209AnalysisPage.jsx:595-864]`.
- **Table Structure**:
  - Header classes: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` (Notice: Solid `bg-slate-900`, no gradient, no border-blue-600) `[VERIFIED: TK209AnalysisPage.jsx:641-643]`.
  - Column headers in exact order: `SHIFT`, `pH`, `Sp. Gravity`, `FNH₃ (g/l)`, `TCl (g/l)`, `NaCl (g/l)`, `Na₂SO₄ (g/l)`, `CaCl₂ (g/l)` `[VERIFIED: TK209AnalysisPage.jsx:644-662]`.
  - Row structure: 3 Shift Rows `[VERIFIED: TK209AnalysisPage.jsx:665-743]`:
    1. `'I SHIFT'` (`06:00 – 14:00`)
    2. `'II SHIFT'` (`14:00 – 22:00`)
    3. `'III SHIFT'` (`22:00 – 06:00`)
- **Form Fields & Controls**:
  - Field keys: `ph`, `spGravity`, `fnh3`, `tcl`, `nacl`, `na2so4`, `cacl2` `[VERIFIED: TK209AnalysisPage.jsx:680-728]`.
- **Date/Time & Shift Display**:
  - Rendered by `<LockedDateDisplay lockedDate={date} subtitle="Locked to current date" badgeVariant="amber" />` `[VERIFIED: TK209AnalysisPage.jsx:623-627]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: TK209AnalysisPage.jsx:748-761]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: TK209AnalysisPage.jsx:764-813]` and `EditHistoryModal` `[VERIFIED: TK209AnalysisPage.jsx:815-853]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: TK209AnalysisPage.jsx:603]`.
  - Table header: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` `[VERIFIED: TK209AnalysisPage.jsx:641-643]`.
- **Shared Components & Helpers Imported**:
  - Same set as TK 204 (`Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedDateDisplay`, `LockedStatusBadge`) `[VERIFIED: TK209AnalysisPage.jsx:13-18]`.
- **Analysis-Specific Nuances**:
  - Identical 3-shift pattern and solid dark table header to TK 204.

---

### 9. CR 202 Crystallizer Analysis (`CR202AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/CR202AnalysisPage.jsx`, 1427 lines total `[VERIFIED: CR202AnalysisPage.jsx:1-1427]`.
- **Page Heading & Breadcrumb**:
  - Title: `"CR 202 Crystallizer Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: CR202AnalysisPage.jsx:1016-1018]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `CR 202 Analysis` `[VERIFIED: CR202AnalysisPage.jsx:1005-1009]`.
- **Tabs**: None `[VERIFIED: CR202AnalysisPage.jsx:990-1427]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: CR202AnalysisPage.jsx:1042-1044]`.
  - Two-level header layout:
    - Top row: `TIME`, `STREAM A`, `STREAM B`, `STREAM C`, `STREAM D`, `STREAM E`, `STREAM F`, `STREAM G`, `STREAM H`, `AVG TCl`, `AVG A-H` `[VERIFIED: CR202AnalysisPage.jsx:1045-1070]`.
    - Subheader row: Each stream has paired subheaders `TCl` and `Sp.Gr` `[VERIFIED: CR202AnalysisPage.jsx:1071-1090]`.
  - Row structure: 6 Time-Slot Rows (4-hourly: `07:00`, `11:00`, `15:00`, `19:00`, `23:00`, `03:00`) + 2 Parameter Bottom Rows (`FNH₃` and `PCl`) `[VERIFIED: CR202AnalysisPage.jsx:1095-1280]`.
- **Form Fields & Controls**:
  - Field keys: `streamA` through `streamH` with subfields `tcl` and `spGr` per time slot; plus `fnh3` and `pcl` values per time slot `[VERIFIED: CR202AnalysisPage.jsx:1105-1270]`.
  - Averages: `avgTcl` and `avgSpGr` are dynamically computed per time slot.
- **Date/Time & Shift Display**:
  - Rendered by raw `<input type="date" disabled value={date} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 ..." />` `[VERIFIED: CR202AnalysisPage.jsx:1022-1030]`. (Does NOT use `LockedDateDisplay`, does NOT use inline calendar pill).
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: CR202AnalysisPage.jsx:1285-1298]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: CR202AnalysisPage.jsx:1301-1370]` and `EditHistoryModal` `[VERIFIED: CR202AnalysisPage.jsx:1372-1410]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: CR202AnalysisPage.jsx:1002]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: CR202AnalysisPage.jsx:1042-1044]`.
  - Bottom parameter rows styled with distinct background `bg-blue-50/50 dark:bg-blue-950/20` `[VERIFIED: CR202AnalysisPage.jsx:1240-1280]`.
- **Shared Components & Helpers Imported**:
  - `Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedStatusBadge` `[VERIFIED: CR202AnalysisPage.jsx:13-17]`.
- **Analysis-Specific Nuances**:
  - Multi-stream matrix (8 streams × 2 parameters × 6 time slots = 96 inputs plus FNH3 and PCl rows).
  - Uses disabled raw date input element.

---

### 10. CR 203 Crystallizer Analysis (`CR203AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/CR203AnalysisPage.jsx`, 1328 lines total `[VERIFIED: CR203AnalysisPage.jsx:1-1328]`.
- **Page Heading & Breadcrumb**:
  - Title: `"CR 203 Crystallizer Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: CR203AnalysisPage.jsx:922-924]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `CR 203 Analysis` `[VERIFIED: CR203AnalysisPage.jsx:911-915]`.
- **Tabs**: None `[VERIFIED: CR203AnalysisPage.jsx:900-1328]`.
- **Table Structure**:
  - Identical matrix structure to CR 202: Header classes `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: CR203AnalysisPage.jsx:948-950]`.
  - Columns: `TIME`, `STREAM A` to `STREAM H`, `AVG TCl`, `AVG A-H` `[VERIFIED: CR203AnalysisPage.jsx:951-995]`.
  - Row structure: 6 Time-Slot Rows (4-hourly: `07:00`, `11:00`, `15:00`, `19:00`, `23:00`, `03:00`) + 2 Parameter Bottom Rows (`FNH₃` and `PCl`) `[VERIFIED: CR203AnalysisPage.jsx:1000-1185]`.
- **Form Fields & Controls**:
  - Stream readings for Streams A through H (TCl and Sp.Gr) and FNH3 / PCl bottom rows `[VERIFIED: CR203AnalysisPage.jsx:1010-1175]`.
- **Date/Time & Shift Display**:
  - Disabled raw `<input type="date">` `[VERIFIED: CR203AnalysisPage.jsx:928-936]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: CR203AnalysisPage.jsx:1190-1203]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: CR203AnalysisPage.jsx:1206-1275]` and `EditHistoryModal` `[VERIFIED: CR203AnalysisPage.jsx:1277-1315]`.
- **Shared Components & Helpers Imported**:
  - Same set as CR 202 `[VERIFIED: CR203AnalysisPage.jsx:13-17]`.
- **Analysis-Specific Nuances**:
  - Identical crystallizer multi-stream architecture to CR 202.

---

### 11. PCl & TCl Analysis (`PclTclAnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/PclTclAnalysisPage.jsx`, 930 lines total `[VERIFIED: PclTclAnalysisPage.jsx:1-930]`.
- **Page Heading & Breadcrumb**:
  - Title: `"PCl & TCl Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: PclTclAnalysisPage.jsx:669-671]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `PCl & TCl Analysis` `[VERIFIED: PclTclAnalysisPage.jsx:658-662]`.
- **Tabs**: None `[VERIFIED: PclTclAnalysisPage.jsx:650-930]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: PclTclAnalysisPage.jsx:693-695]`.
  - Column headers in exact order: `SHIFT`, `PCl (g/l)`, `TCl (g/l)`, `TCl - PCl (g/l)`, `STATUS` `[VERIFIED: PclTclAnalysisPage.jsx:696-714]`.
  - Subheaders / Spec limits: `(Max 15)`, `(220 - 240)`, `(Calculated Difference)` `[VERIFIED: PclTclAnalysisPage.jsx:699-708]`.
  - Row structure: 3 Shift Rows `[VERIFIED: PclTclAnalysisPage.jsx:717-788]`:
    1. `'I SHIFT'` (`06:00 – 14:00`)
    2. `'II SHIFT'` (`14:00 – 22:00`)
    3. `'III SHIFT'` (`22:00 – 06:00`)
- **Form Fields & Controls**:
  - Field keys: `pcl`, `tcl` `[VERIFIED: PclTclAnalysisPage.jsx:732-758]`.
  - Calculated column: `tclMinusPcl = (tcl - pcl)` dynamically calculated and displayed read-only `[VERIFIED: PclTclAnalysisPage.jsx:761-768]`.
- **Date/Time & Shift Display**:
  - Rendered by `<LockedDateDisplay lockedDate={date} subtitle="Locked to current date" badgeVariant="amber" />` `[VERIFIED: PclTclAnalysisPage.jsx:675-679]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: PclTclAnalysisPage.jsx:792-805]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: PclTclAnalysisPage.jsx:808-857]` and `EditHistoryModal` `[VERIFIED: PclTclAnalysisPage.jsx:859-900]`.
- **Color & Styling Classes**:
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: PclTclAnalysisPage.jsx:693-695]`.
  - Difference cell highlighted with formula pill `bg-slate-100 dark:bg-slate-800` `[VERIFIED: PclTclAnalysisPage.jsx:761-768]`.
- **Shared Components & Helpers Imported**:
  - `Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedDateDisplay`, `LockedStatusBadge` `[VERIFIED: PclTclAnalysisPage.jsx:13-18]`.
- **Analysis-Specific Nuances**:
  - Real-time difference column (`TCl - PCl`) computed in frontend with target tolerance checks.

---

### 12. CaCl2 Analysis (`CaCl2AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/CaCl2AnalysisPage.jsx`, 1144 lines total `[VERIFIED: CaCl2AnalysisPage.jsx:1-1144]`.
- **Page Heading & Breadcrumb**:
  - Title: `"CaCl2 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: CaCl2AnalysisPage.jsx:792-794]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `CaCl2 Analysis` `[VERIFIED: CaCl2AnalysisPage.jsx:781-785]`.
- **Tabs**: None `[VERIFIED: CaCl2AnalysisPage.jsx:770-1144]`.
- **Table Structure**:
  - Header classes: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` (Notice: Solid `bg-slate-900`, no gradient, no border-blue-600) `[VERIFIED: CaCl2AnalysisPage.jsx:822-824]`.
  - Column headers in exact order: `#`, `SAMPLE / TIME`, `CaCl₂ %`, `NaCl %`, `Ca(OH)₂ %`, `CaCO₃ %`, `REMARKS`, `ACTIONS` `[VERIFIED: CaCl2AnalysisPage.jsx:825-849]`.
  - Row structure: Dynamic Sampling Rows with user add/remove capability `[VERIFIED: CaCl2AnalysisPage.jsx:852-950]`:
    - Default initial row: `#1 CaCl2 Solution (08:00)`
    - Can add new reading rows dynamically via `+ Add Reading` button `[VERIFIED: CaCl2AnalysisPage.jsx:807-814]`.
- **Form Fields & Controls**:
  - Field keys: `sampleLabel`, `time`, `cacl2`, `nacl`, `caoh2`, `caco3`, `remarks` `[VERIFIED: CaCl2AnalysisPage.jsx:865-945]`.
  - Input types: Text input for sample label, time select/input, numeric inputs for percentages, text input for remarks.
- **Date/Time & Shift Display**:
  - Inline JSX calendar pill `[VERIFIED: CaCl2AnalysisPage.jsx:798-806]`.
- **Buttons & Actions**:
  - Table toolbar contains `+ Add Reading` action button `[VERIFIED: CaCl2AnalysisPage.jsx:807-814]`.
  - Row delete action button (`Trash2` icon) per row `[VERIFIED: CaCl2AnalysisPage.jsx:940-948]`.
  - Standard shared `StatusSaveButton` `[VERIFIED: CaCl2AnalysisPage.jsx:955-968]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: CaCl2AnalysisPage.jsx:971-1025]` and `EditHistoryModal` `[VERIFIED: CaCl2AnalysisPage.jsx:1027-1070]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: CaCl2AnalysisPage.jsx:778]`.
  - Table header: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` `[VERIFIED: CaCl2AnalysisPage.jsx:822-824]`.
- **Shared Components & Helpers Imported**:
  - `Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedStatusBadge` `[VERIFIED: CaCl2AnalysisPage.jsx:13-17]`.
- **Analysis-Specific Nuances**:
  - Dynamic reading rows with Add/Delete row buttons and custom sample label and remarks fields.

---

### 13. ACL Product Analysis (`ACLProductAnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/ACLProductAnalysisPage.jsx`, 829 lines total `[VERIFIED: ACLProductAnalysisPage.jsx:1-829]`.
- **Page Heading & Breadcrumb**:
  - Title: `"ACL Product Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: ACLProductAnalysisPage.jsx:574-576]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `ACL Product Analysis` `[VERIFIED: ACLProductAnalysisPage.jsx:563-567]`.
- **Tabs**: None `[VERIFIED: ACLProductAnalysisPage.jsx:555-829]`.
- **Table Structure**:
  - **NO TABLE!** Uses a 2-Card list layout `[VERIFIED: ACLProductAnalysisPage.jsx:595-720]`.
  - Card 1: `Chemical & Physical Characteristics (7 Parameters)`:
    - Parameters: `NH₄Cl %`, `NaCl %`, `Fe₂O₃ %`, `H₂O %`, `IR %`, `BD`, `+18 %` `[VERIFIED: ACLProductAnalysisPage.jsx:602-645]`.
  - Card 2: `BSS Sieve Analysis (9 Mesh Sizes)`:
    - Mesh sizes: `+6 %`, `+8 %`, `+12 %`, `+16 %`, `+18 %`, `+44 %`, `+60 %`, `+100 %`, `-100 %` `[VERIFIED: ACLProductAnalysisPage.jsx:655-715]`.
    - Features a dynamic recovery summary banner: `Recovery: XX.X %` `[VERIFIED: ACLProductAnalysisPage.jsx:660-670]`.
- **Form Fields & Controls**:
  - 16 individual parameter fields across both cards `[VERIFIED: ACLProductAnalysisPage.jsx:610-710]`.
  - Input types: `<input type="number">` with decimal steps (`0.01`, `0.001`, `0.1`).
- **Date/Time & Shift Display**:
  - Inline JSX calendar pill `[VERIFIED: ACLProductAnalysisPage.jsx:580-590]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: ACLProductAnalysisPage.jsx:725-738]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: ACLProductAnalysisPage.jsx:741-824]` and `EditHistoryModal` `[VERIFIED: ACLProductAnalysisPage.jsx:826]`.
- **Color & Styling Classes**:
  - Card panels: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-5` `[VERIFIED: ACLProductAnalysisPage.jsx:598, 650]`.
  - Card header bands: `border-b border-slate-200 dark:border-slate-800 pb-3 font-bold text-slate-800 dark:text-slate-100`.
- **Shared Components & Helpers Imported**:
  - `Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedStatusBadge` `[VERIFIED: ACLProductAnalysisPage.jsx:13-17]`.
- **Analysis-Specific Nuances**:
  - Completely non-tabular card/list layout with two separate parameter cards and dynamic sieve recovery banner.

---

### 14. ACL 300 Analysis (`ACL300AnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/ACL300AnalysisPage.jsx`, 795 lines total `[VERIFIED: ACL300AnalysisPage.jsx:1-795]`.
- **Page Heading & Breadcrumb**:
  - Title: `"ACL 300 Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: ACL300AnalysisPage.jsx:569-571]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `ACL 300 Analysis` `[VERIFIED: ACL300AnalysisPage.jsx:558-562]`.
- **Tabs**: None `[VERIFIED: ACL300AnalysisPage.jsx:550-795]`.
- **Table Structure**:
  - Header classes: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: ACL300AnalysisPage.jsx:593-595]`.
  - Column headers in exact order: `SHIFT`, `Moisture %`, `Iron (Fe) ppm`, `NH₄Cl %`, `STATUS` `[VERIFIED: ACL300AnalysisPage.jsx:596-613]`.
  - Subheaders / Spec limits: `(Max 0.15)`, `(Max 15 ppm)`, `(Min 99.5)` `[VERIFIED: ACL300AnalysisPage.jsx:599-607]`.
  - Row structure: 3 Shift Rows `[VERIFIED: ACL300AnalysisPage.jsx:616-687]`:
    1. `'SHIFT 1'` (`06:00 – 14:00 (I Shift)`)
    2. `'SHIFT 2'` (`14:00 – 22:00 (II Shift)`)
    3. `'SHIFT 3'` (`22:00 – 06:00 (III Shift)`)
- **Form Fields & Controls**:
  - Field keys: `moisture`, `iron`, `nh4cl` `[VERIFIED: ACL300AnalysisPage.jsx:632-668]`.
  - Input types: `<input type="number">` with decimal steps (`0.01`, `0.1`).
- **Date/Time & Shift Display**:
  - Rendered by `<LockedDateDisplay lockedDate={date} subtitle="Locked to current date" badgeVariant="amber" />` `[VERIFIED: ACL300AnalysisPage.jsx:575-579]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: ACL300AnalysisPage.jsx:691-704]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: ACL300AnalysisPage.jsx:707-748]` and `EditHistoryModal` `[VERIFIED: ACL300AnalysisPage.jsx:750-788]`.
- **Color & Styling Classes**:
  - Header card: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5` `[VERIFIED: ACL300AnalysisPage.jsx:555]`.
  - Table header: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` `[VERIFIED: ACL300AnalysisPage.jsx:593-595]`.
- **Shared Components & Helpers Imported**:
  - `Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedDateDisplay`, `LockedStatusBadge` `[VERIFIED: ACL300AnalysisPage.jsx:13-18]`.
- **Analysis-Specific Nuances**:
  - Row labels use `'SHIFT 1'`, `'SHIFT 2'`, `'SHIFT 3'` format instead of Roman numerals `'I SHIFT'`, `'II SHIFT'`, `'III SHIFT'`.

---

### 15. Raw Salt Analysis (`RawSaltAnalysisPage.jsx`)
- **File & Lines Read**: `client/src/pages/company/RawSaltAnalysisPage.jsx`, 610 lines total `[VERIFIED: RawSaltAnalysisPage.jsx:1-610]`.
- **Page Heading & Breadcrumb**:
  - Title: `"Raw Salt Analysis"`, Subtitle: `"Daily Quality Control Laboratory Record"` `[VERIFIED: RawSaltAnalysisPage.jsx:434-436]`.
  - Breadcrumb: `Home` (`HiHome`), `ACL Plant`, `Raw Salt Analysis` `[VERIFIED: RawSaltAnalysisPage.jsx:423-427]`.
- **Tabs**: None `[VERIFIED: RawSaltAnalysisPage.jsx:415-610]`.
- **Table Structure**:
  - **NO TABLE!** Card/list layout `[VERIFIED: RawSaltAnalysisPage.jsx:455-520]`.
  - Single card with 6 parameters in vertical list:
    1. `NaCl %`
    2. `Ca %`
    3. `Mg %`
    4. `SO₄ %`
    5. `IR %`
    6. `H₂O %`
- **Form Fields & Controls**:
  - Field keys: `nacl`, `ca`, `mg`, `so4`, `ir`, `h2o` `[VERIFIED: RawSaltAnalysisPage.jsx:465-515]`.
  - Input types: `<input type="number">` with decimal step (`0.01`, `0.001`).
- **Date/Time & Shift Display**:
  - Inline JSX calendar pill `[VERIFIED: RawSaltAnalysisPage.jsx:440-450]`.
- **Buttons & Actions**:
  - Uses shared `StatusSaveButton` component `[VERIFIED: RawSaltAnalysisPage.jsx:525-538]`.
  - Modals: `ConfirmSaveModal` `[VERIFIED: RawSaltAnalysisPage.jsx:541-580]` and `EditHistoryModal` `[VERIFIED: RawSaltAnalysisPage.jsx:582-605]`.
- **Color & Styling Classes**:
  - Single card layout: `bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-5` `[VERIFIED: RawSaltAnalysisPage.jsx:458]`.
- **Shared Components & Helpers Imported**:
  - `Breadcrumb`, `ConfirmSaveModal`, `EditHistoryModal`, `StatusSaveButton`, `LockedStatusBadge` `[VERIFIED: RawSaltAnalysisPage.jsx:13-17]`.
- **Analysis-Specific Nuances**:
  - Single daily reading for raw salt feed; no shift division; presented as a compact 1-column parameter card rather than a table.

---

## Comparison Table of UI Variants (ACL Plant)

| Analysis Page | Header Card Styling | Table Header Styling | Row Structure & Labels | Date Display Component | Confirmation Modal | Status / Save Button |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pure Salt** | Standard Card `[PureSaltAnalysisPage.jsx:585]` | Slate Gradient `[PureSaltAnalysisPage.jsx:623-625]` | 5 Rows: RAW SALT, I SHIFT, II SHIFT, III SHIFT, COMPOSITION `[648-732]` | `LockedDateDisplay` `[605-609]` | `ConfirmSaveModal` `[752-800]` | `StatusSaveButton` `[736-749]` |
| **Brine** | Standard Card `[BrineAnalysisPage.jsx:476]` | Slate Gradient `[BrineAnalysisPage.jsx:514-516]` | 2 Equipment Rows: TK 109, TK 110 `[536-580]` | Inline Calendar Pill `[496-506]` | `ConfirmSaveModal` `[602-648]` | `StatusSaveButton` `[586-599]` |
| **Pure Salt Sieve** | Standard Card `[PureSaltSieveAnalysisPage.jsx:570]` | Slate Gradient `[PureSaltSieveAnalysisPage.jsx:608-610]` | 3 Shift Rows: I SHIFT, II SHIFT, III SHIFT `[633-706]` | `LockedDateDisplay` `[590-594]` | `ConfirmSaveModal` `[726-760]` | `StatusSaveButton` `[710-723]` |
| **TK 203** | Standard Card `[TK203AnalysisPage.jsx:558]` | Slate Gradient `[TK203AnalysisPage.jsx:596-598]` | 12 Time Slots (07:00–05:00) + AVERAGE `[620-716]` | Inline Calendar Pill `[578-588]` | `ConfirmSaveModal` `[736-780]` | `StatusSaveButton` `[720-733]` |
| **TK 204** | Standard Card `[TK204AnalysisPage.jsx:595]` | Solid Dark `[TK204AnalysisPage.jsx:633-635]` | 3 Shift Rows: I SHIFT, II SHIFT, III SHIFT `[657-735]` | `LockedDateDisplay` `[615-619]` | `ConfirmSaveModal` `[756-805]` | `StatusSaveButton` `[740-753]` |
| **TK 205** | Standard Card `[TK205AnalysisPage.jsx:596]` | Slate Gradient `[TK205AnalysisPage.jsx:634-636]` | 12 Time Slots (07:00–05:00) + AVERAGE `[658-754]` | Inline Calendar Pill `[616-626]` | `ConfirmSaveModal` `[774-825]` | `StatusSaveButton` `[758-771]` |
| **TK 207** | Standard Card `[TK207AnalysisPage.jsx:605]` | Slate Gradient `[TK207AnalysisPage.jsx:644-646]` | 12 Time Slots (07:00–05:00) + AVERAGE `[668-764]` | Inline Calendar Pill `[626-636]` | `ConfirmSaveModal` `[784-835]` | `StatusSaveButton` `[768-781]` |
| **TK 209** | Standard Card `[TK209AnalysisPage.jsx:603]` | Solid Dark `[TK209AnalysisPage.jsx:641-643]` | 3 Shift Rows: I SHIFT, II SHIFT, III SHIFT `[665-743]` | `LockedDateDisplay` `[623-627]` | `ConfirmSaveModal` `[764-813]` | `StatusSaveButton` `[748-761]` |
| **CR 202** | Standard Card `[CR202AnalysisPage.jsx:1002]` | Slate Gradient `[CR202AnalysisPage.jsx:1042-1044]` | 6 Time Slots (Streams A–H) + FNH₃ & PCl `[1095-1280]` | Disabled `<input type="date">` `[1022]` | `ConfirmSaveModal` `[1301-1370]` | `StatusSaveButton` `[1285-1298]` |
| **CR 203** | Standard Card `[CR203AnalysisPage.jsx:908]` | Slate Gradient `[CR203AnalysisPage.jsx:948-950]` | 6 Time Slots (Streams A–H) + FNH₃ & PCl `[1000-1185]` | Disabled `<input type="date">` `[928]` | `ConfirmSaveModal` `[1206-1275]` | `StatusSaveButton` `[1190-1203]` |
| **PCl & TCl** | Standard Card `[PclTclAnalysisPage.jsx:655]` | Slate Gradient `[PclTclAnalysisPage.jsx:693-695]` | 3 Shift Rows: I SHIFT, II SHIFT, III SHIFT `[717-788]` | `LockedDateDisplay` `[675-679]` | `ConfirmSaveModal` `[808-857]` | `StatusSaveButton` `[792-805]` |
| **CaCl2** | Standard Card `[CaCl2AnalysisPage.jsx:778]` | Solid Dark `[CaCl2AnalysisPage.jsx:822-824]` | Dynamic Rows (Add/Delete) `[852-950]` | Inline Calendar Pill `[798-806]` | `ConfirmSaveModal` `[971-1025]` | `StatusSaveButton` `[955-968]` |
| **ACL Product** | 2-Card Layout `[ACLProductAnalysisPage.jsx:598,650]` | No Table (Card Layout) `[595-720]` | 2 Parameter Groups (7 Chemical + 9 BSS) `[602-715]` | Inline Calendar Pill `[580-590]` | `ConfirmSaveModal` `[741-824]` | `StatusSaveButton` `[725-738]` |
| **ACL 300** | Standard Card `[ACL300AnalysisPage.jsx:555]` | Slate Gradient `[ACL300AnalysisPage.jsx:593-595]` | 3 Shift Rows: SHIFT 1, SHIFT 2, SHIFT 3 `[616-687]` | `LockedDateDisplay` `[575-579]` | `ConfirmSaveModal` `[707-748]` | `StatusSaveButton` `[691-704]` |
| **Raw Salt** | 1-Card Layout `[RawSaltAnalysisPage.jsx:458]` | No Table (Card Layout) `[455-520]` | 6 Single Parameters (NaCl, Ca, Mg, SO4, IR, H2O) `[465-515]` | Inline Calendar Pill `[440-450]` | `ConfirmSaveModal` `[541-580]` | `StatusSaveButton` `[525-538]` |

---

## Detailed Summary of UI Inconsistencies Identified Across ACL Pages

1. **Table Header Styling Divergence**:
   - **Variant 1 (Slate Gradient)**: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs` with `border-b-2 border-blue-600` (used in Pure Salt, Brine, Pure Salt Sieve, TK 203, TK 205, TK 207, CR 202, CR 203, PCl & TCl, ACL 300).
   - **Variant 2 (Solid Dark)**: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold` without gradient and without blue accent line (used in TK 204, TK 209, CaCl2).
   - **Variant 3 (Non-Tabular Cards)**: No table header at all; styled as parameter cards (ACL Product, Raw Salt).

2. **Date Display Divergence**:
   - **Variant A (`LockedDateDisplay` component)**: Used in Pure Salt, Pure Salt Sieve, TK 204, TK 209, PCl & TCl, ACL 300.
   - **Variant B (Inline Calendar Pill)**: Used in Brine, TK 203, TK 205, TK 207, CaCl2, ACL Product, Raw Salt.
   - **Variant C (Disabled Native Date Input)**: Used in CR 202, CR 203.

3. **Row & Layout Types**:
   - **3 Shift Rows (Roman numerals)**: Pure Salt Sieve, TK 204, TK 209, PCl & TCl (`'I SHIFT'`, `'II SHIFT'`, `'III SHIFT'`).
   - **3 Shift Rows (Arabic numerals)**: ACL 300 (`'SHIFT 1'`, `'SHIFT 2'`, `'SHIFT 3'`).
   - **Composite Shift + Sample**: Pure Salt (Raw Salt, 3 Shifts, 24h Composition row).
   - **12 Time Slots**: TK 203, TK 205, TK 207 (2-hourly intervals grouped by 3 shifts + Average row).
   - **6 Time Slots × 8 Streams Matrix**: CR 202, CR 203 (Stream A–H, 4-hourly intervals + bottom FNH3/PCl rows).
   - **Equipment Rows**: Brine (TK 109, TK 110).
   - **Dynamic Rows**: CaCl2 (add/delete reading rows).
   - **Card / Vertical Parameter Form (No Table)**: ACL Product (2 cards: 7 chemical + 9 BSS sieve), Raw Salt (1 card: 6 parameters).
