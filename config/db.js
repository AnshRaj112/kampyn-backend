const mongoose = require("mongoose");
require("dotenv").config();
const logger = require("../utils/pinoLogger");

// Increased default pool sizes to prevent connection exhaustion
const DEFAULT_MAX_POOL = Number(process.env.MONGO_MAX_POOL_SIZE || 50);
const DEFAULT_MIN_POOL = Number(process.env.MONGO_MIN_POOL_SIZE || 5);

const baseConnectionOptions = {
  maxPoolSize: DEFAULT_MAX_POOL,
  minPoolSize: DEFAULT_MIN_POOL,
  maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS || 30000),
  // Wait queue timeout - how long to wait for a connection from the pool
  waitQueueTimeoutMS: Number(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS || 10000),
  // Server selection timeout
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
  // Socket timeout
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
  // Connection timeout
  connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
  // Heartbeat frequency to keep connections alive
  heartbeatFrequencyMS: Number(process.env.MONGO_HEARTBEAT_FREQUENCY_MS || 10000),
  // Retry writes for better reliability
  retryWrites: true,
  // Retry reads
  retryReads: true,
  // Auto index - disabled for performance
  autoIndex: false,
  // Buffer commands - disabled to fail fast
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
let monitoringIntervals = {};
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

  // Monitor connection pool events
  connection.on("fullsetup", () => {
    logger.info({ database: name }, "Mongo connection pool fully initialized");
  });

  // Log connection pool status periodically
  // Store interval ID for cleanup
  const intervalId = setInterval(() => {
    try {
      // Access Mongoose connection pool stats
      const db = connection.db;
      if (db && db.serverConfig) {
        const topology = db.serverConfig.s?.topology;
        if (topology && topology.s?.servers) {
          const servers = Array.from(topology.s.servers.values());
          servers.forEach((server) => {
            const pool = server.s?.pool;
            if (pool) {
              const totalConnections = pool.totalConnectionCount || 0;
              const availableConnections = pool.availableConnections?.length || 0;
              const inUseConnections = totalConnections - availableConnections;
              const poolUsage = totalConnections > 0 ? (inUseConnections / totalConnections) * 100 : 0;
              
              if (poolUsage > 80) {
                logger.warn(
                  {
                    database: name,
                    server: server.s?.description?.address || "unknown",
                    totalConnections,
                    inUseConnections,
                    availableConnections,
                    poolUsage: `${poolUsage.toFixed(1)}%`,
                  },
                  "Connection pool usage above 80%"
                );
              }
            }
          });
        }
      }
    } catch (err) {
      // Silently handle monitoring errors to avoid disrupting the app
      logger.debug({ database: name, error: err.message }, "Pool monitoring error");
    }
  }, 60000); // Check every minute
  
  monitoringIntervals[name] = intervalId;
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

// Graceful shutdown handler
async function closeAllConnections() {
  logger.info("Closing all MongoDB connections...");
  
  // Clear all monitoring intervals
  Object.values(monitoringIntervals).forEach((intervalId) => {
    clearInterval(intervalId);
  });
  monitoringIntervals = {};
  
  // Close all connections
  const closePromises = Object.entries(connections).map(async ([key, conn]) => {
    try {
      if (conn.readyState === 1) {
        await conn.close();
        logger.info({ database: key }, "MongoDB connection closed");
      }
    } catch (err) {
      logger.error({ database: key, error: err.message }, "Error closing connection");
    }
  });
  
  await Promise.all(closePromises);
  logger.info("All MongoDB connections closed");
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await closeAllConnections();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeAllConnections();
  process.exit(0);
});

module.exports = { ...exportsWithPools, closeAllConnections };
