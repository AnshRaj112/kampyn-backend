const Order = require("../models/order/Order");
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const { atomicCache } = require("./cacheUtils");
const mongoose = require("mongoose");
const logger = require("./pinoLogger");

// Import the shared atomic cancellation function
const { cancelOrderAtomically } = require("./orderUtils");

/**
 * Atomic order cleanup with database transaction
 * Uses the shared cancelOrderAtomically function for consistency
 */
async function cleanupOrderAtomically(order, session) {
  try {
    // Use the shared atomic cancellation function
    const result = await cancelOrderAtomically(order._id, order, session);
    
    logger.info({ orderId: order._id, locksReleased: result.locksReleased }, "Order cleaned up atomically");
    
    return result;
  } catch (error) {
    logger.error({ error: error.message, orderId: order._id }, 'Error in atomic order cleanup');
    throw error;
  }
}

/**
 * Cleanup utility for expired orders and locks
 * This ensures that locks are properly released when orders expire
 */

/**
 * Clean up expired pending orders and release their locks
 * This should be run periodically (e.g., every 10 minutes)
 * 
 * Changes made to fix order deletion issue:
 * 1. Fixed status inconsistency: "failedPayment" -> "failed"
 * 2. Move failed orders from activeOrders to pastOrders for users
 * 3. Remove failed orders from vendor's activeOrders
 * 4. Increased expiration time from 10 to 30 minutes
 * 5. Added better logging for debugging
 */
async function cleanupExpiredOrders() {
  try {
    const now = new Date();
    
    logger.info({ timestamp: now.toISOString() }, "Checking for expired orders");
    
    // Find all expired pending orders
    const expiredOrders = await Order.find({
      status: "pendingPayment",
      reservationExpiresAt: { $lt: now },
      deleted: false
    }).select("_id items userId").lean();
    
    if (expiredOrders.length === 0) {
      return { cleaned: 0, message: "No expired orders found" };
    }
    
    let totalLocksReleased = 0;
    const failedCleanups = [];
    
    for (const order of expiredOrders) {
      try {
        // Use database transaction for atomic cleanup
        const session = await mongoose.startSession();
        try {
          const result = await session.withTransaction(async () => {
            // Get vendor ID for the order
            const orderWithVendor = await Order.findById(order._id).select("vendorId").lean();
            if (orderWithVendor && orderWithVendor.vendorId) {
              order.vendorId = orderWithVendor.vendorId;
            }
            // Extra logging: fetch and log the current status before delete
            const currentOrder = await Order.findById(order._id).lean();
            logger.debug({ orderId: order._id, status: currentOrder ? currentOrder.status : 'unknown', timestamp: new Date().toISOString() }, "[CLEANUP] Attempting to delete order");
            // Atomic delete: only delete if status is still 'pendingPayment'
            const deleteResult = await Order.deleteOne({ _id: order._id, status: "pendingPayment" }, { session });
            if (deleteResult.deletedCount === 0) {
              logger.warn({ orderId: order._id, status: currentOrder ? currentOrder.status : 'unknown' }, '[CLEANUP] SKIP: Order was not deleted because status changed');
              return { locksReleased: 0 };
            }
            logger.info({ orderId: order._id, status: currentOrder ? currentOrder.status : 'unknown' }, "[CLEANUP] SUCCESS: Order deleted from DB");
            // Remove from user and vendor
            await User.updateOne(
              { _id: order.userId },
              { $pull: { activeOrders: order._id, pastOrders: order._id } },
              { session }
            );
            await Vendor.updateOne(
              { _id: order.vendorId },
              { $pull: { activeOrders: order._id } },
              { session }
            );
            // Release item locks
            const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
            return { locksReleased: lockReleaseResult.released.length };
          });
          totalLocksReleased += result.locksReleased;
          if (result.locksReleased > 0) {
            logger.info({ orderId: order._id, locksReleased: result.locksReleased }, "Cleaned up expired order atomically");
          }
        } catch (error) {
          logger.error({ error: error.message, orderId: order._id }, 'Failed to cleanup order atomically');
          failedCleanups.push({
            orderId: order._id,
            error: error.message
          });
        } finally {
          await session.endSession();
        }
      } catch (error) {
        logger.error({ error: error.message, orderId: order._id }, 'Failed to cleanup order');
        failedCleanups.push({
          orderId: order._id,
          error: error.message
        });
      }
    }
    
    return {
      cleaned: expiredOrders.length,
      locksReleased: totalLocksReleased,
      failedCleanups,
      message: `Cleaned up ${expiredOrders.length} expired orders and released ${totalLocksReleased} locks`
    };
  } catch (error) {
    logger.error({ error: error.message }, "Error in cleanupExpiredOrders");
    throw error;
  }
}

/**
 * Force release locks for a specific order (admin function)
 */
async function forceReleaseOrderLocks(orderId) {
  try {
    const order = await Order.findById(orderId).select("items userId").lean();
    if (!order) {
      throw new Error("Order not found");
    }
    
    const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
    
    return {
      orderId,
      released: lockReleaseResult.released,
      failed: lockReleaseResult.failed,
      message: `Released ${lockReleaseResult.released.length} locks for order ${orderId}`
    };
  } catch (error) {
    logger.error({ error: error.message, orderId }, 'Error force releasing locks for order');
    throw error;
  }
}

/**
 * Get statistics about current locks and orders
 */
async function getLockStatistics() {
  try {
    const pendingOrders = await Order.countDocuments({ status: "pendingPayment" });
    const expiredOrders = await Order.countDocuments({
      status: "pendingPayment",
      reservationExpiresAt: { $lt: new Date() }
    });
    
    const cacheStats = atomicCache.getStats();
    
    return {
      pendingOrders,
      expiredOrders,
      activeLocks: cacheStats.activeLocks,
      totalCacheEntries: cacheStats.totalCacheEntries,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error({ error: error.message }, "Error getting lock statistics");
    throw error;
  }
}

/**
 * Start periodic cleanup (call this when the server starts)
 */
function startPeriodicCleanup(intervalMs = 10 * 60 * 1000) { // 10 minutes default
  const cleanupInterval = setInterval(async () => {
    try {
      const result = await cleanupExpiredOrders();
      logger.info({ message: result.message }, "Periodic cleanup");
    } catch (error) {
      logger.error({ error: error.message }, "Periodic cleanup failed");
    }
  }, intervalMs);
  
  logger.info({ intervalSeconds: intervalMs / 1000 }, "Started periodic cleanup");
  return cleanupInterval;
}

module.exports = {
  cleanupExpiredOrders,
  forceReleaseOrderLocks,
  getLockStatistics,
  startPeriodicCleanup
}; 