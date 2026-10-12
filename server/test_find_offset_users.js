require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const mongoose = require('mongoose');
const User = require('/home/naveen/Downloads/qcl-management-report-main/server/models/User');
const Company = require('/home/naveen/Downloads/qcl-management-report-main/server/models/Company');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");
  
  const users = await User.find({}).populate('company').lean();
  console.log("Total users:", users.length);
  
  const offsetAdmins = users.filter(u => u.role === 'admin' && u.company && u.company.name && u.company.name.toLowerCase().includes('offset'));
  const offsetUsers = users.filter(u => u.role === 'user' && u.company && u.company.name && u.company.name.toLowerCase().includes('offset'));
  
  console.log("Offset Admins:", offsetAdmins.map(u => ({ email: u.email, name: u.name, company: u.company.name })));
  console.log("Offset Users:", offsetUsers.map(u => ({ email: u.email, name: u.name, company: u.company.name })));
  
  process.exit(0);
}
check().catch(console.error);
