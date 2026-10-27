const assert = require('assert');
const {
  isValueEmpty,
  isUnitEmpty,
  computeSlotTransition,
} = require('../services/analysisLockEngine');

console.log('========================================================================');
console.log('🧪 RUNNING SLOT TRANSITION UNIT TESTS (FINAL SPEC)');
console.log('========================================================================\n');

const UNITS_12 = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];

// ── TEST 1: isValueEmpty & isUnitEmpty ──
console.log('--- TEST 1: Value & Unit Empty Checks ---');
assert.strictEqual(isValueEmpty(''), true, 'Empty string is empty');
assert.strictEqual(isValueEmpty(null), true, 'null is empty');
assert.strictEqual(isValueEmpty(undefined), true, 'undefined is empty');
assert.strictEqual(isValueEmpty('   '), true, 'Whitespace string is empty');
assert.strictEqual(isValueEmpty(NaN), true, 'NaN is empty');
assert.strictEqual(isValueEmpty(0), false, 'Numeric 0 is NOT empty (valid value)');
assert.strictEqual(isValueEmpty('0'), false, 'String "0" is NOT empty (valid value)');
assert.strictEqual(isValueEmpty(3.17), false, '3.17 is NOT empty');
assert.strictEqual(isValueEmpty('3.17'), false, '"3.17" is NOT empty');

assert.strictEqual(isUnitEmpty({ fnh3: '', cnh3: null, tcl: undefined, pcl: '   ' }), true, 'All empty fields -> unit is empty');
assert.strictEqual(isUnitEmpty({ fnh3: 0, cnh3: null, tcl: null, pcl: null }), false, 'Field with 0 -> unit is not empty');
assert.strictEqual(isUnitEmpty({ fnh3: '0', cnh3: null }), false, 'Field with "0" -> unit is not empty');
assert.strictEqual(isUnitEmpty({ fnh3: 3.17 }), false, 'Field with 3.17 -> unit is not empty');
console.log('  [PASS] isValueEmpty and isUnitEmpty adhere strictly to 0 is valid value specification.');

// ── TEST 2: Empty unit save rejection (HTTP 400) ──
console.log('\n--- TEST 2: Empty Unit Save Rejection ---');
const emptyRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {},
  storedRows: {},
  incomingRows: {
    t07: { fnh3: '', cnh3: null, tcl: undefined, pcl: '  ' },
  },
});
assert.strictEqual(emptyRes.ok, false, 'Empty unit save must fail');
assert.strictEqual(emptyRes.status, 400, 'Empty unit save status must be 400');
assert(emptyRes.message.includes('Cannot save empty slot t07'), 'Message specifies empty slot error');
console.log('  [PASS] Empty unit save rejected with HTTP 400.');

// ── TEST 3: First save with 0 as valid value (HTTP 200) ──
console.log('\n--- TEST 3: Save Unit with Value 0 ---');
const zeroRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {},
  storedRows: {},
  incomingRows: {
    t07: { fnh3: 0, cnh3: null, tcl: null, pcl: null },
  },
});
assert.strictEqual(zeroRes.ok, true, 'Save unit with 0 must succeed');
assert.strictEqual(zeroRes.status, 200, 'Status is 200');
assert.strictEqual(zeroRes.targetUnit, 't07', 'Target unit is t07');
assert.strictEqual(zeroRes.isCorrection, false, 'Not a correction');
assert.strictEqual(zeroRes.dotPathUpdates['data.lockedSlots.t07.isSaved'], true, 'Marked saved');
assert.strictEqual(zeroRes.dotPathUpdates['data.lockedSlots.t07.isLocked'], false, 'Not permanently locked');
assert.strictEqual(zeroRes.dotPathUpdates['data.rows.t07'].fnh3, 0, 'Value 0 preserved');
console.log('  [PASS] Unit with 0 saved successfully.');

// ── TEST 4: Skip-ahead save rejection (HTTP 400) ──
console.log('\n--- TEST 4: Skip-Ahead Save Rejection ---');
const skipRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {},
  storedRows: {},
  incomingRows: {
    t09: { fnh3: 3.15 },
  },
});
assert.strictEqual(skipRes.ok, false, 'Skip-ahead to t09 must fail when t07 is not saved');
assert.strictEqual(skipRes.status, 400, 'Status is 400');
assert(skipRes.message.includes('Sequential restriction: t07 must be completed and saved'), 'Message specifies sequential restriction');
console.log('  [PASS] Skip-ahead save rejected with HTTP 400.');

// ── TEST 5: Multiple units changed rejection (HTTP 400) ──
console.log('\n--- TEST 5: Multiple Units Changed Rejection ---');
const multiRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {},
  storedRows: {},
  incomingRows: {
    t07: { fnh3: 3.17 },
    t09: { fnh3: 3.20 },
  },
});
assert.strictEqual(multiRes.ok, false, 'Changing multiple units must fail');
assert.strictEqual(multiRes.status, 400, 'Status is 400');
assert(multiRes.message.includes('Only one unit slot may be entered or edited per save'), 'Message specifies multi-unit restriction');
console.log('  [PASS] Multi-unit save rejected with HTTP 400.');

// ── TEST 6: Identical re-save detection (noChange: true, correction not consumed) ──
console.log('\n--- TEST 6: Identical Re-Save Detection ---');
const identRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
  },
  incomingRows: {
    t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
  },
});
assert.strictEqual(identRes.ok, true, 'Identical re-save returns ok: true');
assert.strictEqual(identRes.noChange, true, 'noChange is true');
assert.strictEqual(identRes.isCorrection, false, 'Correction is NOT consumed');
assert.deepStrictEqual(identRes.dotPathUpdates, {}, 'No database updates generated');
console.log('  [PASS] Identical re-save detected with noChange: true and correction preserved.');

// ── TEST 7: Float formatting equivalence ("3.10" vs 3.1) -> noChange: true ──
console.log('\n--- TEST 7: Float Formatting Equivalence ("3.10" vs 3.1) ---');
const floatRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.1, cnh3: 1.98 },
  },
  incomingRows: {
    t07: { fnh3: '3.10', cnh3: '1.980' },
  },
});
assert.strictEqual(floatRes.ok, true, 'Numerically equal float representations must not trigger diff');
assert.strictEqual(floatRes.noChange, true, 'noChange is true for "3.10" vs 3.1');
console.log('  [PASS] Float format differences ("3.10" vs 3.1) correctly treated as identical.');

// ── TEST 8: Single permitted correction on unit k before k+1 is saved ──
console.log('\n--- TEST 8: Single Permitted Correction on Unit k ---');
const corrRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
  },
  incomingRows: {
    t07: { fnh3: 3.25, cnh3: 2.05, tcl: 5.64, pcl: 3.66 },
  },
});
assert.strictEqual(corrRes.ok, true, 'Correction on t07 must succeed');
assert.strictEqual(corrRes.isCorrection, true, 'isCorrection is true');
assert.strictEqual(corrRes.dotPathUpdates['data.lockedSlots.t07.correctionUsed'], true, 'correctionUsed set to true');
assert.strictEqual(corrRes.dotPathUpdates['data.lockedSlots.t07.isLocked'], true, 'Unit is now permanently locked');
assert.strictEqual(corrRes.dotPathUpdates['data.lockedSlots.t07.editsCount'], 1, 'editsCount incremented');
console.log('  [PASS] Correction succeeds and immediately locks unit.');

// ── TEST 9: Second correction attempt on locked unit rejected (HTTP 400) ──
console.log('\n--- TEST 9: Second Correction on Locked Unit Rejection ---');
const secCorrRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: true, isLocked: true, editsCount: 1 },
  },
  storedRows: {
    t07: { fnh3: 3.25, cnh3: 2.05, tcl: 5.64, pcl: 3.66 },
  },
  incomingRows: {
    t07: { fnh3: 3.27, cnh3: 2.05, tcl: 5.64, pcl: 3.66 },
  },
});
assert.strictEqual(secCorrRes.ok, false, 'Second correction attempt must be rejected');
assert.strictEqual(secCorrRes.status, 400, 'Status is 400');
assert(secCorrRes.message.includes('Cannot edit t07 because it is permanently locked'), 'Message specifies unit locked');
console.log('  [PASS] Second correction strictly rejected with HTTP 400.');

// ── TEST 10: Correction cannot clear all values (HTTP 400) ──
console.log('\n--- TEST 10: Correction Clearing All Values Rejection ---');
const clearRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17, cnh3: 1.98 },
  },
  incomingRows: {
    t07: { fnh3: null, cnh3: '' },
  },
});
assert.strictEqual(clearRes.ok, false, 'Correction clearing all values must fail');
assert.strictEqual(clearRes.status, 400, 'Status is 400');
assert(clearRes.message.includes('A correction cannot clear all values'), 'Message specifies clearing error');
console.log('  [PASS] Correction clearing all values rejected with HTTP 400.');

// ── TEST 11: Unit k+1 save permanently locks unit k ──
console.log('\n--- TEST 11: Unit k+1 Save Permanently Locks Unit k ---');
const saveKPlus1Res = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17 },
  },
  incomingRows: {
    t07: { fnh3: 3.17 },
    t09: { fnh3: 3.20 },
  },
});
assert.strictEqual(saveKPlus1Res.ok, true, 't09 save must succeed');
assert.strictEqual(saveKPlus1Res.targetUnit, 't09', 'Target unit is t09');
assert.strictEqual(saveKPlus1Res.dotPathUpdates['data.lockedSlots.t09.isSaved'], true, 't09 is saved');
assert.strictEqual(saveKPlus1Res.dotPathUpdates['data.lockedSlots.t07.isLocked'], true, 'Predecessor t07 is now locked');

// Verify that attempting to edit t07 after t09 was saved is rejected:
const editT07AfterT09 = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: true, editsCount: 0 },
    t09: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17 },
    t09: { fnh3: 3.20 },
  },
  incomingRows: {
    t07: { fnh3: 3.19 }, // Attempting to modify t07
    t09: { fnh3: 3.20 },
  },
});
assert.strictEqual(editT07AfterT09.ok, false, 'Modifying t07 after t09 saved must fail');
assert.strictEqual(editT07AfterT09.status, 400, 'Status is 400');
console.log('  [PASS] Saving unit k+1 permanently locks unit k.');

// ── TEST 12: Last Unit (t05) entry, one correction, lock ──
console.log('\n--- TEST 12: Last Unit (t05) Workflow ---');
// Setup state where all units t07 through t03 are saved and locked:
const allSavedBeforeLast = {};
UNITS_12.slice(0, 11).forEach((u) => {
  allSavedBeforeLast[u] = { isSaved: true, isLocked: true, editsCount: 0 };
});

// 1. Initial save of last unit t05:
const lastInitial = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: allSavedBeforeLast,
  storedRows: {},
  incomingRows: {
    t05: { fnh3: 3.18, cnh3: 1.95 },
  },
});
assert.strictEqual(lastInitial.ok, true, 'First save of t05 succeeds');
assert.strictEqual(lastInitial.targetUnit, 't05', 'Target is t05');
assert.strictEqual(lastInitial.isCorrection, false, 'Initial save');
assert.strictEqual(lastInitial.dotPathUpdates['data.lockedSlots.t05.isSaved'], true, 't05 marked saved');
assert.strictEqual(lastInitial.dotPathUpdates['data.lockedSlots.t05.isLocked'], false, 't05 not locked yet (1 correction left)');

// 2. Single correction on last unit t05:
const stateAfterLastInitial = {
  ...allSavedBeforeLast,
  t05: { isSaved: true, isLocked: false, correctionUsed: false, editsCount: 0 },
};
const lastCorrection = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: stateAfterLastInitial,
  storedRows: {
    t05: { fnh3: 3.18, cnh3: 1.95 },
  },
  incomingRows: {
    t05: { fnh3: 3.22, cnh3: 1.95 },
  },
});
assert.strictEqual(lastCorrection.ok, true, 'Correction on t05 succeeds');
assert.strictEqual(lastCorrection.isCorrection, true, 'isCorrection is true');
assert.strictEqual(lastCorrection.dotPathUpdates['data.lockedSlots.t05.isLocked'], true, 't05 is now permanently locked');
assert.strictEqual(lastCorrection.dotPathUpdates['data.lockedSlots.t05.correctionUsed'], true, 't05 correctionUsed is true');

// 3. Second edit attempt on last unit t05 is rejected:
const stateAfterLastCorrection = {
  ...allSavedBeforeLast,
  t05: { isSaved: true, isLocked: true, correctionUsed: true, editsCount: 1 },
};
const lastSecondEdit = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: stateAfterLastCorrection,
  storedRows: {
    t05: { fnh3: 3.22, cnh3: 1.95 },
  },
  incomingRows: {
    t05: { fnh3: 3.25, cnh3: 1.95 },
  },
});
assert.strictEqual(lastSecondEdit.ok, false, 'Second edit on t05 must fail');
assert.strictEqual(lastSecondEdit.status, 400, 'Status is 400');
console.log('  [PASS] Last unit (t05) entry, single correction, and permanent lock verified.');

// ── TEST 13: Multi-field correction in ONE call ──
// t07 saved {fnh3: 1, cnh3: 2}; edit to {fnh3: 5, cnh3: 6} in ONE call -> ok, correctionUsed=true, unit locked, only ONE correction consumed.
console.log('\n--- TEST 13: Multi-Field Correction in One Call ---');
const multiFieldRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 1, cnh3: 2 },
  },
  incomingRows: {
    t07: { fnh3: 5, cnh3: 6 },
  },
});
assert.strictEqual(multiFieldRes.ok, true, 'Multi-field correction must succeed');
assert.strictEqual(multiFieldRes.targetUnit, 't07', 'Target unit is t07');
assert.strictEqual(multiFieldRes.isCorrection, true, 'isCorrection is true');
assert.strictEqual(multiFieldRes.dotPathUpdates['data.lockedSlots.t07.correctionUsed'], true, 'correctionUsed is true');
assert.strictEqual(multiFieldRes.dotPathUpdates['data.lockedSlots.t07.isLocked'], true, 'Unit is locked');
assert.strictEqual(multiFieldRes.dotPathUpdates['data.lockedSlots.t07.editsCount'], 1, 'Exactly one correction consumed');
assert.deepStrictEqual(multiFieldRes.dotPathUpdates['data.rows.t07'], { fnh3: 5, cnh3: 6 }, 'Both fields updated');
console.log('  [PASS] Multi-field correction in one Save consumed exactly 1 correction and locked unit.');

// ── TEST 14: Unit k correction already used (locked), then unit k+1 first save ──
// t07 correction already used (locked), then t09 first save -> ok, t07 stays locked, no error.
console.log('\n--- TEST 14: t07 Correction Used (Locked), then t09 First Save ---');
const t09AfterT07LockedRes = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: true, isLocked: true, editsCount: 1 },
    t09: { isSaved: false, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 5, cnh3: 6 },
  },
  incomingRows: {
    t07: { fnh3: 5, cnh3: 6 }, // unchanged
    t09: { fnh3: 3.17, cnh3: 1.98 },
  },
});
assert.strictEqual(t09AfterT07LockedRes.ok, true, 't09 first save succeeds even when t07 is already locked');
assert.strictEqual(t09AfterT07LockedRes.targetUnit, 't09', 'Target unit is t09');
assert.strictEqual(t09AfterT07LockedRes.isCorrection, false, 't09 is first save');
assert.strictEqual(t09AfterT07LockedRes.dotPathUpdates['data.lockedSlots.t09.isSaved'], true, 't09 is marked saved');
assert.strictEqual(t09AfterT07LockedRes.dotPathUpdates['data.lockedSlots.t07.isLocked'], true, 't07 stays locked');
console.log('  [PASS] First save of t09 succeeds when t07 is already locked, without error.');

// ── TEST 15: Values equality & diff checks ("" vs null, null vs "", "3.10" vs 3.1, 0 vs "") ──
console.log('\n--- TEST 15: Detailed Value Comparison Checks ---');
// 15a: stored "" vs incoming null -> noChange: true
const resEmptyVsNull = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: { t07: { isSaved: true, isLocked: false, correctionUsed: false } },
  storedRows: { t07: { fnh3: '', cnh3: 1.95 } },
  incomingRows: { t07: { fnh3: null, cnh3: 1.95 } },
});
assert.strictEqual(resEmptyVsNull.noChange, true, 'Stored "" vs incoming null is NOT a diff');

// 15b: stored null vs incoming "" -> noChange: true
const resNullVsEmpty = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: { t07: { isSaved: true, isLocked: false, correctionUsed: false } },
  storedRows: { t07: { fnh3: null, cnh3: 1.95 } },
  incomingRows: { t07: { fnh3: '', cnh3: 1.95 } },
});
assert.strictEqual(resNullVsEmpty.noChange, true, 'Stored null vs incoming "" is NOT a diff');

// 15c: stored "3.10" vs incoming 3.1 -> noChange: true
const resFloatEquiv = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: { t07: { isSaved: true, isLocked: false, correctionUsed: false } },
  storedRows: { t07: { fnh3: '3.10', cnh3: 1.95 } },
  incomingRows: { t07: { fnh3: 3.1, cnh3: 1.95 } },
});
assert.strictEqual(resFloatEquiv.noChange, true, 'Stored "3.10" vs incoming 3.1 is NOT a diff');

// 15d: stored 0 vs incoming "" -> THIS IS A DIFF (0 -> empty)
const resZeroVsEmpty = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: { t07: { isSaved: true, isLocked: false, correctionUsed: false } },
  storedRows: { t07: { fnh3: 0, cnh3: 1.95 } },
  incomingRows: { t07: { fnh3: '', cnh3: 1.95 } },
});
assert.strictEqual(resZeroVsEmpty.noChange, false, 'Stored 0 vs incoming "" IS a diff');
assert.strictEqual(resZeroVsEmpty.targetUnit, 't07', 'Detected change on t07');
assert.strictEqual(resZeroVsEmpty.isCorrection, true, 'Treated as correction');
console.log('  [PASS] Checked "" vs null (no diff), null vs "" (no diff), "3.10" vs 3.1 (no diff), and 0 vs "" (IS diff).');

// ── TEST 16: Exact dotPathUpdates object deep equal assertions ──
console.log('\n--- TEST 16: Exact dotPathUpdates Deep Equality Assertions ---');
const fixedTime = '2026-10-27T10:00:00.000Z';

// 16a: First save of t07
const resFirstT07 = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {},
  storedRows: {},
  incomingRows: {
    t07: { fnh3: 3.17, cnh3: 1.98 },
  },
  now: fixedTime,
});
const expectedFirstT07Updates = {
  'data.rows.t07': { fnh3: 3.17, cnh3: 1.98 },
  'data.lockedSlots.t07.isSaved': true,
  'data.lockedSlots.t07.correctionUsed': false,
  'data.lockedSlots.t07.editsCount': 0,
  'data.lockedSlots.t07.isLocked': false,
  'data.lockedSlots.t07.savedAt': fixedTime,
};
assert.deepStrictEqual(resFirstT07.dotPathUpdates, expectedFirstT07Updates, 'Exact dotPathUpdates for first save of t07');

// 16b: First save of t09 (must include data.lockedSlots.t07.isLocked=true)
const resFirstT09 = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17, cnh3: 1.98 },
  },
  incomingRows: {
    t07: { fnh3: 3.17, cnh3: 1.98 },
    t09: { fnh3: 3.20, cnh3: 2.00 },
  },
  now: fixedTime,
});
const expectedFirstT09Updates = {
  'data.rows.t09': { fnh3: 3.20, cnh3: 2.00 },
  'data.lockedSlots.t09.isSaved': true,
  'data.lockedSlots.t09.correctionUsed': false,
  'data.lockedSlots.t09.editsCount': 0,
  'data.lockedSlots.t09.isLocked': false,
  'data.lockedSlots.t09.savedAt': fixedTime,
  'data.lockedSlots.t07.isLocked': true, // Predecessor permanently locked!
};
assert.deepStrictEqual(resFirstT09.dotPathUpdates, expectedFirstT09Updates, 'Exact dotPathUpdates for first save of t09 includes t07.isLocked=true');

// 16c: Correction on t09
const resCorrT09 = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: {
    t07: { isSaved: true, correctionUsed: false, isLocked: true, editsCount: 0 },
    t09: { isSaved: true, correctionUsed: false, isLocked: false, editsCount: 0 },
  },
  storedRows: {
    t07: { fnh3: 3.17, cnh3: 1.98 },
    t09: { fnh3: 3.20, cnh3: 2.00 },
  },
  incomingRows: {
    t07: { fnh3: 3.17, cnh3: 1.98 },
    t09: { fnh3: 3.25, cnh3: 2.05 },
  },
  now: fixedTime,
});
const expectedCorrT09Updates = {
  'data.rows.t09': { fnh3: 3.25, cnh3: 2.05 },
  'data.lockedSlots.t09.correctionUsed': true,
  'data.lockedSlots.t09.editsCount': 1,
  'data.lockedSlots.t09.isLocked': true,
  'data.lockedSlots.t09.correctedAt': fixedTime,
};
assert.deepStrictEqual(resCorrT09.dotPathUpdates, expectedCorrT09Updates, 'Exact dotPathUpdates for correction on t09');

// 16d: Last unit t05 correction
const allLockedExceptT05 = {};
UNITS_12.slice(0, 11).forEach((u) => {
  allLockedExceptT05[u] = { isSaved: true, isLocked: true, editsCount: 0 };
});
allLockedExceptT05.t05 = { isSaved: true, isLocked: false, correctionUsed: false, editsCount: 0 };

const resCorrT05 = computeSlotTransition({
  unitsOrder: UNITS_12,
  lockedSlots: allLockedExceptT05,
  storedRows: {
    t05: { fnh3: 3.18, cnh3: 1.95 },
  },
  incomingRows: {
    t05: { fnh3: 3.22, cnh3: 1.97 },
  },
  now: fixedTime,
});
const expectedCorrT05Updates = {
  'data.rows.t05': { fnh3: 3.22, cnh3: 1.97 },
  'data.lockedSlots.t05.correctionUsed': true,
  'data.lockedSlots.t05.editsCount': 1,
  'data.lockedSlots.t05.isLocked': true,
  'data.lockedSlots.t05.correctedAt': fixedTime,
};
assert.deepStrictEqual(resCorrT05.dotPathUpdates, expectedCorrT05Updates, 'Exact dotPathUpdates for correction on last unit t05');

// 16e: Confirm no key writes outside data.rows.<slot>, data.lockedSlots.<slot>.*, and editedFields/editAuditHistory entries
const allowedPrefixes = ['data.rows.', 'data.lockedSlots.', 'data.editedFields', 'data.editAuditHistory'];
const allTestedUpdates = [resFirstT07, resFirstT09, resCorrT09, resCorrT05];
allTestedUpdates.forEach((res) => {
  Object.keys(res.dotPathUpdates).forEach((key) => {
    const isValid = allowedPrefixes.some((prefix) => key.startsWith(prefix));
    assert.strictEqual(isValid, true, `Key "${key}" must be within allowed prefixes`);
  });
});
console.log('  [PASS] Exact dotPathUpdates deep equal assertions passed for all 4 scenarios with zero key pollution.');

console.log('\n========================================================================');
console.log('✅ ALL SLOT TRANSITION UNIT TESTS PASSED (16/16)!');
console.log('========================================================================');
