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
          name: 'SA Test Operator',
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

var PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
var { createRouter: createE501Router } = require('../routes/e501T501Routes');
var { createRouter: createLSARouter } = require('../routes/lsaAnalysisRoutes');
var { createRouter: createT401Router } = require('../routes/t401AnalysisRoutes');

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

function getReq(port, path, headers) {
  return new Promise(function(resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: path,
      method: 'GET',
      headers: headers || {},
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

async function runTests() {
  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  var totalPassed = 0;
  function pass(msg) {
    totalPassed++;
    console.log('  PASS: ' + msg);
  }

  var currentTime = istDate(2026, 10, 28, 10, 0); // 10:00 IST -> operating date 2026-10-28
  var getNow = function() { return currentTime; };

  var app = express();
  app.use(express.json());
  app.use('/api/e501-t501-analysis', createE501Router({ getNow }));
  app.use('/api/lsa-analysis', createLSARouter({ getNow }));
  app.use('/api/t-401-analysis', createT401Router({ getNow }));

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';

  try {
    console.log('\n========================================================================');
    console.log('SA-2a SUITE: E 501 / T 501 ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    await PlantAnalysisRecord.deleteMany({});

    // T1: First save shift 1
    var res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      plant: 'SA',
      readings: [
        { id: '1', shift: 'I', e501_fnh3: 20, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 },
        { id: '2', shift: 'II', e501_fnh3: '', e501_na2co3: '', t501_fnh3: '', t501_na2co3: '' },
        { id: '3', shift: 'III', e501_fnh3: '', e501_na2co3: '', t501_fnh3: '', t501_na2co3: '' },
      ],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.shift3.isLocked, true);
    assert.strictEqual(res.body.readings.length, 3);
    assert.strictEqual(res.body.averages.e501_fnh3, '20.00');
    pass('E501 T1: First save shift 1 (200, shift2 open, averages computed)');

    // T2: Out-of-order save shift 3 before shift 2 -> 400
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift3',
      rows: { shift3: { e501_fnh3: 22, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 } },
    });
    assert.strictEqual(res.status, 400);
    pass('E501 T2: Out-of-order shift 3 rejected with 400');

    // T3: Correction on shift 1 -> 200, correctionUsed=true, editedFields set
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift1',
      rows: { shift1: { e501_fnh3: 22, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 } },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.shift1.correctionUsed, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(res.body.editedFields['1']['e501_fnh3'], true);
    assert.strictEqual(res.body.editAuditHistory.length, 1);
    assert.strictEqual(res.body.averages.e501_fnh3, '22.00');
    pass('E501 T3: Correction on shift 1 (200, lockedSlots.shift1.isLocked=true, audit recorded)');

    // T4: Second edit on shift 1 -> 400 locked
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift1',
      rows: { shift1: { e501_fnh3: 24, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 } },
    });
    assert.strictEqual(res.status, 400);
    pass('E501 T4: Second correction on locked shift 1 rejected with 400');

    // T5: Empty first save of shift 2 -> 400
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift2',
      rows: { shift2: { e501_fnh3: '', e501_na2co3: '', t501_fnh3: '', t501_na2co3: '' } },
    });
    assert.strictEqual(res.status, 400);
    pass('E501 T5: Empty shift 2 save rejected with 400');

    // T6: Identical re-save of shift 1 -> 200 noChange: true
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift1',
      rows: { shift1: { e501_fnh3: 22, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 } },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.noChange, true);
    pass('E501 T6: Identical re-save returns 200 noChange: true');

    // T7: Multi-shift changed in single payload -> 400
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I', e501_fnh3: 22, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 },
        { id: '2', shift: 'II', e501_fnh3: 30, e501_na2co3: 6, t501_fnh3: 28, t501_na2co3: 7 },
        { id: '3', shift: 'III', e501_fnh3: 31, e501_na2co3: 6, t501_fnh3: 29, t501_na2co3: 7 },
      ],
    });
    assert.strictEqual(res.status, 400);
    pass('E501 T7: Multi-shift submission in single payload rejected with 400');

    // T8: Role user -> 403
    res = await postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift2',
      rows: { shift2: { e501_fnh3: 25, e501_na2co3: 5, t501_fnh3: 25, t501_na2co3: 6 } },
    }, { 'x-role-user': 'true' });
    assert.strictEqual(res.status, 403);
    pass('E501 T8: Operator role "user" returns 403 Forbidden');

    // T9: GET canonical doc & legacy hydration in memory without DB write
    var countBefore = await PlantAnalysisRecord.countDocuments();
    res = await getReq(port, '/api/e501-t501-analysis?date=' + OP_DATE);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.record.readings.length, 3);
    assert.strictEqual(res.body.record.averages.e501_fnh3, '22.00');
    var countAfter = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBefore, countAfter);
    pass('E501 T9: GET returns canonical doc, no extra DB write');

    // T10: Concurrent save race condition (200 + 409)
    var p1 = postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift2',
      rows: { shift2: { e501_fnh3: 26, e501_na2co3: 5, t501_fnh3: 27, t501_na2co3: 6 } },
    });
    var p2 = postReq(port, '/api/e501-t501-analysis', {
      date: OP_DATE,
      shift: 'shift2',
      rows: { shift2: { e501_fnh3: 28, e501_na2co3: 5, t501_fnh3: 27, t501_na2co3: 6 } },
    });
    var raceResults = await Promise.all([p1, p2]);
    var statuses = raceResults.map(function(r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    pass('E501 T10: Concurrent race on shift2 yields [200, 409]');

    console.log('\n========================================================================');
    console.log('SA-2a SUITE: LSA SHIFT ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    await PlantAnalysisRecord.deleteMany({});

    // T11: Save composite first (independent unit) -> 200, shifts remain s1 open, s2/s3 waiting
    res = await postReq(port, '/api/lsa-analysis', {
      date: OP_DATE,
      shift: 'composite',
      shifts: { composite: { na2co3: 99.2, nacl: 0.4, fe: 10, na2so4: 0.1, vm: 0.2, ir: 0.05, bd: 1.1, turbidity: 5 } },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.composite.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.composite.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.iShift.isSaved, false);
    assert.strictEqual(res.body.lockedSlots.iShift.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.iiShift.isLocked, true);
    assert.strictEqual(res.body.lockedSlots.iiiShift.isLocked, true);
    pass('LSA T11: Save composite first (independent, shifts unaffected)');

    // T12: Save iShift -> 200, unlocks iiShift
    res = await postReq(port, '/api/lsa-analysis', {
      date: OP_DATE,
      shift: 'iShift',
      shifts: { iShift: { na2co3: 99.1, nacl: 0.45, fe: 12, na2so4: 0.12, vm: 0.22, ir: 0.06, bd: 1.08, turbidity: 6 } },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.iShift.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.iShift.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.iiShift.isLocked, false);
    pass('LSA T12: Save iShift unlocks iiShift');

    // T13: Out-of-order save iiiShift before iiShift -> 400
    res = await postReq(port, '/api/lsa-analysis', {
      date: OP_DATE,
      shift: 'iiiShift',
      shifts: { iiiShift: { na2co3: 99.3, nacl: 0.4, fe: 11, na2so4: 0.1, vm: 0.2, ir: 0.05, bd: 1.1, turbidity: 5 } },
    });
    assert.strictEqual(res.status, 400);
    pass('LSA T13: Out-of-order iiiShift before iiShift returns 400');

    // T14: Composite correction -> 200, locks composite permanently
    res = await postReq(port, '/api/lsa-analysis', {
      date: OP_DATE,
      shift: 'composite',
      shifts: { composite: { na2co3: 99.25, nacl: 0.4, fe: 10, na2so4: 0.1, vm: 0.2, ir: 0.05, bd: 1.1, turbidity: 5 } },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.composite.isLocked, true);
    assert.strictEqual(res.body.lockedSlots.composite.correctionUsed, true);
    assert.strictEqual(res.body.editedFields.composite.na2co3, true);
    pass('LSA T14: Composite correction succeeds and permanently locks composite');

    // T15: Second composite edit -> 400 locked
    res = await postReq(port, '/api/lsa-analysis', {
      date: OP_DATE,
      shift: 'composite',
      shifts: { composite: { na2co3: 99.30, nacl: 0.4, fe: 10, na2so4: 0.1, vm: 0.2, ir: 0.05, bd: 1.1, turbidity: 5 } },
    });
    assert.strictEqual(res.status, 400);
    pass('LSA T15: Second edit on composite returns 400 permanently locked');

    // T16: Clear-all correction on iShift -> 400
    res = await postReq(port, '/api/lsa-analysis', {
      date: OP_DATE,
      shift: 'iShift',
      shifts: { iShift: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' } },
    });
    assert.strictEqual(res.status, 400);
    pass('LSA T16: Clear-all correction on iShift returns 400');

    console.log('\n========================================================================');
    console.log('SA-2a SUITE: T 401 TOWER ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    await PlantAnalysisRecord.deleteMany({});

    // T17: Multi-tower change in single POST -> 400
    res = await postReq(port, '/api/t-401-analysis', {
      date: OP_DATE,
      targetTower: 'a',
      units: {
        a: { s1: { fnh3: 3.97, cnh3: 1.92, tcl: 5.47, pcl: 3.55 } },
        b: { s1: { fnh3: 3.97, cnh3: 1.92, tcl: 5.47, pcl: 3.55 } },
      },
    });
    assert.strictEqual(res.status, 400);
    pass('T401 T17: Multi-tower modification in single POST returns 400');

    // T18: Target tower 'all' rejected -> 400
    res = await postReq(port, '/api/t-401-analysis', {
      date: OP_DATE,
      targetTower: 'all',
      units: {
        a: { s1: { fnh3: 3.97, cnh3: 1.92, tcl: 5.47, pcl: 3.55 } },
      },
    });
    assert.strictEqual(res.status, 400);
    pass('T401 T18: Target tower "all" rejected with 400');

    // T19: Tower A save s1 -> 200, Tower A s2 unlocked, Tower B s1 remains open
    res = await postReq(port, '/api/t-401-analysis', {
      date: OP_DATE,
      targetTower: 'a',
      shift: 's1',
      units: {
        a: { s1: { fnh3: 3.97, cnh3: 1.92, tcl: 5.47, pcl: 3.55 } },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.a.s1.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.a.s1.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.a.s2.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.b.s1.isSaved, false);
    assert.strictEqual(res.body.lockedSlots.b.s1.isLocked, false);
    pass('T401 T19: Tower A save s1 succeeds; Tower B is completely independent');

    // T20: Tower A correction s1 -> 200, locks s1 permanently
    res = await postReq(port, '/api/t-401-analysis', {
      date: OP_DATE,
      targetTower: 'a',
      shift: 's1',
      units: {
        a: { s1: { fnh3: 4.02, cnh3: 1.92, tcl: 5.47, pcl: 3.55 } },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.a.s1.isLocked, true);
    assert.strictEqual(res.body.lockedSlots.a.s1.correctionUsed, true);
    assert.strictEqual(res.body.editedFields.a.s1.fnh3, true);
    assert.strictEqual(res.body.editAuditHistory.length, 1);
    pass('T401 T20: Tower A correction sets editedFields[a][s1][fnh3] and locks s1');

    // T21: Tower B save s1 -> 200, works without Tower A constraints
    res = await postReq(port, '/api/t-401-analysis', {
      date: OP_DATE,
      targetTower: 'b',
      shift: 's1',
      units: {
        b: { s1: { fnh3: 3.95, cnh3: 1.90, tcl: 5.45, pcl: 3.50 } },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.b.s1.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.a.s1.isLocked, true); // preserved
    pass('T401 T21: Tower B save s1 preserves Tower A locks and records');

    // T22: 01:30 IST timestamp belongs to previous day operating date
    currentTime = istDate(2026, 10, 29, 1, 30); // 01:30 IST on Oct 29 -> Operating day Oct 28
    res = await postReq(port, '/api/t-401-analysis', {
      date: '2026-10-28',
      targetTower: 'b',
      shift: 's1',
      units: {
        b: { s1: { fnh3: 3.95, cnh3: 1.90, tcl: 5.45, pcl: 3.50 } },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.noChange, true);
    pass('T401 T22: 01:30 IST resolves to previous day operating date (Oct 28)');

    // T23: Date bypass headers are ignored (attempt future date)
    res = await postReq(port, '/api/t-401-analysis', {
      date: '2026-10-29', // future compared to operating day Oct 28
      targetTower: 'c',
      shift: 's1',
      isTestMode: true,
      units: { c: { s1: { fnh3: 3.95, cnh3: 1.90, tcl: 5.45, pcl: 3.50 } } },
    }, { 'x-test-mode': 'true', 'x-test-now': '2026-10-29' });
    assert.strictEqual(res.status, 400);
    pass('T401 T23: Date bypass headers/payload flags are strictly ignored');

    // T24: GET verification on all 3 shapes
    res = await getReq(port, '/api/t-401-analysis?date=' + OP_DATE);
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.data));
    assert.strictEqual(res.body.data[0].units.a.s1.fnh3, 4.02);
    assert.strictEqual(res.body.data[0].units.b.s1.fnh3, 3.95);
    pass('T401 T24: GET returns unified units/towers/shifts shape for report readers');

    console.log('\n========================================================================');
    console.log('TOTAL: ' + totalPassed + ' passed, 0 failed');
    console.log('========================================================================\n');

  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

runTests().catch(function(err) {
  console.error('Test suite failed:', err);
  process.exit(1);
});

