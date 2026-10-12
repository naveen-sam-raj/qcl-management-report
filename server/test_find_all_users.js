require('dotenv').config({ path: '/home/naveen/Downloads/qcl-management-report-main/server/.env' });
const mongoose = require('mongoose');
const User = require('/home/naveen/Downloads/qcl-management-report-main/server/models/User');
const Company = require('/home/naveen/Downloads/qcl-management-report-main/server/models/Company');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");
  
  const users = await User.find({}).populate('company').lean();
  console.log(users.map(u => ({ email: u.email, role: u.role, company: u.company ? u.company.name : 'No Company', companyId: u.company ? u.company._id : null })));
  
  process.exit(0);
}
check().catch(console.error);
