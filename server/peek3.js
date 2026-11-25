require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const COLL = 'plantanalysisrecords';
(async () => {
  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, { readPreference: 'primary' });
  await client.connect();
  const db = client.db();
  console.log('db name:', db.databaseName);
  const col = db.collection(COLL);

  console.log('\n=== A. docs by plantCode where date field is in Oct 2026 ===');
  const a = await col.aggregate([
    { $match: { date: { $gte: '2026-10-01', $lte: '2026-10-31' } } },
    { $group: { _id: '$plantCode', docs: { $sum: 1 }, dates: { $addToSet: '$date' } } }
  ]).toArray();
  console.table(a.map(x => ({ plantCode: x._id, docs: x.docs, distinctDates: x.dates.length, dates: x.dates.sort().map(d => d.slice(8)).join(',') })));

  console.log('\n=== B. docs by plantCode CREATED in Oct 2026 (any date value) ===');
  const b = await col.aggregate([
    { $match: { createdAt: { $gte: new Date('2026-10-01T00:00:00Z'), $lt: new Date('2026-11-01T00:00:00Z') } } },
    { $group: { _id: '$plantCode', docs: { $sum: 1 }, dates: { $addToSet: '$date' } } }
  ]).toArray();
  console.table(b.map(x => ({ plantCode: x._id, docs: x.docs, distinctDateValues: x.dates.length, sample: x.dates.sort().slice(0, 12).join(',') })));

  console.log('\n=== C. all-time docs by plantCode + latest createdAt ===');
  const c = await col.aggregate([
    { $group: { _id: '$plantCode', docs: { $sum: 1 }, latest: { $max: '$createdAt' }, earliest: { $min: '$createdAt' } } }
  ]).toArray();
  console.table(c.map(x => ({ plantCode: x._id, docs: x.docs, earliest: x.earliest, latest: x.latest })));

  await client.close();
})();
