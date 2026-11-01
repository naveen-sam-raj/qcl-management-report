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
var { createRouter: createDistillerWasteRouter } = require('../routes/distillerWasteAnalysisRoutes');
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

var BASE_ROW_T0630 = {
  id: 't0630',
  time: '06:30',
  exCao: '0.00',
  fnh3: '272',
  cnh3: '1190',
  tnh3: '1462',
  nahco3: '0',
};

var BASE_ROW_T0730 = {
  id: 't0730',
  time: '07:30',
  exCao: '0.00',
  fnh3: '340',
  cnh3: '1870',
  tnh3: '2210',
  nahco3: '0',
};

var BASE_ROW_T0830 = {
  id: 't0830',
  time: '08:30',
  exCao: '0.00',
  fnh3: '425',
  cnh3: '8330',
  tnh3: '8755',
  nahco3: '0',
};

var BASE_ROW_T0930 = {
  id: 't0930',
  time: '09:30',
  exCao: '0.00',
  fnh3: '510',
  cnh3: '4420',
  tnh3: '4930',
  nahco3: '0',
};

var BASE_ROW_T1030 = {
  id: 't1030',
  time: '10:30',
  exCao: '0.00',
  fnh3: '238',
  cnh3: '13090',
  tnh3: '13328',
  nahco3: '0',
};

var BASE_ROW_T1130 = {
  id: 't1130',
  time: '11:30',
  exCao: '0.00',
  fnh3: '442',
  cnh3: '21250',
  tnh3: '21692',
  nahco3: '0',
};

async function run() {
  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  var fakeNow = istDate(2026, 10, 28, 10, 0); // 10:00 IST on 2026-10-28
  var OP_DATE = getOperatingDateIST(fakeNow); // '2026-10-28'

  var app = express();
  app.use(express.json());
  app.use('/api/distiller-waste-analysis', createDistillerWasteRouter({
    getNow: function () { return fakeNow; },
  }));

  var server = http.createServer(app);
  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });
  var port = server.address().port;

  try {
    // T1: Fresh date allows only first slot (t0630)
    var get1 = await getReq(port, '/api/distiller-waste-analysis?date=' + OP_DATE);
    assert.strictEqual(get1.status, 200);
    assert.strictEqual(get1.body.data, null);
    pass('T1: fresh date returns 200 with data: null');

    // T7: Empty first save returns 400 with exact engine message
    var emptyRes = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [{ id: 't0630', time: '06:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' }],
    });
    assert.strictEqual(emptyRes.status, 400);
    assert.strictEqual(emptyRes.body.message, 'Cannot save empty slot t0630. At least one non-empty value is required.');
    pass('T7: empty slot first save rejected with 400');

    // T2: First save of t0630 unlocks t0730
    var post1 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [BASE_ROW_T0630],
    });
    assert.strictEqual(post1.status, 200);
    assert.strictEqual(post1.body.lockedSlots.t0630.isSaved, true);
    assert.strictEqual(post1.body.lockedSlots.t0630.isLocked, false);
    assert.strictEqual(post1.body.lockedSlots.t0630.correctionUsed, false);
    assert.strictEqual(post1.body.lockedSlots.t0730.isSaved, false);
    assert.strictEqual(post1.body.lockedSlots.t0730.isLocked, false);
    pass('T2: first save of t0630 succeeds and opens t0730');

    // T6: Identical re-save returns 200 noChange: true
    var noChangeRes = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [BASE_ROW_T0630],
    });
    assert.strictEqual(noChangeRes.status, 200);
    assert.strictEqual(noChangeRes.body.noChange, true);
    assert.strictEqual(noChangeRes.body.message, 'No changes');
    pass('T6: identical re-save returns 200 { noChange: true }');

    // T4: Correction of active slot (1 correction permitted)
    var corr1 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [Object.assign({}, BASE_ROW_T0630, { fnh3: '280' })],
    });
    assert.strictEqual(corr1.status, 200);
    assert.strictEqual(corr1.body.lockedSlots.t0630.isSaved, true);
    assert.strictEqual(corr1.body.lockedSlots.t0630.isLocked, true);
    assert.strictEqual(corr1.body.lockedSlots.t0630.correctionUsed, true);
    assert.strictEqual(corr1.body.editAuditHistory.length, 1);
    assert.strictEqual(corr1.body.editAuditHistory[0].field, 'fnh3');
    assert.strictEqual(corr1.body.editAuditHistory[0].oldValue, '272');
    assert.strictEqual(corr1.body.editAuditHistory[0].newValue, '280');
    assert.strictEqual(corr1.body.editAuditHistory[0].rowId, 't0630');
    assert.strictEqual(corr1.body.editAuditHistory[0].time, '06:30');
    pass('T4: valid correction succeeds and sets correctionUsed: true');

    // T5: Second correction attempt on active slot is rejected (400)
    var corr2 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [Object.assign({}, BASE_ROW_T0630, { fnh3: '290' })],
    });
    assert.strictEqual(corr2.status, 400);
    assert.ok(corr2.body.message.includes('locked'));
    pass('T5: second correction attempt rejected with 400');

    // T2b: Second slot save (t0730) when t0630 is saved succeeds
    var post2 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0730',
      readings: [BASE_ROW_T0730],
    });
    assert.strictEqual(post2.status, 200);
    assert.strictEqual(post2.body.lockedSlots.t0730.isSaved, true);
    assert.strictEqual(post2.body.lockedSlots.t0730.isLocked, false);
    assert.strictEqual(post2.body.lockedSlots.t0730.correctionUsed, false);
    pass('T2b: save of t0730 succeeds');

    // T3: Saving t0830 locks t0730 permanently (even without prior correction)
    var post3 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0830',
      readings: [BASE_ROW_T0830],
    });
    assert.strictEqual(post3.status, 200);
    assert.strictEqual(post3.body.lockedSlots.t0630.isLocked, true);
    assert.strictEqual(post3.body.lockedSlots.t0730.isLocked, true);
    assert.strictEqual(post3.body.lockedSlots.t0830.isSaved, true);
    assert.strictEqual(post3.body.lockedSlots.t0830.isLocked, false);
    pass('T3: sequential save of t0830 permanently locks t0730');

    // T23: Correction clearing all values returns 400 with engine message
    var clearCorr = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0830',
      readings: [{ id: 't0830', time: '08:30', exCao: '', fnh3: '', cnh3: '', tnh3: '', nahco3: '' }],
    });
    assert.strictEqual(clearCorr.status, 400);
    assert.strictEqual(clearCorr.body.message, 'A correction cannot clear all values in t0830. At least one non-empty value is required.');
    pass('T23: correction clearing all values rejected with 400');

    // T9: Out-of-order save attempt returns 400
    var outOfOrder = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't1130',
      readings: [BASE_ROW_T1130],
    });
    assert.strictEqual(outOfOrder.status, 400);
    assert.strictEqual(outOfOrder.body.message, 'Sequential restriction: t0930 must be completed and saved before proceeding to t1130.');
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

    var p1 = postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0830',
      readings: [Object.assign({}, BASE_ROW_T0830, { fnh3: '430' })],
    });
    var p2 = postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0830',
      readings: [Object.assign({}, BASE_ROW_T0830, { fnh3: '435' })],
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
    var b559 = await postReq(port, '/api/distiller-waste-analysis', {
      date: '2026-10-28',
      targetSlot: 't0630',
      readings: [BASE_ROW_T0630],
    });
    assert.strictEqual(b559.status, 200);

    fakeNow = istDate(2026, 10, 29, 6, 1); // 06:01 on Oct 29 IST belongs to 2026-10-29
    assert.strictEqual(getOperatingDateIST(fakeNow), '2026-10-29');
    var b601Past = await postReq(port, '/api/distiller-waste-analysis', {
      date: '2026-10-28',
      targetSlot: 't0730',
      readings: [BASE_ROW_T0730],
    });
    assert.strictEqual(b601Past.status, 400);
    assert.ok(b601Past.body.message.includes('Date restriction enforced'));
    pass('T10: 06:00-06:00 IST operating day boundary strictly enforced');

    // T10b: Client date spoofing (past AND future) strictly ignored -> 400
    fakeNow = istDate(2026, 10, 28, 11, 0);
    // Past date spoof
    var pastSpoof = await postReq(port, '/api/distiller-waste-analysis', {
      date: '2026-10-27',
      now: '2026-10-27T10:00:00.000Z',
      payload: { now: '2026-10-27T10:00:00.000Z' },
      body: { now: '2026-10-27T10:00:00.000Z' },
      readings: [BASE_ROW_T0630],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(pastSpoof.status, 400);
    assert.ok(pastSpoof.body.message.includes('Date restriction enforced'));

    // Future date spoof
    var futureSpoof = await postReq(port, '/api/distiller-waste-analysis', {
      date: '2026-10-29',
      now: '2026-10-29T10:00:00.000Z',
      payload: { now: '2026-10-29T10:00:00.000Z' },
      body: { now: '2026-10-29T10:00:00.000Z' },
      readings: [BASE_ROW_T0630],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(futureSpoof.status, 400);
    assert.ok(futureSpoof.body.message.includes('Date restriction enforced'));
    pass('T10b: client date spoofing (past and future) strictly ignored -> 400');

    // T11: Role user returns 403 on GET and POST
    fakeNow = istDate(2026, 10, 28, 12, 0);
    var get403 = await getReq(port, '/api/distiller-waste-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(get403.status, 403);
    assert.strictEqual(get403.body.message, 'Forbidden: Distiller Waste Analysis data access is restricted to authorized Admins.');

    var post403 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [BASE_ROW_T0630],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(post403.status, 403);
    assert.strictEqual(post403.body.message, 'Forbidden: Distiller Waste Analysis data entry and modification is restricted to authorized Admins.');
    pass('T11: role user returns 403 on GET and POST');

    // T12: Admin override attempts rejected (no admin override)
    fakeNow = istDate(2026, 10, 28, 12, 0);
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [BASE_ROW_T0630],
    });
    await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [Object.assign({}, BASE_ROW_T0630, { fnh3: '280' })],
    });
    // Now t0630 is locked
    var adminOverride = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      override: true,
      isAdminOverride: true,
      force: true,
      readings: [Object.assign({}, BASE_ROW_T0630, { fnh3: '290' })],
    });
    assert.strictEqual(adminOverride.status, 400);
    assert.ok(adminOverride.body.message.includes('locked'));
    pass('T12: admin override attempts rejected (no admin override)');

    // T12b: payload.now, body.now and x-test headers strictly ignored -> 400
    var t12bRes = await postReq(port, '/api/distiller-waste-analysis', {
      date: '2026-10-27',
      now: '2026-10-27T12:00:00.000Z',
      body: { now: '2026-10-27T12:00:00.000Z' },
      payload: { now: '2026-10-27T12:00:00.000Z' },
      readings: [BASE_ROW_T0630],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(t12bRes.status, 400);
    assert.ok(t12bRes.body.message.includes('Date restriction enforced'));
    pass('T12b: payload.now, body.now and x-test headers strictly ignored -> 400');

    // T13: Stored shape data.readings preserved with visual order and all 5 fields
    await PlantAnalysisRecord.deleteMany({});
    var save13 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [BASE_ROW_T0630],
    });
    assert.strictEqual(save13.status, 200);

    var doc13 = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert.ok(doc13.data.readings);
    assert.strictEqual(doc13.data.readings.length, 6);
    assert.strictEqual(doc13.data.readings[0].id, 't0630');
    assert.strictEqual(doc13.data.readings[0].time, '06:30');
    assert.strictEqual(doc13.data.readings[0].fnh3, '272');
    assert.strictEqual(doc13.data.readings[5].id, 't1130');
    assert.strictEqual(doc13.data.readings[5].time, '11:30');
    pass('T13: stored shape data.readings preserved with visual order and all 5 fields');

    // T14: Legacy document lock derivation
    await PlantAnalysisRecord.deleteMany({});
    // Legacy doc with initialSaved: true, editCount: 1 on t0630 without lockedSlots container
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Distiller Waste Analysis',
      unit: 'Distiller waste',
      date: OP_DATE,
      data: {
        readings: [
          BASE_ROW_T0630,
          BASE_ROW_T0730,
        ],
        lockedSlots: {
          t0630: { initialSaved: true, editCount: 1, isLocked: true },
          t0730: { initialSaved: true, editCount: 0, isLocked: false },
        },
      },
    });

    var t14Get = await getReq(port, '/api/distiller-waste-analysis?date=' + OP_DATE);
    assert.strictEqual(t14Get.status, 200);
    assert.strictEqual(t14Get.body.lockedSlots.t0630.isSaved, true);
    assert.strictEqual(t14Get.body.lockedSlots.t0630.isLocked, true);
    assert.strictEqual(t14Get.body.lockedSlots.t0730.isSaved, true);
    assert.strictEqual(t14Get.body.lockedSlots.t0730.isLocked, false);
    pass('T14: legacy document lock derivation maps correctly');

    // T15: Duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST
    await PlantAnalysisRecord.deleteMany({});
    var olderDoc = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Distiller Waste Analysis',
      unit: 'Distiller waste',
      date: OP_DATE,
      savedAt: new Date(Date.now() - 50000),
      data: {
        readings: [Object.assign({}, BASE_ROW_T0630, { fnh3: '100' })],
        lockedSlots: { t0630: { isSaved: true, isLocked: true, correctionUsed: true } },
      },
    });
    var newerDoc = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Distiller Waste Analysis',
      unit: 'Distiller waste',
      date: OP_DATE,
      savedAt: new Date(),
      data: {
        readings: [Object.assign({}, BASE_ROW_T0630, { fnh3: '200' })],
        lockedSlots: { t0630: { isSaved: true, isLocked: true, correctionUsed: true } },
      },
    });

    var t15Get = await getReq(port, '/api/distiller-waste-analysis?date=' + OP_DATE);
    assert.strictEqual(t15Get.status, 200);
    assert.strictEqual(t15Get.body.readings[0].fnh3, '200');
    assert.strictEqual(String(t15Get.body.recordId), String(newerDoc._id));
    pass('T15: pickCanonicalDoc returns latest canonical document on GET and POST');

    // T16: Multi-slot POST rejected (one POST = one slot target)
    var multiSlot = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      readings: [
        Object.assign({}, BASE_ROW_T0730, { fnh3: '350' }),
        Object.assign({}, BASE_ROW_T0830, { fnh3: '450' }),
      ],
    });
    assert.strictEqual(multiSlot.status, 400);
    assert.strictEqual(multiSlot.body.message, 'Only one slot can be saved per submission.');
    pass('T16: multi-slot POST rejected with 400');

    // T17: Decimal precision preserved as trimmed string (no Number coercion)
    await PlantAnalysisRecord.deleteMany({});
    var postDec = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [Object.assign({}, BASE_ROW_T0630, { exCao: ' 11.0 ' })],
    });
    assert.strictEqual(postDec.status, 200);
    assert.strictEqual(postDec.body.readings[0].exCao, '11.0');

    // Verify GET also returns trimmed '11.0'
    var getDec = await getReq(port, '/api/distiller-waste-analysis?date=' + OP_DATE);
    assert.strictEqual(getDec.status, 200);
    assert.strictEqual(getDec.body.readings[0].exCao, '11.0');

    // Re-save '11' after '11.0' should count as noChange because isValueDifferent evaluates them equal numerically
    var reSave11 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [Object.assign({}, BASE_ROW_T0630, { exCao: '11' })],
    });
    assert.strictEqual(reSave11.status, 200);
    assert.strictEqual(reSave11.body.noChange, true);
    assert.strictEqual(reSave11.body.message, 'No changes');
    pass('T17: decimal string preserved as trimmed string without Number coercion');

    // T18: Payload time metadata ignored by server and stored strictly as canonical slot time
    var timeSpoof = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0730',
      readings: [Object.assign({}, BASE_ROW_T0730, { time: '99:99' })],
    });
    assert.strictEqual(timeSpoof.status, 200);
    assert.strictEqual(timeSpoof.body.readings[1].time, '07:30');
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

    var corr19 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0730',
      readings: [Object.assign({}, BASE_ROW_T0730, { fnh3: '388' })],
    });
    assert.strictEqual(corr19.status, 200);
    assert.strictEqual(corr19.body.editAuditHistory.length, 1);

    // Positive matcher: rowKey '07:30', colKey 'fnh3', dataObj for t0730
    var matchedPositive = getCellAuditEntriesFn(
      corr19.body.editAuditHistory,
      '07:30',
      'fnh3',
      { id: 't0730', time: '07:30', fnh3: '388' }
    );
    assert.strictEqual(matchedPositive.length, 1);
    assert.strictEqual(matchedPositive[0].oldValue, '340');
    assert.strictEqual(matchedPositive[0].newValue, '388');

    // Negative matcher: same audit entry against rowKey '06:30' / dataObj t0630 -> 0 matches
    var matchedNegative = getCellAuditEntriesFn(
      corr19.body.editAuditHistory,
      '06:30',
      'fnh3',
      { id: 't0630', time: '06:30', fnh3: '272' }
    );
    assert.strictEqual(matchedNegative.length, 0);
    pass('T19: report matcher hits flat audit entry for slot and rejects other slots');

    // T20: Last slot (t1130) entry, one correction, and lock
    await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0830',
      readings: [BASE_ROW_T0830],
    });
    await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0930',
      readings: [BASE_ROW_T0930],
    });
    await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't1030',
      readings: [BASE_ROW_T1030],
    });
    var saveLast = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't1130',
      readings: [BASE_ROW_T1130],
    });
    assert.strictEqual(saveLast.status, 200);
    assert.strictEqual(saveLast.body.lockedSlots.t1130.isSaved, true);
    assert.strictEqual(saveLast.body.lockedSlots.t1130.isLocked, false);
    assert.strictEqual(saveLast.body.lockedSlots.t1130.correctionUsed, false);

    var corrLast = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't1130',
      readings: [Object.assign({}, BASE_ROW_T1130, { fnh3: '450' })],
    });
    assert.strictEqual(corrLast.status, 200);
    assert.strictEqual(corrLast.body.lockedSlots.t1130.isSaved, true);
    assert.strictEqual(corrLast.body.lockedSlots.t1130.isLocked, true);
    assert.strictEqual(corrLast.body.lockedSlots.t1130.correctionUsed, true);

    var corrLastBlocked = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't1130',
      readings: [Object.assign({}, BASE_ROW_T1130, { fnh3: '460' })],
    });
    assert.strictEqual(corrLastBlocked.status, 400);
    assert.ok(corrLastBlocked.body.message.includes('locked'));
    pass('T20: last slot t1130 entry, one correction, and lock verified');

    // T21: Full 6-slot sequential cycle (t0630 -> t0730 -> t0830 -> t0930 -> t1030 -> t1130)
    await PlantAnalysisRecord.deleteMany({});
    var slots = ['t0630', 't0730', 't0830', 't0930', 't1030', 't1130'];
    var baseRows = [BASE_ROW_T0630, BASE_ROW_T0730, BASE_ROW_T0830, BASE_ROW_T0930, BASE_ROW_T1030, BASE_ROW_T1130];
    for (var sIdx = 0; sIdx < slots.length; sIdx++) {
      var sRes = await postReq(port, '/api/distiller-waste-analysis', {
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
    pass('T21: full 6-slot sequential cycle verified');

    // T22: Server does not auto-mutate TNH3 (stores what client posts)
    await PlantAnalysisRecord.deleteMany({});
    var postCustomTnh3 = await postReq(port, '/api/distiller-waste-analysis', {
      date: OP_DATE,
      targetSlot: 't0630',
      readings: [{
        id: 't0630',
        time: '06:30',
        exCao: '0.00',
        fnh3: '100',
        cnh3: '200',
        tnh3: '999', // explicitly different from fnh3 + cnh3
        nahco3: '0',
      }],
    });
    assert.strictEqual(postCustomTnh3.status, 200);
    assert.strictEqual(postCustomTnh3.body.readings[0].tnh3, '999');
    pass('T22: server does not mutate TNH3 and preserves client value');

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
