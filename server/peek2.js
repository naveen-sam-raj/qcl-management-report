require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const COLL = 'plantanalysisrecords';
const IDS = [
  '6ac93579e42bcc5cd1689ce6', '6ac9357b38e61e154253a3c0',
  '6ac94aebe42bcc5cd1689d24', '6ac94aec38e61e154253b322',
  '6ac885999c5fda464d7e9dfd', '6ac8d234e42bcc5cd1689bfc',
  '6ac8d2363796c6bd553f236e'
];
const SKIP = new Set(['id','time','date','plant','analysisType','unit','userId','submittedBy','submittedById','submittedAt','company','tank','isDefault']);
const sum = a => a.reduce((x, y) => ({ t: x.t + y.t, f: x.f + y.f }), { t: 0, f: 0 });
function count(v, depth = 0) {
  if (depth > 6) return { t: 0, f: 0 };
  if (v === null || v === undefined) return { t: 1, f: 0 };
  if (Array.isArray(v)) return sum(v.map(x => count(x, depth + 1)));
  if (typeof v === 'object') {
    if (v._bsontype) return { t: 0, f: 0 };
    return sum(Object.entries(v).filter(([k]) => !SKIP.has(k)).map(([, x]) => count(x, depth + 1)));
  }
  return { t: 1, f: String(v).trim() === '' ? 0 : 1 };
}
(async () => {
  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, { readPreference: 'primary' });
  await client.connect();
  const docs = await client.db().collection(COLL)
    .find({ _id: { $in: IDS.map(i => new mongoose.mongo.ObjectId(i)) } })
    .sort({ analysisType: 1, createdAt: 1 }).toArray();
  for (const d of docs) {
    console.log('\n---', String(d._id), d.analysisType, 'shift=', JSON.stringify(d.shift), 'created=', d.createdAt);
    console.log('  data is array:', Array.isArray(d.data));
    if (Array.isArray(d.data)) { const c = count(d.data); console.log('  data[] filled', c.f, '/', c.t); continue; }
    for (const [k, v] of Object.entries(d.data || {})) {
      if (SKIP.has(k)) continue;
      const c = count(v);
      console.log('  data.' + k, 'filled', c.f, '/', c.t);
    }
  }
  await client.close();
})();
