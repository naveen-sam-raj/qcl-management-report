// diag.js  (read-only: find/aggregate/distinct only)
// node diag.js <PLANT> <FROM> <TO> [COMPANY_ID]
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config({ path: require('path').join(__dirname, 'server/.env') });

const [, , PLANT, FROM, TO, COMPANY] = process.argv;
if (!PLANT || !FROM || !TO) { console.error('Usage: node diag.js <PLANT> <FROM> <TO> [COMPANY_ID]'); process.exit(1); }

const ALIASES = {
  ACL: ['ACL', 'ACL Plant', 'ACL PLANT'],
  SA: ['SA', 'SA Plant', 'SA PLANT'],
  OFFSITE: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant', 'OFFSITE PLANT'],
  CO2: ['CO2', 'CO2 Plant', 'CO2 PLANT'],
};
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

(async () => {
  const n = PLANT.trim().toUpperCase();
  const aliases = ALIASES[n] || [n, `${n} Plant`, `${n} PLANT`];
  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, { readPreference: 'primary' });
  await client.connect();
  const db = client.db();
  if (!(await db.listCollections({ name: 'plantanalysisrecords' }).toArray()).length) {
    throw new Error('collection plantanalysisrecords not found');
  }
  const col = db.collection('plantanalysisrecords');
  const inRange = { plantCode: { $in: aliases }, date: { $gte: FROM, $lte: TO } };
  const run = async (title, fn) => {
    console.log(`\n=== ${title} ===`);
    try { await fn(); } catch (e) { console.error('SECTION FAILED:', e.message); }
  };

  await run('1. plantCode variants the report query would MISS', async () => {
    const low = aliases.map((a) => a.toLowerCase());
    const rows = await col.aggregate([{ $group: { _id: '$plantCode', docs: { $sum: 1 } } }]).toArray();
    const bad = rows.filter((r) => low.includes(String(r._id).trim().toLowerCase()) && !aliases.includes(r._id));
    console.log(bad.length ? bad : 'none');
  });

  await run('2. per date / analysisType / company -> per_date_report.csv', async () => {
    const rows = await col.aggregate([
      { $match: inRange },
      { $group: { _id: { date: '$date', type: '$analysisType', company: { $ifNull: [{ $toString: '$company' }, 'none'] } }, n: { $sum: 1 } } },
      { $sort: { '_id.date': 1, '_id.type': 1 } },
    ], { allowDiskUse: true }).toArray();
    const out = ['date,analysisType,company,docs,visible_to_given_company'];
    for (const r of rows) {
      const c = r._id.company;
      out.push([r._id.date, q(r._id.type), c, r.n, COMPANY ? (c === COMPANY || c === 'none') : ''].join(','));
    }
    fs.writeFileSync('per_date_report.csv', out.join('\n'));
    console.log(`${rows.length} rows written`);
  });

  await run('3. company field types and ids (this plant)', async () => {
    const rows = await col.aggregate([
      { $match: { plantCode: { $in: aliases } } },
      { $group: { _id: { t: { $type: '$company' }, c: { $toString: '$company' } }, docs: { $sum: 1 } } },
      { $sort: { docs: -1 } },
    ]).toArray();
    console.table(rows.map((r) => ({ type: r._id.t, company: r._id.c, docs: r.docs })));
  });

  await run('4. analysisType case/whitespace variants (normalised in JS)', async () => {
    const rows = await col.aggregate([
      { $match: { plantCode: { $in: aliases } } },
      { $group: { _id: '$analysisType', docs: { $sum: 1 }, minDate: { $min: '$date' }, maxDate: { $max: '$date' } } },
    ]).toArray();
    const groups = new Map();
    for (const r of rows) {
      const k = norm(r._id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ exact: JSON.stringify(r._id), docs: r.docs, minDate: r.minDate, maxDate: r.maxDate });
    }
    const split = [...groups].filter(([, v]) => v.length > 1);
    console.log(split.length ? JSON.stringify(split, null, 1) : 'none');
  });

  await run('5. distinct unit values per analysisType (range)', async () => {
    const rows = await col.aggregate([
      { $match: inRange },
      { $group: { _id: '$analysisType', units: { $addToSet: '$unit' }, docs: { $sum: 1 } } },
    ]).toArray();
    console.table(rows.map((r) => ({ analysisType: r._id, units: r.units.join(' | '), docs: r.docs })));
  });

  await run('6. date values not matching YYYY-MM-DD (this plant, all dates)', async () => {
    const bad = await col.find({ plantCode: { $in: aliases }, date: { $not: /^\d{4}-\d{2}-\d{2}$/ } })
      .project({ date: 1, analysisType: 1 }).limit(20).toArray();
    console.log(bad.length ? bad : 'none');
  });

  await run('7. dates with 2+ docs of one analysisType (informational)', async () => {
    const rows = await col.aggregate([
      { $match: inRange },
      { $group: {
          _id: { date: '$date', type: '$analysisType' },
          n: { $sum: 1 },
          units: { $addToSet: '$unit' },
          docs: { $push: { id: '$_id', shift: '$shift', rows: { $type: '$data.rows' }, params: { $type: '$data.parameters' }, company: { $toString: '$company' } } },
      } },
      { $match: { n: { $gt: 1 } } },
      { $project: { n: 1, units: 1, docs: { $slice: ['$docs', 4] } } },
      { $sort: { '_id.date': 1 } },
      { $limit: 50 },
    ], { allowDiskUse: true }).toArray();
    console.log(rows.length ? JSON.stringify(rows, null, 1) : 'none');
  });

  await run('8. shape checks (range)', async () => {
    console.log('docs with BOTH data.rows and data.parameters:',
      await col.countDocuments({ ...inRange, 'data.rows': { $exists: true }, 'data.parameters': { $exists: true } }));
    console.log('docs with empty data.parameters {}:',
      await col.countDocuments({ ...inRange, 'data.parameters': {} }));
  });

  await client.close();
})().catch((e) => { console.error(e); process.exit(1); });
