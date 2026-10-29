'use strict';

var path = require('path');
var authCacheKey = require.resolve('../middleware/auth');
require.cache[authCacheKey] = {
  id:       authCacheKey,
  filename: authCacheKey,
  loaded:   true,
  exports: {
    protect: function(req, _res, next) {
      req.user = {
        _id:     '650000000000000000000001',
        name:    'SA Test Operator',
        role:    'admin',
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
var notifService = require('../services/plantNotificationService');
var { createCO2ShiftAnalysisRouter } = require('../routes/co2AnalysisRouteFactory');

// Helper to make IST Date
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

function getReq(port, path, date) {
  return new Promise(function(resolve, reject) {
    var fullPath = path + (date ? '?date=' + encodeURIComponent(date) : '');
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: fullPath,
      method: 'GET',
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

var CONFIGS = [
  {
    name: 'TK 401',
    path: '/api/sa-tk-401-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'TK 401 Analysis',
    unit: 'TK 401',
    tank: 'TK 401',
    parameters: ['fnh3', 'cnh3', 'tcl', 'pcl', 'tcao'],
    sampleRow: { fnh3: '3.97', cnh3: '1.92', tcl: '5.47', pcl: '3.55', tcao: '0.50' },
    correctionRow: { fnh3: '4.00', cnh3: '1.95', tcl: '5.50', pcl: '3.60', tcao: '0.60' },
  },
  {
    name: 'TK 405',
    path: '/api/sa-tk-405-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'TK 405 Analysis',
    unit: 'TK 405',
    tank: 'TK 405',
    parameters: ['fnh3', 'cnh3', 'tcl', 'pcl', 'tcao'],
    sampleRow: { fnh3: '3.86', cnh3: '1.89', tcl: '5.39', pcl: '3.50', tcao: '0.50' },
    correctionRow: { fnh3: '3.90', cnh3: '1.92', tcl: '5.42', pcl: '3.52', tcao: '0.60' },
  },
  {
    name: 'TK 414 TSC',
    path: '/api/sa-tk-414-tsc-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'TK 414 TSC TANK Analysis',
    analysisTypes: ['TK 414 TSC TANK Analysis', 'TK 414 TSC Tank Analysis', 'TK 414 Analysis'],
    unit: 'TK 414 TSC TANK',
    tank: 'TK 414 TSC TANK',
    parameters: ['fnh3', 'cnh3', 'tcl', 'pcl'],
    sampleRow: { fnh3: '1.40', cnh3: '4.10', tcl: '5.46', pcl: '1.36' },
    correctionRow: { fnh3: '1.45', cnh3: '4.15', tcl: '5.50', pcl: '1.40' },
  },
  {
    name: 'P413 WSC',
    path: '/api/sa-p413-wsc-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'P413 WSC TANK Analysis',
    analysisTypes: ['P413 WSC TANK Analysis', 'P413 WSC Tank Analysis', 'P413 Analysis'],
    unit: 'P413 WSC TANK',
    tank: 'P413 WSC TANK',
    parameters: ['fnh3', 'cnh3', 'tcl', 'pcl'],
    sampleRow: { fnh3: '1.58', cnh3: '4.09', tcl: '5.45', pcl: '1.36' },
    correctionRow: { fnh3: '1.62', cnh3: '4.12', tcl: '5.48', pcl: '1.40' },
  },
  {
    name: 'TK 419 SC',
    path: '/api/sa-tk-419-sc-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'TK 419 SC TANK Analysis',
    analysisTypes: ['TK 419 SC TANK Analysis', 'TK 419 SC Tank Analysis', 'TK 419 Analysis'],
    unit: 'TK 419 SC TANK',
    tank: 'TK 419 SC TANK',
    parameters: ['fnh3', 'cnh3'],
    sampleRow: { fnh3: '2.08', cnh3: '4.06' },
    correctionRow: { fnh3: '2.12', cnh3: '4.10' },
  },
  {
    name: 'P417-1',
    path: '/api/sa-p417-1-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'P417 Analysis',
    unit: 'P417',
    tank: 'P417',
    parameters: ['fnh3', 'cnh3', 'tcl', 'nacl'],
    sampleRow: { fnh3: '2.08', cnh3: '1.50', tcl: '5.20', nacl: '98.5' },
    correctionRow: { fnh3: '2.10', cnh3: '1.55', tcl: '5.25', nacl: '98.7' },
  },
  {
    name: 'P417-2',
    path: '/api/sa-p417-2-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'P417-2 Analysis',
    unit: 'P417-2',
    tank: 'P417-2',
    parameters: ['fnh3', 'cnh3', 'tcl', 'nacl'],
    sampleRow: { fnh3: '2.08', cnh3: '1.50', tcl: '5.20', nacl: '98.5' },
    correctionRow: { fnh3: '2.10', cnh3: '1.55', tcl: '5.25', nacl: '98.7' },
  },
  {
    name: 'P417-3',
    path: '/api/sa-p417-3-analysis',
    plantName: 'SA Plant',
    plantCode: 'SA',
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    analysisType: 'P417-3 Analysis',
    unit: 'P417-3',
    tank: 'P417-3',
    parameters: ['fnh3', 'cnh3', 'tcl', 'nacl'],
    sampleRow: { fnh3: '2.08', cnh3: '1.50', tcl: '5.20', nacl: '98.5' },
    correctionRow: { fnh3: '2.10', cnh3: '1.55', tcl: '5.25', nacl: '98.7' },
  },
];

async function run() {
  console.log('========================================================================');
  console.log('SA SHIFT LOCK ROUTES INTEGRATION TESTS');
  console.log('========================================================================');

  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  // Ensure unique index
  try {
    await PlantAnalysisRecord.collection.createIndex(
      { plantCode: 1, analysisType: 1, date: 1, shift: 1, time: 1 },
      { unique: true }
    );
  } catch (_) {}

  // Mock notification workflow
  var origWorkflow = notifService.executeSaveAndEmailWorkflow;
  notifService.executeSaveAndEmailWorkflow = async function() {
    return { success: true, emailSent: false, emailStatus: 'disabled' };
  };

  var totalPass = 0, totalFail = 0;

  for (var c = 0; c < CONFIGS.length; c++) {
    var cfg = CONFIGS[c];
    console.log('');
    console.log('------------------------------------------------------------------------');
    console.log('  ' + cfg.name + ' - ' + cfg.analysisType);
    console.log('------------------------------------------------------------------------');

    await PlantAnalysisRecord.deleteMany({});

    var capturedNow = istDate(2026, 10, 27, 10, 0);
    var testDate = '2026-10-27';

    var router = createCO2ShiftAnalysisRouter({
      plantCodes: cfg.plantCodes,
      plantCode: cfg.plantCode,
      plantName: cfg.plantName,
      plantIdentifier: 'SA',
      analysisType: cfg.analysisType,
      analysisTypes: cfg.analysisTypes,
      unit: cfg.unit,
      tank: cfg.tank,
      parameters: cfg.parameters,
      unitKeys: ['s1', 's2', 's3'],
      shiftDisplayNames: { s1: 'I SHIFT', s2: 'II SHIFT', s3: 'III SHIFT' },
      dataKey: 'shifts',
      getNow: function() { return new Date(capturedNow); },
    });

    var app = express();
    app.use(express.json());
    app.use(cfg.path, router);

    var server = http.createServer(app);
    await new Promise(function(r) { server.listen(0, r); });
    var port = server.address().port;

    var pass = 0, fail = 0;

    function ok(label, cond, extra) {
      if (cond) { console.log('  PASS: ' + label); pass++; totalPass++; }
      else { console.log('  FAIL: ' + label + (extra ? ' -- ' + extra : '')); fail++; totalFail++; }
    }

    function P(body, hdrs) { return postReq(port, cfg.path, body, hdrs); }
    function G(date)        { return getReq(port, cfg.path, date);        }

    // T1: First save s1
    {
      var r = await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      ok('T1: First save s1 -> 200', r.status === 200, 'status=' + r.status + ' msg=' + (r.body && r.body.message));
      ok('T1: success true', r.body && r.body.success === true);
      ok('T1: noChange absent', !r.body.noChange);
      ok('T1: data.shifts.s1 present', r.body.data && r.body.data.shifts && r.body.data.shifts.s1 !== undefined);
      ok('T1: data.rows.s1 present',   r.body.data && r.body.data.rows && r.body.data.rows.s1 !== undefined);
      var ls = r.body.lockedShifts;
      ok('T1: s1Saved=true',  ls && ls.s1Saved === true);
      ok('T1: s2Saved=false', ls && ls.s2Saved === false);
      ok('T1: s3Saved=false', ls && ls.s3Saved === false);
      ok('T1: s1=false (open)',    ls && ls.s1 === false, 'got ' + (ls && ls.s1));
      ok('T1: s2=false (open)',    ls && ls.s2 === false, 'got ' + (ls && ls.s2));
      ok('T1: s3=true  (waiting)', ls && ls.s3 === true,  'got ' + (ls && ls.s3));
      ok('T1: no shift1 keys in lockedShifts', ls && ls.shift1Saved === undefined && ls.shift1 === undefined);
      ok('T1: editAuditHistory empty', Array.isArray(r.body.editAuditHistory) && r.body.editAuditHistory.length === 0);
      ok('T1: lockedSlots in response', r.body.lockedSlots !== undefined);
      ok('T1: lockedSlots.s1.isSaved=true', r.body.lockedSlots && r.body.lockedSlots.s1 && r.body.lockedSlots.s1.isSaved === true);

      // Verify persistence to PlantAnalysisRecord
      var dbDoc = await PlantAnalysisRecord.findOne({ date: testDate, plantCode: { $in: cfg.plantCodes }, analysisType: cfg.analysisType });
      ok('T1: PlantAnalysisRecord doc exists', dbDoc !== null);
      ok('T1: dbDoc.data.shifts.s1 exists', dbDoc && dbDoc.data && dbDoc.data.shifts && dbDoc.data.shifts.s1 !== undefined);
      ok('T1: dbDoc.data.rows.s1 exists',   dbDoc && dbDoc.data && dbDoc.data.rows && dbDoc.data.rows.s1 !== undefined);
      ok('T1: dbDoc data has no shift1 keys', dbDoc && dbDoc.data && dbDoc.data.lockedShifts && dbDoc.data.lockedShifts.shift1Saved === undefined);
    }

    // T2: s2-first 400
    {
      await PlantAnalysisRecord.deleteMany({});
      var r2 = await P({ date: testDate, shifts: { s2: cfg.sampleRow } });
      ok('T2: s2-first -> 400', r2.status === 400, 'status=' + r2.status + ' msg=' + (r2.body && r2.body.message));
      ok('T2: sequential message', r2.body && (r2.body.message.toLowerCase().includes('sequential') || r2.body.message.toLowerCase().includes('restrict')), 'msg=' + (r2.body && r2.body.message));
    }

    // T3: Correction then lock
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      var rc = await P({ date: testDate, shifts: { s1: cfg.correctionRow } });
      ok('T3: Correction -> 200', rc.status === 200, 'status=' + rc.status + ' msg=' + (rc.body && rc.body.message));
      ok('T3: editAuditHistory has entry', Array.isArray(rc.body.editAuditHistory) && rc.body.editAuditHistory.length > 0);
      ok('T3: editedFields not empty', Object.keys(rc.body.editedFields || {}).length > 0);
      var lsc = rc.body.lockedShifts;
      ok('T3: s1Saved=true',   lsc && lsc.s1Saved === true);
      ok('T3: s1Edits=1',      lsc && lsc.s1Edits === 1, 'got ' + (lsc && lsc.s1Edits));
      ok('T3: s1Locked=true',  lsc && lsc.s1Locked === true, 'got ' + (lsc && lsc.s1Locked));
      ok('T3: s1=true (disabled)', lsc && lsc.s1 === true, 'got ' + (lsc && lsc.s1));
      ok('T3: lockedSlots.s1.correctionUsed=true', rc.body.lockedSlots && rc.body.lockedSlots.s1 && rc.body.lockedSlots.s1.correctionUsed === true);
    }

    // T4: Locked edit 400
    {
      var secondCorrection = Object.assign({}, cfg.correctionRow);
      secondCorrection[cfg.parameters[0]] = '999';
      var r4 = await P({ date: testDate, shifts: { s1: secondCorrection } });
      ok('T4: Locked edit -> 400', r4.status === 400, 'status=' + r4.status + ' msg=' + (r4.body && r4.body.message));
    }

    // T5: Empty shift save 400
    {
      await PlantAnalysisRecord.deleteMany({});
      var emptyRow = {}; cfg.parameters.forEach(function(p) { emptyRow[p] = ''; });
      var r5 = await P({ date: testDate, shifts: { s1: emptyRow } });
      ok('T5: Empty s1 -> 400', r5.status === 400, 'status=' + r5.status + ' msg=' + (r5.body && r5.body.message));
    }

    // T6: Clear-all correction 400
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      var emptyRow2 = {}; cfg.parameters.forEach(function(p) { emptyRow2[p] = ''; });
      var r6 = await P({ date: testDate, shifts: { s1: emptyRow2 } });
      ok('T6: Clear-all correction -> 400', r6.status === 400, 'status=' + r6.status + ' msg=' + (r6.body && r6.body.message));
    }

    // T7: Multi-shift 400
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      var r7 = await P({ date: testDate, shifts: { s2: cfg.sampleRow, s3: cfg.sampleRow } });
      ok('T7: Multi-shift -> 400', r7.status === 400, 'status=' + r7.status + ' msg=' + (r7.body && r7.body.message));
    }

    // T8: Identical re-save 200 noChange
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      var r8 = await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      ok('T8: Identical re-save -> 200', r8.status === 200, 'status=' + r8.status);
      ok('T8: noChange=true', r8.body && r8.body.noChange === true, 'noChange=' + (r8.body && r8.body.noChange));
    }

    // T9: Concurrent saves 200+409
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      var origFind = PlantAnalysisRecord.find;
      var findCount = 0;
      var releaseBarrier;
      var findBarrier = new Promise(function(resolve) { releaseBarrier = resolve; });
      PlantAnalysisRecord.find = function() {
        findCount++;
        if (findCount >= 2) releaseBarrier();
        var args = arguments;
        var self = this;
        return findBarrier.then(function() { return origFind.apply(self, args); });
      };
      var p1 = P({ date: testDate, shifts: { s2: cfg.sampleRow } });
      var secondRow = Object.assign({}, cfg.sampleRow);
      secondRow[cfg.parameters[0]] = '999';
      var p2 = P({ date: testDate, shifts: { s2: secondRow } });
      var results = await Promise.all([p1, p2]);
      PlantAnalysisRecord.find = origFind;
      var statuses = [results[0].status, results[1].status].sort();
      ok('T9: One 200 one 409 on concurrent saves', statuses[0] === 200 && statuses[1] === 409, 'statuses=' + statuses.join(','));
    }

    // T10: Duplicate docs - GET returns canonical
    {
      await PlantAnalysisRecord.deleteMany({});
      await PlantAnalysisRecord.create({
        plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType,
        unit: cfg.unit, date: testDate, shift: 'I SHIFT',
        data: { shifts: { s1: cfg.sampleRow }, rows: { s1: cfg.sampleRow }, date: testDate },
        createdAt: new Date('2026-10-27T05:00:00Z'),
      });
      await PlantAnalysisRecord.create({
        plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType,
        unit: cfg.unit, date: testDate, shift: 'II SHIFT',
        data: { shifts: {}, rows: {}, date: testDate },
        createdAt: new Date('2026-10-27T04:00:00Z'),
      });
      var r10 = await G(testDate);
      ok('T10: GET -> 200', r10.status === 200, 'status=' + r10.status);
      ok('T10: data present', r10.body && r10.body.data !== undefined);
      var dataShifts = r10.body && r10.body.data && (r10.body.data.shifts || r10.body.data.rows);
      ok('T10: canonical has s1 data', dataShifts && dataShifts.s1 !== undefined && Object.keys(dataShifts.s1).length > 0);
    }

    // T11: 00:00-05:59 IST wraps to previous calendar day
    {
      await PlantAnalysisRecord.deleteMany({});
      capturedNow = istDate(2026, 10, 28, 1, 30);
      var r11 = await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      ok('T11: 01:30 IST Oct 28 -> operatingDate Oct 27 -> 200', r11.status === 200, 'status=' + r11.status + ' msg=' + (r11.body && r11.body.message));
      capturedNow = istDate(2026, 10, 27, 10, 0);
    }

    // T12: Security bypass rejected
    {
      await PlantAnalysisRecord.deleteMany({});
      var yesterday = '2026-10-26';
      var r12a = await P({ date: yesterday, shifts: { s1: cfg.sampleRow } }, { 'x-test-mode': 'true' });
      ok('T12: x-test-mode -> 400', r12a.status === 400, 'status=' + r12a.status);
      var r12b = await P({ date: yesterday, shifts: { s1: cfg.sampleRow } }, { 'x-test-now': istDate(2026,10,26,10,0).toISOString() });
      ok('T12: x-test-now  -> 400', r12b.status === 400, 'status=' + r12b.status);
      var r12c = await P({ date: yesterday, shifts: { s1: cfg.sampleRow } }, { 'x-test-env': 'true' });
      ok('T12: x-test-env  -> 400', r12c.status === 400, 'status=' + r12c.status);
      var r12d = await P({ date: yesterday, isTestMode: true, shifts: { s1: cfg.sampleRow } });
      ok('T12: payload.isTestMode -> 400', r12d.status === 400, 'status=' + r12d.status);
      var r12e = await P({ date: yesterday, now: istDate(2026,10,26,10,0).toISOString(), shifts: { s1: cfg.sampleRow } });
      ok('T12: payload.now -> 400', r12e.status === 400, 'status=' + r12e.status);
    }

    // T13: Legacy hydration cases
    {
      await PlantAnalysisRecord.deleteMany({});
      // Case A: no doc
      var r13a = await G(testDate);
      ok('T13A: no doc -> data null/empty', r13a.body && (r13a.body.data === null || (Array.isArray(r13a.body.data) && r13a.body.data.length === 0)));
      // Case B: only s1, no lockedSlots
      await PlantAnalysisRecord.create({ plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType, unit: cfg.unit, date: testDate, shift: 'I SHIFT', data: { shifts: { s1: cfg.sampleRow }, rows: { s1: cfg.sampleRow }, date: testDate } });
      var r13b = await G(testDate);
      ok('T13B: s1 -> lockedSlots.s1.isSaved=true', r13b.body && r13b.body.lockedSlots && r13b.body.lockedSlots.s1 && r13b.body.lockedSlots.s1.isSaved === true);
      ok('T13B: lockedSlots.s2.isSaved=false', r13b.body && r13b.body.lockedSlots && r13b.body.lockedSlots.s2 && r13b.body.lockedSlots.s2.isSaved === false);
      ok('T13B: lockedSlots.s2.isLocked=false', r13b.body && r13b.body.lockedSlots && r13b.body.lockedSlots.s2 && r13b.body.lockedSlots.s2.isLocked === false);
      // Case C: s1 locked, s2 saved, legacy lockedShifts
      await PlantAnalysisRecord.deleteMany({});
      await PlantAnalysisRecord.create({ plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType, unit: cfg.unit, date: testDate, shift: 'II SHIFT', data: { shifts: { s1: cfg.sampleRow, s2: cfg.correctionRow }, rows: { s1: cfg.sampleRow, s2: cfg.correctionRow }, lockedShifts: { s1Saved: true, s1Locked: true, s2Saved: true, s2Locked: false, s3Saved: false }, date: testDate } });
      var r13c = await G(testDate);
      ok('T13C: legacy s1Locked -> correctionUsed=true', r13c.body && r13c.body.lockedSlots && r13c.body.lockedSlots.s1 && r13c.body.lockedSlots.s1.correctionUsed === true);
      ok('T13C: lockedSlots.s2.isSaved=true', r13c.body && r13c.body.lockedSlots && r13c.body.lockedSlots.s2 && r13c.body.lockedSlots.s2.isSaved === true);
      // Case D: all locked (allPermanentlyLocked)
      await PlantAnalysisRecord.deleteMany({});
      await PlantAnalysisRecord.create({ plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType, unit: cfg.unit, date: testDate, shift: 'All', data: { shifts: { s1: cfg.sampleRow, s2: cfg.correctionRow, s3: cfg.sampleRow }, rows: { s1: cfg.sampleRow, s2: cfg.correctionRow, s3: cfg.sampleRow }, lockedShifts: { s1Saved: true, s1Locked: true, s1Edits: 1, s2Saved: true, s2Locked: true, s2Edits: 1, s3Saved: true, s3Locked: true, s3Edits: 1, allPermanentlyLocked: true }, date: testDate } });
      var r13d = await G(testDate);
      ok('T13D: all locked -> s3.isLocked=true', r13d.body && r13d.body.lockedSlots && r13d.body.lockedSlots.s3 && r13d.body.lockedSlots.s3.isLocked === true);
      ok('T13D: GET did not write extra doc', await PlantAnalysisRecord.countDocuments({ date: testDate }) === 1);
    }

    // T14: Flat lockedShifts exact values for every state
    {
      await PlantAnalysisRecord.deleteMany({});
      // s1 saved
      var r14a = await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      var ls14 = r14a.body.lockedShifts;
      ok('T14a: s1Saved=true',   ls14 && ls14.s1Saved === true);
      ok('T14a: s2Saved=false',  ls14 && ls14.s2Saved === false);
      ok('T14a: s3Saved=false',  ls14 && ls14.s3Saved === false);
      ok('T14a: s1Locked=false', ls14 && ls14.s1Locked === false, 'got ' + (ls14 && ls14.s1Locked));
      ok('T14a: s1Edits=0',      ls14 && ls14.s1Edits === 0);
      ok('T14a: s1=false',       ls14 && ls14.s1 === false, 'got ' + (ls14 && ls14.s1));
      ok('T14a: s2=false (open)', ls14 && ls14.s2 === false, 'got ' + (ls14 && ls14.s2));
      ok('T14a: s3=true (waiting)', ls14 && ls14.s3 === true,  'got ' + (ls14 && ls14.s3));
      // s2 saved
      var r14b = await P({ date: testDate, shifts: { s2: cfg.sampleRow } });
      var ls14b = r14b.body.lockedShifts;
      ok('T14b: s1=true after s2 save', ls14b && ls14b.s1 === true, 'got ' + (ls14b && ls14b.s1));
      ok('T14b: s2Saved=true', ls14b && ls14b.s2Saved === true);
      ok('T14b: s2=false (open)', ls14b && ls14b.s2 === false, 'got ' + (ls14b && ls14b.s2));
      ok('T14b: s3=false (open)', ls14b && ls14b.s3 === false, 'got ' + (ls14b && ls14b.s3));
      // correct s2
      var r14bc = await P({ date: testDate, shifts: { s2: cfg.correctionRow } });
      var ls14bc = r14bc.body.lockedShifts;
      ok('T14bc: s2Locked=true after correction', ls14bc && ls14bc.s2Locked === true, 'got ' + (ls14bc && ls14bc.s2Locked));
      ok('T14bc: s2Edits=1', ls14bc && ls14bc.s2Edits === 1, 'got ' + (ls14bc && ls14bc.s2Edits));
      ok('T14bc: s2=true (disabled)', ls14bc && ls14bc.s2 === true, 'got ' + (ls14bc && ls14bc.s2));
      // s3 saved
      var r14c = await P({ date: testDate, shifts: { s3: cfg.sampleRow } });
      var ls14c = r14c.body.lockedShifts;
      ok('T14c: s3Saved=true', ls14c && ls14c.s3Saved === true);
      ok('T14c: s3=false (open)', ls14c && ls14c.s3 === false, 'got ' + (ls14c && ls14c.s3));
      // correct s3 (permanently locked)
      var r14cc = await P({ date: testDate, shifts: { s3: cfg.correctionRow } });
      var ls14cc = r14cc.body.lockedShifts;
      ok('T14cc: s3Locked=true', ls14cc && ls14cc.s3Locked === true, 'got ' + (ls14cc && ls14cc.s3Locked));
      ok('T14cc: s3Edits=1', ls14cc && ls14cc.s3Edits === 1, 'got ' + (ls14cc && ls14cc.s3Edits));
      ok('T14cc: s3=true (disabled)', ls14cc && ls14cc.s3 === true, 'got ' + (ls14cc && ls14cc.s3));
    }

    // T15: Response shape contract
    {
      await PlantAnalysisRecord.deleteMany({});
      var r15 = await P({ date: testDate, shifts: { s1: cfg.sampleRow } });
      ok('T15: data present',               r15.body && r15.body.data !== undefined);
      ok('T15: data._id present',           r15.body && r15.body.data && r15.body.data._id !== undefined);
      ok('T15: data.rows present',          r15.body && r15.body.data && r15.body.data.rows !== undefined);
      ok('T15: data.shifts present',        r15.body && r15.body.data && r15.body.data.shifts !== undefined);
      ok('T15: data.lockedShifts present',  r15.body && r15.body.data && r15.body.data.lockedShifts !== undefined);
      ok('T15: data.lockedSlots present',   r15.body && r15.body.data && r15.body.data.lockedSlots !== undefined);
      ok('T15: data.editedFields present',  r15.body && r15.body.data && r15.body.data.editedFields !== undefined);
      ok('T15: data.editAuditHistory array',r15.body && r15.body.data && Array.isArray(r15.body.data.editAuditHistory));
      ok('T15: top lockedShifts',           r15.body && r15.body.lockedShifts !== undefined);
      ok('T15: top lockedSlots',            r15.body && r15.body.lockedSlots !== undefined);
      ok('T15: top editedFields',           r15.body && r15.body.editedFields !== undefined);
      ok('T15: top editAuditHistory array', r15.body && Array.isArray(r15.body.editAuditHistory));
      ok('T15: recordId present',           r15.body && r15.body.recordId !== undefined);
      ok('T15: emailSent=false',            r15.body && r15.body.emailSent === false);
      ok('T15: emailStatus=disabled',       r15.body && r15.body.emailStatus === 'disabled');
    }

    // T16: GET contract + no write
    {
      var docsBefore = await PlantAnalysisRecord.countDocuments({ date: testDate });
      var r16 = await G(testDate);
      var docsAfter  = await PlantAnalysisRecord.countDocuments({ date: testDate });
      ok('T16: GET -> 200', r16.status === 200);
      ok('T16: lockedSlots at top level', r16.body && r16.body.lockedSlots !== undefined);
      ok('T16: lockedShifts at top level', r16.body && r16.body.lockedShifts !== undefined);
      ok('T16: GET returns data.shifts', r16.body && r16.body.data && r16.body.data.shifts !== undefined);
      ok('T16: GET returns data.rows', r16.body && r16.body.data && r16.body.data.rows !== undefined);
      ok('T16: GET no write', docsAfter === docsBefore, 'before=' + docsBefore + ' after=' + docsAfter);
    }

    // T17: Real client payload shapes & unique index verification
    {
      await PlantAnalysisRecord.deleteMany({});
      var allEmpty = {}; cfg.parameters.forEach(function(p) { allEmpty[p] = ''; });

      // (a) payload {s1:data, s2:allEmpty, s3:allEmpty} first save -> 200 and s2/3 untouched
      var r17a = await P({ date: testDate, shifts: { s1: cfg.sampleRow, s2: allEmpty, s3: allEmpty }, shiftKey: 's1' });
      ok('T17a: client first save -> 200', r17a.status === 200, 'status=' + r17a.status + ' msg=' + (r17a.body && r17a.body.message));
      ok('T17a: s1Saved=true', r17a.body && r17a.body.lockedSlots && r17a.body.lockedSlots.s1 && r17a.body.lockedSlots.s1.isSaved === true);
      ok('T17a: s2 untouched', r17a.body && r17a.body.lockedSlots && r17a.body.lockedSlots.s2 && r17a.body.lockedSlots.s2.isSaved === false);
      ok('T17a: s3 untouched', r17a.body && r17a.body.lockedSlots && r17a.body.lockedSlots.s3 && r17a.body.lockedSlots.s3.isSaved === false);
      var docA = await PlantAnalysisRecord.findOne({ plantCode: cfg.plantCode, analysisType: cfg.analysisType, date: testDate });
      ok('T17a: doc has shift All Shifts', docA && docA.shift === 'All Shifts', 'shift=' + (docA && docA.shift));

      // (b) s2 save with s1 present+unchanged and s3 empty -> 200
      var r17b = await P({ date: testDate, shifts: { s1: cfg.sampleRow, s2: cfg.sampleRow, s3: allEmpty }, shiftKey: 's2' });
      ok('T17b: s2 save with s1 present+unchanged -> 200', r17b.status === 200, 'status=' + r17b.status + ' msg=' + (r17b.body && r17b.body.message));
      ok('T17b: s2Saved=true', r17b.body && r17b.body.lockedSlots && r17b.body.lockedSlots.s2 && r17b.body.lockedSlots.s2.isSaved === true);
      ok('T17b: s1 locked after s2 save', r17b.body && r17b.body.lockedSlots && r17b.body.lockedSlots.s1 && r17b.body.lockedSlots.s1.isLocked === true);

      // (c) unique index preserved
      var totalDocs = await PlantAnalysisRecord.countDocuments({ plantCode: cfg.plantCode, analysisType: cfg.analysisType, date: testDate });
      ok('T17c: unique index preserved 1 doc without E11000', totalDocs === 1, 'count=' + totalDocs);
      var docC = await PlantAnalysisRecord.findOne({ plantCode: cfg.plantCode, analysisType: cfg.analysisType, date: testDate });
      ok('T17c: doc shift remains All Shifts', docC && docC.shift === 'All Shifts', 'shift=' + (docC && docC.shift));
    }

    // T18: Real-client 3-shift payload re-save, correction, and sequential transition
    {
      await PlantAnalysisRecord.deleteMany({});
      var allEmpty = {}; cfg.parameters.forEach(function(p) { allEmpty[p] = ''; });

      // First save s1 with real 3-shift payload
      var initSave = await P({ date: testDate, shifts: { s1: cfg.sampleRow, s2: allEmpty, s3: allEmpty }, shiftKey: 's1' });
      ok('T18 init: s1 save -> 200', initSave.status === 200);

      // (a) real-client payload re-save (3 shifts, s1 saved unchanged, 2/3 empty) -> 200 noChange
      var r18a = await P({ date: testDate, shifts: { s1: cfg.sampleRow, s2: allEmpty, s3: allEmpty }, shiftKey: 's1' });
      ok('T18a: re-save s1 unchanged -> 200 noChange', r18a.status === 200 && r18a.body && r18a.body.noChange === true, 'status=' + r18a.status + ' noChange=' + (r18a.body && r18a.body.noChange));

      // (b) same with s1 correction changed -> 200 correction
      var r18b = await P({ date: testDate, shifts: { s1: cfg.correctionRow, s2: allEmpty, s3: allEmpty }, shiftKey: 's1' });
      ok('T18b: s1 correction changed -> 200', r18b.status === 200, 'status=' + r18b.status);
      ok('T18b: s1 correctionUsed=true', r18b.body && r18b.body.lockedSlots && r18b.body.lockedSlots.s1 && r18b.body.lockedSlots.s1.correctionUsed === true);
      ok('T18b: s1 isLocked=true after correction', r18b.body && r18b.body.lockedSlots && r18b.body.lockedSlots.s1 && r18b.body.lockedSlots.s1.isLocked === true);

      // (d) s2 first save with real 3-shift payload -> 200
      var r18d = await P({ date: testDate, shifts: { s1: cfg.correctionRow, s2: cfg.sampleRow, s3: allEmpty }, shiftKey: 's2' });
      ok('T18d: s2 first save with real 3-shift payload -> 200', r18d.status === 200, 'status=' + r18d.status);
      ok('T18d: s2Saved=true', r18d.body && r18d.body.lockedSlots && r18d.body.lockedSlots.s2 && r18d.body.lockedSlots.s2.isSaved === true);

      // (c) s1+s2 saved, s3 empty, unchanged re-save -> 200 noChange
      var r18c = await P({ date: testDate, shifts: { s1: cfg.correctionRow, s2: cfg.sampleRow, s3: allEmpty }, shiftKey: 's2' });
      ok('T18c: s1+s2 saved, s3 empty, unchanged re-save -> 200 noChange', r18c.status === 200 && r18c.body && r18c.body.noChange === true, 'status=' + r18c.status + ' noChange=' + (r18c.body && r18c.body.noChange));
    }

    // Alias read query check (if config has analysisTypes aliases)
    if (cfg.analysisTypes && cfg.analysisTypes.length > 1) {
      await PlantAnalysisRecord.deleteMany({});
      var aliasType = cfg.analysisTypes[cfg.analysisTypes.length - 1]; // e.g. 'TK 414 Analysis'
      await PlantAnalysisRecord.create({
        plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: aliasType,
        unit: cfg.unit, date: testDate, shift: 'All Shifts',
        data: { shifts: { s1: cfg.sampleRow }, rows: { s1: cfg.sampleRow }, date: testDate },
      });
      var rAliasGet = await G(testDate);
      ok('Alias check: GET finds doc created under alias ' + aliasType, rAliasGet.status === 200 && rAliasGet.body && rAliasGet.body.data !== null);
      var rAliasPost = await P({ date: testDate, shifts: { s2: cfg.sampleRow }, shiftKey: 's2' });
      ok('Alias check: POST on existing alias doc succeeds -> 200', rAliasPost.status === 200);
      var canonicalInDb = await PlantAnalysisRecord.findOne({ date: testDate, plantCode: { $in: cfg.plantCodes } });
      ok('Alias check: doc exists in DB with canonical analysisType', canonicalInDb && canonicalInDb.analysisType === cfg.analysisType, 'got ' + (canonicalInDb && canonicalInDb.analysisType));
    }

    server.close();
  }

  notifService.executeSaveAndEmailWorkflow = origWorkflow;
  await mongoose.disconnect();
  await mongod.stop();

  console.log('');
  console.log('========================================================================');
  console.log('TOTAL: ' + totalPass + ' passed, ' + totalFail + ' failed');
  console.log('========================================================================');

  if (totalFail > 0) {
    process.exit(1);
  }
}

run().catch(function(err) {
  console.error('Fatal test error:', err);
  process.exit(1);
});
