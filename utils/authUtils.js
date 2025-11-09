const User = require('../models/account/User');
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Admin = require('../models/account/Admin');
const logger = require('./pinoLogger');

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
      default:
        return { shouldLogout: true, user: null };
    }

    if (!user) {
      return { shouldLogout: true, user: null };
    }

    // Check if last activity is missing or was more than 7 days ago
    const shouldLogout = !user.lastActivity || user.lastActivity < sevenDaysAgo;
    
    return { shouldLogout, user };
  } catch (error) {
    logger.error({ error: error.message, userId, userType }, 'Error checking user activity');
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
    }

    return !!updateResult;
  } catch (error) {
    logger.error({ error: error.message, userId, userType }, 'Error updating user activity');
    return false;
  }
}

module.exports = {
  checkUserActivity,
  updateUserActivity
};
