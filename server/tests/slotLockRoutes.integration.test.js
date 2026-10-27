/**
 * server/tests/slotLockRoutes.integration.test.js
 *
 * Authoritative integration test suite covering slot-level locking route factory
 * parametrized across [TK 205, TK 203, TK 207] against mongodb-memory-server
 * with the real PlantAnalysisRecord model and compound unique index.
 *
 * Covers:
 * 1. First save t07 (upsert creates document, no audit history)
 * 2. Predecessor lock (saving t09 locks t07)
 * 3. One correction then lock (records editedFields + editAuditHistory, immediately locks unit)
 * 4. 400 on locked edit
 * 5. 400 on empty unit save
 * 6. 400 on skip-ahead save
 * 7. Identical re-save noChange 200
 * 8. Concurrent saves (one 200, one 409)
 * 9. Duplicate docs resolution (canonical doc chosen and updated)
 * 10. 00:00-05:59 IST operating date enforcement
 * 11. x-test-mode / x-test-now / payload.isTestMode bypasses strictly ignored
 * 12. TK 203 co2 tracked in recordFieldEdits
 * 13. 5 Legacy hydration cases (no data, only t07, t07+t09 with shift1 locked, gap t07+t11, all locked)
 * 14. GET never writes to MongoDB; persists only inside conditional atomic write
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
const { createTk205Router } = require('../routes/tk205AnalysisRoutes');
const { createTk203Router } = require('../routes/tk203AnalysisRoutes');
const { createTk207Router } = require('../routes/tk207AnalysisRoutes');
const { deriveLegacyLockedSlots } = require('../routes/createSlotLockRoute');

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];

function createISTDate(year, month, day, hour, minute) {
  const istMinutes = hour * 60 + minute;
  const utcMinutes = istMinutes - 330;
  return new Date(Date.UTC(year, month - 1, day, 0, utcMinutes, 0));
}

const CONFIGS = [
  {
    name: 'TK 205',
    path: '/api/tk-205-analysis',
    analysisType: 'TK 205 Analysis',
    unitName: 'TK 205',
    createRouter: createTk205Router,
    sampleRow: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
    correctionRow: { fnh3: '9.99', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
    hasCo2: false,
  },
  {
    name: 'TK 203',
    path: '/api/tk-203-analysis',
    analysisType: 'TK 203 Analysis',
    unitName: 'TK 203',
    createRouter: createTk203Router,
    sampleRow: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00', co2: '5.00' },
    correctionRow: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00', co2: '8.88' },
    hasCo2: true,
  },
  {
    name: 'TK 207',
    path: '/api/tk-207-analysis',
    analysisType: 'TK 207 Analysis',
    unitName: 'TK 207',
    createRouter: createTk207Router,
    sampleRow: { fnh3: '1.25', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
    correctionRow: { fnh3: '9.99', cnh3: '2.50', tcl: '3.75', pcl: '4.00' },
    hasCo2: false,
  },
];

async function run() {
  console.log('========================================================================');
  console.log('🧪 RUNNING PARAMETRIZED SLOT LOCK ROUTES INTEGRATION TESTS');
  console.log('========================================================================\n');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await PlantAnalysisRecord.collection.createIndex(
    { plantCode: 1, analysisType: 1, date: 1, shift: 1, time: 1 },
    { unique: true, sparse: true }
  );

  const authMiddleware = require('../middleware/auth');
  authMiddleware.protect = (req, res, next) => {
    req.user = {
      _id: new mongoose.Types.ObjectId('650000000000000000000001'),
      name: 'Integration Test Operator',
      role: 'admin',
      company: new mongoose.Types.ObjectId('650000000000000000000002'),
    };
    next();
  };

  for (const cfg of CONFIGS) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`▶ TESTING CONFIG: ${cfg.name} (${cfg.analysisType})`);
    console.log(`------------------------------------------------------------------------`);

    let currentInjectedNow = createISTDate(2026, 10, 27, 10, 0);
    const testDate = '2026-10-27';

    const router = cfg.createRouter({
      getNow: () => (currentInjectedNow ? new Date(currentInjectedNow) : new Date()),
    });

    const app = express();
    app.use(express.json());
    app.use(cfg.path, router);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    async function postSave(body, headers = {}) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: cfg.path,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
              ...headers,
            },
            agent: false,
          },
          (res) => {
            let raw = '';
            res.on('data', (c) => (raw += c));
            res.on('end', () => {
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

    async function getFetch(date) {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: `${cfg.path}?date=${date}`,
            method: 'GET',
          },
          (res) => {
            let raw = '';
            res.on('data', (c) => (raw += c));
            res.on('end', () => {
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

    // 1. First save t07
    const res1 = await postSave({
      date: testDate,
      rows: { t07: cfg.sampleRow },
    });
    assert.strictEqual(res1.status, 200, `First save t07 failed: ${res1.body?.message}`);
    assert.strictEqual(res1.body.targetUnit, 't07');
    assert.strictEqual(res1.body.isCorrection, false);
    assert.deepStrictEqual(res1.body.data.editedFields, {});
    assert.deepStrictEqual(res1.body.data.editAuditHistory, []);

    const doc1 = await PlantAnalysisRecord.findOne({
      date: testDate,
      plantCode: 'ACL',
      analysisType: cfg.analysisType,
    });
    assert.ok(doc1);
    assert.strictEqual(doc1.data.lockedSlots.t07.isSaved, true);
    assert.strictEqual(doc1.data.lockedSlots.t07.isLocked, false);
    assert.strictEqual(doc1.data.lockedSlots.t07.correctionUsed, false);
    assert.strictEqual(doc1.data.editedFields, undefined);
    assert.strictEqual(doc1.data.editAuditHistory, undefined);
    console.log(`  [PASS] ${cfg.name}: First save of t07 created doc with correct lockedSlots.`);

    // 2. Predecessor lock: Save t09 locks t07
    const res2 = await postSave({
      date: testDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.sampleRow,
      },
    });
    assert.strictEqual(res2.status, 200, `Save t09 failed: ${res2.body?.message}`);
    assert.strictEqual(res2.body.targetUnit, 't09');
    assert.strictEqual(res2.body.isCorrection, false);

    const doc2 = await PlantAnalysisRecord.findById(doc1._id);
    assert.strictEqual(doc2.data.lockedSlots.t07.isLocked, true, 't07 must be locked');
    assert.strictEqual(doc2.data.lockedSlots.t09.isSaved, true);
    assert.strictEqual(doc2.data.lockedSlots.t09.isLocked, false);
    console.log(`  [PASS] ${cfg.name}: Save of t09 permanently locked predecessor t07.`);

    // 3. One correction then lock (tracks CO2 for TK203)
    const res3 = await postSave({
      date: testDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.correctionRow,
      },
    });
    assert.strictEqual(res3.status, 200, `Correction failed: ${res3.body?.message}`);
    assert.strictEqual(res3.body.isCorrection, true);
    assert.strictEqual(res3.body.targetUnit, 't09');

    const doc3 = await PlantAnalysisRecord.findById(doc1._id);
    assert.strictEqual(doc3.data.lockedSlots.t09.isLocked, true, 't09 must now be locked');
    assert.strictEqual(doc3.data.lockedSlots.t09.correctionUsed, true);
    assert.ok(doc3.data.editAuditHistory.length >= 1);
    if (cfg.hasCo2) {
      assert.strictEqual(doc3.data.editedFields['t09_co2'], true, 'CO2 edit must be tracked for TK 203');
      const co2Entry = doc3.data.editAuditHistory.find((e) => e.paramKey === 'co2');
      assert.ok(co2Entry, 'CO2 audit entry must exist');
      assert.strictEqual(co2Entry.oldValue, '5.00');
      assert.strictEqual(co2Entry.newValue, '8.88');
      console.log(`  [PASS] ${cfg.name}: TK 203 CO2 parameter edit strictly tracked in audit history.`);
    }
    console.log(`  [PASS] ${cfg.name}: Correction on t09 wrote audit history and immediately locked.`);

    // 4. 400 on locked edit
    const res4 = await postSave({
      date: testDate,
      rows: {
        t07: cfg.sampleRow,
        t09: { ...cfg.correctionRow, fnh3: '9.98' },
      },
    });
    assert.strictEqual(res4.status, 400, 'Second edit to t09 must be rejected with 400');
    assert.ok(res4.body.message.includes('permanently locked'));
    console.log(`  [PASS] ${cfg.name}: Locked edit rejected with 400.`);

    // 5. 400 on empty unit
    const res5 = await postSave({
      date: testDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.correctionRow,
        t11: { fnh3: '', cnh3: null, tcl: '   ', pcl: undefined },
      },
    });
    assert.strictEqual(res5.status, 400, 'Empty unit save must be rejected with 400');
    assert.ok(res5.body.message.includes('empty') || res5.body.message.includes('Cannot save empty slot'));
    console.log(`  [PASS] ${cfg.name}: Empty unit save rejected with 400.`);

    // 6. 400 on skip-ahead save (t13 before t11)
    const res6 = await postSave({
      date: testDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.correctionRow,
        t13: cfg.sampleRow,
      },
    });
    assert.strictEqual(res6.status, 400, 'Skip-ahead save must be rejected with 400');
    assert.ok(res6.body.message.includes('Sequential restriction: t11 must be completed and saved'));
    console.log(`  [PASS] ${cfg.name}: Skip-ahead save rejected with 400.`);

    // 7. Identical re-save noChange 200
    const res7 = await postSave({
      date: testDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.correctionRow,
      },
    });
    assert.strictEqual(res7.status, 200);
    assert.strictEqual(res7.body.noChange, true);
    assert.strictEqual(res7.body.message, 'No changes');
    console.log(`  [PASS] ${cfg.name}: Identical re-save returned 200 noChange.`);

    // 8. Concurrent saves (one 200, one 409)
    function postConcurrent(b1, b2) {
      return new Promise((resolve, reject) => {
        const d1 = JSON.stringify(b1);
        const d2 = JSON.stringify(b2);
        let s1Connected = false;
        let s2Connected = false;

        const req1 = http.request({
          host: '127.0.0.1',
          port,
          path: cfg.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(d1),
          },
          agent: false,
        });

        const req2 = http.request({
          host: '127.0.0.1',
          port,
          path: cfg.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(d2),
          },
          agent: false,
        });

        function fireIfReady() {
          if (s1Connected && s2Connected) {
            req1.write(d1);
            req1.end();
            req2.write(d2);
            req2.end();
          }
        }

        req1.on('socket', (sock) => {
          if (sock.connecting) {
            sock.on('connect', () => { s1Connected = true; fireIfReady(); });
          } else {
            s1Connected = true; fireIfReady();
          }
        });

        req2.on('socket', (sock) => {
          if (sock.connecting) {
            sock.on('connect', () => { s2Connected = true; fireIfReady(); });
          } else {
            s2Connected = true; fireIfReady();
          }
        });

        const resPromise1 = new Promise((res) => {
          req1.on('response', (response) => {
            let raw = '';
            response.on('data', (c) => (raw += c));
            response.on('end', () => {
              try { res({ status: response.statusCode, body: JSON.parse(raw) }); }
              catch (e) { res({ status: response.statusCode, body: raw }); }
            });
          });
          req1.on('error', reject);
        });

        const resPromise2 = new Promise((res) => {
          req2.on('response', (response) => {
            let raw = '';
            response.on('data', (c) => (raw += c));
            response.on('end', () => {
              try { res({ status: response.statusCode, body: JSON.parse(raw) }); }
              catch (e) { res({ status: response.statusCode, body: raw }); }
            });
          });
          req2.on('error', reject);
        });

        Promise.all([resPromise1, resPromise2]).then(resolve, reject);
      });
    }

    const origFind = PlantAnalysisRecord.find;
    let findCount = 0;
    let releaseBarrier;
    const findBarrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });

    PlantAnalysisRecord.find = function (...args) {
      findCount++;
      if (findCount >= 2) {
        releaseBarrier();
      }
      return findBarrier.then(() => origFind.apply(this, args));
    };

    let c1, c2;
    try {
      [c1, c2] = await postConcurrent(
        {
          date: testDate,
          rows: {
            t07: cfg.sampleRow,
            t09: cfg.correctionRow,
            t11: { ...cfg.sampleRow, fnh3: '3.11' },
          },
        },
        {
          date: testDate,
          rows: {
            t07: cfg.sampleRow,
            t09: cfg.correctionRow,
            t11: { ...cfg.sampleRow, fnh3: '3.12' },
          },
        }
      );
    } finally {
      PlantAnalysisRecord.find = origFind;
    }

    const statuses = [c1.status, c2.status].sort();
    assert.deepStrictEqual(statuses, [200, 409], `Expected [200, 409], got [${c1.status}, ${c2.status}]`);
    console.log(`  [PASS] ${cfg.name}: Concurrent saves handled: one 200, one 409.`);

    // 9. Duplicate docs resolution
    const dupDate = '2026-10-26';
    currentInjectedNow = createISTDate(2026, 10, 26, 11, 0);
    const primaryDoc = await PlantAnalysisRecord.create({
      plantName: 'ACL Plant',
      plantCode: 'ACL',
      analysisType: cfg.analysisType,
      unit: cfg.unitName,
      date: dupDate,
      shift: '',
      data: {
        rows: { t07: cfg.sampleRow },
        lockedSlots: {
          t07: { isSaved: true, isLocked: false, correctionUsed: false },
        },
      },
      createdAt: new Date('2026-10-26T05:00:00Z'),
      updatedAt: new Date('2026-10-26T05:00:00Z'),
    });
    const placeholderDoc = await PlantAnalysisRecord.create({
      plantName: 'ACL Plant',
      plantCode: 'ACL',
      analysisType: cfg.analysisType,
      unit: cfg.unitName,
      date: dupDate,
      shift: 'All Shifts',
      data: {},
      createdAt: new Date('2026-10-26T05:01:00Z'),
      updatedAt: new Date('2026-10-26T05:01:00Z'),
    });

    const resDup = await postSave({
      date: dupDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.sampleRow,
      },
    });
    assert.strictEqual(resDup.status, 200);
    const reloadedPrimary = await PlantAnalysisRecord.findById(primaryDoc._id);
    const reloadedPlaceholder = await PlantAnalysisRecord.findById(placeholderDoc._id);
    assert.ok(reloadedPrimary.data.rows.t09);
    assert.strictEqual(Object.keys(reloadedPlaceholder.data?.rows || {}).length, 0);
    console.log(`  [PASS] ${cfg.name}: Canonical doc chosen over placeholder doc without whole-data overwrite.`);

    // 10. 00:00-05:59 IST operating date enforcement
    // e.g. 2026-10-28 01:00 IST -> operating date is 2026-10-27
    currentInjectedNow = createISTDate(2026, 10, 28, 1, 0);
    const opDateResWrong = await postSave({
      date: '2026-10-28',
      rows: { t07: cfg.sampleRow },
    });
    assert.strictEqual(opDateResWrong.status, 400);
    assert.ok(opDateResWrong.body.message.includes('2026-10-27'));

    const docBeforeT13 = await PlantAnalysisRecord.findOne({
      date: testDate,
      plantCode: 'ACL',
      analysisType: cfg.analysisType,
    });
    const opDateResRight = await postSave({
      date: '2026-10-27',
      rows: {
        ...(docBeforeT13.data?.rows || {}),
        t13: cfg.sampleRow,
      },
    });
    assert.strictEqual(opDateResRight.status, 200, `Expected 200 saving t13 on operating date, got ${opDateResRight.status}: ${opDateResRight.body?.message}`);
    console.log(`  [PASS] ${cfg.name}: 00:00-05:59 IST operating date window strictly enforced.`);

    // 11. x-test-mode / x-test-now / payload.isTestMode bypasses strictly ignored
    currentInjectedNow = createISTDate(2026, 10, 28, 1, 0); // operating date is 2026-10-27
    const bypassRes = await postSave(
      {
        date: '2026-10-28',
        rows: { t07: cfg.sampleRow },
        isTestMode: true,
      },
      {
        'x-test-mode': 'true',
        'x-test-now': '2026-10-28T10:00:00.000Z',
        'x-test-env': 'true',
      }
    );
    assert.strictEqual(bypassRes.status, 400, 'Test bypass headers must be ignored');
    assert.ok(bypassRes.body.message.includes('2026-10-27'));
    console.log(`  [PASS] ${cfg.name}: x-test-mode / x-test-now / payload.isTestMode strictly ignored.`);

    // 12. 5 Legacy Hydration Cases & GET never writes to DB
    console.log(`  ▶ Testing 5 Legacy Hydration Cases for ${cfg.name}:`);

    // Case H1: No data
    const h1 = deriveLegacyLockedSlots({}, {}, UNITS_ORDER);
    assert.strictEqual(h1.t07.isSaved, false);
    assert.strictEqual(h1.t07.isLocked, false);
    assert.strictEqual(h1.t09.isSaved, false);
    assert.strictEqual(h1.t09.isLocked, false);
    console.log(`    [PASS] Hydration Case 1 (no data): Initial slots ready.`);

    // Case H2: Only t07
    const h2 = deriveLegacyLockedSlots({ t07: cfg.sampleRow }, { shift1Locked: false }, UNITS_ORDER);
    assert.strictEqual(h2.t07.isSaved, true);
    assert.strictEqual(h2.t07.isLocked, false, 't07 has correction available');
    assert.strictEqual(h2.t07.correctionUsed, false);
    assert.strictEqual(h2.t09.isSaved, false);
    assert.strictEqual(h2.t09.isLocked, false, 't09 is open');
    console.log(`    [PASS] Hydration Case 2 (only t07): t07 correction available, t09 open.`);

    // Case H3: t07 + t09 with shift1 locked
    const h3 = deriveLegacyLockedSlots(
      { t07: cfg.sampleRow, t09: cfg.sampleRow },
      { shift1Locked: true },
      UNITS_ORDER
    );
    assert.strictEqual(h3.t07.isSaved, true);
    assert.strictEqual(h3.t07.isLocked, true);
    assert.strictEqual(h3.t09.isSaved, true);
    assert.strictEqual(h3.t09.isLocked, true, 't09 is locked because shift1 is locked');
    assert.strictEqual(h3.t09.correctionUsed, true);
    assert.strictEqual(h3.t11.isSaved, false);
    assert.strictEqual(h3.t11.isLocked, false, 't11 is open');
    console.log(`    [PASS] Hydration Case 3 (t07+t09 shift1 locked): t09 locked+correctionUsed, t11 open.`);

    // Case H4: Gap t07 + t11
    const h4 = deriveLegacyLockedSlots(
      { t07: cfg.sampleRow, t11: cfg.sampleRow },
      { shift1Locked: false },
      UNITS_ORDER
    );
    assert.strictEqual(h4.t07.isSaved, true);
    assert.strictEqual(h4.t07.isLocked, true);
    assert.strictEqual(h4.t09.isSaved, false);
    assert.strictEqual(h4.t09.isLocked, true, 't09 is locked-empty gap');
    assert.strictEqual(h4.t11.isSaved, true);
    assert.strictEqual(h4.t11.isLocked, false);
    assert.strictEqual(h4.t13.isSaved, false);
    assert.strictEqual(h4.t13.isLocked, false);
    console.log(`    [PASS] Hydration Case 4 (gap t07+t11): t09 locked-empty gap, t11 correction available, t13 open.`);

    // Case H5: All locked
    const fullRows = {};
    UNITS_ORDER.forEach((s) => (fullRows[s] = cfg.sampleRow));
    const h5 = deriveLegacyLockedSlots(fullRows, { shift3Locked: true }, UNITS_ORDER);
    UNITS_ORDER.forEach((s) => {
      assert.strictEqual(h5[s].isSaved, true, `${s} must be saved`);
      assert.strictEqual(h5[s].isLocked, true, `${s} must be locked`);
    });
    console.log(`    [PASS] Hydration Case 5 (all locked): all 12 slots locked.`);

    // In-DB Hydration Verification: GET never writes to DB, POST conditional write persists
    const legacyDate = '2026-10-25';
    currentInjectedNow = createISTDate(2026, 10, 25, 12, 0);

    const legacyDoc = await PlantAnalysisRecord.create({
      plantName: 'ACL Plant',
      plantCode: 'ACL',
      analysisType: cfg.analysisType,
      unit: cfg.unitName,
      date: legacyDate,
      shift: 'All Shifts',
      data: {
        rows: { t07: cfg.sampleRow },
        lockedShifts: { shift1Locked: false },
        // notice: NO lockedSlots
      },
    });

    const getRes = await getFetch(legacyDate);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.lockedSlots.t07.isSaved, true);
    assert.strictEqual(getRes.body.lockedSlots.t07.isLocked, false);

    // Verify DB doc was NOT modified by GET
    const docAfterGet = await PlantAnalysisRecord.findById(legacyDoc._id).lean();
    assert.strictEqual(docAfterGet.data.lockedSlots, undefined, 'GET must NEVER write lockedSlots to DB');
    console.log(`    [PASS] Verified GET derived lockedSlots in-memory without writing to MongoDB.`);

    // Now perform save of t09 on legacy doc: conditional atomic write persists lockedSlots
    const saveOnLegacyRes = await postSave({
      date: legacyDate,
      rows: {
        t07: cfg.sampleRow,
        t09: cfg.sampleRow,
      },
    });
    assert.strictEqual(saveOnLegacyRes.status, 200);
    const docAfterSave = await PlantAnalysisRecord.findById(legacyDoc._id).lean();
    assert.ok(docAfterSave.data.lockedSlots, 'Conditional atomic write must persist lockedSlots in MongoDB');
    assert.strictEqual(docAfterSave.data.lockedSlots.t07.isLocked, true);
    assert.strictEqual(docAfterSave.data.lockedSlots.t09.isSaved, true);
    console.log(`    [PASS] Verified conditional atomic write persisted full lockedSlots to MongoDB.`);

    server.close();
  }

  await mongoose.disconnect();
  await mongod.stop();

  console.log('\n========================================================================');
  console.log('✅ ALL PARAMETRIZED INTEGRATION TESTS PASSED FOR [TK 205, TK 203, TK 207]!');
  console.log('========================================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Integration test failed:', err);
  process.exit(1);
});
