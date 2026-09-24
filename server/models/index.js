const mongoose = require('mongoose');
const { getStore } = require('../config/memoryStore');

const MongooseCompany = require('./Company');
const MongoosePlant = require('./Plant');
const MongooseUser = require('./User');
const MongooseReport = require('./Report');
const MongooseActivityLog = require('./ActivityLog');
const MongooseSuperAdmin = require('./SuperAdmin');

const isMongooseConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Proxy handlers that route to Mongoose if connected, else in-memory collection
const createModelProxy = (mongooseModel, storeKey) => {
  return new Proxy(mongooseModel, {
    get(target, prop) {
      if (isMongooseConnected()) {
        return target[prop];
      }
      const store = getStore();
      const memCol = store[storeKey];
      if (memCol && typeof memCol[prop] === 'function') {
        return memCol[prop].bind(memCol);
      }
      if (memCol && prop in memCol) {
        return memCol[prop];
      }
      return target[prop];
    },
  });
};

module.exports = {
  Company: createModelProxy(MongooseCompany, 'companies'),
  Plant: createModelProxy(MongoosePlant, 'plants'),
  User: createModelProxy(MongooseUser, 'users'),
  SuperAdmin: createModelProxy(MongooseSuperAdmin, 'superAdmins'),
  Report: createModelProxy(MongooseReport, 'reports'),
  ActivityLog: createModelProxy(MongooseActivityLog, 'logs'),
  isMongooseConnected,
};
