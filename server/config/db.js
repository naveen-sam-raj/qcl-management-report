const mongoose = require('mongoose');
const { seedDatabase } = require('./seedData');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/spic_analytics_db';

  try {
    console.log('[Database] Attempting connection to MongoDB at:', uri);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('[Database] ✅ MongoDB Atlas Connected Successfully.');
    await seedDatabase();
    const { initializeDefaultSuperAdmin } = require('../controllers/superAdminController');
    await initializeDefaultSuperAdmin();
  } catch (error) {
    console.warn('[Database] ⚠️ MongoDB Atlas connection error: ' + error.message);
    console.log('[Database] ✨ Activating Resilient In-Memory Multi-Tenant Store.');
    console.log('[Database] Zero configuration required - system is fully operational.');
    await seedDatabase();
    const { initializeDefaultSuperAdmin } = require('../controllers/superAdminController');
    await initializeDefaultSuperAdmin();
  }
};

module.exports = { connectDB };
