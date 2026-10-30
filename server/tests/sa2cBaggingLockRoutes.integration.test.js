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
var { createRouter: createLSABaggingRouter } = require('../routes/lsaBaggingRoutes');
var { generateSALSABaggingAnalysisExcel } = require('../services/excelService');

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

const DEFAULT_HOURLY_SLOTS = [
  { id: 'h0600', time: '06:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0700', time: '07:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0800', time: '08:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h0900', time: '09:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1000', time: '10:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1100', time: '11:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1200', time: '12:00', shift: 'Shift 1', nacl: '', bd: '' },
  { id: 'h1300', time: '13:00', shift: 'Shift 1', nacl: '', bd: '' },

  { id: 'h1400', time: '14:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1500', time: '15:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1600', time: '16:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1700', time: '17:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1800', time: '18:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h1900', time: '19:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2000', time: '20:00', shift: 'Shift 2', nacl: '', bd: '' },
  { id: 'h2100', time: '21:00', shift: 'Shift 2', nacl: '', bd: '' },

  { id: 'h2200', time: '22:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h2300', time: '23:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0000', time: '00:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0100', time: '01:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0200', time: '02:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0300', time: '03:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0400', time: '04:00', shift: 'Shift 3', nacl: '', bd: '' },
  { id: 'h0500', time: '05:00', shift: 'Shift 3', nacl: '', bd: '' },
];

async function runTests() {
  var mongoServer = await MongoMemoryServer.create();
  var mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  var totalTests = 0;
  var passedTests = 0;

  function pass(name) {
    totalTests++;
    passedTests++;
    console.log('  PASS: ' + name);
  }

  var currentTime = istDate(2026, 10, 28, 10, 0); // 10:00 IST -> operating date 2026-10-28
  var getNow = function() { return currentTime; };

  var app = express();
  app.use(express.json());
  app.use('/api/lsa-bagging', createLSABaggingRouter({ getNow }));

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';

  try {
    // T1: Role check: req.user.role === 'user' -> 403 Forbidden
    var t1Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'shift',
      shiftAnalysis: {
        shift1: { na2co3: 99.2, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    }, { 'x-role-user': 'true' });
    assert.strictEqual(t1Res.status, 403);
    assert.strictEqual(t1Res.body.success, false);
    pass('T1: role user returns 403 Forbidden');

    // T2: Bypass parameters ignored (x-test-mode, payload.now, payload.isTestMode, body.now)
    var t2Res = await postReq(port, '/api/lsa-bagging', {
      date: '2026-10-27', // previous day
      isTestMode: true,
      now: '2026-10-27T10:00:00.000Z',
      shiftAnalysis: {
        shift1: { na2co3: 99.2 },
      },
    }, { 'x-test-mode': 'true', 'x-test-now': '2026-10-27T10:00:00.000Z' });
    assert.strictEqual(t2Res.status, 400); // Must be rejected because date does not match getOperatingDateIST(getNow())
    pass('T2: bypass parameters ignored, operating date strictly validated');

    // T3: 06:00 IST cutoff boundary check
    // At 05:59 IST on 2026-10-28, operating date is 2026-10-27
    currentTime = istDate(2026, 10, 28, 5, 59);
    var t3Res1 = await postReq(port, '/api/lsa-bagging', {
      date: '2026-10-28',
      shiftAnalysis: { shift1: { na2co3: 99.1 } },
    });
    assert.strictEqual(t3Res1.status, 400); // 2026-10-28 is future at 05:59 IST

    var t3Res2 = await postReq(port, '/api/lsa-bagging', {
      date: '2026-10-27',
      shiftAnalysis: { shift1: { na2co3: 99.1 } },
    });
    assert.strictEqual(t3Res2.status, 200); // 2026-10-27 is current operating date at 05:59 IST
    pass('T3: 06:00 IST cutoff: 05:59 IST belongs to previous day');

    // Reset currentTime to 10:00 IST on 2026-10-28 for OP_DATE tests
    currentTime = istDate(2026, 10, 28, 10, 0);

    // T4: Fresh operating day: only shift1 unlocked. Out-of-order save of shift2/shift3 -> 400
    var t4Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift2: { na2co3: 99.2, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    });
    assert.strictEqual(t4Res.status, 400);
    pass('T4: fresh operating day: saving shift2 before shift1 returns 400');

    // T5: First save of shift1 succeeds (200), opens shift2
    var t5Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift1: { na2co3: 99.2, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    });
    assert.strictEqual(t5Res.status, 200);
    assert.strictEqual(t5Res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t5Res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t5Res.body.lockedSlots.shift1.correctionUsed, false);
    assert.strictEqual(t5Res.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(t5Res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(t5Res.body.lockedSlots.shift3.isLocked, true);
    pass('T5: first save of shift1 succeeds and unlocks shift2');

    // T6: Out-of-order save: saving shift3 while shift2 is unsaved -> 400
    var t6Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift3: { na2co3: 99.2, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    });
    assert.strictEqual(t6Res.status, 400);
    pass('T6: saving shift3 while shift2 is unsaved returns 400');

    // T7: Correction on shift1 while shift2 is unsaved (200), marks correctionUsed and isLocked
    var t7Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift1: { na2co3: 99.4, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    });
    assert.strictEqual(t7Res.status, 200);
    assert.strictEqual(t7Res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t7Res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(t7Res.body.lockedSlots.shift1.correctionUsed, true);
    assert(t7Res.body.editedFields.shift1);
    assert.strictEqual(t7Res.body.editedFields.shift1.na2co3, true);
    assert(t7Res.body.editAuditHistory.length > 0);
    pass('T7: correction on shift1 succeeds, records editedFields + audit, locks shift1');

    // T8: Second correction on shift1 returns 400
    var t8Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift1: { na2co3: 99.5, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    });
    assert.strictEqual(t8Res.status, 400);
    pass('T8: second correction on shift1 returns 400');

    // T9: Shift2 first save succeeds (200), unlocks shift3
    var t9Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift2: { na2co3: 99.3, nacl: 0.28, fe: 0.003, na2so4: 0.04, vm: 0.1, ir: 0.02, bd: 0.86, turbidity: 12 },
      },
    });
    assert.strictEqual(t9Res.status, 200);
    assert.strictEqual(t9Res.body.lockedSlots.shift2.isSaved, true);
    assert.strictEqual(t9Res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(t9Res.body.lockedSlots.shift3.isLocked, false);
    pass('T9: shift2 save succeeds, unlocks shift3');

    // T10: Shift1 is permanently locked: attempting to edit shift1 returns 400
    var t10Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift1: { na2co3: 99.6, nacl: 0.3, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    });
    assert.strictEqual(t10Res.status, 400);
    pass('T10: editing permanently locked shift1 returns 400');

    // T11: Identical re-save returns 200 { noChange: true } and does NOT consume correction
    var t11Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift2: { na2co3: 99.3, nacl: 0.28, fe: 0.003, na2so4: 0.04, vm: 0.1, ir: 0.02, bd: 0.86, turbidity: 12 },
      },
    });
    assert.strictEqual(t11Res.status, 200);
    assert.strictEqual(t11Res.body.noChange, true);
    assert.strictEqual(t11Res.body.lockedSlots.shift2.correctionUsed, false);
    pass('T11: identical re-save returns 200 { noChange: true }');

    // T12: Empty shift save (all fields empty) returns 400
    var t12Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift3: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
      },
    });
    assert.strictEqual(t12Res.status, 400);
    pass('T12: empty shift save returns 400');

    // T13: Correction cannot clear all values (empty shift on correction) returns 400
    // Shift2 is saved but unlocked. Sending all empty params for shift2 -> 400
    var t13Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift2: { na2co3: '', nacl: '', fe: '', na2so4: '', vm: '', ir: '', bd: '', turbidity: '' },
      },
    });
    assert.strictEqual(t13Res.status, 400);
    pass('T13: correction clearing all values returns 400');

    // T14: Multi-shift POST in shift analysis returns 400
    var t14Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      shiftAnalysis: {
        shift2: { na2co3: 99.31 },
        shift3: { na2co3: 99.25 },
      },
    });
    assert.strictEqual(t14Res.status, 400);
    pass('T14: multi-shift POST returns 400');

    // T15: Hourly save in shift2 does NOT advance shift chain (shift3 remains unsaved)
    var initialSlots = DEFAULT_HOURLY_SLOTS.map(function(s) { return Object.assign({}, s); });
    // Modify a shift 2 slot: h1400 (14:00)
    var updatedHourly1 = initialSlots.map(function(s) {
      if (s.time === '14:00') return Object.assign({}, s, { nacl: '0.29', bd: '0.86' });
      return s;
    });

    var t15Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: updatedHourly1,
    });
    assert.strictEqual(t15Res.status, 200);
    assert.strictEqual(t15Res.body.lockedSlots.shift3.isSaved, false); // shift3 is NOT saved by hourly save
    pass('T15: hourly save in shift2 does not advance shift chain');

    // T16: Hourly edit in unlocked shift records editedFields.hourly and audit
    var updatedHourly2 = updatedHourly1.map(function(s) {
      if (s.time === '14:00') return Object.assign({}, s, { nacl: '0.31' });
      return s;
    });
    var t16Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: updatedHourly2,
    });
    assert.strictEqual(t16Res.status, 200);
    assert(t16Res.body.editedFields.hourly);
    assert(t16Res.body.editedFields.hourly.h1400);
    assert.strictEqual(t16Res.body.editedFields.hourly.h1400.nacl, true);
    pass('T16: hourly edit in unlocked shift records editedFields.hourly and audit');

    // T17: Hourly edit in permanently locked shift (shift1) returns 400
    var updatedHourlyShift1 = updatedHourly2.map(function(s) {
      if (s.time === '08:00') return Object.assign({}, s, { nacl: '0.35' });
      return s;
    });
    var t17Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: updatedHourlyShift1,
    });
    assert.strictEqual(t17Res.status, 400);
    pass('T17: hourly edit in locked shift1 returns 400');

    // T18: Hourly multi-shift POST (touching hourly rows of shift2 and shift3) returns 400
    // Note: shift2 is unlocked, shift3 is unlocked (shift2 is saved). Modifying both 15:00 (shift2) and 22:00 (shift3)
    var updatedHourlyMulti = updatedHourly2.map(function(s) {
      if (s.time === '15:00') return Object.assign({}, s, { nacl: '0.30' });
      if (s.time === '22:00') return Object.assign({}, s, { nacl: '0.32' });
      return s;
    });
    var t18Res = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: updatedHourlyMulti,
    });
    assert.strictEqual(t18Res.status, 400);
    pass('T18: hourly multi-shift POST returns 400');

    // T19: Saved custom hourly row cannot change sampling time
    // First, add a custom hourly row in shift 2: 16:30
    var customRow = {
      id: 'custom_1630',
      time: '16:30',
      shift: 'Shift 2',
      nacl: '0.28',
      bd: '0.85',
      isCustom: true,
    };
    var withCustom = updatedHourly2.concat([customRow]);
    var t19AddRes = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: withCustom,
    });
    assert.strictEqual(t19AddRes.status, 200);

    // Attempt to change time of saved custom row to 16:45
    var withModifiedTime = updatedHourly2.concat([
      Object.assign({}, customRow, { time: '16:45' })
    ]);
    var t19ModRes = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: withModifiedTime,
    });
    assert.strictEqual(t19ModRes.status, 400);
    pass('T19: modifying time of saved custom hourly row returns 400');

    // T20: Saved custom hourly row cannot be deleted (missing from payload) returns 400
    var t20DelRes = await postReq(port, '/api/lsa-bagging', {
      date: OP_DATE,
      saveType: 'hourly',
      hourlyReadings: updatedHourly2, // omitted customRow
    });
    assert.strictEqual(t20DelRes.status, 400);
    pass('T20: deleting saved custom hourly row returns 400');

    // T21: Adding custom hourly row in an unlocked shift records ROW_ADDED in audit
    var auditEntry = t19AddRes.body.editAuditHistory.find(function(a) {
      return a.action === 'ROW_ADDED' && a.samplingTime === '16:30';
    });
    assert(auditEntry);
    assert.strictEqual(auditEntry.shift, 'Shift 2');
    pass('T21: adding custom hourly row auto-assigns shift and logs ROW_ADDED audit');

    // T22: Race condition test: concurrent POST on same shift -> one 200, one 409
    // Save shift 3 simultaneously
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

    var racePayloadA = {
      date: OP_DATE,
      shiftAnalysis: {
        shift3: { na2co3: 99.1, nacl: 0.31, fe: 0.002, na2so4: 0.05, vm: 0.1, ir: 0.02, bd: 0.85, turbidity: 10 },
      },
    };
    var racePayloadB = {
      date: OP_DATE,
      shiftAnalysis: {
        shift3: { na2co3: 99.2, nacl: 0.32, fe: 0.003, na2so4: 0.06, vm: 0.11, ir: 0.02, bd: 0.86, turbidity: 11 },
      },
    };

    var results = await Promise.all([
      postReq(port, '/api/lsa-bagging', racePayloadA),
      postReq(port, '/api/lsa-bagging', racePayloadB),
    ]);
    PlantAnalysisRecord.find = origFind; // restore

    var statuses = results.map(function(r) { return r.status; }).sort();
    assert.strictEqual(statuses[0], 200, 'One racer should succeed (200)');
    assert.strictEqual(statuses[1], 409, 'One racer should conflict (409)');
    pass('T22: concurrent save returns [200, 409]');

    // T23: GET request never writes to DB
    var countBefore = await PlantAnalysisRecord.countDocuments();
    var t23GetRes = await getReq(port, '/api/lsa-bagging?date=' + OP_DATE);
    assert.strictEqual(t23GetRes.status, 200);
    var countAfter = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBefore, countAfter);
    pass('T23: GET request never writes to DB');

    // T24: Legacy hydration: document with legacy lockedShifts hydrates properly on GET
    var legacyDate = '2026-10-25';
    await PlantAnalysisRecord.create({
      plantName: 'SA Plant',
      plantCode: 'SA',
      analysisType: 'LSA Bagging',
      unit: 'LSA Bagging',
      date: legacyDate,
      shift: 'All Shifts',
      status: 'completed',
      submittedBy: 'Old System',
      data: {
        date: legacyDate,
        plant: 'SA',
        unit: 'LSA Bagging',
        shiftAnalysis: {
          shift1: { na2co3: 99.1, nacl: 0.3 },
        },
        hourlyReadings: [
          { id: 'custom_old_1', time: '11:15', shift: 'Shift 1', nacl: '0.25', bd: '0.84', isCustom: true },
        ],
        lockedShifts: {
          shift1Saved: true,
          shift1Locked: false,
          shift1Edits: 0,
        },
      },
    });

    var t24GetRes = await getReq(port, '/api/lsa-bagging?date=' + legacyDate);
    assert.strictEqual(t24GetRes.status, 200);
    assert(t24GetRes.body.lockedSlots);
    assert.strictEqual(t24GetRes.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t24GetRes.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t24GetRes.body.lockedSlots.shift2.isLocked, false);
    var hasCustomLegacy = t24GetRes.body.hourlyReadings.some(function(r) { return r.time === '11:15'; });
    assert.strictEqual(hasCustomLegacy, true);
    pass('T24: legacy doc hydrates lockedSlots in memory and preserves custom rows');

    // T25: Reader contract with excelService.generateSALSABaggingAnalysisExcel
    var dbDoc = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert(dbDoc);
    var excelResult = await generateSALSABaggingAnalysisExcel(dbDoc.data);
    assert(excelResult);
    assert(excelResult.buffer);
    assert(Buffer.isBuffer(excelResult.buffer));
    pass('T25: reader contract with generateSALSABaggingAnalysisExcel returns valid buffer');

    console.log('\n--- SA-2c LSA Bagging Integration Tests: ' + passedTests + ' / ' + totalTests + ' PASSED ---');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongoServer.stop();
  }
}

runTests().catch(function(err) {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
