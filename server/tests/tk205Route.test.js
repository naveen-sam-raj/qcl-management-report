const assert = require('assert');
const { PlantAnalysisRecord } = require('../models');
const router = require('../routes/tk205AnalysisRoutes');

console.log('========================================================================');
console.log('🧪 RUNNING TK 205 ROUTE UNIT TESTS (MOCKED MODEL, NO DB)');
console.log('========================================================================\n');

// Extract the POST route handler from the router stack
const postLayer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
const postHandler = postLayer.route.stack[0].handle;

const makeReq = ({
  body = {},
  headers = {},
  user = { _id: 'user_123', name: 'Plant Operator', role: 'admin', company: 'comp_456' },
} = {}) => ({
  body,
  headers,
  user,
});

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

// Asia/Kolkata date helper for today's test date
const getTodayKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

const today = getTodayKolkata();

// Save original Model methods to restore after tests
const origFind = PlantAnalysisRecord.find;
const origFindOne = PlantAnalysisRecord.findOne;
const origUpdateOne = PlantAnalysisRecord.updateOne;
const origFindOneAndUpdate = PlantAnalysisRecord.findOneAndUpdate;

async function runTests() {
  try {
    // ── TEST 1: First Save of t07 (Doc Missing -> updateOne with $setOnInsert) ──
    console.log('--- TEST 1: First Save of t07 (Doc Missing) ---');
    let updateOneCalledWith = null;
    let findFilterCalledWith = null;

    PlantAnalysisRecord.find = async (q) => {
      findFilterCalledWith = q;
      return []; // No existing doc
    };

    PlantAnalysisRecord.updateOne = async (filter, update, options) => {
      updateOneCalledWith = { filter, update, options };
      return { acknowledged: true, modifiedCount: 0, upsertedCount: 1 };
    };

    PlantAnalysisRecord.findOne = async () => ({
      _id: 'doc_tk205_new',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: today,
    });

    const req1 = makeReq({
      body: {
        date: today,
        plant: 'ACL',
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
        },
      },
    });
    const res1 = makeRes();
    await postHandler(req1, res1);

    assert.strictEqual(res1.statusCode, 200, 'First save of t07 must return 200');
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.targetUnit, 't07');
    assert.strictEqual(res1.body.isCorrection, false);

    assert(updateOneCalledWith, 'updateOne must be called');
    assert.strictEqual(updateOneCalledWith.options.upsert, true, 'upsert must be true');
    assert.strictEqual(updateOneCalledWith.filter.plantCode, 'ACL');
    assert.strictEqual(updateOneCalledWith.update.$setOnInsert.plantCode, 'ACL');
    assert.strictEqual(updateOneCalledWith.update.$setOnInsert.analysisType, 'TK 205 Analysis');

    // Requirement 3: First save of a slot must NOT write editedFields/editAuditHistory
    assert.strictEqual('data.editedFields' in updateOneCalledWith.update.$set, false, 'First save of t07 must NOT write editedFields');
    assert.strictEqual('data.editAuditHistory' in updateOneCalledWith.update.$set, false, 'First save of t07 must NOT write editAuditHistory');
    console.log('  [PASS] First save of t07 called updateOne with $setOnInsert + dot-paths and no top-level "data" key, without writing editedFields/editAuditHistory.');

    // ── TEST 2: Second Slot t09 Save (Locks Predecessor t07) ──
    console.log('\n--- TEST 2: Second Slot t09 Save (Locks t07) ---');
    const existingDocWithT07 = {
      _id: 'doc_existing_123',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: today,
      data: {
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
        },
        lockedSlots: {
          t07: { isSaved: true, correctionUsed: false, editsCount: 0, isLocked: false },
        },
      },
      updatedAt: new Date(),
    };

    let findOneAndUpdateCalledWith = null;
    PlantAnalysisRecord.find = async () => [existingDocWithT07];
    PlantAnalysisRecord.findOneAndUpdate = async (filter, update, options) => {
      findOneAndUpdateCalledWith = { filter, update, options };
      return { ...existingDocWithT07, data: { ...existingDocWithT07.data, ...update.$set } };
    };

    const req2 = makeReq({
      body: {
        date: today,
        plant: 'ACL',
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 }, // unchanged
          t09: { fnh3: 3.20, cnh3: 2.00, tcl: 5.65, pcl: 3.68 },
        },
      },
    });
    const res2 = makeRes();
    await postHandler(req2, res2);

    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.targetUnit, 't09');
    assert.strictEqual(res2.body.isCorrection, false);

    assert(findOneAndUpdateCalledWith, 'findOneAndUpdate must be called');
    assert.strictEqual(String(findOneAndUpdateCalledWith.filter._id), 'doc_existing_123');
    // Lock conditional guard
    assert.deepStrictEqual(findOneAndUpdateCalledWith.filter.$or, [
      { 'data.lockedSlots.t09.isSaved': { $ne: true } },
      { 'data.lockedSlots.t09': { $exists: false } },
    ]);
    // Predecessor t07 is permanently locked!
    assert.strictEqual(findOneAndUpdateCalledWith.update.$set['data.lockedSlots.t07.isLocked'], true, 'Predecessor t07 must be locked');
    assert.strictEqual(findOneAndUpdateCalledWith.update.$set['data.lockedSlots.t09.isSaved'], true);
    assert.strictEqual(findOneAndUpdateCalledWith.update.$set['data.lockedSlots.t09.isLocked'], false);
    // Confirm no top-level data key
    assert.strictEqual('data' in findOneAndUpdateCalledWith.update.$set, false, 'No top-level data key');
    console.log('  [PASS] t09 save used conditional findOneAndUpdate and permanently locked predecessor t07.');

    // ── TEST 3: Correction on t09 + editedFields / editAuditHistory Written ──
    console.log('\n--- TEST 3: Correction on t09 with Audit History ---');
    const existingDocWithT09 = {
      _id: 'doc_existing_123',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: today,
      data: {
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
          t09: { fnh3: 3.20, cnh3: 2.00, tcl: 5.65, pcl: 3.68 },
        },
        lockedSlots: {
          t07: { isSaved: true, correctionUsed: false, editsCount: 0, isLocked: true },
          t09: { isSaved: true, correctionUsed: false, editsCount: 0, isLocked: false },
        },
        editedFields: {},
        editAuditHistory: [],
      },
      updatedAt: new Date(),
    };

    PlantAnalysisRecord.find = async () => [existingDocWithT09];
    PlantAnalysisRecord.findOneAndUpdate = async (filter, update) => {
      findOneAndUpdateCalledWith = { filter, update };
      return { ...existingDocWithT09, data: { ...existingDocWithT09.data, ...update.$set } };
    };

    const req3 = makeReq({
      body: {
        date: today,
        plant: 'ACL',
        submittedBy: 'Shift Chemist',
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
          t09: { fnh3: 3.25, cnh3: 2.05, tcl: 5.65, pcl: 3.68 }, // fnh3 changed 3.20->3.25, cnh3 changed 2.00->2.05
        },
      },
    });
    const res3 = makeRes();
    await postHandler(req3, res3);

    assert.strictEqual(res3.statusCode, 200);
    assert.strictEqual(res3.body.targetUnit, 't09');
    assert.strictEqual(res3.body.isCorrection, true);

    // Conditional guard for correction
    assert.strictEqual(findOneAndUpdateCalledWith.filter['data.lockedSlots.t09.isSaved'], true);
    assert.strictEqual(findOneAndUpdateCalledWith.filter['data.lockedSlots.t09.correctionUsed'], false);
    assert.strictEqual(findOneAndUpdateCalledWith.filter['data.lockedSlots.t09.isLocked'], false);

    // Assert correction locked immediately
    assert.strictEqual(findOneAndUpdateCalledWith.update.$set['data.lockedSlots.t09.correctionUsed'], true);
    assert.strictEqual(findOneAndUpdateCalledWith.update.$set['data.lockedSlots.t09.isLocked'], true);

    // Assert audit history & editedFields written
    const editedFields = findOneAndUpdateCalledWith.update.$set['data.editedFields'];
    const editAuditHistory = findOneAndUpdateCalledWith.update.$set['data.editAuditHistory'];
    assert(editedFields['t09_fnh3'], 't09_fnh3 must be marked in editedFields');
    assert(editedFields['t09_cnh3'], 't09_cnh3 must be marked in editedFields');
    assert.strictEqual(editAuditHistory.length, 2, 'Two audit entries generated');
    assert.strictEqual(editAuditHistory[0].paramKey, 'fnh3');
    assert.strictEqual(editAuditHistory[0].oldValue, '3.2');
    assert.strictEqual(editAuditHistory[0].newValue, '3.25');
    console.log('  [PASS] Correction on t09 wrote conditional lock, locked slot immediately, and stored audit history.');

    // ── TEST 4: Locked Unit Edit Rejection (HTTP 400) ──
    console.log('\n--- TEST 4: Locked Unit Edit Rejection ---');
    const docWithLockedT07 = {
      _id: 'doc_existing_123',
      date: today,
      data: {
        rows: { t07: { fnh3: 3.17 } },
        lockedSlots: { t07: { isSaved: true, isLocked: true, correctionUsed: true } },
      },
    };
    PlantAnalysisRecord.find = async () => [docWithLockedT07];

    const req4 = makeReq({
      body: {
        date: today,
        rows: { t07: { fnh3: 3.25 } },
      },
    });
    const res4 = makeRes();
    await postHandler(req4, res4);

    assert.strictEqual(res4.statusCode, 400, 'Locked unit edit must return 400');
    assert(res4.body.message.includes('Cannot edit t07 because it is permanently locked'));
    console.log('  [PASS] Locked unit edit rejected with HTTP 400.');

    // ── TEST 5: Empty Unit Save Rejection (HTTP 400) ──
    console.log('\n--- TEST 5: Empty Unit Save Rejection ---');
    PlantAnalysisRecord.find = async () => [];

    const req5 = makeReq({
      body: {
        date: today,
        rows: { t07: { fnh3: '', cnh3: null, tcl: undefined, pcl: '   ' } },
      },
    });
    const res5 = makeRes();
    await postHandler(req5, res5);

    assert.strictEqual(res5.statusCode, 400, 'Empty unit save must return 400');
    assert(res5.body.message.includes('Cannot save empty slot t07'));
    console.log('  [PASS] Empty unit save rejected with HTTP 400.');

    // ── TEST 6: Skip-Ahead Save Rejection (HTTP 400) ──
    console.log('\n--- TEST 6: Skip-Ahead Save Rejection ---');
    PlantAnalysisRecord.find = async () => [existingDocWithT07]; // Only t07 saved; t09 not saved

    const req6 = makeReq({
      body: {
        date: today,
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
          t11: { fnh3: 3.22 }, // Attempting t11 directly!
        },
      },
    });
    const res6 = makeRes();
    await postHandler(req6, res6);

    assert.strictEqual(res6.statusCode, 400, 'Skip-ahead must return 400');
    assert(res6.body.message.includes('Sequential restriction: t09 must be completed and saved before proceeding to t11'));
    console.log('  [PASS] Skip-ahead save rejected with HTTP 400.');

    // ── TEST 7: Race Condition 409 Conflict ──
    console.log('\n--- TEST 7: Race Condition Handling (HTTP 409) ---');
    // Case 7a: Doc missing, concurrent create throws E11000
    PlantAnalysisRecord.find = async () => [];
    PlantAnalysisRecord.updateOne = async () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    };

    const req7a = makeReq({
      body: {
        date: today,
        rows: { t07: { fnh3: 3.17 } },
      },
    });
    const res7a = makeRes();
    await postHandler(req7a, res7a);
    assert.strictEqual(res7a.statusCode, 409, 'E11000 duplicate insert must return 409');
    assert(res7a.body.message.includes('Conflict'));

    // Case 7b: Doc exists, findOneAndUpdate returns null because lock condition failed
    PlantAnalysisRecord.find = async () => [existingDocWithT07];
    PlantAnalysisRecord.findOneAndUpdate = async () => null; // Condition failed!

    const req7b = makeReq({
      body: {
        date: today,
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
          t09: { fnh3: 3.20, cnh3: 2.00, tcl: 5.65, pcl: 3.68 },
        },
      },
    });
    const res7b = makeRes();
    await postHandler(req7b, res7b);
    assert.strictEqual(res7b.statusCode, 409, 'Concurrent update returning null must return 409');
    assert(res7b.body.message.includes('Conflict'));
    console.log('  [PASS] Race conditions (E11000 and lock condition mismatch) properly return HTTP 409.');

    // ── TEST 8: Identical Re-Save (noChange: true, HTTP 200, Zero Writes) ──
    console.log('\n--- TEST 8: Identical Re-Save ---');
    let dbWriteAttempted = false;
    PlantAnalysisRecord.find = async () => [existingDocWithT07];
    PlantAnalysisRecord.findOneAndUpdate = async () => {
      dbWriteAttempted = true;
    };
    PlantAnalysisRecord.updateOne = async () => {
      dbWriteAttempted = true;
    };

    const req8 = makeReq({
      body: {
        date: today,
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 }, // Identical
        },
      },
    });
    const res8 = makeRes();
    await postHandler(req8, res8);

    assert.strictEqual(res8.statusCode, 200);
    assert.strictEqual(res8.body.success, true);
    assert.strictEqual(res8.body.noChange, true);
    assert.strictEqual(res8.body.message, 'No changes');
    assert.strictEqual(dbWriteAttempted, false, 'No DB write should occur on identical re-save');
    console.log('  [PASS] Identical re-save returned 200 {success:true, noChange:true, message:"No changes"} with zero DB writes.');

    // ── TEST 9: Duplicate Docs Pick Canonical ──
    console.log('\n--- TEST 9: Duplicate Docs Pick Canonical ---');
    const docWithRealData = {
      _id: 'doc_canonical_data',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: today,
      data: {
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
        },
        lockedSlots: {
          t07: { isSaved: true, isLocked: false, editsCount: 0 },
        },
      },
      updatedAt: new Date('2026-10-27T10:00:00Z'),
    };
    const docEmptyPlaceholder = {
      _id: 'doc_empty_placeholder',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: today,
      data: { rows: {} },
      updatedAt: new Date('2026-10-27T10:05:00Z'), // Later timestamp but empty!
    };

    // Return both duplicates in find
    PlantAnalysisRecord.find = async () => [docEmptyPlaceholder, docWithRealData];

    let targetUpdatedId = null;
    PlantAnalysisRecord.findOneAndUpdate = async (filter, update) => {
      targetUpdatedId = filter._id;
      return { _id: filter._id, data: update.$set };
    };

    const req9 = makeReq({
      body: {
        date: today,
        rows: {
          t07: { fnh3: 3.17, cnh3: 1.98, tcl: 5.64, pcl: 3.66 },
          t09: { fnh3: 3.20, cnh3: 2.00, tcl: 5.65, pcl: 3.68 },
        },
      },
    });
    const res9 = makeRes();
    await postHandler(req9, res9);

    assert.strictEqual(res9.statusCode, 200);
    assert.strictEqual(String(targetUpdatedId), 'doc_canonical_data', 'Route must update the canonical doc with data, not empty duplicate');
    console.log('  [PASS] Route picked canonical document and updated it.');

    // ── TEST 10: Date Guard: x-test-now / x-test-mode / payload.now must NOT change date behavior ──
    console.log('\n--- TEST 10: Date Guard (x-test-now, x-test-mode, payload.now must NOT bypass) ---');
    // 10A: x-test-mode header
    const req10A = makeReq({
      headers: { 'x-test-mode': 'true', 'x-test-env': 'true' },
      body: {
        date: '2026-01-01', // Past date
        isTestMode: true,
        rows: { t07: { fnh3: 3.17 } },
      },
    });
    const res10A = makeRes();
    await postHandler(req10A, res10A);
    assert.strictEqual(res10A.statusCode, 400, 'Past date must be rejected with x-test-mode header');
    assert(res10A.body.message.includes('Date restriction enforced'));

    // 10B: payload.now
    const req10B = makeReq({
      body: {
        date: '2026-01-01',
        now: '2026-01-01T10:00:00Z',
        rows: { t07: { fnh3: 3.17 } },
      },
    });
    const res10B = makeRes();
    await postHandler(req10B, res10B);
    assert.strictEqual(res10B.statusCode, 400, 'Past date must be rejected with payload.now');
    assert(res10B.body.message.includes('Date restriction enforced'));

    // 10C: x-test-now header
    const req10C = makeReq({
      headers: { 'x-test-now': '2026-01-01T10:00:00Z' },
      body: {
        date: '2026-01-01',
        rows: { t07: { fnh3: 3.17 } },
      },
    });
    const res10C = makeRes();
    await postHandler(req10C, res10C);
    assert.strictEqual(res10C.statusCode, 400, 'Past date must be rejected with x-test-now header');
    assert(res10C.body.message.includes('Date restriction enforced'));
    console.log('  [PASS] x-test-now / x-test-mode / payload.now do NOT change date behavior.');

    // ── TEST 11: Route factory injection of now via options.getNow ──
    console.log('\n--- TEST 11: Route factory injection of now ---');
    const { createTk205Router } = require('../routes/tk205AnalysisRoutes');
    const customNow = new Date('2026-05-15T10:00:00+05:30');
    const factoryRouter = createTk205Router({ getNow: () => customNow });
    const factoryPostLayer = factoryRouter.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
    const factoryPostHandler = factoryPostLayer.route.stack[0].handle;

    const factoryReq = makeReq({
      body: {
        date: '2026-05-15',
        rows: { t07: { fnh3: 3.17 } },
      },
    });
    const factoryRes = makeRes();
    await factoryPostHandler(factoryReq, factoryRes);
    assert.strictEqual(factoryRes.statusCode, 200, 'Factory injected now operating date must be accepted');
    console.log('  [PASS] Factory injected now via function parameter controls date behavior.');

    console.log('\n========================================================================');
    console.log('✅ ALL TK 205 ROUTE UNIT TESTS PASSED (11/11)!');
    console.log('========================================================================');
  } finally {
    // Restore original Model methods
    PlantAnalysisRecord.find = origFind;
    PlantAnalysisRecord.findOne = origFindOne;
    PlantAnalysisRecord.updateOne = origUpdateOne;
    PlantAnalysisRecord.findOneAndUpdate = origFindOneAndUpdate;
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
