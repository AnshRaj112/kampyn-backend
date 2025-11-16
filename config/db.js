const mongoose = require("mongoose");
require("dotenv").config(); // Load .env
const logger = require("../utils/pinoLogger");

// Helper function to create connection with proper error handling
function createConnection(uri, name) {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 500, // Increased connection pool for better performance
    minPoolSize: 5, // Maintain minimum connections
    maxIdleTimeMS: 30000, // Close idle connections after 30s
    bufferMaxEntries: 0, // Disable mongoose buffering
    bufferCommands: false, // Fail fast on connection issues
  });

  connection.on('connected', () => {
    logger.info({ database: name }, "Database connected successfully");
  });

  connection.on('error', (err) => {
    logger.error({ database: name, error: err.message }, "Database connection error");
  });

  connection.on('disconnected', () => {
    logger.info({ database: name }, "Database disconnected");
  });

  return connection;
}

// Create connections with proper error handling
const Cluster_User = createConnection(process.env.MONGO_URI_USER, 'Users');
const Cluster_Order = createConnection(process.env.MONGO_URI_ORDER, 'Orders');
const Cluster_Item = createConnection(process.env.MONGO_URI_ITEM, 'Items');
const Cluster_Inventory = createConnection(process.env.MONGO_URI_INVENTORY, 'Inventory');
const Cluster_Accounts = createConnection(process.env.MONGO_URI_ACCOUNT, 'Accounts');
const Cluster_Cache_Analytics = createConnection(process.env.MONGO_URI_CACHE, 'Cache');

// Wait for all connections to be ready
Promise.all([
  new Promise(resolve => Cluster_User.once('connected', resolve)),
  new Promise(resolve => Cluster_Order.once('connected', resolve)),
  new Promise(resolve => Cluster_Item.once('connected', resolve)),
  new Promise(resolve => Cluster_Inventory.once('connected', resolve)),
  new Promise(resolve => Cluster_Accounts.once('connected', resolve)),
  new Promise(resolve => Cluster_Cache_Analytics.once('connected', resolve)),
]).then(() => {
  logger.info('All database connections established successfully');
}).catch(err => {
  logger.error({ error: err.message }, 'Failed to establish database connections');
});

module.exports = {
  Cluster_User,
  Cluster_Order,
  Cluster_Item,
  Cluster_Inventory,
  Cluster_Accounts,
  Cluster_Cache_Analytics,
};
