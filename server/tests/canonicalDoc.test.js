const assert = require('assert');
const { pickCanonicalDoc } = require('../services/analysisLockEngine');

console.log('========================================================================');
console.log('🧪 RUNNING CANONICAL DOC SELECTION UNIT TESTS');
console.log('========================================================================\n');

// ── TEST 1: Real duplicate shapes from database (2026-10-07 TK 205 documents) ──
console.log('--- TEST 1: Real DB Duplicate Shapes (6ac631eee42bcc5cd1688946 vs 6ac631efbd7cc533ad5d0f8a) ---');

const docWithRealData = {
  _id: '6ac631eee42bcc5cd1688946',
  plantCode: 'ACL',
  analysisType: 'TK 205 Analysis',
  date: '2026-10-07',
  shift: '',
  data: {
    rows: {
      t07: { fnh3: 3.15, cnh3: 1.95, tcl: 5.60, pcl: 3.65 },
      t09: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
      t11: { fnh3: 3.18, cnh3: 1.99, tcl: 5.65, pcl: 3.67 },
      t13: { fnh3: 3.20, cnh3: 2.01, tcl: 5.68, pcl: 3.70 },
      t15: { fnh3: 3.16, cnh3: 1.96, tcl: 5.62, pcl: 3.64 },
      t17: { fnh3: 3.14, cnh3: 1.94, tcl: 5.59, pcl: 3.62 },
    },
  },
  updatedAt: new Date('2026-10-07T11:50:06.217Z'),
};

const docEmptyPlaceholder = {
  _id: '6ac631efbd7cc533ad5d0f8a',
  plantCode: 'ACL',
  analysisType: 'TK 205 Analysis',
  date: '2026-10-07',
  shift: 'All Shifts',
  data: {
    rows: {},
  },
  updatedAt: new Date('2026-10-07T11:52:08.658Z'), // Slightly later timestamp, but empty data!
};

// Even if the empty placeholder is first in array or has later timestamp, the doc with data must be chosen
const picked1 = pickCanonicalDoc([docEmptyPlaceholder, docWithRealData]);
assert.strictEqual(String(picked1._id), '6ac631eee42bcc5cd1688946', 'Doc with data must be picked over empty doc with later timestamp');

const picked2 = pickCanonicalDoc([docWithRealData, docEmptyPlaceholder]);
assert.strictEqual(String(picked2._id), '6ac631eee42bcc5cd1688946', 'Order in array must not affect choice');
console.log('  [PASS] Document with data (6ac631eee42bcc5cd1688946) correctly chosen over empty placeholder (6ac631efbd7cc533ad5d0f8a).');

// ── TEST 2: Tie-breaker on equal data count: pick most recent updatedAt ──
console.log('\n--- TEST 2: Tie-breaker with Equal Data Count ---');

const docOlder = {
  _id: 'doc_older_111',
  data: {
    rows: {
      t07: { fnh3: 3.15, cnh3: 1.95 },
    },
  },
  updatedAt: new Date('2026-10-10T08:00:00Z'),
};

const docNewer = {
  _id: 'doc_newer_222',
  data: {
    rows: {
      t07: { fnh3: 3.20, cnh3: 1.98 },
    },
  },
  updatedAt: new Date('2026-10-10T10:00:00Z'),
};

const pickedTie = pickCanonicalDoc([docOlder, docNewer]);
assert.strictEqual(pickedTie._id, 'doc_newer_222', 'Newer updatedAt must win tie-breaker');
console.log('  [PASS] Tie-breaker properly selects doc with most recent updatedAt.');

// ── TEST 3: Edge cases (single doc, empty, null) ──
console.log('\n--- TEST 3: Edge Cases ---');
assert.strictEqual(pickCanonicalDoc([]), null, 'Empty array returns null');
assert.strictEqual(pickCanonicalDoc(null), null, 'null returns null');
assert.strictEqual(pickCanonicalDoc([docOlder])._id, 'doc_older_111', 'Single doc returns that doc');
console.log('  [PASS] Edge cases handled gracefully.');

console.log('\n========================================================================');
console.log('✅ ALL CANONICAL DOC SELECTION UNIT TESTS PASSED (3/3)!');
console.log('========================================================================');
