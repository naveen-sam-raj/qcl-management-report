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
var { createRouter: createCbdRouter } = require('../routes/cbdAnalysisRoutes');
var { getInitialLockState, hydrateLockState } = require('../services/analysisLockEngine');

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
  app.use('/api/cbd-analysis', createCbdRouter({ getNow }));

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';
  var SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];

  try {
    // -------------------------------------------------------------
    // T20: Non-numeric validation rejects 'abc' in ph
    // -------------------------------------------------------------
    console.log('--- T20: Non-numeric validation rejects string in ph');
    var t20Res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: 'abc', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t20Res.status, 400);
    assert.strictEqual(t20Res.body.message, 'Validation failed. Enter numeric values only.');
    assert.ok(t20Res.body.errors.some(function(e) { return e.includes('PH must be a valid number'); }));
    pass('T20: non-numeric ph correctly rejected with 400');

    // -------------------------------------------------------------
    // T21: Non-numeric validation rejects 'xyz' in tds
    // -------------------------------------------------------------
    console.log('--- T21: Non-numeric validation rejects string in tds');
    var t21Res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: 'xyz' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t21Res.status, 400);
    assert.strictEqual(t21Res.body.message, 'Validation failed. Enter numeric values only.');
    assert.ok(t21Res.body.errors.some(function(e) { return e.includes('TDS must be a valid number'); }));
    pass('T21: non-numeric tds correctly rejected with 400');

    console.log('\n========================================================================');
    console.log('OFFSITE SUITE: CBD SHIFT ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    await PlantAnalysisRecord.deleteMany({});

    // T1: First save shift1 returns 200 and unlocks shift2
    var res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(res.body.lockedShifts.shift1Saved, true);
    assert.strictEqual(res.body.shifts.iShift.ph, '11.0');
    assert.strictEqual(res.body.shifts.iShift.tds, '938');
    pass('T1: first save shift1 opens shift2');

    // T2: Out-of-order save shift3 before shift2 -> 400
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '10.5', po4: '25', na2so3: '65', talk: '230', tfe: '2.5', sio2: '6', ss: '18', tds: '900' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Sequential restriction/i);
    pass('T2: out-of-order shift3 save rejected with 400');

    // T3: Correction on shift1 succeeds -> 200, sets flat editedFields, records flat editAuditHistory without changes[]
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.5', po4: '28', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.shift1.correctionUsed, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(res.body.editedFields['iShift_ph'], true);
    assert.strictEqual(res.body.editedFields['shift1_ph'], true);
    assert.strictEqual(res.body.editedFields['iShift_po4'], true);
    assert.strictEqual(res.body.editedFields['shift1_po4'], true);
    assert.strictEqual(res.body.editAuditHistory.length, 2);
    // Flat audit entry verification
    var auditEntry = res.body.editAuditHistory[0];
    assert.strictEqual(auditEntry.date, OP_DATE);
    assert.strictEqual(auditEntry.rowId, 'iShift');
    assert.strictEqual(auditEntry.time, 'iShift');
    assert.strictEqual(auditEntry.shift, 'I SHIFT');
    assert.strictEqual(auditEntry.field, 'ph');
    assert.strictEqual(auditEntry.oldValue, '11.0');
    assert.strictEqual(auditEntry.newValue, '11.5');
    assert.strictEqual(auditEntry.editedBy, 'Offsite Test Admin');
    assert.ok(auditEntry.timestamp);
    assert.strictEqual(auditEntry.changes, undefined);
    pass('T3: correction succeeds with flat editedFields and flat editAuditHistory');

    // T4: Second correction on locked shift1 rejected with 400 (admin cannot edit locked)
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.8', po4: '28', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /permanently locked/i);
    pass('T4: second correction rejected with 400 (admin cannot edit locked)');

    // T5: Empty first save rejected with 400 for shift1 (fresh), shift2 (after shift1 saved), shift3 (after shift2 saved)
    await PlantAnalysisRecord.deleteMany({});
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Cannot save empty slot shift1. At least one non-empty value is required.');

    // Save shift1 with data
    await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });

    // T5b: After shift1 saved, shift2 empty save -> 400
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Cannot save empty slot shift2. At least one non-empty value is required.');

    // Save shift2 with data
    await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });

    // T5c: After shift2 saved, shift3 empty save -> 400
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Cannot save empty slot shift3. At least one non-empty value is required.');
    pass('T5: empty first-save 400 for shift1 (fresh), shift2, shift3 with targetSlot');

    // T6: Shift2 save permanently locks shift1
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.9', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /permanently locked/i);
    pass('T6: shift2 save permanently locks shift1');

    // T7: Identical re-save returns 200 with noChange: true
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.noChange, true);
    assert.strictEqual(res.body.message, 'No changes');
    pass('T7: identical re-save returns 200 noChange: true');

    // T8: Multi-shift edit in single POST rejected with 400
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      shifts: {
        iShift:   { ph: '12.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '11.2', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '10.9', po4: '24', na2so3: '64', talk: '230', tfe: '2.6', sio2: '6.5', ss: '18', tds: '910' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Only one unit slot may be entered or edited per save/i);
    pass('T8: multi-shift POST rejected with 400');

    // T9: Sequential save progression to shift3 and final lock
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '10.6', po4: '24', na2so3: '64', talk: '230', tfe: '2.6', sio2: '6.5', ss: '18', tds: '910' },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.shift3.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.shift2.isLocked, true);
    assert.strictEqual(res.body.lockedSlots.shift3.isLocked, false);
    pass('T9: shift3 first save succeeds and locks shift2');

    // T10: Deterministic race on concurrent POSTs with find barrier -> [200, 409]
    await PlantAnalysisRecord.deleteMany({});
    // Setup initial doc with shift1 saved
    await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
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

    var p1 = postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    var p2 = postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.9', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });

    var raceResults = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind; // Restore original find
    var statuses = raceResults.map(function(r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409], 'Expected one 200 and one 409, got: ' + JSON.stringify(statuses));
    pass('T10: deterministic race condition returns [200, 409]');

    // T10b: Sequential second POST with different shift2 values after first save = valid correction 200
    var t10bRes = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.5', po4: '24', na2so3: '65', talk: '230', tfe: '2.5', sio2: '6.5', ss: '18', tds: '915' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t10bRes.status, 200);
    assert.strictEqual(t10bRes.body.lockedSlots.shift2.correctionUsed, true);
    assert.strictEqual(t10bRes.body.lockedSlots.shift2.isLocked, true);
    assert.strictEqual(t10bRes.body.shifts.iiShift.ph, '10.5');
    pass('T10b: sequential second POST with different shift2 values = valid correction 200');

    // T11: Duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST
    await PlantAnalysisRecord.deleteMany({});
    // Insert Doc A (older, 1 row saved)
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'CBD Analysis',
      unit: 'CBD',
      date: OP_DATE,
      createdAt: new Date('2026-10-28T07:00:00.000Z'),
      updatedAt: new Date('2026-10-28T07:00:00.000Z'),
      data: {
        id: 'docA_legacy',
        date: OP_DATE,
        shifts: {
          iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
          iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
          iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        },
        lockedSlots: {
          shift1: { isSaved: true, isLocked: false, correctionUsed: false },
          shift2: { isSaved: false, isLocked: false, correctionUsed: false },
          shift3: { isSaved: false, isLocked: false, correctionUsed: false },
        },
      },
    });

    // Insert Doc B (newer, 2 rows saved)
    var docB = await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'CBD Analysis',
      unit: 'CBD',
      date: OP_DATE,
      createdAt: new Date('2026-10-28T15:00:00.000Z'),
      updatedAt: new Date('2026-10-28T15:00:00.000Z'),
      data: {
        id: 'docB_canonical',
        date: OP_DATE,
        shifts: {
          iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
          iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
          iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        },
        lockedSlots: {
          shift1: { isSaved: true, isLocked: true, correctionUsed: false },
          shift2: { isSaved: true, isLocked: false, correctionUsed: false },
          shift3: { isSaved: false, isLocked: false, correctionUsed: false },
        },
      },
    });

    // Proven on GET: returns Doc B
    var t11Get = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE);
    assert.strictEqual(t11Get.status, 200);
    assert.strictEqual(t11Get.body.recordId, docB._id.toString());
    assert.strictEqual(t11Get.body.shifts.iiShift.ph, '10.8');

    // Proven on POST: POST on shift3 targets Doc B (shift2 was saved on B, so shift3 is allowed)
    var t11Post = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '10.6', po4: '24', na2so3: '64', talk: '230', tfe: '2.6', sio2: '6.5', ss: '18', tds: '910' },
      },
    });
    assert.strictEqual(t11Post.status, 200);
    assert.strictEqual(t11Post.body.recordId, docB._id.toString());
    assert.strictEqual(t11Post.body.lockedSlots.shift3.isSaved, true);
    pass('T11: duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST');

    // T12: 06:00 IST boundary and 01:30 IST previous operating day strictly enforced
    // Current time at 05:59:59 IST on 2026-10-29 -> operating date is 2026-10-28
    currentTime = istDate(2026, 10, 29, 5, 59);
    var t12a = await postReq(port, '/api/cbd-analysis', {
      date: '2026-10-29',
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
      },
    });
    assert.strictEqual(t12a.status, 400);
    assert.match(t12a.body.message, /Date restriction enforced/i);

    // Current time at 06:00:00 IST on 2026-10-29 -> operating date is 2026-10-29
    currentTime = istDate(2026, 10, 29, 6, 0);
    var t12b = await postReq(port, '/api/cbd-analysis', {
      date: '2026-10-28',
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
      },
    });
    assert.strictEqual(t12b.status, 400);
    assert.match(t12b.body.message, /Date restriction enforced/i);
    assert.strictEqual(t12b.body.message, "Date restriction enforced: CBD Analysis records can only be created or modified for today's operating date (2026-10-29). Historical or future modifications are not permitted.");

    // Current time at 01:30:00 IST on 2026-10-29 -> operating date is 2026-10-28
    currentTime = istDate(2026, 10, 29, 1, 30);
    var t12c = await postReq(port, '/api/cbd-analysis', {
      date: '2026-10-28',
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
      },
    });
    // 2026-10-28 is valid for 01:30 IST on Oct 29
    assert.strictEqual(t12c.status, 200);
    pass('T12: 06:00 IST boundary and 01:30 IST previous operating day strictly enforced');

    // T12b: Client date spoofing via req.now, req.body.now, payload.now, body.now and x-test headers strictly ignored -> 400
    currentTime = istDate(2026, 10, 28, 10, 0); // Active operating date: 2026-10-28
    var t12Spoof = await postReq(port, '/api/cbd-analysis', {
      date: '2026-10-25', // Attempt to save historical date
      now: '2026-10-25T10:00:00.000Z',
      payload: { now: '2026-10-25T10:00:00.000Z' },
      body: { now: '2026-10-25T10:00:00.000Z' },
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
      },
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
      'x-now': '2026-10-25T10:00:00.000Z',
    });
    assert.strictEqual(t12Spoof.status, 400);
    assert.match(t12Spoof.body.message, /Date restriction enforced/i);
    pass('T12b: date spoofing via payload.now, body.now and x-test headers strictly ignored -> 400');

    // T13: Role user returns 403 Forbidden on GET and POST
    var getRoleUser = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(getRoleUser.status, 403);
    assert.match(getRoleUser.body.message, /Forbidden/i);

    var postRoleUser = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
      },
    }, { 'x-role-user': 'true' });
    assert.strictEqual(postRoleUser.status, 403);
    assert.match(postRoleUser.body.message, /Forbidden/i);
    pass('T13: role user returns 403 on GET and POST');

    // T14: Correction clearing all values of shift1 after its first save (still unlocked) = 400, message matches exact route string
    await PlantAnalysisRecord.deleteMany({});
    // First save of shift1
    await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    // Correction on shift1 clearing all values
    res = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'A correction cannot clear all values in shift1. At least one non-empty value is required.');
    pass('T14: correction clearing all values of shift1 rejected with exact route message');

    // T15: GET returns canonical doc and does NOT write to database
    var countBefore = await PlantAnalysisRecord.countDocuments();
    var t15Res = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE);
    assert.strictEqual(t15Res.status, 200);
    assert.strictEqual(t15Res.body.success, true);
    var countAfter = await PlantAnalysisRecord.countDocuments();
    assert.strictEqual(countBefore, countAfter);
    pass('T15: GET returns canonical doc and does NOT write to database');

    // T16: Legacy doc without lockedSlots hydrates in memory on GET
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'CBD Analysis',
      unit: 'CBD',
      date: OP_DATE,
      data: {
        id: 'legacy_doc_1',
        date: OP_DATE,
        shifts: {
          iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        },
        lockedShifts: {
          shift1Saved: true,
          shift1Locked: false,
          shift1Edits: 0,
        },
      },
    });

    var t16Get = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE);
    assert.strictEqual(t16Get.status, 200);
    assert.strictEqual(t16Get.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t16Get.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t16Get.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(t16Get.body.lockedSlots.shift3.isSaved, false);
    assert.strictEqual(t16Get.body.shifts.iShift.ph, '11.0');
    pass('T16: legacy doc without lockedSlots hydrates correctly in memory');

    // T17: CBD stored shape (data.shifts has exactly keys iShift, iiShift, iiiShift as trimmed strings),
    // legacy doc with data.readings array and no data.shifts does not crash GET/POST,
    // audit entry has exactly the 10 fields, report-matcher test passes,
    // and exact string preservation (no Number coercion) with numeric diff (noChange on 11 vs 11.0)
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'CBD Analysis',
      unit: 'CBD',
      date: OP_DATE,
      data: {
        id: 'legacy_readings_only',
        date: OP_DATE,
        readings: [
          { id: '1', time: '07:00', ph: '11.0', po4: '26' },
          { id: 'legacy_odd', time: '11:00', ph: '10.5' },
        ],
        lockedSlots: {
          shift1: { isSaved: true, isLocked: false, correctionUsed: false },
          shift2: { isSaved: false, isLocked: false, correctionUsed: false },
          shift3: { isSaved: false, isLocked: false, correctionUsed: false },
        },
      },
    });

    // 1. GET legacy readings ph '11.0' must return '11.0'
    var t17Get = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE);
    assert.strictEqual(t17Get.status, 200);
    assert.ok(t17Get.body.shifts);
    assert.strictEqual(t17Get.body.shifts.iShift.ph, '11.0');

    // 2. POST ' 10.8 ' stored '10.8'
    var t17Post = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: ' 10.8 ', po4: ' 25 ', na2so3: ' 66 ', talk: ' 232 ', tfe: ' 2.8 ', sio2: ' 6.8 ', ss: ' 19 ', tds: ' 920 ' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t17Post.status, 200);

    var dbDoc = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert.ok(dbDoc.data.shifts);
    var shiftKeys = Object.keys(dbDoc.data.shifts).sort();
    assert.deepStrictEqual(shiftKeys, ['iShift', 'iiShift', 'iiiShift']);
    assert.strictEqual(dbDoc.data.shifts.iiShift.ph, '10.8');
    assert.strictEqual(dbDoc.data.shifts.iiShift.po4, '25');
    assert.strictEqual(dbDoc.data.shifts.iiShift.tds, '920');

    // 3. Save ph '11.0' then GET returns '11.0'
    assert.strictEqual(dbDoc.data.shifts.iShift.ph, '11.0');
    var t17GetAfterSave = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE);
    assert.strictEqual(t17GetAfterSave.status, 200);
    assert.strictEqual(t17GetAfterSave.body.shifts.iShift.ph, '11.0');
    assert.strictEqual(t17GetAfterSave.body.shifts.iiShift.ph, '10.8');

    // 4. Re-save '11' after '11.0' = noChange
    var t17Resave = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11', po4: '26', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t17Resave.status, 200);
    assert.strictEqual(t17Resave.body.noChange, true);
    assert.strictEqual(t17Resave.body.message, 'No changes');

    // 5. Correction and 10-field audit entry
    var t17Corr = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: ' 10.5 ', po4: ' 25 ', na2so3: ' 66 ', talk: ' 232 ', tfe: ' 2.8 ', sio2: ' 6.8 ', ss: ' 19 ', tds: ' 920 ' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t17Corr.status, 200);
    assert.strictEqual(t17Corr.body.editAuditHistory.length, 1);
    var auditEntry17 = t17Corr.body.editAuditHistory[0];

    var expectedFields = ['date', 'rowId', 'shift', 'time', 'field', 'oldValue', 'newValue', 'editedBy', 'editedById', 'timestamp'].sort();
    assert.deepStrictEqual(Object.keys(auditEntry17).sort(), expectedFields);
    assert.strictEqual(auditEntry17.changes, undefined);

    var fsModule = require('fs');
    var gLines = fsModule.readFileSync(require.resolve('../services/genericPlantReportService'), 'utf8').split('\n');
    var isFieldMarkedEditedStr = gLines.slice(861, 930).join('\n');
    var getCellAuditEntriesStr = gLines.slice(933, 982).join('\n');
    var isFieldMarkedEditedFn = new Function('return (' + isFieldMarkedEditedStr + ')')();
    var getCellAuditEntriesFn = new Function('return (' + getCellAuditEntriesStr + ')')();

    var matchedAuditEntries = getCellAuditEntriesFn(t17Corr.body.editAuditHistory, 'iiShift', 'ph', dbDoc.data.shifts.iiShift);
    assert.strictEqual(matchedAuditEntries.length, 1);
    assert.strictEqual(matchedAuditEntries[0].oldValue, '10.8');
    assert.strictEqual(matchedAuditEntries[0].newValue, '10.5');

    var isMarked = isFieldMarkedEditedFn(t17Corr.body.editedFields, ['iiShift_ph', 'iishift_ph', 'ph']);
    assert.strictEqual(isMarked, true);

    pass('T17: stored shape has exactly iShift/iiShift/iiiShift trimmed, legacy readings doc safe, audit entry has exact 10 fields, report-matcher passes');

    // T18: Fresh-date GET lockedShifts flat keys equal getInitialLockState({type:'shift',items:SHIFT_KEYS}) keys
    await PlantAnalysisRecord.deleteMany({});
    var t18FreshGet = await getReq(port, '/api/cbd-analysis?date=' + OP_DATE);
    assert.strictEqual(t18FreshGet.status, 200);
    var expectedInitial = getInitialLockState({ type: 'shift', items: SHIFT_KEYS });
    Object.keys(expectedInitial).forEach(function(k) {
      if (k === 'slots' || k === 'lockedSlots') return;
      if (typeof expectedInitial[k] === 'object') { assert.deepStrictEqual(t18FreshGet.body.lockedShifts[k], expectedInitial[k], 'Key ' + k + ' mismatch on fresh date'); } else { assert.strictEqual(t18FreshGet.body.lockedShifts[k], expectedInitial[k], 'Key ' + k + ' mismatch on fresh date'); }
    });

    // Save shift1
    var t18Save1 = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    var expectedAfterS1 = hydrateLockState({
      slots: {
        shift1: { isSaved: true, isLocked: false, correctionUsed: false },
        shift2: { isSaved: false, isLocked: false, correctionUsed: false },
        shift3: { isSaved: false, isLocked: false, correctionUsed: false },
      },
    }, { type: 'shift', items: SHIFT_KEYS });

    Object.keys(expectedAfterS1).forEach(function(k) {
      if (k === 'slots' || k === 'lockedSlots') return;
      if (typeof expectedAfterS1[k] === 'object') { assert.deepStrictEqual(t18Save1.body.lockedShifts[k], expectedAfterS1[k], 'Key ' + k + ' mismatch after shift1 save'); } else { assert.strictEqual(t18Save1.body.lockedShifts[k], expectedAfterS1[k], 'Key ' + k + ' mismatch after shift1 save'); }
    });

    // Save shift2
    var t18Save2 = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '25', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    var expectedAfterS2 = hydrateLockState({
      slots: {
        shift1: { isSaved: true, isLocked: true, correctionUsed: false },
        shift2: { isSaved: true, isLocked: false, correctionUsed: false },
        shift3: { isSaved: false, isLocked: false, correctionUsed: false },
      },
    }, { type: 'shift', items: SHIFT_KEYS });

    Object.keys(expectedAfterS2).forEach(function(k) {
      if (k === 'slots' || k === 'lockedSlots') return;
      if (typeof expectedAfterS2[k] === 'object') { assert.deepStrictEqual(t18Save2.body.lockedShifts[k], expectedAfterS2[k], 'Key ' + k + ' mismatch after shift2 save'); } else { assert.strictEqual(t18Save2.body.lockedShifts[k], expectedAfterS2[k], 'Key ' + k + ' mismatch after shift2 save'); }
    });
    pass('T18: flat lockedShifts keys match getInitialLockState and hydrateLockState');

    // T19: Audit entry after correction has flat fields (rowId, time, field, oldValue, newValue, editedBy, timestamp) and no changes[]
    var t19Corr = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '10.8', po4: '27', na2so3: '66', talk: '232', tfe: '2.8', sio2: '6.8', ss: '19', tds: '920' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t19Corr.status, 200);
    assert.strictEqual(t19Corr.body.editAuditHistory.length, 1);
    var entry = t19Corr.body.editAuditHistory[0];
    assert.strictEqual(entry.rowId, 'iiShift');
    assert.strictEqual(entry.time, 'iiShift');
    assert.strictEqual(entry.field, 'po4');
    assert.strictEqual(entry.oldValue, '25');
    assert.strictEqual(entry.newValue, '27');
    assert.strictEqual(entry.editedBy, 'Offsite Test Admin');
    assert.ok(entry.timestamp);
    assert.strictEqual(entry.changes, undefined);
    pass('T19: audit entry after correction has flat fields and no changes[]');

    // T22: TargetSlot alias acceptance ('iShift' / 'shift1')
    await PlantAnalysisRecord.deleteMany({});
    var t22Alias = await postReq(port, '/api/cbd-analysis', {
      date: OP_DATE,
      targetSlot: 'iShift',
      shifts: {
        iShift:   { ph: '11.0', po4: '26', na2so3: '68', talk: '234', tfe: '3', sio2: '7', ss: '20', tds: '938' },
        iiShift:  { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
        iiiShift: { ph: '', po4: '', na2so3: '', talk: '', tfe: '', sio2: '', ss: '', tds: '' },
      },
    });
    assert.strictEqual(t22Alias.status, 200);
    assert.strictEqual(t22Alias.body.lockedSlots.shift1.isSaved, true);
    pass('T22: targetSlot alias iShift correctly routes to shift1');

    console.log('\n------------------------------------------------------------------------');
    console.log('TOTAL TESTS PASSED: ' + totalPassed);
    console.log('------------------------------------------------------------------------\n');

  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

if (require.main === module) {
  runTests().then(function() {
    process.exit(0);
  }).catch(function(err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = runTests;

