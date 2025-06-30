const Order = require("../models/order/Order");
const { atomicCache } = require("./cacheUtils");

/**
 * Cleanup utility for expired orders and locks
 * This ensures that locks are properly released when orders expire
 */

/**
 * Clean up expired pending orders and release their locks
 * This should be run periodically (e.g., every 5 minutes)
 */
async function cleanupExpiredOrders() {
  try {
    const now = new Date();
    
    // Find all expired pending orders
    const expiredOrders = await Order.find({
      status: "pendingPayment",
      reservationExpiresAt: { $lt: now }
    }).select("_id items userId").lean();
    
    if (expiredOrders.length === 0) {
      return { cleaned: 0, message: "No expired orders found" };
    }
    
    let totalLocksReleased = 0;
    const failedCleanups = [];
    
    for (const order of expiredOrders) {
      try {
        // Update order status to failed
        await Order.updateOne(
          { _id: order._id },
          { $set: { status: "failed" } }
        );
        
        // Release locks for all items in the order
        const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
        totalLocksReleased += lockReleaseResult.released.length;
        
        if (lockReleaseResult.failed.length > 0) {
          failedCleanups.push({
            orderId: order._id,
            failedItems: lockReleaseResult.failed
          });
        }
        
        console.log(`Cleaned up expired order ${order._id}, released ${lockReleaseResult.released.length} locks`);
      } catch (error) {
        console.error(`Failed to cleanup order ${order._id}:`, error);
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
    console.error("Error in cleanupExpiredOrders:", error);
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
    console.error(`Error force releasing locks for order ${orderId}:`, error);
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
    console.error("Error getting lock statistics:", error);
    throw error;
  }
}

/**
 * Start periodic cleanup (call this when the server starts)
 */
function startPeriodicCleanup(intervalMs = 5 * 60 * 1000) { // 5 minutes default
  const cleanupInterval = setInterval(async () => {
    try {
      const result = await cleanupExpiredOrders();
      console.log(`Periodic cleanup: ${result.message}`);
    } catch (error) {
      console.error("Periodic cleanup failed:", error);
    }
  }, intervalMs);
  
  console.log(`Started periodic cleanup every ${intervalMs / 1000} seconds`);
  return cleanupInterval;
}

module.exports = {
  cleanupExpiredOrders,
  forceReleaseOrderLocks,
  getLockStatistics,
  startPeriodicCleanup
}; 