const logger = require("./pinoLogger");

// In-memory local cache as primary fallback
const localCache = new Map();
const DEFAULT_TTL_MS = 300000; // 5 minutes default TTL

let redisClient = null;

// Initialize Redis if REDIS_HOST env var is present
if (process.env.REDIS_HOST) {
  try {
    // Try importing ioredis or redis
    const Redis = require("ioredis");
    redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3
    });
    
    redisClient.connect().catch(err => {
      logger.warn({ error: err.message }, "Redis connection failed. Fallback to in-memory caching active.");
      redisClient = null;
    });
  } catch (err) {
    logger.debug("ioredis not installed. Using in-memory caching fallback.");
  }
}

/**
 * Gets a cached configuration key
 */
async function get(key) {
  if (redisClient) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      logger.warn({ key, error: err.message }, "Redis get error, falling back to local cache lookup");
    }
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
  if (redisClient) {
    try {
      const seconds = Math.ceil(ttlMs / 1000);
      await redisClient.setex(key, seconds, JSON.stringify(value));
      return;
    } catch (err) {
      logger.warn({ key, error: err.message }, "Redis setex error, falling back to local cache storage");
    }
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
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch (err) {
      logger.warn({ key, error: err.message }, "Redis delete error");
    }
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
  invalidateTenant
};
