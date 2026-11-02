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
var path = require('path');

var PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
var { createRouter: createBfwRouter } = require('../routes/bfwAnalysisRoutes');
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
  console.log('PASS [' + passedCount + ']: ' + msg);
}

var BASE_ROW_BFW = {
  id: 'r1',
  stream: 'Boiler Feed Water (BFW)',
  frequency: 'Day',
  time: '15:00',
  ph: '9.0',
  cond: '36.8',
  th: '0',
  alk: '10',
  sio2: '0.26',
};

var BASE_ROW_SHS = {
  id: 'r2',
  stream: 'Super Heated Steam (SHS)',
  frequency: 'Day',
  time: '15:00',
  ph: '7.6',
  cond: '7.3',
  th: 'nil',
  alk: '6',
  sio2: '0.14',
};

async function main() {
  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  var clockNow = istDate(2026, 11, 2, 10, 0);
  var app = express();
  app.use(express.json());
  app.use('/api/bfw-analysis', createBfwRouter({ getNow: function () { return clockNow; } }));

  var server = http.createServer(app);
  await new Promise(function (resolve) { server.listen(0, resolve); });
  var port = server.address().port;

  var OP_DATE = getOperatingDateIST(clockNow); // '2026-11-02'

  try {
    // T1: Fresh day GET returns 200 with data: null and fresh lockedSlots
    var freshGet = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(freshGet.status, 200);
    assert.strictEqual(freshGet.body.success, true);
    assert.strictEqual(freshGet.body.data, null);
    assert.strictEqual(freshGet.body.lockedSlots.bfw.isSaved, false);
    assert.strictEqual(freshGet.body.lockedSlots.bfw.isLocked, false);
    assert.strictEqual(freshGet.body.lockedSlots.shs.isSaved, false);
    assert.strictEqual(freshGet.body.lockedSlots.shs.isLocked, false);
    pass('T1: Fresh day GET returns 200 with data: null');

    // T2: Save bfw slot first time (initial save) -> 200, correction available, shs open
    var save1 = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(save1.status, 200);
    assert.strictEqual(save1.body.success, true);
    assert.strictEqual(save1.body.lockedSlots.bfw.isSaved, true);
    assert.strictEqual(save1.body.lockedSlots.bfw.isLocked, false);
    assert.strictEqual(save1.body.lockedSlots.bfw.correctionUsed, false);
    assert.strictEqual(save1.body.lockedSlots.shs.isSaved, false);
    assert.strictEqual(save1.body.lockedSlots.shs.isLocked, false);
    pass('T2: Save bfw slot first time (initial save) -> 200, correction available, shs open');

    // T2b: tAlk derived store-only from alk, fe2o3 preserved
    var rowBfwSaved = save1.body.data.readings.find(function (r) { return r.id === 'r1'; });
    assert.strictEqual(rowBfwSaved.alk, '10');
    assert.strictEqual(rowBfwSaved.tAlk, '10');
    assert.strictEqual(rowBfwSaved.stream, 'Boiler Feed Water (BFW)');
    assert.strictEqual(rowBfwSaved.frequency, 'Day');
    pass('T2b: tAlk derived store-only from alk and stream/frequency preserved');

    // T3: Out-of-order save rejected with exact sequential restriction message
    await PlantAnalysisRecord.deleteMany({});
    var outOfOrder = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'shs',
      readings: [BASE_ROW_SHS],
    });
    assert.strictEqual(outOfOrder.status, 400);
    assert.strictEqual(outOfOrder.body.success, false);
    assert.strictEqual(outOfOrder.body.message, 'Sequential restriction: bfw must be completed and saved before proceeding to shs.');
    pass('T3: Out-of-order save rejected with exact sequential restriction message');

    // T4: One correction on bfw locks bfw permanently
    var initSave = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(initSave.status, 200);
    var corr1 = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.2' })],
    });
    assert.strictEqual(corr1.status, 200);
    assert.strictEqual(corr1.body.lockedSlots.bfw.isSaved, true);
    assert.strictEqual(corr1.body.lockedSlots.bfw.isLocked, true);
    assert.strictEqual(corr1.body.lockedSlots.bfw.correctionUsed, true);
    assert.strictEqual(corr1.body.editAuditHistory.length, 1);
    pass('T4: One correction on bfw locks bfw permanently');

    // T5: Second edit on bfw rejected as permanently locked
    var secondCorr = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.3' })],
    });
    assert.strictEqual(secondCorr.status, 400);
    assert.strictEqual(secondCorr.body.message, 'Cannot edit bfw because it is permanently locked.');
    pass('T5: Second edit on bfw rejected as permanently locked');

    // T6: Save shs first time -> 200, shs correction available, bfw locked
    var saveShs = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'shs',
      readings: [BASE_ROW_SHS],
    });
    assert.strictEqual(saveShs.status, 200);
    assert.strictEqual(saveShs.body.lockedSlots.shs.isSaved, true);
    assert.strictEqual(saveShs.body.lockedSlots.shs.isLocked, false);
    assert.strictEqual(saveShs.body.lockedSlots.shs.correctionUsed, false);
    assert.strictEqual(saveShs.body.lockedSlots.bfw.isLocked, true);
    pass('T6: Save shs first time -> 200, shs correction available, bfw locked');

    // T7: Re-save unchanged slot returns 200 No changes
    var noChangeRes = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'shs',
      readings: [BASE_ROW_SHS],
    });
    assert.strictEqual(noChangeRes.status, 200);
    assert.strictEqual(noChangeRes.body.noChange, true);
    assert.strictEqual(noChangeRes.body.message, 'No changes');
    pass('T7: Re-save unchanged slot returns 200 No changes');

    // T8: One correction on shs permanently locks all slots
    var shsCorr = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'shs',
      readings: [Object.assign({}, BASE_ROW_SHS, { cond: '7.8' })],
    });
    assert.strictEqual(shsCorr.status, 200);
    assert.strictEqual(shsCorr.body.lockedSlots.shs.isLocked, true);
    assert.strictEqual(shsCorr.body.lockedSlots.shs.correctionUsed, true);
    assert.strictEqual(shsCorr.body.lockedSlots.bfw.isLocked, true);
    pass('T8: One correction on shs permanently locks all slots');

    // T9: Second edit on shs rejected as permanently locked
    var shsSecondCorr = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'shs',
      readings: [Object.assign({}, BASE_ROW_SHS, { cond: '8.0' })],
    });
    assert.strictEqual(shsSecondCorr.status, 400);
    assert.strictEqual(shsSecondCorr.body.message, 'Cannot edit shs because it is permanently locked.');
    pass('T9: Second edit on shs rejected as permanently locked');

    // T10: Multi-slot edit in single POST rejected with 400
    await PlantAnalysisRecord.deleteMany({});
    var multiSave = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      readings: [BASE_ROW_BFW, BASE_ROW_SHS],
    });
    assert.strictEqual(multiSave.status, 400);
    assert.strictEqual(multiSave.body.message, 'Only one slot can be saved per submission.');
    pass('T10: Multi-slot edit in single POST rejected with 400');

    // T10b: Empty slot save (with tAlk and fe2o3 only) rejected with 400 exact engine message
    await PlantAnalysisRecord.deleteMany({});
    var emptySave = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [{ id: 'r1', tAlk: '10', fe2o3: '0.01' }],
    });
    assert.strictEqual(emptySave.status, 400);
    assert.strictEqual(emptySave.body.message, 'Cannot save empty slot bfw. At least one non-empty value is required.');
    pass('T10b: Empty slot save rejected with 400 exact engine message');

    // T11: Role user returns 403 on GET single, GET list, and POST
    var userGet = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(userGet.status, 403);
    assert.strictEqual(userGet.body.message, 'Access denied: Users with role "user" are not permitted to view BFW / SHS Analysis records.');

    var userList = await getReq(port, '/api/bfw-analysis', { 'x-role-user': 'true' });
    assert.strictEqual(userList.status, 403);
    assert.strictEqual(userList.body.message, 'Access denied: Users with role "user" are not permitted to view BFW / SHS Analysis records.');

    var userPost = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(userPost.status, 403);
    assert.strictEqual(userPost.body.message, 'Access denied: Users with role "user" are not permitted to save BFW / SHS Analysis records.');
    pass('T11: Role user returns 403 on GET single, GET list, and POST');

    // T12: Admin cannot bypass lock; edit on locked slot returns 400
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/bfw-analysis', { date: OP_DATE, targetSlot: 'bfw', readings: [BASE_ROW_BFW] });
    await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.1' })],
    });
    var adminEditLocked = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.2' })],
    });
    assert.strictEqual(adminEditLocked.status, 400);
    assert.strictEqual(adminEditLocked.body.message, 'Cannot edit bfw because it is permanently locked.');
    pass('T12: Admin cannot bypass lock; edit on locked slot returns 400');

    // T12b: Race condition returns 200 and 409 conflict
    await PlantAnalysisRecord.deleteMany({});
    var initialForRace = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(initialForRace.status, 200);

    var reqA = postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.1' })],
    });
    var reqB = postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.2' })],
    });

    var pair = await Promise.all([reqA, reqB]);
    var pairStatuses = pair.map(function (p) { return p.status; }).sort();
    assert.deepStrictEqual(pairStatuses, [200, 409]);
    var conflict = pair.find(function (p) { return p.status === 409; });
    assert.strictEqual(conflict.body.message, 'Conflict: This shift was locked or updated concurrently by another user.');
    pass('T12b: Race condition returns 200 and 409 conflict');

    // T13: Date restriction: historical or future date rejected with 400
    var pastSave = await postReq(port, '/api/bfw-analysis', {
      date: '2026-11-01',
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(pastSave.status, 400);
    assert.strictEqual(pastSave.body.message, "Date restriction enforced: Boiler Feed Water / SHS Analysis records can only be created or modified for today's operating date (2026-11-02). Historical or future modifications are not permitted.");

    var futureSave = await postReq(port, '/api/bfw-analysis', {
      date: '2026-11-03',
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(futureSave.status, 400);
    assert.strictEqual(futureSave.body.message, "Date restriction enforced: Boiler Feed Water / SHS Analysis records can only be created or modified for today's operating date (2026-11-02). Historical or future modifications are not permitted.");
    pass('T13: Historical and future operating dates rejected with 400');

    // T14: Numeric equivalence ("11" vs "11.0") returns 200 No changes
    await PlantAnalysisRecord.deleteMany({});
    var saveNum1 = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { alk: '11' })],
    });
    assert.strictEqual(saveNum1.status, 200);
    var saveNum2 = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { alk: '11.0' })],
    });
    assert.strictEqual(saveNum2.status, 200);
    assert.strictEqual(saveNum2.body.noChange, true);
    assert.strictEqual(saveNum2.body.message, 'No changes');
    pass('T14: Numeric equivalence ("11" vs "11.0") returns 200 No changes');

    // T15: Special value "nil", "n", "none" on th field succeeds and counts as non-empty
    await PlantAnalysisRecord.deleteMany({});
    var nilSave = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [{ id: 'r1', th: 'nil' }],
    });
    assert.strictEqual(nilSave.status, 200);
    assert.strictEqual(nilSave.body.lockedSlots.bfw.isSaved, true);
    var storedNilRow = nilSave.body.data.readings.find(function (r) { return r.id === 'r1'; });
    assert.strictEqual(storedNilRow.th, 'nil');
    pass('T15: Special value "nil" on th field succeeds and counts as non-empty');

    // T16: En-dash "–" and "-" treated as empty string on save
    await PlantAnalysisRecord.deleteMany({});
    var dashSave = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { cond: '–', th: '-' })],
    });
    assert.strictEqual(dashSave.status, 200);
    var storedDashRow = dashSave.body.data.readings.find(function (r) { return r.id === 'r1'; });
    assert.strictEqual(storedDashRow.cond, '');
    assert.strictEqual(storedDashRow.th, '');
    pass('T16: En-dash "–" and "-" treated as empty string on save');

    // T17: Report matcher hits target cell, rejects cross-slot, time===rowId
    var gFileContent = fs.readFileSync(require.resolve('../services/genericPlantReportService'), 'utf8');
    var gLines = gFileContent.split(/\r?\n/);
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
    var getCellAuditEntriesVerbatim = eval('(' + getCellAuditEntriesStr + ')');

    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/bfw-analysis', { date: OP_DATE, targetSlot: 'bfw', readings: [BASE_ROW_BFW] });
    var auditCorr = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.2' })],
    });
    assert.strictEqual(auditCorr.status, 200);
    var auditList = auditCorr.body.editAuditHistory;
    assert.strictEqual(auditList.length, 1);
    var expectedFields = ['date', 'rowId', 'shift', 'time', 'field', 'oldValue', 'newValue', 'editedBy', 'editedById', 'timestamp'].sort();
    assert.strictEqual(JSON.stringify(Object.keys(auditList[0]).sort()), JSON.stringify(expectedFields));
    assert.deepStrictEqual(Object.keys(auditList[0]).sort(), expectedFields);
    assert.strictEqual(auditList[0].time, auditList[0].rowId);

    var bfwReading = auditCorr.body.data.readings.find(function (r) { return r.id === 'r1'; });
    var shsReading = auditCorr.body.data.readings.find(function (r) { return r.id === 'r2'; });

    // Positive hit using rowKey = item.time || item.id ('15:00')
    var posHit = getCellAuditEntriesVerbatim(auditList, bfwReading.time || bfwReading.id, 'ph', bfwReading);
    assert.strictEqual(posHit.length, 1);
    assert.strictEqual(posHit[0].oldValue, '9.0');
    assert.strictEqual(posHit[0].newValue, '9.2');
    assert.strictEqual(posHit[0].rowId, 'r1');
    assert.strictEqual(posHit[0].time, 'r1');
    assert.strictEqual(posHit[0].shift, 'BFW');

    // Negative cross-field
    var negField = getCellAuditEntriesVerbatim(auditList, bfwReading.time || bfwReading.id, 'cond', bfwReading);
    assert.strictEqual(negField.length, 0);

    // Negative cross-slot (shs must NOT hit bfw correction)
    var negSlot = getCellAuditEntriesVerbatim(auditList, shsReading.time || shsReading.id, 'ph', shsReading);
    assert.strictEqual(negSlot.length, 0);
    pass('T17: Report matcher hits target cell and rejects cross-field and cross-slot');

    // T18: Legacy doc mapping: doc with editCount >= 1 or isLocked -> both slots permanently locked
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [BASE_ROW_BFW, BASE_ROW_SHS],
        initialSaved: true,
        editCount: 1,
        isLocked: true,
      },
    });

    var legacyLockedGet = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(legacyLockedGet.status, 200);
    assert.strictEqual(legacyLockedGet.body.lockedSlots.bfw.isSaved, true);
    assert.strictEqual(legacyLockedGet.body.lockedSlots.bfw.isLocked, true);
    assert.strictEqual(legacyLockedGet.body.lockedSlots.bfw.correctionUsed, true);
    assert.strictEqual(legacyLockedGet.body.lockedSlots.shs.isSaved, true);
    assert.strictEqual(legacyLockedGet.body.lockedSlots.shs.isLocked, true);
    assert.strictEqual(legacyLockedGet.body.lockedSlots.shs.correctionUsed, true);

    var legacyEditAttempt = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.5' })],
    });
    assert.strictEqual(legacyEditAttempt.status, 400);
    assert.strictEqual(legacyEditAttempt.body.message, 'Cannot edit bfw because it is permanently locked.');
    pass('T18: Legacy doc with editCount>=1 maps to all slots locked');

    // T19: Legacy doc with editCount: 0 and single saved slot -> correction available on bfw, shs unsaved
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [BASE_ROW_BFW, { id: 'r2', stream: 'Super Heated Steam (SHS)', ph: '', cond: '', th: '', alk: '', sio2: '' }],
        initialSaved: true,
        editCount: 0,
        isLocked: false,
      },
    });

    var legacyCorrAvail = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(legacyCorrAvail.status, 200);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.bfw.isSaved, true);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.bfw.isLocked, false);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.bfw.correctionUsed, false);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.shs.isSaved, false);

    var validLegacyCorrection = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, BASE_ROW_BFW, { ph: '9.4' })],
    });
    assert.strictEqual(validLegacyCorrection.status, 200);
    assert.strictEqual(validLegacyCorrection.body.lockedSlots.bfw.isLocked, true);
    pass('T19: Legacy doc with editCount 0 maps to correction available on bfw');

    // T20: Legacy old-format doc { parameter, bfwValue, shsValue } populates readings safely without crash
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [
          { parameter: 'pH at 25°C', bfwValue: '9.2', shsValue: '9.1' },
          { parameter: 'Conductivity at 25°C', bfwValue: '35', shsValue: '7' },
        ],
        initialSaved: true,
        editCount: 0,
        isLocked: false,
      },
    });
    var legacyOldFmtGet = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(legacyOldFmtGet.status, 200);
    assert.strictEqual(legacyOldFmtGet.body.success, true);
    assert.strictEqual(legacyOldFmtGet.body.data.readings.length, 4); // 2 canonical defaults + 2 old format extras
    pass('T20: Legacy old-format doc ({parameter, bfwValue, shsValue}) populates readings safely without crash');

    // T21: Legacy extra rows preserved across GET and POST
    await PlantAnalysisRecord.deleteMany({});
    var customRow = {
      id: 'r_custom_sample',
      stream: 'Sample Stream 3',
      time: '15:30',
      ph: '8.1',
      cond: '20',
      isDefault: false,
    };
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [BASE_ROW_BFW, BASE_ROW_SHS, customRow],
        initialSaved: true,
        editCount: 1,
        isLocked: true,
      },
    });
    var extraRowsGet = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(extraRowsGet.status, 200);
    assert.strictEqual(extraRowsGet.body.data.readings.length, 3);
    var foundCust = extraRowsGet.body.data.readings.find(function (r) { return r.id === 'r_custom_sample'; });
    assert.strictEqual(foundCust.stream, 'Sample Stream 3');
    pass('T21: Legacy extra custom rows preserved across GET and POST');

    // T22: 06:00 IST boundary rollover and date spoofing immunity
    await PlantAnalysisRecord.deleteMany({});
    clockNow = istDate(2026, 11, 2, 5, 59); // Operating date 2026-11-01
    var rollBefore = await postReq(port, '/api/bfw-analysis', {
      date: '2026-11-02',
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(rollBefore.status, 400);
    assert.strictEqual(rollBefore.body.message, "Date restriction enforced: Boiler Feed Water / SHS Analysis records can only be created or modified for today's operating date (2026-11-01). Historical or future modifications are not permitted.");

    clockNow = istDate(2026, 11, 2, 6, 0); // Operating date 2026-11-02
    var rollAt = await postReq(port, '/api/bfw-analysis', {
      date: '2026-11-02',
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(rollAt.status, 200);
    assert.strictEqual(rollAt.body.success, true);
    pass('T22: 06:00 IST boundary rollover enforces operating day cutoff');

    // T23: Correction clearing all user fields rejected with 400 and leaves stored doc untouched
    clockNow = istDate(2026, 11, 2, 10, 0);
    await PlantAnalysisRecord.deleteMany({});
    var t23Save1 = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [BASE_ROW_BFW],
    });
    assert.strictEqual(t23Save1.status, 200);
    assert.strictEqual(t23Save1.body.lockedSlots.bfw.isSaved, true);
    assert.strictEqual(t23Save1.body.lockedSlots.bfw.correctionUsed, false);

    var clearedRow = {
      id: 'r1',
      stream: 'Boiler Feed Water (BFW)',
      ph: '',
      cond: '',
      th: '',
      alk: '',
      sio2: '',
    };
    var t23ClearCorr = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [clearedRow],
    });
    assert.strictEqual(t23ClearCorr.status, 400);
    assert.strictEqual(
      t23ClearCorr.body.message,
      'A correction cannot clear all values in bfw. At least one non-empty value is required.'
    );

    var t23Get = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(t23Get.status, 200);
    var t23StoredBFW = t23Get.body.data.readings.find(function (r) { return r.id === 'r1'; });
    assert.strictEqual(t23StoredBFW.ph, BASE_ROW_BFW.ph);
    assert.strictEqual(t23StoredBFW.cond, BASE_ROW_BFW.cond);
    assert.strictEqual(t23StoredBFW.th, BASE_ROW_BFW.th);
    assert.strictEqual(t23StoredBFW.alk, BASE_ROW_BFW.alk);
    assert.strictEqual(t23StoredBFW.sio2, BASE_ROW_BFW.sio2);
    assert.strictEqual(t23Get.body.lockedSlots.bfw.correctionUsed, false);
    pass('T23: Correction clearing all user fields rejected with 400 and leaves stored doc untouched');

    // T24: Legacy row IDs bfw_1 and shs_1 preserved on GET and POST (rowId in audit = bfw_1/shs_1)
    await PlantAnalysisRecord.deleteMany({});
    var legacyBfwRow = Object.assign({}, BASE_ROW_BFW, { id: 'bfw_1' });
    var legacyShsRow = { id: 'shs_1', stream: 'Super Heated Steam (SHS)', ph: '', cond: '', th: '', alk: '', sio2: '' };
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Boiler Feed Water / Super Heated Steam Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [legacyBfwRow, legacyShsRow],
        initialSaved: true,
        editCount: 0,
        isLocked: false,
      },
    });

    var t24Get = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(t24Get.status, 200);
    assert.strictEqual(t24Get.body.data.readings[0].id, 'bfw_1');
    assert.strictEqual(t24Get.body.data.readings[1].id, 'shs_1');

    var t24Corr = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'bfw',
      readings: [Object.assign({}, legacyBfwRow, { ph: '9.6' })],
    });
    assert.strictEqual(t24Corr.status, 200);
    var t24Audit = t24Corr.body.editAuditHistory[0];
    assert.strictEqual(t24Audit.rowId, 'bfw_1');
    assert.strictEqual(t24Audit.time, 'bfw_1');
    assert.strictEqual(t24Audit.oldValue, '9.0');
    assert.strictEqual(t24Audit.newValue, '9.6');

    // Verbatim report matcher also works with bfw_1 / shs_1
    var posHit24 = getCellAuditEntriesVerbatim(t24Corr.body.editAuditHistory, '15:00', 'ph', legacyBfwRow);
    assert.strictEqual(posHit24.length, 1);
    assert.strictEqual(posHit24[0].rowId, 'bfw_1');

    var negHit24 = getCellAuditEntriesVerbatim(t24Corr.body.editAuditHistory, '15:00', 'ph', legacyShsRow);
    assert.strictEqual(negHit24.length, 0);

    // Now save shs with id shs_1 and ensure shs_1 id is preserved in database
    var t24ShsSave = await postReq(port, '/api/bfw-analysis', {
      date: OP_DATE,
      targetSlot: 'shs',
      readings: [Object.assign({}, BASE_ROW_SHS, { id: 'shs_1' })],
    });
    assert.strictEqual(t24ShsSave.status, 200);
    assert.strictEqual(t24ShsSave.body.data.readings[1].id, 'shs_1');
    pass('T24: Legacy row IDs bfw_1 and shs_1 preserved on GET and POST with correct audit rowId');

    // T25: 3 analysisType aliases and duplicate docs -> pickCanonicalDoc
    await PlantAnalysisRecord.deleteMany({});
    // Create empty placeholder with alias 1
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'BFW Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [],
        initialSaved: false,
      },
      createdAt: new Date(Date.now() - 10000),
    });

    // Create real record with alias 2
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSET',
      analysisType: 'Boiler Feed Water (BFW) Analysis',
      unit: 'BFW',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [BASE_ROW_BFW],
        initialSaved: true,
        editCount: 0,
        isLocked: false,
      },
      createdAt: new Date(Date.now() - 5000),
    });

    var t25Get = await getReq(port, '/api/bfw-analysis?date=' + OP_DATE);
    assert.strictEqual(t25Get.status, 200);
    assert.strictEqual(t25Get.body.lockedSlots.bfw.isSaved, true);
    var t25BfwRow = t25Get.body.data.readings.find(function (r) { return r.id === 'r1'; });
    assert.strictEqual(t25BfwRow.ph, '9.0');
    pass('T25: 3 analysisType aliases and duplicate docs handled via pickCanonicalDoc');

    console.log('\nAll ' + passedCount + ' tests PASSED successfully!');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

main().catch(function (err) {
  console.error('Test suite failed:', err);
  process.exit(1);
});
