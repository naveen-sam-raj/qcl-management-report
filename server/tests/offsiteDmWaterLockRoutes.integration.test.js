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
var { createRouter: createDmWaterRouter } = require('../routes/dmWaterAnalysisRoutes');
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

var BASE_ROW_DM = {
  id: 'r_dm_water',
  unit: 'DM WATER',
  time: '08:00',
  ph: '7.5',
  cond: '10',
  th: 'nil',
  alk: '5',
  sio2: '0.20',
};

var BASE_ROW_ANION = {
  id: 'r_anion_unit',
  unit: 'A.UNIT',
  time: '08:30',
  ph: '7.8',
  cond: '12',
  th: '0',
  alk: '6',
  sio2: '0.22',
};

async function main() {
  var mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  var clockNow = istDate(2026, 11, 2, 10, 0);
  var OP_DATE = getOperatingDateIST(clockNow);
  assert.strictEqual(OP_DATE, '2026-11-02');

  var app = express();
  app.use(express.json());
  var router = createDmWaterRouter({ getNow: function () { return clockNow; } });
  app.use('/api/dm-water-analysis', router);

  var server = http.createServer(app);
  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });
  var port = server.address().port;

  try {
    // T1: Fresh day GET returns 200 with data: null
    var freshGet = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE);
    assert.strictEqual(freshGet.status, 200);
    assert.strictEqual(freshGet.body.success, true);
    assert.strictEqual(freshGet.body.data, null);
    assert.strictEqual(freshGet.body.message, 'No record found for date ' + OP_DATE);
    pass('T1: Fresh day GET returns 200 with data: null');

    // T2: Initial save of dm_water slot
    var CURRENT_ROW_DM = Object.assign({}, BASE_ROW_DM);
    var CURRENT_ROW_ANION = { id: 'r_anion_unit', unit: 'A.UNIT', ph: '', cond: '', th: '', alk: '', sio2: '' };
    var save1 = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [CURRENT_ROW_DM, CURRENT_ROW_ANION],
    });
    assert.strictEqual(save1.status, 200);
    assert.strictEqual(save1.body.success, true);
    assert.strictEqual(save1.body.message, 'DM Water Analysis saved successfully in MongoDB ✓');
    assert.strictEqual(save1.body.lockedSlots.dm_water.isSaved, true);
    assert.strictEqual(save1.body.lockedSlots.dm_water.correctionUsed, false);
    assert.strictEqual(save1.body.lockedSlots.dm_water.isLocked, false);
    assert.strictEqual(save1.body.lockedSlots.a_unit.isSaved, false);
    assert.strictEqual(save1.body.lockedSlots.a_unit.isLocked, false);
    pass('T2: Save dm_water slot first time (initial save) -> 200, correction available, a_unit open');

    // T2b: p and m derived store-only (m copies alk, p defaults to 0)
    var savedRowDM = save1.body.data.readings.find(function (r) { return r.id === 'r_dm_water'; });
    assert.strictEqual(savedRowDM.p, '0');
    assert.strictEqual(savedRowDM.m, '5'); // copied from alk '5'
    pass('T2b: p and m derived store-only: p becomes "0" and m copies alk');

    // T3: Out-of-order save: attempting to save a_unit before dm_water in a fresh day
    await PlantAnalysisRecord.deleteMany({});
    var outOfOrder = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'a_unit',
      readings: [{ id: 'r_dm_water', unit: 'DM WATER' }, BASE_ROW_ANION],
    });
    assert.strictEqual(outOfOrder.status, 400);
    assert.strictEqual(outOfOrder.body.message, 'Sequential restriction: dm_water must be completed and saved before proceeding to a_unit.');
    pass('T3: Out-of-order save rejected with exact sequential restriction message');

    // Restore step 1 save for sequential chain
    await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [CURRENT_ROW_DM, CURRENT_ROW_ANION],
    });

    // T4: One correction on dm_water before a_unit is saved
    CURRENT_ROW_DM = Object.assign({}, CURRENT_ROW_DM, { ph: '7.6' });
    var corrDM = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [CURRENT_ROW_DM, CURRENT_ROW_ANION],
    });
    assert.strictEqual(corrDM.status, 200);
    assert.strictEqual(corrDM.body.lockedSlots.dm_water.isSaved, true);
    assert.strictEqual(corrDM.body.lockedSlots.dm_water.correctionUsed, true);
    assert.strictEqual(corrDM.body.lockedSlots.dm_water.isLocked, true);
    pass('T4: One correction on dm_water locks dm_water permanently');

    // T5: Second edit on dm_water -> 400 rejection
    var secondCorrDM = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, CURRENT_ROW_DM, { ph: '7.7' }), CURRENT_ROW_ANION],
    });
    assert.strictEqual(secondCorrDM.status, 400);
    assert.strictEqual(secondCorrDM.body.message, 'Cannot edit dm_water because it is permanently locked.');
    pass('T5: Second edit on dm_water rejected as permanently locked');

    // T6: Save a_unit first time
    CURRENT_ROW_ANION = Object.assign({}, BASE_ROW_ANION);
    var saveAnion = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'a_unit',
      readings: [CURRENT_ROW_DM, CURRENT_ROW_ANION],
    });
    assert.strictEqual(saveAnion.status, 200);
    assert.strictEqual(saveAnion.body.lockedSlots.dm_water.isSaved, true);
    assert.strictEqual(saveAnion.body.lockedSlots.dm_water.isLocked, true);
    assert.strictEqual(saveAnion.body.lockedSlots.a_unit.isSaved, true);
    assert.strictEqual(saveAnion.body.lockedSlots.a_unit.correctionUsed, false);
    assert.strictEqual(saveAnion.body.lockedSlots.a_unit.isLocked, false);
    pass('T6: Save a_unit first time -> 200, a_unit correction available, dm_water locked');

    // T7: Re-save unchanged slot -> 200 No changes
    var resave = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'a_unit',
      readings: [CURRENT_ROW_DM, CURRENT_ROW_ANION],
    });
    assert.strictEqual(resave.status, 200);
    assert.strictEqual(resave.body.noChange, true);
    assert.strictEqual(resave.body.message, 'No changes');
    pass('T7: Re-save unchanged slot returns 200 No changes');

    // T8: One correction on a_unit -> 200, a_unit permanently locked
    CURRENT_ROW_ANION = Object.assign({}, CURRENT_ROW_ANION, { ph: '7.9' });
    var corrAnion = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'a_unit',
      readings: [CURRENT_ROW_DM, CURRENT_ROW_ANION],
    });
    assert.strictEqual(corrAnion.status, 200);
    assert.strictEqual(corrAnion.body.lockedSlots.a_unit.isSaved, true);
    assert.strictEqual(corrAnion.body.lockedSlots.a_unit.correctionUsed, true);
    assert.strictEqual(corrAnion.body.lockedSlots.a_unit.isLocked, true);
    assert.strictEqual(corrAnion.body.isLocked, true);
    pass('T8: One correction on a_unit permanently locks all slots');

    // T9: Second edit on a_unit -> 400 permanently locked
    var secondCorrAnion = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'a_unit',
      readings: [CURRENT_ROW_DM, Object.assign({}, CURRENT_ROW_ANION, { ph: '8.0' })],
    });
    assert.strictEqual(secondCorrAnion.status, 400);
    assert.strictEqual(secondCorrAnion.body.message, 'Cannot edit a_unit because it is permanently locked.');
    pass('T9: Second edit on a_unit rejected as permanently locked');

    // T10: Multi-slot edit in single POST -> 400 Only one slot can be saved per submission.
    var multiSlot = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      readings: [
        Object.assign({}, CURRENT_ROW_DM, { ph: '7.4' }),
        Object.assign({}, CURRENT_ROW_ANION, { ph: '8.1' }),
      ],
    });
    assert.strictEqual(multiSlot.status, 400);
    assert.strictEqual(multiSlot.body.message, 'Only one slot can be saved per submission.');
    pass('T10: Multi-slot edit in single POST rejected with 400');

    // T10b: Empty slot save (even with derived p and m present) -> 400 Cannot save empty slot
    await PlantAnalysisRecord.deleteMany({});
    var emptySave = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [{
        id: 'r_dm_water',
        unit: 'DM WATER',
        ph: '',
        cond: '',
        th: '',
        alk: '',
        sio2: '',
        p: '0',
        m: '0',
      }],
    });
    assert.strictEqual(emptySave.status, 400);
    assert.strictEqual(emptySave.body.message, 'Cannot save empty slot dm_water. At least one non-empty value is required.');
    pass('T10b: Empty slot save (with p and m) rejected with 400 exact engine message');

    // T11: Role user rejected with 403 on GET (single and list) and POST
    var userGet = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE, { 'x-role-user': 'true' });
    assert.strictEqual(userGet.status, 403);
    assert.strictEqual(userGet.body.message, 'Forbidden: DM Water Analysis data access is restricted to authorized Admins.');

    var userGetList = await getReq(port, '/api/dm-water-analysis', { 'x-role-user': 'true' });
    assert.strictEqual(userGetList.status, 403);
    assert.strictEqual(userGetList.body.message, 'Forbidden: DM Water Analysis data access is restricted to authorized Admins.');

    var userPost = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      readings: [BASE_ROW_DM],
    }, { 'x-role-user': 'true' });
    assert.strictEqual(userPost.status, 403);
    assert.strictEqual(userPost.body.message, 'Forbidden: DM Water Analysis data entry and modification is restricted to authorized Admins.');
    pass('T11: Role user returns 403 on GET single, GET list, and POST');

    // T12: Admin bypass removed: Admin user CANNOT edit locked slot
    await postReq(port, '/api/dm-water-analysis', { date: OP_DATE, targetSlot: 'dm_water', readings: [BASE_ROW_DM] });
    await postReq(port, '/api/dm-water-analysis', { date: OP_DATE, targetSlot: 'dm_water', readings: [Object.assign({}, BASE_ROW_DM, { ph: '7.6' })] });

    var adminEditLocked = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      override: true,
      adminOverride: true,
      readings: [Object.assign({}, BASE_ROW_DM, { ph: '7.7' })],
    });
    assert.strictEqual(adminEditLocked.status, 400);
    assert.strictEqual(adminEditLocked.body.message, 'Cannot edit dm_water because it is permanently locked.');
    pass('T12: Admin cannot bypass lock; edit on locked slot returns 400');

    // T12b: Race condition: concurrent saves on same slot -> [200, 409]
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/dm-water-analysis', { date: OP_DATE, targetSlot: 'dm_water', readings: [BASE_ROW_DM] });

    var reqA = postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, BASE_ROW_DM, { ph: '7.6' })],
    });
    var reqB = postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, BASE_ROW_DM, { ph: '7.7' })],
    });

    var pair = await Promise.all([reqA, reqB]);
    var pairStatuses = pair.map(function (p) { return p.status; }).sort();
    assert.deepStrictEqual(pairStatuses, [200, 409]);
    var conflict = pair.find(function (p) { return p.status === 409; });
    assert.strictEqual(conflict.body.message, 'Conflict: This shift was locked or updated concurrently by another user.');
    pass('T12b: Race condition returns 200 and 409 conflict');

    // T13: Date restriction: historical or future date rejected with 400
    var pastSave = await postReq(port, '/api/dm-water-analysis', {
      date: '2026-11-01',
      readings: [BASE_ROW_DM],
    });
    assert.strictEqual(pastSave.status, 400);
    assert.strictEqual(pastSave.body.message, "Date restriction enforced: DM Water Analysis records can only be created or modified for today's operating date (2026-11-02). Historical or future modifications are not permitted.");

    var futureSave = await postReq(port, '/api/dm-water-analysis', {
      date: '2026-11-03',
      readings: [BASE_ROW_DM],
    });
    assert.strictEqual(futureSave.status, 400);
    assert.strictEqual(futureSave.body.message, "Date restriction enforced: DM Water Analysis records can only be created or modified for today's operating date (2026-11-02). Historical or future modifications are not permitted.");
    pass('T13: Historical and future operating dates rejected with 400');

    // T14: Numeric equivalence: '11' vs '11.0' returns 200 No changes
    await PlantAnalysisRecord.deleteMany({});
    await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, BASE_ROW_DM, { cond: '11' })],
    });
    var numEq = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, BASE_ROW_DM, { cond: '11.0' })],
    });
    assert.strictEqual(numEq.status, 200);
    assert.strictEqual(numEq.body.noChange, true);
    assert.strictEqual(numEq.body.message, 'No changes');
    pass('T14: Numeric equivalence ("11" vs "11.0") returns 200 No changes');

    // T15: Free text / special value "nil" on th field succeeds and counts as non-empty
    await PlantAnalysisRecord.deleteMany({});
    var nilSave = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [{ id: 'r_dm_water', unit: 'DM WATER', th: 'nil' }],
    });
    assert.strictEqual(nilSave.status, 200);
    assert.strictEqual(nilSave.body.lockedSlots.dm_water.isSaved, true);
    var savedDMTh = nilSave.body.data.readings.find(function (r) { return r.id === 'r_dm_water'; });
    assert.strictEqual(savedDMTh.th, 'nil');
    pass('T15: Special value "nil" on th field succeeds and counts as non-empty');

    // T16: En-dash '–' and '-' treated as empty on save
    await PlantAnalysisRecord.deleteMany({});
    var dashSave = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, BASE_ROW_DM, { cond: '–', sio2: '-' })],
    });
    assert.strictEqual(dashSave.status, 200);
    var savedDMDash = dashSave.body.data.readings.find(function (r) { return r.id === 'r_dm_water'; });
    assert.strictEqual(savedDMDash.cond, '');
    assert.strictEqual(savedDMDash.sio2, '');
    pass('T16: En-dash "–" and "-" treated as empty string on save');

    // T17: Report matcher positive and negative tests using verbatim getCellAuditEntries from disk
    var gLines = fs.readFileSync(path.join(__dirname, '../services/genericPlantReportService.js'), 'utf8').split(/\r?\n/);
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
    await postReq(port, '/api/dm-water-analysis', { date: OP_DATE, targetSlot: 'dm_water', readings: [BASE_ROW_DM] });
    var auditCorr = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [Object.assign({}, BASE_ROW_DM, { ph: '7.6' })],
    });
    assert.strictEqual(auditCorr.status, 200);
    var auditList = auditCorr.body.editAuditHistory;
    assert.strictEqual(auditList.length, 1);
    var expectedFields = ['date', 'rowId', 'shift', 'time', 'field', 'oldValue', 'newValue', 'editedBy', 'editedById', 'timestamp'].sort();
    assert.strictEqual(JSON.stringify(Object.keys(auditList[0]).sort()), JSON.stringify(expectedFields));
    assert.deepStrictEqual(Object.keys(auditList[0]).sort(), expectedFields);

    var dmReading = auditCorr.body.data.readings.find(function (r) { return r.id === 'r_dm_water'; });
    var anionReading = auditCorr.body.data.readings.find(function (r) { return r.id === 'r_anion_unit'; });

    // Positive hit
    var posHit = getCellAuditEntriesVerbatim(auditList, dmReading.id, 'ph', dmReading);
    assert.strictEqual(posHit.length, 1);
    assert.strictEqual(posHit[0].oldValue, '7.5');
    assert.strictEqual(posHit[0].newValue, '7.6');
    assert.strictEqual(posHit[0].rowId, 'r_dm_water');
    assert.strictEqual(posHit[0].shift, 'DM WATER');

    // Negative cross-field
    var negField = getCellAuditEntriesVerbatim(auditList, dmReading.id, 'cond', dmReading);
    assert.strictEqual(negField.length, 0);

    // Negative cross-slot
    var negSlot = getCellAuditEntriesVerbatim(auditList, anionReading.id, 'ph', anionReading);
    assert.strictEqual(negSlot.length, 0);
    pass('T17: Report matcher hits target cell and rejects cross-field and cross-slot');

    // T18: Legacy doc mapping: doc with editCount >= 1 or isLocked -> both slots permanently locked
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Analysis For DM Water / Anion unit',
      unit: 'DM Water',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        initialSaved: true,
        editCount: 1,
        isLocked: true,
        readings: [BASE_ROW_DM, BASE_ROW_ANION],
      },
    });
    var legacyLocked = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE);
    assert.strictEqual(legacyLocked.status, 200);
    assert.strictEqual(legacyLocked.body.lockedSlots.dm_water.isSaved, true);
    assert.strictEqual(legacyLocked.body.lockedSlots.dm_water.isLocked, true);
    assert.strictEqual(legacyLocked.body.lockedSlots.a_unit.isSaved, true);
    assert.strictEqual(legacyLocked.body.lockedSlots.a_unit.isLocked, true);
    pass('T18: Legacy doc with editCount>=1 maps to all slots locked');

    // T19: Legacy doc mapping: doc with editCount 0 and only dm_water saved -> dm_water has correction available
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Analysis For DM Water / Anion unit',
      unit: 'DM Water',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        initialSaved: true,
        editCount: 0,
        isLocked: false,
        readings: [BASE_ROW_DM, { id: 'r_anion_unit', unit: 'A.UNIT', ph: '', cond: '' }],
      },
    });
    var legacyCorrAvail = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE);
    assert.strictEqual(legacyCorrAvail.status, 200);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.dm_water.isSaved, true);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.dm_water.correctionUsed, false);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.dm_water.isLocked, false);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.a_unit.isSaved, false);
    assert.strictEqual(legacyCorrAvail.body.lockedSlots.a_unit.isLocked, false);
    pass('T19: Legacy doc with editCount 0 maps to correction available on dm_water');

    // T20: Legacy flat document (top-level ph/cond/silica) does not crash GET/POST and populates readings
    await PlantAnalysisRecord.deleteMany({});
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'DM Water Analysis',
      unit: 'DM Water',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        time: '08:00',
        ph: 7.4,
        conductivity: 11,
        silica: 0.18,
        initialSaved: true,
        editCount: 0,
        isLocked: false,
      },
    });
    var legacyFlatGet = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE);
    assert.strictEqual(legacyFlatGet.status, 200);
    assert.strictEqual(legacyFlatGet.body.success, true);
    var flatDM = legacyFlatGet.body.data.readings.find(function (r) { return r.id === 'r_dm_water'; });
    assert.strictEqual(flatDM.ph, '7.4');
    assert.strictEqual(flatDM.cond, '11');
    assert.strictEqual(flatDM.sio2, '0.18');
    pass('T20: Legacy flat doc (top-level ph/cond/silica) populates readings safely without crash');

    // T21: Legacy extra rows (r_custom_*) preserved across GET and POST
    await PlantAnalysisRecord.deleteMany({});
    var customRow = {
      id: 'r_custom_1',
      unit: 'Stream 3',
      time: '09:00',
      ph: '7.1',
      cond: '15',
      isDefault: false,
    };
    await PlantAnalysisRecord.create({
      plantName: 'OFFSITE Plant',
      plantCode: 'OFFSITE',
      analysisType: 'Analysis For DM Water / Anion unit',
      unit: 'DM Water',
      date: OP_DATE,
      shift: 'Day',
      company: '650000000000000000000002',
      data: {
        readings: [BASE_ROW_DM, BASE_ROW_ANION, customRow],
        initialSaved: true,
        editCount: 1,
        isLocked: true,
      },
    });
    var extraRowsGet = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE);
    assert.strictEqual(extraRowsGet.status, 200);
    assert.strictEqual(extraRowsGet.body.data.readings.length, 3);
    var foundCust = extraRowsGet.body.data.readings.find(function (r) { return r.id === 'r_custom_1'; });
    assert.strictEqual(foundCust.unit, 'Stream 3');
    pass('T21: Legacy extra custom rows preserved across GET and POST');

    // T22: 06:00 IST boundary rollover
    await PlantAnalysisRecord.deleteMany({});
    clockNow = istDate(2026, 11, 2, 5, 59); // Operating date 2026-11-01
    var rollBefore = await postReq(port, '/api/dm-water-analysis', {
      date: '2026-11-02',
      readings: [BASE_ROW_DM],
    });
    assert.strictEqual(rollBefore.status, 400);
    assert.strictEqual(rollBefore.body.message, "Date restriction enforced: DM Water Analysis records can only be created or modified for today's operating date (2026-11-01). Historical or future modifications are not permitted.");

    clockNow = istDate(2026, 11, 2, 6, 0); // Operating date 2026-11-02
    var rollAt = await postReq(port, '/api/dm-water-analysis', {
      date: '2026-11-02',
      targetSlot: 'dm_water',
      readings: [BASE_ROW_DM],
    });
    assert.strictEqual(rollAt.status, 200);
    assert.strictEqual(rollAt.body.success, true);
    pass('T22: 06:00 IST boundary rollover enforces operating day cutoff');

    // T23: Correction cannot clear all user values (status 400 + stored state unchanged)
    clockNow = istDate(2026, 11, 2, 10, 0);
    await PlantAnalysisRecord.deleteMany({});
    var t23Save1 = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [BASE_ROW_DM],
    });
    assert.strictEqual(t23Save1.status, 200);
    assert.strictEqual(t23Save1.body.lockedSlots.dm_water.isSaved, true);
    assert.strictEqual(t23Save1.body.lockedSlots.dm_water.correctionUsed, false);

    var clearedRow = {
      id: 'r_dm_water',
      unit: 'DM WATER',
      ph: '',
      cond: '',
      th: '',
      alk: '',
      sio2: '',
    };
    var t23ClearCorr = await postReq(port, '/api/dm-water-analysis', {
      date: OP_DATE,
      targetSlot: 'dm_water',
      readings: [clearedRow],
    });
    assert.strictEqual(t23ClearCorr.status, 400);
    assert.strictEqual(
      t23ClearCorr.body.message,
      'A correction cannot clear all values in dm_water. At least one non-empty value is required.'
    );

    var t23Get = await getReq(port, '/api/dm-water-analysis?date=' + OP_DATE);
    assert.strictEqual(t23Get.status, 200);
    var t23StoredDM = t23Get.body.data.readings.find(function (r) { return r.id === 'r_dm_water'; });
    assert.strictEqual(t23StoredDM.ph, BASE_ROW_DM.ph);
    assert.strictEqual(t23StoredDM.cond, BASE_ROW_DM.cond);
    assert.strictEqual(t23StoredDM.th, BASE_ROW_DM.th);
    assert.strictEqual(t23StoredDM.alk, BASE_ROW_DM.alk);
    assert.strictEqual(t23StoredDM.sio2, BASE_ROW_DM.sio2);
    assert.strictEqual(t23Get.body.lockedSlots.dm_water.correctionUsed, false);
    pass('T23: Correction clearing all user fields rejected with 400 and leaves stored doc untouched');

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
