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
var { createRouter: createBicarbonateRouter } = require('../routes/bicarbonateAnalysisRoutes');

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

const DEFAULT_READINGS_TEMPLATE = [
  { id: 'r1',  time: '06:30', filter: 'F-1', naclNa2co3: '', isDefault: true },
  { id: 'r2',  time: '08:30', filter: 'F-1', naclNa2co3: '', isDefault: true },
  { id: 'r3',  time: '10:30', filter: '',    naclNa2co3: '', isDefault: true },
  { id: 'r4',  time: '12:30', filter: 'F-2', naclNa2co3: '', isDefault: true },
  { id: 'r5',  time: '14:30', filter: 'F-2', naclNa2co3: '', isDefault: true },
  { id: 'r6',  time: '16:30', filter: 'F-3', naclNa2co3: '', isDefault: true },
  { id: 'r7',  time: '18:30', filter: 'F-3', naclNa2co3: '', isDefault: true },
  { id: 'r8',  time: '20:30', filter: 'F-4', naclNa2co3: '', isDefault: true },
  { id: 'r9',  time: '22:30', filter: 'F-4', naclNa2co3: '', isDefault: true },
  { id: 'r10', time: '00:30', filter: 'F-5', naclNa2co3: '', isDefault: true },
  { id: 'r11', time: '02:30', filter: 'F-5', naclNa2co3: '', isDefault: true },
  { id: 'r12', time: '04:30', filter: '',    naclNa2co3: '', isDefault: true },
];

function buildReadings(overrides = {}) {
  return DEFAULT_READINGS_TEMPLATE.map(r => {
    if (overrides[r.id]) {
      return { ...r, ...overrides[r.id] };
    }
    return { ...r };
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
  var bicarbRouter = createBicarbonateRouter({ getNow });
  app.use('/api/bicarbonate-analysis', bicarbRouter);
  app.use('/api/bi-carbonate-analysis', bicarbRouter);

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';

  console.log('========================================================================');
  console.log('SA-2b G3: BICARBONATE ANALYSIS (NaCl/Na2CO3) INTEGRATION TESTS');
  console.log('========================================================================');

  try {
    // T1: First save of r1 opens r2
    await PlantAnalysisRecord.deleteMany({});
    var t1Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
    });
    assert.strictEqual(t1Res.status, 200);
    assert.strictEqual(t1Res.body.success, true);
    assert.strictEqual(t1Res.body.lockedSlots.r1.isSaved, true);
    assert.strictEqual(t1Res.body.lockedSlots.r1.isLocked, false);
    assert.strictEqual(t1Res.body.lockedSlots.r2.isSaved, false);
    assert.strictEqual(t1Res.body.lockedSlots.r2.isLocked, false);
    pass('T1: first save r1 opens r2');

    // T2: Out-of-order save rejected with 400 (trying to save r3 before r2)
    var t2Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({
        r1: { filter: 'F-1', naclNa2co3: '2.5' },
        r3: { filter: 'F-2', naclNa2co3: '2.8' },
      }),
    });
    assert.strictEqual(t2Res.status, 400);
    pass('T2: out-of-order save rejected with 400');

    // T3: Correction succeeds with editedFields and audit history
    var t3Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.7' } }),
    });
    assert.strictEqual(t3Res.status, 200);
    assert.strictEqual(t3Res.body.lockedSlots.r1.correctionUsed, true);
    assert.strictEqual(t3Res.body.lockedSlots.r1.isLocked, true);
    assert(t3Res.body.editedFields && (t3Res.body.editedFields.r1?.naclNa2co3 || t3Res.body.editedFields['1']?.naclNa2co3));
    assert(t3Res.body.editAuditHistory && t3Res.body.editAuditHistory.length >= 1);
    var lastAudit = t3Res.body.editAuditHistory[t3Res.body.editAuditHistory.length - 1];
    assert.strictEqual(lastAudit.rowId, 'r1');
    assert.strictEqual(lastAudit.field, 'naclNa2co3');
    assert.strictEqual(lastAudit.oldValue, '2.5');
    assert.strictEqual(lastAudit.newValue, '2.7');
    pass('T3: correction succeeds with editedFields and audit history');

    // T4: Second correction rejected with 400
    var t4Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.9' } }),
    });
    assert.strictEqual(t4Res.status, 400);
    pass('T4: second correction rejected with 400');

    // T5: r2 save permanently locks r1
    var t5Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({
        r1: { filter: 'F-1', naclNa2co3: '2.7' },
        r2: { filter: 'F-1', naclNa2co3: '2.6' },
      }),
    });
    assert.strictEqual(t5Res.status, 200);
    assert.strictEqual(t5Res.body.lockedSlots.r2.isSaved, true);
    assert.strictEqual(t5Res.body.lockedSlots.r1.isLocked, true);
    pass('T5: r2 save permanently locks r1');

    // T6: Identical re-save -> 200 noChange with zero DB writes
    var countBefore = await PlantAnalysisRecord.countDocuments();
    var docBefore = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    var t6Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({
        r1: { filter: 'F-1', naclNa2co3: '2.7' },
        r2: { filter: 'F-1', naclNa2co3: '2.6' },
      }),
    });
    assert.strictEqual(t6Res.status, 200);
    assert.strictEqual(t6Res.body.noChange, true);
    var countAfter = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBefore, countAfter);
    var docAfter = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert.strictEqual(docBefore.updatedAt.getTime(), docAfter.updatedAt.getTime());
    pass('T6: identical re-save -> 200 noChange');

    // T7: Empty slot save rejected with 400
    await PlantAnalysisRecord.deleteMany({});
    var t7Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: DEFAULT_READINGS_TEMPLATE.map(r => ({ ...r, filter: '', naclNa2co3: '' })),
    });
    assert.strictEqual(t7Res.status, 400);
    pass('T7: empty slot save rejected with 400');

    // T8: Clear-all correction rejected with 400
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
    });
    var t8Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: '', naclNa2co3: '' } }),
    });
    assert.strictEqual(t8Res.status, 400);
    pass('T8: clear-all correction rejected with 400');

    // T9: Multi-slot POST rejected with 400
    await PlantAnalysisRecord.deleteMany({});
    var t9Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({
        r1: { filter: 'F-1', naclNa2co3: '2.5' },
        r2: { filter: 'F-1', naclNa2co3: '2.6' },
      }),
    });
    assert.strictEqual(t9Res.status, 400);
    pass('T9: multi-slot POST rejected with 400');

    // T10: Role user rejected with 403
    var t10Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
    }, { 'x-role-user': 'true' });
    assert.strictEqual(t10Res.status, 403);
    pass('T10: role user rejected with 403');

    // T11: Date bypass headers and payload fields do NOT bypass date
    var t11Res1 = await postReq(port, '/api/bicarbonate-analysis', {
      date: '2026-10-25',
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
      isTestMode: true,
      now: '2026-10-25T10:00:00Z',
    }, {
      'x-test-mode': 'true',
      'x-test-now': '2026-10-25T10:00:00Z',
      'x-test-env': 'true',
    });
    assert.strictEqual(t11Res1.status, 400);
    pass('T11: bypass headers and payload fields do NOT bypass date');

    // T12: 06:00 IST boundary enforced strictly
    currentTime = istDate(2026, 10, 28, 5, 59); // 05:59 IST belongs to 2026-10-27
    var t12Res1 = await postReq(port, '/api/bicarbonate-analysis', {
      date: '2026-10-28',
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
    });
    assert.strictEqual(t12Res1.status, 400);

    var t12Res2 = await postReq(port, '/api/bicarbonate-analysis', {
      date: '2026-10-27',
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
    });
    assert.strictEqual(t12Res2.status, 200);

    currentTime = istDate(2026, 10, 28, 6, 0); // 06:00 IST belongs to 2026-10-28
    var t12Res3 = await postReq(port, '/api/bicarbonate-analysis', {
      date: '2026-10-28',
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
    });
    assert.strictEqual(t12Res3.status, 200);
    pass('T12: 06:00 IST boundary enforced strictly');

    // Reset currentTime back to 10:00
    currentTime = istDate(2026, 10, 28, 10, 0);

    // T13: Race condition returns [200, 409]
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({ r1: { filter: 'F-1', naclNa2co3: '2.5' } }),
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
        return findBarrier.then(function() {
          return origLean.apply(query, arguments);
        });
      };
      return query;
    };

    var p1 = postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({
        r1: { filter: 'F-1', naclNa2co3: '2.5' },
        r2: { filter: 'F-1', naclNa2co3: '2.3' },
      }),
    });
    var p2 = postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: buildReadings({
        r1: { filter: 'F-1', naclNa2co3: '2.5' },
        r2: { filter: 'F-1', naclNa2co3: '2.8' },
      }),
    });

    var raceResults = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind;

    var statuses = raceResults.map(r => r.status).sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    pass('T13: race condition returns [200, 409]');

    // T14: GET returns canonical doc and does NOT write
    var countBeforeGet = await PlantAnalysisRecord.countDocuments();
    var t14Res = await getReq(port, '/api/bicarbonate-analysis?date=' + OP_DATE);
    assert.strictEqual(t14Res.status, 200);
    assert.strictEqual(t14Res.body.success, true);
    assert(Array.isArray(t14Res.body.readings));
    assert.strictEqual(t14Res.body.readings.length, 12);
    var countAfterGet = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBeforeGet, countAfterGet);
    pass('T14: GET returns canonical doc and does NOT write');

    // T15: Legacy {initialSaved, editCount, isLocked} doc hydrates correctly
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'SA Plant',
      plantCode: 'SA',
      analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
      date: OP_DATE,
      data: {
        readings: [
          { id: '1', time: '06:30', filter: 'F-1', naclNa2co3: '2.5' },
        ],
        lockedSlots: {
          '1': { initialSaved: true, editCount: 0, isLocked: false },
        },
      },
    });
    var t15Res = await getReq(port, '/api/bicarbonate-analysis?date=' + OP_DATE);
    assert.strictEqual(t15Res.status, 200);
    assert.strictEqual(t15Res.body.lockedSlots.r1.isSaved, true);
    assert.strictEqual(t15Res.body.lockedSlots.r1.isLocked, false);
    assert.strictEqual(t15Res.body.lockedSlots.r1.correctionUsed, false);
    pass('T15: legacy doc hydrates correctly in memory');

    // T16: Legacy extra/custom rows preserved after save
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'SA Plant',
      plantCode: 'SA',
      analysisType: 'Bi Carbonate NaCl/Na2CO3 Analysis',
      date: OP_DATE,
      data: {
        readings: [
          { id: 'r1', time: '06:30', filter: 'F-1', naclNa2co3: '2.5' },
          { id: 'custom_slot_99', time: '11:15', filter: 'F-X', naclNa2co3: '2.1' },
        ],
        lockedSlots: {
          r1: { isSaved: true, isLocked: false, correctionUsed: false },
        },
      },
    });

    var t16Res = await postReq(port, '/api/bicarbonate-analysis', {
      date: OP_DATE,
      readings: [
        ...buildReadings({
          r1: { filter: 'F-1', naclNa2co3: '2.5' },
          r2: { filter: 'F-1', naclNa2co3: '2.6' },
        }),
        { id: 'custom_slot_99', time: '11:15', filter: 'F-X', naclNa2co3: '2.1' },
      ],
    });
    assert.strictEqual(t16Res.status, 200);
    var hasCustom = t16Res.body.readings.some(function(r) { return r.id === 'custom_slot_99'; });
    assert.strictEqual(hasCustom, true);
    pass('T16: legacy custom rows preserved after save');

    // T17: Reader contract (stored readings array has 12 items, fields filter, naclNa2co3)
    var dbRecord = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert(dbRecord);
    var r1 = dbRecord.data.readings.find(function(r) { return r.id === 'r1' || r.id === '1'; });
    assert(r1);
    assert.strictEqual(r1.time, '06:30');
    assert(r1.hasOwnProperty('filter'));
    assert(r1.hasOwnProperty('naclNa2co3'));
    pass('T17: reader contract preserved exact schema');

    // T18: Alias route /api/bi-carbonate-analysis works identically
    var t18Res = await getReq(port, '/api/bi-carbonate-analysis?date=' + OP_DATE);
    assert.strictEqual(t18Res.status, 200);
    assert.strictEqual(t18Res.body.success, true);
    assert.strictEqual(t18Res.body.lockedSlots.r1.isSaved, true);
    assert.strictEqual(t18Res.body.lockedSlots.r2.isSaved, true);
    pass('T18: alias route /api/bi-carbonate-analysis works identically');

    console.log('\n========================================================================');
    console.log('✅ ALL BICARBONATE TESTS PASSED (' + totalPassed + '/' + totalPassed + ')');
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

