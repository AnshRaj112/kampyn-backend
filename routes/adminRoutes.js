const express = require("express");
const router = express.Router();
const { getLockStatistics, forceReleaseOrderLocks, cleanupExpiredOrders } = require("../utils/orderCleanupUtils");
const { atomicCache } = require("../utils/cacheUtils");

/**
 * GET /admin/locks/stats
 * Get statistics about current locks and orders
 */
router.get("/locks/stats", async (req, res) => {
  try {
    const stats = await getLockStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("Error getting lock statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get lock statistics",
      error: error.message
    });
  }
});

/**
 * POST /admin/locks/release/:orderId
 * Force release locks for a specific order
 */
router.post("/locks/release/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await forceReleaseOrderLocks(orderId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error force releasing locks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to release locks",
      error: error.message
    });
  }
});

/**
 * POST /admin/locks/cleanup
 * Manually trigger cleanup of expired orders and locks
 */
router.post("/locks/cleanup", async (req, res) => {
  try {
    const result = await cleanupExpiredOrders();
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error during manual cleanup:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup expired orders",
      error: error.message
    });
  }
});

/**
 * POST /admin/locks/clear-all
 * Clear all locks (emergency function - use with caution)
 */
router.post("/locks/clear-all", async (req, res) => {
  try {
    const beforeStats = atomicCache.getStats();
    atomicCache.clearAllLocks();
    const afterStats = atomicCache.getStats();
    
    res.json({
      success: true,
      data: {
        before: beforeStats,
        after: afterStats,
        message: "All locks cleared successfully"
      }
    });
  } catch (error) {
    console.error("Error clearing all locks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear locks",
      error: error.message
    });
  }
});

/**
 * GET /admin/locks/items/:itemId
 * Get lock information for a specific item
 */
router.get("/locks/items/:itemId", (req, res) => {
  try {
    const { itemId } = req.params;
    const lockInfo = atomicCache.getLockInfo(itemId);
    
    res.json({
      success: true,
      data: {
        itemId,
        isLocked: lockInfo !== null,
        lockInfo
      }
    });
  } catch (error) {
    console.error("Error getting item lock info:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get item lock info",
      error: error.message
    });
  }
});

module.exports = router; 