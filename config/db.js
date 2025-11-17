const mongoose = require("mongoose");
require("dotenv").config();
const logger = require("../utils/pinoLogger");

const DEFAULT_MAX_POOL = Number(process.env.MONGO_MAX_POOL_SIZE || 10);
const DEFAULT_MIN_POOL = Number(process.env.MONGO_MIN_POOL_SIZE || 2);

const baseConnectionOptions = {
  maxPoolSize: DEFAULT_MAX_POOL,
  minPoolSize: DEFAULT_MIN_POOL,
  maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS || 30000),
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
  autoIndex: false,
  bufferCommands: false,
};

const clusterDefinitions = {
  Cluster_User: { uri: process.env.MONGO_URI_USER, name: "Users" },
  Cluster_Order: { uri: process.env.MONGO_URI_ORDER, name: "Orders" },
  Cluster_Item: { uri: process.env.MONGO_URI_ITEM, name: "Items" },
  Cluster_Inventory: { uri: process.env.MONGO_URI_INVENTORY, name: "Inventory" },
  Cluster_Accounts: { uri: process.env.MONGO_URI_ACCOUNT, name: "Accounts" },
  Cluster_Cache_Analytics: { uri: process.env.MONGO_URI_CACHE, name: "Cache" },
};

const connections = {};
let connectPromise = null;

function attachListeners(connection, name) {
  connection.on("connected", () => {
    logger.info({ database: name }, "Mongo connection established (pooled)");
  });

  connection.on("error", (err) => {
    logger.error({ database: name, error: err.message }, "Mongo connection error");
  });

  connection.on("disconnected", () => {
    logger.warn({ database: name }, "Mongo connection closed");
  });
}

function ensureConnection(key) {
  if (connections[key]) {
    return connections[key];
  }

  const definition = clusterDefinitions[key];

  if (!definition || !definition.uri) {
    throw new Error(`Missing Mongo URI for cluster ${key}`);
  }

  const connection = mongoose.createConnection(definition.uri, baseConnectionOptions);
  attachListeners(connection, definition.name);
  connections[key] = connection;

  return connection;
}

async function connectDB() {
  if (connectPromise) {
    return connectPromise;
  }

  const allConnections = Object.keys(clusterDefinitions).map(ensureConnection);

  connectPromise = Promise.all(
    allConnections.map((conn) => conn.asPromise())
  )
    .then(() => {
      logger.info(
        {
          maxPoolSize: baseConnectionOptions.maxPoolSize,
          minPoolSize: baseConnectionOptions.minPoolSize,
        },
        "All MongoDB pools are ready"
      );
      return connections;
    })
    .catch((error) => {
      connectPromise = null;
      logger.error({ error: error.message }, "Failed to initialize MongoDB pools");
      throw error;
    });

  return connectPromise;
}

const exportsWithPools = { connectDB };

Object.keys(clusterDefinitions).forEach((key) => {
  Object.defineProperty(exportsWithPools, key, {
    enumerable: true,
    get() {
      return ensureConnection(key);
    },
  });
});

module.exports = exportsWithPools;
