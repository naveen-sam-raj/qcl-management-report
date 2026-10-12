const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { connectDB } = require('./config/db');
const { Plant, User } = require('./models');

async function inspect() {
  await connectDB();
  const plants = await Plant.find({}).lean();
  console.log('--- PLANTS ---');
  for (const p of plants) {
    const users = await User.find({ plant: p._id }).lean();
    const userStr = users.map(u => u.name + ' <' + u.email + '>').join(', ') || 'NONE';
    console.log('Plant: ' + p.name + ' (Code: ' + p.code + ', ID: ' + p._id + ') -> Users: ' + userStr);
  }
  console.log('\n--- ALL USERS ---');
  const allUsers = await User.find({}).lean();
  for (const u of allUsers) {
    console.log('User: ' + u.name + ' | Role: ' + u.role + ' | Email: ' + u.email + ' | Plant: ' + u.plant);
  }
  process.exit(0);
}
inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
