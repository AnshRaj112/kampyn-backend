const jwt = require("jsonwebtoken");
const Uni = require("../../models/account/Uni");
const Vendor = require("../../models/account/Vendor");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

/**
 * Combined University or Vendor authentication middleware
 * Verifies if the token belongs to either a university or a vendor
 */
const uniOrVendorAuthMiddleware = async (req, res, next) => {
    try {
        let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.uniToken || req.cookies?.vendorToken || req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided."
            });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token."
            });
        }

        // Try finding a university first
        const university = await Uni.findById(decoded.userId).select("-password");
        if (university) {
            // Check inactivity
            const { shouldLogout } = await checkUserActivity(decoded.userId, 'uni');
            if (shouldLogout) {
                return res.status(401).json({
                    success: false,
                    message: "Session expired due to inactivity. Please log in again."
                });
            }
            await updateUserActivity(decoded.userId, 'uni');

            req.uni = {
                _id: university._id,
                fullName: university.fullName,
                email: university.email
            };
            return next();
        }

        // Try finding a vendor
        const vendor = await Vendor.findById(decoded.userId).select("-password").populate('services');
        if (vendor) {
            // Check inactivity
            const { shouldLogout } = await checkUserActivity(decoded.userId, 'vendor');
            if (shouldLogout) {
                return res.status(401).json({
                    success: false,
                    message: "Session expired due to inactivity. Please log in again."
                });
            }
            await updateUserActivity(decoded.userId, 'vendor');

            req.vendor = {
                _id: vendor._id,
                vendorId: vendor._id,
                fullName: vendor.fullName,
                email: vendor.email,
                uniID: vendor.uniID,
                services: vendor.services
            };
            return next();
        }

        // Neither found
        return res.status(401).json({
            success: false,
            message: "Access denied. Invalid account type."
        });

    } catch (error) {
        logger.error({ error: error.message }, "uniOrVendorAuthMiddleware unexpected error");
        res.status(500).json({
            success: false,
            message: "Internal server error during authentication."
        });
    }
};

module.exports = uniOrVendorAuthMiddleware;
