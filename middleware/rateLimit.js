const rateLimit = require("express-rate-limit");

/**
 * Production-Grade Rate Limiting Configuration
 * 
 * Features:
 * - Trust proxy support for Render deployment
 * - Standard rate limit headers (RateLimit-*)
 * - Skip function for health checks
 * - Environment-specific limits
 * - Shared memory store for admin access
 */

const isProduction = process.env.NODE_ENV === 'production';

// Create a shared memory store for rate limiting
// This allows admin endpoints to access and manipulate rate limit data
class RateLimitStore {
  constructor() {
    this.hits = new Map(); // Map<key, { count: number, resetTime: number }>
    this.clients = new Map(); // Map<key, { ip: string, endpoint: string }>
  }

  async increment(key) {
    const now = Date.now();
    const hit = this.hits.get(key);

    if (!hit || now > hit.resetTime) {
      // First hit or expired window
      this.hits.set(key, {
        count: 1,
        resetTime: now + (15 * 60 * 1000) // 15 minutes from now
      });
      return { totalHits: 1, resetTime: new Date(now + (15 * 60 * 1000)) };
    } else {
      // Increment existing hit count
      hit.count++;
      this.hits.set(key, hit);
      return { totalHits: hit.count, resetTime: new Date(hit.resetTime) };
    }
  }

  async decrement(key) {
    const hit = this.hits.get(key);
    if (hit && hit.count > 0) {
      hit.count--;
      if (hit.count === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, hit);
      }
    }
  }

  async resetKey(key) {
    this.hits.delete(key);
    this.clients.delete(key);
  }

  async resetAll() {
    this.hits.clear();
    this.clients.clear();
  }

  // Get all blocked IPs (those that have hit the limit)
  getBlockedIPs(limit = 200) {
    const blocked = [];
    const now = Date.now();

    for (const [key, hit] of this.hits.entries()) {
      // Only include if still within the window and hit count >= limit
      if (now <= hit.resetTime && hit.count >= limit) {
        const clientInfo = this.clients.get(key) || {};
        const [ip, endpoint] = key.includes(':') ? key.split(':') : [key, 'unknown'];

        blocked.push({
          key,
          ip: clientInfo.ip || ip,
          endpoint: clientInfo.endpoint || endpoint,
          hitCount: hit.count,
          resetTime: new Date(hit.resetTime),
          blockedUntil: new Date(hit.resetTime)
        });
      }
    }

    return blocked;
  }

  // Store client information for better tracking
  setClientInfo(key, ip, endpoint) {
    this.clients.set(key, { ip, endpoint });
  }
}

// Create shared store instance
const sharedStore = new RateLimitStore();

// Skip rate limiting for health check endpoints
const skipHealthChecks = (req) => {
  return req.path === '/api/health' || req.path === '/health';
};

// Auth rate limiter - stricter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 5 : 10, // Stricter in production
  message: {
    success: false,
    message: "Too many authentication attempts from this IP, please try again later"
  },
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,   // Disable X-RateLimit-* headers
  skip: skipHealthChecks,
  // Trust proxy for accurate IP detection on Render
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
});

// General API rate limiter - more lenient for regular API calls
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 200 : 250, // More lenient in development
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthChecks,
  store: sharedStore,
  // Track client info for admin dashboard
  handler: (req, res, next, options) => {
    const identifier = req.ip || req.connection.remoteAddress || 'unknown';
    sharedStore.setClientInfo(identifier, identifier, req.originalUrl || req.path);
    res.status(options.statusCode).json(options.message);
  }
});

// Admin rate limiter - moderate for admin operations
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: {
    success: false,
    message: "Too many admin requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthChecks,
});

// Strict rate limiter for database-intensive operations
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: "Too many database requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthChecks,
});

// Payment rate limiter - very strict for payment operations
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many payment requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthChecks,
});

/**
 * Per-API Rate Limiter Factory
 * Creates rate limiters that track each endpoint separately per IP/user
 * 
 * Key Feature: Endpoint Isolation
 * - Each API route gets its own counter per IP
 * - Hitting limit on /api/vendor/auth/login won't block /api/vendor/auth/signup
 * - Uses custom key: <IP>:<endpoint> (e.g., "192.168.1.1:/api/vendor/auth/login")
 * 
 * @param {Object} options - Rate limit configuration
 * @returns {Function} Express middleware
 */
function createPerApiLimiter(options = {}) {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipHealthChecks,
    // Custom key generator: combines IP + endpoint path
    keyGenerator: (req) => {
      const identifier = req.ip || req.connection.remoteAddress || 'unknown';
      const endpoint = req.originalUrl || req.path;
      return `${identifier}:${endpoint}`;
    },
  };

  return rateLimit({ ...defaultOptions, ...options });
}

// Per-API Auth Limiter - for authentication endpoints
// Each auth endpoint (login, signup, etc.) gets separate counter per IP
const perApiAuthLimiter = createPerApiLimiter({
  max: isProduction ? 5 : 10,
  message: {
    success: false,
    message: "Too many attempts on this endpoint, please try again later"
  },
});

// Per-API Strict Limiter - for sensitive operations
// Each sensitive endpoint gets separate counter per IP
const perApiStrictLimiter = createPerApiLimiter({
  max: 10,
  message: {
    success: false,
    message: "Too many requests to this endpoint, please try again later"
  },
});

// Per-API General Limiter - for general API endpoints
// Each general endpoint gets separate counter per IP
const perApiGeneralLimiter = createPerApiLimiter({
  max: isProduction ? 100 : 200,
  message: {
    success: false,
    message: "Too many requests to this endpoint, please try again later"
  },
});

module.exports = {
  authLimiter,
  apiLimiter,
  adminLimiter,
  strictLimiter,
  paymentLimiter,
  // Per-API limiters for endpoint-specific rate limiting
  createPerApiLimiter,
  perApiAuthLimiter,
  perApiStrictLimiter,
  perApiGeneralLimiter,
  // Shared store for admin access
  sharedStore,
};
