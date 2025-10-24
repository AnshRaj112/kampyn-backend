const mongoose = require("mongoose");
require("dotenv").config(); // Load .env

// Helper function to create connection with proper error handling
function createConnection(uri, name) {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  connection.on('connected', () => {
    console.info(`✅ ${name} database connected successfully`);
  });

  connection.on('error', (err) => {
    console.error(`❌ ${name} database connection error:`, err.message);
  });

  connection.on('disconnected', () => {
    console.info(`⚠️ ${name} database disconnected`);
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
  console.info('🎉 All database connections established successfully!');
}).catch(err => {
  console.error('❌ Failed to establish database connections:', err.message);
});

module.exports = {
  Cluster_User,
  Cluster_Order,
  Cluster_Item,
  Cluster_Inventory,
  Cluster_Accounts,
  Cluster_Cache_Analytics,
};
