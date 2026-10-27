const assert = require('assert');
const { getOperatingDateIST } = require('../utils/operatingDate');

console.log('========================================================================');
console.log('🧪 RUNNING OPERATING DATE UNIT TESTS');
console.log('========================================================================\n');

// Helper to construct a Date object for a specific IST wall-clock time
// IST is UTC + 5:30 (5.5 hours ahead of UTC)
function createISTDate(year, month, day, hour, minute) {
  // Convert IST time to UTC timestamp: UTC = IST - 5h30m
  const istMinutes = hour * 60 + minute;
  const utcMinutes = istMinutes - 330;
  return new Date(Date.UTC(year, month - 1, day, 0, utcMinutes, 0));
}

// ── TEST 1: Post-Midnight 00:30 IST -> Previous Calendar Day ──
console.log('--- TEST 1: 00:30 IST (Post-Midnight) ---');
const date0030 = createISTDate(2026, 10, 27, 0, 30);
const res0030 = getOperatingDateIST(date0030);
assert.strictEqual(res0030, '2026-10-26', '00:30 IST on 2026-10-27 must resolve to 2026-10-26');
console.log('  [PASS] 2026-10-27 00:30 IST correctly resolved to 2026-10-26');

// ── TEST 2: 05:59 IST (Last minute of operational day) -> Previous Calendar Day ──
console.log('\n--- TEST 2: 05:59 IST (End of operational day) ---');
const date0559 = createISTDate(2026, 10, 27, 5, 59);
const res0559 = getOperatingDateIST(date0559);
assert.strictEqual(res0559, '2026-10-26', '05:59 IST on 2026-10-27 must resolve to 2026-10-26');
console.log('  [PASS] 2026-10-27 05:59 IST correctly resolved to 2026-10-26');

// ── TEST 3: 06:00 IST (Start of operational day) -> Current Calendar Day ──
console.log('\n--- TEST 3: 06:00 IST (Start of operational day) ---');
const date0600 = createISTDate(2026, 10, 27, 6, 0);
const res0600 = getOperatingDateIST(date0600);
assert.strictEqual(res0600, '2026-10-27', '06:00 IST on 2026-10-27 must resolve to 2026-10-27');
console.log('  [PASS] 2026-10-27 06:00 IST correctly resolved to 2026-10-27');

// ── TEST 4: 23:59 IST (Night before midnight) -> Current Calendar Day ──
console.log('\n--- TEST 4: 23:59 IST (Night before midnight) ---');
const date2359 = createISTDate(2026, 10, 27, 23, 59);
const res2359 = getOperatingDateIST(date2359);
assert.strictEqual(res2359, '2026-10-27', '23:59 IST on 2026-10-27 must resolve to 2026-10-27');
console.log('  [PASS] 2026-10-27 23:59 IST correctly resolved to 2026-10-27');

// ── TEST 5: Month Boundary: 2026-11-01 00:30 IST -> 2026-10-31 ──
console.log('\n--- TEST 5: Month Boundary (2026-11-01 00:30 IST) ---');
const dateMonthBoundary = createISTDate(2026, 11, 1, 0, 30);
const resMonthBoundary = getOperatingDateIST(dateMonthBoundary);
assert.strictEqual(resMonthBoundary, '2026-10-31', '2026-11-01 00:30 IST must resolve to 2026-10-31');
console.log('  [PASS] 2026-11-01 00:30 IST correctly resolved across month boundary to 2026-10-31');

// ── TEST 6: Year Boundary: 2027-01-01 02:00 IST -> 2026-12-31 ──
console.log('\n--- TEST 6: Year Boundary (2027-01-01 02:00 IST) ---');
const dateYearBoundary = createISTDate(2027, 1, 1, 2, 0);
const resYearBoundary = getOperatingDateIST(dateYearBoundary);
assert.strictEqual(resYearBoundary, '2026-12-31', '2027-01-01 02:00 IST must resolve to 2026-12-31');
console.log('  [PASS] 2027-01-01 02:00 IST correctly resolved across year boundary to 2026-12-31');

// ── TEST 7: Leap Year: 2024-03-01 03:00 IST -> 2024-02-29 ──
console.log('\n--- TEST 7: Leap Year (2024-03-01 03:00 IST) ---');
const dateLeapYear = createISTDate(2024, 3, 1, 3, 0);
const resLeapYear = getOperatingDateIST(dateLeapYear);
assert.strictEqual(resLeapYear, '2024-02-29', '2024-03-01 03:00 IST must resolve to 2024-02-29');
console.log('  [PASS] 2024-03-01 03:00 IST correctly resolved leap day to 2024-02-29');

console.log('\n========================================================================');
console.log('✅ ALL OPERATING DATE UNIT TESTS PASSED (7/7)!');
console.log('========================================================================');
