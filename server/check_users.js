require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const mongoose = require('mongoose');

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // We can query the raw collection
    const users = await mongoose.connection.db.collection('users').find({ role: 'user' }).toArray();
    const plants = await mongoose.connection.db.collection('plants').find().toArray();
    
    const plantMap = {};
    plants.forEach(p => plantMap[p._id.toString()] = p.name);
    
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`- ${u.name} (${u.email}) -> Plant: ${u.plant ? plantMap[u.plant.toString()] : 'None'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUsers();
