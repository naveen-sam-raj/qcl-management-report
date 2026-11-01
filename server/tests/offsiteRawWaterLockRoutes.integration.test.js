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
var { createRouter: createRawWaterRouter } = require('../routes/rawWaterAnalysisRoutes');
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
        try { json = JSON.parse(str); } catch (_) { json = str; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function startTestApp(router) {
  var app = express();
  app.use(express.json());
  app.use('/api/raw-water-analysis', router);
  return new Promise(function (resolve) {
    var server = app.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

var passedCount = 0;
function pass(name) {
  passedCount++;
  console.log('  PASS: ' + name);
}

var BASE_PARAMS = {
  ph: '7.60',
  cond: '211',
  turbidity: '8',
  tds: '137',
  freeCl2: '0',
  fe: '0.30',
  sio2: '5',
  mAlk: '56',
  th: '60',
  caH: '36',
  mgH: '24',
  cl: '30',
  so4: '15',
  ema: '45',
};

async function runTests() {
  var mongod = await MongoMemoryServer.create();
  var uri = mongod.getUri();
  await mongoose.connect(uri);

  var fakeNow = istDate(2026, 10, 28, 10, 0);
  var OP_DATE = '2026-10-28';

  var testRouter = createRawWaterRouter({ getNow: function () { return fakeNow; } });
  var { server, port } = await startTestApp(testRouter);

  try {
    // Non-numeric validation rejects 'abc' in ph
    var resVal1 = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: 'abc' }),
    });
    assert.strictEqual(resVal1.status, 400);
    assert.ok(resVal1.body.message.includes('Validation failed'));
    pass('T20: non-numeric ph correctly rejected with 400');

    // Non-numeric validation rejects 'xyz' in tds
    var resVal2 = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { tds: 'xyz' }),
    });
    assert.strictEqual(resVal2.status, 400);
    assert.ok(resVal2.body.message.includes('Validation failed'));
    pass('T21: non-numeric tds correctly rejected with 400');

    // Empty first save rejected with 400 exact engine message
    var emptyRes = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: {
        ph: '', cond: '', turbidity: '', tds: '', freeCl2: '', fe: '',
        sio2: '', mAlk: '', th: '', caH: '', mgH: '', cl: '', so4: '', ema: '',
      },
    });
    assert.strictEqual(emptyRes.status, 400);
    assert.strictEqual(emptyRes.body.message, 'Cannot save empty slot parameters. At least one non-empty value is required.');
    pass('T2: empty first save rejected with 400 exact message');

    // Missing parameters object rejected
    var missingRes = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: {},
    });
    assert.strictEqual(missingRes.status, 400);
    assert.strictEqual(missingRes.body.message, 'At least one analytical reading row is required.');
    pass('T2b: empty parameters object rejected with 400');

    // T1: First save parameters returns 200, creates doc with unlocked slot
    var res = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.lockedSlots.parameters.isSaved, true);
    assert.strictEqual(res.body.lockedSlots.parameters.isLocked, false);
    assert.strictEqual(res.body.lockedSlots.parameters.correctionUsed, false);
    assert.strictEqual(res.body.initialSaved, true);
    assert.strictEqual(res.body.editCount, 0);
    assert.strictEqual(res.body.isLocked, false);
    assert.strictEqual(res.body.parameters.ph, '7.60');
    assert.strictEqual(res.body.parameters.tds, '137');
    pass('T1: first save parameters succeeds and leaves slot editable');

    // T6: Identical re-save returns 200 with noChange: true
    var resIdentical = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(resIdentical.status, 200);
    assert.strictEqual(resIdentical.body.noChange, true);
    assert.strictEqual(resIdentical.body.message, 'No changes');
    pass('T6: identical re-save returns 200 noChange: true');

    // T7: '11' vs '11.0' re-save treated as noChange with numeric equivalence
    await PlantAnalysisRecord.deleteMany({});
    var resFloatSave = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '11.0' }),
    });
    assert.strictEqual(resFloatSave.status, 200);
    assert.strictEqual(resFloatSave.body.parameters.ph, '11.0');

    var resFloatResave = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '11' }),
    });
    assert.strictEqual(resFloatResave.status, 200);
    assert.strictEqual(resFloatResave.body.noChange, true);
    assert.strictEqual(resFloatResave.body.message, 'No changes');
    pass('T7: 11 vs 11.0 numeric equivalence triggers noChange and preserves string');

    // T3: One correction succeeds -> 200, flat editedFields, flat 10-field editAuditHistory, locks slot
    var resCorr = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '7.85', tds: '140' }),
    });
    assert.strictEqual(resCorr.status, 200);
    assert.strictEqual(resCorr.body.lockedSlots.parameters.isSaved, true);
    assert.strictEqual(resCorr.body.lockedSlots.parameters.isLocked, true);
    assert.strictEqual(resCorr.body.lockedSlots.parameters.correctionUsed, true);
    assert.strictEqual(resCorr.body.initialSaved, true);
    assert.strictEqual(resCorr.body.editCount, 1);
    assert.strictEqual(resCorr.body.isLocked, true);
    assert.strictEqual(resCorr.body.editedFields['ph'], true);
    assert.strictEqual(resCorr.body.editedFields['parameters_ph'], true);
    assert.strictEqual(resCorr.body.editedFields['tds'], true);
    assert.strictEqual(resCorr.body.editedFields['parameters_tds'], true);
    assert.strictEqual(resCorr.body.editAuditHistory.length, 2);

    var auditEntry = resCorr.body.editAuditHistory[0];
    var expectedFields = ['date', 'rowId', 'shift', 'time', 'field', 'oldValue', 'newValue', 'editedBy', 'editedById', 'timestamp'].sort();
    assert.deepStrictEqual(Object.keys(auditEntry).sort(), expectedFields);
    assert.strictEqual(auditEntry.date, OP_DATE);
    assert.strictEqual(auditEntry.rowId, 'parameters');
    assert.strictEqual(auditEntry.time, 'parameters');
    assert.strictEqual(auditEntry.shift, 'Day');
    assert.strictEqual(auditEntry.field, 'ph');
    assert.strictEqual(auditEntry.oldValue, '11.0');
    assert.strictEqual(auditEntry.newValue, '7.85');
    assert.strictEqual(auditEntry.editedBy, 'Offsite Test Admin');
    assert.ok(auditEntry.timestamp);
    assert.strictEqual(auditEntry.changes, undefined);
    pass('T3: one correction succeeds with flat editedFields, locks slot, records 10-field audit');

    // T4: Second correction rejected with 400 (permanently locked)
    var resSecondCorr = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '8.00' }),
    });
    assert.strictEqual(resSecondCorr.status, 400);
    assert.strictEqual(resSecondCorr.body.message, 'Cannot edit parameters because it is permanently locked.');
    pass('T4: second correction rejected with 400 (permanently locked)');

    // T5: Correction clearing all values rejected with 400 exact engine message
    await PlantAnalysisRecord.deleteMany({});
    var resFresh = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(resFresh.status, 200);

    var resClearAll = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: {
        ph: '', cond: '', turbidity: '', tds: '', freeCl2: '', fe: '',
        sio2: '', mAlk: '', th: '', caH: '', mgH: '', cl: '', so4: '', ema: '',
      },
    });
    assert.strictEqual(resClearAll.status, 400);
    assert.strictEqual(resClearAll.body.message, 'A correction cannot clear all values in parameters. At least one non-empty value is required.');
    pass('T5: correction clearing all values rejected with 400 exact message');

    // T8: Deterministic race condition on concurrent POSTs -> [200, 409]
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: BASE_PARAMS,
    });

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

    var p1 = postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '7.91' }),
    });
    var p2 = postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '7.92' }),
    });

    var raceResults = await Promise.all([p1, p2]);
    PlantAnalysisRecord.find = origFind;

    var raceStatuses = raceResults.map(function (r) { return r.status; }).sort();
    assert.deepStrictEqual(raceStatuses, [200, 409]);
    pass('T8: deterministic race condition returns [200, 409]');

    // T9: Duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Raw Water Analysis',
      unit: 'Raw Water',
      date: OP_DATE,
      createdAt: new Date('2026-10-28T06:00:00Z'),
      data: {
        id: 'placeholder_1',
        date: OP_DATE,
        parameters: {},
        lockedSlots: { parameters: { isSaved: false, isLocked: false, correctionUsed: false } },
      },
    });
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Raw Water Analysis',
      unit: 'Raw Water',
      date: OP_DATE,
      createdAt: new Date('2026-10-28T07:00:00Z'),
      data: {
        id: 'real_doc_2',
        date: OP_DATE,
        parameters: Object.assign({}, BASE_PARAMS, { ph: '7.77' }),
        lockedSlots: { parameters: { isSaved: true, isLocked: false, correctionUsed: false } },
      },
    });

    var t9Get = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t9Get.status, 200);
    assert.strictEqual(t9Get.body.parameters.ph, '7.77');

    var t9Post = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '7.88' }),
    });
    assert.strictEqual(t9Post.status, 200);
    assert.strictEqual(t9Post.body.parameters.ph, '7.88');
    pass('T9: duplicate docs on OP_DATE: pickCanonicalDoc proven on GET and POST');

    // T10: 06:00 IST boundary and 01:30 IST previous operating day strictly enforced
    await PlantAnalysisRecord.deleteMany({});
    fakeNow = istDate(2026, 10, 28, 5, 59); // Operational date is 2026-10-27
    assert.strictEqual(getOperatingDateIST(fakeNow), '2026-10-27');
    var boundaryFail = await postReq(port, '/api/raw-water-analysis', {
      date: '2026-10-28',
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(boundaryFail.status, 400);
    assert.ok(boundaryFail.body.message.includes('Date restriction enforced'));

    var boundaryPass = await postReq(port, '/api/raw-water-analysis', {
      date: '2026-10-27',
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(boundaryPass.status, 200);

    fakeNow = istDate(2026, 10, 28, 6, 0); // Operational date transitions to 2026-10-28
    assert.strictEqual(getOperatingDateIST(fakeNow), '2026-10-28');
    var boundary6am = await postReq(port, '/api/raw-water-analysis', {
      date: '2026-10-28',
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(boundary6am.status, 200);
    pass('T10: 06:00 IST boundary strictly enforced for operating day');

    // T10b: Client date spoofing strictly ignored -> 400
    fakeNow = istDate(2026, 10, 28, 11, 0);
    var spoofRes = await postReq(port, '/api/raw-water-analysis', {
      date: '2026-10-27', // mismatch
      now: '2026-10-27T10:00:00.000Z',
      payload: { now: '2026-10-27T10:00:00.000Z' },
      body: { now: '2026-10-27T10:00:00.000Z' },
      parameters: BASE_PARAMS,
    }, {
      'x-test': 'true',
      'x-test-mode': 'true',
    });
    assert.strictEqual(spoofRes.status, 400);
    assert.ok(spoofRes.body.message.includes('Date restriction enforced'));
    pass('T10b: date spoofing via payload.now, body.now and x-test headers strictly ignored -> 400');

    // T11: Role user returns 403 on GET and POST
    fakeNow = istDate(2026, 10, 28, 12, 0);
    var get403 = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(get403.status, 403);
    assert.ok(get403.body.message.includes('Forbidden'));

    var post403 = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: BASE_PARAMS,
    }, { 'x-role-user': 'true' });
    assert.strictEqual(post403.status, 403);
    assert.ok(post403.body.message.includes('Forbidden'));
    pass('T11: role user returns 403 on GET and POST');

    // T12: GET returns canonical doc and does NOT write to database
    await PlantAnalysisRecord.deleteMany({});
    var getBefore = await PlantAnalysisRecord.countDocuments({});
    assert.strictEqual(getBefore, 0);
    var getEmpty = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE);
    assert.strictEqual(getEmpty.status, 200);
    assert.strictEqual(getEmpty.body.data, null);
    var getAfter = await PlantAnalysisRecord.countDocuments({});
    assert.strictEqual(getAfter, 0);
    pass('T12: GET returns canonical doc and does NOT write to database');

    // T13: Stored shape data.parameters preserved with all 14 fields stored as trimmed strings
    var save13 = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: {
        ph: ' 7.65 ',
        cond: ' 211 ',
        turbidity: ' 8 ',
        tds: ' 137 ',
        freeCl2: ' 0 ',
        fe: ' 0.30 ',
        sio2: ' 5 ',
        mAlk: ' 56 ',
        th: ' 60 ',
        caH: ' 36 ',
        mgH: ' 24 ',
        cl: ' 30 ',
        so4: ' 15 ',
        ema: ' 45 ',
      },
    });
    assert.strictEqual(save13.status, 200);

    var doc13 = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert.ok(doc13.data.parameters);
    assert.strictEqual(doc13.data.parameters.ph, '7.65');
    assert.strictEqual(doc13.data.parameters.fe, '0.30');
    assert.strictEqual(doc13.data.parameters.tds, '137');
    assert.strictEqual(doc13.data.parameters.ema, '45');
    assert.strictEqual(Object.keys(doc13.data.parameters).length, 14);
    pass('T13: stored shape data.parameters preserved with all 14 trimmed strings');

    // T14: Legacy doc with initialSaved: true and empty parameters does not crash GET/POST
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Raw Water Analysis',
      unit: 'Raw Water',
      date: OP_DATE,
      data: {
        id: 'legacy_init_empty',
        date: OP_DATE,
        initialSaved: true,
        editCount: 0,
        isLocked: false,
        parameters: {},
      },
    });

    var t14Get = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t14Get.status, 200);
    assert.strictEqual(t14Get.body.lockedSlots.parameters.isSaved, true);
    assert.strictEqual(t14Get.body.lockedSlots.parameters.isLocked, false);
    assert.strictEqual(t14Get.body.initialSaved, true);

    var t14Post = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(t14Post.status, 200);
    assert.strictEqual(t14Post.body.lockedSlots.parameters.isLocked, true);
    assert.strictEqual(t14Post.body.lockedSlots.parameters.correctionUsed, true);
    pass('T14: legacy doc with initialSaved: true and empty parameters safe on GET/POST');

    // T15: Legacy doc with editCount: 0 GET shows editable
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Raw Water Analysis',
      unit: 'Raw Water',
      date: OP_DATE,
      data: {
        id: 'legacy_edits_0',
        date: OP_DATE,
        initialSaved: true,
        editCount: 0,
        isLocked: false,
        parameters: BASE_PARAMS,
      },
    });
    var t15Get = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t15Get.status, 200);
    assert.strictEqual(t15Get.body.lockedSlots.parameters.isSaved, true);
    assert.strictEqual(t15Get.body.lockedSlots.parameters.isLocked, false);
    assert.strictEqual(t15Get.body.lockedSlots.parameters.correctionUsed, false);
    assert.strictEqual(t15Get.body.isLocked, false);
    pass('T15: legacy editCount: 0 GET shows editable');

    // T16: Legacy doc with editCount: 1 GET shows locked
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Raw Water Analysis',
      unit: 'Raw Water',
      date: OP_DATE,
      data: {
        id: 'legacy_edits_1',
        date: OP_DATE,
        initialSaved: true,
        editCount: 1,
        isLocked: true,
        parameters: BASE_PARAMS,
      },
    });
    var t16Get = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t16Get.status, 200);
    assert.strictEqual(t16Get.body.lockedSlots.parameters.isSaved, true);
    assert.strictEqual(t16Get.body.lockedSlots.parameters.isLocked, true);
    assert.strictEqual(t16Get.body.lockedSlots.parameters.correctionUsed, true);
    assert.strictEqual(t16Get.body.isLocked, true);
    pass('T16: legacy editCount: 1 GET shows locked');

    // T17: Legacy doc with isLocked: true POST rejected with exact engine message
    var t17Post = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '8.10' }),
    });
    assert.strictEqual(t17Post.status, 400);
    assert.strictEqual(t17Post.body.message, 'Cannot edit parameters because it is permanently locked.');
    pass('T17: legacy isLocked: true POST rejected with exact engine message');

    // T18: payload.time is ignored by server, stored time is strictly '08:00'
    await PlantAnalysisRecord.deleteMany({});
    var t18Post = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      time: '14:30', // custom time attempt
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(t18Post.status, 200);
    assert.strictEqual(t18Post.body.data.time, '08:00');

    var t18Doc = await PlantAnalysisRecord.findOne({ date: OP_DATE }).lean();
    assert.strictEqual(t18Doc.data.time, '08:00');

    var t18Get = await getReq(port, '/api/raw-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t18Get.body.data.time, '08:00');
    pass('T18: payload.time ignored by server and stored strictly as 08:00');

    // T19: Report matcher test using verbatim functions from genericPlantReportService.js
    var fsModule = require('fs');
    var gLines = fsModule.readFileSync(require.resolve('../services/genericPlantReportService'), 'utf8').split('\n');
    var isFieldMarkedEditedStr = gLines.slice(861, 930).join('\n');
    var getCellAuditEntriesStr = gLines.slice(933, 982).join('\n');
    var isFieldMarkedEditedFn = new Function('return (' + isFieldMarkedEditedStr + ')')();
    var getCellAuditEntriesFn = new Function('return (' + getCellAuditEntriesStr + ')')();

    var corr19 = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      parameters: Object.assign({}, BASE_PARAMS, { ph: '7.82' }),
    });
    assert.strictEqual(corr19.status, 200);
    assert.strictEqual(corr19.body.editAuditHistory.length, 1);

    var matchedAudit = getCellAuditEntriesFn(corr19.body.editAuditHistory, 'parameters', 'ph', corr19.body.parameters);
    assert.strictEqual(matchedAudit.length, 1);
    assert.strictEqual(matchedAudit[0].oldValue, '7.60');
    assert.strictEqual(matchedAudit[0].newValue, '7.82');

    var isMarked = isFieldMarkedEditedFn(corr19.body.editedFields, ['parameters_ph', 'ph']);
    assert.strictEqual(isMarked, true);
    pass('T19: report matcher hits flat audit entry and editedFields for parameters');

    // T22: TargetSlot alias acceptance ('parameters' or undefined)
    await PlantAnalysisRecord.deleteMany({});
    var aliasPost = await postReq(port, '/api/raw-water-analysis', {
      date: OP_DATE,
      targetSlot: 'parameters',
      parameters: BASE_PARAMS,
    });
    assert.strictEqual(aliasPost.status, 200);
    assert.strictEqual(aliasPost.body.lockedSlots.parameters.isSaved, true);
    pass('T22: targetSlot parameters alias handled correctly');

    console.log('\n========================================================================');
    console.log('TOTAL TESTS PASSED: ' + passedCount);
    console.log('========================================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
}

runTests().catch(function (err) {
  console.error('Test execution failed:', err);
  process.exit(1);
});
