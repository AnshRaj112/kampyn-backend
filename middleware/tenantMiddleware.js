const mongoose = require("mongoose");
const Tenant = require("../models/account/Tenant");
const logger = require("../utils/pinoLogger");

// In-memory cache for tenant configuration to optimize lookup times
const tenantCache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute TTL

/**
 * Resolves a tenant by slug or ObjectId from the database (or cache)
 */
async function resolveTenant(identifier) {
  if (!identifier) return null;

  const now = Date.now();
  if (tenantCache.has(identifier)) {
    const cached = tenantCache.get(identifier);
    if (now < cached.expiresAt) {
      return cached.tenant;
    }
    tenantCache.delete(identifier);
  }

  let tenant = null;
  try {
    // Check if identifier is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      tenant = await Tenant.findById(identifier).lean();
    } else {
      tenant = await Tenant.findOne({ slug: identifier.toLowerCase() }).lean();
    }
  } catch (error) {
    logger.error({ error: error.message, identifier }, "Error querying Tenant collection");
    return null;
  }

  if (tenant) {
    tenantCache.set(identifier, {
      tenant,
      expiresAt: now + CACHE_TTL_MS
    });
  }

  return tenant;
}

/**
 * Tenant resolution middleware:
 * Resolves active tenant context and injects context into request object
 */
const tenantMiddleware = async (req, res, next) => {
  // Skip tenant resolution for global health check endpoint
  if (req.path === "/api/health" || req.path === "/health") {
    return next();
  }

  let tenantIdentifier = null;

  // 1. Resolve from X-Tenant header
  const headerTenant = req.headers["x-tenant"] || req.headers["X-Tenant"];
  if (headerTenant) {
    tenantIdentifier = headerTenant;
  }

  // 2. Resolve from hostname subdomain
  if (!tenantIdentifier) {
    const host = req.headers.host || "";
    const cleanHost = host.split(":")[0].toLowerCase();
    const parts = cleanHost.split(".");

    // Exclude system reserved subdomains
    const reservedSubdomains = ["admin", "api", "www", "main"];

    if (parts.length === 2 && parts[1] === "localhost") {
      // Handle tenant.localhost dev parity
      if (!reservedSubdomains.includes(parts[0])) {
        tenantIdentifier = parts[0];
      }
    } else if (parts.length >= 3) {
      // Handle tenant.domain.com prod environment
      if (!reservedSubdomains.includes(parts[0])) {
        tenantIdentifier = parts[0];
      }
    }
  }

  // 3. Fallback to default tenant (for localhost or direct IP accesses)
  if (!tenantIdentifier) {
    tenantIdentifier = process.env.DEFAULT_TENANT_SLUG || "kiit";
  }

  const tenant = await resolveTenant(tenantIdentifier);

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: `Tenant resolution failed. Specified tenant context '${tenantIdentifier}' not found.`
    });
  }

  // Verify tenant is active
  if (tenant.status !== "active") {
    return res.status(403).json({
      success: false,
      message: `Access denied. The tenant '${tenant.name}' is currently suspended.`
    });
  }

  // Inject tenant context into request object
  req.tenant = tenant;
  req.tenantId = tenant._id;
  req.tenantSlug = tenant.slug;

  next();
};

module.exports = tenantMiddleware;
