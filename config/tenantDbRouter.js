const mongoose = require("mongoose");
const logger = require("../utils/pinoLogger");

// Connection pool cache
const connectionPools = new Map();

/**
 * Resolves a dynamic MongoDB connection for a tenant
 * @param {Object} tenantConfig - Resolved tenant configuration from metadata
 * @returns {Promise<mongoose.Connection>} Mongoose connection instance
 */
async function getTenantConnection(tenantConfig) {
  const { _id: tenantId, slug, dbConnectionString, isolationModel } = tenantConfig;

  // For shared logical isolation, return the default accounts connection
  if (isolationModel === "logical" || !dbConnectionString) {
    return mongoose.connections[0]; // Primary cluster connection
  }

  // Check if connection pool already exists in cache
  if (connectionPools.has(tenantId.toString())) {
    return connectionPools.get(tenantId.toString());
  }

  logger.info({ tenant: slug }, "Initializing dedicated connection pool for tenant");

  const options = {
    maxPoolSize: 20,
    minPoolSize: 2,
    socketTimeoutMS: 30000,
    connectTimeoutMS: 10000,
    retryWrites: true,
  };

  const conn = mongoose.createConnection(dbConnectionString, options);

  conn.on("connected", () => {
    logger.info({ tenant: slug }, "Dedicated tenant connection established");
  });

  conn.on("error", (err) => {
    logger.error({ tenant: slug, error: err.message }, "Dedicated tenant connection error");
  });

  connectionPools.set(tenantId.toString(), conn);
  return conn;
}

module.exports = { getTenantConnection };
