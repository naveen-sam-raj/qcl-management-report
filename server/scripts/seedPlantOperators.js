const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Plant = mongoose.model('Plant', new mongoose.Schema({ name: String, code: String, company: mongoose.Schema.Types.ObjectId }));
  const User = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: String,
    username: String,
    password: String,
    role: String,
    plant: mongoose.Schema.Types.ObjectId,
    company: mongoose.Schema.Types.ObjectId,
    status: String,
  }));

  const plantCodes = ['ACL', 'SA', 'OFFSITE', 'CO2'];
  const plants = await Plant.find({ code: { $in: plantCodes } });
  console.log('Plants found:', plants.length);

  for (const p of plants) {
    let assigned = await User.findOne({ plant: p._id });
    if (!assigned) {
      const codeLower = p.code.toLowerCase();
      const email = `${codeLower}_operator@tfl.com`;
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        existingUser.plant = p._id;
        await existingUser.save();
        console.log(`Assigned existing user to plant ${p.name}: ${email}`);
      } else {
        const hashedPassword = await bcrypt.hash('Operator@2026', 10);
        const newUser = await User.create({
          name: `${p.name} Operator`,
          email: email,
          username: `${codeLower}_operator`,
          password: hashedPassword,
          role: 'user',
          plant: p._id,
          company: p.company,
          status: 'active',
        });
        console.log(`Created and assigned operator for ${p.name}: ${newUser.email}`);
      }
    } else {
      console.log(`Already assigned user for ${p.name}: ${assigned.email}`);
    }
  }
  process.exit(0);
})();
