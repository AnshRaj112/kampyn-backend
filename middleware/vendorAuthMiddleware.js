const jwt = require("jsonwebtoken");
const Vendor = require("../models/account/Vendor");
const { checkUserActivity, updateUserActivity } = require("../utils/authUtils");

/**
 * Vendor authentication middleware
 * Verifies vendor JWT token from cookies or Authorization header
 */
const vendorAuthMiddleware = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    let token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if vendor exists
    const vendor = await Vendor.findById(decoded.userId).select("-password").populate('services');
    
    if (!vendor) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid vendor account."
      });
    }

    // Check if vendor should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'vendor');
    if (shouldLogout) {
      return res.status(401).json({
        success: false,
        message: "Session expired due to inactivity. Please log in again."
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'vendor');

    // Add vendor info to request
    req.vendor = {
      vendorId: vendor._id,
      email: vendor.email,
      fullName: vendor.fullName,
      uniID: vendor.uniID,
      services: vendor.services
    };

    next();
  } catch (error) {
    console.error("Vendor auth middleware error:", error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please log in again."
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token."
    });
  }
};

module.exports = vendorAuthMiddleware;
