require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const COLL = 'plantanalysisrecords';
const IDS = [
  '6ac93579e42bcc5cd1689ce6', '6ac9357b38e61e154253a3c0',
  '6ac94aebe42bcc5cd1689d24', '6ac94aec38e61e154253b322',
  '6ac885999c5fda464d7e9dfd', '6ac8d234e42bcc5cd1689bfc',
  '6ac8d2363796c6bd553f236e'
];
function shape(v) {
  if (Array.isArray(v)) {
    return { type: 'array', len: v.length,
      firstKeys: v[0] && typeof v[0] === 'object' ? Object.keys(v[0]) : typeof v[0] };
  }
  if (v && typeof v === 'object') {
    return { type: 'object', count: Object.keys(v).length, keys: Object.keys(v).slice(0, 15) };
  }
  return { type: typeof v, empty: v === '' || v == null };
}
(async () => {
  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, { readPreference: 'primary' });
  await client.connect();
  const docs = await client.db().collection(COLL)
    .find({ _id: { $in: IDS.map(i => new mongoose.mongo.ObjectId(i)) } }).toArray();
  console.log('docs found:', docs.length);
  for (const d of docs) {
    console.log('\n---', String(d._id), d.analysisType, d.date,
      'shift=', JSON.stringify(d.shift ?? (d.data && d.data.shift)),
      'unit=', JSON.stringify(d.unit),
      'created=', d.createdAt, 'updated=', d.updatedAt);
    console.log('top-level keys:', Object.keys(d));
    const data = d.data || {};
    for (const k of Object.keys(data)) console.log('  data.' + k, JSON.stringify(shape(data[k])));
  }
  await client.close();
})();
