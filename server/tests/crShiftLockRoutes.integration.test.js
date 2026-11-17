/**
 * server/tests/crShiftLockRoutes.integration.test.js
 *
 * Integration test suite for CR 202 time-slot locking and correction flow.
 * Tested against mongodb-memory-server with real PlantAnalysisRecord model.
 *
 * Covers:
 * 1. Save t07 (200, isSaved: true, t07 open for 1 correction window)
 * 2. Sequential rule: saving t11 before t07 is saved -> 400
 * 3. Save t11 with t07 sent unchanged in real-client payload shape (null/'' variants) -> 200 and t07 permanently locked
 * 4. t07 corrected while open, then t11 saved -> 200, editedFields recorded on t07, t07 permanently locked
 * 5. Edit of locked t07 -> 400 rejection
 * 6. Real two-slot change -> 400 rejection
 * 7. Identical re-save -> 200 noChange: true
 * 8. Role 'user' -> 403 Forbidden
 * 9. Empty slot save -> 400 rejection
 * 10. GET does not mutate MongoDB document
 */

'use strict';

process.env.NODE_ENV = 'test';

var path = require('path');
var authCacheKey = require.resolve('../middleware/auth');
var currentRole = 'admin';

require.cache[authCacheKey] = {
  id: authCacheKey,
  filename: authCacheKey,
  loaded: true,
  exports: {
    protect: function (req, _res, next) {
      req.user = {
        _id: '650000000000000000000001',
        name: 'CR202 Test Operator',
        role: currentRole,
        company: '650000000000000000000002',
      };
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
var { getOperatingDateIST } = require('../utils/operatingDate');
var cr202Router = require('../routes/cr202AnalysisRoutes');

function postReq(port, path, body, headers) {
  return new Promise(function (resolve, reject) {
    var data = JSON.stringify(body || {});
    var hdrs = Object.assign(
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      headers || {}
    );
    var req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: path,
        method: 'POST',
        headers: hdrs,
      },
      function (res) {
        var chunks = [];
        res.on('data', function (c) {
          chunks.push(c);
        });
        res.on('end', function () {
          var str = Buffer.concat(chunks).toString('utf8');
          var json;
          try {
            json = JSON.parse(str);
          } catch (_) {
            json = str;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getReq(port, path, date) {
  return new Promise(function (resolve, reject) {
    var p = path + (date ? '?date=' + encodeURIComponent(date) : '');
    var req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: p,
        method: 'GET',
      },
      function (res) {
        var chunks = [];
        res.on('data', function (c) {
          chunks.push(c);
        });
        res.on('end', function () {
          var str = Buffer.concat(chunks).toString('utf8');
          var json;
          try {
            json = JSON.parse(str);
          } catch (_) {
            json = str;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

var sampleT07 = {
  a: '3.10',
  b: '3.05',
  c: '3.12',
  d: '3.08',
  e: '3.11',
  f: '3.09',
  g: '3.15',
  h: '3.07',
  avgTcl: '4.65',
  avgAH: '3.10',
};

var sampleT11 = {
  a: '3.15',
  b: '3.08',
  c: '3.14',
  d: '3.10',
  e: '3.12',
  f: '3.05',
  g: '3.18',
  h: '3.10',
  avgTcl: '4.70',
  avgAH: '3.12',
};

async function run() {
  console.log('========================================================================');
  console.log('🧪 CR 202 TIME-SLOT LOCKING INTEGRATION TESTS');
  console.log('========================================================================\n');

  var mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await PlantAnalysisRecord.collection.createIndex(
    { plantCode: 1, analysisType: 1, date: 1 },
    { unique: true, sparse: true }
  );

  var app = express();
  app.use(express.json());
  app.use('/api/cr-202-analysis', cr202Router);

  var server = http.createServer(app);
  await new Promise(function (resolve) {
    server.listen(0, resolve);
  });
  var port = server.address().port;

  var passCount = 0;
  var failCount = 0;

  function ok(desc, condition, details) {
    if (condition) {
      console.log('  [PASS] ' + desc);
      passCount++;
    } else {
      console.error('  [FAIL] ' + desc + (details ? ' (' + details + ')' : ''));
      failCount++;
    }
  }

  var testDate = getOperatingDateIST(new Date());

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Role 'user' -> 403 Forbidden
    // -------------------------------------------------------------------------
    currentRole = 'user';
    var resUser = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      timeRows: { t07: sampleT07 },
    });
    ok('Role "user" returns 403 Forbidden', resUser.status === 403, 'status=' + resUser.status);
    currentRole = 'admin';

    // -------------------------------------------------------------------------
    // TEST 2: Sequential Restriction - saving t11 before t07 is saved -> 400
    // -------------------------------------------------------------------------
    var resT11First = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      timeRows: { t11: sampleT11 },
    });
    ok(
      'Sequential restriction: saving t11 before t07 is saved returns 400',
      resT11First.status === 400,
      'status=' + resT11First.status
    );

    // -------------------------------------------------------------------------
    // TEST 3: First save of t07 -> 200, isSaved: true, isLocked: false
    // -------------------------------------------------------------------------
    var resT07 = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't07',
      timeRows: { t07: sampleT07 },
    });
    ok('First save t07 returns 200', resT07.status === 200, 'status=' + resT07.status);
    var slotsT07 = resT07.body && resT07.body.lockedSlots;
    ok('t07 isSaved is true', slotsT07 && slotsT07.t07 && slotsT07.t07.isSaved === true);
    ok('t07 isLocked is false (open for correction)', slotsT07 && slotsT07.t07 && slotsT07.t07.isLocked === false);
    ok(
      'lockedShifts dual-write shift1Saved is true',
      resT07.body && resT07.body.lockedShifts && resT07.body.lockedShifts.shift1Saved === true
    );

    // -------------------------------------------------------------------------
    // TEST 4: Identical re-save of t07 -> 200 with noChange: true
    // -------------------------------------------------------------------------
    var resT07Same = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't07',
      timeRows: { t07: sampleT07 },
    });
    ok(
      'Identical re-save of t07 returns 200 noChange',
      resT07Same.status === 200 && resT07Same.body && resT07Same.body.noChange === true,
      'status=' + resT07Same.status
    );

    // -------------------------------------------------------------------------
    // TEST 5: Save t11 with t07 unchanged (null/'' string/number tolerance variants)
    //         -> 200, t07 becomes permanently locked!
    // -------------------------------------------------------------------------
    var t07ClientShape = {
      a: 3.1, // number variant
      b: '3.05',
      c: '3.12',
      d: '3.08',
      e: '3.11',
      f: '3.09',
      g: '3.15',
      h: '3.07',
      avgTcl: 4.65, // number variant
      avgAH: '3.10',
    };
    var resT11 = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't11',
      timeRows: {
        t07: t07ClientShape,
        t11: sampleT11,
      },
    });
    ok('Save t11 with unchanged t07 succeeds with 200', resT11.status === 200, 'status=' + resT11.status);
    var slotsAfterT11 = resT11.body && resT11.body.lockedSlots;
    ok('t07 is now permanently locked after t11 saved', slotsAfterT11 && slotsAfterT11.t07 && slotsAfterT11.t07.isLocked === true);
    ok('t11 is saved and open', slotsAfterT11 && slotsAfterT11.t11 && slotsAfterT11.t11.isSaved === true && slotsAfterT11.t11.isLocked === false);

    // -------------------------------------------------------------------------
    // TEST 6: Locked edit rejection - trying to edit locked t07 -> 400
    // -------------------------------------------------------------------------
    var resLockedT07Edit = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't07',
      timeRows: {
        t07: { ...sampleT07, a: '3.99' },
        t11: sampleT11,
      },
    });
    ok(
      'Editing locked t07 is rejected with 400',
      resLockedT07Edit.status === 400,
      'status=' + resLockedT07Edit.status
    );

    // -------------------------------------------------------------------------
    // TEST 7: Real two-slot change -> 400 multi-unit change rejection
    // -------------------------------------------------------------------------
    var sampleT15 = {
      a: '3.10',
      b: '3.10',
      c: '3.10',
      d: '3.10',
      e: '3.10',
      f: '3.10',
      g: '3.10',
      h: '3.10',
      avgTcl: '4.65',
      avgAH: '3.10',
    };
    var resTwoSlots = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      timeRows: {
        t07: sampleT07,
        t11: { ...sampleT11, a: '3.99' }, // modification
        t15: sampleT15, // new entry
      },
    });
    ok(
      'Simultaneous change in 2 slots returns 400',
      resTwoSlots.status === 400,
      'status=' + resTwoSlots.status
    );

    // -------------------------------------------------------------------------
    // TEST 8: Correction window on open slot (t11):
    //         Editing t11 -> 200, editedFields and editAuditHistory recorded, t11 locked
    // -------------------------------------------------------------------------
    var resT11Correction = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't11',
      timeRows: {
        t07: sampleT07,
        t11: { ...sampleT11, a: '3.20' }, // corrected value
      },
    });
    ok('Correction on open t11 returns 200', resT11Correction.status === 200, 'status=' + resT11Correction.status);
    ok(
      'Correction records editedFields for t11_a',
      resT11Correction.body && resT11Correction.body.editedFields && resT11Correction.body.editedFields.t11_a === true
    );
    ok(
      't11 is immediately locked after using correction',
      resT11Correction.body &&
        resT11Correction.body.lockedSlots &&
        resT11Correction.body.lockedSlots.t11 &&
        resT11Correction.body.lockedSlots.t11.isLocked === true
    );

    // -------------------------------------------------------------------------
    // TEST 9: Empty slot entry save -> 400 (whitespace-only empty slot)
    // -------------------------------------------------------------------------
    var emptySlotWithWhitespace = {
      a: '',
      b: null,
      c: '   ',
      d: undefined,
      e: '',
      f: '',
      g: '',
      h: '',
      avgTcl: '',
      avgAH: '',
    };
    var resEmpty = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't15',
      timeRows: {
        t07: sampleT07,
        t11: { ...sampleT11, a: '3.20' },
        t15: emptySlotWithWhitespace,
      },
    });
    ok(
      'Saving empty slot rejected with 400',
      resEmpty.status === 400 && resEmpty.body && resEmpty.body.message.includes('empty'),
      'status=' + resEmpty.status + ' msg=' + (resEmpty.body && resEmpty.body.message)
    );

    // -------------------------------------------------------------------------
    // TEST 10: GET does not write to MongoDB and hydrates lockedSlots
    // -------------------------------------------------------------------------
    var docBeforeGet = await PlantAnalysisRecord.findOne({ date: testDate }).lean();
    var versionBefore = docBeforeGet ? docBeforeGet.__v : null;

    var resGet = await getReq(port, '/api/cr-202-analysis', testDate);
    ok('GET returns 200', resGet.status === 200, 'status=' + resGet.status);
    ok(
      'GET returns hydrated lockedSlots',
      resGet.body && resGet.body.lockedSlots && resGet.body.lockedSlots.t07 && resGet.body.lockedSlots.t07.isLocked === true
    );

    var docAfterGet = await PlantAnalysisRecord.findOne({ date: testDate }).lean();
    ok('GET never modifies document in DB', docAfterGet && docAfterGet.__v === versionBefore);

    // -------------------------------------------------------------------------
    // TEST 9b: clear-all correction on an OPEN saved slot -> 400
    // (runs last: it wipes the collection and starts a fresh doc)
    // -------------------------------------------------------------------------
    await PlantAnalysisRecord.deleteMany({});
    currentRole = 'admin';
    var resFresh = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't07',
      timeRows: { t07: sampleT07 },
    });
    ok('Fresh doc: t07 save returns 200', resFresh.status === 200, 'status=' + resFresh.status);

    var clearedT07 = { a: '', b: '', c: '', d: '', e: '', f: '', g: '', h: '', avgTcl: '', avgAH: '' };
    var resClearAll = await postReq(port, '/api/cr-202-analysis', {
      date: testDate,
      targetSlot: 't07',
      timeRows: { t07: clearedT07 },
    });
    ok(
      'Clear-all correction on open saved t07 rejected with 400',
      resClearAll.status === 400 && !/permanently locked/i.test(String(resClearAll.body && resClearAll.body.message)),
      'status=' + resClearAll.status + ' msg=' + (resClearAll.body && resClearAll.body.message)
    );
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
    try { await mongoose.disconnect(); } catch (e) { console.warn('WARN disconnect:', e.code || e.message); }
    try { await mongod.stop(); } catch (e) { console.warn('WARN mongod.stop (Windows file lock, ignored):', e.code || e.message); }
  }

  console.log('\n========================================================================');
  console.log('TOTAL: ' + passCount + ' passed, ' + failCount + ' failed');
  console.log('========================================================================\n');

  if (failCount > 0) {
    throw new Error(failCount + ' tests failed in crShiftLockRoutes.integration.test.js');
  }
}

if (require.main === module) {
  run().catch(function (err) {
    console.error('CRASH:', err);
    process.exit(1);
  });
}

module.exports = { run };

