const jwt = require("jsonwebtoken");
const Uni = require("../../models/account/Uni");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

/**
 * University authentication middleware
 * Verifies university JWT token and adds university info to request
 */
const uniAuthMiddleware = async (req, res, next) => {
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
    
    // Check if university exists
    const university = await Uni.findById(decoded.userId).select("-password");
    
    if (!university) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid university account."
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

module.exports = {
  uniAuthMiddleware
}; 