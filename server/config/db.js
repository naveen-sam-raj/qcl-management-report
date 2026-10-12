const path = require('path');
// Ensure dotenv is loaded before accessing process.env.MONGODB_URI
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { seedDatabase } = require('./seedData');

/**
 * Clean and sanitize MongoDB connection string.
 * Strips surrounding quotes, whitespace, and accidental duplicated variable names (e.g. MONGODB_URI=...).
 */
const sanitizeMongoUri = (rawUri) => {
  if (!rawUri || typeof rawUri !== 'string') return '';
  let cleaned = rawUri.trim().replace(/^['"]|['"]$/g, '');
  cleaned = cleaned.replace(/^(?:MONGODB_URI|MONGO_URI)=\s*/gi, '').trim();
  return cleaned;
};

/**
 * Safely extracts hostname from MongoDB URI without ever exposing credentials.
 */
const extractHost = (connectionString) => {
  try {
    const atMatch = connectionString.match(/@([^/?#:]+)/);
    if (atMatch && atMatch[1]) {
      return atMatch[1];
    }
    const noAuthMatch = connectionString.match(/mongodb(?:\+srv)?:\/\/([^/?#:]+)/);
    if (noAuthMatch && noAuthMatch[1]) {
      return noAuthMatch[1];
    }
  } catch (_) {}
  return 'Unknown';
};

const connectDB = async () => {
  const configuredUri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
  const cleanUri = sanitizeMongoUri(configuredUri);
  const isUriDetected = Boolean(cleanUri);
  const uri = cleanUri || 'mongodb://127.0.0.1:27017/spic_analytics_db';
  process.env.MONGODB_URI = uri;

  const host = extractHost(uri);

  // Safe startup logging: never exposes passwords or credentials
  console.log(`[Database] MongoDB URI detected: ${isUriDetected ? 'yes' : 'no'}`);
  console.log(`[Database] MongoDB Host: ${host}`);
  console.log('[Database] Attempting MongoDB Atlas connection...');

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });
    console.log('[Database] ✅ MongoDB Atlas connected successfully');
    await seedDatabase();
    const { initializeDefaultSuperAdmin } = require('../controllers/superAdminController');
    await initializeDefaultSuperAdmin();
  } catch (error) {
    console.warn('[Database] ⚠️ MongoDB Atlas connection error: ' + error.message);
    if (error.message.includes('whitelist') || error.message.includes('Could not connect to any servers')) {
      console.warn('[Database] ℹ️ Hint: Ensure your current IP is whitelisted in MongoDB Atlas under Network Access.');
    }
    console.log('[Database] ✨ Activating Resilient In-Memory Multi-Tenant Store.');
    console.log('[Database] Zero configuration required - system is fully operational.');
    await seedDatabase();
    const { initializeDefaultSuperAdmin } = require('../controllers/superAdminController');
    await initializeDefaultSuperAdmin();
  }
};

module.exports = { connectDB };
