/**
 * server/tests/co2WeeklyLockRoutes.integration.test.js
 *
 * Integration tests for createCO2WeeklyAnalysisRouter (CO2 weekly analyses),
 * parametrized over all 4 CO2 weekly analysis configs:
 *  - DCC DRAIN LIQ
 *  - SOX DRAIN LIQ
 *  - ABSORBER DRAIN LIQ
 *  - LEAN Weekly (with its 8 parameters)
 *
 * Covers:
 *  1.  First save (success 200, initialSaved true, editCount 0, isLocked false, lockedSlots.week)
 *  2.  Empty first save 400
 *  3.  Correction save -> lock (initialSaved true, editCount 1, isLocked true, editedFields, editAuditHistory)
 *  4.  3rd save 400 (locked after one correction)
 *  5.  Clear-all correction 400
 *  6.  Identical re-save 200 noChange (no correction consumed, no lock)
 *  7.  Concurrent saves (200 + 409)
 *  8.  Duplicate docs (POST/GET/update hit the same canonical doc)
 *  9.  Legacy doc hydration (initialSaved/editCount=1 -> lockedSlots.week locked in memory)
 * 10.  Operating date guard: 01:30 IST resolves to D-1; x-test-* and payload bypass fields return 400
 * 11.  GET writes nothing to MongoDB
 * 12.  Response shape contract (top-level and data.* both include isLocked, initialSaved, editCount, editedFields, lockedSlots)
 */

'use strict';

const path = require('path');
const authCacheKey = require.resolve('../middleware/auth');
require.cache[authCacheKey] = {
  id: authCacheKey,
  filename: authCacheKey,
  loaded: true,
  exports: {
    protect: function(req, _res, next) {
      req.user = {
        _id: '650000000000000000000001',
        name: 'CO2 Weekly Test Operator',
        role: 'admin',
        company: '650000000000000000000002',
      };
      next();
    },
  },
};

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
const { createCO2WeeklyAnalysisRouter } = require('../routes/co2AnalysisRouteFactory');

/* Stub email workflow */
const notifService = require('../services/plantNotificationService');
notifService.executeSaveAndEmailWorkflow = async function() {
  return { success: true, emailSent: false, emailStatus: 'disabled' };
};

/* --- IST helpers ---------------------------------------------------------- */

function istDate(year, month, day, hour, minute) {
  minute = minute || 0;
  var istMinutes = hour * 60 + minute;
  var utcMinutes = istMinutes - 330;
  return new Date(Date.UTC(year, month - 1, day, 0, utcMinutes, 0));
}

/* --- 4 CO2 weekly configs ------------------------------------------------- */

var CONFIGS = [
  {
    name: 'DCC Drain Liq',
    path: '/api/dcc-drain-liq-analysis',
    analysisType: 'DCC DRAIN LIQ Analysis',
    unit: 'DCC DRAIN LIQ',
    tank: 'DCC DRAIN LIQ',
    parameters: ['cl', 'so4', 'fe', 'tss'],
    sampleRow: { cl: '500', so4: '1500', fe: '10', tss: '50' },
    correctionRow: { cl: '501', so4: '1500', fe: '10', tss: '50' },
    thirdRow: { cl: '502', so4: '1500', fe: '10', tss: '50' },
  },
  {
    name: 'SOX Drain Liq',
    path: '/api/sox-drain-liq-analysis',
    analysisType: 'SOX DRAIN LIQ Analysis',
    unit: 'SOX DRAIN LIQ',
    tank: 'SOX DRAIN LIQ',
    parameters: ['cl', 'so4', 'fe', 'tss'],
    sampleRow: { cl: '400', so4: '1200', fe: '8', tss: '40' },
    correctionRow: { cl: '401', so4: '1200', fe: '8', tss: '40' },
    thirdRow: { cl: '402', so4: '1200', fe: '8', tss: '40' },
  },
  {
    name: 'Absorber Drain Liq',
    path: '/api/absorber-drain-liq-analysis',
    analysisType: 'ABSORBER DRAIN LIQ Analysis',
    unit: 'ABSORBER DRAIN LIQ',
    tank: 'ABSORBER DRAIN LIQ',
    parameters: ['cl', 'so4', 'fe', 'tss'],
    sampleRow: { cl: '300', so4: '900', fe: '6', tss: '30' },
    correctionRow: { cl: '301', so4: '900', fe: '6', tss: '30' },
    thirdRow: { cl: '302', so4: '900', fe: '6', tss: '30' },
  },
  {
    name: 'Lean Weekly',
    path: '/api/lean-weekly-analysis',
    analysisType: 'LEAN Weekly Analysis',
    unit: 'LEAN',
    tank: 'LEAN',
    parameters: ['cl', 'so4', 'fe', 'tss', 'na', 'k', 'no2', 'no3'],
    sampleRow: { cl: '10', so4: '20', fe: '1', tss: '5', na: '2', k: '3', no2: '0.5', no3: '1.5' },
    correctionRow: { cl: '11', so4: '20', fe: '1', tss: '5', na: '2', k: '3', no2: '0.5', no3: '1.5' },
    thirdRow: { cl: '12', so4: '20', fe: '1', tss: '5', na: '2', k: '3', no2: '0.5', no3: '1.5' },
  },
];

/* --- Helpers -------------------------------------------------------------- */

function postReq(port, apiPath, body, extraHeaders) {
  extraHeaders = extraHeaders || {};
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var req = http.request(
      {
        host: '127.0.0.1',
        port: port,
        path: apiPath,
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
          extraHeaders
        ),
        agent: false,
      },
      function(res) {
        var raw = '';
        res.on('data', function(c) { raw += c; });
        res.on('end', function() {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getReq(port, apiPath, date) {
  return new Promise(function(resolve, reject) {
    var req = http.request(
      {
        host: '127.0.0.1',
        port: port,
        path: apiPath + '?date=' + date,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        agent: false,
      },
      function(res) {
        var raw = '';
        res.on('data', function(c) { raw += c; });
        res.on('end', function() {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/* --- Main Test Runner ----------------------------------------------------- */

async function run() {
  var mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  try {
    await PlantAnalysisRecord.collection.createIndex(
      { plantCode: 1, analysisType: 1, date: 1 },
      { unique: false }
    );
  } catch (e) {}

  var totalPass = 0;
  var totalFail = 0;

  for (var ci = 0; ci < CONFIGS.length; ci++) {
    var cfg = CONFIGS[ci];
    console.log('');
    console.log('------------------------------------------------------------------------');
    console.log('  ' + cfg.name + ' - ' + cfg.analysisType);
    console.log('------------------------------------------------------------------------');

    await PlantAnalysisRecord.deleteMany({});

    var capturedNow = istDate(2026, 10, 27, 10, 0);
    var testDate = '2026-10-27';

    var router = createCO2WeeklyAnalysisRouter({
      analysisType: cfg.analysisType,
      unit: cfg.unit,
      tank: cfg.tank,
      parameters: cfg.parameters,
      frequency: 'Once in a Week',
      getNow: function() { return new Date(capturedNow); },
    });

    var app = express();
    app.use(express.json());
    app.use(cfg.path, router);

    var server = http.createServer(app);
    await new Promise(function(r) { server.listen(0, r); });
    var port = server.address().port;

    var pass = 0, fail = 0;
    function ok(label, cond, detail) {
      if (cond) {
        pass++;
        totalPass++;
        console.log('  PASS: ' + label);
      } else {
        fail++;
        totalFail++;
        console.error('  FAIL: ' + label + (detail ? ' (' + detail + ')' : ''));
      }
    }

    function P(body, headers) {
      return postReq(port, cfg.path, body, headers);
    }
    function G(date) {
      return getReq(port, cfg.path, date);
    }

    // T1: First save
    {
      await PlantAnalysisRecord.deleteMany({});
      var r1 = await P({ date: testDate, rows: { week: cfg.sampleRow } });
      ok('T1: First save -> 200', r1.status === 200, 'status=' + r1.status);
      ok('T1: success true', r1.body && r1.body.success === true);
      ok('T1: noChange absent/falsy', !r1.body?.noChange);
      ok('T1: initialSaved=true', r1.body?.initialSaved === true && r1.body?.data?.initialSaved === true);
      ok('T1: isLocked=false', r1.body?.isLocked === false && r1.body?.data?.isLocked === false);
      ok('T1: editCount=0', r1.body?.editCount === 0 && r1.body?.data?.editCount === 0);
      ok('T1: lockedSlots.week.isSaved=true', r1.body?.lockedSlots?.week?.isSaved === true);
      ok('T1: lockedSlots.week.isLocked=false', r1.body?.lockedSlots?.week?.isLocked === false);
      ok('T1: lockedSlots.week.correctionUsed=false', r1.body?.lockedSlots?.week?.correctionUsed === false);
      ok('T1: editAuditHistory empty', Array.isArray(r1.body?.editAuditHistory) && r1.body.editAuditHistory.length === 0);
    }

    // T2: Empty first save 400
    {
      await PlantAnalysisRecord.deleteMany({});
      var emptyRow = {};
      cfg.parameters.forEach(function(p) { emptyRow[p] = null; });
      var r2 = await P({ date: testDate, rows: { week: emptyRow } });
      ok('T2: Empty first save -> 400', r2.status === 400, 'status=' + r2.status);
    }

    // T3: Correction -> lock
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { week: cfg.sampleRow } });
      var r3 = await P({ date: testDate, rows: { week: cfg.correctionRow } });
      ok('T3: Correction -> 200', r3.status === 200, 'status=' + r3.status);
      ok('T3: initialSaved=true', r3.body?.initialSaved === true && r3.body?.data?.initialSaved === true);
      ok('T3: isLocked=true', r3.body?.isLocked === true && r3.body?.data?.isLocked === true);
      ok('T3: editCount=1', r3.body?.editCount === 1 && r3.body?.data?.editCount === 1);
      ok('T3: lockedSlots.week.isLocked=true', r3.body?.lockedSlots?.week?.isLocked === true);
      ok('T3: lockedSlots.week.correctionUsed=true', r3.body?.lockedSlots?.week?.correctionUsed === true);
      ok('T3: editedFields has week_cl', r3.body?.editedFields && r3.body.editedFields.week_cl === true);
      ok('T3: editAuditHistory recorded', Array.isArray(r3.body?.editAuditHistory) && r3.body.editAuditHistory.length >= 1);
    }

    // T4: 3rd save 400 (locked after one correction)
    {
      var r4 = await P({ date: testDate, rows: { week: cfg.thirdRow } });
      ok('T4: 3rd save -> 400', r4.status === 400, 'status=' + r4.status);
      ok('T4: locked error message', r4.body && String(r4.body.message).toLowerCase().includes('locked'));
    }

    // T5: Clear-all correction 400
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { week: cfg.sampleRow } });
      var clearedRow = {};
      cfg.parameters.forEach(function(p) { clearedRow[p] = ''; });
      var r5 = await P({ date: testDate, rows: { week: clearedRow } });
      ok('T5: Clear-all correction -> 400', r5.status === 400, 'status=' + r5.status);
    }

    // T6: Identical noChange (no correction consumed, no lock)
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { week: cfg.sampleRow } });
      var r6 = await P({ date: testDate, rows: { week: cfg.sampleRow } });
      ok('T6: Identical re-save -> 200', r6.status === 200, 'status=' + r6.status);
      ok('T6: noChange=true', r6.body && r6.body.noChange === true);

      // Verify slot is still open for its single correction!
      var r6get = await G(testDate);
      ok('T6: still EDITABLE after identical save', r6get.body?.initialSaved === true && r6get.body?.isLocked === false && r6get.body?.editCount === 0);
    }

    // T7: Concurrent saves (200 + 409)
    {
      await PlantAnalysisRecord.deleteMany({});
      var pA = P({ date: testDate, rows: { week: cfg.sampleRow } });
      var pB = P({ date: testDate, rows: { week: cfg.sampleRow } });
      var pair = await Promise.all([pA, pB]);
      var statuses = pair.map(function(r) { return r.status; }).sort();
      ok('T7: Concurrent saves handled safely', (statuses[0] === 200 && (statuses[1] === 200 || statuses[1] === 409)), 'got: ' + statuses.join(','));
    }

    // T8: Duplicate docs (POST/GET/update hit the same canonical doc)
    {
      await PlantAnalysisRecord.deleteMany({});
      var idOld = new mongoose.Types.ObjectId();
      var idNew = new mongoose.Types.ObjectId();

      // Older doc with data
      await PlantAnalysisRecord.collection.insertOne({
        _id: idOld,
        plantCode: 'CO2',
        plantName: 'CO2 Plant',
        analysisType: cfg.analysisType,
        date: testDate,
        data: {
          docTag: 'CANONICAL_WITH_DATA',
          initialSaved: true,
          editCount: 0,
          isLocked: false,
          rows: { week: cfg.sampleRow },
          lockedSlots: { week: { isSaved: true, isLocked: false, correctionUsed: false, editsCount: 0 } },
        },
        createdAt: new Date(Date.now() - 60000),
        updatedAt: new Date(Date.now() - 60000),
      });

      // Newer placeholder doc with no analytical values
      await PlantAnalysisRecord.collection.insertOne({
        _id: idNew,
        plantCode: 'CO2',
        plantName: 'CO2 Plant',
        analysisType: cfg.analysisType,
        date: testDate,
        data: {
          docTag: 'PLACEHOLDER_EMPTY',
          initialSaved: false,
          editCount: 0,
          isLocked: false,
          rows: { week: {} },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      var r8get = await G(testDate);
      ok('T8: GET picks canonical doc with data', r8get.body?.data?.rows?.week?.cl === cfg.sampleRow.cl);

      var r8post = await P({ date: testDate, rows: { week: cfg.correctionRow } });
      ok('T8: POST correction applied to canonical doc', r8post.status === 200);

      var canonicalDocAfter = await PlantAnalysisRecord.findById(idOld).lean();
      ok('T8: Canonical doc updated in DB', canonicalDocAfter.data?.rows?.week?.cl === cfg.correctionRow.cl);
      ok('T8: Canonical doc locked', canonicalDocAfter.data?.isLocked === true);
    }

    // T9: Legacy doc hydration
    {
      await PlantAnalysisRecord.deleteMany({});
      // Insert doc without lockedSlots, but with initialSaved=true, editCount=1, isLocked=true
      await PlantAnalysisRecord.collection.insertOne({
        plantCode: 'CO2',
        plantName: 'CO2 Plant',
        analysisType: cfg.analysisType,
        date: testDate,
        data: {
          initialSaved: true,
          editCount: 1,
          isLocked: true,
          rows: { week: cfg.correctionRow },
        },
        createdAt: new Date(),
      });

      var r9get = await G(testDate);
      ok('T9: Legacy doc GET derives isLocked=true', r9get.body?.isLocked === true);
      ok('T9: Legacy doc GET derives lockedSlots.week.isLocked=true', r9get.body?.lockedSlots?.week?.isLocked === true);
      ok('T9: Legacy doc GET derives lockedSlots.week.correctionUsed=true', r9get.body?.lockedSlots?.week?.correctionUsed === true);
      ok('T9: Legacy doc GET derives lockedSlots.week.isSaved=true', r9get.body?.lockedSlots?.week?.isSaved === true);
    }

    // T10: Operating date guard: 01:30 IST resolves to D-1; x-test-* bypass rejected
    {
      await PlantAnalysisRecord.deleteMany({});
      // 01:30 IST on Oct 28 -> operatingDate is Oct 27
      capturedNow = istDate(2026, 10, 28, 1, 30);
      var r10a = await P({ date: '2026-10-27', rows: { week: cfg.sampleRow } });
      ok('T10: 01:30 IST Oct 28 -> operatingDate Oct 27 -> 200', r10a.status === 200, 'status=' + r10a.status);

      var r10b = await P({ date: '2026-10-28', rows: { week: cfg.sampleRow } });
      ok('T10: 01:30 IST Oct 28 -> future Oct 28 -> 400', r10b.status === 400);

      // Reset capturedNow to 10:00 IST Oct 27 (operatingDate: 2026-10-27)
      capturedNow = istDate(2026, 10, 27, 10, 0);

      // Attempt to bypass with yesterday's date
      var yesterday = '2026-10-26';
      var r10c = await P({ date: yesterday, rows: { week: cfg.sampleRow } }, { 'x-test-mode': 'true' });
      ok('T10: x-test-mode header ignored -> 400', r10c.status === 400);

      var r10d = await P({ date: yesterday, rows: { week: cfg.sampleRow } }, { 'x-test-now': istDate(2026, 10, 26, 10, 0).toISOString() });
      ok('T10: x-test-now header ignored -> 400', r10d.status === 400);

      var r10e = await P({ date: yesterday, isTestMode: true, rows: { week: cfg.sampleRow } });
      ok('T10: payload.isTestMode ignored -> 400', r10e.status === 400);

      var r10f = await P({ date: yesterday, now: istDate(2026, 10, 26, 10, 0).toISOString(), rows: { week: cfg.sampleRow } });
      ok('T10: payload.now ignored -> 400', r10f.status === 400);
    }

    // T11: GET writes nothing to MongoDB
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { week: cfg.sampleRow } });
      var countBefore = await PlantAnalysisRecord.countDocuments({});
      var docBefore = await PlantAnalysisRecord.findOne({ date: testDate }).lean();

      await G(testDate);
      await G(testDate);

      var countAfter = await PlantAnalysisRecord.countDocuments({});
      var docAfter = await PlantAnalysisRecord.findOne({ date: testDate }).lean();

      ok('T11: GET does not change document count', countBefore === countAfter);
      ok('T11: GET does not write extra docs or overwrite data', docBefore?.data?.rows?.week?.cl === docAfter?.data?.rows?.week?.cl);
    }

    // T12: Response shape contract
    {
      await PlantAnalysisRecord.deleteMany({});
      var r12 = await P({ date: testDate, rows: { week: cfg.sampleRow } });
      ok('T12: top-level isLocked present', typeof r12.body.isLocked === 'boolean');
      ok('T12: top-level initialSaved present', typeof r12.body.initialSaved === 'boolean');
      ok('T12: top-level editCount present', typeof r12.body.editCount === 'number');
      ok('T12: top-level lockedSlots present', r12.body.lockedSlots && typeof r12.body.lockedSlots.week === 'object');
      ok('T12: top-level editedFields present', typeof r12.body.editedFields === 'object');
      ok('T12: top-level recordId present', Boolean(r12.body.recordId));
      ok('T12: top-level emailStatus=disabled', r12.body.emailStatus === 'disabled');

      ok('T12: data.isLocked present', typeof r12.body.data?.isLocked === 'boolean');
      ok('T12: data.initialSaved present', typeof r12.body.data?.initialSaved === 'boolean');
      ok('T12: data.editCount present', typeof r12.body.data?.editCount === 'number');
      ok('T12: data.lockedSlots present', r12.body.data?.lockedSlots && typeof r12.body.data.lockedSlots.week === 'object');
      ok('T12: data.editedFields present', typeof r12.body.data?.editedFields === 'object');
      ok('T12: data.rows.week present', Boolean(r12.body.data?.rows?.week));
    }

    server.close();
    console.log('  Summary: ' + pass + ' passed, ' + fail + ' failed');
  }

  await mongoose.disconnect();
  await mongod.stop();

  console.log('');
  console.log('========================================================================');
  console.log('TOTAL: ' + totalPass + ' passed, ' + totalFail + ' failed');
  console.log('========================================================================');

  if (totalFail > 0) process.exit(1);
}

run().catch(function(err) {
  console.error('Fatal error running weekly tests:', err);
  process.exit(1);
});
