# QCL UI Inventory Corrections: ACL Plant
**Report Date**: 2026-11-24  
**Audit Scope**: Detailed code verification and corrections for 8 ACL Plant analysis pages in `client/src/pages/company/`.  
**Rules & Verification**: Strictly READ-ONLY on code and DB. Real code quoted verbatim with exact `[VERIFIED: file:lines]` citations. Every contradiction with `reports/qcl-ui-inventory-ACL-2026-11-24.md` is plainly documented.

---

## 1. ACL 300# Analysis (`ACL300AnalysisPage.jsx`)

### What Was Wrong in the Earlier Report
- **Columns & Parameters**: The earlier report claimed:
  > Columns: `SHIFT`, `Moisture %`, `Iron (Fe) ppm`, `NH₄Cl %`, `STATUS`. Subheaders: `(Max 0.15)`, `(Max 15 ppm)`, `(Min 99.5)`. Field keys: `moisture`, `iron`, `nh4cl`.
  - **Correction**: This was entirely incorrect. The actual components are `+18 %` (`p18`), `+44 %` (`p44`), and `NaCl %` (`nacl`). There are NO moisture, iron, or NH₄Cl fields on this page.
- **Shared Badge Component**: The earlier report claimed `LockedStatusBadge` was imported on line 18.
  - **Correction**: `LockedStatusBadge` does NOT exist in this file. The component uses `RecordStatusBadge` from `co2AnalysisHelper`.

### Initial State Object (all keys)
`[VERIFIED: ACL300AnalysisPage.jsx:57-61]`
```javascript
const buildInitialShiftData = () => ({
  shift1: { p18: '', p44: '', nacl: '' },
  shift2: { p18: '', p44: '', nacl: '' },
  shift3: { p18: '', p44: '', nacl: '' },
});
```
State initialization `[VERIFIED: ACL300AnalysisPage.jsx:107]`:
```javascript
const [shiftsData, setShiftsData] = useState(buildInitialShiftData());
```

### Column Header JSX
`[VERIFIED: ACL300AnalysisPage.jsx:622-656]`
```jsx
<tr className="bg-slate-50/90 border-b border-slate-200">
  <th className="py-2.5 px-4 sm:px-6 text-xs font-extrabold uppercase tracking-wider text-slate-600 w-1/4">
    Shift / Schedule
  </th>

  {/* +18 % Component Header */}
  <th className="py-2 px-3 text-center w-1/4">
    <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
      +18 %
    </div>
    <div className="text-[10px] text-slate-400 font-normal">
      (+18 Mesh Particle Spec)
    </div>
  </th>

  {/* +44 % Component Header */}
  <th className="py-2 px-3 text-center w-1/4">
    <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
      +44 %
    </div>
    <div className="text-[10px] text-slate-400 font-normal">
      (+44 Mesh Particle Spec)
    </div>
  </th>

  {/* NaCl % Component Header */}
  <th className="py-2 px-3 text-center w-1/4">
    <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tracking-tight">
      NaCl %
    </div>
    <div className="text-[10px] text-slate-400 font-normal">
      (Sodium Chloride Content)
    </div>
  </th>
</tr>
```

### Object Built for Save Payload
`[VERIFIED: ACL300AnalysisPage.jsx:385-405]`
```javascript
const payload = {
  date,
  plant: plantId ? plantId.toUpperCase() : 'ACL',
  analysisType: 'ACL 300# Analysis',
  unit: 'ACL 300#',
  frequency: 'Once in a shift',
  shift: shiftBeingSaved ? shiftBeingSaved.name : 'SHIFT 1',
  shifts: Object.fromEntries(
    SHIFTS.map((s) => [
      s.key,
      Object.fromEntries(
        ACL300_COMPONENTS.map((comp) => {
          const val = shiftsData[s.key]?.[comp.key];
          return [comp.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
        })
      ),
    ])
  ),
  submittedBy: user?.name || 'Plant Operator',
  submittedAt: new Date().toISOString(),
};
```

### Date Locking Mechanism
- **Component & Code**:  
  State initialization `[VERIFIED: ACL300AnalysisPage.jsx:106]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
  Rendered via shared component `[VERIFIED: ACL300AnalysisPage.jsx:551]`:
  ```jsx
  <LockedDateDisplay date={date} id="acl300-date-display" badgeText="Operating Day" />
  ```
- **Condition that locks it**: Unconditionally locked to the operating date in Asia/Kolkata (06:00 to 06:00 IST cycle). No `setDate` setter is provided in state, and `<LockedDateDisplay>` displays the date as static text with an amber "Operating Day" badge and lock icon.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file.
- The shift status badge is rendered using `RecordStatusBadge` on line 686:
  `[VERIFIED: ACL300AnalysisPage.jsx:686]`
  ```jsx
  <RecordStatusBadge status={getShiftStatus(shift.key)} />
  ```

---

## 2. CR 202 Crystallizer Analysis (`CR202AnalysisPage.jsx`)

### What Was Wrong in the Earlier Report
- **Table Columns & Stream Sub-columns**: The earlier report claimed:
  > Two-level header layout: TIME, STREAM A..H with TCl / Sp.Gr sub-columns. Per slot, streamA to streamH each have tcl and spGr.
  - **Correction**: This was entirely incorrect. Streams A through H are individual CNH₃ reading columns (allowed range: 2.88–3.08 Kgm/m³). There are NO `spGr` fields anywhere in this file. The columns are: `Time / Shift`, streams `A`, `B`, `C`, `D`, `E`, `F`, `G`, `H`, plus `TCl (4.55–4.75)` and `A-H (2.88–3.08)`.
- **Saved Data Shape**: The earlier report claimed `streamA..streamH` objects with subfields.
  - **Correction**: Real saved data has 6 time-slot objects (`t07`, `t11`, `t15`, `t19`, `t23`, `t03`), each containing keys: `a`, `b`, `c`, `d`, `e`, `f`, `g`, `h`, `avgTcl`, and `avgAH`. In addition, `fnh3Row` and `pclRow` are stored as flat objects with keys `a..h`, `avgTcl`, and `avgAH`.
- **Shared Badge Component**: The earlier report claimed `LockedStatusBadge` on line 17.
  - **Correction**: `LockedStatusBadge` is NOT imported or used.

### Initial State Object (all keys)
`[VERIFIED: CR202AnalysisPage.jsx:139-162]`
```javascript
const buildEmptyTimeRows = () =>
  Object.fromEntries(
    TIME_SLOTS.map((slot) => [
      slot.key,
      {
        ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
        avgTcl: '',
        avgAH: '',
      },
    ])
  );

const buildEmptyFnh3Row = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
  avgAH: '',
});

const buildEmptyPclRow = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
  avgAH: '',
});
```
State initializations `[VERIFIED: CR202AnalysisPage.jsx:372-374]`:
```javascript
const [timeRows, setTimeRows] = useState(buildEmptyTimeRows());
const [fnh3Row, setFnh3Row]   = useState(buildEmptyFnh3Row());
const [pclRow, setPclRow]     = useState(buildEmptyPclRow());
```

### Column Header JSX
`[VERIFIED: CR202AnalysisPage.jsx:1070-1110]`
```jsx
{/* Row 1: Grouping Header */}
<tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
  <th className="px-5 py-2 text-left w-36 border-r border-slate-800 text-slate-300">
    CR 202
  </th>
  <th colSpan={8} className="px-3 py-2 text-center border-r border-slate-800 bg-blue-950/80 text-blue-200">
    <span className="inline-flex items-center gap-2">
      <span>←</span>
      <span className="font-mono tracking-widest font-black">CNH₃ (2.88–3.08)</span>
      <span>→</span>
    </span>
  </th>
  <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[85px] border-r border-slate-800">
    AVG
  </th>
  <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[85px]">
    AVG
  </th>
</tr>

{/* Row 2: Sub-columns (Time, A through H, AVG TCl, AVG A-H) */}
<tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
  <th className="px-5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
    Time / Shift
  </th>
  {STREAMS.map((s, idx) => (
    <th
      key={s.key}
      className={`px-2.5 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
      } ${s.colClass}`}
    >
      {s.label}
    </th>
  ))}
  <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[85px] border-r border-slate-800">
    TCl (4.55–4.75)
  </th>
  <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[85px]">
    A-H (2.88–3.08)
  </th>
</tr>
```

### Object Built for Save Payload
`[VERIFIED: CR202AnalysisPage.jsx:774-786]`
```javascript
const payload = {
  date,
  plant: plantId ? plantId.toUpperCase() : 'ACL',
  analysisType: 'CR 202 Analysis',
  crystallizer: 'CR 202',
  targetSlot: confirmData?.targetSlotKey,
  shift: targetSlotObj?.shift || 'I Shift',
  submittedBy: user?.name || 'Plant Operator',
  submittedAt: new Date().toISOString(),
  timeRows,
  fnh3Row,
  pclRow,
};
```

### Date Locking Mechanism
- **Component & Code**:  
  State initialization `[VERIFIED: CR202AnalysisPage.jsx:371]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
  Rendered in header `[VERIFIED: CR202AnalysisPage.jsx:987-995]`:
  ```jsx
  <input
    id="cr202-date-input"
    type="date"
    value={date}
    readOnly
    disabled
    className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded px-2 py-0.5 shadow-2xs cursor-not-allowed opacity-90"
    title="Date is strictly locked to today's date in Asia/Kolkata timezone"
  />
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. The native HTML `<input type="date">` has hardcoded `readOnly` and `disabled` attributes and `cursor-not-allowed` class, and component state exposes no `setDate` function.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file.

---

## 3. CR 203 Crystallizer Analysis (`CR203AnalysisPage.jsx`)

### What Was Wrong in the Earlier Report
- **Columns**: The earlier report claimed:
  > Columns: TIME, STREAM A to STREAM H, AVG TCl, AVG A-H.
  - **Correction**: CR 203 does **NOT** have an `AVG A-H` column header or field. Its columns are: `Time / Shift`, streams `A` through `H`, and `TCl (5.54–5.74)`.
- **State Keys**: The earlier report claimed `CR203AnalysisPage` had identical stream readings to CR 202.
  - **Correction**: In `buildEmptyTimeRows`, CR 203 defines only `avgTcl` (no `avgAH`). Each slot object has keys: `a`, `b`, `c`, `d`, `e`, `f`, `g`, `h`, `avgTcl`. There is no `spGr` field.
- **Shared Badge Component**: The earlier report claimed `LockedStatusBadge` on line 17.
  - **Correction**: `LockedStatusBadge` is NOT imported or used.

### Initial State Object (all keys)
`[VERIFIED: CR203AnalysisPage.jsx:128-147]`
```javascript
const buildEmptyTimeRows = () =>
  Object.fromEntries(
    TIME_SLOTS.map((slot) => [
      slot.key,
      {
        ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
        avgTcl: '',
      },
    ])
  );

const buildEmptyFnh3Row = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
});

const buildEmptyPclRow = () => ({
  ...Object.fromEntries(STREAMS.map((s) => [s.key, ''])),
  avgTcl: '',
});
```
State initializations `[VERIFIED: CR203AnalysisPage.jsx:356-358]`:
```javascript
const [timeRows, setTimeRows] = useState(buildEmptyTimeRows());
const [fnh3Row, setFnh3Row]   = useState(buildEmptyFnh3Row());
const [pclRow, setPclRow]     = useState(buildEmptyPclRow());
```

### Column Header JSX
`[VERIFIED: CR203AnalysisPage.jsx:1012-1044]`
```jsx
{/* Row 1: Grouping Header */}
<tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
  <th className="px-5 py-2 text-left w-36 border-r border-slate-800 text-slate-300">
    CR 203
  </th>
  <th colSpan={8} className="px-3 py-2 text-center border-r border-slate-800 bg-blue-950/80 text-blue-200">
    <span className="inline-flex items-center gap-2">
      <span>←</span>
      <span className="font-mono tracking-widest font-black">CNH₃ (1.88–2.08)</span>
      <span>→</span>
    </span>
  </th>
  <th className="px-3 py-2 text-center bg-slate-900 text-slate-200 min-w-[95px]">
    AVG
  </th>
</tr>

{/* Row 2: Sub-columns (Time, A through H, AVG TCl) */}
<tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
  <th className="px-5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider w-36 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
    Time / Shift
  </th>
  {STREAMS.map((s, idx) => (
    <th
      key={s.key}
      className={`px-2.5 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
      } ${s.colClass}`}
    >
      {s.label}
    </th>
  ))}
  <th className="px-3 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 bg-slate-900 min-w-[95px]">
    TCl (5.54–5.74)
  </th>
</tr>
```

### Object Built for Save Payload
`[VERIFIED: CR203AnalysisPage.jsx:755-767]`
```javascript
const payload = {
  date,
  plant: plantId ? plantId.toUpperCase() : 'ACL',
  analysisType: 'CR 203 Analysis',
  crystallizer: 'CR 203',
  targetSlot: confirmData?.targetSlotKey,
  shift: targetSlotObj?.shift || 'I Shift',
  submittedBy: user?.name || 'Plant Operator',
  submittedAt: new Date().toISOString(),
  timeRows,
  fnh3Row,
  pclRow,
};
```

### Date Locking Mechanism
- **Component & Code**:  
  State initialization `[VERIFIED: CR203AnalysisPage.jsx:355]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
  Rendered in header `[VERIFIED: CR203AnalysisPage.jsx:919-929]`:
  ```jsx
  <input
    id="cr203-date-input"
    type="date"
    value={date}
    readOnly
    disabled
    className="text-xs font-extrabold text-slate-800 bg-transparent border-0 outline-none cursor-not-allowed select-none p-0 focus:ring-0"
    title="Date is strictly locked to operating date in Asia/Kolkata"
  />
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. Form element has `readOnly`, `disabled`, and `cursor-not-allowed` attributes with zero state setters available.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file.

---

## 4. TK 205 Analysis (`TK205AnalysisPage.jsx`)

### What Was Wrong in the Earlier Report
- **Parameters & Columns**: The earlier report claimed:
  > Columns: TIME, SHIFT, pH, Sp. Gravity, FNH₃ (g/l), TCl (g/l), NaCl (g/l), Na₂SO₄ (g/l), CaCl₂ (g/l). Field keys: ph, spGravity, fnh3, tcl, nacl, na2so4, cacl2. Average footer row.
  - **Correction**: This was entirely incorrect. TK 205 has strictly 4 parameters: `fnh3` (FNH₃), `cnh3` (CNH₃), `tcl` (TCl), and `pcl` (PCl), all in unit `Kgm/m³`. It has NO pH, Sp. Gravity, NaCl, Na₂SO₄, or CaCl₂ fields. There is NO average footer row.
- **Shared Badge Component**: The earlier report claimed `LockedStatusBadge` on line 17.
  - **Correction**: `LockedStatusBadge` is NOT imported or used.

### Initial State Object (all keys)
`[VERIFIED: TK205AnalysisPage.jsx:92-97, 116-119]`
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    TIME_SLOTS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );
```
Per time slot (`t07`, `t09`, `t11`, `t13`, `t15`, `t17`, `t19`, `t21`, `t23`, `t01`, `t03`, `t05`), keys are `{ fnh3: '', cnh3: '', tcl: '', pcl: '' }`.  
State initialization `[VERIFIED: TK205AnalysisPage.jsx:212]`:
```javascript
const [data, setData] = useState(buildEmptyData());
```

### Column Header JSX
`[VERIFIED: TK205AnalysisPage.jsx:662-677]`
```jsx
<tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
  <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-40 sm:w-48 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
    Time / Shift / Status
  </th>
  {PARAMETERS.map((p, idx) => (
    <th
      key={p.key}
      className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
      } ${p.colClass}`}
    >
      <span>{p.label}</span> {p.unit && <span className="text-[10px] text-blue-300 font-semibold lowercase">({p.unit})</span>}
    </th>
  ))}
</tr>
```

### Object Built for Save Payload
`[VERIFIED: TK205AnalysisPage.jsx:478-495]`
```javascript
const payload = {
  date,
  plant: plantId ? plantId.toUpperCase() : 'ACL',
  analysisType: 'TK 205 Analysis',
  tank: 'TK 205',
  submittedBy: user?.name || 'Plant Operator',
  rows: Object.fromEntries(
    TIME_SLOTS.map((r) => [
      r.key,
      Object.fromEntries(
        PARAMETERS.map((p) => {
          const val = data[r.key]?.[p.key];
          return [p.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
        })
      ),
    ])
  ),
};
```

### Date Locking Mechanism
- **Component & Code**:  
  State initialization `[VERIFIED: TK205AnalysisPage.jsx:211]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
  Rendered in header `[VERIFIED: TK205AnalysisPage.jsx:601-615]`:
  ```jsx
  <div
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 shadow-2xs select-none"
    title="Operating Date (06:00-06:00 IST)"
  >
    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
      <span id="tk205-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
        {formatDateDisplay(date)}
      </span>
      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 uppercase tracking-wider ml-0.5">
        Operating Day
      </span>
    </div>
  </div>
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. Static text container with no input field, no date picker, and no state setter.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file.

---

## 5. TK 207 Analysis (`TK207AnalysisPage.jsx`)

### What Was Wrong in the Earlier Report
- **Parameters & Columns**: The earlier report claimed:
  > Columns: TIME, SHIFT, pH, Sp. Gravity, FNH₃ (g/l), TCl (g/l), NaCl (g/l), Na₂SO₄ (g/l), CaCl₂ (g/l). Field keys: ph, spGravity, fnh3, tcl, nacl, na2so4, cacl2.
  - **Correction**: This was entirely incorrect. TK 207 has strictly 4 parameters: `fnh3` (FNH₃), `cnh3` (CNH₃), `tcl` (TCl), and `pcl` (PCl), all in unit `Kgm/m³`. It has NO pH, Sp. Gravity, NaCl, Na₂SO₄, or CaCl₂ fields. There is NO average footer row.
- **Shared Badge Component**: The earlier report claimed `LockedStatusBadge` on line 17.
  - **Correction**: `LockedStatusBadge` is NOT imported or used.

### Initial State Object (all keys)
`[VERIFIED: TK207AnalysisPage.jsx:92-97, 116-119]`
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
];

const buildEmptyData = () =>
  Object.fromEntries(
    TIME_SLOTS.map((r) => [r.key, Object.fromEntries(PARAMETERS.map((p) => [p.key, '']))])
  );
```
Per time slot (`t07`..`t05`), keys are `{ fnh3: '', cnh3: '', tcl: '', pcl: '' }`.  
State initialization `[VERIFIED: TK207AnalysisPage.jsx:213]`:
```javascript
const [data, setData] = useState(buildEmptyData());
```

### Column Header JSX
`[VERIFIED: TK207AnalysisPage.jsx:692-707]`
```jsx
<tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
  <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-wider w-40 sm:w-48 bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
    Time / Shift / Status
  </th>
  {PARAMETERS.map((p, idx) => (
    <th
      key={p.key}
      className={`px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-slate-100 ${
        idx % 2 === 0 ? 'bg-slate-900/95' : 'bg-slate-900/85'
      } ${p.colClass}`}
    >
      <span>{p.label}</span> {p.unit && <span className="text-[10px] text-blue-300 font-semibold lowercase">({p.unit})</span>}
    </th>
  ))}
</tr>
```

### Object Built for Save Payload
`[VERIFIED: TK207AnalysisPage.jsx:479-496]`
```javascript
const payload = {
  date,
  plant: plantId ? plantId.toUpperCase() : 'ACL',
  analysisType: 'TK 207 Analysis',
  tank: 'TK 207',
  submittedBy: user?.name || 'Plant Operator',
  rows: Object.fromEntries(
    TIME_SLOTS.map((r) => [
      r.key,
      Object.fromEntries(
        PARAMETERS.map((p) => {
          const val = data[r.key]?.[p.key];
          return [p.key, val !== '' && val !== null && val !== undefined ? parseFloat(val) : null];
        })
      ),
    ])
  ),
};
```

### Date Locking Mechanism
- **Component & Code**:  
  State initialization `[VERIFIED: TK207AnalysisPage.jsx:212]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
  Rendered in header `[VERIFIED: TK207AnalysisPage.jsx:629-643]`:
  ```jsx
  <div
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 shadow-2xs select-none"
    title="Operating Date (06:00-06:00 IST)"
  >
    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date:</span>
      <span id="tk207-current-date-display" className="text-xs font-mono font-bold text-slate-800 tracking-tight">
        {formatDateDisplay(date)}
      </span>
      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 uppercase tracking-wider ml-0.5">
        Operating Day
      </span>
    </div>
  </div>
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. Static text container with no input field and no date setter.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file.

---

## 6. Spot-Check: Brine Analysis (`BrineAnalysisPage.jsx`)

### Row Labels and Field Keys Check
- **Row Labels**:
  `[VERIFIED: BrineAnalysisPage.jsx:37-40]`
  ```javascript
  const ROWS = [
    { key: 'tk109', label: 'TK 109', tankType: 'Storage Tank', highlightType: 'tk109' },
    { key: 'tk110', label: 'TK 110', tankType: 'Feed Tank',    highlightType: 'tk110' },
  ];
  ```
  **Result**: **MATCH** on row labels (`TK 109` Storage Tank, `TK 110` Feed Tank).
- **Field Keys**:
  `[VERIFIED: BrineAnalysisPage.jsx:30-35]`
  ```javascript
  const PARAMETERS = [
    { key: 'nacl', label: 'NaCl', unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
    { key: 'ca',   label: 'Ca',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
    { key: 'mg',   label: 'Mg',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
    { key: 'so4',  label: 'SO₄',  unit: 'g/L', colClass: 'min-w-[130px]' },
  ];
  ```
  **Result**: **MISMATCH**.
  - The earlier report claimed: `NaCl (g/l), Na₂SO₄ (g/l), Ca (g/l), Mg (g/l)` and field keys `nacl, na2so4, ca, mg`.
  - In actual code: Keys are `nacl`, `ca`, `mg`, `so4`. There is NO `na2so4` field key—it is `so4`. Furthermore, `Ca` and `Mg` appear before `SO₄`, not after.

### Date Locking Mechanism
- State initialization `[VERIFIED: BrineAnalysisPage.jsx:109]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
- Rendered in header `[VERIFIED: BrineAnalysisPage.jsx:459-472]`:
  ```jsx
  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
    <div className="flex flex-col">
      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider leading-none">
        DATE (TODAY ONLY)
      </span>
      <span className="text-xs font-black text-slate-800 leading-tight">
        {formatDateDisplay(date)}
      </span>
    </div>
    <span className="ml-1 text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.2 rounded border border-blue-200 uppercase">
      Asia/Kolkata
    </span>
  </div>
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. Static text display with no date input and no state setter.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in `BrineAnalysisPage.jsx`.

---

## 7. Spot-Check: Pure Salt Sieve Analysis (`PureSaltSieveAnalysisPage.jsx`)

### Field Keys Check
`[VERIFIED: PureSaltSieveAnalysisPage.jsx:36-42]`
```javascript
const PARAMETERS = [
  { key: 'p18',  label: 'BSS 18',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p44',  label: 'BSS 44',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p60',  label: 'BSS 60',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p100', label: 'BSS 100', unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'm100', label: '-100',    unit: '%', colClass: 'min-w-[110px]' },
];
```
**Result**: **MISMATCH**.
- The earlier report claimed:
  > Columns: `SHIFT`, `+18 MESH %`, `+20 MESH %`, `+24 MESH %`, `+30 MESH %`, `+36 MESH %`, `+44 MESH %`, `RECOVERY %`. Field keys: `m18`, `m20`, `m24`, `m30`, `m36`, `m44`.
- In actual code: There are only 5 parameters: `p18` (`BSS 18`), `p44` (`BSS 44`), `p60` (`BSS 60`), `p100` (`BSS 100`), `m100` (`-100`). There are no `+20`, `+24`, `+30`, or `+36` mesh sizes, and there is NO `recovery` calculation or column.

### Date Locking Mechanism
- State initialization `[VERIFIED: PureSaltSieveAnalysisPage.jsx:122]`:
  ```javascript
  const [date, setDate] = useState(() => getOperatingDateIST());
  ```
  *(Note: `setDate` is declared by destructuring but never called anywhere in the file)*.
- Rendered in header `[VERIFIED: PureSaltSieveAnalysisPage.jsx:564]`:
  ```jsx
  <LockedDateDisplay date={date} id="ps-sieve-date-display" badgeText="Operating Day" />
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. Rendered via shared `<LockedDateDisplay>` component.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file. The shift status badge is rendered via `RecordStatusBadge` on line 656:
  `[VERIFIED: PureSaltSieveAnalysisPage.jsx:656]`
  ```jsx
  <RecordStatusBadge status={getShiftStatus(row.key)} />
  ```

---

## 8. Spot-Check: TK 204 Analysis (`TK204AnalysisPage.jsx`)

### Header Classes Check
`[VERIFIED: TK204AnalysisPage.jsx:630]`
```jsx
<tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```
**Result**: **MATCH (with exact typography specification)**.
- Earlier report: `bg-slate-900 text-white text-xs uppercase tracking-wider font-semibold`.
- Real code: `bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider`.
- Both describe solid dark slate header without blue bottom accent line.
- **Critical Additional Finding for TK 204**: The earlier report claimed parameters were `pH, Sp. Gravity, FNH₃, TCl, NaCl, Na₂SO₄, CaCl₂`. The actual parameters in code are `fnh3` (FNH₃), `cnh3` (CNH₃), `tcl` (TCl), and `pcl` (PCl) `[VERIFIED: TK204AnalysisPage.jsx:34-39]`.

### Date Locking Mechanism
- State initialization `[VERIFIED: TK204AnalysisPage.jsx:77]`:
  ```javascript
  const [date] = useState(() => getOperatingDateIST());
  ```
- Rendered in header `[VERIFIED: TK204AnalysisPage.jsx:564]`:
  ```jsx
  <LockedDateDisplay date={date} id="tk204-date-display" badgeText="Operating Day" />
  ```
- **Condition that locks it**: Unconditionally locked to `getOperatingDateIST()`. Rendered via shared `<LockedDateDisplay>` component with no date setter.

### LockedStatusBadge Usage
- `LockedStatusBadge` is **NOT used** in this file. Shift status is rendered via `RecordStatusBadge` on line 694:
  `[VERIFIED: TK204AnalysisPage.jsx:694]`
  ```jsx
  <RecordStatusBadge status={getShiftStatus(shift.key)} />
  ```

---

## Summary Matrix of Verified Values for the 8 Pages

| Page | Real Parameters / Fields | Real Row Structure | Date Locking Mechanism | Status Badge Component Used |
| :--- | :--- | :--- | :--- | :--- |
| **ACL300AnalysisPage.jsx** | `p18` (+18 %), `p44` (+44 %), `nacl` (NaCl %) | 3 Shift Rows (`shift1`, `shift2`, `shift3`) | `<LockedDateDisplay>` (unconditionally locked to `getOperatingDateIST()`) | `RecordStatusBadge` (line 686) |
| **CR202AnalysisPage.jsx** | CNH₃ streams `a..h`, `avgTcl`, `avgAH`; bottom rows `fnh3Row` & `pclRow` | 6 Time Slots (`t07`..`t03`) + 2 Bottom Rows | `<input type="date" readOnly disabled>` (unconditional) | Custom slot pills (no `LockedStatusBadge`) |
| **CR203AnalysisPage.jsx** | CNH₃ streams `a..h`, `avgTcl`; bottom rows `fnh3Row` & `pclRow` | 6 Time Slots (`t07`..`t03`) + 2 Bottom Rows | `<input type="date" readOnly disabled>` (unconditional) | Custom slot pills (no `LockedStatusBadge`) |
| **TK205AnalysisPage.jsx** | `fnh3`, `cnh3`, `tcl`, `pcl` (Unit: Kgm/m³) | 12 Time Slots (`t07`..`t05`, 2-hourly) | Static `<div select-none>` date text container | Custom slot pills (no `LockedStatusBadge`) |
| **TK207AnalysisPage.jsx** | `fnh3`, `cnh3`, `tcl`, `pcl` (Unit: Kgm/m³) | 12 Time Slots (`t07`..`t05`, 2-hourly) | Static `<div select-none>` date text container | Custom slot pills (no `LockedStatusBadge`) |
| **BrineAnalysisPage.jsx** | `nacl`, `ca`, `mg`, `so4` (Unit: g/L) | 2 Equipment Rows (`tk109`, `tk110`) | Static `<div shadow-2xs>` date text container | Custom badge elements |
| **PureSaltSieveAnalysisPage.jsx** | `p18` (BSS 18), `p44` (BSS 44), `p60` (BSS 60), `p100` (BSS 100), `m100` (-100) | 3 Shift Rows (`shift1`, `shift2`, `shift3`) | `<LockedDateDisplay>` (unconditionally locked to `getOperatingDateIST()`) | `RecordStatusBadge` (line 656) |
| **TK204AnalysisPage.jsx** | `fnh3`, `cnh3`, `tcl`, `pcl` (Unit: Kgm/m³) | 3 Shift Rows (`shift1`, `shift2`, `shift3`) | `<LockedDateDisplay>` (unconditionally locked to `getOperatingDateIST()`) | `RecordStatusBadge` (line 694) |
