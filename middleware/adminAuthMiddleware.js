const jwt = require("jsonwebtoken");
const Admin = require("../models/account/Admin");
const { checkUserActivity, updateUserActivity } = require("../utils/authUtils");
const logger = require("../utils/pinoLogger");

/**
 * Admin authentication middleware
 * Verifies admin JWT token and adds admin info to request
 */
const adminAuthMiddleware = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    let token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if admin exists and is active
    const admin = await Admin.findById(decoded.adminId).select("-password");
    
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid or inactive admin account."
      });
    }

    // Check if admin should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.adminId, 'admin');
    if (shouldLogout) {
      return res.status(401).json({
        success: false,
        message: "Session expired due to inactivity. Please log in again."
      });
    }

    // Update last activity
    await updateUserActivity(decoded.adminId, 'admin');

    // Add admin info to request
    req.admin = {
      adminId: admin._id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions
    };

    next();
  } catch (error) {
    logger.error({ error: error.message, errorName: error.name }, "Admin auth middleware error");
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid token."
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: "Access denied. Token expired."
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error during authentication."
    });
  }
};

/**
 * Permission-based middleware
 * Checks if admin has required permissions
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    // Super admin has all permissions
    if (req.admin.role === 'super_admin') {
      return next();
    }

    // Check specific permission
    if (!req.admin.permissions[permission]) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${permission}`
      });
    }

    next();
  };
};

/**
 * Role-based middleware
 * Checks if admin has required role
 */
const requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
    }

    next();
  };
};

/**
 * Super admin only middleware
 */
const requireSuperAdmin = requireRole('super_admin');

/**
 * Admin or super admin middleware
 */
const requireAdminOrSuper = requireRole(['admin', 'super_admin']);

module.exports = {
  adminAuthMiddleware,
  requirePermission,
  requireRole,
  requireSuperAdmin,
  requireAdminOrSuper
}; 