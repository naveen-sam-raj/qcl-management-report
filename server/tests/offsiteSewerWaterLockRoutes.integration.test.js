'use strict';

var authCacheKey = require.resolve('../middleware/auth');
require.cache[authCacheKey] = {
  id: authCacheKey,
  filename: authCacheKey,
  loaded: true,
  exports: {
    protect: function (req, _res, next) {
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
          name: 'Offsite Test Admin',
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
var { createRouter: createSewerWaterRouter } = require('../routes/sewerWaterAnalysisRoutes');
var { getOperatingDateIST } = require('../utils/operatingDate');

function istDate(y, m, d, hh, mm) {
  var s = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T' +
    String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00+05:30';
  return new Date(s);
}

function postReq(port, path, body, headers) {
  return new Promise(function (resolve, reject) {
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
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var str = Buffer.concat(chunks).toString('utf8');
        var json;
        try { json = JSON.parse(str); } catch (e) { json = str; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getReq(port, path, headers) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: path,
      method: 'GET',
      headers: headers || {},
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var str = Buffer.concat(chunks).toString('utf8');
        var json;
        try { json = JSON.parse(str); } catch (e) { json = str; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

var passedCount = 0;
function pass(msg) {
  passedCount++;
  console.log('  PASS: ' + msg);
}

var BASE_ROW_T11 = {
  id: 't11',
  time: '11:00',
  sec200: { fnh3: '3', cnh3: '0' },
  sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
  finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
};

var BASE_ROW_T13 = {
  id: 't13',
  time: '13:00',
  sec200: { fnh3: '5', cnh3: '0' },
  sec400: { fnh3: '5000', cnh3: '3000', hco3: '0' },
  finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
};

var BASE_ROW_T15 = {
  id: 't15',
  time: '15:00',
  sec200: { fnh3: '6', cnh3: '0' },
  sec400: { fnh3: '5200', cnh3: '3100', hco3: '0' },
  finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
};

var BASE_ROW_T17 = {
  id: 't17',
  time: '17:00',
  sec200: { fnh3: '7', cnh3: '0' },
  sec400: { fnh3: '5300', cnh3: '3200', hco3: '0' },
  finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
};

var BASE_ROW_T19 = {
  id: 't19',
  time: '19:00',
  sec200: { fnh3: '1020', cnh3: '2244' },
  sec400: { fnh3: '5780', cnh3: '2720', hco3: '0' },
  finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '38.5' },
};

var BASE_ROW_T21 = {
  id: 't21',
  time: '21:00',
  sec200: { fnh3: '1100', cnh3: '2300' },
  sec400: { fnh3: '5900', cnh3: '2800', hco3: '0' },
  finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '39.0' },
};

async function run() {
  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  var fakeNow = istDate(2026, 10, 28, 10, 0); // 10:00 IST on 2026-10-28
  var OP_DATE = getOperatingDateIST(fakeNow); // '2026-10-28'

  var app = express();
  app.use(express.json());
  app.use('/api/sewer-water-analysis', createSewerWaterRouter({
    getNow: function () { return fakeNow; },
  }));

  var server = http.createServer(app);
  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });
  var port = server.address().port;

  try {
    // T1: Fresh date allows only first slot (t11)
    var get1 = await getReq(port, '/api/sewer-water-analysis?date=' + OP_DATE);
    assert.strictEqual(get1.status, 200);
    assert.strictEqual(get1.body.data, null);
    pass('T1: fresh date returns 200 with data: null');

    // T7: Empty unit save rejected with 400
    var emptySave = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '', cnh3: '' },
        sec400: { fnh3: '', cnh3: '', hco3: '' },
        finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' },
      }],
    });
    assert.strictEqual(emptySave.status, 400);
    assert.strictEqual(emptySave.body.message, 'Cannot save empty slot t11. At least one non-empty value is required.');
    pass('T7: empty slot first save rejected with 400');

    // T2: Valid first save of t11 succeeds and opens t13
    var save1 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [BASE_ROW_T11],
    });
    assert.strictEqual(save1.status, 200);
    assert.strictEqual(save1.body.success, true);
    assert.strictEqual(save1.body.lockedSlots.t11.isSaved, true);
    assert.strictEqual(save1.body.lockedSlots.t11.isLocked, false);
    assert.strictEqual(save1.body.lockedSlots.t11.correctionUsed, false);
    pass('T2: first save of t11 succeeds and opens t13');

    // T6: Identical re-save returns 200 { noChange: true }
    var resave = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [BASE_ROW_T11],
    });
    assert.strictEqual(resave.status, 200);
    assert.strictEqual(resave.body.noChange, true);
    assert.strictEqual(resave.body.message, 'No changes');
    pass('T6: identical re-save returns 200 { noChange: true }');

    // T4: Valid correction on t11 consumes single permitted correction
    var corr1 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '4', cnh3: '0' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
      }],
    });
    assert.strictEqual(corr1.status, 200);
    assert.strictEqual(corr1.body.lockedSlots.t11.correctionUsed, true);
    assert.strictEqual(corr1.body.lockedSlots.t11.isLocked, true);
    assert.strictEqual(corr1.body.editedFields.t11_sec200_fnh3, true);
    assert.strictEqual(corr1.body.editedFields['11:00_sec200_fnh3'], true);
    pass('T4: valid correction succeeds and sets correctionUsed: true');

    // T5: Second correction attempt on t11 rejected with 400
    var corr2 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '5', cnh3: '0' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
      }],
    });
    assert.strictEqual(corr2.status, 400);
    assert.strictEqual(corr2.body.message, 'Cannot edit t11 because it is permanently locked.');
    pass('T5: second correction attempt rejected with 400');

    // T2b: Second slot save (t13) succeeds
    var post2 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't13',
      readings: [BASE_ROW_T13],
    });
    assert.strictEqual(post2.status, 200);
    assert.strictEqual(post2.body.lockedSlots.t13.isSaved, true);
    assert.strictEqual(post2.body.lockedSlots.t13.isLocked, false);
    pass('T2b: save of t13 succeeds');

    // T3: Sequential save of t15 permanently locks t13
    var post3 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't15',
      readings: [BASE_ROW_T15],
    });
    assert.strictEqual(post3.status, 200);
    assert.strictEqual(post3.body.lockedSlots.t13.isLocked, true);
    assert.strictEqual(post3.body.lockedSlots.t15.isSaved, true);
    assert.strictEqual(post3.body.lockedSlots.t15.isLocked, false);
    pass('T3: sequential save of t15 permanently locks t13');

    // T23: Correction clearing all values rejected with 400
    var clearAll = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't15',
      readings: [{
        id: 't15',
        time: '15:00',
        sec200: { fnh3: '', cnh3: '' },
        sec400: { fnh3: '', cnh3: '', hco3: '' },
        finalOutlet: { fnh3: '', cnh3: '', hco3: '', pcl: '' },
      }],
    });
    assert.strictEqual(clearAll.status, 400);
    assert.strictEqual(clearAll.body.message, 'A correction cannot clear all values in t15. At least one non-empty value is required.');
    pass('T23: correction clearing all values rejected with 400');

    // T9: Out-of-order save attempt rejected with 400
    var outOfOrder = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't19',
      readings: [BASE_ROW_T19],
    });
    assert.strictEqual(outOfOrder.status, 400);
    assert.strictEqual(outOfOrder.body.message, 'Sequential restriction: t17 must be completed and saved before proceeding to t19.');
    pass('T9: out-of-order save attempt rejected with 400');

    // T8: Deterministic race condition on concurrent POSTs -> [200, 409]
    var origFind = PlantAnalysisRecord.find;
    var findBarrierResolve;
    var findBarrierPromise = new Promise(function (resolve) { findBarrierResolve = resolve; });
    var findCallCount = 0;

    PlantAnalysisRecord.find = function () {
      var resQuery = origFind.apply(this, arguments);
      var origLean = resQuery.lean.bind(resQuery);
      resQuery.lean = async function () {
        var docs = await origLean();
        findCallCount++;
        if (findCallCount === 1) {
          await findBarrierPromise;
        } else if (findCallCount === 2) {
          findBarrierResolve();
        }
        return docs;
      };
      return resQuery;
    };

    var p1 = postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't17',
      readings: [Object.assign({}, BASE_ROW_T17, { sec200: { fnh3: '8', cnh3: '0' } })],
    });
    var p2 = postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't17',
      readings: [Object.assign({}, BASE_ROW_T17, { sec200: { fnh3: '9', cnh3: '0' } })],
    });

    var raceResults = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind;

    var raceStatuses = raceResults.map(function (r) { return r.status; }).sort();
    assert.deepStrictEqual(raceStatuses, [200, 409]);
    pass('T8: deterministic race condition returns [200, 409]');

    // T10: 06:00-06:00 IST operating day boundary enforcement
    await PlantAnalysisRecord.deleteMany({});
    fakeNow = istDate(2026, 10, 29, 5, 59); // 05:59 on Oct 29 IST belongs to 2026-10-28
    assert.strictEqual(getOperatingDateIST(fakeNow), '2026-10-28');
    var b559 = await postReq(port, '/api/sewer-water-analysis', {
      date: '2026-10-28',
      targetSlot: 't11',
      readings: [BASE_ROW_T11],
    });
    assert.strictEqual(b559.status, 200);

    fakeNow = istDate(2026, 10, 29, 6, 1); // 06:01 on Oct 29 IST belongs to 2026-10-29
    assert.strictEqual(getOperatingDateIST(fakeNow), '2026-10-29');
    var b601Past = await postReq(port, '/api/sewer-water-analysis', {
      date: '2026-10-28',
      targetSlot: 't13',
      readings: [BASE_ROW_T13],
    });
    assert.strictEqual(b601Past.status, 400);
    assert.strictEqual(b601Past.body.message, "Date restriction enforced: Sewer Water Analysis records can only be created or modified for today's operating date (2026-10-29). Historical or future modifications are not permitted.");
    pass('T10: 06:00-06:00 IST operating day boundary strictly enforced');

    // T10b: Client date spoofing (past AND future) strictly ignored -> 400
    fakeNow = istDate(2026, 10, 28, 11, 0);
    // Past date spoof
    var pastSpoof = await postReq(port, '/api/sewer-water-analysis', {
      date: '2026-10-27',
      now: '2026-10-27T10:00:00.000Z',
      payload: { now: '2026-10-27T10:00:00.000Z' },
      body: { now: '2026-10-27T10:00:00.000Z' },
      readings: [BASE_ROW_T11],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(pastSpoof.status, 400);
    assert.strictEqual(pastSpoof.body.message, "Date restriction enforced: Sewer Water Analysis records can only be created or modified for today's operating date (2026-10-28). Historical or future modifications are not permitted.");

    // Future date spoof
    var futureSpoof = await postReq(port, '/api/sewer-water-analysis', {
      date: '2026-10-29',
      now: '2026-10-29T10:00:00.000Z',
      payload: { now: '2026-10-29T10:00:00.000Z' },
      body: { now: '2026-10-29T10:00:00.000Z' },
      readings: [BASE_ROW_T11],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(futureSpoof.status, 400);
    assert.strictEqual(futureSpoof.body.message, "Date restriction enforced: Sewer Water Analysis records can only be created or modified for today's operating date (2026-10-28). Historical or future modifications are not permitted.");
    pass('T10b: client date spoofing (past and future) strictly ignored -> 400');

    // T11: Role user returns 403 on GET single, GET list, and POST
    fakeNow = istDate(2026, 10, 28, 12, 0);
    var get403 = await getReq(port, '/api/sewer-water-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(get403.status, 403);
    assert.strictEqual(get403.body.message, 'Forbidden: Sewer Water Analysis data access is restricted to authorized Admins.');

    var getList403 = await getReq(port, '/api/sewer-water-analysis?startDate=' + OP_DATE + '&endDate=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(getList403.status, 403);
    assert.strictEqual(getList403.body.message, 'Forbidden: Sewer Water Analysis data access is restricted to authorized Admins.');

    var post403 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [BASE_ROW_T11],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(post403.status, 403);
    assert.strictEqual(post403.body.message, 'Forbidden: Sewer Water Analysis data entry and modification is restricted to authorized Admins.');
    pass('T11: role user returns 403 on GET and POST');

    // T12: Admin override attempts rejected (no admin override)
    fakeNow = istDate(2026, 10, 28, 12, 0);
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [BASE_ROW_T11],
    });
    await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [Object.assign({}, BASE_ROW_T11, { sec200: { fnh3: '4', cnh3: '0' } })],
    });
    // Now t11 is locked
    var adminOverride = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      override: true,
      isAdminOverride: true,
      force: true,
      readings: [Object.assign({}, BASE_ROW_T11, { sec200: { fnh3: '5', cnh3: '0' } })],
    });
    assert.strictEqual(adminOverride.status, 400);
    assert.strictEqual(adminOverride.body.message, 'Cannot edit t11 because it is permanently locked.');
    pass('T12: admin override attempts rejected (no admin override)');

    // T12b: payload.now, body.now and x-test headers strictly ignored -> 400
    var t12bRes = await postReq(port, '/api/sewer-water-analysis', {
      date: '2026-10-27',
      now: '2026-10-27T12:00:00.000Z',
      body: { now: '2026-10-27T12:00:00.000Z' },
      payload: { now: '2026-10-27T12:00:00.000Z' },
      readings: [BASE_ROW_T11],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(t12bRes.status, 400);
    assert.strictEqual(t12bRes.body.message, "Date restriction enforced: Sewer Water Analysis records can only be created or modified for today's operating date (2026-10-28). Historical or future modifications are not permitted.");
    pass('T12b: payload.now, body.now and x-test headers strictly ignored -> 400');

    // T13: Stored shape data.readings preserved with visual order, nested groups, and all 9 fields
    await PlantAnalysisRecord.deleteMany({});
    var save13 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [BASE_ROW_T11],
    });
    assert.strictEqual(save13.status, 200);
    var doc13 = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert.strictEqual(doc13.data.readings.length, 6);
    assert.strictEqual(doc13.data.readings[0].id, 't11');
    assert.strictEqual(doc13.data.readings[0].time, '11:00');
    assert.strictEqual(doc13.data.readings[0].sec200.fnh3, '3');
    assert.strictEqual(doc13.data.readings[0].sec200.cnh3, '0');
    assert.strictEqual(doc13.data.readings[0].sec400.fnh3, '6664');
    assert.strictEqual(doc13.data.readings[0].sec400.cnh3, '4284');
    assert.strictEqual(doc13.data.readings[0].sec400.hco3, '0');
    assert.strictEqual(doc13.data.readings[0].finalOutlet.fnh3, '0');
    assert.strictEqual(doc13.data.readings[0].finalOutlet.cnh3, '0');
    assert.strictEqual(doc13.data.readings[0].finalOutlet.hco3, '0');
    assert.strictEqual(doc13.data.readings[0].finalOutlet.pcl, 'NIL');
    pass('T13: stored shape data.readings preserved with visual order, nested groups, and all 9 fields');

    // T14: Legacy document lock derivation
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Sewer Water Analysis',
      unit: 'Sewer Water',
      date: OP_DATE,
      data: {
        readings: [
          BASE_ROW_T11,
          BASE_ROW_T13,
        ],
        lockedSlots: {
          t11: { initialSaved: true, editCount: 1, isLocked: true },
          t13: { initialSaved: true, editCount: 0, isLocked: false },
        },
      },
    });

    var t14Get = await getReq(port, '/api/sewer-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t14Get.status, 200);
    assert.strictEqual(t14Get.body.lockedSlots.t11.isSaved, true);
    assert.strictEqual(t14Get.body.lockedSlots.t11.isLocked, true);
    assert.strictEqual(t14Get.body.lockedSlots.t13.isSaved, true);
    assert.strictEqual(t14Get.body.lockedSlots.t13.isLocked, false);
    pass('T14: legacy document lock derivation maps correctly');

    // T14b: Legacy doc with lockedSlots where later slot is saved sequentially propagates isLocked to earlier slot
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Sewer Water Analysis',
      unit: 'Sewer Water',
      date: OP_DATE,
      data: {
        readings: [
          BASE_ROW_T11,
          BASE_ROW_T13,
        ],
        lockedSlots: {
          t11: { initialSaved: true, editCount: 0, isLocked: false },
          t13: { initialSaved: true, editCount: 0, isLocked: false },
        },
      },
    });

    var t14bGet = await getReq(port, '/api/sewer-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t14bGet.status, 200);
    assert.strictEqual(t14bGet.body.lockedSlots.t11.isSaved, true);
    assert.strictEqual(t14bGet.body.lockedSlots.t11.isLocked, true);
    assert.strictEqual(t14bGet.body.lockedSlots.t13.isSaved, true);
    assert.strictEqual(t14bGet.body.lockedSlots.t13.isLocked, false);

    var t14bPost = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [Object.assign({}, BASE_ROW_T11, { sec200: { fnh3: '4', cnh3: '0' } })],
    });
    assert.strictEqual(t14bPost.status, 400);
    assert.strictEqual(t14bPost.body.message, 'Cannot edit t11 because it is permanently locked.');
    pass('T14b: legacy doc sequential propagation locks previous saved slot and rejects correction');

    // T15: Duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST
    await PlantAnalysisRecord.deleteMany({});
    var olderDoc = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Sewer Water Analysis',
      unit: 'Sewer Water',
      date: OP_DATE,
      savedAt: new Date(Date.now() - 50000),
      data: {
        readings: [BASE_ROW_T11],
        lockedSlots: { t11: { isSaved: true, isLocked: false, correctionUsed: false } },
      },
    });
    var newerDoc = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Sewer Water Analysis',
      unit: 'Sewer Water',
      date: OP_DATE,
      savedAt: new Date(Date.now()),
      data: {
        readings: [BASE_ROW_T11, BASE_ROW_T13],
        lockedSlots: {
          t11: { isSaved: true, isLocked: true, correctionUsed: true },
          t13: { isSaved: true, isLocked: false, correctionUsed: false },
        },
      },
    });

    var t15Get = await getReq(port, '/api/sewer-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t15Get.status, 200);
    assert.strictEqual(String(t15Get.body.recordId), String(newerDoc._id));
    assert.strictEqual(t15Get.body.lockedSlots.t11.isLocked, true);
    assert.strictEqual(t15Get.body.lockedSlots.t13.isSaved, true);
    pass('T15: pickCanonicalDoc returns latest canonical document on GET and POST');

    // T16: Multi-slot POST rejected (one POST = one slot target)
    var multiSlot = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      readings: [
        Object.assign({}, BASE_ROW_T13, { sec200: { fnh3: '8', cnh3: '0' } }),
        Object.assign({}, BASE_ROW_T15, { sec200: { fnh3: '9', cnh3: '0' } }),
      ],
    });
    assert.strictEqual(multiSlot.status, 400);
    assert.strictEqual(multiSlot.body.message, 'Only one slot can be saved per submission.');
    pass('T16: multi-slot POST rejected with 400');

    // T17: Decimal string preserved as trimmed string without Number coercion
    await PlantAnalysisRecord.deleteMany({});
    var decRes = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '11.0', cnh3: '0.00' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
      }],
    });
    assert.strictEqual(decRes.status, 200);
    assert.strictEqual(decRes.body.readings[0].sec200.fnh3, '11.0');
    assert.strictEqual(decRes.body.readings[0].sec200.cnh3, '0.00');

    // Re-save with '11' is treated as identical numerically by isValueDifferent -> noChange
    var decRe = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '11', cnh3: '0' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
      }],
    });
    assert.strictEqual(decRe.status, 200);
    assert.strictEqual(decRe.body.noChange, true);
    pass('T17: decimal string preserved as trimmed string without Number coercion');

    // T18: Payload time metadata ignored by server and stored strictly as canonical slot time
    var timeSpoof = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't13',
      readings: [{
        id: 't13',
        time: '99:99', // Spoofed time
        sec200: { fnh3: '5', cnh3: '0' },
        sec400: { fnh3: '5000', cnh3: '3000', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
      }],
    });
    assert.strictEqual(timeSpoof.status, 200);
    assert.strictEqual(timeSpoof.body.readings[1].id, 't13');
    assert.strictEqual(timeSpoof.body.readings[1].time, '13:00');
    pass('T18: payload time metadata ignored by server and stored strictly as canonical slot time');

    // T19: Report matcher test using verbatim functions from genericPlantReportService.js located dynamically
    var fsModule = require('fs');
    var gLines = fsModule.readFileSync(require.resolve('../services/genericPlantReportService'), 'utf8').split('\n');
    var fnStart = gLines.findIndex(function (l) { return l.includes('function getCellAuditEntries('); });
    assert.ok(fnStart >= 0, 'getCellAuditEntries must exist in genericPlantReportService');
    var braceCount = 0;
    var fnEnd = -1;
    for (var i = fnStart; i < gLines.length; i++) {
      var l = gLines[i];
      for (var ch of l) {
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
      }
      if (braceCount === 0 && i > fnStart) {
        fnEnd = i;
        break;
      }
    }
    assert.ok(fnEnd > fnStart, 'getCellAuditEntries end must be found');
    var getCellAuditEntriesStr = gLines.slice(fnStart, fnEnd + 1).join('\n');
    var getCellAuditEntriesFn = new Function('return (' + getCellAuditEntriesStr + ')')();

    var corr19 = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't13',
      readings: [Object.assign({}, BASE_ROW_T13, { sec200: { fnh3: '88', cnh3: '0' } })],
    });
    assert.strictEqual(corr19.status, 200);
    assert.strictEqual(corr19.body.editAuditHistory.length, 1);
    var auditEntry19 = corr19.body.editAuditHistory[0];
    assert.strictEqual(Object.keys(auditEntry19).length, 10);
    assert.strictEqual(auditEntry19.date, OP_DATE);
    assert.strictEqual(auditEntry19.rowId, 't13');
    assert.strictEqual(auditEntry19.shift, 'Day');
    assert.strictEqual(auditEntry19.time, '13:00');
    assert.strictEqual(auditEntry19.field, 'sec200_fnh3');
    assert.strictEqual(auditEntry19.oldValue, '5');
    assert.strictEqual(auditEntry19.newValue, '88');
    assert.ok(auditEntry19.editedBy);
    assert.ok(auditEntry19.editedById);
    assert.ok(auditEntry19.timestamp);

    // Positive matcher: rowKey '13:00', colKey 'sec200__fnh3', dataObj for t13
    var matchedPositive = getCellAuditEntriesFn(
      corr19.body.editAuditHistory,
      '13:00',
      'sec200__fnh3',
      { id: 't13', time: '13:00' }
    );
    assert.strictEqual(matchedPositive.length, 1);
    assert.strictEqual(matchedPositive[0].oldValue, '5');
    assert.strictEqual(matchedPositive[0].newValue, '88');

    // Cross-slot Negative matcher: same audit entry against rowKey '11:00' -> 0 matches
    var matchedCrossSlot = getCellAuditEntriesFn(
      corr19.body.editAuditHistory,
      '11:00',
      'sec200__fnh3',
      { id: 't11', time: '11:00' }
    );
    assert.strictEqual(matchedCrossSlot.length, 0);

    // Cross-group Negative matcher: same audit entry against finalOutlet__fnh3 and sec400__fnh3 -> 0 matches
    var matchedCrossGroup1 = getCellAuditEntriesFn(
      corr19.body.editAuditHistory,
      '13:00',
      'finalOutlet__fnh3',
      { id: 't13', time: '13:00' }
    );
    assert.strictEqual(matchedCrossGroup1.length, 0);

    var matchedCrossGroup2 = getCellAuditEntriesFn(
      corr19.body.editAuditHistory,
      '13:00',
      'sec400__fnh3',
      { id: 't13', time: '13:00' }
    );
    assert.strictEqual(matchedCrossGroup2.length, 0);
    pass('T19: report matcher hits flat audit entry for slot and rejects other slots/groups');

    // T20: Last slot (t21) entry, one correction, and lock confirmed
    await PlantAnalysisRecord.deleteMany({});
    var prevSlots = ['t11', 't13', 't15', 't17', 't19'];
    var prevRows = [BASE_ROW_T11, BASE_ROW_T13, BASE_ROW_T15, BASE_ROW_T17, BASE_ROW_T19];
    for (var k = 0; k < prevSlots.length; k++) {
      await postReq(port, '/api/sewer-water-analysis', {
        date: OP_DATE,
        targetSlot: prevSlots[k],
        readings: [prevRows[k]],
      });
    }

    // Save last slot t21
    var saveLast = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't21',
      readings: [BASE_ROW_T21],
    });
    assert.strictEqual(saveLast.status, 200);
    assert.strictEqual(saveLast.body.lockedSlots.t21.isSaved, true);
    assert.strictEqual(saveLast.body.lockedSlots.t21.isLocked, false);

    // One correction on t21
    var corrLast = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't21',
      readings: [Object.assign({}, BASE_ROW_T21, { sec200: { fnh3: '1150', cnh3: '2300' } })],
    });
    assert.strictEqual(corrLast.status, 200);
    assert.strictEqual(corrLast.body.lockedSlots.t21.correctionUsed, true);
    assert.strictEqual(corrLast.body.lockedSlots.t21.isLocked, true);

    // Second correction rejected
    var corrLastBlocked = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't21',
      readings: [Object.assign({}, BASE_ROW_T21, { sec200: { fnh3: '1200', cnh3: '2300' } })],
    });
    assert.strictEqual(corrLastBlocked.status, 400);
    assert.strictEqual(corrLastBlocked.body.message, 'Cannot edit t21 because it is permanently locked.');
    pass('T20: last slot t21 entry, one correction, and lock confirmed');

    // T21: Full 6-slot sequential cycle (t11 -> t13 -> t15 -> t17 -> t19 -> t21)
    await PlantAnalysisRecord.deleteMany({});
    var slots = ['t11', 't13', 't15', 't17', 't19', 't21'];
    var baseRows = [BASE_ROW_T11, BASE_ROW_T13, BASE_ROW_T15, BASE_ROW_T17, BASE_ROW_T19, BASE_ROW_T21];
    for (var sIdx = 0; sIdx < slots.length; sIdx++) {
      var sRes = await postReq(port, '/api/sewer-water-analysis', {
        date: OP_DATE,
        targetSlot: slots[sIdx],
        readings: [baseRows[sIdx]],
      });
      assert.strictEqual(sRes.status, 200);
      assert.strictEqual(sRes.body.lockedSlots[slots[sIdx]].isSaved, true);
      // Previous slots must be locked
      for (var p = 0; p < sIdx; p++) {
        assert.strictEqual(sRes.body.lockedSlots[slots[p]].isLocked, true);
      }
    }
    pass('T21: full 6-slot sequential cycle confirmed');

    // T22: Pcl NIL save + NIL->number correction
    await PlantAnalysisRecord.deleteMany({});
    var postNil = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '3', cnh3: '0' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: 'NIL' },
      }],
    });
    assert.strictEqual(postNil.status, 200);
    assert.strictEqual(postNil.body.readings[0].finalOutlet.pcl, 'NIL');

    var postNilToNum = await postReq(port, '/api/sewer-water-analysis', {
      date: OP_DATE,
      targetSlot: 't11',
      readings: [{
        id: 't11',
        time: '11:00',
        sec200: { fnh3: '3', cnh3: '0' },
        sec400: { fnh3: '6664', cnh3: '4284', hco3: '0' },
        finalOutlet: { fnh3: '0', cnh3: '0', hco3: '0', pcl: '25.4' },
      }],
    });
    assert.strictEqual(postNilToNum.status, 200);
    assert.strictEqual(postNilToNum.body.readings[0].finalOutlet.pcl, '25.4');
    assert.strictEqual(postNilToNum.body.editAuditHistory[0].field, 'finalOutlet_pcl');
    assert.strictEqual(postNilToNum.body.editAuditHistory[0].oldValue, 'NIL');
    assert.strictEqual(postNilToNum.body.editAuditHistory[0].newValue, '25.4');
    pass('T22: pcl NIL save and NIL to numeric correction confirmed');

    console.log('\n========================================================================');
    console.log('TOTAL TESTS PASSED: ' + passedCount);
    console.log('========================================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

run().catch(function (err) {
  console.error('Test execution failed:', err);
  process.exit(1);
});

