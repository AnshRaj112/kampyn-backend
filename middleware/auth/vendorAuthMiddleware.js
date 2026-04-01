const jwt = require("jsonwebtoken");
const Vendor = require("../../models/account/Vendor");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

/**
 * Vendor authentication middleware
 * Verifies vendor JWT token from cookies or Authorization header
 */
const vendorAuthMiddleware = async (req, res, next) => {
  try {
    let token =
      req.headers.authorization?.split(" ")[1] ||
      req.cookies?.vendorToken ||
      req.cookies?.token ||
      req.query?.token;

    if (!token) {
      logger.warn({ 
        path: req.originalUrl, 
        method: req.method,
        queryTokenPresent: !!req.query?.token,
        cookieTokenPresent: !!(req.cookies?.vendorToken || req.cookies?.token)
      }, "Vendor access denied: No token provided");
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (verifyError) {
      logger.warn({
        error: verifyError.message,
        path: req.originalUrl,
        tokenPreview: token.substring(0, 10) + "..."
      }, "Vendor token verification failed");

      return res.status(401).json({
        success: false,
        message: verifyError.name === 'TokenExpiredError' ? "Token expired" : "Invalid token"
      });
    }

    // Check if vendor exists
    const vendor = await Vendor.findById(decoded.userId).select("-password").populate('services');

    if (!vendor) {
      logger.warn({ userId: decoded.userId }, "Vendor access denied: Vendor not found");
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid vendor account."
      });
    }

    // Check if vendor should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'vendor');
    if (shouldLogout) {
      logger.warn({ userId: decoded.userId }, "Vendor session expired due to inactivity");
      return res.status(401).json({
        success: false,
        message: "Session expired due to inactivity. Please log in again."
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'vendor');

    // Add vendor info to request
    req.vendor = {
      _id: vendor._id,
      vendorId: vendor._id,
      email: vendor.email,
      fullName: vendor.fullName,
      uniID: vendor.uniID,
      services: vendor.services
    };

    next();
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      path: req.originalUrl
    }, "Unexpected error in vendorAuthMiddleware");

    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication."
    });
  }
};

module.exports = vendorAuthMiddleware;
