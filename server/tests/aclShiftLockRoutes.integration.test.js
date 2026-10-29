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
        name:    'ACL Test Operator',
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
var PureSaltSieveAnalysis = require('../models/PureSaltSieveAnalysis');
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
    var p = path + (date ? '?date=' + encodeURIComponent(date) : '');
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: p,
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
    name: 'TK 204',
    path: '/api/tk-204-analysis',
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    plantCodes: ['ACL'],
    analysisType: 'TK 204 Analysis',
    unit: 'TK 204',
    tank: 'TK 204',
    parameters: ['fnh3', 'cnh3', 'tcl', 'pcl'],
    sampleRow: { fnh3: '1.2', cnh3: '2.3', tcl: '3.4', pcl: '4.5' },
    correctionRow: { fnh3: '1.5', cnh3: '2.5', tcl: '3.5', pcl: '4.8' },
  },
  {
    name: 'TK 209',
    path: '/api/tk-209-analysis',
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    plantCodes: ['ACL'],
    analysisType: 'TK 209 Analysis',
    unit: 'TK 209',
    tank: 'TK 209',
    parameters: ['fnh3', 'cnh3', 'tcl', 'pcl'],
    sampleRow: { fnh3: '1.0', cnh3: '2.0', tcl: '3.0', pcl: '4.0' },
    correctionRow: { fnh3: '1.2', cnh3: '2.2', tcl: '3.2', pcl: '4.2' },
  },
  {
    name: 'PCL/TCL',
    path: '/api/pcl-tcl-analysis',
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    plantCodes: ['ACL'],
    analysisType: 'PCL/TCL Analysis',
    unit: 'PCL/TCL',
    parameters: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    extraFields: { shiftRows: true },
    sampleRow: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8' },
    correctionRow: { a: '1.5', b: '2.5', c: '3.5', d: '4.5', e: '5.5', f: '6.5', g: '7.5', h: '8.5' },
  },
  {
    name: 'ACL 300#',
    path: '/api/acl-300-analysis',
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    plantCodes: ['ACL'],
    analysisType: 'ACL 300# Analysis',
    unit: 'ACL 300#',
    shiftDisplayNames: ['SHIFT 1', 'SHIFT 2', 'SHIFT 3'],
    dataKey: 'shifts',
    parameters: ['p18', 'p44', 'nacl'],
    sampleRow: { p18: '10', p44: '20', nacl: '99.5' },
    correctionRow: { p18: '12', p44: '22', nacl: '99.8' },
  },
  {
    name: 'Pure Salt Sieve',
    path: '/api/pure-salt-sieve-analysis',
    plantName: 'ACL Plant',
    plantCode: 'ACL',
    plantCodes: ['ACL'],
    analysisType: 'Pure Salt Sieve Analysis',
    unit: '',
    unitValue: '',
    parameters: ['p18', 'p44', 'p60', 'p100', 'm100'],
    sampleRow: { p18: '1', p44: '2', p60: '3', p100: '4', m100: '5' },
    correctionRow: { p18: '1.1', p44: '2.1', p60: '3.1', p100: '4.1', m100: '5.1' },
    onAfterSave: async function({ payload, mergedRows, updatedRecordData }) {
      if (mergedRows && (mergedRows.shift1 || mergedRows.shift2 || mergedRows.shift3)) {
        await PureSaltSieveAnalysis.findOneAndUpdate(
          { date: payload.date },
          {
            $set: {
              date: payload.date,
              plantCode: 'ACL',
              plantName: 'ACL Plant',
              analysisType: 'Pure Salt Sieve Analysis',
              unit: '',
              rows: {
                shift1: mergedRows.shift1 || {},
                shift2: mergedRows.shift2 || {},
                shift3: mergedRows.shift3 || {},
              },
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    },
  },
];

async function run() {
  console.log('========================================================================');
  console.log('ACL SHIFT LOCK ROUTES INTEGRATION TESTS');
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
    if (cfg.name === 'Pure Salt Sieve') {
      await PureSaltSieveAnalysis.deleteMany({});
    }

    var capturedNow = istDate(2026, 10, 27, 10, 0);
    var testDate = '2026-10-27';

    var router = createCO2ShiftAnalysisRouter({
      plantCodes: cfg.plantCodes,
      plantCode: cfg.plantCode,
      plantName: cfg.plantName,
      analysisType: cfg.analysisType,
      unit: cfg.unit,
      tank: cfg.tank,
      unitValue: cfg.unitValue,
      parameters: cfg.parameters,
      shiftDisplayNames: cfg.shiftDisplayNames,
      dataKey: cfg.dataKey,
      extraFields: cfg.extraFields,
      onAfterSave: cfg.onAfterSave,
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

    // T1: First save shift1
    {
      var r = await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      ok('T1: First save shift1 -> 200', r.status === 200, 'status=' + r.status + ' msg=' + (r.body && r.body.message));
      ok('T1: success true', r.body && r.body.success === true);
      ok('T1: noChange absent', !r.body.noChange);
      ok('T1: data.rows.shift1 present', r.body.data && r.body.data.rows && r.body.data.rows.shift1 !== undefined);
      var ls = r.body.lockedShifts;
      ok('T1: shift1Saved=true',  ls && ls.shift1Saved === true);
      ok('T1: shift2Saved=false', ls && ls.shift2Saved === false);
      ok('T1: shift3Saved=false', ls && ls.shift3Saved === false);
      ok('T1: shift1=false (open)',    ls && ls.shift1 === false, 'got ' + (ls && ls.shift1));
      ok('T1: shift2=false (open)',    ls && ls.shift2 === false, 'got ' + (ls && ls.shift2));
      ok('T1: shift3=true  (waiting)', ls && ls.shift3 === true,  'got ' + (ls && ls.shift3));
      ok('T1: editAuditHistory empty', Array.isArray(r.body.editAuditHistory) && r.body.editAuditHistory.length === 0);
      ok('T1: lockedSlots in response', r.body.lockedSlots !== undefined);
      ok('T1: lockedSlots.shift1.isSaved=true', r.body.lockedSlots && r.body.lockedSlots.shift1 && r.body.lockedSlots.shift1.isSaved === true);

      // ACL specific assert on T1
      if (cfg.name === 'ACL 300#') {
        ok('T1 extra: ACL 300# data.shifts present', r.body.data && r.body.data.shifts && r.body.data.shifts.shift1 !== undefined);
        ok('T1 extra: ACL 300# data.rows present', r.body.data && r.body.data.rows && r.body.data.rows.shift1 !== undefined);
      }
      if (cfg.name === 'PCL/TCL') {
        ok('T1 extra: PCL/TCL data.rows present', r.body.data && r.body.data.rows && r.body.data.rows.shift1 !== undefined);
        ok('T1 extra: PCL/TCL data.shiftRows present', r.body.data && r.body.data.shiftRows && r.body.data.shiftRows.shift1 !== undefined);
      }
      if (cfg.name === 'Pure Salt Sieve') {
        var pssDoc = await PureSaltSieveAnalysis.findOne({ date: testDate });
        ok('T1 extra: Pure Salt Sieve mirrored doc exists', pssDoc !== null);
        ok('T1 extra: Pure Salt Sieve mirrored rows.shift1 present', pssDoc && pssDoc.rows && pssDoc.rows.shift1 && Object.keys(pssDoc.rows.shift1).length > 0);
      }
    }

    // T2: shift2-first 400
    {
      await PlantAnalysisRecord.deleteMany({});
      var r2 = await P({ date: testDate, rows: { shift2: cfg.sampleRow } });
      ok('T2: shift2-first -> 400', r2.status === 400, 'status=' + r2.status + ' msg=' + (r2.body && r2.body.message));
      ok('T2: sequential message', r2.body && (r2.body.message.toLowerCase().includes('sequential') || r2.body.message.toLowerCase().includes('restrict')), 'msg=' + (r2.body && r2.body.message));
    }

    // T3: Correction then lock
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      var rc = await P({ date: testDate, rows: { shift1: cfg.correctionRow } });
      ok('T3: Correction -> 200', rc.status === 200, 'status=' + rc.status + ' msg=' + (rc.body && rc.body.message));
      ok('T3: editAuditHistory has entry', Array.isArray(rc.body.editAuditHistory) && rc.body.editAuditHistory.length > 0);
      ok('T3: editedFields not empty', Object.keys(rc.body.editedFields || {}).length > 0);
      var lsc = rc.body.lockedShifts;
      ok('T3: shift1Saved=true',   lsc && lsc.shift1Saved === true);
      ok('T3: shift1Edits=1',      lsc && lsc.shift1Edits === 1, 'got ' + (lsc && lsc.shift1Edits));
      ok('T3: shift1Locked=true',  lsc && lsc.shift1Locked === true, 'got ' + (lsc && lsc.shift1Locked));
      ok('T3: shift1=true (disabled)', lsc && lsc.shift1 === true, 'got ' + (lsc && lsc.shift1));
      ok('T3: lockedSlots.shift1.correctionUsed=true', rc.body.lockedSlots && rc.body.lockedSlots.shift1 && rc.body.lockedSlots.shift1.correctionUsed === true);
    }

    // T4: Locked edit 400
    {
      var secondCorrection = Object.assign({}, cfg.correctionRow);
      secondCorrection[cfg.parameters[0]] = '999';
      var r4 = await P({ date: testDate, rows: { shift1: secondCorrection } });
      ok('T4: Locked edit -> 400', r4.status === 400, 'status=' + r4.status + ' msg=' + (r4.body && r4.body.message));
    }

    // T5: Empty shift save 400
    {
      await PlantAnalysisRecord.deleteMany({});
      var emptyRow = {}; cfg.parameters.forEach(function(p) { emptyRow[p] = ''; });
      var r5 = await P({ date: testDate, rows: { shift1: emptyRow } });
      ok('T5: Empty shift1 -> 400', r5.status === 400, 'status=' + r5.status + ' msg=' + (r5.body && r5.body.message));
    }

    // T6: Clear-all correction 400
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      var emptyRow2 = {}; cfg.parameters.forEach(function(p) { emptyRow2[p] = ''; });
      var r6 = await P({ date: testDate, rows: { shift1: emptyRow2 } });
      ok('T6: Clear-all correction -> 400', r6.status === 400, 'status=' + r6.status + ' msg=' + (r6.body && r6.body.message));
    }

    // T7: Multi-shift 400
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      var r7 = await P({ date: testDate, rows: { shift2: cfg.sampleRow, shift3: cfg.sampleRow } });
      ok('T7: Multi-shift -> 400', r7.status === 400, 'status=' + r7.status + ' msg=' + (r7.body && r7.body.message));
    }

    // T8: Identical re-save 200 noChange
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      var r8 = await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      ok('T8: Identical re-save -> 200', r8.status === 200, 'status=' + r8.status);
      ok('T8: noChange=true', r8.body && r8.body.noChange === true, 'noChange=' + (r8.body && r8.body.noChange));
    }

    // T9: Concurrent saves 200+409
    {
      await PlantAnalysisRecord.deleteMany({});
      await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
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
      var p1 = P({ date: testDate, rows: { shift2: cfg.sampleRow } });
      var secondRow = Object.assign({}, cfg.sampleRow);
      secondRow[cfg.parameters[0]] = '999';
      var p2 = P({ date: testDate, rows: { shift2: secondRow } });
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
        data: { rows: { shift1: cfg.sampleRow }, date: testDate },
        createdAt: new Date('2026-10-27T05:00:00Z'),
      });
      await PlantAnalysisRecord.create({
        plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType,
        unit: cfg.unit, date: testDate, shift: 'II SHIFT',
        data: { rows: {}, date: testDate },
        createdAt: new Date('2026-10-27T04:00:00Z'),
      });
      var r10 = await G(testDate);
      ok('T10: GET -> 200', r10.status === 200, 'status=' + r10.status);
      ok('T10: data present', r10.body && r10.body.data !== undefined);
      var dataRows = r10.body && r10.body.data && (r10.body.data.rows || r10.body.data.shifts);
      ok('T10: canonical has shift1 data', dataRows && dataRows.shift1 !== undefined && Object.keys(dataRows.shift1).length > 0);
    }

    // T11: 00:00-05:59 IST wraps to previous calendar day
    {
      await PlantAnalysisRecord.deleteMany({});
      capturedNow = istDate(2026, 10, 28, 1, 30);
      var r11 = await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      ok('T11: 01:30 IST Oct 28 -> operatingDate Oct 27 -> 200', r11.status === 200, 'status=' + r11.status + ' msg=' + (r11.body && r11.body.message));
      capturedNow = istDate(2026, 10, 27, 10, 0);
    }

    // T12: Security bypass rejected
    {
      await PlantAnalysisRecord.deleteMany({});
      var yesterday = '2026-10-26';
      var r12a = await P({ date: yesterday, rows: { shift1: cfg.sampleRow } }, { 'x-test-mode': 'true' });
      ok('T12: x-test-mode -> 400', r12a.status === 400, 'status=' + r12a.status);
      var r12b = await P({ date: yesterday, rows: { shift1: cfg.sampleRow } }, { 'x-test-now': istDate(2026,10,26,10,0).toISOString() });
      ok('T12: x-test-now  -> 400', r12b.status === 400, 'status=' + r12b.status);
      var r12c = await P({ date: yesterday, rows: { shift1: cfg.sampleRow } }, { 'x-test-env': 'true' });
      ok('T12: x-test-env  -> 400', r12c.status === 400, 'status=' + r12c.status);
      var r12d = await P({ date: yesterday, isTestMode: true, rows: { shift1: cfg.sampleRow } });
      ok('T12: payload.isTestMode -> 400', r12d.status === 400, 'status=' + r12d.status);
      var r12e = await P({ date: yesterday, now: istDate(2026,10,26,10,0).toISOString(), rows: { shift1: cfg.sampleRow } });
      ok('T12: payload.now -> 400', r12e.status === 400, 'status=' + r12e.status);
    }

    // T13: Legacy hydration cases
    {
      await PlantAnalysisRecord.deleteMany({});
      // Case A: no doc
      var r13a = await G(testDate);
      ok('T13A: no doc -> data null/empty', r13a.body && (r13a.body.data === null || (Array.isArray(r13a.body.data) && r13a.body.data.length === 0)));
      // Case B: only shift1, no lockedSlots
      await PlantAnalysisRecord.create({ plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType, unit: cfg.unit, date: testDate, shift: 'I SHIFT', data: { rows: { shift1: cfg.sampleRow }, date: testDate } });
      var r13b = await G(testDate);
      ok('T13B: shift1 -> lockedSlots.shift1.isSaved=true', r13b.body && r13b.body.lockedSlots && r13b.body.lockedSlots.shift1 && r13b.body.lockedSlots.shift1.isSaved === true);
      ok('T13B: lockedSlots.shift2.isSaved=false', r13b.body && r13b.body.lockedSlots && r13b.body.lockedSlots.shift2 && r13b.body.lockedSlots.shift2.isSaved === false);
      ok('T13B: lockedSlots.shift2.isLocked=false', r13b.body && r13b.body.lockedSlots && r13b.body.lockedSlots.shift2 && r13b.body.lockedSlots.shift2.isLocked === false);
      // Case C: shift1 locked, shift2 saved, legacy lockedShifts
      await PlantAnalysisRecord.deleteMany({});
      await PlantAnalysisRecord.create({ plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType, unit: cfg.unit, date: testDate, shift: 'II SHIFT', data: { rows: { shift1: cfg.sampleRow, shift2: cfg.correctionRow }, lockedShifts: { shift1Saved: true, shift1Locked: true, shift2Saved: true, shift2Locked: false, shift3Saved: false }, date: testDate } });
      var r13c = await G(testDate);
      ok('T13C: legacy shift1Locked -> correctionUsed=true', r13c.body && r13c.body.lockedSlots && r13c.body.lockedSlots.shift1 && r13c.body.lockedSlots.shift1.correctionUsed === true);
      ok('T13C: lockedSlots.shift2.isSaved=true', r13c.body && r13c.body.lockedSlots && r13c.body.lockedSlots.shift2 && r13c.body.lockedSlots.shift2.isSaved === true);
      // Case D: all locked (allPermanentlyLocked)
      await PlantAnalysisRecord.deleteMany({});
      await PlantAnalysisRecord.create({ plantName: cfg.plantName, plantCode: cfg.plantCode, analysisType: cfg.analysisType, unit: cfg.unit, date: testDate, shift: 'All', data: { rows: { shift1: cfg.sampleRow, shift2: cfg.correctionRow, shift3: cfg.sampleRow }, lockedShifts: { shift1Saved: true, shift1Locked: true, shift1Edits: 1, shift2Saved: true, shift2Locked: true, shift2Edits: 1, shift3Saved: true, shift3Locked: true, shift3Edits: 1, allPermanentlyLocked: true }, date: testDate } });
      var r13d = await G(testDate);
      ok('T13D: all locked -> shift3.isLocked=true', r13d.body && r13d.body.lockedSlots && r13d.body.lockedSlots.shift3 && r13d.body.lockedSlots.shift3.isLocked === true);
      ok('T13D: GET did not write extra doc', await PlantAnalysisRecord.countDocuments({ date: testDate }) === 1);
    }

    // T14: Flat lockedShifts exact values for every state
    {
      await PlantAnalysisRecord.deleteMany({});
      // shift1 saved
      var r14a = await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      var ls14 = r14a.body.lockedShifts;
      ok('T14a: shift1Saved=true',   ls14 && ls14.shift1Saved === true);
      ok('T14a: shift2Saved=false',  ls14 && ls14.shift2Saved === false);
      ok('T14a: shift3Saved=false',  ls14 && ls14.shift3Saved === false);
      ok('T14a: shift1Locked=false', ls14 && ls14.shift1Locked === false, 'got ' + (ls14 && ls14.shift1Locked));
      ok('T14a: shift1Edits=0',      ls14 && ls14.shift1Edits === 0);
      ok('T14a: shift1=false',       ls14 && ls14.shift1 === false, 'got ' + (ls14 && ls14.shift1));
      ok('T14a: shift2=false (open)', ls14 && ls14.shift2 === false, 'got ' + (ls14 && ls14.shift2));
      ok('T14a: shift3=true (waiting)', ls14 && ls14.shift3 === true,  'got ' + (ls14 && ls14.shift3));
      // shift2 saved
      var r14b = await P({ date: testDate, rows: { shift2: cfg.sampleRow } });
      var ls14b = r14b.body.lockedShifts;
      ok('T14b: shift1=true after shift2 save', ls14b && ls14b.shift1 === true, 'got ' + (ls14b && ls14b.shift1));
      ok('T14b: shift2Saved=true', ls14b && ls14b.shift2Saved === true);
      ok('T14b: shift2=false (open)', ls14b && ls14b.shift2 === false, 'got ' + (ls14b && ls14b.shift2));
      ok('T14b: shift3=false (open)', ls14b && ls14b.shift3 === false, 'got ' + (ls14b && ls14b.shift3));
      // correct shift2
      var r14bc = await P({ date: testDate, rows: { shift2: cfg.correctionRow } });
      var ls14bc = r14bc.body.lockedShifts;
      ok('T14bc: shift2Locked=true after correction', ls14bc && ls14bc.shift2Locked === true, 'got ' + (ls14bc && ls14bc.shift2Locked));
      ok('T14bc: shift2Edits=1', ls14bc && ls14bc.shift2Edits === 1, 'got ' + (ls14bc && ls14bc.shift2Edits));
      ok('T14bc: shift2=true (disabled)', ls14bc && ls14bc.shift2 === true, 'got ' + (ls14bc && ls14bc.shift2));
      // shift3 saved
      var r14c = await P({ date: testDate, rows: { shift3: cfg.sampleRow } });
      var ls14c = r14c.body.lockedShifts;
      ok('T14c: shift3Saved=true', ls14c && ls14c.shift3Saved === true);
      ok('T14c: shift3=false (open)', ls14c && ls14c.shift3 === false, 'got ' + (ls14c && ls14c.shift3));
      // correct shift3 (permanently locked)
      var r14cc = await P({ date: testDate, rows: { shift3: cfg.correctionRow } });
      var ls14cc = r14cc.body.lockedShifts;
      ok('T14cc: shift3Locked=true', ls14cc && ls14cc.shift3Locked === true, 'got ' + (ls14cc && ls14cc.shift3Locked));
      ok('T14cc: shift3Edits=1', ls14cc && ls14cc.shift3Edits === 1, 'got ' + (ls14cc && ls14cc.shift3Edits));
      ok('T14cc: shift3=true (disabled)', ls14cc && ls14cc.shift3 === true, 'got ' + (ls14cc && ls14cc.shift3));
    }

    // T15: Response shape contract
    {
      await PlantAnalysisRecord.deleteMany({});
      var r15 = await P({ date: testDate, rows: { shift1: cfg.sampleRow } });
      ok('T15: data present',               r15.body && r15.body.data !== undefined);
      ok('T15: data._id present',           r15.body && r15.body.data && r15.body.data._id !== undefined);
      ok('T15: data.rows present',          r15.body && r15.body.data && r15.body.data.rows !== undefined);
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

      if (cfg.name === 'ACL 300#') {
        ok('T15 extra: ACL 300# top data.shifts present', r15.body.data && r15.body.data.shifts !== undefined);
        ok('T15 extra: ACL 300# top data.rows present', r15.body.data && r15.body.data.rows !== undefined);
      }
      if (cfg.name === 'PCL/TCL') {
        ok('T15 extra: PCL/TCL top data.rows present', r15.body.data && r15.body.data.rows !== undefined);
        ok('T15 extra: PCL/TCL top data.shiftRows present', r15.body.data && r15.body.data.shiftRows !== undefined);
      }
    }

    // T16: GET contract + no write
    {
      var docsBefore = await PlantAnalysisRecord.countDocuments({ date: testDate });
      var r16 = await G(testDate);
      var docsAfter  = await PlantAnalysisRecord.countDocuments({ date: testDate });
      ok('T16: GET -> 200', r16.status === 200);
      ok('T16: lockedSlots at top level', r16.body && r16.body.lockedSlots !== undefined);
      ok('T16: lockedShifts at top level', r16.body && r16.body.lockedShifts !== undefined);
      ok('T16: GET no write', docsAfter === docsBefore, 'before=' + docsBefore + ' after=' + docsAfter);

      if (cfg.name === 'ACL 300#') {
        ok('T16 extra: ACL 300# GET returns data.shifts', r16.body && r16.body.data && r16.body.data.shifts !== undefined);
        ok('T16 extra: ACL 300# GET returns data.rows', r16.body && r16.body.data && r16.body.data.rows !== undefined);
      }
    }

    // T17: Real client payload shapes & unique index verification
    {
      await PlantAnalysisRecord.deleteMany({});
      var allEmpty = {}; cfg.parameters.forEach(function(p) { allEmpty[p] = ''; });

      // (a) payload {shift1:data, shift2:allEmpty, shift3:allEmpty} first save -> 200 and shift2/3 untouched
      var r17a = await P({ date: testDate, rows: { shift1: cfg.sampleRow, shift2: allEmpty, shift3: allEmpty } });
      ok('T17a: client first save -> 200', r17a.status === 200, 'status=' + r17a.status + ' msg=' + (r17a.body && r17a.body.message));
      ok('T17a: shift1Saved=true', r17a.body && r17a.body.lockedSlots && r17a.body.lockedSlots.shift1 && r17a.body.lockedSlots.shift1.isSaved === true);
      ok('T17a: shift2 untouched', r17a.body && r17a.body.lockedSlots && r17a.body.lockedSlots.shift2 && r17a.body.lockedSlots.shift2.isSaved === false);
      ok('T17a: shift3 untouched', r17a.body && r17a.body.lockedSlots && r17a.body.lockedSlots.shift3 && r17a.body.lockedSlots.shift3.isSaved === false);
      var docA = await PlantAnalysisRecord.findOne({ plantCode: cfg.plantCode, analysisType: cfg.analysisType, date: testDate });
      ok('T17a: doc has shift All Shifts', docA && docA.shift === 'All Shifts', 'shift=' + (docA && docA.shift));

      // (b) shift2 save with shift1 present+unchanged and shift3 empty -> 200
      var r17b = await P({ date: testDate, rows: { shift1: cfg.sampleRow, shift2: cfg.sampleRow, shift3: allEmpty } });
      ok('T17b: shift2 save with shift1 present+unchanged -> 200', r17b.status === 200, 'status=' + r17b.status + ' msg=' + (r17b.body && r17b.body.message));
      ok('T17b: shift2Saved=true', r17b.body && r17b.body.lockedSlots && r17b.body.lockedSlots.shift2 && r17b.body.lockedSlots.shift2.isSaved === true);
      ok('T17b: shift1 locked after shift2 save', r17b.body && r17b.body.lockedSlots && r17b.body.lockedSlots.shift1 && r17b.body.lockedSlots.shift1.isLocked === true);

      // (c) unique index {plantCode,analysisType,date,shift,time} like production
      var totalDocs = await PlantAnalysisRecord.countDocuments({ plantCode: cfg.plantCode, analysisType: cfg.analysisType, date: testDate });
      ok('T17c: unique index preserved 1 doc without E11000', totalDocs === 1, 'count=' + totalDocs);
      var docC = await PlantAnalysisRecord.findOne({ plantCode: cfg.plantCode, analysisType: cfg.analysisType, date: testDate });
      ok('T17c: doc shift remains All Shifts', docC && docC.shift === 'All Shifts', 'shift=' + (docC && docC.shift));
    }

    // T18: Real-client 3-shift payload re-save, correction, and sequential transition
    {
      await PlantAnalysisRecord.deleteMany({});
      var allEmpty = {}; cfg.parameters.forEach(function(p) { allEmpty[p] = ''; });

      // First save shift1 with real 3-shift payload
      var initSave = await P({ date: testDate, rows: { shift1: cfg.sampleRow, shift2: allEmpty, shift3: allEmpty } });
      ok('T18 init: shift1 save -> 200', initSave.status === 200);

      // (a) real-client payload re-save (3 shifts, shift1 saved unchanged, 2/3 empty) -> 200 noChange
      var r18a = await P({ date: testDate, rows: { shift1: cfg.sampleRow, shift2: allEmpty, shift3: allEmpty } });
      ok('T18a: re-save shift1 unchanged -> 200 noChange', r18a.status === 200 && r18a.body && r18a.body.noChange === true, 'status=' + r18a.status + ' noChange=' + (r18a.body && r18a.body.noChange));

      // (b) same with shift1 correction changed -> 200 correction
      var r18b = await P({ date: testDate, rows: { shift1: cfg.correctionRow, shift2: allEmpty, shift3: allEmpty } });
      ok('T18b: shift1 correction changed -> 200', r18b.status === 200, 'status=' + r18b.status);
      ok('T18b: shift1 correctionUsed=true', r18b.body && r18b.body.lockedSlots && r18b.body.lockedSlots.shift1 && r18b.body.lockedSlots.shift1.correctionUsed === true);
      ok('T18b: shift1 isLocked=true after correction', r18b.body && r18b.body.lockedSlots && r18b.body.lockedSlots.shift1 && r18b.body.lockedSlots.shift1.isLocked === true);

      // (d) shift2 first save with real 3-shift payload -> 200
      var r18d = await P({ date: testDate, rows: { shift1: cfg.correctionRow, shift2: cfg.sampleRow, shift3: allEmpty } });
      ok('T18d: shift2 first save with real 3-shift payload -> 200', r18d.status === 200, 'status=' + r18d.status);
      ok('T18d: shift2Saved=true', r18d.body && r18d.body.lockedSlots && r18d.body.lockedSlots.shift2 && r18d.body.lockedSlots.shift2.isSaved === true);

      // (c) shift1+shift2 saved, shift3 empty, unchanged re-save -> 200 noChange
      var r18c = await P({ date: testDate, rows: { shift1: cfg.correctionRow, shift2: cfg.sampleRow, shift3: allEmpty } });
      ok('T18c: shift1+shift2 saved, shift3 empty, unchanged re-save -> 200 noChange', r18c.status === 200 && r18c.body && r18c.body.noChange === true, 'status=' + r18c.status + ' noChange=' + (r18c.body && r18c.body.noChange));
    }

    // T19: shift1 saved, then POST rows {shift1: allEmpty, shift2: allEmpty, shift3: allEmpty} -> expect 400
    {
      await PlantAnalysisRecord.deleteMany({});
      var allEmpty = {}; cfg.parameters.forEach(function(p) { allEmpty[p] = ''; });
      var rInit = await P({ date: testDate, rows: { shift1: cfg.sampleRow, shift2: allEmpty, shift3: allEmpty } });
      ok('T19 init: shift1 save -> 200', rInit.status === 200);

      // shift1 saved, POST all 3 shifts empty/cleared -> 400
      var r19 = await P({ date: testDate, rows: { shift1: allEmpty, shift2: allEmpty, shift3: allEmpty } });
      ok('T19: shift1 saved, all 3 shifts empty -> 400', r19.status === 400, 'status=' + r19.status + ' msg=' + (r19.body && r19.body.message));

      // shift1 saved, POST {shift1: sampleRow, shift2: allEmpty, shift3: allEmpty} stays noChange
      var r19NoChange = await P({ date: testDate, rows: { shift1: cfg.sampleRow, shift2: allEmpty, shift3: allEmpty } });
      ok('T19: shift1 saved unchanged with 2/3 empty stays noChange -> 200', r19NoChange.status === 200 && r19NoChange.body && r19NoChange.body.noChange === true, 'status=' + r19NoChange.status + ' noChange=' + (r19NoChange.body && r19NoChange.body.noChange));
    }

    console.log('');
    console.log('  Summary: ' + pass + ' passed, ' + fail + ' failed');
    await new Promise(function(resolve) { server.close(resolve); });
  }

  notifService.executeSaveAndEmailWorkflow = origWorkflow;
  await mongoose.disconnect();
  await mongod.stop();

  console.log('');
  console.log('========================================================================');
  console.log('TOTAL: ' + totalPass + ' passed, ' + totalFail + ' failed');
  console.log('========================================================================');
  if (totalFail > 0) process.exit(1);
}

run().catch(function(err) { console.error('CRASH:', err); process.exit(1); });
