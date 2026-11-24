# QCL Analysis Pages UI Scan

**Scan Date**: 2026-11-24
**Total Analysis Files Scanned**: 61
**Source Directory**: `client/src/pages/company/*AnalysisPage.jsx`

---

## ACL300AnalysisPage.jsx (796 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### ACL300_COMPONENTS (Lines 27-31)
```javascript
const ACL300_COMPONENTS = [
  { key: 'p18',  label: '+18 %',  subLabel: '+18 Mesh Particle Spec', unit: '%', placeholder: '00.5' },
  { key: 'p44',  label: '+44 %',  subLabel: '+44 Mesh Particle Spec', unit: '%', placeholder: '71.8' },
  { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', unit: '%', placeholder: '0.72' },
];
```

#### SHIFTS (Lines 33-55)
```javascript
const SHIFTS = [
  {
    key: 'shift1',
    name: 'SHIFT 1',
    timing: '06:00 – 14:00 (I Shift)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    key: 'shift2',
    name: 'SHIFT 2',
    timing: '14:00 – 22:00 (II Shift)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'shift3',
    name: 'SHIFT 3',
    timing: '22:00 – 06:00 (III Shift)',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    iconColor: 'text-teal-600',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L28 [unit = '%']: { key: 'p18',  label: '+18 %',  subLabel: '+18 Mesh Particle Spec', unit: '%', placeholder: '00.5' },
L29 [unit = '%']: { key: 'p44',  label: '+44 %',  subLabel: '+44 Mesh Particle Spec', unit: '%', placeholder: '71.8' },
L30 [unit = '%']: { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', unit: '%', placeholder: '0.72' },
L388 [analysisType = 'ACL 300# Analysis']: analysisType: 'ACL 300# Analysis',
L389 [unit = 'ACL 300#']: unit: 'ACL 300#',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L621: <thead>
L622: <tr className="bg-slate-50/90 border-b border-slate-200">
```

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L106: const [date]                                      = useState(() => getOperatingDateIST());
L551: <LockedDateDisplay date={date} id="acl300-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L557: <StatusSaveButton
L686: <RecordStatusBadge status={getShiftStatus(shift.key)} />
L759: <ConfirmSaveModal
```

---

## ACLProductAnalysisPage.jsx (830 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### CHEMICAL_PARAMETERS (Lines 27-35)
```javascript
const CHEMICAL_PARAMETERS = [
  { key: 'nh4cl', label: 'NH₄Cl %', subLabel: 'Ammonium Chloride', unit: '%', placeholder: '97.40' },
  { key: 'nacl',  label: 'NaCl %',  subLabel: 'Sodium Chloride',   unit: '%', placeholder: '0.72' },
  { key: 'fe2o3', label: 'Fe₂O₃ %', subLabel: 'Ferric Oxide',      unit: '%', placeholder: '0.0055' },
  { key: 'h2o',   label: 'H₂O %',   subLabel: 'Moisture',          unit: '%', placeholder: '0.12' },
  { key: 'ir',    label: 'IR %',    subLabel: 'Insoluble Residue', unit: '%', placeholder: '0.32' },
  { key: 'bd',    label: 'BD',      subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '1000' },
  { key: 'p18_spec', label: '+18 %', subLabel: 'Oversize Particle Spec', unit: '%', placeholder: '00.5' },
];
```

#### BSS_PARAMETERS (Lines 39-49)
```javascript
const BSS_PARAMETERS = [
  { key: 'p6',    label: '+6 %',   mesh: '+6 Mesh',   placeholder: '0.0' },
  { key: 'p8',    label: '+8 %',   mesh: '+8 Mesh',   placeholder: '0.0' },
  { key: 'p12',   label: '+12 %',  mesh: '+12 Mesh',  placeholder: '0.0' },
  { key: 'p16',   label: '+16 %',  mesh: '+16 Mesh',  placeholder: '0.0' },
  { key: 'p18',   label: '+18 %',  mesh: '+18 Mesh',  placeholder: '00.5' },
  { key: 'p44',   label: '+44 %',  mesh: '+44 Mesh',  placeholder: '71.8' },
  { key: 'p60',   label: '+60 %',  mesh: '+60 Mesh',  placeholder: '17.9' },
  { key: 'p100',  label: '+100 %', mesh: '+100 Mesh', placeholder: '09.4' },
  { key: 'm100',  label: '-100 %', mesh: '-100 Mesh', placeholder: '00.4' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L28 [unit = '%']: { key: 'nh4cl', label: 'NH₄Cl %', subLabel: 'Ammonium Chloride', unit: '%', placeholder: '97.40' },
L29 [unit = '%']: { key: 'nacl',  label: 'NaCl %',  subLabel: 'Sodium Chloride',   unit: '%', placeholder: '0.72' },
L30 [unit = '%']: { key: 'fe2o3', label: 'Fe₂O₃ %', subLabel: 'Ferric Oxide',      unit: '%', placeholder: '0.0055' },
L31 [unit = '%']: { key: 'h2o',   label: 'H₂O %',   subLabel: 'Moisture',          unit: '%', placeholder: '0.12' },
L32 [unit = '%']: { key: 'ir',    label: 'IR %',    subLabel: 'Insoluble Residue', unit: '%', placeholder: '0.32' },
L33 [unit = 'g/L']: { key: 'bd',    label: 'BD',      subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '1000' },
L34 [unit = '%']: { key: 'p18_spec', label: '+18 %', subLabel: 'Oversize Particle Spec', unit: '%', placeholder: '00.5' },
L365 [analysisType = 'ACL Product Analysis']: analysisType: 'ACL Product Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L23: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L100: const [date]                                      = useState(() => getOperatingDateIST());
L509: <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L534: <StatusSaveButton
L785: <ConfirmSaveModal
```

---

## AbsorberDrainLiqAnalysisPage.jsx (714 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 42-79)
```javascript
const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '90–110 PPM',
    placeholder: '100',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '1–3 PPM',
    placeholder: '2',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '0–20 PPM',
    placeholder: '10',
    colClass: 'min-w-[150px]',
  },
];
```

#### WEEKLY_ROWS (Lines 81-87)
```javascript
const WEEKLY_ROWS = [
  {
    key: 'week',
    label: 'Weekly Analysis',
    frequencyBadge: 'Once in a Week',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L47 [unit = 'PPM']: unit: 'PPM',
L56 [unit = 'PPM']: unit: 'PPM',
L65 [unit = 'PPM']: unit: 'PPM',
L74 [unit = 'PPM']: unit: 'PPM',
L309 [analysisType = 'ABSORBER DRAIN LIQ Analysis']: analysisType: 'ABSORBER DRAIN LIQ Analysis',
L311 [unit = 'ABSORBER DRAIN LIQ']: unit: 'ABSORBER DRAIN LIQ',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L520: <thead>
L521: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L104: const [date] = useState(() => getOperatingDateIST());
L465: <LockedDateDisplay date={date} id="absorber-drain-liq-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L469: <StatusSaveButton
L570: <RecordStatusBadge status={weeklyStatus} />
L698: <SaveConfirmationModal
```

---

## AbsorberInletAnalysisPage.jsx (876 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 42-109)
```javascript
const PARAMETERS = [
  {
    key: 'co2',
    label: 'CO2',
    formula: 'Carbon Dioxide (%)',
    unit: '%',
    target: '11%',
    tolerance: '±1.0%',
    range: '10–12%',
    placeholder: '11.0',
    colClass: 'min-w-[120px] border-r border-slate-800/50',
  },
  {
    key: 'o2',
    label: 'O2',
    formula: 'Oxygen (%)',
    unit: '%',
    target: '9%',
    tolerance: '±1.0%',
    range: '8–10%',
    placeholder: '9.0',
    colClass: 'min-w-[120px] border-r border-slate-800/50',
  },
  {
    key: 'co',
    label: 'CO',
    formula: 'Carbon Monoxide (PPM)',
    unit: 'PPM',
    target: '500 PPM',
    tolerance: '±50 PPM',
    range: '450–550 PPM',
    placeholder: '500',
    colClass: 'min-w-[125px] border-r border-slate-800/50',
  },
  {
    key: 'no',
    label: 'NO',
    formula: 'Nitric Oxide (PPM)',
    unit: 'PPM',
    target: '50 PPM',
    tolerance: '±20 PPM',
    range: '30–70 PPM',
    placeholder: '50',
    colClass: 'min-w-[125px] border-r border-slate-800/50',
  },
  {
    key: 'nox',
    label: 'NOX',
    formula: 'Nitrogen Oxides (PPM)',
    unit: 'PPM',
    target: '50 PPM',
    tolerance: '±20 PPM',
    range: '30–70 PPM',
    placeholder: '50',
    colClass: 'min-w-[125px] border-r border-slate-800/50',
  },
  {
    key: 'no2',
    label: 'NO2',
    formula: 'Nitrogen Dioxide (PPM)',
    unit: 'PPM',
    target: '2 PPM',
    tolerance: '±1.0 PPM',
    range: '1–3 PPM',
    placeholder: '2.0',
    colClass: 'min-w-[125px]',
  },
];
```

#### SHIFT_ROWS (Lines 112-116)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L47 [unit = '%']: unit: '%',
L58 [unit = '%']: unit: '%',
L69 [unit = 'PPM']: unit: 'PPM',
L80 [unit = 'PPM']: unit: 'PPM',
L91 [unit = 'PPM']: unit: 'PPM',
L102 [unit = 'PPM']: unit: 'PPM',
L446 [analysisType = 'Absorber Inlet Analysis']: analysisType: 'Absorber Inlet Analysis',
L448 [unit = 'Absorber Inlet']: unit: 'Absorber Inlet',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L668: <thead>
L669: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L157: const [date] = useState(() => getOperatingDateIST());
L611: <LockedDateDisplay date={date} id="absorber-inlet-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L615: <StatusSaveButton
L720: <RecordStatusBadge status={shiftStatus} />
L860: <SaveConfirmationModal
```

---

## BFWAnalysisPage.jsx (940 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L26: } from '../../utils/offsetAnalysisHelper';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L28: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_BFW_READINGS (Lines 30-44)
```javascript
const DEFAULT_BFW_READINGS = [
  {
    id: 'r1',
    stream: 'Boiler Feed Water (BFW)',
    frequency: 'Day',
    time: '15:00',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    tAlk: '',
    sio2: '',
    fe2o3: '',
  },
];
```

#### DEFAULT_SHS_READINGS (Lines 46-60)
```javascript
const DEFAULT_SHS_READINGS = [
  {
    id: 'r2',
    stream: 'Super Heated Steam (SHS)',
    frequency: 'Day',
    time: '15:00',
    ph: '',
    cond: '',
    th: '',
    alk: '',
    tAlk: '',
    sio2: '',
    fe2o3: '',
  },
];
```

#### NUMERIC_FIELDS (Lines 62-62)
```javascript
const NUMERIC_FIELDS = ['ph', 'cond', 'alk', 'sio2'];
```

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L492: <thead>
L493: <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
```

### 5. Date Mechanism Lines
```jsx
L22: LockedDateDisplay,
L28: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L85: const [date] = useState(() => getOperatingDateIST());
L399: <LockedDateDisplay date={date} badgeText="Operating Day" id="bfw-locked-date" />
```

### 6. Control & Modal Lines
```jsx
L23: RecordStatusBadge,
L24: StatusSaveButton,
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L397: {/* Action Buttons: StatusBadge, Reset & StatusSaveButton */}
L401: <RecordStatusBadge
L407: <StatusSaveButton
L904: <ConfirmSaveModal
```

---

## BL1204BL1203AnalysisPage.jsx (862 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 38-72)
```javascript
const PARAMETERS = [
  {
    key: 'co2',
    label: 'CO2',
    formula: 'Carbon Dioxide (%)',
    unit: '%',
    target: '15%',
    tolerance: '±1.0%',
    range: '14–16%',
    placeholder: '15.0',
    colClass: 'min-w-[130px] border-r border-slate-800/50',
  },
  {
    key: 'o2',
    label: 'O2',
    formula: 'Oxygen (%)',
    unit: '%',
    target: '6%',
    tolerance: '±1.0%',
    range: '5–7%',
    placeholder: '6.0',
    colClass: 'min-w-[130px] border-r border-slate-800/50',
  },
  {
    key: 'co',
    label: 'CO',
    formula: 'Carbon Monoxide (PPM)',
    unit: 'PPM',
    target: '1000 PPM',
    tolerance: '±50 PPM',
    range: '950–1050 PPM',
    placeholder: '1000',
    colClass: 'min-w-[140px]',
  },
];
```

#### SHIFT_ROWS (Lines 75-79)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L43 [unit = '%']: unit: '%',
L54 [unit = '%']: unit: '%',
L65 [unit = 'PPM']: unit: 'PPM',
L415 [analysisType = 'BL1204/BL1203 Analysis']: analysisType: 'BL1204/BL1203 Analysis',
L417 [unit = 'BL1204/BL1203']: unit: 'BL1204/BL1203',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L643: <thead>
L644: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L120: const [date] = useState(() => getOperatingDateIST());
L583: <LockedDateDisplay date={date} id="bl1204-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L587: <StatusSaveButton
L698: <RecordStatusBadge status={shiftStatus} />
L846: <SaveConfirmationModal
```

---

## BicarbonateAnalysisPage.jsx (583 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L14: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L15: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L16: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### BICARB_SLOTS (Lines 18-20)
```javascript
const BICARB_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];
```

#### DEFAULT_READINGS (Lines 22-35)
```javascript
const DEFAULT_READINGS = [
  { id: 'r1',  time: '06:30', filter: 'F-1', naclNa2co3: '', isDefault: true },
  { id: 'r2',  time: '08:30', filter: 'F-1', naclNa2co3: '', isDefault: true },
  { id: 'r3',  time: '10:30', filter: '',    naclNa2co3: '', isDefault: true },
  { id: 'r4',  time: '12:30', filter: 'F-2', naclNa2co3: '', isDefault: true },
  { id: 'r5',  time: '14:30', filter: 'F-2', naclNa2co3: '', isDefault: true },
  { id: 'r6',  time: '16:30', filter: 'F-3', naclNa2co3: '', isDefault: true },
  { id: 'r7',  time: '18:30', filter: 'F-3', naclNa2co3: '', isDefault: true },
  { id: 'r8',  time: '20:30', filter: 'F-4', naclNa2co3: '', isDefault: true },
  { id: 'r9',  time: '22:30', filter: 'F-4', naclNa2co3: '', isDefault: true },
  { id: 'r10', time: '00:30', filter: 'F-5', naclNa2co3: '', isDefault: true },
  { id: 'r11', time: '02:30', filter: 'F-5', naclNa2co3: '', isDefault: true },
  { id: 'r12', time: '04:30', filter: '',    naclNa2co3: '', isDefault: true },
];
```

#### FILTER_OPTIONS (Lines 37-48)
```javascript
const FILTER_OPTIONS = [
  { value: '', label: 'Select Filter' },
  { value: 'F-1', label: 'F-1 (Filter 1)' },
  { value: 'F-2', label: 'F-2 (Filter 2)' },
  { value: 'F-3', label: 'F-3 (Filter 3)' },
  { value: 'F-4', label: 'F-4 (Filter 4)' },
  { value: 'F-5', label: 'F-5 (Filter 5)' },
  { value: 'F-6', label: 'F-6 (Filter 6)' },
  { value: 'F-7', label: 'F-7 (Filter 7)' },
  { value: 'F-8', label: 'F-8 (Filter 8)' },
  { value: 'All', label: 'All Filters' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L310 [unit = 'Bi carbonate']: unit: 'Bi carbonate',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L442: <thead className="sticky top-0 bg-slate-900 text-white z-10 select-none shadow-sm">
```

### 5. Date Mechanism Lines
```jsx
L16: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L72: const [date]                                      = useState(() => getOperatingDateIST());
L402: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L14: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L15: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L16: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L411: <StatusSaveButton
L485: <RecordStatusBadge status={slotStatus} />
L561: <ConfirmSaveModal
```

---

## BicarbonateMoistureAnalysisPage.jsx (765 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### BICARBONATE_MOISTURE_LIMITS (Lines 25-74)
```javascript
export const BICARBONATE_MOISTURE_LIMITS = {
  m404_a: {
    key: 'm404_a',
    option: 'A',
    paramName: 'Moisture Option A',
    label: 'Option A',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
  m404_b: {
    key: 'm404_b',
    option: 'B',
    paramName: 'Moisture Option B',
    label: 'Option B',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
  m404_c: {
    key: 'm404_c',
    option: 'C',
    paramName: 'Moisture Option C',
    label: 'Option C',
    target: 20,
    tolerance: 2.0,
    min: 18,
    max: 22,
    unit: '%',
    formattedRange: '18% – 22%',
    formattedTarget: '20%',
    formattedTolerance: '±2.0%',
    frequency: 'Once in 4 Hours',
    hasLimit: true,
  },
};
```

#### DEFAULT_READINGS (Lines 76-82)
```javascript
const DEFAULT_READINGS = [
  { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
  { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
];
```

#### NUMERIC_FIELDS (Lines 84-91)
```javascript
const NUMERIC_FIELDS = [
  'm404_a',
  'm404_b',
  'm404_c',
  'm405_outlet',
  'sb_turb1',
  'sb_turb2',
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L35 [unit = '%']: unit: '%',
L51 [unit = '%']: unit: '%',
L67 [unit = '%']: unit: '%',
L321 [unit = 'Bicarbonate Moisture']: unit: 'Bicarbonate Moisture',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L483: <thead>
L484: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
L531: <tr className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider text-center">
```

### 5. Date Mechanism Lines
```jsx
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L103: const [date]                                      = useState(() => getOperatingDateIST());
L459: {/* Table top title banner with LockedDateDisplay */}
L472: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L431: <StatusSaveButton
L570: <RecordStatusBadge status={slotStatus} />
L742: <ConfirmSaveModal
```

---

## BottomAshAnalysisPage.jsx (710 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L24: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS (Lines 27-31)
```javascript
const DEFAULT_READINGS = [
  { id: '1', time: '07:00', combustible: '', gcv: '', moisture: '' },
  { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
];
```

#### DEFAULT_LOCKS (Lines 33-46)
```javascript
const DEFAULT_LOCKS = {
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift1Locked: false,
  shift2Locked: false,
  shift3Locked: false,
  shift1: false,
  shift2: false,
  shift3: false,
  shift1Edits: 0,
  shift2Edits: 0,
  shift3Edits: 0,
};
```

#### NUMERIC_FIELDS (Lines 48-48)
```javascript
const NUMERIC_FIELDS = ['combustible', 'gcv', 'moisture'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L313 [unit = 'Bottom ash']: unit: 'Bottom ash',
L314 [analysisType = 'Bottom Ash Analysis']: analysisType: 'Bottom Ash Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L462: <thead>
L463: <tr className="bg-slate-800 text-white font-semibold text-xs border-b border-slate-700">
```

### 5. Date Mechanism Lines
```jsx
L17: getOperatingDateIST,
L18: LockedDateDisplay,
L60: const [date] = useState(() => getOperatingDateIST());
L436: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L19: RecordStatusBadge,
L20: StatusSaveButton,
L22: SaveConfirmationModal,
L408: <StatusSaveButton
L521: <RecordStatusBadge status={shiftStatus} />
L694: <SaveConfirmationModal
```

---

## BrineAnalysisPage.jsx (719 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L24: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L25: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L26: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 30-35)
```javascript
const PARAMETERS = [
  { key: 'nacl', label: 'NaCl', unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'ca',   label: 'Ca',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'mg',   label: 'Mg',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'so4',  label: 'SO₄',  unit: 'g/L', colClass: 'min-w-[130px]' },
];
```

#### ROWS (Lines 37-40)
```javascript
const ROWS = [
  { key: 'tk109', label: 'TK 109', tankType: 'Storage Tank', highlightType: 'tk109' },
  { key: 'tk110', label: 'TK 110', tankType: 'Feed Tank',    highlightType: 'tk110' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L31 [unit = 'g/L']: { key: 'nacl', label: 'NaCl', unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L32 [unit = 'g/L']: { key: 'ca',   label: 'Ca',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L33 [unit = 'g/L']: { key: 'mg',   label: 'Mg',   unit: 'g/L', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L34 [unit = 'g/L']: { key: 'so4',  label: 'SO₄',  unit: 'g/L', colClass: 'min-w-[130px]' },
L316 [analysisType = 'Brine Analysis']: analysisType: 'Brine Analysis',
L318 [unit = 'g/L']: unit: 'g/L',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L524: <thead>
L525: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L26: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L109: const [date]                                      = useState(() => getOperatingDateIST());
L460: <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L24: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L25: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L484: <StatusSaveButton
L689: <ConfirmSaveModal
```

---

## CBDAnalysisPage.jsx (632 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L11: } from '../../utils/co2AnalysisHelper';
L14: import { useToast } from '../../components/common/Toast';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SHIFTS (Lines 24-52)
```javascript
const SHIFTS = [
  {
    key: 'iShift',
    lockKey: 'shift1',
    label: 'I SHIFT',
    desc: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
    badgeStyle: 'bg-blue-100 text-blue-900 border border-blue-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiShift',
    lockKey: 'shift2',
    label: 'II SHIFT',
    desc: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiiShift',
    lockKey: 'shift3',
    label: 'III SHIFT',
    desc: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badgeStyle: 'bg-purple-100 text-purple-900 border border-purple-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
];
```

#### PARAMETERS (Lines 54-63)
```javascript
const PARAMETERS = [
  { key: 'ph',     label: 'pH',     rawLabel: 'pH',     unit: '',    placeholder: '0.00', step: '0.1' },
  { key: 'po4',    label: 'PO₄',    rawLabel: 'PO4',    unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'na2so3', label: 'Na₂SO₃', rawLabel: 'Na2SO3', unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'talk',   label: 'T.Alk',  rawLabel: 'T.Alk',  unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tfe',    label: 'T.Fe',   rawLabel: 'T.Fe',   unit: 'ppm', placeholder: '0.00', step: '0.1' },
  { key: 'sio2',   label: 'SiO₂',   rawLabel: 'SiO2',   unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'ss',     label: 'SS',     rawLabel: 'SS',     unit: 'ppm', placeholder: '0.00', step: '1' },
  { key: 'tds',    label: 'TDS',    rawLabel: 'TDS',    unit: 'ppm', placeholder: '0.00', step: '1' },
];
```

#### PARAM_KEYS (Lines 65-65)
```javascript
const PARAM_KEYS = ['ph', 'po4', 'na2so3', 'talk', 'tfe', 'sio2', 'ss', 'tds'];
```

#### DEFAULT_LOCKS (Lines 73-86)
```javascript
const DEFAULT_LOCKS = {
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift1Locked: false,
  shift2Locked: false,
  shift3Locked: false,
  shift1: false,
  shift2: false,
  shift3: false,
  shift1Edits: 0,
  shift2Edits: 0,
  shift3Edits: 0,
};
```

### 3. Payload Literals (analysisType, unit)
```javascript
L56 [unit = 'ppm']: { key: 'po4',    label: 'PO₄',    rawLabel: 'PO4',    unit: 'ppm', placeholder: '0.00', step: '1' },
L57 [unit = 'ppm']: { key: 'na2so3', label: 'Na₂SO₃', rawLabel: 'Na2SO3', unit: 'ppm', placeholder: '0.00', step: '1' },
L58 [unit = 'ppm']: { key: 'talk',   label: 'T.Alk',  rawLabel: 'T.Alk',  unit: 'ppm', placeholder: '0.00', step: '1' },
L59 [unit = 'ppm']: { key: 'tfe',    label: 'T.Fe',   rawLabel: 'T.Fe',   unit: 'ppm', placeholder: '0.00', step: '0.1' },
L60 [unit = 'ppm']: { key: 'sio2',   label: 'SiO₂',   rawLabel: 'SiO2',   unit: 'ppm', placeholder: '0.00', step: '1' },
L61 [unit = 'ppm']: { key: 'ss',     label: 'SS',     rawLabel: 'SS',     unit: 'ppm', placeholder: '0.00', step: '1' },
L62 [unit = 'ppm']: { key: 'tds',    label: 'TDS',    rawLabel: 'TDS',    unit: 'ppm', placeholder: '0.00', step: '1' },
L320 [unit = 'CBD']: unit: 'CBD',
L321 [analysisType = 'CBD Analysis']: analysisType: 'CBD Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L491: <thead>
L492: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L4: getOperatingDateIST,
L5: LockedDateDisplay,
L99: const [date] = useState(() => getOperatingDateIST());
L448: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L6: RecordStatusBadge,
L7: StatusSaveButton,
L9: SaveConfirmationModal,
L413: <StatusSaveButton
L462: <RecordStatusBadge status={status} />
L532: <RecordStatusBadge status={status} />
L616: <SaveConfirmationModal
```

---

## CR202AnalysisPage.jsx (1428 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L25: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L26: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L27: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### CR202_LIMITS (Lines 39-96)
```javascript
export const CR202_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 3.10,
    tolerance: 0.10,
    min: 3.00,
    max: 3.20,
    unit: 'Kgm/m³',
    formattedRange: '3.00–3.20 Kgm/m³',
    formattedTarget: '3.10 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.10',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 2.98,
    tolerance: 0.10,
    min: 2.88,
    max: 3.08,
    unit: 'Kgm/m³',
    formattedRange: '2.88–3.08 Kgm/m³',
    formattedTarget: '2.98 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '2.98',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 4.65,
    tolerance: 0.10,
    min: 4.55,
    max: 4.75,
    unit: 'Kgm/m³',
    formattedRange: '4.55–4.75 Kgm/m³',
    formattedTarget: '4.65 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '4.65',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 1.90,
    tolerance: 0.10,
    min: 1.80,
    max: 2.00,
    unit: 'Kgm/m³',
    formattedRange: '1.80–2.00 Kgm/m³',
    formattedTarget: '1.90 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.90',
  },
};
```

#### STREAMS (Lines 99-108)
```javascript
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[80px] border-r border-slate-800/50' },
];
```

#### TIME_SLOTS (Lines 111-118)
```javascript
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftGroup: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftGroup: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftGroup: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftGroup: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftGroup: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftGroup: 'shift3' },
];
```

#### SHIFT_MAPPING (Lines 120-124)
```javascript
const SHIFT_MAPPING = [
  { key: 'shift1', name: 'I SHIFT (06:00 – 14:00)', slotKeys: ['t07', 't11'] },
  { key: 'shift2', name: 'II SHIFT (14:00 – 22:00)', slotKeys: ['t15', 't19'] },
  { key: 'shift3', name: 'III SHIFT (22:00 – 06:00)', slotKeys: ['t23', 't03'] },
];
```

#### UNITS_ORDER (Lines 126-126)
```javascript
const UNITS_ORDER = ['t07', 't11', 't15', 't19', 't23', 't03'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L48 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L62 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L76 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L90 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L777 [analysisType = 'CR 202 Analysis']: analysisType: 'CR 202 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L1068: <thead>
L1070: <tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
L1090: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L27: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L371: const [date]                                      = useState(() => getOperatingDateIST());
L984: <Calendar className="w-3.5 h-3.5 text-slate-500" />
L989: type="date"
```

### 6. Control & Modal Lines
```jsx
L25: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L26: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L1005: <StatusSaveButton
L1363: <ConfirmSaveModal
```

---

## CR203AnalysisPage.jsx (1329 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L25: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L26: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L27: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### CR203_LIMITS (Lines 39-96)
```javascript
export const CR203_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 3.17,
    tolerance: 0.10,
    min: 3.07,
    max: 3.27,
    unit: 'Kgm/m³',
    formattedRange: '3.07–3.27 Kgm/m³',
    formattedTarget: '3.17 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.17',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 1.98,
    tolerance: 0.10,
    min: 1.88,
    max: 2.08,
    unit: 'Kgm/m³',
    formattedRange: '1.88–2.08 Kgm/m³',
    formattedTarget: '1.98 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.98',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 5.64,
    tolerance: 0.10,
    min: 5.54,
    max: 5.74,
    unit: 'Kgm/m³',
    formattedRange: '5.54–5.74 Kgm/m³',
    formattedTarget: '5.64 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.64',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 3.66,
    tolerance: 0.10,
    min: 3.56,
    max: 3.76,
    unit: 'Kgm/m³',
    formattedRange: '3.56–3.76 Kgm/m³',
    formattedTarget: '3.66 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.66',
  },
};
```

#### STREAMS (Lines 99-108)
```javascript
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[80px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[80px] border-r border-slate-800/50' },
];
```

#### TIME_SLOTS (Lines 111-118)
```javascript
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftGroup: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftGroup: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftGroup: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftGroup: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftGroup: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftGroup: 'shift3' },
];
```

#### UNITS_ORDER (Lines 120-120)
```javascript
const UNITS_ORDER = ['t07', 't11', 't15', 't19', 't23', 't03'];
```

#### SHIFT_MAPPING (Lines 122-126)
```javascript
const SHIFT_MAPPING = [
  { key: 'shift1', name: 'I SHIFT (06:00 – 14:00)', slotKeys: ['t07', 't11'] },
  { key: 'shift2', name: 'II SHIFT (14:00 – 22:00)', slotKeys: ['t15', 't19'] },
  { key: 'shift3', name: 'III SHIFT (22:00 – 06:00)', slotKeys: ['t23', 't03'] },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L48 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L62 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L76 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L90 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L758 [analysisType = 'CR 203 Analysis']: analysisType: 'CR 203 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L1010: <thead>
L1012: <tr className="bg-slate-950 text-white text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
L1029: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L27: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L355: const [date]                                      = useState(() => getOperatingDateIST());
L916: <Calendar className="w-3.5 h-3.5 text-slate-500" />
L921: type="date"
```

### 6. Control & Modal Lines
```jsx
L25: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L26: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L947: <StatusSaveButton
L1270: <ConfirmSaveModal
```

---

## CaCl2AnalysisPage.jsx (1145 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L24: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS (Lines 31-43)
```javascript
const DEFAULT_READINGS = [
  {
    id: 'cacl2_1',
    sample: 'CaCl2 Solution',
    frequency: 'Day',
    time: '08:00',
    ph: '',
    conc: '',
    fnh3: '',
    cnh3: '',
    ss: '',
  },
];
```

#### NUMERIC_FIELDS (Lines 45-45)
```javascript
const NUMERIC_FIELDS = ['ph', 'conc', 'fnh3', 'cnh3', 'ss'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L333 [unit = 'CaCl2']: unit: 'CaCl2',
L335 [analysisType = 'CaCl2 Analysis']: analysisType: 'CaCl2 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L558: <thead>
L559: <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
```

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L24: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L86: const [date]                                      = useState(() => getOperatingDateIST());
L475: <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L497: <StatusSaveButton
L1106: <ConfirmSaveModal
```

---

## CoolingWaterAnalysisPage.jsx (604 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L13: } from '../../utils/offsetAnalysisHelper';
L14: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L15: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS_DAY (Lines 27-34)
```javascript
const DEFAULT_READINGS_DAY = [
  { id: 't07', time: '07:00', ...emptyRowCW },
  { id: 't09', time: '09:00', ...emptyRowCW },
  { id: 't11', time: '11:00', ...emptyRowCW },
  { id: 't13', time: '13:00', ...emptyRowCW },
  { id: 't15', time: '15:00', ...emptyRowCW },
  { id: 't17', time: '17:00', ...emptyRowCW },
];
```

#### DEFAULT_READINGS_200 (Lines 36-39)
```javascript
const DEFAULT_READINGS_200 = [
  { id: 't07', time: '07:00', ...emptyRow200 },
  { id: 't19', time: '19:00', ...emptyRow200 },
];
```

#### SLOTS_CW (Lines 41-41)
```javascript
const SLOTS_CW = ['t07', 't09', 't11', 't13', 't15', 't17'];
```

#### SLOTS_200 (Lines 42-42)
```javascript
const SLOTS_200 = ['t07', 't19'];
```

#### CW_NUMERIC_FIELDS (Lines 44-44)
```javascript
const CW_NUMERIC_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh'];
```

#### CW_ALL_FIELDS (Lines 45-45)
```javascript
const CW_ALL_FIELDS = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh', 'ammn'];
```

#### CW200_NUMERIC_FIELDS (Lines 47-47)
```javascript
const CW200_NUMERIC_FIELDS = ['ph', 'frc', 'opo4', 'cl'];
```

#### CW200_ALL_FIELDS (Lines 48-48)
```javascript
const CW200_ALL_FIELDS = ['ph', 'frc', 'opo4', 'cl'];
```

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L367: <thead>
L368: <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
```

### 5. Date Mechanism Lines
```jsx
L9: LockedDateDisplay,
L15: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L66: const [date] = useState(() => getOperatingDateIST());
L329: <LockedDateDisplay date={date} badgeText="Operating Day" id="cw-locked-date" />
L361: <LockedDateDisplay date={date} id="cw-date-display" />
```

### 6. Control & Modal Lines
```jsx
L10: StatusSaveButton,
L11: RecordStatusBadge,
L14: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L332: <RecordStatusBadge
L339: <StatusSaveButton
L551: <RecordStatusBadge
L576: <ConfirmSaveModal
```

---

## DCCDrainLiqAnalysisPage.jsx (718 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 42-79)
```javascript
const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '490–510 PPM',
    placeholder: '500',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '1400–1600 PPM',
    placeholder: '1500',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '8–12 PPM',
    placeholder: '10',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '40–60 PPM',
    placeholder: '50',
    colClass: 'min-w-[150px]',
  },
];
```

#### WEEKLY_ROWS (Lines 81-87)
```javascript
const WEEKLY_ROWS = [
  {
    key: 'week',
    label: 'Weekly Analysis',
    frequencyBadge: 'Once in a Week',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L47 [unit = 'PPM']: unit: 'PPM',
L56 [unit = 'PPM']: unit: 'PPM',
L65 [unit = 'PPM']: unit: 'PPM',
L74 [unit = 'PPM']: unit: 'PPM',
L313 [analysisType = 'DCC DRAIN LIQ Analysis']: analysisType: 'DCC DRAIN LIQ Analysis',
L315 [unit = 'DCC DRAIN LIQ']: unit: 'DCC DRAIN LIQ',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L524: <thead>
L525: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L104: const [date] = useState(() => getOperatingDateIST());
L469: <LockedDateDisplay date={date} id="dcc-drain-liq-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L473: <StatusSaveButton
L574: <RecordStatusBadge status={weeklyStatus} />
L702: <SaveConfirmationModal
```

---

## DMWaterAnalysisPage.jsx (937 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L20: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L27: } from '../../utils/offsetAnalysisHelper';
L28: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SLOT_KEYS (Lines 37-37)
```javascript
const SLOT_KEYS = ['dm_water', 'a_unit'];
```

#### USER_FIELDS (Lines 38-38)
```javascript
const USER_FIELDS = ['ph', 'cond', 'th', 'alk', 'sio2'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L43 [unit = 'DM WATER']: unit: 'DM WATER',
L57 [unit = 'A.UNIT']: unit: 'A.UNIT',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L496: <thead>
L497: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
```

### 5. Date Mechanism Lines
```jsx
L20: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L23: LockedDateDisplay,
L104: const [date] = useState(() => getOperatingDateIST());
L447: <LockedDateDisplay date={date} badgeText="Operating Day" id="dm-locked-date" />
L489: <LockedDateDisplay date={date} id="dm-date-display" />
```

### 6. Control & Modal Lines
```jsx
L24: RecordStatusBadge,
L25: StatusSaveButton,
L28: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L449: <RecordStatusBadge
L455: <StatusSaveButton
L878: <RecordStatusBadge
L906: <ConfirmSaveModal
```

---

## DistillerWasteAnalysisPage.jsx (641 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L10: } from '../../utils/offsetAnalysisHelper';
L11: import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
L14: import { useToast } from '../../components/common/Toast';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS (Lines 29-36)
```javascript
const DEFAULT_READINGS = [
  { id: 't0630', time: '06:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0730', time: '07:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0830', time: '08:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't0930', time: '09:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't1030', time: '10:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
  { id: 't1130', time: '11:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' },
];
```

#### SLOTS (Lines 38-38)
```javascript
const SLOTS = ['t0630', 't0730', 't0830', 't0930', 't1030', 't1130'];
```

#### NUMERIC_FIELDS (Lines 39-39)
```javascript
const NUMERIC_FIELDS = ['exCao', 'fnh3', 'cnh3', 'tnh3', 'nahco3'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L201 [unit = 'Distiller waste']: unit: 'Distiller waste',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L389: <thead>
L390: <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider font-extrabold select-none">
```

### 5. Date Mechanism Lines
```jsx
L5: LockedDateDisplay,
L11: import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
L19: Calendar,
L52: const [date] = useState(() => getOperatingDateIST());
L348: <LockedDateDisplay date={date} badgeText="Operating Day" id="distiller-locked-date" />
```

### 6. Control & Modal Lines
```jsx
L6: RecordStatusBadge,
L7: StatusSaveButton,
L11: import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
L350: <RecordStatusBadge
L356: <StatusSaveButton
L570: <RecordStatusBadge status={slotBadgeStatus} />
L592: <SaveConfirmationModal
```

---

## E501T501AnalysisPage.jsx (1200 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS (Lines 31-56)
```javascript
const DEFAULT_READINGS = [
  {
    id: '1',
    shift: 'I',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '',
    t501_na2co3: '',
  },
  {
    id: '2',
    shift: 'II',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '',
    t501_na2co3: '',
  },
  {
    id: '3',
    shift: 'III',
    e501_fnh3: '',
    e501_na2co3: '',
    t501_fnh3: '',
    t501_na2co3: '',
  },
];
```

#### NUMERIC_FIELDS (Lines 58-63)
```javascript
const NUMERIC_FIELDS = [
  'e501_fnh3',
  'e501_na2co3',
  't501_fnh3',
  't501_na2co3',
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L340 [unit = 'E 501 / T 501']: unit: 'E 501 / T 501',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L580: <thead>
L582: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
L617: <tr className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider text-center">
```

### 5. Date Mechanism Lines
```jsx
L9: Calendar,
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L102: const [date]                                          = useState(() => getOperatingDateIST());
L528: <LockedDateDisplay date={date} id="e501-t501-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L485: <StatusSaveButton
L664: <RecordStatusBadge status={shiftStatus} />
L1164: <ConfirmSaveModal
```

---

## FlyAshAnalysisPage.jsx (653 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L24: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS (Lines 27-31)
```javascript
const DEFAULT_READINGS = [
  { id: '1', time: '07:00', combustible: '', gcv: '' },
  { id: '2', time: '15:00', combustible: '', gcv: '' },
  { id: '3', time: '23:00', combustible: '', gcv: '' },
];
```

#### DEFAULT_LOCKS (Lines 33-46)
```javascript
const DEFAULT_LOCKS = {
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift1Locked: false,
  shift2Locked: false,
  shift3Locked: false,
  shift1: false,
  shift2: false,
  shift3: false,
  shift1Edits: 0,
  shift2Edits: 0,
  shift3Edits: 0,
};
```

#### NUMERIC_FIELDS (Lines 48-48)
```javascript
const NUMERIC_FIELDS = ['combustible', 'gcv'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L310 [unit = 'Bottom ash']: unit: 'Bottom ash',
L311 [analysisType = 'Fly Ash Analysis']: analysisType: 'Fly Ash Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L459: <thead>
L460: <tr className="bg-slate-800 text-white font-semibold text-xs border-b border-slate-700">
```

### 5. Date Mechanism Lines
```jsx
L17: getOperatingDateIST,
L18: LockedDateDisplay,
L60: const [date] = useState(() => getOperatingDateIST());
L433: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L19: RecordStatusBadge,
L20: StatusSaveButton,
L22: SaveConfirmationModal,
L405: <StatusSaveButton
L511: <RecordStatusBadge status={shiftStatus} />
L637: <SaveConfirmationModal
```

---

## GasConcAnalysisPage.jsx (1239 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L26: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L32: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### NUMERIC_FIELDS (Lines 39-39)
```javascript
const NUMERIC_FIELDS = ['recoveryCo2Con', 'cleaningGas', 'bottomGas'];
```

#### SHIFT_INFO (Lines 57-61)
```javascript
const SHIFT_INFO = {
  shift1: { key: 'shift1', name: 'SHIFT 1', time: '06:00-14:00', defaultTime: '08:00' },
  shift2: { key: 'shift2', name: 'SHIFT 2', time: '14:00-22:00', defaultTime: '16:00' },
  shift3: { key: 'shift3', name: 'SHIFT 3', time: '22:00-06:00', defaultTime: '23:00' },
};
```

### 3. Payload Literals (analysisType, unit)
```javascript
L485 [unit = 'Gas Conc.']: unit: 'Gas Conc.',
L486 [analysisType = 'Gas Conc. Analysis']: analysisType: 'Gas Conc. Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L722: <thead>
L723: <tr className="bg-slate-900 text-white font-bold text-[11px] tracking-wider uppercase border-b border-slate-800">
```

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L32: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L92: const [selectedDate] = useState(() => getOperatingDateIST());
L587: <LockedDateDisplay
L713: <Calendar className="w-3.5 h-3.5 text-slate-500" />
L727: <Calendar className="w-3.5 h-3.5 text-slate-400" />
L782: type="date"
L1125: <Calendar className="w-3 h-3 text-slate-500" />
```

### 6. Control & Modal Lines
```jsx
L26: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L32: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L609: <StatusSaveButton
L639: <div><RecordStatusBadge status={shiftStatuses.shift1} /></div>
L657: <div><RecordStatusBadge status={shiftStatuses.shift2} /></div>
L675: <div><RecordStatusBadge status={shiftStatuses.shift3} /></div>
L821: <RecordStatusBadge status={shiftStatus} />
L1133: <ConfirmSaveModal
```

---

## LSA500AnalysisPage.jsx (658 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L15: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L16: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L17: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### LSA500_SLOTS (Lines 19-21)
```javascript
const LSA500_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];
```

#### DEFAULT_ROWS (Lines 23-39)
```javascript
const DEFAULT_ROWS = [
  { id: 'r1',  time: '06:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r2',  time: '08:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r3',  time: '10:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r4',  time: '12:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r5',  time: '14:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r6',  time: '16:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r7',  time: '18:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r8',  time: '20:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r9',  time: '22:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r10', time: '00:30', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r11', time: '02:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r12', time: '04:00', nacl: '', bd: '', turbidity: '', isDefault: true },
  { id: 'r13', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
  { id: 'r14', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
  { id: 'r15', time: '',      nacl: '', bd: '', turbidity: '', isDefault: false },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L314 [analysisType = 'LSA AT 500# Analysis']: analysisType: 'LSA AT 500# Analysis',
L315 [unit = 'LSA AT 500#']: unit: 'LSA AT 500#',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L462: <thead className="sticky top-0 bg-slate-900 text-white z-10 select-none shadow-sm">
```

### 5. Date Mechanism Lines
```jsx
L17: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L63: const [date]                                          = useState(() => getOperatingDateIST());
L422: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L15: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L16: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L17: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L431: <StatusSaveButton
L508: <RecordStatusBadge status={slotStatus} />
L635: <ConfirmSaveModal
```

---

## LSABaggingAnalysisPage.jsx (1308 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L26: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L34: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SHIFT_COMPONENTS (Lines 38-47)
```javascript
const SHIFT_COMPONENTS = [
  { key: 'na2co3',    label: 'Na₂CO₃ %', subLabel: 'Sodium Carbonate',  unit: '%',   placeholder: '99.20' },
  { key: 'nacl',      label: 'NaCl %',   subLabel: 'Sodium Chloride',   unit: '%',   placeholder: '0.72' },
  { key: 'fe',        label: 'Fe₂O₃ %',  subLabel: 'Iron Content',      unit: '%',   placeholder: '0.0070' },
  { key: 'na2so4',    label: 'Na₂SO₄ %', subLabel: 'Sodium Sulphate',   unit: '%',   placeholder: '0.080' },
  { key: 'vm',        label: 'VM %',     subLabel: 'Volatile Matter',   unit: '%',   placeholder: '2.00' },
  { key: 'ir',        label: 'IR %',     subLabel: 'Insoluble Residue', unit: '%',   placeholder: '0.150' },
  { key: 'bd',        label: 'BD (g/L)', subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '635' },
  { key: 'turbidity', label: 'Turbidity',subLabel: 'Solution Turbidity',unit: 'NTU', placeholder: '80' },
];
```

#### SHIFTS (Lines 49-71)
```javascript
const SHIFTS = [
  {
    key: 'shift1',
    name: 'SHIFT 1',
    timing: '06:00 – 14:00 (I Shift)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    key: 'shift2',
    name: 'SHIFT 2',
    timing: '14:00 – 22:00 (II Shift)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'shift3',
    name: 'SHIFT 3',
    timing: '22:00 – 06:00 (III Shift)',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    iconColor: 'text-teal-600',
  },
];
```

#### DEFAULT_HOURLY_SLOTS (Lines 90-120)
```javascript
const DEFAULT_HOURLY_SLOTS = [
  // Shift 1 (06:00 - 14:00)
  { id: 'h0600', time: '06:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0700', time: '07:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0800', time: '08:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0900', time: '09:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1000', time: '10:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1100', time: '11:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1200', time: '12:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1300', time: '13:00', shift: 'Shift 1', nacl: '', bd: '' },

  // Shift 2 (14:00 - 22:00)
  { id: 'h1400', time: '14:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1500', time: '15:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1600', time: '16:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1700', time: '17:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1800', time: '18:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1900', time: '19:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2000', time: '20:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2100', time: '21:00', shift: 'Shift 2', nacl: '', bd: '' },

  // Shift 3 (22:00 - 06:00)
  { id: 'h2200', time: '22:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h2300', time: '23:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0000', time: '00:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0100', time: '01:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0200', time: '02:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0300', time: '03:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0400', time: '04:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0500', time: '05:00', shift: 'Shift 3', nacl: '', bd: '' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L39 [unit = '%']: { key: 'na2co3',    label: 'Na₂CO₃ %', subLabel: 'Sodium Carbonate',  unit: '%',   placeholder: '99.20' },
L40 [unit = '%']: { key: 'nacl',      label: 'NaCl %',   subLabel: 'Sodium Chloride',   unit: '%',   placeholder: '0.72' },
L41 [unit = '%']: { key: 'fe',        label: 'Fe₂O₃ %',  subLabel: 'Iron Content',      unit: '%',   placeholder: '0.0070' },
L42 [unit = '%']: { key: 'na2so4',    label: 'Na₂SO₄ %', subLabel: 'Sodium Sulphate',   unit: '%',   placeholder: '0.080' },
L43 [unit = '%']: { key: 'vm',        label: 'VM %',     subLabel: 'Volatile Matter',   unit: '%',   placeholder: '2.00' },
L44 [unit = '%']: { key: 'ir',        label: 'IR %',     subLabel: 'Insoluble Residue', unit: '%',   placeholder: '0.150' },
L45 [unit = 'g/L']: { key: 'bd',        label: 'BD (g/L)', subLabel: 'Bulk Density',      unit: 'g/L', placeholder: '635' },
L46 [unit = 'NTU']: { key: 'turbidity', label: 'Turbidity',subLabel: 'Solution Turbidity',unit: 'NTU', placeholder: '80' },
L656 [analysisType = 'LSA Bagging Analysis']: analysisType: 'LSA Bagging Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L1034: <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L34: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L158: const [date] = useState(() => getOperatingDateIST());
L759: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L26: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L34: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L836: <RecordStatusBadge status={shiftStatus.status} />
L1292: <ConfirmSaveModal
```

---

## LSABaggingSieveAnalysisPage.jsx (566 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L18: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L19: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L20: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SIEVE_SLOTS (Lines 22-24)
```javascript
const SIEVE_SLOTS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12'
];
```

#### TIME_TO_SLOT (Lines 26-30)
```javascript
const TIME_TO_SLOT = {
  '09:30': 'r1', '10:30': 'r2', '11:30': 'r3', '14:30': 'r4',
  '16:30': 'r5', '18:30': 'r6', '20:30': 'r7', '22:30': 'r8',
  '00:30': 'r9', '02:30': 'r10', '04:30': 'r11', '06:30': 'r12',
};
```

#### PARAMETERS (Lines 33-38)
```javascript
const PARAMETERS = [
  { key: 'bss10', legacyKey: 'p10', label: 'BSS 10', unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss30', legacyKey: 'p30', label: 'BSS 30', unit: '%', placeholder: '1.8', colClass: 'min-w-[130px]' },
  { key: 'm30',   legacyKey: 'p60', label: '-30',    unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
  { key: 'bss60', legacyKey: 'm60', label: 'BSS 60', unit: '%', placeholder: '5.8', colClass: 'min-w-[130px]' },
];
```

#### DEFAULT_ROWS (Lines 40-53)
```javascript
const DEFAULT_ROWS = [
  { id: 'r1',  time: '09:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r2',  time: '10:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r3',  time: '11:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r4',  time: '14:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r5',  time: '16:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r6',  time: '18:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r7',  time: '20:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r8',  time: '22:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r9',  time: '00:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r10', time: '02:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r11', time: '04:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
  { id: 'r12', time: '06:30', bss10: '', bss30: '', m30: '', bss60: '', p10: '', p30: '', p60: '', m60: '', isDefault: true },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L34 [unit = '%']: { key: 'bss10', legacyKey: 'p10', label: 'BSS 10', unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
L35 [unit = '%']: { key: 'bss30', legacyKey: 'p30', label: 'BSS 30', unit: '%', placeholder: '1.8', colClass: 'min-w-[130px]' },
L36 [unit = '%']: { key: 'm30',   legacyKey: 'p60', label: '-30',    unit: '%', placeholder: '0.0', colClass: 'min-w-[125px]' },
L37 [unit = '%']: { key: 'bss60', legacyKey: 'm60', label: 'BSS 60', unit: '%', placeholder: '5.8', colClass: 'min-w-[130px]' },
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L429: <thead className="sticky top-0 bg-slate-900 text-white z-10 select-none shadow-sm">
```

### 5. Date Mechanism Lines
```jsx
L20: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L77: const [date]                                          = useState(() => getOperatingDateIST());
L389: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L18: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L19: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L20: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L398: <StatusSaveButton
L480: <RecordStatusBadge status={slotStatus} />
L543: <ConfirmSaveModal
```

---

## LSAShiftAnalysisPage.jsx (773 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L17: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L18: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L19: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SHIFTS (Lines 27-61)
```javascript
const SHIFTS = [
  {
    key: 'iShift',
    label: 'I SHIFT',
    desc: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/60 hover:bg-sky-100/70 border-l-4 border-l-blue-600',
    badgeStyle: 'bg-blue-100 text-blue-900 border border-blue-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiShift',
    label: 'II SHIFT',
    desc: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/40 hover:bg-indigo-100/60 border-l-4 border-l-indigo-600',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'iiiShift',
    label: 'III SHIFT',
    desc: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/40 hover:bg-purple-100/60 border-l-4 border-l-purple-600',
    badgeStyle: 'bg-purple-100 text-purple-900 border border-purple-200 font-extrabold',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'composite',
    label: 'COMPOSITE',
    desc: '24-Hour Composite',
    isComposite: true,
    rowStyle: 'bg-amber-50/50 hover:bg-amber-100/70 border-l-4 border-l-amber-500',
    badgeStyle: 'bg-amber-100 text-amber-950 border border-amber-300 font-black',
    inputFocus: 'border-2 border-amber-300 bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-100 text-slate-950 font-bold hover:border-amber-400',
  },
];
```

#### PARAMETERS (Lines 64-73)
```javascript
const PARAMETERS = [
  { key: 'na2co3',    label: 'Na₂CO₃', rawLabel: 'Na2CO3', unit: '%', isPercent: true,  placeholder: '0.00', step: '0.1' },
  { key: 'nacl',      label: 'NaCl',   rawLabel: 'NaCl',   unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
  { key: 'fe',        label: 'Fe',     rawLabel: 'Fe',     unit: '%', isPercent: true,  placeholder: '0.0000', step: '0.0001' },
  { key: 'na2so4',    label: 'Na₂SO₄', rawLabel: 'Na2SO4', unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
  { key: 'vm',        label: 'VM',     rawLabel: 'VM',     unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
  { key: 'ir',        label: 'IR',     rawLabel: 'IR',     unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
  { key: 'bd',        label: 'BD',     rawLabel: 'BD',     unit: 'g/L', isPercent: false, placeholder: '0.00', step: '1' },
  { key: 'turbidity', label: 'TURBIDITY SOLUTION', rawLabel: 'TURBIDITY', unit: 'NTU', isPercent: false, placeholder: '0.00', step: '1' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L65 [unit = '%']: { key: 'na2co3',    label: 'Na₂CO₃', rawLabel: 'Na2CO3', unit: '%', isPercent: true,  placeholder: '0.00', step: '0.1' },
L66 [unit = '%']: { key: 'nacl',      label: 'NaCl',   rawLabel: 'NaCl',   unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
L67 [unit = '%']: { key: 'fe',        label: 'Fe',     rawLabel: 'Fe',     unit: '%', isPercent: true,  placeholder: '0.0000', step: '0.0001' },
L68 [unit = '%']: { key: 'na2so4',    label: 'Na₂SO₄', rawLabel: 'Na2SO4', unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
L69 [unit = '%']: { key: 'vm',        label: 'VM',     rawLabel: 'VM',     unit: '%', isPercent: true,  placeholder: '0.00', step: '0.01' },
L70 [unit = '%']: { key: 'ir',        label: 'IR',     rawLabel: 'IR',     unit: '%', isPercent: true,  placeholder: '0.000', step: '0.001' },
L71 [unit = 'g/L']: { key: 'bd',        label: 'BD',     rawLabel: 'BD',     unit: 'g/L', isPercent: false, placeholder: '0.00', step: '1' },
L72 [unit = 'NTU']: { key: 'turbidity', label: 'TURBIDITY SOLUTION', rawLabel: 'TURBIDITY', unit: 'NTU', isPercent: false, placeholder: '0.00', step: '1' },
L358 [unit = 'LSA']: unit: 'LSA',
L359 [analysisType = 'LSA Shift Analysis']: analysisType: 'LSA Shift Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L557: <thead>
L558: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L19: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L116: const [date]                                          = useState(() => getOperatingDateIST());
L546: <LockedDateDisplay date={date} id="lsa-shift-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L17: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L18: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L19: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from '../../utils/co2AnalysisHelper';
L504: <StatusSaveButton
L600: <RecordStatusBadge status={shiftStatus} />
L747: <ConfirmSaveModal
```

---

## LeanAnalysisPage.jsx (1136 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L29: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SHIFT_PARAMETERS (Lines 38-83)
```javascript
const SHIFT_PARAMETERS = [
  {
    key: 'loading',
    label: 'LOADING',
    formula: 'Loading (g of CO2/g of solvent)',
    unit: 'g of CO2/g of solvent',
    target: '0.2000 g of CO2 / g of solvent',
    tolerance: '±0.05',
    range: '0.1500–0.2500 g of CO2 / g of solvent',
    placeholder: '0.2000',
    colClass: 'min-w-[190px] border-r border-slate-800/50',
  },
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (%)',
    unit: '%',
    target: '30%',
    tolerance: '±5%',
    range: '25–35%',
    placeholder: '30.0',
    colClass: 'min-w-[130px] border-r border-slate-800/50',
  },
  {
    key: 'foamheight',
    label: 'FOAM HEIGHT',
    formula: 'Foam Height (CM)',
    unit: 'CM',
    target: '5 CM',
    tolerance: '±2 CM',
    range: '3–7 CM',
    placeholder: '5.0',
    colClass: 'min-w-[130px] border-r border-slate-800/50',
  },
  {
    key: 'collapsetime',
    label: 'COLLAPSE TIME',
    formula: 'Collapse Time (sec)',
    unit: 'sec',
    target: '10 sec',
    tolerance: '±2 sec',
    range: '8–12 sec',
    placeholder: '10.0',
    colClass: 'min-w-[130px]',
  },
];
```

#### DAY_PARAMETERS (Lines 87-121)
```javascript
const DAY_PARAMETERS = [
  {
    key: 'hss',
    label: 'HSS',
    formula: 'Heat Stable Salts (%)',
    unit: '%',
    target: '2.0%',
    tolerance: '±0.1%',
    range: '1.9–2.1%',
    placeholder: '2.0',
    colClass: 'min-w-[140px] border-r border-slate-800/50',
  },
  {
    key: 'density',
    label: 'DENSITY',
    formula: 'Density (Kg/cc)',
    unit: 'Kg/cc',
    target: '1040 Kg/cc',
    tolerance: '±10',
    range: '1030–1050 Kg/cc',
    placeholder: '1040',
    colClass: 'min-w-[140px] border-r border-slate-800/50',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    target: '50 PPM',
    tolerance: '±10 PPM',
    range: '40–60 PPM',
    placeholder: '50',
    colClass: 'min-w-[140px]',
  },
];
```

#### SHIFT_ROWS (Lines 123-127)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L43 [unit = 'g of CO2/g of solvent']: unit: 'g of CO2/g of solvent',
L54 [unit = '%']: unit: '%',
L65 [unit = 'CM']: unit: 'CM',
L76 [unit = 'sec']: unit: 'sec',
L92 [unit = '%']: unit: '%',
L103 [unit = 'Kg/cc']: unit: 'Kg/cc',
L114 [unit = 'PPM']: unit: 'PPM',
L494 [analysisType = 'Lean Analysis']: analysisType: 'Lean Analysis',
L496 [unit = 'Lean']: unit: 'Lean',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L728: <thead>
L729: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L21: getOperatingDateIST,
L23: LockedDateDisplay,
L172: const [date] = useState(() => getOperatingDateIST());
L667: <LockedDateDisplay date={date} id="lean-date-display" />
```

### 6. Control & Modal Lines
```jsx
L24: RecordStatusBadge,
L25: StatusSaveButton,
L27: SaveConfirmationModal,
L671: <StatusSaveButton
L780: <RecordStatusBadge status={shiftStatus} />
L1120: <SaveConfirmationModal
```

---

## LeanWeeklyAnalysisPage.jsx (755 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 46-119)
```javascript
const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '450–550 PPM',
    placeholder: '500',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '140–160 PPM',
    placeholder: '150',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '28–32 PPM',
    placeholder: '30',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '20–40 PPM',
    placeholder: '30',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'na',
    label: 'Na',
    formula: 'Sodium (PPM)',
    unit: 'PPM',
    range: '490–510 PPM',
    placeholder: '500',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'k',
    label: 'K',
    formula: 'Potassium (PPM)',
    unit: 'PPM',
    range: '950–1050 PPM',
    placeholder: '1000',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'no2',
    label: 'NO2',
    formula: 'Nitrite (PPM)',
    unit: 'PPM',
    range: '20–40 PPM',
    placeholder: '30',
    colClass: 'min-w-[130px]',
  },
  {
    key: 'no3',
    label: 'NO3',
    formula: 'Nitrate (PPM)',
    unit: 'PPM',
    range: '590–610 PPM',
    placeholder: '600',
    colClass: 'min-w-[130px]',
  },
];
```

#### WEEKLY_ROWS (Lines 121-127)
```javascript
const WEEKLY_ROWS = [
  {
    key: 'week',
    label: 'Weekly Analysis',
    frequencyBadge: 'Once in a Week',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L51 [unit = 'PPM']: unit: 'PPM',
L60 [unit = 'PPM']: unit: 'PPM',
L69 [unit = 'PPM']: unit: 'PPM',
L78 [unit = 'PPM']: unit: 'PPM',
L87 [unit = 'PPM']: unit: 'PPM',
L96 [unit = 'PPM']: unit: 'PPM',
L105 [unit = 'PPM']: unit: 'PPM',
L114 [unit = 'PPM']: unit: 'PPM',
L349 [analysisType = 'LEAN Weekly Analysis']: analysisType: 'LEAN Weekly Analysis',
L351 [unit = 'LEAN']: unit: 'LEAN',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L560: <thead>
L561: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L144: const [date] = useState(() => getOperatingDateIST());
L505: <LockedDateDisplay date={date} id="lean-weekly-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L509: <StatusSaveButton
L610: <RecordStatusBadge status={weeklyStatus} />
L739: <SaveConfirmationModal
```

---

## OutletAnalysisPage.jsx (823 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 38-61)
```javascript
const PARAMETERS = [
  {
    key: 'co2',
    label: 'CO2',
    formula: 'Carbon Dioxide (%)',
    unit: '%',
    target: '1.0%',
    tolerance: '±1.0%',
    range: '0–2%',
    placeholder: '1.0',
    colClass: 'min-w-[160px] border-r border-slate-800/50',
  },
  {
    key: 'co',
    label: 'CO',
    formula: 'Carbon Monoxide (PPM)',
    unit: 'PPM',
    target: '300 PPM',
    tolerance: '±50 PPM',
    range: '250–350 PPM',
    placeholder: '300',
    colClass: 'min-w-[160px]',
  },
];
```

#### SHIFT_ROWS (Lines 64-68)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L43 [unit = '%']: unit: '%',
L54 [unit = 'PPM']: unit: 'PPM',
L394 [analysisType = 'Outlet Analysis']: analysisType: 'Outlet Analysis',
L396 [unit = 'Outlet']: unit: 'Outlet',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L616: <thead>
L617: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L108: const [date] = useState(() => getOperatingDateIST());
L559: <LockedDateDisplay date={date} id="outlet-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L563: <StatusSaveButton
L668: <RecordStatusBadge status={shiftStatus} />
L807: <SaveConfirmationModal
```

---

## P1256AnalysisPage.jsx (804 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 36-48)
```javascript
const PARAMETERS = [
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (%)',
    unit: '%',
    target: '0.20%',
    tolerance: '±0.10%',
    range: '0.10–0.30%',
    placeholder: '0.20',
    colClass: 'min-w-[180px]',
  },
];
```

#### SHIFT_ROWS (Lines 50-54)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L41 [unit = '%']: unit: '%',
L377 [analysisType = 'P1256 Analysis']: analysisType: 'P1256 Analysis',
L379 [unit = 'P1256']: unit: 'P1256',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L597: <thead>
L598: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L91: const [date] = useState(() => getOperatingDateIST());
L542: <LockedDateDisplay date={date} id="p1256-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L546: <StatusSaveButton
L649: <RecordStatusBadge status={shiftStatus} />
L788: <SaveConfirmationModal
```

---

## P413WSCTankAnalysisPage.jsx (957 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_P413_LIMITS (Lines 37-102)
```javascript
export const SA_P413_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    formula: 'Free Ammonia (FNH₃)',
    target: 1.58,
    tolerance: 0.10,
    min: 1.48,
    max: 1.68,
    unit: 'Kgm/m³',
    formattedRange: '1.48–1.68 Kgm/m³',
    formattedTarget: '1.58 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.58',
    hasLimit: true,
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    formula: 'Combined Ammonia (CNH₃)',
    target: 4.09,
    tolerance: 0.10,
    min: 3.99,
    max: 4.19,
    unit: 'Kgm/m³',
    formattedRange: '3.99–4.19 Kgm/m³',
    formattedTarget: '4.09 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '4.09',
    hasLimit: true,
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    formula: 'Total Chlorine (T.Cl)',
    target: 5.45,
    tolerance: 0.10,
    min: 5.35,
    max: 5.55,
    unit: 'Kgm/m³',
    formattedRange: '5.35–5.55 Kgm/m³',
    formattedTarget: '5.45 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.45',
    hasLimit: true,
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    formula: 'Polymer Chloride (P.Cl)',
    target: 1.36,
    tolerance: 0.10,
    min: 1.26,
    max: 1.46,
    unit: 'Kgm/m³',
    formattedRange: '1.26–1.46 Kgm/m³',
    formattedTarget: '1.36 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.36',
    hasLimit: true,
  },
};
```

#### PARAMETERS (Lines 104-109)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '1.58', hasLimit: true },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '4.09', hasLimit: true },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.45', hasLimit: true },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '1.36', hasLimit: true },
];
```

#### SHIFTS (Lines 111-130)
```javascript
const SHIFTS = [
  {
    key: 's1',
    label: 'I SHIFT',
    time: '07:00 – 15:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
  },
  {
    key: 's2',
    label: 'II SHIFT',
    time: '15:00 – 23:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
  },
  {
    key: 's3',
    label: 'III SHIFT',
    time: '23:00 – 07:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L47 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L63 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L79 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L95 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L431 [analysisType = 'P413 WSC TANK Analysis']: analysisType: 'P413 WSC TANK Analysis',
L433 [unit = 'P413 WSC TANK']: unit: 'P413 WSC TANK',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L716: <thead>
L717: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L179: const [date]                                      = useState(() => getOperatingDateIST());
L650: {/* Read-only Operating Day Display via LockedDateDisplay */}
L651: <LockedDateDisplay date={date} id="p413sa-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L656: <StatusSaveButton
L920: <ConfirmSaveModal
```

---

## P4171AnalysisPage.jsx (794 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from "../../components/common/Toast";
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_P417_LIMITS (Lines 36-80)
```javascript
export const SA_P417_LIMITS = {
  fnh3: {
    key: "fnh3",
    paramName: "FNH3",
    label: "FNH₃",
    formula: "Free Ammonia (FNH₃)",
    target: 2.08,
    tolerance: 0.10,
    min: 1.98,
    max: 2.18,
    unit: "Kgm/m³",
    formattedRange: "1.98–2.18 Kgm/m³",
    formattedTarget: "2.08 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "2.08",
    hasLimit: true,
  },
  cnh3: {
    key: "cnh3",
    paramName: "CNH3",
    label: "CNH₃",
    formula: "Combined Ammonia (CNH₃)",
    unit: "",
    placeholder: "0.00",
    hasLimit: false,
  },
  tcl: {
    key: "tcl",
    paramName: "TCL",
    label: "TCl",
    formula: "Total Chlorine (T.Cl)",
    unit: "",
    placeholder: "0.00",
    hasLimit: false,
  },
  nacl: {
    key: "nacl",
    paramName: "NACL",
    label: "NaCl",
    formula: "Sodium Chloride (NaCl)",
    unit: "",
    placeholder: "0.00",
    hasLimit: false,
  },
};
```

#### PARAMETERS (Lines 82-87)
```javascript
const PARAMETERS = [
  { key: "fnh3", label: "FNH₃", formula: "Free Ammonia (FNH₃)", placeholder: "2.08", hasLimit: true },
  { key: "cnh3", label: "CNH₃", formula: "Combined Ammonia (CNH₃)", placeholder: "0.00", hasLimit: false },
  { key: "tcl",  label: "TCl",  formula: "Total Chlorine (T.Cl)",  placeholder: "0.00", hasLimit: false },
  { key: "nacl", label: "NaCl", formula: "Sodium Chloride (NaCl)", placeholder: "0.00", hasLimit: false },
];
```

#### SHIFTS (Lines 89-108)
```javascript
const SHIFTS = [
  {
    key: "s1",
    label: "I SHIFT",
    time: "07:00 – 15:00",
    rowStyle: "bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600",
  },
  {
    key: "s2",
    label: "II SHIFT",
    time: "15:00 – 23:00",
    rowStyle: "bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600",
  },
  {
    key: "s3",
    label: "III SHIFT",
    time: "23:00 – 07:00",
    rowStyle: "bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600",
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L46 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L408 [analysisType = 'P417 Analysis']: analysisType: "P417 Analysis",
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L582: <thead>
L583: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L23: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L142: const [date] = useState(() => getOperatingDateIST());
L568: <LockedDateDisplay date={date} id="p4171-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L525: <StatusSaveButton
L763: <ConfirmSaveModal
```

---

## P4172AnalysisPage.jsx (19 lines)

### 1. Imports from `../../components/` and `../../utils/`
NOT FOUND

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
NOT FOUND

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
NOT FOUND

### 6. Control & Modal Lines
NOT FOUND

---

## P4173AnalysisPage.jsx (19 lines)

### 1. Imports from `../../components/` and `../../utils/`
NOT FOUND

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
NOT FOUND

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
NOT FOUND

### 6. Control & Modal Lines
NOT FOUND

---

## P417AnalysisPage.jsx (118 lines)

### 1. Imports from `../../components/` and `../../utils/`
NOT FOUND

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### P417_VARIANTS (Lines 16-38)
```javascript
const P417_VARIANTS = [
  {
    key: 'p417-1',
    label: 'P417-1',
    name: 'P417-1',
    subtitle: 'Shift Twice • FNH₃ Limit: 1.98–2.18 Kgm/m³',
    badge: 'Shift Twice',
  },
  {
    key: 'p417-2',
    label: 'P417-2',
    name: 'P417-2',
    subtitle: '3 Shifts • FNH₃ / CNH₃ / TCl / NaCl',
    badge: '3 Shifts',
  },
  {
    key: 'p417-3',
    label: 'P417-3',
    name: 'P417-3',
    subtitle: '3 Shifts • FNH₃ / CNH₃ / TCl / NaCl',
    badge: '3 Shifts',
  },
];
```

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
NOT FOUND

### 6. Control & Modal Lines
NOT FOUND

---

## PclTclAnalysisPage.jsx (931 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PCL_TCL_LIMITS (Lines 37-53)
```javascript
export const PCL_TCL_LIMITS = {
  pcltcl: {
    key: 'pcltcl',
    paramName: 'PCL/TCL',
    label: 'PCL/TCL',
    target: 0.10,
    tolerance: 0.20,
    min: 0.03,
    max: 0.30,
    unit: 'Kgm/m³',
    formattedRange: '0.03–0.30 Kgm/m³',
    formattedTarget: '0.05–0.10 Kgm/m³',
    formattedTolerance: '+0.2 / -0.02',
    notation: '0.05–0.10 Kgm/m³ +0.2 / -0.02',
    placeholder: '0.10',
  },
};
```

#### STREAMS (Lines 56-65)
```javascript
const STREAMS = [
  { key: 'a', label: 'A', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'b', label: 'B', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'c', label: 'C', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'd', label: 'D', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'e', label: 'E', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'f', label: 'F', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'g', label: 'G', colClass: 'min-w-[85px] border-r border-slate-800/50' },
  { key: 'h', label: 'H', colClass: 'min-w-[85px]' },
];
```

#### SHIFTS (Lines 68-90)
```javascript
const SHIFTS = [
  {
    key: 'shift1',
    label: 'I SHIFT',
    time: '06:00 – 14:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'shift2',
    label: 'II SHIFT',
    time: '14:00 – 22:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400',
  },
  {
    key: 'shift3',
    label: 'III SHIFT',
    time: '22:00 – 06:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
    inputFocus: 'border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L46 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L539 [analysisType = 'PCL/TCL Analysis']: analysisType: 'PCL/TCL Analysis',
L540 [unit = 'PCL/TCL']: unit: 'PCL/TCL',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L801: <thead>
L802: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L24: getOperatingDateIST,
L25: LockedDateDisplay,
L259: const [date]                                      = useState(() => getOperatingDateIST());
L751: <LockedDateDisplay date={date} id="pcltcl-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L26: RecordStatusBadge,
L757: <StatusSaveButton
L839: <RecordStatusBadge status={getShiftStatus(shift.key)} />
L897: <ConfirmSaveModal
```

---

## PlantAnalysisPage.jsx (1037 lines)

### 1. Imports from `../../components/` and `../../utils/`
NOT FOUND

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### ACL_ANALYSIS_OPTIONS (Lines 68-84)
```javascript
const ACL_ANALYSIS_OPTIONS = [
  'Pure salt analysis',
  'Brine analysis',
  'Pure salt sieve analysis',
  'TK 203',
  'TK 204',
  'TK 209',
  'TK 205',
  'TK 207',
  'Cr 202',
  'Cr 203',
  'PCL/TCL',
  'Cacl2',
  'ACL Product',
  'ACL 300#',
  'Raw salt',
];
```

#### SA_ANALYSIS_OPTIONS (Lines 87-103)
```javascript
const SA_ANALYSIS_OPTIONS = [
  'TK 401',
  'TK 405',
  'TK 414 TSC TANK',
  'P413 WSC TANK',
  'TK 419 SC TANK',
  'P417',
  'T 401',
  'Bi carbonate',
  'Bicarbonate Moisture',
  'LSA at 500#',
  'LSA',
  'E 501 / T 501',
  'LSA Bagging',
  'LSA Bagging sieve',
  'Gas Conc',
];
```

#### OFFSITE_ANALYSIS_OPTIONS (Lines 106-118)
```javascript
const OFFSITE_ANALYSIS_OPTIONS = [
  'DM water',
  'Boiler Feed Water / Super Heated Steam',
  'Raw Water',
  'CBD',
  'Bottom ash',
  'FLY ash',
  'Distiller waste',
  'Vaccum seal water',
  'Sewar Water',
  'cooling water',
  'cooling water/200#',
];
```

#### CO2_ANALYSIS_OPTIONS (Lines 121-136)
```javascript
const CO2_ANALYSIS_OPTIONS = [
  'BL1204/BL1203',
  'Absorber inlet',
  'Outlet',
  'Lean',
  'Rich',
  'Washwater',
  'P1256',
  'Reflux',
  'TK1251',
  'TK1252',
  'DCC DRAIN LIQ',
  'SOX DRAIN LIQ',
  'ABSORBER DRAIN LIQ',
  'LEAN',
];
```

#### PLANT_CONFIG (Lines 138-216)
```javascript
const PLANT_CONFIG = {
  acl: {
    title: 'ACL Plant',
    subtitle: 'Ammonium Chloride Production Unit',
    options: ACL_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Factory,
  },
  plant_acl: {
    title: 'ACL Plant',
    subtitle: 'Ammonium Chloride Production Unit',
    options: ACL_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Factory,
  },
  sa: {
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    options: SA_ANALYSIS_OPTIONS,
    badge: '15 Analysis Options',
    icon: Flame,
  },
  plant_sa: {
    title: 'SA Plant',
    subtitle: 'Soda Ash Production Unit',
    options: SA_ANALYSIS_OPTIONS,
    badge: '15 Analysis Options',
    icon: Flame,
  },
  offset: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  offsite: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  plant_offset: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  plant_offsite: {
    title: 'OFFSET Plant',
    subtitle: 'Offsite Utilities & Facilities Unit',
    options: OFFSITE_ANALYSIS_OPTIONS,
    badge: '11 Analysis Options',
    icon: Globe,
  },
  co2: {
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Capture & Recovery Unit',
    options: CO2_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Gauge,
  },
  c02: {
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Capture & Recovery Unit',
    options: CO2_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Gauge,
  },
  plant_co2: {
    title: 'CO2 Plant',
    subtitle: 'Carbon Dioxide Capture & Recovery Unit',
    options: CO2_ANALYSIS_OPTIONS,
    badge: '14 Analysis Options',
    icon: Gauge,
  },
};
```

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
NOT FOUND

### 6. Control & Modal Lines
NOT FOUND

---

## PureSaltAnalysisPage.jsx (839 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L12: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L17: } from '../../utils/co2AnalysisHelper';
L18: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 37-44)
```javascript
const PARAMETERS = [
  { key: 'nacl', label: 'NaCl %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'ca', label: 'Ca %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'mg', label: 'Mg %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'so4', label: 'SO₄ %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'ir', label: 'IR %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
  { key: 'h2o', label: 'H₂O %', unit: '%', colClass: 'min-w-[105px]' },
];
```

#### ROWS (Lines 46-52)
```javascript
const ROWS = [
  { key: 'rawSalt', label: 'RAW SALT', highlight: true, highlightType: 'raw' },
  { key: 'shift1', label: 'I SHIFT', highlight: false, highlightType: 'shift1' },
  { key: 'shift2', label: 'II SHIFT', highlight: false, highlightType: 'shift2' },
  { key: 'shift3', label: 'III SHIFT', highlight: false, highlightType: 'shift3' },
  { key: 'composition', label: 'COMPOSITION', highlight: true, highlightType: 'comp' },
];
```

#### SHIFT_DISPLAY_NAMES (Lines 54-60)
```javascript
const SHIFT_DISPLAY_NAMES = {
  rawSalt: 'RAW SALT',
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
  composition: 'COMPOSITION',
};
```

### 3. Payload Literals (analysisType, unit)
```javascript
L38 [unit = '%']: { key: 'nacl', label: 'NaCl %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
L39 [unit = '%']: { key: 'ca', label: 'Ca %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
L40 [unit = '%']: { key: 'mg', label: 'Mg %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
L41 [unit = '%']: { key: 'so4', label: 'SO₄ %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
L42 [unit = '%']: { key: 'ir', label: 'IR %', unit: '%', colClass: 'min-w-[105px] border-r border-slate-800/50' },
L43 [unit = '%']: { key: 'h2o', label: 'H₂O %', unit: '%', colClass: 'min-w-[105px]' },
L465 [analysisType = 'Pure Salt Analysis']: analysisType: 'Pure Salt Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L636: <thead>
L637: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L14: getOperatingDateIST,
L15: LockedDateDisplay,
L21: Calendar,
L163: const [date, setDate] = useState(() => getOperatingDateIST());
L297: setDate(getOperatingDateIST());
L584: <LockedDateDisplay date={date} id="psa-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L12: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L16: RecordStatusBadge,
L18: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L590: <StatusSaveButton
L676: <RecordStatusBadge status={getRowStatus(row.key)} />
L812: <ConfirmSaveModal
```

---

## PureSaltSieveAnalysisPage.jsx (805 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L26: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L32: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 36-42)
```javascript
const PARAMETERS = [
  { key: 'p18',  label: 'BSS 18',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p44',  label: 'BSS 44',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p60',  label: 'BSS 60',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'p100', label: 'BSS 100', unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
  { key: 'm100', label: '-100',    unit: '%', colClass: 'min-w-[110px]' },
];
```

#### ROWS (Lines 44-48)
```javascript
const ROWS = [
  { key: 'shift1', label: 'I SHIFT',   badgeText: 'Shift 1', highlightType: 'shift1' },
  { key: 'shift2', label: 'II SHIFT',  badgeText: 'Shift 2', highlightType: 'shift2' },
  { key: 'shift3', label: 'III SHIFT', badgeText: 'Shift 3', highlightType: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L37 [unit = '%']: { key: 'p18',  label: 'BSS 18',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
L38 [unit = '%']: { key: 'p44',  label: 'BSS 44',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
L39 [unit = '%']: { key: 'p60',  label: 'BSS 60',  unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
L40 [unit = '%']: { key: 'p100', label: 'BSS 100', unit: '%', colClass: 'min-w-[110px] border-r border-slate-800/50' },
L41 [unit = '%']: { key: 'm100', label: '-100',    unit: '%', colClass: 'min-w-[110px]' },
L411 [analysisType = 'Pure Salt Sieve Analysis']: analysisType: 'Pure Salt Sieve Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L617: <thead>
L618: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L29: getOperatingDateIST,
L30: LockedDateDisplay,
L122: const [date, setDate]               = useState(() => getOperatingDateIST());
L564: <LockedDateDisplay date={date} id="ps-sieve-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L26: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L27: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L31: RecordStatusBadge,
L570: <StatusSaveButton
L656: <RecordStatusBadge status={getShiftStatus(row.key)} />
L778: <ConfirmSaveModal
```

---

## RawSaltAnalysisPage.jsx (611 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L23: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### RAW_SALT_PARAMETERS (Lines 27-34)
```javascript
const RAW_SALT_PARAMETERS = [
  { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', unit: '%', placeholder: '98.20' },
  { key: 'ca',   label: 'Ca %',   subLabel: 'Calcium Content',         unit: '%', placeholder: '0.18' },
  { key: 'mg',   label: 'Mg %',   subLabel: 'Magnesium Content',       unit: '%', placeholder: '0.09' },
  { key: 'so4',  label: 'SO₄ %',  subLabel: 'Sulphate Content',        unit: '%', placeholder: '0.35' },
  { key: 'ir',   label: 'IR %',   subLabel: 'Insoluble Residue',       unit: '%', placeholder: '0.12' },
  { key: 'h2o',  label: 'H₂O %',  subLabel: 'Moisture Content',        unit: '%', placeholder: '1.06' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L28 [unit = '%']: { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', unit: '%', placeholder: '98.20' },
L29 [unit = '%']: { key: 'ca',   label: 'Ca %',   subLabel: 'Calcium Content',         unit: '%', placeholder: '0.18' },
L30 [unit = '%']: { key: 'mg',   label: 'Mg %',   subLabel: 'Magnesium Content',       unit: '%', placeholder: '0.09' },
L31 [unit = '%']: { key: 'so4',  label: 'SO₄ %',  subLabel: 'Sulphate Content',        unit: '%', placeholder: '0.35' },
L32 [unit = '%']: { key: 'ir',   label: 'IR %',   subLabel: 'Insoluble Residue',       unit: '%', placeholder: '0.12' },
L33 [unit = '%']: { key: 'h2o',  label: 'H₂O %',  subLabel: 'Moisture Content',        unit: '%', placeholder: '1.06' },
L282 [analysisType = 'Raw Salt Analysis']: analysisType: 'Raw Salt Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L23: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L82: const [date]                                      = useState(() => getOperatingDateIST());
L426: <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L21: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L22: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L451: <StatusSaveButton
L582: <ConfirmSaveModal
```

---

## RawWaterAnalysisPage.jsx (575 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L11: } from '../../utils/co2AnalysisHelper';
L14: import { useToast } from '../../components/common/Toast';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### LEFT_PARAMETERS (Lines 44-52)
```javascript
const LEFT_PARAMETERS = [
  { key: 'ph',        label: 'pH',           formula: 'pH',         unit: '',        step: '0.1', placeholder: '7.00', desc: 'Acidity / Basicity' },
  { key: 'cond',      label: 'Cond',         formula: 'EC',         unit: 'µS/cm',   step: '1',   placeholder: '0000', desc: 'Conductivity' },
  { key: 'turbidity', label: 'Turbidity',    formula: 'Turb',       unit: 'NTU',     step: '1',   placeholder: '00',   desc: 'Water Clarity' },
  { key: 'tds',       label: 'TDS',          formula: 'TDS',        unit: 'ppm',     step: '1',   placeholder: '0000', desc: 'Total Dissolved Solids' },
  { key: 'freeCl2',   label: 'Free Cl2',     formula: 'Free Cl₂',   unit: 'ppm',     step: '0.1', placeholder: '0.00', desc: 'Residual Chlorine' },
  { key: 'fe',        label: 'Fe',           formula: 'Iron (Fe)',  unit: 'ppm',     step: '0.01',placeholder: '0.00', desc: 'Total Iron' },
  { key: 'sio2',      label: 'SiO2',         formula: 'SiO₂',       unit: 'ppm',     step: '1',   placeholder: '00',   desc: 'Reactive Silica' },
];
```

#### RIGHT_PARAMETERS (Lines 55-63)
```javascript
const RIGHT_PARAMETERS = [
  { key: 'mAlk',      label: 'M Alk',        formula: 'M.Alk',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Methyl Orange Alk.' },
  { key: 'th',        label: 'TH',           formula: 'TH',         unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Total Hardness' },
  { key: 'caH',       label: 'Ca H',         formula: 'Ca-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Calcium Hardness' },
  { key: 'mgH',       label: 'Mg H',         formula: 'Mg-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Magnesium Hardness' },
  { key: 'cl',        label: 'Cl',           formula: 'Cl⁻',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Chloride' },
  { key: 'so4',       label: 'SO4',          formula: 'SO₄²⁻',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Sulphate' },
  { key: 'ema',       label: 'EMA',          formula: 'EMA',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Equiv. Mineral Acidity' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L46 [unit = 'µS/cm']: { key: 'cond',      label: 'Cond',         formula: 'EC',         unit: 'µS/cm',   step: '1',   placeholder: '0000', desc: 'Conductivity' },
L47 [unit = 'NTU']: { key: 'turbidity', label: 'Turbidity',    formula: 'Turb',       unit: 'NTU',     step: '1',   placeholder: '00',   desc: 'Water Clarity' },
L48 [unit = 'ppm']: { key: 'tds',       label: 'TDS',          formula: 'TDS',        unit: 'ppm',     step: '1',   placeholder: '0000', desc: 'Total Dissolved Solids' },
L49 [unit = 'ppm']: { key: 'freeCl2',   label: 'Free Cl2',     formula: 'Free Cl₂',   unit: 'ppm',     step: '0.1', placeholder: '0.00', desc: 'Residual Chlorine' },
L50 [unit = 'ppm']: { key: 'fe',        label: 'Fe',           formula: 'Iron (Fe)',  unit: 'ppm',     step: '0.01',placeholder: '0.00', desc: 'Total Iron' },
L51 [unit = 'ppm']: { key: 'sio2',      label: 'SiO2',         formula: 'SiO₂',       unit: 'ppm',     step: '1',   placeholder: '00',   desc: 'Reactive Silica' },
L56 [unit = 'ppm']: { key: 'mAlk',      label: 'M Alk',        formula: 'M.Alk',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Methyl Orange Alk.' },
L57 [unit = 'ppm']: { key: 'th',        label: 'TH',           formula: 'TH',         unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Total Hardness' },
L58 [unit = 'ppm']: { key: 'caH',       label: 'Ca H',         formula: 'Ca-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Calcium Hardness' },
L59 [unit = 'ppm']: { key: 'mgH',       label: 'Mg H',         formula: 'Mg-H',       unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Magnesium Hardness' },
L60 [unit = 'ppm']: { key: 'cl',        label: 'Cl',           formula: 'Cl⁻',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Chloride' },
L61 [unit = 'ppm']: { key: 'so4',       label: 'SO4',          formula: 'SO₄²⁻',      unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Sulphate' },
L62 [unit = 'ppm']: { key: 'ema',       label: 'EMA',          formula: 'EMA',        unit: 'ppm',     step: '1',   placeholder: '000',  desc: 'Equiv. Mineral Acidity' },
L232 [unit = 'Raw Water']: unit: 'Raw Water',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
NOT FOUND

### 5. Date Mechanism Lines
```jsx
L4: getOperatingDateIST,
L5: LockedDateDisplay,
L76: const [date] = useState(() => getOperatingDateIST());
L318: <LockedDateDisplay date={date} badgeText="Operating Day" id="rawwater-locked-date" />
```

### 6. Control & Modal Lines
```jsx
L6: RecordStatusBadge,
L7: StatusSaveButton,
L9: SaveConfirmationModal,
L328: <RecordStatusBadge
L336: <StatusSaveButton
L559: <SaveConfirmationModal
```

---

## RefluxAnalysisPage.jsx (804 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 36-48)
```javascript
const PARAMETERS = [
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (%)',
    unit: '%',
    target: '0.30%',
    tolerance: '±0.10%',
    range: '0.20–0.40%',
    placeholder: '0.30',
    colClass: 'min-w-[180px]',
  },
];
```

#### SHIFT_ROWS (Lines 50-54)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L41 [unit = '%']: unit: '%',
L377 [analysisType = 'Reflux Analysis']: analysisType: 'Reflux Analysis',
L379 [unit = 'Reflux']: unit: 'Reflux',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L597: <thead>
L598: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L91: const [date] = useState(() => getOperatingDateIST());
L542: <LockedDateDisplay date={date} id="reflux-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L546: <StatusSaveButton
L649: <RecordStatusBadge status={shiftStatus} />
L788: <SaveConfirmationModal
```

---

## RichAnalysisPage.jsx (812 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SHIFT_PARAMETERS (Lines 30-53)
```javascript
const SHIFT_PARAMETERS = [
  {
    key: 'loading',
    label: 'LOADING',
    formula: 'Loading (g of CO2/g of solvent)',
    unit: 'g of CO2/g of solvent',
    target: '0.6000 g of CO2/g of solvent',
    tolerance: '±0.05',
    range: '0.5500–0.6500 g of CO2/g of solvent',
    placeholder: '0.6000',
    colClass: 'min-w-[220px] border-r border-slate-800/50',
  },
  {
    key: 'density',
    label: 'DENSITY',
    formula: 'Density (Kg/cc)',
    unit: 'Kg/cc',
    target: '1080 Kg/cc',
    tolerance: '±10',
    range: '1070–1090 Kg/cc',
    placeholder: '1080',
    colClass: 'min-w-[160px]',
  },
];
```

#### SHIFT_ROWS (Lines 55-59)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L35 [unit = 'g of CO2/g of solvent']: unit: 'g of CO2/g of solvent',
L46 [unit = 'Kg/cc']: unit: 'Kg/cc',
L383 [analysisType = 'Rich Analysis']: analysisType: 'Rich Analysis',
L385 [unit = 'Rich']: unit: 'Rich',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L605: <thead>
L606: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L97: const [date] = useState(() => getOperatingDateIST());
L548: <LockedDateDisplay date={date} id="rich-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L552: <StatusSaveButton
L657: <RecordStatusBadge status={shiftStatus} />
L796: <SaveConfirmationModal
```

---

## SATankShiftAnalysisPage.jsx (476 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from "../../components/common/Toast";
L7: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L8: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L9: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SHIFTS (Lines 11-15)
```javascript
const SHIFTS = [
  { key: "s1", label: "I", title: "I Shift (07:00 - 15:00)", rowClass: "bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600", badgeClass: "bg-sky-100 text-sky-800 border-sky-300", inputFocus: "border-2 border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-bold hover:border-slate-400" },
  { key: "s2", label: "II", title: "II Shift (15:00 - 23:00)", rowClass: "bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600", badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300", inputFocus: "border-2 border-slate-300 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-bold hover:border-slate-400" },
  { key: "s3", label: "III", title: "III Shift (23:00 - 07:00)", rowClass: "bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600", badgeClass: "bg-purple-100 text-purple-800 border-purple-300", inputFocus: "border-2 border-slate-300 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-slate-900 font-bold hover:border-slate-400" },
];
```

#### DEFAULT_PARAMS (Lines 28-33)
```javascript
const DEFAULT_PARAMS = [
  { key: "fnh3", label: "FNH3", placeholder: "0.00" },
  { key: "cnh3", label: "CNH3", placeholder: "0.00" },
  { key: "tcl",  label: "TCl",  placeholder: "0.00" },
  { key: "nacl", label: "NaCl", placeholder: "0.00" },
];
```

### 3. Payload Literals (analysisType, unit)
NOT FOUND

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L396: <thead>
L397: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L6: import { ArrowLeft, Calendar, Save, CheckCircle2, AlertCircle, ChevronRight, Flame, Database } from 'lucide-react';
L9: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L40: const [date] = useState(() => getOperatingDateIST());
L356: <LockedDateDisplay date={date} id={tankKey + "-date-display"} badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L7: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L8: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L359: <StatusSaveButton
L445: <ConfirmSaveModal
```

---

## SOXDrainLiqAnalysisPage.jsx (714 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 42-79)
```javascript
const PARAMETERS = [
  {
    key: 'cl',
    label: 'Cl',
    formula: 'Chloride (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'so4',
    label: 'SO4',
    formula: 'Sulfate (PPM)',
    unit: 'PPM',
    range: '290–310 PPM',
    placeholder: '300',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'fe',
    label: 'Fe',
    formula: 'Iron (PPM)',
    unit: 'PPM',
    range: '1–3 PPM',
    placeholder: '2',
    colClass: 'min-w-[150px]',
  },
  {
    key: 'tss',
    label: 'TSS',
    formula: 'Total Suspended Solids (PPM)',
    unit: 'PPM',
    range: '0–20 PPM',
    placeholder: '10',
    colClass: 'min-w-[150px]',
  },
];
```

#### WEEKLY_ROWS (Lines 81-87)
```javascript
const WEEKLY_ROWS = [
  {
    key: 'week',
    label: 'Weekly Analysis',
    frequencyBadge: 'Once in a Week',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L47 [unit = 'PPM']: unit: 'PPM',
L56 [unit = 'PPM']: unit: 'PPM',
L65 [unit = 'PPM']: unit: 'PPM',
L74 [unit = 'PPM']: unit: 'PPM',
L309 [analysisType = 'SOX DRAIN LIQ Analysis']: analysisType: 'SOX DRAIN LIQ Analysis',
L311 [unit = 'SOX DRAIN LIQ']: unit: 'SOX DRAIN LIQ',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L520: <thead>
L521: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L104: const [date] = useState(() => getOperatingDateIST());
L465: <LockedDateDisplay date={date} id="sox-drain-liq-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L469: <StatusSaveButton
L570: <RecordStatusBadge status={weeklyStatus} />
L698: <SaveConfirmationModal
```

---

## SewerWaterAnalysisPage.jsx (901 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L3: import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
L11: } from '../../utils/offsetAnalysisHelper';
L14: import { useToast } from '../../components/common/Toast';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SLOTS (Lines 25-25)
```javascript
const SLOTS = ['t11', 't13', 't15', 't17', 't19', 't21'];
```

#### DEFAULT_READINGS (Lines 27-34)
```javascript
const DEFAULT_READINGS = [
  { id: 't11', time: '11:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't13', time: '13:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't15', time: '15:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't17', time: '17:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't19', time: '19:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
  { id: 't21', time: '21:00', sec200: { fnh3: '', cnh3: '' }, sec400: { fnh3: '', cnh3: '', hco3: '' }, finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' } },
];
```

#### SEWER_PARAMS (Lines 36-46)
```javascript
const SEWER_PARAMS = [
  ['sec200', 'fnh3'],
  ['sec200', 'cnh3'],
  ['sec400', 'fnh3'],
  ['sec400', 'cnh3'],
  ['sec400', 'hco3'],
  ['finalOutlet', 'fnh3'],
  ['finalOutlet', 'cnh3'],
  ['finalOutlet', 'hco3'],
  ['finalOutlet', 'pcl'],
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L243 [unit = 'Sewer Water']: unit: 'Sewer Water',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L428: <thead>
L430: <tr className="bg-slate-950 text-white text-xs select-none border-b border-slate-800">
L471: <tr className="bg-slate-900 text-white text-xs font-extrabold select-none">
```

### 5. Date Mechanism Lines
```jsx
L3: import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
L8: LockedDateDisplay,
L59: const [date] = useState(() => getOperatingDateIST());
L386: <LockedDateDisplay date={date} badgeText="Operating Day" id="sewer-locked-date" />
L422: <LockedDateDisplay date={date} id="sewerwater-date-display" />
```

### 6. Control & Modal Lines
```jsx
L3: import { getOperatingDateIST, SaveConfirmationModal } from '../../utils/co2AnalysisHelper';
L9: StatusSaveButton,
L10: RecordStatusBadge,
L388: <RecordStatusBadge
L394: <StatusSaveButton
L812: <RecordStatusBadge status={badgeStatus} />
L836: <SaveConfirmationModal
```

---

## T401AnalysisPage.jsx (906 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from "../../components/common/Toast";
L25: import { StatusSaveButton, SaveStatusBanner } from "../../components/common/AnalysisStatusBanner";
L26: import ConfirmSaveModal from "../../components/common/ConfirmSaveModal";
L27: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from "../../utils/co2AnalysisHelper";
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_T401_LIMITS (Lines 41-106)
```javascript
export const SA_T401_LIMITS = {
  fnh3: {
    key: "fnh3",
    paramName: "FNH3",
    label: "FNH₃",
    formula: "Free Ammonia (FNH₃)",
    target: 0.98,
    tolerance: 0.10,
    min: 0.88,
    max: 1.08,
    unit: "Kgm/m³",
    formattedRange: "0.88–1.08 Kgm/m³",
    formattedTarget: "0.98 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "0.98",
    hasLimit: true,
  },
  cnh3: {
    key: "cnh3",
    paramName: "CNH3",
    label: "CNH₃",
    formula: "Combined Ammonia (CNH₃)",
    target: 4.50,
    tolerance: 0.10,
    min: 4.40,
    max: 4.60,
    unit: "Kgm/m³",
    formattedRange: "4.40–4.60 Kgm/m³",
    formattedTarget: "4.50 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "4.50",
    hasLimit: true,
  },
  tcl: {
    key: "tcl",
    paramName: "TCL",
    label: "TCl",
    formula: "Total Chlorine (T.Cl)",
    target: 5.80,
    tolerance: 0.10,
    min: 5.70,
    max: 5.90,
    unit: "Kgm/m³",
    formattedRange: "5.70–5.90 Kgm/m³",
    formattedTarget: "5.80 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "5.80",
    hasLimit: true,
  },
  pcl: {
    key: "pcl",
    paramName: "PCL",
    label: "PCl",
    formula: "Polymer Chloride (P.Cl)",
    target: 1.12,
    tolerance: 0.10,
    min: 1.02,
    max: 1.22,
    unit: "Kgm/m³",
    formattedRange: "1.02–1.22 Kgm/m³",
    formattedTarget: "1.12 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "1.12",
    hasLimit: true,
  },
};
```

#### UNITS (Lines 109-116)
```javascript
const UNITS = [
  { key: "a", label: "T 401 A", subLabel: "Tower Unit A", option: "A" },
  { key: "b", label: "T 401 B", subLabel: "Tower Unit B", option: "B" },
  { key: "c", label: "T 401 C", subLabel: "Tower Unit C", option: "C" },
  { key: "d", label: "T 401 D", subLabel: "Tower Unit D", option: "D" },
  { key: "e", label: "T 401 E", subLabel: "Tower Unit E", option: "E" },
  { key: "f", label: "T 401 F", subLabel: "Tower Unit F", option: "F" },
];
```

#### SHIFTS (Lines 119-123)
```javascript
const SHIFTS = [
  { key: "s1", label: "I",   title: "I Shift (07:00 – 15:00)",  name: "I SHIFT",   badgeColor: "bg-sky-100 text-sky-800 border-sky-300" },
  { key: "s2", label: "II",  title: "II Shift (15:00 – 23:00)", name: "II SHIFT",  badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { key: "s3", label: "III", title: "III Shift (23:00 – 07:00)", name: "III SHIFT", badgeColor: "bg-purple-100 text-purple-800 border-purple-300" },
];
```

#### PARAMETERS (Lines 126-131)
```javascript
const PARAMETERS = [
  { key: "fnh3", label: "FNH₃", placeholder: "0.98", hasLimit: true },
  { key: "cnh3", label: "CNH₃", placeholder: "4.50", hasLimit: true },
  { key: "tcl",  label: "TCl",  placeholder: "5.80", hasLimit: true },
  { key: "pcl",  label: "PCl",  placeholder: "1.12", hasLimit: true },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L51 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L67 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L83 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L99 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L462 [analysisType = 'T 401 Analysis']: analysisType: "T 401 Analysis",
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L716: <thead>
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L27: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from "../../utils/co2AnalysisHelper";
L175: const [date]                              = useState(() => getOperatingDateIST());
L605: <LockedDateDisplay date={date} id="t401-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L25: import { StatusSaveButton, SaveStatusBanner } from "../../components/common/AnalysisStatusBanner";
L26: import ConfirmSaveModal from "../../components/common/ConfirmSaveModal";
L27: import { getOperatingDateIST, LockedDateDisplay, RecordStatusBadge } from "../../utils/co2AnalysisHelper";
L612: <StatusSaveButton
L756: <RecordStatusBadge status={shiftStatus} />
L883: <ConfirmSaveModal
```

---

## TK1251AnalysisPage.jsx (815 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 38-57)
```javascript
const PARAMETERS = [
  {
    key: 'ph',
    label: 'pH',
    formula: 'pH Value',
    unit: '',
    range: '8.0–9.5',
    placeholder: '8.5',
    colClass: 'min-w-[170px]',
  },
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (g/L)',
    unit: 'g/L',
    range: '2–5 g/L',
    placeholder: '3.0',
    colClass: 'min-w-[170px]',
  },
];
```

#### SHIFT_ROWS (Lines 59-63)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L52 [unit = 'g/L']: unit: 'g/L',
L386 [analysisType = 'TK1251 Analysis']: analysisType: 'TK1251 Analysis',
L388 [unit = 'TK1251']: unit: 'TK1251',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L608: <thead>
L609: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L100: const [date] = useState(() => getOperatingDateIST());
L551: <LockedDateDisplay date={date} id="tk1251-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L555: <StatusSaveButton
L660: <RecordStatusBadge status={shiftStatus} />
L799: <SaveConfirmationModal
```

---

## TK1252AnalysisPage.jsx (815 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 38-57)
```javascript
const PARAMETERS = [
  {
    key: 'ph',
    label: 'pH',
    formula: 'pH Value',
    unit: '',
    range: '8.0–9.5',
    placeholder: '8.5',
    colClass: 'min-w-[170px]',
  },
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (g/L)',
    unit: 'g/L',
    range: '2–5 g/L',
    placeholder: '3.0',
    colClass: 'min-w-[170px]',
  },
];
```

#### SHIFT_ROWS (Lines 59-63)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L52 [unit = 'g/L']: unit: 'g/L',
L386 [analysisType = 'TK1252 Analysis']: analysisType: 'TK1252 Analysis',
L388 [unit = 'TK1252']: unit: 'TK1252',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L608: <thead>
L609: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L100: const [date] = useState(() => getOperatingDateIST());
L551: <LockedDateDisplay date={date} id="tk1252-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L555: <StatusSaveButton
L660: <RecordStatusBadge status={shiftStatus} />
L799: <SaveConfirmationModal
```

---

## TK203AnalysisPage.jsx (841 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 25-31)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
  { key: 'co2',  label: 'CO₂',  unit: '',       colClass: 'min-w-[110px]' },
];
```

#### UNITS_ORDER (Lines 33-33)
```javascript
const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
```

#### TIME_SLOTS (Lines 35-48)
```javascript
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't09', time: '09:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't13', time: '13:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't17', time: '17:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't21', time: '21:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't01', time: '01:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't05', time: '05:00', shift: 'III Shift', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L26 [unit = 'Kgm/m³']: { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
L27 [unit = 'Kgm/m³']: { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
L28 [unit = 'Kgm/m³']: { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
L29 [unit = 'Kgm/m³']: { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[125px] border-r border-slate-800/50' },
L416 [analysisType = 'TK 203 Analysis']: analysisType: 'TK 203 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L625: <thead>
L626: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L59: export const getOperatingDateIST = (now = new Date()) => {
L145: const [date]                                      = useState(() => getOperatingDateIST());
L567: <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L583: <StatusSaveButton
L813: <ConfirmSaveModal
```

---

## TK204AnalysisPage.jsx (857 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L28: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 34-39)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '3.09' },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '3.70' },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.09' },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '1.39' },
];
```

#### SHIFTS (Lines 41-45)
```javascript
const SHIFTS = [
  { key: 'shift1', label: 'I SHIFT',   time: '06:00 – 14:00', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'shift2', label: 'II SHIFT',  time: '14:00 – 22:00', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { key: 'shift3', label: 'III SHIFT', time: '22:00 – 06:00', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L360 [analysisType = 'TK 204 Analysis']: analysisType: 'TK 204 Analysis',
L362 [unit = 'TK 204']: unit: 'TK 204',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L629: <thead>
L630: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L25: getOperatingDateIST,
L26: LockedDateDisplay,
L77: const [date]                                      = useState(() => getOperatingDateIST());
L564: <LockedDateDisplay date={date} id="tk204-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L27: RecordStatusBadge,
L570: <StatusSaveButton
L678: <RecordStatusBadge status={getShiftStatus(shift.key)} />
L820: <ConfirmSaveModal
```

---

## TK204TK209AnalysisPage.jsx (444 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L18: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L19: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L20: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_PARAMETERS (Lines 32-37)
```javascript
const DEFAULT_PARAMETERS = {
  fnh3: { tk204: '', tk209: '' },
  cnh3: { tk204: '', tk209: '' },
  tcl:  { tk204: '', tk209: '' },
  pcl:  { tk204: '', tk209: '' },
};
```

#### PARAM_CONFIG (Lines 39-44)
```javascript
const PARAM_CONFIG = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '0.00' },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '0.00' },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)', placeholder: '0.00' },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '0.00' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L192 [unit = 'TK 204 / TK 209']: unit: 'TK 204 / TK 209',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L318: <thead>
L319: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L8: Calendar,
L20: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L70: const [date, setDate] = useState(() => getOperatingDateIST());
L292: <Calendar className="w-3 h-3 text-blue-600" />
L299: type="date"
L301: max={getOperatingDateIST()}
```

### 6. Control & Modal Lines
```jsx
L18: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L19: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L245: <StatusSaveButton
L408: <ConfirmSaveModal
```

---

## TK205AnalysisPage.jsx (889 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### TK205_LIMITS (Lines 33-90)
```javascript
export const TK205_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 3.17,
    tolerance: 0.10,
    min: 3.07,
    max: 3.27,
    unit: 'Kgm/m³',
    formattedRange: '3.07–3.27 Kgm/m³',
    formattedTarget: '3.17 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.17',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 1.98,
    tolerance: 0.10,
    min: 1.88,
    max: 2.08,
    unit: 'Kgm/m³',
    formattedRange: '1.88–2.08 Kgm/m³',
    formattedTarget: '1.98 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.98',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 5.64,
    tolerance: 0.10,
    min: 5.54,
    max: 5.74,
    unit: 'Kgm/m³',
    formattedRange: '5.54–5.74 Kgm/m³',
    formattedTarget: '5.64 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.64',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 3.66,
    tolerance: 0.10,
    min: 3.56,
    max: 3.76,
    unit: 'Kgm/m³',
    formattedRange: '3.56–3.76 Kgm/m³',
    formattedTarget: '3.66 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.66',
  },
};
```

#### PARAMETERS (Lines 92-97)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
];
```

#### UNITS_ORDER (Lines 99-99)
```javascript
const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
```

#### TIME_SLOTS (Lines 101-114)
```javascript
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't09', time: '09:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't13', time: '13:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't17', time: '17:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't21', time: '21:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't01', time: '01:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't05', time: '05:00', shift: 'III Shift', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L42 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L56 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L70 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L84 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L93 [unit = 'Kgm/m³']: { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L94 [unit = 'Kgm/m³']: { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L95 [unit = 'Kgm/m³']: { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L96 [unit = 'Kgm/m³']: { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
L481 [analysisType = 'TK 205 Analysis']: analysisType: 'TK 205 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L661: <thead>
L662: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L125: export const getOperatingDateIST = (now = new Date()) => {
L211: const [date]                                      = useState(() => getOperatingDateIST());
L605: <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L621: <StatusSaveButton
L861: <ConfirmSaveModal
```

---

## TK207AnalysisPage.jsx (907 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### TK207_LIMITS (Lines 33-90)
```javascript
export const TK207_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    target: 4.02,
    tolerance: 0.10,
    min: 3.92,
    max: 4.12,
    unit: 'Kgm/m³',
    formattedRange: '3.92–4.12 Kgm/m³',
    formattedTarget: '4.02 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    target: 1.92,
    tolerance: 0.10,
    min: 1.82,
    max: 2.02,
    unit: 'Kgm/m³',
    formattedRange: '1.82–2.02 Kgm/m³',
    formattedTarget: '1.92 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    target: 5.47,
    tolerance: 0.10,
    min: 5.37,
    max: 5.57,
    unit: 'Kgm/m³',
    formattedRange: '5.37–5.57 Kgm/m³',
    formattedTarget: '5.47 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    target: 3.55,
    tolerance: 0.10,
    min: 3.45,
    max: 3.65,
    unit: 'Kgm/m³',
    formattedRange: '3.45–3.65 Kgm/m³',
    formattedTarget: '3.55 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '0.00',
  },
};
```

#### PARAMETERS (Lines 92-97)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
];
```

#### UNITS_ORDER (Lines 99-99)
```javascript
const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
```

#### TIME_SLOTS (Lines 101-114)
```javascript
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't09', time: '09:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't11', time: '11:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't13', time: '13:00', shift: 'I Shift',   shiftId: 'shift1' },
  { key: 't15', time: '15:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't17', time: '17:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't19', time: '19:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't21', time: '21:00', shift: 'II Shift',  shiftId: 'shift2' },
  { key: 't23', time: '23:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't01', time: '01:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't03', time: '03:00', shift: 'III Shift', shiftId: 'shift3' },
  { key: 't05', time: '05:00', shift: 'III Shift', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L42 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L56 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L70 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L84 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L93 [unit = 'Kgm/m³']: { key: 'fnh3', label: 'FNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L94 [unit = 'Kgm/m³']: { key: 'cnh3', label: 'CNH₃', unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L95 [unit = 'Kgm/m³']: { key: 'tcl',  label: 'TCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px] border-r border-slate-800/50' },
L96 [unit = 'Kgm/m³']: { key: 'pcl',  label: 'PCl',  unit: 'Kgm/m³', colClass: 'min-w-[130px]' },
L482 [analysisType = 'TK 207 Analysis']: analysisType: 'TK 207 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L691: <thead>
L692: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L125: export const getOperatingDateIST = (now = new Date()) => {
L211: const [date]                                      = useState(() => getOperatingDateIST());
L633: <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
```

### 6. Control & Modal Lines
```jsx
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L649: <StatusSaveButton
L879: <ConfirmSaveModal
```

---

## TK209AnalysisPage.jsx (865 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L28: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 41-46)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '0.68', targetRange: '0.58–0.78' },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '2.36', targetRange: '2.26–2.46' },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '3.04', targetRange: '2.94–3.14' },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '0.68', targetRange: '0.58–0.78' },
];
```

#### SHIFTS (Lines 48-52)
```javascript
const SHIFTS = [
  { key: 'shift1', label: 'I SHIFT',   time: '06:00 – 14:00', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'shift2', label: 'II SHIFT',  time: '14:00 – 22:00', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { key: 'shift3', label: 'III SHIFT', time: '22:00 – 06:00', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L367 [analysisType = 'TK 209 Analysis']: analysisType: 'TK 209 Analysis',
L369 [unit = 'TK 209']: unit: 'TK 209',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L637: <thead>
L638: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L25: getOperatingDateIST,
L26: LockedDateDisplay,
L84: const [date]                                      = useState(() => getOperatingDateIST());
L571: <LockedDateDisplay date={date} id="tk209-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L27: RecordStatusBadge,
L577: <StatusSaveButton
L686: <RecordStatusBadge status={getShiftStatus(shift.key)} />
L828: <ConfirmSaveModal
```

---

## TK401SAAnalysisPage.jsx (968 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_TK401_LIMITS (Lines 38-112)
```javascript
export const SA_TK401_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    formula: 'Free Ammonia (FNH₃)',
    target: 3.97,
    tolerance: 0.10,
    min: 3.87,
    max: 4.07,
    unit: 'Kgm/m³',
    formattedRange: '3.87–4.07 Kgm/m³',
    formattedTarget: '3.97 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.97',
    hasLimit: true,
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    formula: 'Combined Ammonia (CNH₃)',
    target: 1.92,
    tolerance: 0.10,
    min: 1.82,
    max: 2.02,
    unit: 'Kgm/m³',
    formattedRange: '1.82–2.02 Kgm/m³',
    formattedTarget: '1.92 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.92',
    hasLimit: true,
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    formula: 'Total Chlorine (T.Cl)',
    target: 5.47,
    tolerance: 0.10,
    min: 5.37,
    max: 5.57,
    unit: 'Kgm/m³',
    formattedRange: '5.37–5.57 Kgm/m³',
    formattedTarget: '5.47 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.47',
    hasLimit: true,
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    formula: 'Polymer Chloride (P.Cl)',
    target: 3.55,
    tolerance: 0.10,
    min: 3.45,
    max: 3.65,
    unit: 'Kgm/m³',
    formattedRange: '3.45–3.65 Kgm/m³',
    formattedTarget: '3.55 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.55',
    hasLimit: true,
  },
  tcao: {
    key: 'tcao',
    paramName: 'TCAO',
    label: 'TCaO',
    formula: 'Total Calcium Oxide (TCaO)',
    unit: '',
    placeholder: '0.00',
    hasLimit: false,
  },
};
```

#### PARAMETERS (Lines 114-120)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '3.97', hasLimit: true },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '1.92', hasLimit: true },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.47', hasLimit: true },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '3.55', hasLimit: true },
  { key: 'tcao', label: 'TCaO', formula: 'Total Calcium Oxide (TCaO)', placeholder: '0.00', hasLimit: false },
];
```

#### SHIFTS (Lines 122-141)
```javascript
const SHIFTS = [
  {
    key: 's1',
    label: 'I SHIFT',
    time: '07:00 – 15:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
  },
  {
    key: 's2',
    label: 'II SHIFT',
    time: '15:00 – 23:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
  },
  {
    key: 's3',
    label: 'III SHIFT',
    time: '23:00 – 07:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L48 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L64 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L80 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L96 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L442 [analysisType = 'TK 401 Analysis']: analysisType: 'TK 401 Analysis',
L444 [unit = 'TK 401']: unit: 'TK 401',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L723: <thead>
L724: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L190: const [date]                                      = useState(() => getOperatingDateIST());
L657: <LockedDateDisplay date={date} id="tk401sa-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L663: <StatusSaveButton
L931: <ConfirmSaveModal
```

---

## TK405SAAnalysisPage.jsx (968 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_TK405_LIMITS (Lines 38-112)
```javascript
export const SA_TK405_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    formula: 'Free Ammonia (FNH₃)',
    target: 3.86,
    tolerance: 0.10,
    min: 3.76,
    max: 3.96,
    unit: 'Kgm/m³',
    formattedRange: '3.76–3.96 Kgm/m³',
    formattedTarget: '3.86 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.86',
    hasLimit: true,
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    formula: 'Combined Ammonia (CNH₃)',
    target: 1.89,
    tolerance: 0.10,
    min: 1.79,
    max: 1.99,
    unit: 'Kgm/m³',
    formattedRange: '1.79–1.99 Kgm/m³',
    formattedTarget: '1.89 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.89',
    hasLimit: true,
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    formula: 'Total Chlorine (T.Cl)',
    target: 5.39,
    tolerance: 0.10,
    min: 5.29,
    max: 5.49,
    unit: 'Kgm/m³',
    formattedRange: '5.29–5.49 Kgm/m³',
    formattedTarget: '5.39 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.39',
    hasLimit: true,
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    formula: 'Polymer Chloride (P.Cl)',
    target: 3.50,
    tolerance: 0.10,
    min: 3.40,
    max: 3.60,
    unit: 'Kgm/m³',
    formattedRange: '3.40–3.60 Kgm/m³',
    formattedTarget: '3.50 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '3.50',
    hasLimit: true,
  },
  tcao: {
    key: 'tcao',
    paramName: 'TCAO',
    label: 'TCaO',
    formula: 'Total Calcium Oxide (TCaO)',
    unit: '',
    placeholder: '0.00',
    hasLimit: false,
  },
};
```

#### PARAMETERS (Lines 114-120)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '3.86', hasLimit: true },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '1.89', hasLimit: true },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.39', hasLimit: true },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '3.50', hasLimit: true },
  { key: 'tcao', label: 'TCaO', formula: 'Total Calcium Oxide (TCaO)', placeholder: '0.00', hasLimit: false },
];
```

#### SHIFTS (Lines 122-141)
```javascript
const SHIFTS = [
  {
    key: 's1',
    label: 'I SHIFT',
    time: '07:00 – 15:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
  },
  {
    key: 's2',
    label: 'II SHIFT',
    time: '15:00 – 23:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
  },
  {
    key: 's3',
    label: 'III SHIFT',
    time: '23:00 – 07:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L48 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L64 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L80 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L96 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L442 [analysisType = 'TK 405 Analysis']: analysisType: 'TK 405 Analysis',
L444 [unit = 'TK 405']: unit: 'TK 405',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L723: <thead>
L724: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L190: const [date]                                      = useState(() => getOperatingDateIST());
L657: <LockedDateDisplay date={date} id="tk405sa-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L663: <StatusSaveButton
L931: <ConfirmSaveModal
```

---

## TK414TSCTankAnalysisPage.jsx (957 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_TK414_LIMITS (Lines 37-102)
```javascript
export const SA_TK414_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    formula: 'Free Ammonia (FNH₃)',
    target: 1.40,
    tolerance: 0.10,
    min: 1.30,
    max: 1.50,
    unit: 'Kgm/m³',
    formattedRange: '1.30–1.50 Kgm/m³',
    formattedTarget: '1.40 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.40',
    hasLimit: true,
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    formula: 'Combined Ammonia (CNH₃)',
    target: 4.10,
    tolerance: 0.10,
    min: 4.00,
    max: 4.20,
    unit: 'Kgm/m³',
    formattedRange: '4.00–4.20 Kgm/m³',
    formattedTarget: '4.10 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '4.10',
    hasLimit: true,
  },
  tcl: {
    key: 'tcl',
    paramName: 'TCL',
    label: 'TCl',
    formula: 'Total Chlorine (T.Cl)',
    target: 5.46,
    tolerance: 0.10,
    min: 5.36,
    max: 5.56,
    unit: 'Kgm/m³',
    formattedRange: '5.36–5.56 Kgm/m³',
    formattedTarget: '5.46 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '5.46',
    hasLimit: true,
  },
  pcl: {
    key: 'pcl',
    paramName: 'PCL',
    label: 'PCl',
    formula: 'Polymer Chloride (P.Cl)',
    target: 1.36,
    tolerance: 0.10,
    min: 1.26,
    max: 1.46,
    unit: 'Kgm/m³',
    formattedRange: '1.26–1.46 Kgm/m³',
    formattedTarget: '1.36 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '1.36',
    hasLimit: true,
  },
};
```

#### PARAMETERS (Lines 104-109)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '1.40', hasLimit: true },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '4.10', hasLimit: true },
  { key: 'tcl',  label: 'TCl',  formula: 'Total Chlorine (T.Cl)',  placeholder: '5.46', hasLimit: true },
  { key: 'pcl',  label: 'PCl',  formula: 'Polymer Chloride (P.Cl)', placeholder: '1.36', hasLimit: true },
];
```

#### SHIFTS (Lines 111-130)
```javascript
const SHIFTS = [
  {
    key: 's1',
    label: 'I SHIFT',
    time: '07:00 – 15:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
  },
  {
    key: 's2',
    label: 'II SHIFT',
    time: '15:00 – 23:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
  },
  {
    key: 's3',
    label: 'III SHIFT',
    time: '23:00 – 07:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L47 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L63 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L79 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L95 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L431 [analysisType = 'TK 414 TSC TANK Analysis']: analysisType: 'TK 414 TSC TANK Analysis',
L433 [unit = 'TK 414 TSC TANK']: unit: 'TK 414 TSC TANK',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L714: <thead>
L715: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L179: const [date]                                      = useState(() => getOperatingDateIST());
L649: <LockedDateDisplay date={date} id="tk414sa-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L654: <StatusSaveButton
L920: <ConfirmSaveModal
```

---

## TK419AnalysisPage.jsx (669 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L22: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_TK419_LIMITS (Lines 30-63)
```javascript
export const SA_TK419_LIMITS = {
  fnh3: {
    key: "fnh3",
    paramName: "FNH3",
    label: "FNH₃",
    formula: "Free Ammonia (FNH₃)",
    target: 2.08,
    tolerance: 0.10,
    min: 1.98,
    max: 2.18,
    unit: "Kgm/m³",
    formattedRange: "1.98–2.18 Kgm/m³",
    formattedTarget: "2.08 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "2.08",
    hasLimit: true,
  },
  cnh3: {
    key: "cnh3",
    paramName: "CNH3",
    label: "CNH₃",
    formula: "Combined Ammonia (CNH₃)",
    target: 4.06,
    tolerance: 0.10,
    min: 3.96,
    max: 4.16,
    unit: "Kgm/m³",
    formattedRange: "3.96–4.16 Kgm/m³",
    formattedTarget: "4.06 Kgm/m³",
    formattedTolerance: "±0.10 Kgm/m³",
    placeholder: "4.06",
    hasLimit: true,
  },
};
```

#### PARAMETERS (Lines 67-70)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', placeholder: '2.08', colClass: 'min-w-[130px] border-r border-slate-800/50' },
  { key: 'cnh3', label: 'CNH₃', placeholder: '4.06', colClass: 'min-w-[130px]' },
];
```

#### TIME_SLOTS (Lines 72-85)
```javascript
const TIME_SLOTS = [
  { key: 't07', time: '07:00', shiftId: 'shift1' },
  { key: 't09', time: '09:00', shiftId: 'shift1' },
  { key: 't11', time: '11:00', shiftId: 'shift1' },
  { key: 't13', time: '13:00', shiftId: 'shift1' },
  { key: 't15', time: '15:00', shiftId: 'shift2' },
  { key: 't17', time: '17:00', shiftId: 'shift2' },
  { key: 't19', time: '19:00', shiftId: 'shift2' },
  { key: 't21', time: '21:00', shiftId: 'shift2' },
  { key: 't23', time: '23:00', shiftId: 'shift3' },
  { key: 't01', time: '01:00', shiftId: 'shift3' },
  { key: 't03', time: '03:00', shiftId: 'shift3' },
  { key: 't05', time: '05:00', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L40 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L56 [unit = 'Kgm/m³']: unit: "Kgm/m³",
L279 [analysisType = 'TK 419 Analysis']: analysisType: 'TK 419 Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L468: <thead>
L469: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L22: import { getOperatingDateIST } from '../../utils/co2AnalysisHelper';
L141: const [date, setDate]               = useState(() => getOperatingDateIST());
L344: <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
L347: type="date"
L349: max={getOperatingDateIST()}
L431: type="date"
L433: max={getOperatingDateIST()}
L449: <Calendar className="w-3 h-3 text-slate-400" />
```

### 6. Control & Modal Lines
```jsx
L20: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L21: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L376: <StatusSaveButton
L642: <ConfirmSaveModal
```

---

## TK419SCTankAnalysisPage.jsx (921 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### SA_TK419_LIMITS (Lines 35-68)
```javascript
export const SA_TK419_LIMITS = {
  fnh3: {
    key: 'fnh3',
    paramName: 'FNH3',
    label: 'FNH₃',
    formula: 'Free Ammonia (FNH₃)',
    target: 2.08,
    tolerance: 0.10,
    min: 1.98,
    max: 2.18,
    unit: 'Kgm/m³',
    formattedRange: '1.98–2.18 Kgm/m³',
    formattedTarget: '2.08 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '2.08',
    hasLimit: true,
  },
  cnh3: {
    key: 'cnh3',
    paramName: 'CNH3',
    label: 'CNH₃',
    formula: 'Combined Ammonia (CNH₃)',
    target: 4.06,
    tolerance: 0.10,
    min: 3.96,
    max: 4.16,
    unit: 'Kgm/m³',
    formattedRange: '3.96–4.16 Kgm/m³',
    formattedTarget: '4.06 Kgm/m³',
    formattedTolerance: '±0.10 Kgm/m³',
    placeholder: '4.06',
    hasLimit: true,
  },
};
```

#### PARAMETERS (Lines 70-73)
```javascript
const PARAMETERS = [
  { key: 'fnh3', label: 'FNH₃', formula: 'Free Ammonia (FNH₃)', placeholder: '2.08', hasLimit: true },
  { key: 'cnh3', label: 'CNH₃', formula: 'Combined Ammonia (CNH₃)', placeholder: '4.06', hasLimit: true },
];
```

#### SHIFTS (Lines 75-94)
```javascript
const SHIFTS = [
  {
    key: 's1',
    label: 'I SHIFT',
    time: '07:00 – 15:00',
    rowStyle: 'bg-sky-50/40 hover:bg-sky-100/60 border-l-4 border-l-blue-600',
  },
  {
    key: 's2',
    label: 'II SHIFT',
    time: '15:00 – 23:00',
    rowStyle: 'bg-indigo-50/30 hover:bg-indigo-100/50 border-l-4 border-l-indigo-600',
  },
  {
    key: 's3',
    label: 'III SHIFT',
    time: '23:00 – 07:00',
    rowStyle: 'bg-purple-50/30 hover:bg-purple-100/50 border-l-4 border-l-purple-600',
  },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L45 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L61 [unit = 'Kgm/m³']: unit: 'Kgm/m³',
L395 [analysisType = 'TK 419 SC TANK Analysis']: analysisType: 'TK 419 SC TANK Analysis',
L397 [unit = 'TK 419 SC TANK']: unit: 'TK 419 SC TANK',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L680: <thead>
L681: <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
```

### 5. Date Mechanism Lines
```jsx
L12: Calendar,
L24: import { getOperatingDateIST, LockedDateDisplay } from '../../utils/co2AnalysisHelper';
L143: const [date]                                      = useState(() => getOperatingDateIST());
L614: {/* Read-only Operating Day Display via LockedDateDisplay */}
L615: <LockedDateDisplay date={date} id="tk419sa-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: import { StatusSaveButton, SaveStatusBanner } from '../../components/common/AnalysisStatusBanner';
L23: import ConfirmSaveModal from '../../components/common/ConfirmSaveModal';
L620: <StatusSaveButton
L884: <ConfirmSaveModal
```

---

## VacuumSealWaterAnalysisPage.jsx (689 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L24: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### DEFAULT_READINGS (Lines 27-31)
```javascript
const DEFAULT_READINGS = [
  { id: '1', time: '07:00', fnh3: '', cnh3: '', ca: '' },
  { id: '2', time: '15:00', fnh3: '', cnh3: '', ca: '' },
  { id: '3', time: '23:00', fnh3: '', cnh3: '', ca: '' },
];
```

#### DEFAULT_LOCKS (Lines 33-46)
```javascript
const DEFAULT_LOCKS = {
  shift1Saved: false,
  shift2Saved: false,
  shift3Saved: false,
  shift1Locked: false,
  shift2Locked: false,
  shift3Locked: false,
  shift1: false,
  shift2: false,
  shift3: false,
  shift1Edits: 0,
  shift2Edits: 0,
  shift3Edits: 0,
};
```

#### PARAM_FIELDS (Lines 48-48)
```javascript
const PARAM_FIELDS = ['fnh3', 'cnh3', 'ca'];
```

#### NUMERIC_FIELDS (Lines 49-49)
```javascript
const NUMERIC_FIELDS = ['fnh3', 'cnh3'];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L313 [unit = 'Bottom ash']: unit: 'Bottom ash',
L314 [analysisType = 'Vacuum Seal Water Analysis']: analysisType: 'Vacuum Seal Water Analysis',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L462: <thead>
L463: <tr className="bg-slate-800 text-white font-semibold text-xs border-b border-slate-700">
```

### 5. Date Mechanism Lines
```jsx
L17: getOperatingDateIST,
L18: LockedDateDisplay,
L61: const [date] = useState(() => getOperatingDateIST());
L436: <LockedDateDisplay
```

### 6. Control & Modal Lines
```jsx
L19: RecordStatusBadge,
L20: StatusSaveButton,
L22: SaveConfirmationModal,
L408: <StatusSaveButton
L519: <RecordStatusBadge status={shiftStatus} />
L673: <SaveConfirmationModal
```

---

## WashwaterAnalysisPage.jsx (804 lines)

### 1. Imports from `../../components/` and `../../utils/`
```javascript
L4: import { useToast } from '../../components/common/Toast';
L27: } from '../../utils/co2AnalysisHelper';
```

### 2. Top-Level Constants (PARAMETERS, ROWS, SHIFTS, etc.)
#### PARAMETERS (Lines 36-48)
```javascript
const PARAMETERS = [
  {
    key: 'alk',
    label: 'ALK',
    formula: 'Alkalinity (%)',
    unit: '%',
    target: '0.20%',
    tolerance: '±0.10%',
    range: '0.10–0.30%',
    placeholder: '0.20',
    colClass: 'min-w-[180px]',
  },
];
```

#### SHIFT_ROWS (Lines 50-54)
```javascript
const SHIFT_ROWS = [
  { key: 'shift1', time: '08:00', label: 'I SHIFT (06:00 – 14:00)', shiftId: 'shift1' },
  { key: 'shift2', time: '16:00', label: 'II SHIFT (14:00 – 22:00)', shiftId: 'shift2' },
  { key: 'shift3', time: '00:00', label: 'III SHIFT (22:00 – 06:00)', shiftId: 'shift3' },
];
```

### 3. Payload Literals (analysisType, unit)
```javascript
L41 [unit = '%']: unit: '%',
L377 [analysisType = 'Washwater Analysis']: analysisType: 'Washwater Analysis',
L379 [unit = 'Washwater']: unit: 'Washwater',
```

### 4. <thead> Lines (<thead, <tr className with bg-, bg-gradient)
```jsx
L597: <thead>
L598: <tr className="border-b-2 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xs">
```

### 5. Date Mechanism Lines
```jsx
L19: getOperatingDateIST,
L21: LockedDateDisplay,
L91: const [date] = useState(() => getOperatingDateIST());
L542: <LockedDateDisplay date={date} id="washwater-date-display" badgeText="Operating Day" />
```

### 6. Control & Modal Lines
```jsx
L22: RecordStatusBadge,
L23: StatusSaveButton,
L25: SaveConfirmationModal,
L546: <StatusSaveButton
L649: <RecordStatusBadge status={shiftStatus} />
L788: <SaveConfirmationModal
```

---

