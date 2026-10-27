/**
 * server/tests/tk205RouteIntegration.test.js
 *
 * Integration test suite for TK 205 Analysis Route against in-memory MongoDB
 * with the REAL PlantAnalysisRecord Mongoose model and compound unique index.
 *
 * Verifies:
 * 1. First save t07 (upsert creates document)
 * 2. Assert first save of a slot does NOT write editedFields / editAuditHistory
 * 3. Save t09 (locks predecessor t07)
 * 4. Single correction on t09 (records editedFields + editAuditHistory, immediately locks t09)
 * 5. Locked unit edit returns HTTP 400
 * 6. Empty unit save returns HTTP 400
 * 7. Skip-ahead save returns HTTP 400
 * 8. Two concurrent saves of the same slot (one succeeds with 200, one fails with 409)
 * 9. Duplicate docs resolution (canonical doc chosen and updated, no whole-data overwrite)
 * 10. data.lockedShifts legacy values exact for each of the 12 slot states
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');

// We require mongodb-memory-server dynamically or directly
let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch (e) {
  // Will be handled in runner
}

const PlantAnalysisRecord = require('../models/PlantAnalysisRecord');

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];

async function run() {
  if (!MongoMemoryServer) {
    console.error('❌ mongodb-memory-server is not installed. Please install it as a dev dependency.');
    process.exit(1);
  }

  process.env.NODE_ENV = 'test';
  process.env.TEST_MODE = 'true';

  console.log('========================================================================');
  console.log('🧪 STARTING TK 205 ROUTE INTEGRATION TESTS (MONGODB-MEMORY-SERVER)');
  console.log('========================================================================\n');

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await mongoose.connect(uri);

  // Ensure real unique compound index on collection
  await PlantAnalysisRecord.collection.createIndex(
    { plantCode: 1, analysisType: 1, date: 1, shift: 1, time: 1 },
    { unique: true, sparse: true }
  );

  // Set up Express application with mocked auth middleware for predictable user context
  const authMiddleware = require('../middleware/auth');
  const originalProtect = authMiddleware.protect;
  authMiddleware.protect = (req, res, next) => {
    req.user = {
      _id: new mongoose.Types.ObjectId('650000000000000000000001'),
      name: 'Integration Test Operator',
      role: 'admin',
      company: new mongoose.Types.ObjectId('650000000000000000000002'),
    };
    next();
  };

  function createISTDate(year, month, day, hour, minute) {
    const istMinutes = hour * 60 + minute;
    const utcMinutes = istMinutes - 330;
    return new Date(Date.UTC(year, month - 1, day, 0, utcMinutes, 0));
  }

  let currentInjectedNow = createISTDate(2026, 10, 27, 10, 0);
  const { createTk205Router } = require('../routes/tk205AnalysisRoutes');
  const tk205Router = createTk205Router({
    getNow: () => (currentInjectedNow ? new Date(currentInjectedNow) : new Date()),
  });
  const app = express();
  app.use(express.json());
  app.use('/api/tk-205-analysis', tk205Router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/tk-205-analysis`;

  async function postSave(body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/tk-205-analysis',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...extraHeaders,
          },
          agent: false,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(raw) });
            } catch (e) {
              resolve({ status: res.statusCode, body: raw });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  try {
    const testDate = '2026-10-27';

    // -------------------------------------------------------------------------
    console.log('--- TEST 1: First Save of t07 (Upsert creates canonical doc) ---');
    // -------------------------------------------------------------------------
    const t07Payload = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
      },
    };
    const res1 = await postSave(t07Payload);
    assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}: ${res1.body.message}`);
    assert.strictEqual(res1.body.targetUnit, 't07');
    assert.strictEqual(res1.body.isCorrection, false);
    assert.strictEqual(res1.body.dotPathUpdates, undefined, 'dotPathUpdates must NOT be returned in response');
    assert.ok(res1.body.data, 'Response must return data object for client hydration');
    assert.strictEqual(res1.body.data.rows.t07.fnh3, '1.25');
    assert.strictEqual(res1.body.data.lockedSlots.t07.isSaved, true);

    const doc1 = await PlantAnalysisRecord.findOne({ date: testDate, plantCode: 'ACL', analysisType: 'TK 205 Analysis' });
    assert.ok(doc1, 'Document should be created in DB via updateOne upsert');
    assert.strictEqual(doc1.shift, 'All Shifts');
    assert.strictEqual(doc1.data.rows.t07.fnh3, '1.25');
    assert.strictEqual(doc1.data.lockedSlots.t07.isSaved, true);
    assert.strictEqual(doc1.data.lockedSlots.t07.isLocked, false);

    // -------------------------------------------------------------------------
    console.log('--- TEST 2: First save of a slot must NOT write editedFields/editAuditHistory ---');
    // -------------------------------------------------------------------------
    assert.strictEqual(doc1.data.editedFields, undefined, 'First save must NOT write editedFields');
    assert.strictEqual(doc1.data.editAuditHistory, undefined, 'First save must NOT write editAuditHistory');
    assert.deepStrictEqual(res1.body.data.editedFields, {}, 'Response data.editedFields must be empty');
    assert.deepStrictEqual(res1.body.data.editAuditHistory, [], 'Response data.editAuditHistory must be empty');
    console.log('  [PASS] Verified first save of t07 did NOT write editedFields or editAuditHistory.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 3: Save t09 (Permanently locks predecessor t07) ---');
    // -------------------------------------------------------------------------
    const t09Payload = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.00', cnh3: '3.00', tcl: '4.00', pcl: '5.00' },
      },
    };
    const res2 = await postSave(t09Payload);
    assert.strictEqual(res2.status, 200, `Expected 200, got ${res2.status}`);
    assert.strictEqual(res2.body.targetUnit, 't09');
    assert.strictEqual(res2.body.isCorrection, false);

    const doc2 = await PlantAnalysisRecord.findById(doc1._id);
    assert.strictEqual(doc2.data.lockedSlots.t07.isLocked, true, 't07 must now be locked');
    assert.strictEqual(doc2.data.lockedSlots.t09.isSaved, true);
    assert.strictEqual(doc2.data.lockedSlots.t09.isLocked, false);
    // Still no edits/audit for first saves
    assert.strictEqual(doc2.data.editedFields, undefined);
    assert.strictEqual(doc2.data.editAuditHistory, undefined);
    console.log('  [PASS] Verified t09 save locks t07 and does not write audit history.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 4: Single correction on t09 (Writes audit & immediately locks) ---');
    // -------------------------------------------------------------------------
    const t09CorrectionPayload = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.50', cnh3: '3.50', tcl: '4.00', pcl: '5.00' }, // fnh3 and cnh3 edited
      },
    };
    const res3 = await postSave(t09CorrectionPayload);
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.body.isCorrection, true);

    const doc3 = await PlantAnalysisRecord.findById(doc1._id);
    assert.strictEqual(doc3.data.lockedSlots.t09.correctionUsed, true);
    assert.strictEqual(doc3.data.lockedSlots.t09.isLocked, true, 't09 must lock immediately upon correction');
    assert.strictEqual(doc3.data.editedFields['t09_fnh3'], true);
    assert.strictEqual(doc3.data.editedFields['t09_cnh3'], true);
    assert.strictEqual(doc3.data.editAuditHistory.length, 2);
    console.log('  [PASS] Single correction on t09 wrote editedFields/editAuditHistory and locked immediately.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 5: Locked edit rejected with HTTP 400 ---');
    // -------------------------------------------------------------------------
    // Try to edit t07 (already locked by t09)
    const lockedT07Payload = {
      date: testDate,
      rows: {
        t07: { fnh3: '9.99', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.50', cnh3: '3.50', tcl: '4.00', pcl: '5.00' },
      },
    };
    const resLocked1 = await postSave(lockedT07Payload);
    assert.strictEqual(resLocked1.status, 400);
    assert.ok(resLocked1.body.message.includes('locked'), `Expected lock message, got: ${resLocked1.body.message}`);

    // Try to edit t09 again (correction already used)
    const lockedT09Payload = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.99', cnh3: '3.50', tcl: '4.00', pcl: '5.00' },
      },
    };
    const resLocked2 = await postSave(lockedT09Payload);
    assert.strictEqual(resLocked2.status, 400);
    assert.ok(resLocked2.body.message.includes('locked') || resLocked2.body.message.includes('Correction already used'));
    console.log('  [PASS] Verified locked edit rejected with HTTP 400.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 6: Empty unit save rejected with HTTP 400 ---');
    // -------------------------------------------------------------------------
    const emptyPayload = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.50', cnh3: '3.50', tcl: '4.00', pcl: '5.00' },
        t11: { fnh3: '', cnh3: null, tcl: '   ', pcl: undefined },
      },
    };
    const resEmpty = await postSave(emptyPayload);
    assert.strictEqual(resEmpty.status, 400);
    assert.ok(resEmpty.body.message.includes('empty'));
    console.log('  [PASS] Empty unit save rejected with HTTP 400.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 7: Skip-ahead save rejected with HTTP 400 ---');
    // -------------------------------------------------------------------------
    // t11 has not been saved yet; try saving t13
    const skipAheadPayload = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.50', cnh3: '3.50', tcl: '4.00', pcl: '5.00' },
        t13: { fnh3: '1.00', cnh3: '2.00', tcl: '3.00', pcl: '4.00' },
      },
    };
    const resSkip = await postSave(skipAheadPayload);
    assert.strictEqual(resSkip.status, 400);
    assert.ok(resSkip.body.message.includes('Sequential restriction: t11'));
    console.log('  [PASS] Skip-ahead save rejected with HTTP 400.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 8: Two concurrent saves of the same slot (one 200, one 409) ---');
    // -------------------------------------------------------------------------
    // Both try to save t11 concurrently
    const concurrentPayloadA = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.50', cnh3: '3.50', tcl: '4.00', pcl: '5.00' },
        t11: { fnh3: '10.0', cnh3: '20.0', tcl: '30.0', pcl: '40.0' },
      },
    };
    const concurrentPayloadB = {
      date: testDate,
      rows: {
        t07: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
        t09: { fnh3: '2.50', cnh3: '3.50', tcl: '4.00', pcl: '5.00' },
        t11: { fnh3: '11.1', cnh3: '22.2', tcl: '33.3', pcl: '44.4' },
      },
    };
    const [cRes1, cRes2] = await Promise.all([postSave(concurrentPayloadA), postSave(concurrentPayloadB)]);
    const statuses = [cRes1.status, cRes2.status].sort();
    assert.deepStrictEqual(statuses, [200, 409], `Expected [200, 409], got ${JSON.stringify(statuses)}`);
    console.log('  [PASS] Concurrent saves properly handled: one 200, one 409.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 9: Duplicate docs (shift "" with data + shift "All Shifts" empty) ---');
    // -------------------------------------------------------------------------
    const dupDate = '2026-10-28';
    currentInjectedNow = createISTDate(2026, 10, 28, 10, 0);
    // Doc 1: Has legacy shift "" and existing t07 data
    const docWithData = await PlantAnalysisRecord.create({
      plantName: 'ACL Plant',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: dupDate,
      shift: '',
      data: {
        rows: {
          t07: { fnh3: '5.0', cnh3: '6.0', tcl: '7.0', pcl: '8.0' },
        },
        lockedSlots: {
          t07: { isSaved: true, isLocked: false, correctionUsed: false },
        },
      },
    });

    // Doc 2: Has shift "All Shifts" and empty rows
    const emptyDoc = await PlantAnalysisRecord.create({
      plantName: 'ACL Plant',
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
      date: dupDate,
      shift: 'All Shifts',
      data: {
        rows: {},
        lockedSlots: {},
      },
    });

    // Incoming save for t09
    const dupSavePayload = {
      date: dupDate,
      rows: {
        t07: { fnh3: '5.0', cnh3: '6.0', tcl: '7.0', pcl: '8.0' },
        t09: { fnh3: '9.1', cnh3: '9.2', tcl: '9.3', pcl: '9.4' },
      },
    };
    const dupRes = await postSave(dupSavePayload);
    assert.strictEqual(dupRes.status, 200);

    // Verify canonical doc updated
    const reloadedDocWithData = await PlantAnalysisRecord.findById(docWithData._id);
    const reloadedEmptyDoc = await PlantAnalysisRecord.findById(emptyDoc._id);

    assert.ok(reloadedDocWithData.data.rows.t09, 'Canonical doc with data should have been updated with t09');
    assert.strictEqual(reloadedDocWithData.data.rows.t09.fnh3, '9.1');
    assert.strictEqual(reloadedDocWithData.data.rows.t07.fnh3, '5.0', 't07 data must be preserved (no whole-data overwrite)');
    assert.strictEqual(Object.keys(reloadedEmptyDoc.data?.rows || {}).length, 0, 'Placeholder doc must remain untouched');
    console.log('  [PASS] Canonical doc updated; placeholder untouched; no whole-data overwrite.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 10: data.lockedShifts legacy values exact for each of 12 slot states ---');
    // -------------------------------------------------------------------------
    const stateDate = '2026-10-29';
    currentInjectedNow = createISTDate(2026, 10, 29, 10, 0);
    let currentRows = {};

    for (let i = 0; i < UNITS_ORDER.length; i++) {
      const slot = UNITS_ORDER[i];
      currentRows[slot] = { fnh3: String(i + 1), cnh3: '1.0', tcl: '1.0', pcl: '1.0' };
      const res = await postSave({ date: stateDate, rows: currentRows });
      assert.strictEqual(res.status, 200, `Save failed for ${slot}: ${res.body?.message}`);

      const doc = await PlantAnalysisRecord.findOne({ date: stateDate, plantCode: 'ACL', analysisType: 'TK 205 Analysis' });
      const ls = doc.data.lockedShifts;

      // Expected legacy values based on slot
      // shift1: t07, t09, t11, t13
      // shift2: t15, t17, t19, t21
      // shift3: t23, t01, t03, t05
      const isShift1Active = ['t07', 't09', 't11', 't13'].includes(slot);
      const isShift2Active = ['t15', 't17', 't19', 't21'].includes(slot);
      const isShift3Active = ['t23', 't01', 't03', 't05'].includes(slot);

      if (isShift1Active) {
        assert.strictEqual(ls.shift1Saved, true);
        assert.strictEqual(ls.shift1Locked, false);
        assert.strictEqual(ls.shift2Saved, false);
        assert.strictEqual(ls.shift2Locked, false);
        assert.strictEqual(ls.shift3Saved, false);
        assert.strictEqual(ls.shift3Locked, false);
        assert.strictEqual(ls.shift1, false);
        assert.strictEqual(ls.shift2, false);
        assert.strictEqual(ls.shift3, true);
      } else if (isShift2Active) {
        assert.strictEqual(ls.shift1Saved, true);
        assert.strictEqual(ls.shift1Locked, true); // shift 1 is locked because t15 is saved
        assert.strictEqual(ls.shift2Saved, true);
        assert.strictEqual(ls.shift2Locked, false);
        assert.strictEqual(ls.shift3Saved, false);
        assert.strictEqual(ls.shift3Locked, false);
        assert.strictEqual(ls.shift1, true);
        assert.strictEqual(ls.shift2, false);
        assert.strictEqual(ls.shift3, false);
      } else if (isShift3Active) {
        assert.strictEqual(ls.shift1Saved, true);
        assert.strictEqual(ls.shift1Locked, true);
        assert.strictEqual(ls.shift2Saved, true);
        assert.strictEqual(ls.shift2Locked, true); // shift 2 locked because t23 is saved
        assert.strictEqual(ls.shift3Saved, true);
        assert.strictEqual(ls.shift3Locked, false); // shift 3 not locked until t05 correction
        assert.strictEqual(ls.shift1, true);
        assert.strictEqual(ls.shift2, true);
        assert.strictEqual(ls.shift3, false);
      }
    }

    // Now perform correction on t05 (last slot) -> should lock shift3
    currentRows.t05 = { fnh3: '99.9', cnh3: '1.0', tcl: '1.0', pcl: '1.0' };
    const resLastCorrection = await postSave({ date: stateDate, rows: currentRows });
    assert.strictEqual(resLastCorrection.status, 200);
    assert.strictEqual(resLastCorrection.body.isCorrection, true);

    const finalDoc = await PlantAnalysisRecord.findOne({ date: stateDate, plantCode: 'ACL', analysisType: 'TK 205 Analysis' });
    const finalLs = finalDoc.data.lockedShifts;
    assert.strictEqual(finalLs.shift1Locked, true);
    assert.strictEqual(finalLs.shift2Locked, true);
    assert.strictEqual(finalLs.shift3Locked, true, 'shift3 must now be locked');
    assert.strictEqual(finalLs.shift1, true);
    assert.strictEqual(finalLs.shift2, true);
    assert.strictEqual(finalLs.shift3, true);
    console.log('  [PASS] All 12 slot legacy states and final lock verified exact.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 11: Date tests with injected now (06:00-06:00 IST Operational Date) ---');
    // -------------------------------------------------------------------------
    // 11A: 2026-10-28 01:00 IST + date 2026-10-27 -> allowed (t23 saved earlier)
    console.log('  Testing 11A: 2026-10-28 01:00 IST + date 2026-10-27 (t23 saved earlier) -> allowed...');
    const slotsPriorToT01 = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23'];
    const preSavedRows = {};
    const preSavedLocks = {};
    slotsPriorToT01.forEach((s) => {
      preSavedRows[s] = { fnh3: '2.0', cnh3: '2.0', tcl: '3.0', pcl: '3.0' };
      preSavedLocks[s] = { isSaved: true, isLocked: true, correctionUsed: false };
    });
    preSavedLocks.t23.isLocked = false; // t23 was the most recent save

    await PlantAnalysisRecord.updateOne(
      { date: '2026-10-27', plantCode: 'ACL', analysisType: 'TK 205 Analysis' },
      { $set: { 'data.rows': preSavedRows, 'data.lockedSlots': preSavedLocks } }
    );

    const now0100 = createISTDate(2026, 10, 28, 1, 0); // 01:00 IST on Oct 28 -> belongs to operating date Oct 27
    currentInjectedNow = now0100;
    const payload11A = {
      date: '2026-10-27',
      rows: {
        ...preSavedRows,
        t01: { fnh3: '2.5', cnh3: '2.5', tcl: '3.5', pcl: '3.5' },
      },
    };
    const res11A = await postSave(payload11A);
    assert.strictEqual(res11A.status, 200, `Expected 200, got ${res11A.status}: ${res11A.body?.message}`);
    assert.strictEqual(res11A.body.targetUnit, 't01');
    console.log('  [PASS] 2026-10-28 01:00 IST + date 2026-10-27 allowed (t23 saved earlier).');

    // 11B: 2026-10-28 01:00 IST + date 2026-10-28 -> 400
    console.log('  Testing 11B: 2026-10-28 01:00 IST + date 2026-10-28 -> 400...');
    currentInjectedNow = now0100;
    const payload11B = {
      date: '2026-10-28',
      rows: { t07: { fnh3: '1.0' } },
    };
    const res11B = await postSave(payload11B);
    assert.strictEqual(res11B.status, 400, `Expected 400, got ${res11B.status}`);
    assert.ok(
      res11B.body.message.includes('operating date (2026-10-27)'),
      `Error message must mention the operating date: ${res11B.body.message}`
    );
    console.log('  [PASS] 2026-10-28 01:00 IST + date 2026-10-28 returned 400 with operating date in message.');

    // 11C: 05:59 IST + 2026-10-28 -> 400
    console.log('  Testing 11C: 2026-10-28 05:59 IST + date 2026-10-28 -> 400...');
    const now0559 = createISTDate(2026, 10, 28, 5, 59); // 05:59 IST -> belongs to operating date Oct 27
    currentInjectedNow = now0559;
    const payload11C = {
      date: '2026-10-28',
      rows: { t07: { fnh3: '1.0' } },
    };
    const res11C = await postSave(payload11C);
    assert.strictEqual(res11C.status, 400, `Expected 400, got ${res11C.status}`);
    assert.ok(
      res11C.body.message.includes('operating date (2026-10-27)'),
      `Error message must mention the operating date: ${res11C.body.message}`
    );
    console.log('  [PASS] 2026-10-28 05:59 IST + date 2026-10-28 returned 400 with operating date in message.');

    // 11D: 2026-10-28 06:00 IST + date 2026-10-28 -> allowed
    console.log('  Testing 11D: 2026-10-28 06:00 IST + date 2026-10-28 -> allowed...');
    // Clean any prior Oct 28 test docs for clean first save t07 test
    await PlantAnalysisRecord.deleteMany({ date: '2026-10-28' });
    const now0600 = createISTDate(2026, 10, 28, 6, 0); // 06:00 IST -> belongs to operating date Oct 28
    currentInjectedNow = now0600;
    const payload11D = {
      date: '2026-10-28',
      rows: {
        t07: { fnh3: '3.0', cnh3: '3.0', tcl: '4.0', pcl: '4.0' },
      },
    };
    const res11D = await postSave(payload11D);
    assert.strictEqual(res11D.status, 200, `Expected 200, got ${res11D.status}: ${res11D.body?.message}`);
    assert.strictEqual(res11D.body.targetUnit, 't07');
    console.log('  [PASS] 2026-10-28 06:00 IST + date 2026-10-28 allowed (first save t07).');

    // -------------------------------------------------------------------------
    console.log('--- TEST 12: Request headers (x-test-now, x-test-mode) and payload.now must NOT alter date behavior ---');
    // -------------------------------------------------------------------------
    currentInjectedNow = createISTDate(2026, 10, 30, 10, 0); // Active operating date is 2026-10-30
    const bypassRows = { t07: { fnh3: '1.0', cnh3: '1.0', tcl: '1.0', pcl: '1.0' } };

    // 12A: payload.now with past date
    const res12A = await postSave({
      date: '2026-10-01',
      now: '2026-10-01T10:00:00Z',
      rows: bypassRows,
    });
    assert.strictEqual(res12A.status, 400, 'payload.now must not bypass date restriction');
    assert.ok(res12A.body.message.includes('Date restriction enforced'));

    // 12B: x-test-now header with past date
    const res12B = await postSave(
      { date: '2026-10-01', rows: bypassRows },
      { 'x-test-now': '2026-10-01T10:00:00Z' }
    );
    assert.strictEqual(res12B.status, 400, 'x-test-now header must not bypass date restriction');
    assert.ok(res12B.body.message.includes('Date restriction enforced'));

    // 12C: x-test-mode header
    const res12C = await postSave(
      { date: '2026-10-01', rows: bypassRows },
      { 'x-test-mode': 'true' }
    );
    assert.strictEqual(res12C.status, 400, 'x-test-mode header must not bypass date restriction');
    assert.ok(res12C.body.message.includes('Date restriction enforced'));
    console.log('  [PASS] Verified x-test-now, x-test-mode, and payload.now do NOT change date behavior.');

    // -------------------------------------------------------------------------
    console.log('--- TEST 13: Concurrent first-save race (doc missing, two simultaneous t07 saves) ---');
    // -------------------------------------------------------------------------
    const raceDate = '2026-10-31';
    currentInjectedNow = createISTDate(2026, 10, 31, 10, 0);
    await PlantAnalysisRecord.deleteMany({ date: raceDate });

    const raceT07PayloadA = {
      date: raceDate,
      rows: { t07: { fnh3: '1.0', cnh3: '2.0', tcl: '3.0', pcl: '4.0' } },
    };
    const raceT07PayloadB = {
      date: raceDate,
      rows: { t07: { fnh3: '1.5', cnh3: '2.5', tcl: '3.5', pcl: '4.5' } },
    };

    const [raceRes1, raceRes2] = await Promise.all([
      postSave(raceT07PayloadA),
      postSave(raceT07PayloadB),
    ]);
    const raceStatuses = [raceRes1.status, raceRes2.status].sort();
    assert.deepStrictEqual(
      raceStatuses,
      [200, 409],
      `Expected [200, 409] for concurrent first t07 saves on missing doc, got ${JSON.stringify(raceStatuses)}`
    );
    const raceCount = await PlantAnalysisRecord.countDocuments({
      date: raceDate,
      plantCode: 'ACL',
      analysisType: 'TK 205 Analysis',
    });
    assert.strictEqual(raceCount, 1, 'Exactly one document must be created');
    console.log('  [PASS] Concurrent first-save race: exactly one request got 200, one got 409 deterministically.');

    console.log('\n========================================================================');
    console.log('✅ ALL TK 205 ROUTE INTEGRATION TESTS PASSED (13/13)!');
    console.log('========================================================================');
  } finally {
    authMiddleware.protect = originalProtect;
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
