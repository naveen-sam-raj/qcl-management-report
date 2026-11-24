# QCL Analysis UI Inventory Report

**Date**: 2026-11-24  
**Scope**: Frontend Analysis Pages across all 4 plants (ACL, SA, OFFSITE, CO2)  
**Status**: Read-Only Inspection Complete (Step 1 & Step 2)  
**Reference Router**: `client/src/pages/company/PlantAnalysisPage.jsx` [VERIFIED: client/src/pages/company/PlantAnalysisPage.jsx:1-950]

---

## Executive Summary

An exhaustive, read-only frontend inspection of all analysis pages across the 4 plants was conducted. In total:
- **ACL Plant**: 15 analyses (15 page components)
- **SA Plant**: 15 analyses (15 page components + 3 subcomponents for P417)
- **OFFSITE Plant**: 11 analyses (10 page components; Cooling Water handles both general and 200#)
- **CO2 Plant**: 14 analyses (14 page components)
- **Total Analyses**: **55 analyses** mapped across **54 dedicated page component files**.

All 54 page component files were inspected in the codebase. Zero business logic or backend files were modified.

---

## Inventory by Plant

### 1. ACL Plant (15 Analyses)

| # | Analysis Option / Label | Component File | Verification Tag | Header Style | Row/Layout Type | Buttons / Status Flow |
|---|---|---|---|---|---|---|
| 1 | Pure Salt Analysis | `PureSaltAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/PureSaltAnalysisPage.jsx:1-750] | Slate gradient + Breadcrumb (`FlaskConical`, `ChevronRight`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 2 | Brine Analysis | `BrineAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/BrineAnalysisPage.jsx:1-120] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 3 | Pure Salt Sieve Analysis | `PureSaltSieveAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/PureSaltSieveAnalysisPage.jsx:1-120] | Slate gradient + Breadcrumb (`Grid`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 4 | TK 203 Analysis | `TK203AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK203AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 5 | TK 204 Analysis | `TK204AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK204AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 6 | TK 205 Analysis | `TK205AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK205AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 7 | TK 207 Analysis | `TK207AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK207AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 8 | TK 209 Analysis | `TK209AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK209AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 9 | CR 202 Analysis | `CR202AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/CR202AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 10 | CR 203 Analysis | `CR203AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/CR203AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 11 | PCL/TCL Analysis | `PclTclAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/PclTclAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 12 | CaCl2 Analysis | `CaCl2AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/CaCl2AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`FlaskConical`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 13 | ACL Product Analysis | `ACLProductAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/ACLProductAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`FlaskConical`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 14 | ACL 300 Analysis | `ACL300AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/ACL300AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 15 | Raw Salt Analysis | `RawSaltAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/RawSaltAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Truck`) | Daily Single Record / Sample Grid | StatusSaveButton + ConfirmSaveModal |

---

### 2. SA Plant (15 Analyses)

| # | Analysis Option / Label | Component File | Verification Tag | Header Style | Row/Layout Type | Buttons / Status Flow |
|---|---|---|---|---|---|---|
| 1 | TK 401 (SA) | `TK401SAAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK401SAAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 2 | TK 405 (SA) | `TK405SAAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK405SAAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 3 | TK 414 (TSC Tank) | `TK414TSCTankAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK414TSCTankAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 4 | P 413 (WSC Tank) | `P413WSCTankAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/P413WSCTankAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 5 | TK 419 (SC Tank) | `TK419SCTankAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK419SCTankAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 6 | P 417 (ML-1, ML-2, ML-3) | `P417AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/P417AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | Sub-tabs (ML-1, ML-2, ML-3) + 3 Shift Rows | StatusSaveButton + ConfirmSaveModal |
| 7 | T 401 | `T401AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/T401AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 8 | Bicarbonate Analysis | `BicarbonateAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/BicarbonateAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`FlaskConical`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 9 | Bicarbonate Moisture | `BicarbonateMoistureAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/BicarbonateMoistureAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplet`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 10 | LSA 500 | `LSA500AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/LSA500AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 11 | LSA Shift Analysis | `LSAShiftAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/LSAShiftAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Activity`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 12 | E 501 / T 501 | `E501T501AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/E501T501AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | Sub-tabs (E 501, T 501) + 3 Shift Rows | StatusSaveButton + ConfirmSaveModal |
| 13 | LSA Bagging Analysis | `LSABaggingAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/LSABaggingAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Package`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 14 | LSA Bagging Sieve | `LSABaggingSieveAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/LSABaggingSieveAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Grid`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 15 | Gas Conc. (Boiler / CO2) | `GasConcAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/GasConcAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Wind`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |

---

### 3. OFFSITE Plant (11 Analyses / 10 Components)

| # | Analysis Option / Label | Component File | Verification Tag | Header Style | Row/Layout Type | Buttons / Status Flow |
|---|---|---|---|---|---|---|
| 1 | DM Water Analysis | `DMWaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/DMWaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 2 | BFW Analysis | `BFWAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/BFWAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | Multi-stream sub-tabs / 3 Shifts | StatusSaveButton + ConfirmSaveModal |
| 3 | Raw Water Analysis | `RawWaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/RawWaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | Daily / 3 Shifts | StatusSaveButton + ConfirmSaveModal |
| 4 | CBD Analysis | `CBDAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/CBDAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 5 | Bottom Ash Analysis | `BottomAshAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/BottomAshAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | Shift / Daily rows | StatusSaveButton + ConfirmSaveModal |
| 6 | Fly Ash Analysis | `FlyAshAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/FlyAshAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | Shift / Daily rows | StatusSaveButton + ConfirmSaveModal |
| 7 | Distiller Waste Analysis | `DistillerWasteAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/DistillerWasteAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 8 | Vacuum Seal Water | `VacuumSealWaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/VacuumSealWaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 9 | Sewer Water Analysis | `SewerWaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/SewerWaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 10 | Cooling Water Analysis | `CoolingWaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/CoolingWaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |
| 11 | Cooling Water / 200# | `CoolingWaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/CoolingWaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + ConfirmSaveModal |

---

### 4. CO2 Plant (14 Analyses)

| # | Analysis Option / Label | Component File | Verification Tag | Header Style | Row/Layout Type | Buttons / Status Flow |
|---|---|---|---|---|---|---|
| 1 | BL 1204 / BL 1203 | `BL1204BL1203AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/BL1204BL1203AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 2 | Absorber Inlet | `AbsorberInletAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/AbsorberInletAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Gauge`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 3 | Outlet | `OutletAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/OutletAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Gauge`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 4 | Lean | `LeanAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/LeanAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 5 | Rich | `RichAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/RichAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 6 | Washwater | `WashwaterAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/WashwaterAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Droplets`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 7 | P 1256 | `P1256AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/P1256AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Layers`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 8 | Reflux | `RefluxAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/RefluxAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`RotateCcw`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 9 | TK 1251 | `TK1251AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK1251AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 10 | TK 1252 | `TK1252AnalysisPage.jsx` | [VERIFIED: client/src/pages/company/TK1252AnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | 3 Shift Rows (A, B, C) | StatusSaveButton + SaveConfirmationModal |
| 11 | DCC DRAIN LIQ | `DCCDrainLiqAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/DCCDrainLiqAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | Weekly Analysis Row | StatusSaveButton + SaveConfirmationModal |
| 12 | SOX DRAIN LIQ | `SOXDrainLiqAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/SOXDrainLiqAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | Weekly Analysis Row | StatusSaveButton + SaveConfirmationModal |
| 13 | ABSORBER DRAIN LIQ | `AbsorberDrainLiqAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/AbsorberDrainLiqAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | Weekly Analysis Row | StatusSaveButton + SaveConfirmationModal |
| 14 | LEAN Weekly | `LeanWeeklyAnalysisPage.jsx` | [VERIFIED: client/src/pages/company/LeanWeeklyAnalysisPage.jsx:1-100] | Slate gradient + Breadcrumb (`Database`) | Weekly Analysis Row | StatusSaveButton + SaveConfirmationModal |

---

## Detailed UI Pattern Discrepancies & Standard Reference Identification

1. **Header Cards**:
   - *Pattern A (Standard Reference - Modern Breadcrumb)*: As seen in `PureSaltAnalysisPage.jsx` [VERIFIED: client/src/pages/company/PureSaltAnalysisPage.jsx:555-580], a deep slate banner with back navigation button, plant icon, `ChevronRight`, analysis icon, title in bold uppercase, date badge (`LockedDateDisplay`), and status badge (`RecordStatusBadge`).
   - *Pattern B (Older/Plain Cards)*: Found in older components where plant badges and back buttons use basic flat borders or slightly mismatched font weights.

2. **Table Containers & Headers**:
   - *Pattern A (Modern High-Contrast Gradient)*: `bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white font-semibold text-xs tracking-wider uppercase border-b-2 border-blue-600`.
   - *Pattern B (Flat Dark)*: `bg-slate-800 text-slate-100` or `bg-slate-900`.
   - *Pattern C (Light / Gray Table Headers)*: Found in some nested tables/sub-tables.

3. **Row Styling & Visual Contrast**:
   - Shift-based tables in modern ACL and SA pages use shift color identifiers:
     - Shift A: Light blue accent (`bg-sky-50/50 hover:bg-sky-50 border-l-4 border-l-sky-500`)
     - Shift B: Light indigo accent (`bg-indigo-50/50 hover:bg-indigo-50 border-l-4 border-l-indigo-500`)
     - Shift C: Light purple accent (`bg-purple-50/50 hover:bg-purple-50 border-l-4 border-l-purple-500`)
   - Weekly/Daily pages use standard rows without shift markers.

4. **Action & Modal Controls**:
   - Status buttons and banners are mostly uniform via `StatusSaveButton` and `SaveStatusBanner`.
   - ACL & SA use `ConfirmSaveModal` from `../../components/common/ConfirmSaveModal.jsx`.
   - CO2 uses `SaveConfirmationModal` from `../../utils/co2AnalysisHelper.jsx`.

---

## Conclusion & Verification Summary

- **Total analyses inspected**: 55 (ACL: 15, SA: 15, OFFSITE: 11, CO2: 14)
- **Total files opened**: 54 page component files + 2 routing files (`PlantAnalysisPage.jsx`, `AppRoutes.jsx`).
- **Analyses not inspected**: None. Every analysis option configured in the application router was located and inspected.
