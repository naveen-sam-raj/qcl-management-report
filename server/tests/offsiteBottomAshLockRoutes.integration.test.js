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
var { createRouter: createBottomAshRouter } = require('../routes/bottomAshAnalysisRoutes');
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
  app.use('/api/bottom-ash-analysis', createBottomAshRouter({ getNow }));

  var server = http.createServer(app);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;

  var OP_DATE = '2026-10-28';
  var SHIFT_KEYS = ['shift1', 'shift2', 'shift3'];

  try {
    console.log('\n========================================================================');
    console.log('OFFSITE SUITE: BOTTOM ASH SHIFT ANALYSIS INTEGRATION TESTS');
    console.log('========================================================================');

    await PlantAnalysisRecord.deleteMany({});

    // T1: First save shift1 returns 200 and unlocks shift2
    var res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.2', gcv: '80', moisture: '22.5' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.shift2.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(res.body.lockedShifts.shift1Saved, true);
    assert.strictEqual(res.body.readings.length, 3);
    assert.strictEqual(res.body.readings[0].combustible, '1.2');
    pass('T1: first save shift1 opens shift2');

    // T2: Out-of-order save shift3 before shift2 -> 400
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      readings: [
        { id: '1', time: '07:00', combustible: '1.2', gcv: '80', moisture: '22.5' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '1.8', gcv: '85', moisture: '20.0' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Sequential restriction/i);
    pass('T2: out-of-order shift3 save rejected with 400');

    // T3: Correction on shift1 succeeds -> 200, sets flat editedFields, records flat editAuditHistory without changes[]
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.5', gcv: '82', moisture: '22.5' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.shift1.correctionUsed, true);
    assert.strictEqual(res.body.lockedSlots.shift1.isLocked, true);
    assert.strictEqual(res.body.editedFields['1_combustible'], true);
    assert.strictEqual(res.body.editedFields['07:00_combustible'], true);
    assert.strictEqual(res.body.editedFields['shift1_combustible'], true);
    assert.strictEqual(res.body.editedFields['1_gcv'], true);
    assert.strictEqual(res.body.editAuditHistory.length, 2);
    // Flat audit entry verification
    var auditEntry = res.body.editAuditHistory[0];
    assert.strictEqual(auditEntry.date, OP_DATE);
    assert.strictEqual(auditEntry.rowId, '1');
    assert.strictEqual(auditEntry.time, '07:00');
    assert.strictEqual(auditEntry.shift, 'I SHIFT');
    assert.strictEqual(auditEntry.field, 'combustible');
    assert.strictEqual(auditEntry.oldValue, '1.2');
    assert.strictEqual(auditEntry.newValue, '1.5');
    assert.strictEqual(auditEntry.editedBy, 'Offsite Test Admin');
    assert.ok(auditEntry.timestamp);
    assert.strictEqual(auditEntry.changes, undefined);
    pass('T3: correction succeeds with flat editedFields and flat editAuditHistory');

    // T4: Second correction on locked shift1 rejected with 400 (admin cannot edit locked)
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.7', gcv: '84', moisture: '22.5' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /permanently locked/i);
    pass('T4: second correction rejected with 400 (admin cannot edit locked)');

    // T5: Empty first save rejected with 400 for shift1 (fresh), shift2 (after shift1 saved), shift3 (after shift2 saved)
    // T5a: Fresh date shift1 empty save
    await PlantAnalysisRecord.deleteMany({});
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '', gcv: '', moisture: '' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Cannot save empty slot shift1. At least one non-empty value is required.');

    // Save shift1 with data
    await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });

    // T5b: After shift1 saved, shift2 empty save -> 400
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Cannot save empty slot shift2. At least one non-empty value is required.');

    // Save shift2 with data
    await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.3', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });

    // T5c: After shift2 saved, shift3 empty save -> 400
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.3', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'Cannot save empty slot shift3. At least one non-empty value is required.');
    pass('T5: empty first-save 400 for shift1 (fresh), shift2, shift3 with targetSlot');

    // T6: Shift2 save permanently locks shift1
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.9', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.3', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /permanently locked/i);
    pass('T6: shift2 save permanently locks shift1');

    // T7: Identical re-save returns 200 with noChange: true
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.3', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.noChange, true);
    assert.strictEqual(res.body.message, 'No changes');
    pass('T7: identical re-save returns 200 noChange: true');

    // T8: Multi-shift edit in single POST rejected with 400
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      readings: [
        { id: '1', time: '07:00', combustible: '2.0', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '2.0', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '2.0', gcv: '80', moisture: '21.0' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Only one unit slot may be entered or edited per save/i);
    pass('T8: multi-shift POST rejected with 400');

    // T9: Sequential save progression to shift3 and final lock
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.3', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '1.4', gcv: '79', moisture: '22.0' },
      ],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lockedSlots.shift3.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.shift2.isLocked, true);
    assert.strictEqual(res.body.lockedSlots.shift3.isLocked, false);
    pass('T9: shift3 first save succeeds and locks shift2');

    // T10: Deterministic race on concurrent POSTs with find barrier -> [200, 409]
    await PlantAnalysisRecord.deleteMany({});
    // Setup initial doc with shift1 saved
    await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
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

    var p1 = postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
        { id: '2', time: '15:00', combustible: '1.1', gcv: '71', moisture: '21.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    var p2 = postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
        { id: '2', time: '15:00', combustible: '1.2', gcv: '72', moisture: '22.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });

    var raceResults = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind; // Restore original find
    var statuses = raceResults.map(function(r) { return r.status; }).sort();
    assert.deepStrictEqual(statuses, [200, 409], 'Expected one 200 and one 409, got: ' + JSON.stringify(statuses));
    pass('T10: deterministic race condition returns [200, 409]');

    // T10b: Sequential second POST with different shift2 values after first save = valid correction 200
    var t10bRes = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
        { id: '2', time: '15:00', combustible: '1.8', gcv: '78', moisture: '25.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(t10bRes.status, 200);
    assert.strictEqual(t10bRes.body.lockedSlots.shift2.correctionUsed, true);
    assert.strictEqual(t10bRes.body.lockedSlots.shift2.isLocked, true);
    assert.strictEqual(t10bRes.body.readings[1].combustible, '1.8');
    pass('T10b: sequential second POST with different shift2 values = valid correction 200');

    // T11: Duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST
    // pickCanonicalDoc sorts by non-empty count, then tie-breaker updatedAt/createdAt DESC (analysisLockEngine.js:860-903)
    await PlantAnalysisRecord.deleteMany({});
    // Insert Doc A (older, 1 row saved)
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Bottom Ash Analysis',
      unit: 'Bottom ash',
      date: OP_DATE,
      createdAt: new Date('2026-10-28T07:00:00.000Z'),
      updatedAt: new Date('2026-10-28T07:00:00.000Z'),
      data: {
        id: 'docA_legacy',
        date: OP_DATE,
        readings: [
          { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
          { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
          { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
        ],
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
      analysisType: 'Bottom Ash Analysis',
      unit: 'Bottom ash',
      date: OP_DATE,
      createdAt: new Date('2026-10-28T15:00:00.000Z'),
      updatedAt: new Date('2026-10-28T15:00:00.000Z'),
      data: {
        id: 'docB_canonical',
        date: OP_DATE,
        readings: [
          { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
          { id: '2', time: '15:00', combustible: '1.4', gcv: '76', moisture: '21.0' },
          { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
        ],
        lockedSlots: {
          shift1: { isSaved: true, isLocked: true, correctionUsed: false },
          shift2: { isSaved: true, isLocked: false, correctionUsed: false },
          shift3: { isSaved: false, isLocked: false, correctionUsed: false },
        },
      },
    });

    // Proven on GET: returns Doc B
    var t11Get = await getReq(port, '/api/bottom-ash-analysis?date=' + OP_DATE);
    assert.strictEqual(t11Get.status, 200);
    assert.strictEqual(t11Get.body.recordId, docB._id.toString());
    assert.strictEqual(t11Get.body.readings[1].combustible, '1.4');

    // Proven on POST: POST on shift3 targets Doc B (shift2 was saved on B, so shift3 is allowed)
    var t11Post = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift3',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
        { id: '2', time: '15:00', combustible: '1.4', gcv: '76', moisture: '21.0' },
        { id: '3', time: '23:00', combustible: '1.6', gcv: '80', moisture: '22.0' },
      ],
    });
    assert.strictEqual(t11Post.status, 200);
    assert.strictEqual(t11Post.body.recordId, docB._id.toString());
    assert.strictEqual(t11Post.body.lockedSlots.shift3.isSaved, true);
    pass('T11: duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST');

    // T12: 06:00 IST boundary enforces operating day transition
    currentTime = istDate(2026, 10, 29, 1, 30); // 01:30 IST on Oct 29 -> op date 2026-10-28
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: '2026-10-28', // valid previous operating date
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.9', gcv: '70', moisture: '20.0' },
      ],
    });
    // Already saved all shifts on 2026-10-28 earlier, but date is accepted (shift1 is locked -> 400)
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /permanently locked/i);

    currentTime = istDate(2026, 10, 29, 6, 0); // 06:00 IST on Oct 29 -> op date 2026-10-29
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: '2026-10-28', // now yesterday -> rejected with 400
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Date restriction enforced/i);
    pass('T12: 06:00 IST boundary and 01:30 IST previous operating day strictly enforced');

    // Reset currentTime back to 10:00 IST on Oct 28
    currentTime = istDate(2026, 10, 28, 10, 0);

    // T12b: Date bypasses (x-test headers, payload.now, body.now future/past) strictly ignored -> 400
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: '2026-10-31',
      now: '2026-10-31T10:00:00.000Z',
      isTestMode: true,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
      ],
    }, {
      'x-test-mode': 'true',
      'x-test-now': '2026-10-31T10:00:00.000Z',
      'x-test-env': 'true',
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Date restriction enforced/i);
    pass('T12b: payload.now, body.now and x-test headers strictly ignored -> 400');

    // T13: Role user returns 403 Forbidden on GET and POST
    var getRoleUser = await getReq(port, '/api/bottom-ash-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(getRoleUser.status, 403);
    assert.match(getRoleUser.body.message, /Forbidden/i);

    var postRoleUser = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.0', gcv: '70', moisture: '20.0' },
      ],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(postRoleUser.status, 403);
    assert.match(postRoleUser.body.message, /Forbidden/i);
    pass('T13: role user returns 403 on GET and POST');

    // T14: Correction clearing all values of shift1 after its first save (still unlocked) = 400, message matches exact route string
    await PlantAnalysisRecord.deleteMany({});
    // First save of shift1
    await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.2', gcv: '80', moisture: '22.5' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    // Correction on shift1 clearing all values
    res = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '', gcv: '', moisture: '' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.message, 'A correction cannot clear all values in shift1. At least one non-empty value is required.');
    pass('T14: correction clearing all values of shift1 rejected with exact route message');

    // T15: GET returns canonical doc and does NOT write to database
    var countBefore = await PlantAnalysisRecord.countDocuments();
    var t15Res = await getReq(port, '/api/bottom-ash-analysis?date=' + OP_DATE);
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
      analysisType: 'Bottom Ash Analysis',
      unit: 'Bottom ash',
      date: OP_DATE,
      data: {
        id: 'legacy_doc_1',
        date: OP_DATE,
        readings: [
          { id: '1', time: '07:00', combustible: '1.2', gcv: '80', moisture: '22.5' },
        ],
        lockedShifts: {
          shift1Saved: true,
          shift1Locked: false,
          shift1Edits: 0,
        },
      },
    });

    var t16Get = await getReq(port, '/api/bottom-ash-analysis?date=' + OP_DATE);
    assert.strictEqual(t16Get.status, 200);
    assert.strictEqual(t16Get.body.lockedSlots.shift1.isSaved, true);
    assert.strictEqual(t16Get.body.lockedSlots.shift1.isLocked, false);
    assert.strictEqual(t16Get.body.lockedSlots.shift2.isSaved, false);
    assert.strictEqual(t16Get.body.lockedSlots.shift3.isSaved, false);
    assert.strictEqual(t16Get.body.readings.length, 3);
    pass('T16: legacy doc without lockedSlots hydrates correctly in memory');

    // T17: Readings shape and legacy odd rows preserved on save
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Bottom Ash Analysis',
      unit: 'Bottom ash',
      date: OP_DATE,
      data: {
        id: 'legacy_with_extra',
        date: OP_DATE,
        readings: [
          { id: '1', time: '07:00', combustible: '1.2', gcv: '80', moisture: '22.5' },
          { id: 'legacy_extra_row', time: '11:00', combustible: '1.0', gcv: '75', moisture: '21.0' },
        ],
        lockedSlots: {
          shift1: { isSaved: true, isLocked: false, correctionUsed: false },
          shift2: { isSaved: false, isLocked: false, correctionUsed: false },
          shift3: { isSaved: false, isLocked: false, correctionUsed: false },
        },
      },
    });

    var t17Post = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.2', gcv: '80', moisture: '22.5' },
        { id: '2', time: '15:00', combustible: '1.4', gcv: '82', moisture: '23.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(t17Post.status, 200);
    var savedReadings = t17Post.body.readings;
    assert.strictEqual(savedReadings.length, 4); // 3 template rows + 1 legacy extra row
    var extraFound = savedReadings.find(function(r) { return r.id === 'legacy_extra_row'; });
    assert.ok(extraFound);
    assert.strictEqual(extraFound.time, '11:00');
    pass('T17: readings shape and legacy extra rows preserved on save');

    // T18: Fresh-date GET lockedShifts flat keys equal getInitialLockState({type:'shift',items:SHIFT_KEYS}) keys;
    // also after shift1 save and shift2 first save compare with hydrateLockState output
    await PlantAnalysisRecord.deleteMany({});
    var t18FreshGet = await getReq(port, '/api/bottom-ash-analysis?date=' + OP_DATE);
    assert.strictEqual(t18FreshGet.status, 200);
    var expectedInitial = getInitialLockState({ type: 'shift', items: SHIFT_KEYS });
    Object.keys(expectedInitial).forEach(function(k) {
      if (k === 'slots' || k === 'lockedSlots') return;
      if (typeof expectedInitial[k] === 'object') { assert.deepStrictEqual(t18FreshGet.body.lockedShifts[k], expectedInitial[k], 'Key ' + k + ' mismatch on fresh date'); } else { assert.strictEqual(t18FreshGet.body.lockedShifts[k], expectedInitial[k], 'Key ' + k + ' mismatch on fresh date'); }
    });

    // Save shift1
    var t18Save1 = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift1',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '', gcv: '', moisture: '' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
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
    var t18Save2 = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.3', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
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
    var t19Corr = await postReq(port, '/api/bottom-ash-analysis', {
      date: OP_DATE,
      targetSlot: 'shift2',
      readings: [
        { id: '1', time: '07:00', combustible: '1.1', gcv: '75', moisture: '23.0' },
        { id: '2', time: '15:00', combustible: '1.6', gcv: '77', moisture: '24.0' },
        { id: '3', time: '23:00', combustible: '', gcv: '', moisture: '' },
      ],
    });
    assert.strictEqual(t19Corr.status, 200);
    assert.strictEqual(t19Corr.body.editAuditHistory.length, 1);
    var entry = t19Corr.body.editAuditHistory[0];
    assert.strictEqual(entry.rowId, '2');
    assert.strictEqual(entry.time, '15:00');
    assert.strictEqual(entry.field, 'combustible');
    assert.strictEqual(entry.oldValue, '1.3');
    assert.strictEqual(entry.newValue, '1.6');
    assert.strictEqual(entry.editedBy, 'Offsite Test Admin');
    assert.ok(entry.timestamp);
    assert.strictEqual(entry.changes, undefined);
    pass('T19: audit entry after correction has flat fields and no changes[]');

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
