const User = require('../models/account/User');
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Admin = require('../models/account/Admin');
const GuestHouse = require('../models/account/GuestHouse');
const logger = require('./pinoLogger');
const argon2 = require('argon2');

/**
 * Hash Password
 * Aggressively optimized settings for sub-200ms response time while maintaining security
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB) || 12288,
    timeCost: Number(process.env.ARGON2_TIME) || 2,
    parallelism: Number(process.env.ARGON2_PAR) || 2
  });
}

/**
 * Check if user should be logged out based on last activity
 * @param {string} userId - User ID
 * @param {string} userType - Type of user (user, vendor, uni, admin)
 * @returns {Promise<{shouldLogout: boolean, user: Object|null}>}
 */
async function checkUserActivity(userId, userType) {
  try {
    let user = null;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    switch (userType) {
      case 'user':
        user = await User.findById(userId);
        break;
      case 'vendor':
        user = await Vendor.findById(userId);
        break;
      case 'uni':
        user = await Uni.findById(userId);
        break;
      case 'admin':
        user = await Admin.findById(userId);
        break;
      case 'guestHouse':
        user = await GuestHouse.findById(userId);
        break;
      default:
        return { shouldLogout: true, user: null };
    }

    if (!user) {
      logger.warn({ userId, userType }, 'checkUserActivity: User not found in database');
      return { shouldLogout: true, user: null };
    }

    // Check if last activity is missing or was more than 7 days ago
    // If lastActivity is missing, we initialize it now to prevent premature logout
    if (!user.lastActivity) {
      logger.info({ userId, userType }, 'checkUserActivity: lastActivity missing, initializing');
      await updateUserActivity(userId, userType);
      return { shouldLogout: false, user };
    }

    const shouldLogout = user.lastActivity < sevenDaysAgo;
    if (shouldLogout) {
      logger.warn({ userId, userType, lastActivity: user.lastActivity }, 'checkUserActivity: Session expired due to inactivity');
    }

    return { shouldLogout, user };
  } catch (error) {
    logger.error({ error: error.message, userId, userType, stack: error.stack }, 'Error checking user activity');
    return { shouldLogout: true, user: null };
  }
}

/**
 * Update user's last activity timestamp
 * @param {string} userId - User ID
 * @param {string} userType - Type of user (user, vendor, uni, admin)
 * @returns {Promise<boolean>}
 */
async function updateUserActivity(userId, userType) {
  try {
    const now = new Date();
    let updateResult = false;

    switch (userType) {
      case 'user':
        updateResult = await User.findByIdAndUpdate(userId, { lastActivity: now });
        break;
      case 'vendor':
        updateResult = await Vendor.findByIdAndUpdate(userId, { lastActivity: now });
        break;
      case 'uni':
        updateResult = await Uni.findByIdAndUpdate(userId, { lastActivity: now });
        break;
      case 'admin':
        updateResult = await Admin.findByIdAndUpdate(userId, { lastActivity: now });
        break;
      case 'guestHouse':
        updateResult = await GuestHouse.findByIdAndUpdate(userId, { lastActivity: now });
        break;
    }

    return !!updateResult;
  } catch (error) {
    logger.error({ error: error.message, userId, userType }, 'Error updating user activity');
    return false;
  }
}

/**
 * BOLA Check: Validate if the requester (vendor or university) can access a specific vendor's data
 * @param {Object} req - Express request object
 * @param {string} targetVendorId - The vendor ID being accessed
 * @returns {Promise<boolean>} - True if access is allowed
 */
async function validateVendorAccess(req, targetVendorId) {
  if (!targetVendorId) return false;

  // 1. If requester is a vendor, they can only access their own data
  if (req.vendor) {
    return req.vendor._id.toString() === targetVendorId.toString();
  }

  // 2. If requester is a university, they can access data for vendors belonging to their uni
  if (req.uni) {
    // We need to verify if targetVendorId belongs to req.uni._id
    // This requires a quick DB lookup to be secure
    const vendor = await Vendor.findById(targetVendorId).select('uniID');
    if (!vendor || !vendor.uniID) return false;

    return vendor.uniID.toString() === req.uni._id.toString();
  }

  return false;
}

/**
 * BOLA Check: Validate if the requester (user) can access a specific user's data
 * @param {Object} req - Express request object
 * @param {string} targetUserId - The user ID being accessed
 * @returns {boolean} - True if access is allowed
 */
function validateUserAccess(req, targetUserId) {
  if (!targetUserId || !req.user) return false;

  // Users can only access their own data
  if (req.user.userId.toString() === targetUserId.toString()) {
    return true;
  }

  // Admins can access anyone's data
  if (req.user.userType === 'admin') {
    return true;
  }

  return false;
}

module.exports = {
  checkUserActivity,
  updateUserActivity,
  hashPassword,
  validateVendorAccess,
  validateUserAccess
};
