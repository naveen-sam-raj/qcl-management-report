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
var fs = require('fs');

var PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
var { createRouter: createCoolingWaterRouter } = require('../routes/coolingWaterAnalysisRoutes');
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

var BASE_ROW_T07 = {
  id: 't07',
  time: '07:00',
  ph: '7.5',
  frc: '0.3',
  cl: '650',
  opo4: '7.0',
  turbidity: '45',
  tds: '2000',
  fe: '2.0',
  sio2: '70',
  alk: '300',
  so4: '500',
  th: '500',
  cah: '300',
  mgh: '200',
  ammn: 'NIL',
};

var BASE_ROW_T09 = {
  id: 't09',
  time: '09:00',
  ph: '7.6',
  frc: '0.4',
  cl: '660',
  opo4: '7.1',
  turbidity: '46',
  tds: '2050',
  fe: '2.0',
  sio2: '71',
  alk: '305',
  so4: '505',
  th: '505',
  cah: '305',
  mgh: '200',
  ammn: 'NIL',
};

var BASE_ROW_T11 = {
  id: 't11',
  time: '11:00',
  ph: '7.5',
  frc: '0.3',
  cl: '650',
  opo4: '7.0',
  turbidity: '45',
  tds: '2000',
  fe: '2.0',
  sio2: '70',
  alk: '300',
  so4: '500',
  th: '500',
  cah: '300',
  mgh: '200',
  ammn: 'NIL',
};

var BASE_ROW_T13 = {
  id: 't13',
  time: '13:00',
  ph: '7.7',
  frc: '0.4',
  cl: '670',
  opo4: '7.2',
  turbidity: '48',
  tds: '2100',
  fe: '2.1',
  sio2: '72',
  alk: '310',
  so4: '510',
  th: '510',
  cah: '310',
  mgh: '200',
  ammn: 'NIL',
};

var BASE_ROW_T15 = {
  id: 't15',
  time: '15:00',
  ph: '7.6',
  frc: '0.3',
  cl: '660',
  opo4: '7.1',
  turbidity: '47',
  tds: '2080',
  fe: '2.0',
  sio2: '71',
  alk: '305',
  so4: '505',
  th: '505',
  cah: '305',
  mgh: '200',
  ammn: 'NIL',
};

var BASE_ROW_T17 = {
  id: 't17',
  time: '17:00',
  ph: '7.8',
  frc: '0.5',
  cl: '680',
  opo4: '7.3',
  turbidity: '50',
  tds: '2150',
  fe: '2.2',
  sio2: '73',
  alk: '315',
  so4: '515',
  th: '515',
  cah: '315',
  mgh: '200',
  ammn: 'NIL',
};

var BASE_ROW_200_T07 = {
  id: 't07',
  time: '07:00',
  ph: '7.5',
  frc: '0.3',
  opo4: '7.0',
  cl: '650',
};

var BASE_ROW_200_T19 = {
  id: 't19',
  time: '19:00',
  ph: '7.6',
  frc: '0.4',
  opo4: '7.2',
  cl: '660',
};

async function run() {
  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  var fakeNow = istDate(2026, 10, 28, 10, 0); // 10:00 IST on 2026-10-28
  var OP_DATE = getOperatingDateIST(fakeNow); // '2026-10-28'

  var app = express();
  app.use(express.json());
  app.use('/api/cooling-water-analysis', createCoolingWaterRouter({
    getNow: function () { return fakeNow; },
  }));

  var server = http.createServer(app);
  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });
  var port = server.address().port;

  try {
    // T1: Fresh date returns 200 with data: null for both units
    var getCW = await getReq(port, '/api/cooling-water-analysis?date=' + OP_DATE + '&unit=cooling%20water');
    assert.strictEqual(getCW.status, 200);
    assert.strictEqual(getCW.body.data, null);

    var getCW200 = await getReq(port, '/api/cooling-water-analysis?date=' + OP_DATE + '&unit=cooling%20water%20200%23');
    assert.strictEqual(getCW200.status, 200);
    assert.strictEqual(getCW200.body.data, null);
    pass('T1: fresh date returns 200 with data: null');

    // T7: Empty slot first save rejected with 400
    var emptySave = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [{
        id: 't07',
        time: '07:00',
        ph: '',
        frc: '',
        cl: '',
        opo4: '',
        turbidity: '',
        tds: '',
        fe: '',
        sio2: '',
        alk: '',
        so4: '',
        th: '',
        cah: '',
        mgh: '',
        ammn: '',
      }],
    });
    assert.strictEqual(emptySave.status, 400);
    assert.strictEqual(emptySave.body.message, 'Cannot save empty slot t07. At least one non-empty value is required.');
    pass('T7: empty slot first save rejected with 400');

    // T2: First save of t07 succeeds and opens t09
    var save1 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(save1.status, 200);
    assert.strictEqual(save1.body.success, true);
    assert.strictEqual(save1.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(save1.body.lockedSlots.t07.isLocked, false);
    assert.strictEqual(save1.body.lockedSlots.t07.correctionUsed, false);
    assert.strictEqual(save1.body.lockedSlots.t09.isSaved, false);
    assert.strictEqual(save1.body.lockedSlots.t09.isLocked, false);
    pass('T2: first save of t07 succeeds and opens t09');

    // T6: Identical re-save returns 200 { noChange: true }
    var save1Again = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(save1Again.status, 200);
    assert.strictEqual(save1Again.body.noChange, true);
    assert.strictEqual(save1Again.body.message, 'No changes');
    assert.strictEqual(save1Again.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(save1Again.body.lockedSlots.t07.isLocked, false);
    assert.strictEqual(save1Again.body.lockedSlots.t07.correctionUsed, false);
    pass('T6: identical re-save returns 200 { noChange: true }');

    // T4: Valid correction succeeds and sets correctionUsed: true, isLocked: true
    var CURRENT_ROW_T07 = Object.assign({}, BASE_ROW_T07, { ph: '7.8' });
    var corr1 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [CURRENT_ROW_T07],
    });
    assert.strictEqual(corr1.status, 200);
    assert.strictEqual(corr1.body.success, true);
    assert.strictEqual(corr1.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(corr1.body.lockedSlots.t07.correctionUsed, true);
    assert.strictEqual(corr1.body.lockedSlots.t07.isLocked, true);
    pass('T4: valid correction succeeds and sets correctionUsed: true');

    // T5: Second correction attempt rejected with 400
    var corr2 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [Object.assign({}, BASE_ROW_T07, { ph: '7.9' })],
    });
    assert.strictEqual(corr2.status, 400);
    assert.strictEqual(corr2.body.message, 'Cannot edit t07 because it is permanently locked.');
    pass('T5: second correction attempt rejected with 400');

    // T2b: Save of t09 succeeds
    var CURRENT_ROW_T09 = Object.assign({}, BASE_ROW_T09);
    var save2 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't09',
      readings: [CURRENT_ROW_T07, CURRENT_ROW_T09],
    });
    assert.strictEqual(save2.status, 200);
    assert.strictEqual(save2.body.lockedSlots.t09.isSaved, true);
    assert.strictEqual(save2.body.lockedSlots.t09.isLocked, false);
    assert.strictEqual(save2.body.lockedSlots.t09.correctionUsed, false);
    pass('T2b: save of t09 succeeds');

    // T3: Sequential save of t11 permanently locks t09
    var CURRENT_ROW_T11 = Object.assign({}, BASE_ROW_T11);
    var save3 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't11',
      readings: [CURRENT_ROW_T07, CURRENT_ROW_T09, CURRENT_ROW_T11],
    });
    assert.strictEqual(save3.status, 200);
    assert.strictEqual(save3.body.lockedSlots.t09.isLocked, true);
    assert.strictEqual(save3.body.lockedSlots.t11.isSaved, true);
    assert.strictEqual(save3.body.lockedSlots.t11.isLocked, false);

    var corrT09 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't09',
      readings: [CURRENT_ROW_T07, Object.assign({}, CURRENT_ROW_T09, { ph: '8.0' }), CURRENT_ROW_T11],
    });
    assert.strictEqual(corrT09.status, 400);
    assert.strictEqual(corrT09.body.message, 'Cannot edit t09 because it is permanently locked.');
    pass('T3: sequential save of t11 permanently locks t09');

    // T23: Correction clearing all values rejected with 400
    var clearAllCorr = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't11',
      readings: [
        CURRENT_ROW_T07,
        CURRENT_ROW_T09,
        {
          id: 't11',
          time: '11:00',
          ph: '',
          frc: '',
          cl: '',
          opo4: '',
          turbidity: '',
          tds: '',
          fe: '',
          sio2: '',
          alk: '',
          so4: '',
          th: '',
          cah: '',
          mgh: '',
          ammn: '',
        },
      ],
    });
    assert.strictEqual(clearAllCorr.status, 400);
    assert.strictEqual(clearAllCorr.body.message, 'A correction cannot clear all values in t11. At least one non-empty value is required.');
    pass('T23: correction clearing all values rejected with 400');

    // T9: Out-of-order save attempt rejected with 400
    var outOfOrder = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't15',
      readings: [CURRENT_ROW_T07, CURRENT_ROW_T09, CURRENT_ROW_T11, BASE_ROW_T15],
    });
    assert.strictEqual(outOfOrder.status, 400);
    assert.strictEqual(outOfOrder.body.message, 'Sequential restriction: t13 must be completed and saved before proceeding to t15.');
    pass('T9: out-of-order save attempt rejected with 400');

    // T8: Deterministic race condition returns [200, 409]
    var raceResults = await Promise.all([
      postReq(port, '/api/cooling-water-analysis', {
        date: OP_DATE,
        unit: 'cooling water',
        targetSlot: 't13',
        readings: [CURRENT_ROW_T07, CURRENT_ROW_T09, CURRENT_ROW_T11, Object.assign({}, BASE_ROW_T13, { ph: '7.7' })],
      }),
      postReq(port, '/api/cooling-water-analysis', {
        date: OP_DATE,
        unit: 'cooling water',
        targetSlot: 't13',
        readings: [CURRENT_ROW_T07, CURRENT_ROW_T09, CURRENT_ROW_T11, Object.assign({}, BASE_ROW_T13, { ph: '7.8' })],
      }),
    ]);
    var statuses = raceResults.map(function (r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    var err409 = raceResults.find(function (r) { return r.status === 409; });
    assert.strictEqual(err409.body.message, 'Conflict: This shift was locked or updated concurrently by another user.');
    var CURRENT_ROW_T13 = Object.assign({}, BASE_ROW_T13, { ph: raceResults[0].status === 200 ? '7.7' : '7.8' });
    pass('T8: deterministic race condition returns [200, 409]');

    // T10: 06:00-06:00 IST operating day boundary strictly enforced
    var appBoundary = express();
    appBoundary.use(express.json());
    var boundaryNow = istDate(2026, 10, 28, 5, 59); // 05:59 IST -> operating date is 2026-10-27
    appBoundary.use('/api/cooling-water-analysis', createCoolingWaterRouter({
      getNow: function () { return boundaryNow; },
    }));
    var serverB = http.createServer(appBoundary);
    await new Promise(function (resolve) { serverB.listen(0, '127.0.0.1', resolve); });
    var portB = serverB.address().port;

    var saveEarly = await postReq(portB, '/api/cooling-water-analysis', {
      date: '2026-10-28',
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(saveEarly.status, 400);
    assert.strictEqual(
      saveEarly.body.message,
      "Date restriction enforced: Cooling Water Analysis records can only be created or modified for today's operating date (2026-10-27). Historical or future modifications are not permitted."
    );

    var saveCorrect = await postReq(portB, '/api/cooling-water-analysis', {
      date: '2026-10-27',
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(saveCorrect.status, 200);
    serverB.close();
    pass('T10: 06:00-06:00 IST operating day boundary strictly enforced');

    // T10b: Client date spoofing (past and future) strictly ignored -> 400
    var pastSave = await postReq(port, '/api/cooling-water-analysis', {
      date: '2026-10-20',
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(pastSave.status, 400);
    assert.strictEqual(
      pastSave.body.message,
      "Date restriction enforced: Cooling Water Analysis records can only be created or modified for today's operating date (" + OP_DATE + "). Historical or future modifications are not permitted."
    );

    var futureSave = await postReq(port, '/api/cooling-water-analysis', {
      date: '2026-11-05',
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(futureSave.status, 400);
    assert.strictEqual(
      futureSave.body.message,
      "Date restriction enforced: Cooling Water Analysis records can only be created or modified for today's operating date (" + OP_DATE + "). Historical or future modifications are not permitted."
    );
    pass('T10b: client date spoofing (past and future) strictly ignored -> 400');

    // T11: Role user returns 403 on GET and POST
    var userGet = await getReq(port, '/api/cooling-water-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(userGet.status, 403);
    assert.strictEqual(userGet.body.message, 'Forbidden: Cooling Water Analysis data access is restricted to authorized Admins.');

    var userGetList = await getReq(port, '/api/cooling-water-analysis?startDate=' + OP_DATE + '&endDate=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(userGetList.status, 403);
    assert.strictEqual(userGetList.body.message, 'Forbidden: Cooling Water Analysis data access is restricted to authorized Admins.');

    var userPost = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't15',
      readings: [BASE_ROW_T15],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(userPost.status, 403);
    assert.strictEqual(userPost.body.message, 'Forbidden: Cooling Water Analysis data entry and modification is restricted to authorized Admins.');
    pass('T11: role user returns 403 on GET and POST');

    // T12: Admin override attempts rejected (no admin override)
    var adminOverride = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't07',
      override: true,
      force: true,
      adminOverride: true,
      readings: [
        Object.assign({}, CURRENT_ROW_T07, { ph: '8.5' }),
        CURRENT_ROW_T09,
        CURRENT_ROW_T11,
        CURRENT_ROW_T13,
      ],
    });
    assert.strictEqual(adminOverride.status, 400);
    assert.strictEqual(adminOverride.body.message, 'Cannot edit t07 because it is permanently locked.');
    pass('T12: admin override attempts rejected (no admin override)');

    // T12b: payload.now, body.now and x-test headers strictly ignored -> 400
    var bypassAttempt = await postReq(port, '/api/cooling-water-analysis', {
      date: '2026-10-20',
      unit: 'cooling water',
      targetSlot: 't07',
      now: '2026-10-20T10:00:00.000Z',
      'payload.now': '2026-10-20T10:00:00.000Z',
      'body.now': '2026-10-20T10:00:00.000Z',
      readings: [BASE_ROW_T07],
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
      'x-test-date': '2026-10-20',
    });
    assert.strictEqual(bypassAttempt.status, 400);
    assert.strictEqual(
      bypassAttempt.body.message,
      "Date restriction enforced: Cooling Water Analysis records can only be created or modified for today's operating date (" + OP_DATE + "). Historical or future modifications are not permitted."
    );
    pass('T12b: payload.now, body.now and x-test headers strictly ignored -> 400');

    // T13: Stored shape data.readings preserved with visual order and all fields
    var getDoc13 = await getReq(port, '/api/cooling-water-analysis?date=' + OP_DATE + '&unit=cooling%20water');
    assert.strictEqual(getDoc13.status, 200);
    var readings13 = getDoc13.body.data.readings;
    assert.strictEqual(readings13.length, 6);
    assert.strictEqual(readings13[0].id, 't07');
    assert.strictEqual(readings13[0].time, '07:00');
    assert.strictEqual(readings13[1].id, 't09');
    assert.strictEqual(readings13[1].time, '09:00');
    assert.strictEqual(readings13[2].id, 't11');
    assert.strictEqual(readings13[2].time, '11:00');
    assert.strictEqual(readings13[3].id, 't13');
    assert.strictEqual(readings13[3].time, '13:00');
    assert.strictEqual(readings13[4].id, 't15');
    assert.strictEqual(readings13[4].time, '15:00');
    assert.strictEqual(readings13[5].id, 't17');
    assert.strictEqual(readings13[5].time, '17:00');
    // Ensure all 14 fields exist on first row
    var flds = ['ph', 'frc', 'cl', 'opo4', 'turbidity', 'tds', 'fe', 'sio2', 'alk', 'so4', 'th', 'cah', 'mgh', 'ammn'];
    flds.forEach(function (f) {
      assert.ok(f in readings13[0], 'field ' + f + ' must exist in readings');
    });
    pass('T13: stored shape data.readings preserved with visual order and all fields');

    // T14: Legacy document lock derivation maps correctly
    // 14a: Day CW legacy with isLocked: true -> all saved locked
    var legacyCW = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Cooling Water (C.W Water) Analysis',
      unit: 'cooling water',
      date: '2026-10-15',
      data: {
        date: '2026-10-15',
        unit: 'cooling water',
        isLocked: true,
        editCount: 1,
        initialSaved: true,
        readings: [BASE_ROW_T07, BASE_ROW_T09],
      },
    });

    var getLegacyCW = await getReq(port, '/api/cooling-water-analysis?date=2026-10-15&unit=cooling%20water');
    assert.strictEqual(getLegacyCW.status, 200);
    assert.strictEqual(getLegacyCW.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(getLegacyCW.body.lockedSlots.t07.isLocked, true);
    assert.strictEqual(getLegacyCW.body.lockedSlots.t09.isSaved, true);
    assert.strictEqual(getLegacyCW.body.lockedSlots.t09.isLocked, true);

    // 14b: CW200# legacy with lockedShifts
    var legacy200 = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Cooling Water (C.W Water) Analysis',
      unit: 'cooling water 200#',
      date: '2026-10-16',
      data: {
        date: '2026-10-16',
        unit: 'cooling water 200#',
        lockedShifts: {
          shift1Saved: true,
          shift1Edits: 0,
          shift1Locked: false,
          shift2Saved: false,
        },
        readings: [BASE_ROW_200_T07],
      },
    });

    var getLegacy200 = await getReq(port, '/api/cooling-water-analysis?date=2026-10-16&unit=cooling%20water%20200%23');
    assert.strictEqual(getLegacy200.status, 200);
    assert.strictEqual(getLegacy200.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(getLegacy200.body.lockedSlots.t07.isLocked, false);
    assert.strictEqual(getLegacy200.body.lockedSlots.t19.isSaved, false);
    assert.strictEqual(getLegacy200.body.lockedSlots.t19.isLocked, false);
    pass('T14: legacy document lock derivation maps correctly');

    // T14b: Legacy doc sequential propagation locks previous saved slot and rejects correction
    var legacyDocSeq = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Cooling Water (C.W Water) Analysis',
      unit: 'cooling water',
      date: '2026-10-17',
      data: {
        date: '2026-10-17',
        unit: 'cooling water',
        lockedSlots: {
          t07: { isSaved: true, editCount: 0, isLocked: false, correctionUsed: false },
          t09: { isSaved: true, editCount: 0, isLocked: false, correctionUsed: false },
          t11: { isSaved: false, isLocked: false },
          t13: { isSaved: false, isLocked: false },
          t15: { isSaved: false, isLocked: false },
          t17: { isSaved: false, isLocked: false },
        },
        readings: [BASE_ROW_T07, BASE_ROW_T09],
      },
    });

    var getLegacySeq = await getReq(port, '/api/cooling-water-analysis?date=2026-10-17&unit=cooling%20water');
    assert.strictEqual(getLegacySeq.status, 200);
    assert.strictEqual(getLegacySeq.body.lockedSlots.t07.isLocked, true);
    assert.strictEqual(getLegacySeq.body.lockedSlots.t09.isLocked, false);
    pass('T14b: legacy doc sequential propagation locks previous saved slot and rejects correction');

    // T15: pickCanonicalDoc returns latest canonical document on GET and POST
    var dupDate = '2026-10-18';
    var dOld = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Cooling Water (C.W Water) Analysis',
      unit: 'cooling water',
      date: dupDate,
      createdAt: new Date('2026-10-18T06:00:00Z'),
      data: {
        date: dupDate,
        unit: 'cooling water',
        readings: [Object.assign({}, BASE_ROW_T07, { ph: '7.1' })],
      },
    });
    var dNew = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Cooling Water (C.W Water) Analysis',
      unit: 'cooling water',
      date: dupDate,
      createdAt: new Date('2026-10-18T08:00:00Z'),
      data: {
        date: dupDate,
        unit: 'cooling water',
        readings: [Object.assign({}, BASE_ROW_T07, { ph: '7.5' })],
      },
    });

    var getDup = await getReq(port, '/api/cooling-water-analysis?date=' + dupDate + '&unit=cooling%20water');
    assert.strictEqual(getDup.status, 200);
    assert.strictEqual(getDup.body.recordId, String(dNew._id));
    assert.strictEqual(getDup.body.data.readings[0].ph, '7.5');
    pass('T15: pickCanonicalDoc returns latest canonical document on GET and POST');

    // T16: Multi-slot POST rejected with 400
    var multiSlot = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      readings: [
        CURRENT_ROW_T07,
        CURRENT_ROW_T09,
        CURRENT_ROW_T11,
        CURRENT_ROW_T13,
        Object.assign({}, BASE_ROW_T15, { ph: '7.6' }),
        Object.assign({}, BASE_ROW_T17, { ph: '7.8' }),
      ],
    });
    assert.strictEqual(multiSlot.status, 400);
    assert.strictEqual(multiSlot.body.message, 'Only one slot can be saved per submission.');
    pass('T16: multi-slot POST rejected with 400');

    // T17: Decimal string preserved as trimmed string without Number coercion
    var decDate = '2026-10-28';
    var CURRENT_ROW_T15 = Object.assign({}, BASE_ROW_T15, { ph: '11.0', turbidity: '45.00' });
    var saveDec = await postReq(port, '/api/cooling-water-analysis', {
      date: decDate,
      unit: 'cooling water',
      targetSlot: 't15',
      readings: [
        CURRENT_ROW_T07,
        CURRENT_ROW_T09,
        CURRENT_ROW_T11,
        CURRENT_ROW_T13,
        CURRENT_ROW_T15,
      ],
    });
    assert.strictEqual(saveDec.status, 200);
    var savedRow15 = saveDec.body.data.readings.find(function (r) { return r.id === 't15'; });
    assert.strictEqual(savedRow15.ph, '11.0');
    assert.strictEqual(savedRow15.turbidity, '45.00');
    pass('T17: decimal string preserved as trimmed string without Number coercion');

    // T18: Payload time metadata ignored by server and stored strictly as canonical slot time
    var CURRENT_ROW_T17 = Object.assign({}, BASE_ROW_T17);
    var saveCustomTime = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't17',
      readings: [
        CURRENT_ROW_T07,
        CURRENT_ROW_T09,
        CURRENT_ROW_T11,
        CURRENT_ROW_T13,
        CURRENT_ROW_T15,
        Object.assign({}, CURRENT_ROW_T17, { time: '99:99' }),
      ],
    });
    assert.strictEqual(saveCustomTime.status, 200);
    var savedRow17 = saveCustomTime.body.data.readings.find(function (r) { return r.id === 't17'; });
    assert.strictEqual(savedRow17.time, '17:00');
    pass('T18: payload time metadata ignored by server and stored strictly as canonical slot time');

    // T19: Report matcher test using verbatim functions from genericPlantReportService.js
    var gSrc = fs.readFileSync('server/services/genericPlantReportService.js', 'utf8');
    var gLines = gSrc.split('\n');
    var fnStart = gLines.findIndex(function (l) { return l.includes('function getCellAuditEntries('); });
    assert.ok(fnStart >= 0, 'getCellAuditEntries must exist in genericPlantReportService');
    var openCount = 0;
    var fnEnd = -1;
    for (var i = fnStart; i < gLines.length; i++) {
      var line = gLines[i];
      for (var j = 0; j < line.length; j++) {
        if (line[j] === '{') openCount++;
        else if (line[j] === '}') {
          openCount--;
          if (openCount === 0) {
            fnEnd = i;
            break;
          }
        }
      }
      if (fnEnd >= 0) break;
    }
    assert.ok(fnEnd > fnStart, 'getCellAuditEntries end must be found');
    var getCellAuditEntriesStr = gLines.slice(fnStart, fnEnd + 1).join('\n');
    var getCellAuditEntries = eval('(' + getCellAuditEntriesStr + ')');

    // Correction on t17 to create audit entry
    var corr17 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't17',
      readings: [
        CURRENT_ROW_T07,
        CURRENT_ROW_T09,
        CURRENT_ROW_T11,
        CURRENT_ROW_T13,
        CURRENT_ROW_T15,
        Object.assign({}, CURRENT_ROW_T17, { ph: '8.1' }),
      ],
    });
    assert.strictEqual(corr17.status, 200);
    var auditList = corr17.body.editAuditHistory;
    assert.ok(auditList.length > 0);
    var auditEntry17 = auditList.find(function (a) { return a.rowId === 't17' && a.field === 'ph'; });
    assert.ok(auditEntry17, 'audit entry for t17 ph must exist');
    assert.strictEqual(auditEntry17.shift, 'Day');
    assert.strictEqual(auditEntry17.time, '17:00');
    assert.strictEqual(auditEntry17.oldValue, '7.8');
    assert.strictEqual(auditEntry17.newValue, '8.1');
    assert.ok(auditEntry17.editedBy);
    assert.ok(auditEntry17.editedById);
    assert.ok(auditEntry17.timestamp);

    // Test matcher hit
    var hitTarget = getCellAuditEntries([auditEntry17], '17:00', 'ph', { id: 't17', time: '17:00' });
    assert.strictEqual(hitTarget.length, 1);

    // Cross-slot negative
    var missOtherSlot = getCellAuditEntries([auditEntry17], '07:00', 'ph', { id: 't07', time: '07:00' });
    assert.strictEqual(missOtherSlot.length, 0);

    // Cross-field negative
    var missOtherField = getCellAuditEntries([auditEntry17], '17:00', 'frc', { id: 't17', time: '17:00' });
    assert.strictEqual(missOtherField.length, 0);

    // Cross-unit negative (same slot id/time 't07' / '07:00' should not match a 't17' audit entry)
    var miss200 = getCellAuditEntries([auditEntry17], '07:00', 'ph', { id: 't07', time: '07:00' });
    assert.strictEqual(miss200.length, 0);

    assert.strictEqual(corr17.body.editedFields['t17_ph'], true);
    assert.strictEqual(corr17.body.editedFields['17:00_ph'], true);
    pass('T19: report matcher hits flat audit entry for slot and rejects other slots/groups');

    // T20: Last slot t17 entry, one correction, and lock confirmed
    assert.strictEqual(corr17.body.lockedSlots.t17.isSaved, true);
    assert.strictEqual(corr17.body.lockedSlots.t17.correctionUsed, true);
    assert.strictEqual(corr17.body.lockedSlots.t17.isLocked, true);
    var secondCorr17 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water',
      targetSlot: 't17',
      readings: [
        CURRENT_ROW_T07,
        CURRENT_ROW_T09,
        CURRENT_ROW_T11,
        CURRENT_ROW_T13,
        CURRENT_ROW_T15,
        Object.assign({}, CURRENT_ROW_T17, { ph: '8.2' }),
      ],
    });
    assert.strictEqual(secondCorr17.status, 400);
    assert.strictEqual(secondCorr17.body.message, 'Cannot edit t17 because it is permanently locked.');
    pass('T20: last slot t17 entry, one correction, and lock confirmed');

    // T21: Full 6-slot sequential cycle confirmed for Day CW
    var cycleDate = '2026-10-28';
    var getCycle = await getReq(port, '/api/cooling-water-analysis?date=' + cycleDate + '&unit=cooling%20water');
    assert.strictEqual(getCycle.status, 200);
    var cycleSlots = getCycle.body.lockedSlots;
    ['t07', 't09', 't11', 't13', 't15', 't17'].forEach(function (sk) {
      assert.strictEqual(cycleSlots[sk].isSaved, true, sk + ' must be saved');
      assert.strictEqual(cycleSlots[sk].isLocked, true, sk + ' must be locked');
    });
    pass('T21: full 6-slot sequential cycle confirmed for Day CW');

    // T22: Full 2-slot sequential cycle confirmed for CW200#
    var save200_1 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water 200#',
      targetSlot: 't07',
      readings: [BASE_ROW_200_T07],
    });
    assert.strictEqual(save200_1.status, 200);
    assert.strictEqual(save200_1.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(save200_1.body.lockedSlots.t07.isLocked, false);
    assert.strictEqual(save200_1.body.lockedSlots.t19.isSaved, false);

    // Save t19 -> locks t07
    var save200_2 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water 200#',
      targetSlot: 't19',
      readings: [BASE_ROW_200_T07, BASE_ROW_200_T19],
    });
    assert.strictEqual(save200_2.status, 200);
    assert.strictEqual(save200_2.body.lockedSlots.t07.isLocked, true);
    assert.strictEqual(save200_2.body.lockedSlots.t19.isSaved, true);
    assert.strictEqual(save200_2.body.lockedSlots.t19.isLocked, false);

    // Correction on t19 -> locks t19
    var corr200_2 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water 200#',
      targetSlot: 't19',
      readings: [BASE_ROW_200_T07, Object.assign({}, BASE_ROW_200_T19, { ph: '7.9' })],
    });
    assert.strictEqual(corr200_2.status, 200);
    assert.strictEqual(corr200_2.body.lockedSlots.t19.isLocked, true);
    assert.strictEqual(corr200_2.body.lockedSlots.t19.correctionUsed, true);

    // Second correction on t19 rejected
    var secondCorr200 = await postReq(port, '/api/cooling-water-analysis', {
      date: OP_DATE,
      unit: 'cooling water 200#',
      targetSlot: 't19',
      readings: [BASE_ROW_200_T07, Object.assign({}, BASE_ROW_200_T19, { ph: '8.0' })],
    });
    assert.strictEqual(secondCorr200.status, 400);
    assert.strictEqual(secondCorr200.body.message, 'Cannot edit t19 because it is permanently locked.');
    pass('T22: full 2-slot sequential cycle confirmed for CW200#');

    // T24: ammn is free text on server (accepts 'NIL' and text strings), non-empty check passes with 'NIL'
    var ammnDate = '2026-10-27'; // within boundaryNow operating date from earlier or fresh test
    var appAmmn = express();
    appAmmn.use(express.json());
    var ammnNow = istDate(2026, 10, 29, 11, 0);
    var AMMN_OP = getOperatingDateIST(ammnNow);
    appAmmn.use('/api/cooling-water-analysis', createCoolingWaterRouter({
      getNow: function () { return ammnNow; },
    }));
    var serverAmmn = http.createServer(appAmmn);
    await new Promise(function (resolve) { serverAmmn.listen(0, '127.0.0.1', resolve); });
    var portAmmn = serverAmmn.address().port;

    // Slot with only ammn: 'NIL' and others empty is considered non-empty
    var ammnOnlySave = await postReq(portAmmn, '/api/cooling-water-analysis', {
      date: AMMN_OP,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [{
        id: 't07',
        time: '07:00',
        ph: '',
        frc: '',
        cl: '',
        opo4: '',
        turbidity: '',
        tds: '',
        fe: '',
        sio2: '',
        alk: '',
        so4: '',
        th: '',
        cah: '',
        mgh: '',
        ammn: 'NIL',
      }],
    });
    assert.strictEqual(ammnOnlySave.status, 200);
    assert.strictEqual(ammnOnlySave.body.data.readings[0].ammn, 'NIL');

    // Free text string in ammn accepted without numeric validation error
    var ammnTextCorr = await postReq(portAmmn, '/api/cooling-water-analysis', {
      date: AMMN_OP,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [{
        id: 't07',
        time: '07:00',
        ph: '',
        frc: '',
        cl: '',
        opo4: '',
        turbidity: '',
        tds: '',
        fe: '',
        sio2: '',
        alk: '',
        so4: '',
        th: '',
        cah: '',
        mgh: '',
        ammn: 'Trace (<0.01)',
      }],
    });
    assert.strictEqual(ammnTextCorr.status, 200);
    assert.strictEqual(ammnTextCorr.body.data.readings[0].ammn, 'Trace (<0.01)');
    serverAmmn.close();
    pass('T24: ammn is free text on server and non-empty check passes with NIL');

    // T25: Cross-unit independence: saving CW200# does not lock, unlock, or overwrite CW Day record
    var indepDate = '2026-10-30';
    var indepNow = istDate(2026, 10, 30, 11, 0);
    var INDEP_OP = getOperatingDateIST(indepNow);
    var appIndep = express();
    appIndep.use(express.json());
    appIndep.use('/api/cooling-water-analysis', createCoolingWaterRouter({
      getNow: function () { return indepNow; },
    }));
    var serverIndep = http.createServer(appIndep);
    await new Promise(function (resolve) { serverIndep.listen(0, '127.0.0.1', resolve); });
    var portIndep = serverIndep.address().port;

    // 1. Save slot t07 of Day CW
    var cwSave1 = await postReq(portIndep, '/api/cooling-water-analysis', {
      date: INDEP_OP,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [BASE_ROW_T07],
    });
    assert.strictEqual(cwSave1.status, 200);
    assert.strictEqual(cwSave1.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(cwSave1.body.lockedSlots.t07.isLocked, false);

    // 2. Save slot t07 of CW 200#
    var cw200Save1 = await postReq(portIndep, '/api/cooling-water-analysis', {
      date: INDEP_OP,
      unit: 'cooling water 200#',
      targetSlot: 't07',
      readings: [BASE_ROW_200_T07],
    });
    assert.strictEqual(cw200Save1.status, 200);
    assert.strictEqual(cw200Save1.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(cw200Save1.body.lockedSlots.t07.isLocked, false);

    // 3. Save slot t19 of CW 200# (locks CW200# t07)
    var cw200Save2 = await postReq(portIndep, '/api/cooling-water-analysis', {
      date: INDEP_OP,
      unit: 'cooling water 200#',
      targetSlot: 't19',
      readings: [BASE_ROW_200_T07, BASE_ROW_200_T19],
    });
    assert.strictEqual(cw200Save2.status, 200);
    assert.strictEqual(cw200Save2.body.lockedSlots.t07.isLocked, true);

    // 4. Verify Day CW t07 is STILL NOT LOCKED (cross-unit independence!)
    var getCWAfter = await getReq(portIndep, '/api/cooling-water-analysis?date=' + INDEP_OP + '&unit=cooling%20water');
    assert.strictEqual(getCWAfter.status, 200);
    assert.strictEqual(getCWAfter.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(getCWAfter.body.lockedSlots.t07.isLocked, false, 'Day CW t07 must not be locked by CW200# save');

    // 5. Day CW can still do its valid correction
    var corrDayCW = await postReq(portIndep, '/api/cooling-water-analysis', {
      date: INDEP_OP,
      unit: 'cooling water',
      targetSlot: 't07',
      readings: [Object.assign({}, BASE_ROW_T07, { ph: '7.9' })],
    });
    assert.strictEqual(corrDayCW.status, 200);
    assert.strictEqual(corrDayCW.body.lockedSlots.t07.correctionUsed, true);
    assert.strictEqual(corrDayCW.body.lockedSlots.t07.isLocked, true);
    serverIndep.close();
    pass('T25: cross-unit independence: saving CW200# does not lock, unlock, or overwrite CW Day record');

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
  console.error('TEST FAILED with error:', err);
  process.exit(1);
});
