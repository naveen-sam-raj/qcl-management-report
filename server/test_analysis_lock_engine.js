const assert = require('assert');
const {
  getInitialLockState,
  hydrateLockState,
  getItemLockStatus,
  validateSequentialSave,
  applySequentialSaveTransition,
  DEFAULT_SHIFTS_3,
} = require('./services/analysisLockEngine');

console.log('========================================================================');
console.log('🧪 RUNNING ANALYSIS LOCK ENGINE UNIT TESTS');
console.log('========================================================================\n');

// ── TEST 1: Initial State ──
console.log('--- TEST 1: Initial State ---');
const init3 = getInitialLockState({ type: 'shift', items: DEFAULT_SHIFTS_3 });
assert.strictEqual(init3.shift1Saved, false, 'Shift 1 initially not saved');
assert.strictEqual(init3.shift2Saved, false, 'Shift 2 initially not saved');
assert.strictEqual(init3.shift3Saved, false, 'Shift 3 initially not saved');
assert.strictEqual(init3.shift1, false, 'Shift 1 initially open (shift1 is false)');
assert.strictEqual(init3.shift2, true, 'Shift 2 initially locked (shift2 is true)');
assert.strictEqual(init3.shift3, true, 'Shift 3 initially locked (shift3 is true)');
assert.strictEqual(getItemLockStatus(init3, 'shift1'), 'NEW', 'Shift 1 status is NEW');
assert.strictEqual(getItemLockStatus(init3, 'shift2'), 'WAITING', 'Shift 2 status is WAITING');
assert.strictEqual(getItemLockStatus(init3, 'shift3'), 'WAITING', 'Shift 3 status is WAITING');
console.log('  [PASS] Initial state correctly opens only Shift 1 and locks Shift 2 & 3.');

// ── TEST 2: Out of Order Save Rejection ──
console.log('\n--- TEST 2: Out of Order Saves ---');
const tryS2 = validateSequentialSave({ lockState: init3, targetItem: 'shift2', isDiff: true });
assert.strictEqual(tryS2.allowed, false, 'Shift 2 cannot be saved before Shift 1');
assert(tryS2.message.includes('Sequential restriction'), 'Error specifies sequential restriction');

const tryS3 = validateSequentialSave({ lockState: init3, targetItem: 'shift3', isDiff: true });
assert.strictEqual(tryS3.allowed, false, 'Shift 3 cannot be saved before Shift 1 & 2');
console.log('  [PASS] Out-of-order saves properly rejected.');

// ── TEST 3: First Save of Shift 1 ──
console.log('\n--- TEST 3: First Save of Shift 1 ---');
const tryS1First = validateSequentialSave({ lockState: init3, targetItem: 'shift1', isDiff: true });
assert.strictEqual(tryS1First.allowed, true, 'First save of Shift 1 allowed');
assert.strictEqual(tryS1First.isCorrection, false, 'Not a correction');

const stateAfterS1 = applySequentialSaveTransition({ lockState: init3, targetItem: 'shift1', isCorrection: false });
assert.strictEqual(stateAfterS1.shift1Saved, true, 'Shift 1 is now marked saved');
assert.strictEqual(stateAfterS1.shift2Saved, false, 'Shift 2 not saved');
assert.strictEqual(stateAfterS1.shift1Locked, false, 'Shift 1 is NOT permanently locked yet (1 correction allowed)');
assert.strictEqual(stateAfterS1.shift2Locked, false, 'Shift 2 is now unlocked');
assert.strictEqual(stateAfterS1.shift1, false, 'Shift 1 UI open for correction');
assert.strictEqual(stateAfterS1.shift2, false, 'Shift 2 UI open for entry');
assert.strictEqual(stateAfterS1.shift3, true, 'Shift 3 still waiting');
assert.strictEqual(getItemLockStatus(stateAfterS1, 'shift1'), 'FINAL_EDIT', 'Shift 1 status is FINAL_EDIT');
assert.strictEqual(getItemLockStatus(stateAfterS1, 'shift2'), 'NEW', 'Shift 2 status is NEW');
console.log('  [PASS] Shift 1 save persisted, unlocks Shift 2, leaves 1 correction window open.');

// ── TEST 4: One Permitted Correction on Shift 1 ──
console.log('\n--- TEST 4: Correction on Shift 1 Before Shift 2 Saved ---');
const tryS1Corr = validateSequentialSave({ lockState: stateAfterS1, targetItem: 'shift1', isDiff: true });
assert.strictEqual(tryS1Corr.allowed, true, 'Correction on Shift 1 allowed');
assert.strictEqual(tryS1Corr.isCorrection, true, 'Identified as correction');

const stateAfterS1Corr = applySequentialSaveTransition({ lockState: stateAfterS1, targetItem: 'shift1', isCorrection: true });
assert.strictEqual(stateAfterS1Corr.shift1Saved, true, 'Shift 1 saved');
assert.strictEqual(stateAfterS1Corr.shift1Locked, true, 'Shift 1 permanently locked after correction used!');
assert.strictEqual(stateAfterS1Corr.shift1, true, 'Shift 1 UI locked');
assert.strictEqual(stateAfterS1Corr.shift2Locked, false, 'Shift 2 remains open and available');
assert.strictEqual(getItemLockStatus(stateAfterS1Corr, 'shift1'), 'LOCKED', 'Shift 1 is LOCKED');
assert.strictEqual(getItemLockStatus(stateAfterS1Corr, 'shift2'), 'NEW', 'Shift 2 is NEW');

// Try a second correction on Shift 1 -> MUST BE REJECTED
const tryS1SecondCorr = validateSequentialSave({ lockState: stateAfterS1Corr, targetItem: 'shift1', isDiff: true });
assert.strictEqual(tryS1SecondCorr.allowed, false, 'Second correction on Shift 1 rejected!');
assert(tryS1SecondCorr.message.includes('already utilized its single permitted correction'), 'Clear error on exhausted correction');
console.log('  [PASS] Single correction on Shift 1 succeeds and second correction is strictly rejected.');

// ── TEST 5: Saving Shift 2 Automatically Locks Shift 1 (If correction wasn't used) ──
console.log('\n--- TEST 5: Shift 2 Save Locks Predecessor Shift 1 ---');
// From stateAfterS1 (where Shift 1 correction was NOT used):
const tryS2Save = validateSequentialSave({ lockState: stateAfterS1, targetItem: 'shift2', isDiff: true });
assert.strictEqual(tryS2Save.allowed, true, 'Shift 2 save allowed');

const stateAfterS2 = applySequentialSaveTransition({ lockState: stateAfterS1, targetItem: 'shift2', isCorrection: false });
assert.strictEqual(stateAfterS2.shift2Saved, true, 'Shift 2 saved');
assert.strictEqual(stateAfterS2.shift1Locked, true, 'Shift 1 permanently locked because Shift 2 was saved!');
assert.strictEqual(stateAfterS2.shift2Locked, false, 'Shift 2 not locked yet (1 correction allowed)');
assert.strictEqual(stateAfterS2.shift3Locked, false, 'Shift 3 unlocked');
assert.strictEqual(getItemLockStatus(stateAfterS2, 'shift1'), 'LOCKED', 'Shift 1 is LOCKED');
assert.strictEqual(getItemLockStatus(stateAfterS2, 'shift2'), 'FINAL_EDIT', 'Shift 2 is FINAL_EDIT');
assert.strictEqual(getItemLockStatus(stateAfterS2, 'shift3'), 'NEW', 'Shift 3 is NEW');

// Now try to edit Shift 1 -> MUST BE REJECTED
const tryS1AfterS2 = validateSequentialSave({ lockState: stateAfterS2, targetItem: 'shift1', isDiff: true });
assert.strictEqual(tryS1AfterS2.allowed, false, 'Modifying Shift 1 after Shift 2 saved is rejected!');
assert(tryS1AfterS2.message.includes('permanently locked because II SHIFT has already been saved'), 'Clear error message on successor saved');
console.log('  [PASS] Saving Shift 2 permanently locks Shift 1 even if correction was unused.');

// ── TEST 6: Shift 3 and Final Completion ──
console.log('\n--- TEST 6: Shift 3 Initial Save and Final Correction ---');
const tryS3Save = validateSequentialSave({ lockState: stateAfterS2, targetItem: 'shift3', isDiff: true });
assert.strictEqual(tryS3Save.allowed, true, 'Shift 3 save allowed');

const stateAfterS3 = applySequentialSaveTransition({ lockState: stateAfterS2, targetItem: 'shift3', isCorrection: false });
assert.strictEqual(stateAfterS3.shift3Saved, true, 'Shift 3 saved');
assert.strictEqual(stateAfterS3.shift2Locked, true, 'Shift 2 permanently locked');
assert.strictEqual(stateAfterS3.shift3Locked, false, 'Shift 3 allows 1 final correction');
assert.strictEqual(stateAfterS3.allPermanentlyLocked, false, 'Not all locked yet');

// Final correction on Shift 3
const stateAfterS3Corr = applySequentialSaveTransition({ lockState: stateAfterS3, targetItem: 'shift3', isCorrection: true });
assert.strictEqual(stateAfterS3Corr.shift3Locked, true, 'Shift 3 permanently locked');
assert.strictEqual(stateAfterS3Corr.allPermanentlyLocked, true, 'All shifts permanently locked');

// Subsequent save attempts for all shifts must fail
assert.strictEqual(validateSequentialSave({ lockState: stateAfterS3Corr, targetItem: 'shift1', isDiff: true }).allowed, false);
assert.strictEqual(validateSequentialSave({ lockState: stateAfterS3Corr, targetItem: 'shift2', isDiff: true }).allowed, false);
assert.strictEqual(validateSequentialSave({ lockState: stateAfterS3Corr, targetItem: 'shift3', isDiff: true }).allowed, false);
console.log('  [PASS] Shift 3 final correction permanently locks entire date sequence.');

// ── TEST 7: Timing-Based Sequential Progression ──
console.log('\n--- TEST 7: Timing-Based Sequential Progression ---');
const times = ['07:00', '11:00', '15:00', '19:00'];
const timingInit = getInitialLockState({ type: 'timing', items: times });
assert.strictEqual(timingInit.slots['07:00'].isOpen, true, '07:00 open initially');
assert.strictEqual(timingInit.slots['11:00'].isOpen, false, '11:00 locked initially');

const timingAfter07 = applySequentialSaveTransition({ lockState: timingInit, targetItem: '07:00', itemsOrder: times });
assert.strictEqual(timingAfter07.slots['07:00'].isSaved, true, '07:00 saved');
assert.strictEqual(timingAfter07.slots['11:00'].isOpen, true, '11:00 unlocked');

// Save 11:00 -> 07:00 locked
const timingAfter11 = applySequentialSaveTransition({ lockState: timingAfter07, targetItem: '11:00', itemsOrder: times });
assert.strictEqual(timingAfter11.slots['07:00'].isLocked, true, '07:00 permanently locked');
assert.strictEqual(timingAfter11.slots['11:00'].isSaved, true, '11:00 saved');
assert.strictEqual(timingAfter11.slots['15:00'].isOpen, true, '15:00 unlocked');

const try07After11 = validateSequentialSave({ lockState: timingAfter11, targetItem: '07:00', itemsOrder: times, isDiff: true });
assert.strictEqual(try07After11.allowed, false, 'Cannot edit 07:00 after 11:00 saved');
console.log('  [PASS] Timing-based sequential progression operates identically to shifts.');

// ── TEST 8: Analyses with Neither Shifts nor Timings ──
console.log('\n--- TEST 8: Analyses with Neither Shifts nor Timings ---');
const neitherState = getInitialLockState({ type: 'neither' });
assert.strictEqual(neitherState.isUnrestricted, true, 'Neither is unrestricted');
assert.strictEqual(validateSequentialSave({ lockState: neitherState, type: 'neither' }).allowed, true, 'Saves unconditionally allowed');
assert.strictEqual(getItemLockStatus(neitherState, 'anyKey'), 'EDITABLE', 'Always EDITABLE');
console.log('  [PASS] Analyses with neither shifts nor timings are completely open and unrestricted.');

console.log('\n========================================================================');
console.log('✅ ALL ANALYSIS LOCK ENGINE UNIT TESTS PASSED (8/8)!');
console.log('========================================================================');
