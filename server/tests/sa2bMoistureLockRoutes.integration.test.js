'use strict';

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
var { createRouter: createMoistureRouter } = require('../routes/bicarbonateMoistureRoutes');

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
  app.use('/api/bicarbonate-moisture', createMoistureRouter({ getNow }));

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';

  try {
    console.log('\n========================================================================');
    console.log('SA-2b G1: BICARBONATE MOISTURE ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    // T1: First save opens next (shift1 save -> shift2 open)
    await PlantAnalysisRecord.deleteMany({});
    var t1Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t1Res.status, 200);
    assert.strictEqual(t1Res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t1Res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t1Res.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(t1Res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(t1Res.body.lockedShifts.shift1Saved, true);
    pass('T1: first save shift1 opens shift2');

    // T2: Out-of-order save rejected (shift3 before shift2 -> 400)
    var t2Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '20.1', m404_b: '20.2', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t2Res.status, 400);
    pass('T2: out-of-order save rejected with 400');

    // T3: One correction on shift1 allowed -> 200 + editedFields + audit
    var t3Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.6', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t3Res.status, 200);
    assert.strictEqual(t3Res.body.lockedSlots.shift1.correctionUsed, true);
    assert.strictEqual(t3Res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(t3Res.body.editedFields['1']?.m404_a, true);
    assert.strictEqual(t3Res.body.editAuditHistory.length, 1);
    pass('T3: correction succeeds with editedFields and audit history');

    // T4: Second correction on shift1 rejected -> 400
    var t4Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.7', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t4Res.status, 400);
    pass('T4: second correction rejected with 400');

    // T5: Shift 2 save permanently locks Shift 1 (even if Shift 1 had no correction)
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    var t5Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '19.0', m404_b: '19.2', m404_c: '19.4', m405_outlet: '18.0', sb_turb1: '1.0', sb_turb2: '1.1' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t5Res.status, 200);
    assert.strictEqual(t5Res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(t5Res.body.lockedSlots.shift2.isSaved, true);
    assert.strictEqual(t5Res.body.lockedSlots.shift2.isLocked, false);
    pass('T5: shift 2 save permanently locks shift 1');

    // T6: Identical re-save returns 200 { noChange: true } with 0 DB writes
    var countBefore = await PlantAnalysisRecord.countDocuments();
    var t6Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '19.0', m404_b: '19.2', m404_c: '19.4', m405_outlet: '18.0', sb_turb1: '1.0', sb_turb2: '1.1' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t6Res.status, 200);
    assert.strictEqual(t6Res.body.noChange, true);
    var countAfter = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBefore, countAfter);
    pass('T6: identical re-save -> 200 noChange');

    // T7: Empty slot save rejected -> 400
    await PlantAnalysisRecord.deleteMany({});
    var t7Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t7Res.status, 400);
    pass('T7: empty slot save rejected with 400');

    // T8: Clear-all correction rejected -> 400
    await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    var t8Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t8Res.status, 400);
    pass('T8: clear-all correction rejected with 400');

    // T9: Multi-slot POST rejected -> 400
    var t9Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '20.0', m404_b: '20.1', m404_c: '20.2', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '19.5', m404_b: '19.8', m404_c: '19.9', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t9Res.status, 400);
    pass('T9: multi-slot POST rejected with 400');

    // T10: Role 'user' -> 403
    var t10Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(t10Res.status, 403);
    pass('T10: role user rejected with 403');

    // T11: Date bypasses (x-test-mode, x-test-now, payload.isTestMode, payload.now) do NOT bypass date (400)
    var t11Res1 = await postReq(port, '/api/bicarbonate-moisture', {
      date: '2026-10-27',
      isTestMode: true,
      now: '2026-10-27T10:00:00.000Z',
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
      ],
    }, { 'x-test-mode': 'true', 'x-test-now': '2026-10-27T10:00:00.000Z', 'x-test-env': 'true' });
    assert.strictEqual(t11Res1.status, 400);
    pass('T11: bypass headers and payload fields do NOT bypass date');

    // T12: 06:00 IST boundary (05:59 IST = previous day, 06:00 IST = new day)
    currentTime = istDate(2026, 10, 29, 5, 59); // 05:59 IST on Oct 29 -> op date 2026-10-28
    var t12Res1 = await postReq(port, '/api/bicarbonate-moisture', {
      date: '2026-10-28',
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t12Res1.status, 200);

    currentTime = istDate(2026, 10, 29, 6, 0); // 06:00 IST on Oct 29 -> op date 2026-10-29
    var t12Res2 = await postReq(port, '/api/bicarbonate-moisture', {
      date: '2026-10-28', // now past date
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
      ],
    });
    assert.strictEqual(t12Res2.status, 400);
    pass('T12: 06:00 IST boundary enforced strictly');

    // Reset currentTime back to 10:00 IST on Oct 28
    currentTime = istDate(2026, 10, 28, 10, 0);

    // T13: Race condition on same slot -> one 200, one 409
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });

    var origFind = PlantAnalysisRecord.find;
    var findCount = 0;
    var releaseBarrier;
    var findBarrier = new Promise(function(resolve) { releaseBarrier = resolve; });
    PlantAnalysisRecord.find = function() {
      findCount++;
      if (findCount >= 2) releaseBarrier();
      var query = origFind.apply(this, arguments);
      var origLean = query.lean;
      query.lean = function() {
        var self = this;
        var args = arguments;
        return findBarrier.then(function() { return origLean.apply(self, args); });
      };
      return query;
    };

    var p1 = postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '19.1', m404_b: '19.2', m404_c: '19.3', m405_outlet: '18.0', sb_turb1: '1.0', sb_turb2: '1.1' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    var p2 = postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '19.4', m404_b: '19.5', m404_c: '19.6', m405_outlet: '18.1', sb_turb1: '1.0', sb_turb2: '1.1' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });

    var results = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind;
    var statuses = results.map(function(r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    pass('T13: race condition returns [200, 409]');

    // T14: GET returns canonical doc and does NOT write
    var countBeforeGet = await PlantAnalysisRecord.countDocuments();
    var t14Res = await getReq(port, '/api/bicarbonate-moisture?date=' + OP_DATE);
    assert.strictEqual(t14Res.status, 200);
    assert.strictEqual(t14Res.body.success, true);
    assert(Array.isArray(t14Res.body.readings));
    assert.strictEqual(t14Res.body.readings.length, 5);
    var countAfterGet = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBeforeGet, countAfterGet);
    pass('T14: GET returns canonical doc and does NOT write');

    // T15: Legacy {initialSaved, editCount, isLocked} doc hydrates correctly
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'SA Plant',
      plantCode: 'SA',
      analysisType: 'Bicarbonate Moisture Analysis',
      date: OP_DATE,
      data: {
        readings: [
          { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        ],
        lockedShifts: {
          shift1Saved: true,
          shift1Locked: false,
          shift1Edits: 0,
        },
      },
    });
    var t15Res = await getReq(port, '/api/bicarbonate-moisture?date=' + OP_DATE);
    assert.strictEqual(t15Res.status, 200);
    assert.strictEqual(t15Res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t15Res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t15Res.body.lockedSlots.shift1.correctionUsed, false);
    pass('T15: legacy doc hydrates correctly in memory');

    // T16: Legacy extra/custom rows preserved after save
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'SA Plant',
      plantCode: 'SA',
      analysisType: 'Bicarbonate Moisture Analysis',
      date: OP_DATE,
      data: {
        readings: [
          { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
          { id: 'custom_99', shift: 'SPECIAL LAB CHECK', time: '11:15', m404_a: '19.0', m404_b: '19.1', m404_c: '19.2', m405_outlet: '18.0', sb_turb1: '1.0', sb_turb2: '1.0' },
        ],
        lockedSlots: {
          shift1: { isSaved: true, isLocked: false, correctionUsed: false },
        },
      },
    });

    var t16Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '19.5', m404_b: '20.0', m404_c: '19.8', m405_outlet: '18.5', sb_turb1: '1.2', sb_turb2: '1.3' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '20.0', m404_b: '20.2', m404_c: '20.1', m405_outlet: '18.5', sb_turb1: '1.1', sb_turb2: '1.2' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: 'custom_99', shift: 'SPECIAL LAB CHECK', time: '11:15', m404_a: '19.0', m404_b: '19.1', m404_c: '19.2', m405_outlet: '18.0', sb_turb1: '1.0', sb_turb2: '1.0' },
      ],
    });
    assert.strictEqual(t16Res.status, 200);
    var hasCustom = t16Res.body.readings.some(function(r) { return r.id === 'custom_99'; });
    assert.strictEqual(hasCustom, true);
    pass('T16: legacy custom rows preserved after save');

    // T17: Reader contract (stored array length 5, ids 1..5, time strings, field names, averages)
    var dbRecord = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert(dbRecord);
    var r1 = dbRecord.data.readings.find(function(r) { return r.id === '1'; });
    assert(r1);
    assert.strictEqual(r1.shift, 'I SHIFT');
    assert.strictEqual(r1.time, '06:00');
    assert(r1.hasOwnProperty('m404_a'));
    assert(r1.hasOwnProperty('m404_b'));
    assert(r1.hasOwnProperty('m404_c'));
    assert(r1.hasOwnProperty('m405_outlet'));
    assert(r1.hasOwnProperty('sb_turb1'));
    assert(r1.hasOwnProperty('sb_turb2'));
    assert(dbRecord.data.averages.m404_a !== null);
    pass('T17: reader contract preserved exact schema');

    // T18: Independent slot 'addl' can be saved and corrected without blocking or depending on shift chain
    await PlantAnalysisRecord.deleteMany({});
    var t18Res1 = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '19.9', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t18Res1.status, 200);
    assert.strictEqual(t18Res1.body.lockedSlots.addl.isSaved, true);
    assert.strictEqual(t18Res1.body.lockedSlots.addl.isLocked, false);
    assert.strictEqual(t18Res1.body.lockedSlots.shift1.isSaved, false);

    // Correction on addl
    var t18Res2 = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '20.0', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t18Res2.status, 200);
    assert.strictEqual(t18Res2.body.lockedSlots.addl.correctionUsed, true);
    assert.strictEqual(t18Res2.body.lockedSlots.addl.isLocked, true);
    pass('T18: independent slot addl saved and corrected');

    // T19: Independent slot 'sample' can be saved and corrected independently
    var t19Res1 = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '20.0', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '20.5', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t19Res1.status, 200);
    assert.strictEqual(t19Res1.body.lockedSlots.sample.isSaved, true);
    assert.strictEqual(t19Res1.body.lockedSlots.sample.isLocked, false);
    pass('T19: independent slot sample saved independently');

    // T20: Second correction on addl rejected -> 400
    var t20Res = await postReq(port, '/api/bicarbonate-moisture', {
      date: OP_DATE,
      readings: [
        { id: '1', shift: 'I SHIFT', time: '06:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '2', shift: 'II SHIFT', time: '14:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '3', shift: 'III SHIFT', time: '22:00', m404_a: '', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '4', shift: 'ADDL SAPL1', time: '10:00', m404_a: '20.1', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
        { id: '5', shift: 'SAMPLE', time: '18:00', m404_a: '20.5', m404_b: '', m404_c: '', m405_outlet: '', sb_turb1: '', sb_turb2: '' },
      ],
    });
    assert.strictEqual(t20Res.status, 400);
    pass('T20: second correction on addl rejected with 400');

    console.log('\n========================================================================');
    console.log('✅ ALL BICARBONATE MOISTURE TESTS PASSED (' + totalPassed + '/' + totalPassed + ')');
    console.log('========================================================================');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

runTests().catch(function(err) {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
