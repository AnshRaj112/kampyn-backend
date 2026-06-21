const mongoose = require("mongoose");
const Tenant = require("../models/account/Tenant");
const logger = require("../utils/pinoLogger");
const jwt = require("jsonwebtoken");

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

  // Determine subdomain
  const host = req.headers.host || "";
  const cleanHost = host.split(":")[0].toLowerCase();
  const parts = cleanHost.split(".");
  const reservedSubdomains = ["admin", "api", "www", "main", "tenant-studio"];

  let isReservedSubdomain = false;
  let subdomain = "";
  if (parts.length === 2 && parts[1] === "localhost") {
    subdomain = parts[0];
  } else if (parts.length >= 3) {
    subdomain = parts[0];
  }
  if (subdomain && reservedSubdomains.includes(subdomain)) {
    isReservedSubdomain = true;
  }

  // 2. Resolve from hostname subdomain (if not reserved)
  if (!tenantIdentifier && subdomain && !isReservedSubdomain) {
    tenantIdentifier = subdomain;
  }

  // 3. Resolve from Authorization token if on a reserved subdomain or if header/hostname is missing
  if (!tenantIdentifier) {
    let token = req.cookies?.uniToken || req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.impersonatedTenantId) {
          tenantIdentifier = decoded.impersonatedTenantId;
        } else if (decoded.role === "university" || decoded.tenantId) {
          tenantIdentifier = decoded.tenantId || decoded.userId;
        }
      } catch (err) {
        // Ignore JWT verification errors here
      }
    }
  }

  // 4. Fallback to default tenant only if NOT on a reserved subdomain and not an admin API route
  const isAdminRoute = req.path.startsWith("/api/admin") || req.path.startsWith("/admin");
  const isGlobalRoute = req.path.startsWith("/api/tenant/switch-tenant");
  const bypassTenant = isReservedSubdomain || isAdminRoute || isGlobalRoute;

  if (!tenantIdentifier && !bypassTenant) {
    tenantIdentifier = process.env.DEFAULT_TENANT_SLUG || "kiit";
  }

  if (!tenantIdentifier) {
    // Standalone context (e.g. admin.kampyn.com)
    req.tenant = null;
    req.tenantId = null;
    req.tenantSlug = null;
    return next();
  }

  const tenant = await resolveTenant(tenantIdentifier);

  if (!tenant) {
    if (bypassTenant) {
      // If bypass is allowed, proceed even if tenant resolution failed
      req.tenant = null;
      req.tenantId = null;
      req.tenantSlug = null;
      return next();
    }
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
