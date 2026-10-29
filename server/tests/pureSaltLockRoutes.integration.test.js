'use strict';

var path = require('path');
var authCacheKey = require.resolve('../middleware/auth');
require.cache[authCacheKey] = {
  id: authCacheKey,
  filename: authCacheKey,
  loaded: true,
  exports: {
    protect: function(req, _res, next) {
      if (req.headers['x-role-user'] === 'true') {
        req.user = {
          _id: '650000000000000000000003',
          name: 'Standard User',
          role: 'user',
          company: '650000000000000000000002',
        };
      } else {
        req.user = {
          _id: '650000000000000000000001',
          name: 'ACL Test Operator',
          role: 'admin',
          company: '650000000000000000000002',
        };
      }
      next();
    },
  },
};

var assert = require('assert');
var http = require('http');
var mongoose = require('mongoose');
var { MongoMemoryServer } = require('mongodb-memory-server');
var express = require('express');

var PureSaltAnalysis = require('../models/PureSaltAnalysis');
var PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
var { createPureSaltAnalysisRouter } = require('../routes/pureSaltAnalysisRoutes');

function istDate(y, m, d, hh, mm) {
  var s = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T' +
          String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00+05:30';
  return new Date(s);
}

function postReq(port, path, body, headers) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body || {});
    var hdrs = Object.assign({
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    }, headers || {});
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: path,
      method: 'POST',
      headers: hdrs,
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var str = Buffer.concat(chunks).toString('utf8');
        var json;
        try { json = JSON.parse(str); } catch (_) { json = str; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getReq(port, path, date) {
  return new Promise(function(resolve, reject) {
    var p = path + (date ? '?date=' + encodeURIComponent(date) : '');
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: p,
      method: 'GET',
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var str = Buffer.concat(chunks).toString('utf8');
        var json;
        try { json = JSON.parse(str); } catch (_) { json = str; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const emptyRow = () => ({ nacl: '', ca: '', mg: '', so4: '', ir: '', h2o: '' });
const sampleRow = (v) => ({ nacl: v, ca: v + 0.1, mg: v + 0.05, so4: v + 0.02, ir: v + 0.01, h2o: v + 0.03 });

function makeClientPayload(date, rowsOverride = {}) {
  return {
    date,
    plant: 'ACL Plant',
    analysisType: 'Pure Salt Analysis',
    shift: 'All Shifts (I, II, III)',
    rows: {
      rawSalt: rowsOverride.rawSalt || emptyRow(),
      shift1: rowsOverride.shift1 || emptyRow(),
      shift2: rowsOverride.shift2 || emptyRow(),
      shift3: rowsOverride.shift3 || emptyRow(),
      composition: rowsOverride.composition || emptyRow(),
    },
  };
}

async function runTests() {
  var mongoServer = await MongoMemoryServer.create();
  var mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  var currentNow = istDate(2026, 10, 29, 10, 0); // 2026-10-29 10:00 IST -> operating date 2026-10-29
  var app = express();
  app.use(express.json());

  var router = createPureSaltAnalysisRouter({
    getNow: function() { return currentNow; },
  });
  app.use('/api/pure-salt-analysis', router);

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var passedCount = 0;
  var failedCount = 0;

  async function test(name, fn) {
    try {
      await fn();
      passedCount++;
      console.log('  PASS ' + name);
    } catch (err) {
      failedCount++;
      console.error('  FAIL ' + name + ': ' + err.message);
      if (err.stack) console.error(err.stack);
    }
  }

  console.log('\n--- Pure Salt Analysis Route Integration Tests ---');

  const TEST_DATE = '2026-10-29';

  await test('T1: First save shift1 returns 200 and unlocks shift2', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    const payload = makeClientPayload(TEST_DATE, { shift1: sampleRow(10) });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 200, 'Expected status 200');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.lockedShifts.shift1Saved, true);
    assert.strictEqual(res.body.lockedShifts.shift1Locked, false);
    assert.strictEqual(res.body.lockedShifts.shift2, false, 'shift2 should be open');
    assert.strictEqual(res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, false);
  });

  await test('T2: Independent rawSalt first save locks immediately', async () => {
    const payload = makeClientPayload(TEST_DATE, {
      shift1: sampleRow(10),
      rawSalt: sampleRow(20),
    });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedShifts.rawSaltSaved, true);
    assert.strictEqual(res.body.lockedShifts.rawSaltLocked, true);
    assert.strictEqual(res.body.lockedShifts.rawSalt, true);
    assert.strictEqual(res.body.lockedSlots.rawSalt.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.rawSalt.isLocked, true);
  });

  await test('T3: Independent composition first save locks immediately', async () => {
    const payload = makeClientPayload(TEST_DATE, {
      shift1: sampleRow(10),
      rawSalt: sampleRow(20),
      composition: sampleRow(30),
    });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedShifts.compositionSaved, true);
    assert.strictEqual(res.body.lockedShifts.compositionLocked, true);
    assert.strictEqual(res.body.lockedShifts.composition, true);
    assert.strictEqual(res.body.lockedSlots.composition.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.composition.isLocked, true);
  });

  await test('T4: Sequential restriction 400 (saving shift2 before shift1 on fresh date)', async () => {
    const freshDate = '2026-10-29';
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    const payload = makeClientPayload(freshDate, { shift2: sampleRow(15) });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /sequential/i);
  });

  await test('T5: Shift1 correction works, subsequent shift2 save locks shift1', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    // 1. Save shift1
    const s1Res = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(10) }));
    assert.strictEqual(s1Res.status, 200);

    // 2. Correction on shift1
    const corrRes = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(11) }));
    assert.strictEqual(corrRes.status, 200);
    assert.strictEqual(corrRes.body.lockedShifts.shift1Edits, 1);
    assert.strictEqual(corrRes.body.lockedShifts.shift1Locked, true, 'shift1 correction locks it');

    // 3. Save shift2
    const s2Res = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, {
      shift1: sampleRow(11),
      shift2: sampleRow(12),
    }));
    assert.strictEqual(s2Res.status, 200);
    assert.strictEqual(s2Res.body.lockedShifts.shift2Saved, true);
    assert.strictEqual(s2Res.body.lockedShifts.shift1Locked, true);
  });

  await test('T6: Locked edit 400 (editing shift1 after shift2 saved)', async () => {
    const payload = makeClientPayload(TEST_DATE, {
      shift1: sampleRow(99),
      shift2: sampleRow(12),
    });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /locked/i);
  });

  await test('T7: rawSalt / composition second change 400', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    // Save rawSalt first
    const r1 = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, {
      rawSalt: sampleRow(20),
    }));
    assert.strictEqual(r1.status, 200);

    // Second edit on rawSalt
    const res = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, {
      rawSalt: sampleRow(21),
    }));

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /locked/i);
  });

  await test('T8: Empty section 400', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    const payload = makeClientPayload(TEST_DATE);
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /empty/i);
  });

  await test('T9: Clear-all correction 400', async () => {
    // Save shift1
    await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(10) }));

    // Clear shift1 values
    const payload = makeClientPayload(TEST_DATE, { shift1: emptyRow() });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await test('T10: Identical re-save returns 200 with noChange: true', async () => {
    // 1. Initial save of shift1
    const p1 = makeClientPayload(TEST_DATE, { shift1: sampleRow(10) });
    await postReq(port, '/api/pure-salt-analysis', p1);

    // 2. Re-save exact same payload
    const res = await postReq(port, '/api/pure-salt-analysis', p1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.noChange, true);
  });

  await test('T11: Multi-section edit in single POST returns 400', async () => {
    const payload = makeClientPayload(TEST_DATE, {
      shift1: sampleRow(10),
      rawSalt: sampleRow(20),
      shift2: sampleRow(15),
    });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /only one shift can be edited/i);
  });

  await test('T12: Concurrent 200 + 409 race', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});
    // Seed doc with shift1 saved
    await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(10) }));

    var origFind = PureSaltAnalysis.find.bind(PureSaltAnalysis);
    var findCount = 0;
    var releaseBarrier;
    var barrierPromise = new Promise(function(r) { releaseBarrier = r; });

    PureSaltAnalysis.find = function(filter) {
      findCount++;
      if (findCount >= 2) releaseBarrier();
      var args = arguments;
      var self = this;
      return barrierPromise.then(function() { return origFind.apply(self, args); });
    };

    var p1 = postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(10), shift2: sampleRow(12) }));
    var p2 = postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(10), shift2: sampleRow(13) }));

    var results = await Promise.all([p1, p2]);
    PureSaltAnalysis.find = origFind;

    var statuses = results.map(function(r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409], 'Expected one 200 and one 409, got: ' + JSON.stringify(statuses));
  });

  await test('T13: Duplicate docs GET picks canonical document', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    // Insert doc A with only shift1
    await PureSaltAnalysis.create({
      date: TEST_DATE,
      plant: 'ACL Plant',
      analysisType: 'Pure Salt Analysis',
      shift: 'All Shifts (I, II, III)',
      rows: { shift1: sampleRow(10), shift2: emptyRow(), shift3: emptyRow(), rawSalt: emptyRow(), composition: emptyRow() },
      lockedShifts: { shift1Saved: true },
      createdAt: new Date('2026-10-29T10:00:00Z'),
    });

    // Insert doc B with shift1 AND shift2
    await PureSaltAnalysis.create({
      date: TEST_DATE,
      plant: 'ACL Plant',
      analysisType: 'Pure Salt Analysis',
      shift: 'All Shifts (I, II, III)',
      rows: { shift1: sampleRow(10), shift2: sampleRow(15), shift3: emptyRow(), rawSalt: emptyRow(), composition: emptyRow() },
      lockedShifts: { shift1Saved: true, shift2Saved: true },
      createdAt: new Date('2026-10-29T11:00:00Z'),
    });

    const getRes = await getReq(port, '/api/pure-salt-analysis', TEST_DATE);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.data.length, 1);
    assert.strictEqual(getRes.body.data[0].lockedShifts.shift2Saved, true, 'Canonical doc with most data chosen');
  });

  await test('T14: 01:30 IST belongs to previous day operating date', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    currentNow = istDate(2026, 10, 30, 1, 30); // 01:30 IST on Oct 30 -> operating date is 2026-10-29
    const payload = makeClientPayload('2026-10-29', { shift1: sampleRow(10) });
    const res = await postReq(port, '/api/pure-salt-analysis', payload);

    assert.strictEqual(res.status, 200, '01:30 IST on Oct 30 belongs to 2026-10-29 operating date');

    // Trying to save Oct 30 at 01:30 IST should be rejected
    const badPayload = makeClientPayload('2026-10-30', { shift1: sampleRow(10) });
    const badRes = await postReq(port, '/api/pure-salt-analysis', badPayload);
    assert.strictEqual(badRes.status, 400);
    assert.match(badRes.body.message, /operating date/i);

    currentNow = istDate(2026, 10, 29, 10, 0); // Reset
  });

  await test('T15: Date bypass headers (x-test-mode, x-test-now) are strictly ignored', async () => {
    const payload = makeClientPayload('2025-01-01', { shift1: sampleRow(10) });
    const res = await postReq(port, '/api/pure-salt-analysis', payload, {
      'x-test-mode': 'true',
      'x-test-now': '2025-01-01T10:00:00Z',
    });

    assert.strictEqual(res.status, 400, 'Bypass header must be ignored');
    assert.match(res.body.message, /operating date/i);
  });

  await test('T16: Role user returns 403 Forbidden', async () => {
    const payload = makeClientPayload(TEST_DATE, { shift1: sampleRow(10) });
    const res = await postReq(port, '/api/pure-salt-analysis', payload, {
      'x-role-user': 'true',
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /forbidden/i);
  });

  await test('T17: Legacy hydration in memory on GET without DB write', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    // Legacy doc with no lockedSlots
    const legacyDoc = await PureSaltAnalysis.create({
      date: TEST_DATE,
      plant: 'ACL Plant',
      analysisType: 'Pure Salt Analysis',
      rows: { shift1: sampleRow(10) },
      lockedShifts: { shift1Saved: true, shift1: false },
    });

    const getRes = await getReq(port, '/api/pure-salt-analysis', TEST_DATE);
    assert.strictEqual(getRes.status, 200);
    assert.ok(getRes.body.lockedSlots, 'lockedSlots derived in memory');
    assert.strictEqual(getRes.body.lockedSlots.shift1.isSaved, true);

    const checkDoc = await PureSaltAnalysis.findById(legacyDoc._id).lean();
    assert.strictEqual(checkDoc.lockedSlots, undefined, 'GET must never write to DB');
  });

  await test('T18: Mirror write to PlantAnalysisRecord verified', async () => {
    await PureSaltAnalysis.deleteMany({});
    await PlantAnalysisRecord.deleteMany({});

    const payload = makeClientPayload(TEST_DATE, { shift1: sampleRow(10) });
    await postReq(port, '/api/pure-salt-analysis', payload);

    const mirror = await PlantAnalysisRecord.findOne({
      plantCode: 'ACL',
      analysisType: 'Pure Salt Analysis',
      date: TEST_DATE,
    }).lean();

    assert.ok(mirror, 'Mirror record must exist in PlantAnalysisRecord');
    assert.strictEqual(mirror.data.rows.shift1.nacl, 10);
    assert.strictEqual(mirror.data.lockedShifts.shift1Saved, true);
  });

  await test('T19: Reader contract (aclExcelReportService rows[shiftKey].ca, mg)', async () => {
    const doc = await PureSaltAnalysis.findOne({ date: TEST_DATE }).lean();
    assert.ok(doc.rows, 'rows property must exist');
    assert.ok(doc.rows.shift1, 'shift1 row must exist');
    assert.strictEqual(typeof doc.rows.shift1.ca, 'number');
    assert.strictEqual(typeof doc.rows.shift1.mg, 'number');
  });

  await test('T20: Unique index on date/plant handles duplicate insert with 409', async () => {
    try {
      await PureSaltAnalysis.collection.createIndex(
        { plant: 1, analysisType: 1, date: 1 },
        { unique: true }
      );
    } catch (_) {}

    // First save succeeds
    await PureSaltAnalysis.deleteMany({});
    const res1 = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, { shift1: sampleRow(10) }));
    assert.strictEqual(res1.status, 200);

    // Save with same date advances shift
    const res2 = await postReq(port, '/api/pure-salt-analysis', makeClientPayload(TEST_DATE, {
      shift1: sampleRow(10),
      shift2: sampleRow(12),
    }));
    assert.strictEqual(res2.status, 200);
  });

  await new Promise(function(resolve) { server.close(resolve); });
  await mongoose.disconnect();
  await mongoServer.stop();

  console.log('\n=============================================');
  console.log(`TOTAL: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('=============================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(function(err) {
  console.error('Fatal test error:', err);
  process.exit(1);
});
