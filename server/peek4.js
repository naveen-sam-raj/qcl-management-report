/**
 * server/peek4.js
 * 
 * Diagnostic shape inspector for specific plant analysis records:
 * 1. ACL / ACL Product Analysis / 2026-10-10, 2026-10-13, 2026-10-29
 * 2. SA / LSA Bagging Analysis / 2026-10-21
 * 3. ACL / TK 204 Analysis / all October 2026 dates
 * 
 * Strictly READ-ONLY on MongoDB (find only, zero writes).
 * Never prints MONGODB_URI.
 * Prints SHAPE, types, array lengths, and filled/total counts. Never prints measurement values.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');

const COLL = 'plantanalysisrecords';

const SKIP_KEYS = new Set([
  '_id', 'id', 'time', 'date', 'plant', 'plantCode', 'plantName',
  'analysisType', 'unit', 'userId', 'submittedBy', 'submittedById',
  'submittedAt', 'company', 'tank', 'isDefault', 'status', 'isSaved',
  'isLocked', 'initialSaved', 'editCount', 'editedFields', 'editAuditHistory',
  'lockedShifts', 'lockedSlots', 'savedAt', 'createdAt', 'updatedAt', '__v'
]);

function countFilledFields(v, depth = 0) {
  if (depth > 6) return { total: 0, filled: 0 };
  if (v === null || v === undefined) return { total: 1, filled: 0 };
  if (Array.isArray(v)) {
    return v.reduce(
      (acc, item) => {
        const res = countFilledFields(item, depth + 1);
        return { total: acc.total + res.total, filled: acc.filled + res.filled };
      },
      { total: 0, filled: 0 }
    );
  }
  if (typeof v === 'object') {
    if (v._bsontype) return { total: 0, filled: 0 };
    let total = 0;
    let filled = 0;
    for (const [k, val] of Object.entries(v)) {
      if (depth === 0 && SKIP_KEYS.has(k)) continue;
      const res = countFilledFields(val, depth + 1);
      total += res.total;
      filled += res.filled;
    }
    return { total, filled };
  }
  const s = String(v).trim();
  const isFilled = s !== '' && s !== '*' && s !== 'null' && s !== 'undefined';
  return { total: 1, filled: isFilled ? 1 : 0 };
}

function summarizeDataShape(data) {
  if (!data || typeof data !== 'object') return { type: typeof data };
  const keys = Object.keys(data);
  const structure = {};

  for (const k of keys) {
    const val = data[k];
    if (val === null || val === undefined) {
      structure[k] = { type: 'null' };
    } else if (Array.isArray(val)) {
      structure[k] = {
        type: 'array',
        length: val.length,
        itemKeys: val[0] && typeof val[0] === 'object' ? Object.keys(val[0]) : typeof val[0],
      };
    } else if (typeof val === 'object') {
      const childKeys = Object.keys(val);
      structure[k] = {
        type: 'object',
        keyCount: childKeys.length,
        keys: childKeys.slice(0, 15),
      };
    } else {
      structure[k] = { type: typeof val };
    }
  }
  return structure;
}

(async () => {
  try {
    const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, { readPreference: 'primary' });
    await client.connect();
    const db = client.db();
    console.log('Connected to DB:', db.databaseName);
    const col = db.collection(COLL);

    const queries = [
      {
        target: '1. ACL / ACL Product Analysis (2026-10-10, 2026-10-13, 2026-10-29)',
        filter: {
          plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
          analysisType: { $regex: /^ACL Product Analysis$/i },
          date: { $in: ['2026-10-10', '2026-10-13', '2026-10-29'] },
        },
      },
      {
        target: '2. SA / LSA Bagging Analysis (2026-10-21)',
        filter: {
          plantCode: { $in: ['SA', 'SA Plant', 'SA PLANT'] },
          analysisType: { $regex: /^LSA Bagging Analysis$/i },
          date: '2026-10-21',
        },
      },
      {
        target: '3. ACL / TK 204 Analysis (All October 2026 dates)',
        filter: {
          plantCode: { $in: ['ACL', 'ACL Plant', 'ACL PLANT'] },
          analysisType: { $regex: /^TK 204 Analysis$/i },
          date: { $gte: '2026-10-01', $lte: '2026-10-31' },
        },
      },
    ];

    for (const q of queries) {
      console.log('\n======================================================================');
      console.log(`QUERY TARGET: ${q.target}`);
      console.log('======================================================================');

      const docs = await col.find(q.filter).sort({ date: 1, createdAt: 1 }).toArray();
      console.log(`Matching documents found: ${docs.length}\n`);

      docs.forEach((doc, idx) => {
        const topLevelKeys = Object.keys(doc);
        const dataShape = summarizeDataShape(doc.data);
        const counts = countFilledFields(doc.data || {});

        console.log(`--- [Doc ${idx + 1}/${docs.length}] ---`);
        console.log(`_id:          ${doc._id}`);
        console.log(`date:         ${doc.date}`);
        console.log(`plantCode:    ${doc.plantCode}`);
        console.log(`analysisType: ${doc.analysisType}`);
        console.log(`shift:        ${doc.shift || '(none)'}`);
        console.log(`company:      ${doc.company || '(none)'}`);
        console.log(`topLevelKeys: [${topLevelKeys.join(', ')}]`);
        console.log(`dataKeys:     [${doc.data ? Object.keys(doc.data).join(', ') : 'none'}]`);
        console.log(`measurements: filled=${counts.filled}, total=${counts.total}, fillRate=${counts.total > 0 ? ((counts.filled / counts.total) * 100).toFixed(1) + '%' : 'N/A'}`);
        console.log('dataShape:');
        console.dir(dataShape, { depth: null });
        console.log('');
      });
    }

    await client.close();
    console.log('Inspection completed.');
  } catch (err) {
    console.error('peek4 error:', err);
    process.exit(1);
  }
})();
