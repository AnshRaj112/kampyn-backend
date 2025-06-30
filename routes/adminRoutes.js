const express = require("express");
const router = express.Router();
const { getLockStatistics, forceReleaseOrderLocks, cleanupExpiredOrders } = require("../utils/orderCleanupUtils");
const { atomicCache } = require("../utils/cacheUtils");
const { 
  adminAuthMiddleware, 
  requirePermission, 
  requireSuperAdmin 
} = require("../middleware/adminAuthMiddleware");

// Apply authentication middleware to all admin routes
router.use(adminAuthMiddleware);

/**
 * GET /admin/locks/stats
 * Get statistics about current locks and orders
 * Requires: viewStats permission
 */
router.get("/locks/stats", requirePermission('viewStats'), async (req, res) => {
  try {
    const stats = await getLockStatistics();
    res.json({
      success: true,
      data: stats,
      requestedBy: req.admin.email
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
 * GET /admin/locks/detailed-stats
 * Get detailed statistics about locks for debugging
 * Requires: viewStats permission
 */
router.get("/locks/detailed-stats", requirePermission('viewStats'), (req, res) => {
  try {
    const detailedStats = atomicCache.getDetailedStats();
    res.json({
      success: true,
      data: detailedStats,
      requestedBy: req.admin.email
    });
  } catch (error) {
    console.error("Error getting detailed lock statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get detailed lock statistics",
      error: error.message
    });
  }
});

/**
 * POST /admin/locks/release/:orderId
 * Force release locks for a specific order
 * Requires: releaseLocks permission
 */
router.post("/locks/release/:orderId", requirePermission('releaseLocks'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await forceReleaseOrderLocks(orderId);
    
    res.json({
      success: true,
      data: result,
      requestedBy: req.admin.email,
      timestamp: new Date()
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
 * Requires: releaseLocks permission
 */
router.post("/locks/cleanup", requirePermission('releaseLocks'), async (req, res) => {
  try {
    const result = await cleanupExpiredOrders();
    
    res.json({
      success: true,
      data: result,
      requestedBy: req.admin.email,
      timestamp: new Date()
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
 * Requires: clearAllLocks permission (super admin only)
 */
router.post("/locks/clear-all", requirePermission('clearAllLocks'), (req, res) => {
  try {
    const beforeStats = atomicCache.getStats();
    const clearedCount = atomicCache.clearAllLocks();
    const afterStats = atomicCache.getStats();
    
    res.json({
      success: true,
      data: {
        before: beforeStats,
        after: afterStats,
        clearedCount,
        message: `All ${clearedCount} locks cleared successfully`,
        requestedBy: req.admin.email,
        timestamp: new Date()
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
 * Requires: viewLocks permission
 */
router.get("/locks/items/:itemId", requirePermission('viewLocks'), (req, res) => {
  try {
    const { itemId } = req.params;
    const lockInfo = atomicCache.getLockInfo(itemId);
    
    res.json({
      success: true,
      data: {
        itemId,
        isLocked: lockInfo !== null,
        lockInfo,
        requestedBy: req.admin.email,
        timestamp: new Date()
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

/**
 * GET /admin/system/health
 * Get system health information
 * Requires: viewStats permission
 */
router.get("/system/health", requirePermission('viewStats'), (req, res) => {
  try {
    const cacheStats = atomicCache.getStats();
    const systemInfo = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date()
    };
    
    res.json({
      success: true,
      data: {
        cache: cacheStats,
        system: systemInfo,
        requestedBy: req.admin.email
      }
    });
  } catch (error) {
    console.error("Error getting system health:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get system health",
      error: error.message
    });
  }
});

/**
 * GET /admin/auth/me
 * Get current admin information
 * No additional permissions required (already authenticated)
 */
router.get("/auth/me", (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        adminId: req.admin.adminId,
        email: req.admin.email,
        role: req.admin.role,
        permissions: req.admin.permissions,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error("Error getting admin info:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get admin information",
      error: error.message
    });
  }
});

module.exports = router; 