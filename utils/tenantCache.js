const logger = require("./pinoLogger");

const localCache = new Map();
const DEFAULT_TTL_MS = 300000;
const redisUri = process.env.REDIS_URI;
const redisRequired = process.env.NODE_ENV === "production";

let redisClient = null;
let connectPromise = null;

function createRedisClient() {
  if (!redisUri || redisClient) return redisClient;
  const Redis = require("ioredis");
  redisClient = new Redis(redisUri, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redisClient.on("error", (error) => logger.warn({ error: error.message }, "Redis connection error"));
  redisClient.on("ready", () => logger.info("Redis shared state is ready"));
  return redisClient;
}

async function initialize() {
  if (!redisUri) {
    if (redisRequired) throw new Error("REDIS_URI is required when NODE_ENV=production");
    logger.warn("REDIS_URI is not configured; using single-instance in-memory cache fallback");
    return getReadiness();
  }
  const client = createRedisClient();
  try {
    if (!connectPromise) connectPromise = client.connect().catch((error) => { connectPromise = null; throw error; });
    await connectPromise;
    await client.ping();
    return getReadiness();
  } catch (error) {
    if (redisRequired) throw new Error(`Redis is required in production but unavailable: ${error.message}`);
    logger.warn({ error: error.message }, "Redis unavailable; using single-instance in-memory cache fallback");
    return getReadiness();
  }
}

async function getReadiness() {
  const connected = Boolean(redisClient && redisClient.status === "ready");
  return { configured: Boolean(redisUri), required: redisRequired, connected, mode: connected ? "redis" : "memory" };
}

function handleRedisFailure(error, operation, key) {
  logger.warn({ key, error: error.message }, `Redis ${operation} error`);
  if (redisRequired) throw new Error(`Redis ${operation} failed while shared state is required: ${error.message}`);
}

/**
 * Gets a cached configuration key
 */
async function get(key) {
  if (redisClient && redisClient.status === "ready") {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (error) {
      handleRedisFailure(error, "get", key);
    }
  } else if (redisRequired) {
    throw new Error("Redis shared state is required but not connected");
  }

  const cached = localCache.get(key);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.value;
    }
    localCache.delete(key);
  }
  return null;
}

/**
 * Sets a configuration key with TTL
 */
async function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  if (redisClient && redisClient.status === "ready") {
    try {
      await redisClient.set(key, JSON.stringify(value), "PX", ttlMs);
      return;
    } catch (error) {
      handleRedisFailure(error, "set", key);
    }
  } else if (redisRequired) {
    throw new Error("Redis shared state is required but not connected");
  }

  localCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

/**
 * Deletes a configuration key (invalidation)
 */
async function del(key) {
  if (redisClient && redisClient.status === "ready") {
    try {
      await redisClient.del(key);
    } catch (error) {
      handleRedisFailure(error, "delete", key);
    }
  } else if (redisRequired) {
    throw new Error("Redis shared state is required but not connected");
  }
  localCache.delete(key);
}

/**
 * Invalidates a specific tenant's configuration entries
 */
async function invalidateTenant(tenantSlug) {
  logger.info({ tenantSlug }, "Invalidating tenant cache entries");
  const cacheKey = `tenant:config:${tenantSlug}`;
  await del(cacheKey);
}

module.exports = {
  get,
  set,
  del,
  invalidateTenant,
  initialize,
  getReadiness
};
