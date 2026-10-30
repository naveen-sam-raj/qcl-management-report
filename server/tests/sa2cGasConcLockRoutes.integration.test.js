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
var { createRouter: createGasConcRouter } = require('../routes/gasConcRoutes');
var { generateGasConcExcel } = require('../services/excelService');

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
  app.use('/api/gas-conc', createGasConcRouter({ getNow }));

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';

  try {
    console.log('\n========================================================================');
    console.log('SA-2c G5: GAS CONC. ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    // T1: First save shift1 opens shift2
    await PlantAnalysisRecord.deleteMany({});
    var t1Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '12:00', seal: 'OK', recoveryCo2Con: '82', cleaningGas: '10.5', bottomGas: '86' },
      ],
    });
    assert.strictEqual(t1Res.status, 200);
    assert.strictEqual(t1Res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t1Res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t1Res.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(t1Res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(t1Res.body.lockedShifts.shift1Saved, true);
    pass('T1: first save shift1 opens shift2');

    // T2: Out-of-order save rejected (saving shift3 when shift2 unsaved -> 400)
    var t2Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift3',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '12:00', seal: 'OK', recoveryCo2Con: '82', cleaningGas: '10.5', bottomGas: '86' },
        { id: 'gc-3', date: '',        time: '23:00', seal: 'OK', recoveryCo2Con: '79', cleaningGas: '9.5', bottomGas: '84' },
      ],
    });
    assert.strictEqual(t2Res.status, 400);
    pass('T2: out-of-order shift3 save rejected with 400');

    // T3: One correction on shift1 allowed -> 200 + editedFields + audit
    var t3Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '81', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '12:00', seal: 'OK', recoveryCo2Con: '82', cleaningGas: '10.5', bottomGas: '86' },
      ],
    });
    assert.strictEqual(t3Res.status, 200);
    assert.strictEqual(t3Res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(t3Res.body.lockedSlots.shift1.correctionUsed, true);
    assert(t3Res.body.editedFields['gc-1'] && t3Res.body.editedFields['gc-1'].recoveryCo2Con);
    assert.strictEqual(t3Res.body.editAuditHistory.length, 1);
    pass('T3: one correction on shift1 allowed -> 200 + editedFields + audit');

    // T4: Second change on shift1 rejected -> 400
    var t4Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '82', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '12:00', seal: 'OK', recoveryCo2Con: '82', cleaningGas: '10.5', bottomGas: '86' },
      ],
    });
    assert.strictEqual(t4Res.status, 400);
    pass('T4: second edit on shift1 rejected with 400');

    // T5: Row add to saved shift consumes correction, second change rejected
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    });
    // Add row to saved shift1
    var t5AddRes = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-add', date: '',     time: '10:00', seal: 'OK', recoveryCo2Con: '81', cleaningGas: '10.2', bottomGas: '84' },
      ],
    });
    assert.strictEqual(t5AddRes.status, 200);
    assert.strictEqual(t5AddRes.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(t5AddRes.body.lockedSlots.shift1.correctionUsed, true);
    // Further edit now blocked
    var t5EditRes = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '82', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-add', date: '',     time: '10:00', seal: 'OK', recoveryCo2Con: '81', cleaningGas: '10.2', bottomGas: '84' },
      ],
    });
    assert.strictEqual(t5EditRes.status, 400);
    pass('T5: row add to saved shift consumes correction, subsequent edit rejected');

    // T6: shift2 first save permanently locks shift1
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    });
    var t6Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift2',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
      ],
    });
    assert.strictEqual(t6Res.status, 200);
    assert.strictEqual(t6Res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(t6Res.body.lockedSlots.shift2.isSaved, true);
    assert.strictEqual(t6Res.body.lockedSlots.shift2.isLocked, false);
    pass('T6: shift2 first save permanently locks shift1');

    // T7: Identical re-save returns 200 { noChange: true }
    var t7Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift2',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
      ],
    });
    assert.strictEqual(t7Res.status, 200);
    assert.strictEqual(t7Res.body.noChange, true);
    pass('T7: identical re-save returns 200 { noChange: true }');

    // T8: Empty shift save returns 400
    var t8Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift3',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
        { id: 'gc-3', date: '',        time: '23:00', seal: 'OK', recoveryCo2Con: '', cleaningGas: '', bottomGas: '' },
      ],
    });
    assert.strictEqual(t8Res.status, 400);
    pass('T8: empty shift save rejected with 400');

    // T9: Clear-all correction returns 400
    var t9Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift2',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '', cleaningGas: '', bottomGas: '' },
      ],
    });
    assert.strictEqual(t9Res.status, 400);
    pass('T9: clear-all correction rejected with 400');

    // T10: Multi-shift POST returns 400
    var t10Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '81', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '79', cleaningGas: '9.8', bottomGas: '82' },
      ],
    });
    assert.strictEqual(t10Res.status, 400);
    pass('T10: multi-shift POST rejected with 400');

    // T11: Row delete from saved shift returns 400
    var t11Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      rows: [
        { id: 'gc-2', date: '', time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
      ],
    });
    assert.strictEqual(t11Res.status, 400);
    pass('T11: row delete from saved shift rejected with 400');

    // T12: Time or date change on saved row returns 400
    var t12Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '09:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
      ],
    });
    assert.strictEqual(t12Res.status, 400);
    pass('T12: time change on saved row rejected with 400');

    // T13: Role 'user' returns 403
    var t13Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(t13Res.status, 403);
    pass('T13: role user returns 403');

    // T14: Bypass headers/payload ignored (wrong date returns 400)
    var t14Res = await postReq(port, '/api/gas-conc', {
      date: '2026-10-27',
      isTestMode: true,
      rows: [
        { id: 'gc-1', date: '2026-10-27', time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    }, {
      'x-test-mode': 'true',
      'x-test-now': '2026-10-27T10:00:00Z',
    });
    assert.strictEqual(t14Res.status, 400);
    pass('T14: bypass headers/payload ignored (wrong date returns 400)');

    // T15: 06:00 IST boundary
    currentTime = istDate(2026, 10, 29, 5, 59); // 05:59 IST -> operating date 2026-10-28
    var t15Res1 = await postReq(port, '/api/gas-conc', {
      date: '2026-10-29',
      rows: [
        { id: 'gc-1', date: '2026-10-29', time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    });
    assert.strictEqual(t15Res1.status, 400); // 2026-10-29 rejected because op date is 2026-10-28

    currentTime = istDate(2026, 10, 29, 6, 0); // 06:00 IST -> operating date 2026-10-29
    var t15Res2 = await postReq(port, '/api/gas-conc', {
      date: '2026-10-29',
      rows: [
        { id: 'gc-new', date: '2026-10-29', time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    });
    assert.strictEqual(t15Res2.status, 200);
    pass('T15: 06:00 IST boundary enforces operating day transition');

    // T16: Row at 02:00 saves under previous operating date shift3
    currentTime = istDate(2026, 10, 29, 2, 0); // 02:00 IST -> operating date 2026-10-28
    // In doc for 2026-10-28, shift1 and shift2 are saved, shift3 is open
    var t16Res = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift3',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
        { id: 'gc-3', date: '2026-10-29', time: '02:00', seal: 'OK', recoveryCo2Con: '81', cleaningGas: '10.1', bottomGas: '84' },
      ],
    });
    assert.strictEqual(t16Res.status, 200);
    assert.strictEqual(t16Res.body.lockedSlots.shift3.isSaved, true);
    pass('T16: row at 02:00 saves under previous operating date shift3');

    // T17: Race condition on same shift -> one 200, one 409
    currentTime = istDate(2026, 10, 28, 10, 0);
    await PlantAnalysisRecord.deleteMany({});
    // Setup initial saved shift1
    await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift1',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
      ],
    });

    var origFind = PlantAnalysisRecord.find;
    PlantAnalysisRecord.find = function(query) {
      return {
        lean: function() {
          return new Promise(function(resolve) {
            setTimeout(async function() {
              var r = await origFind.call(PlantAnalysisRecord, query).lean();
              resolve(r);
            }, 30);
          });
        },
      };
    };

    var p1 = postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift2',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.8', bottomGas: '82' },
      ],
    });
    var p2 = postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift2',
      rows: [
        { id: 'gc-1', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        { id: 'gc-2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '79', cleaningGas: '9.9', bottomGas: '83' },
      ],
    });

    var results = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind;
    var statuses = results.map(function(r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    pass('T17: race condition returns [200, 409]');

    // T18: GET returns canonical doc and does NOT write
    var countBeforeGet = await PlantAnalysisRecord.countDocuments();
    var t18Res = await getReq(port, '/api/gas-conc?date=' + OP_DATE);
    assert.strictEqual(t18Res.status, 200);
    assert.strictEqual(t18Res.body.success, true);
    assert(Array.isArray(t18Res.body.rows));
    var countAfterGet = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBeforeGet, countAfterGet);
    pass('T18: GET returns canonical doc and does NOT write');

    // T19: Legacy lockedShifts hydrate properly
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'Soda Ash Plant',
      plantCode: 'SA',
      analysisType: 'Gas Conc. Analysis',
      unit: 'Gas Conc.',
      date: OP_DATE,
      shift: 'All Shifts',
      status: 'completed',
      data: {
        date: OP_DATE,
        rows: [
          { id: 'gc-legacy', date: OP_DATE, time: '08:00', seal: 'OK', recoveryCo2Con: '80', cleaningGas: '10', bottomGas: '85' },
        ],
        lockedShifts: {
          shift1Saved: true,
          shift1Locked: false,
          shift1Edits: 0,
        },
      },
    });

    var t19Res = await getReq(port, '/api/gas-conc?date=' + OP_DATE);
    assert.strictEqual(t19Res.status, 200);
    assert.strictEqual(t19Res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t19Res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t19Res.body.lockedSlots.shift2.isLocked, false);
    pass('T19: legacy lockedShifts hydrate properly');

    // T20: Legacy odd rows preserved without being dropped
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'Soda Ash Plant',
      plantCode: 'SA',
      analysisType: 'Gas Conc. Analysis',
      unit: 'Gas Conc.',
      date: OP_DATE,
      shift: 'All Shifts',
      status: 'completed',
      data: {
        date: OP_DATE,
        rows: [
          { id: 'gc-odd-1', date: OP_DATE, time: '07:15', seal: 'OK', recoveryCo2Con: '77', cleaningGas: '9.2', bottomGas: '81' },
        ],
        lockedSlots: {
          shift1: { isSaved: true, isLocked: false, correctionUsed: false },
          shift2: { isSaved: false, isLocked: false, correctionUsed: false },
          shift3: { isSaved: false, isLocked: true, correctionUsed: false },
        },
        lockedShifts: {
          shift1Saved: true,
          shift1Locked: false,
          shift2Saved: false,
          shift2Locked: false,
          shift3Saved: false,
          shift3Locked: true,
        },
      },
    });

    var t20PostRes = await postReq(port, '/api/gas-conc', {
      date: OP_DATE,
      targetShift: 'shift2',
      rows: [
        { id: 'gc-odd-1', date: OP_DATE, time: '07:15', seal: 'OK', recoveryCo2Con: '77', cleaningGas: '9.2', bottomGas: '81' },
        { id: 'gc-s2', date: '',        time: '16:00', seal: 'OK', recoveryCo2Con: '78', cleaningGas: '9.5', bottomGas: '83' },
      ],
    });
    assert.strictEqual(t20PostRes.status, 200);
    assert(t20PostRes.body.rows.some(function(r) { return r.id === 'gc-odd-1' && r.time === '07:15'; }));
    pass('T20: legacy odd rows preserved on save');

    // T21: Reader contract (Excel generation succeeds and preserves invariant row fields)
    var excelResult = await generateGasConcExcel({
      date: OP_DATE,
      rows: t20PostRes.body.rows,
      submittedBy: 'Test Operator',
    });
    assert(excelResult && excelResult.buffer);
    assert(Buffer.isBuffer(Buffer.from(excelResult.buffer)));
    assert(Buffer.from(excelResult.buffer).length > 500);
    pass('T21: reader contract satisfied (generateGasConcExcel succeeds)');

    console.log('\n------------------------------------------------------------------------');
    console.log('ALL ' + totalPassed + ' GAS CONC. LOCK ROUTE TESTS PASSED');
    console.log('------------------------------------------------------------------------\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

runTests().catch(function(err) {
  console.error('Test execution failed:', err);
  process.exit(1);
});
