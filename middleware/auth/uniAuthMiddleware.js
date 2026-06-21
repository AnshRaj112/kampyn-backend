const jwt = require("jsonwebtoken");
const Uni = require("../../models/account/Uni");
const Admin = require("../../models/account/Admin");
const User = require("../../models/account/User");
const SubAdmin = require("../../models/account/SubAdmin");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

/**
 * University authentication middleware
 * Verifies university JWT token and adds university info to request
 */
const uniAuthMiddleware = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;

    logger.debug({
      path: req.originalUrl,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      hasCookie: !!req.cookies?.token,
      hasToken: !!token
    }, "uniAuthMiddleware - Incoming request");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if university exists
    const university = await Uni.findById(decoded.userId).select("-password");

    if (!university) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid university account."
      });
    }

    // Cross-tenant validation: Ensure university matches active tenant context
    if (req.tenantId && String(university._id) !== String(req.tenantId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Your session does not belong to the requested university tenant context."
      });
    }

    // Check if university is available
    if (university.isAvailable !== 'Y') {
      return res.status(403).json({
        success: false,
        message: "Access denied. This university is currently unavailable. Please contact support for assistance."
      });
    }

    // Check if university should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'uni');
    if (shouldLogout) {
      return res.status(401).json({
        success: false,
        message: "Session expired due to inactivity. Please log in again."
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'uni');

    // Add university info to request
    req.uni = {
      _id: university._id,
      fullName: university.fullName,
      email: university.email,
      phone: university.phone,
      isVerified: university.isVerified,
      packingCharge: university.packingCharge,
      deliveryCharge: university.deliveryCharge
    };

    logger.debug({
      hasUniId: !!req.uni._id,
      uniId: req.uni._id,
      fullName: req.uni.fullName
    }, "uniAuthMiddleware - Setting req.uni");

    next();
  } catch (error) {
    logger.error({ error: error.message, errorName: error.name }, "University auth middleware error");

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
 * Helper middleware to authenticate either University Admin, Sub Admin, or Super Admin
 */
const uniOrSuperAdminAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token || req.cookies?.adminToken || req.cookies?.uniToken;
    if (!token) {
      return res.status(401).json({ success: false, message: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try finding super admin first
    const admin = await Admin.findById(decoded.userId).select("-password");
    if (admin && admin.isActive && admin.role === "super_admin") {
      req.admin = {
        adminId: admin._id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      };
      return next();
    }

    // Try finding university admin
    const university = await Uni.findById(decoded.userId).select("-password");
    if (university && university.isAvailable === 'Y') {
      if (req.tenantId && String(university._id) !== String(req.tenantId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Your session does not belong to the requested university tenant context."
        });
      }
      req.uni = {
        _id: university._id,
        fullName: university.fullName,
        email: university.email
      };
      return next();
    }

    // Try finding secondary university admin (SubAdmin model)
    const subAdmin = await SubAdmin.findById(decoded.userId).select("-password");
    if (subAdmin && subAdmin.isVerified) {
      const uniOwner = await Uni.findById(subAdmin.uniID || subAdmin.tenantId);
      if (!uniOwner || uniOwner.isAvailable !== 'Y') {
        return res.status(403).json({ success: false, message: "Access denied. University platform is unavailable." });
      }

      if (req.tenantId && String(subAdmin.tenantId || subAdmin.uniID) !== String(req.tenantId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Your session does not belong to the requested university tenant context."
        });
      }
      req.uni = {
        _id: subAdmin.uniID || subAdmin.tenantId,
        fullName: subAdmin.fullName,
        email: subAdmin.email
      };
      return next();
    }

    return res.status(401).json({ success: false, message: "Access denied. Invalid or inactive account." });
  } catch (error) {
    return res.status(401).json({ success: false, message: "Access denied. Invalid or expired token." });
  }
};

module.exports = {
  uniAuthMiddleware,
  uniOrSuperAdminAuth
}; 