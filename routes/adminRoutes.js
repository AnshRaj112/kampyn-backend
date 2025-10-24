const express = require("express");
const router = express.Router();
const { getLockStatistics, forceReleaseOrderLocks, cleanupExpiredOrders } = require("../utils/orderCleanupUtils");
const { atomicCache } = require("../utils/cacheUtils");
const invoiceController = require("../controllers/invoiceController");
const Uni = require("../models/account/Uni");
const Vendor = require("../models/account/Vendor");
const { adminLimiter, strictLimiter } = require("../middleware/rateLimit");

// Authentication removed - anyone can access admin routes for now

/**
 * GET /admin/locks/stats
 * Get statistics about current locks and orders
 * No authentication required
 */
router.get("/locks/stats", async (req, res) => {
  try {
    const stats = await getLockStatistics();
    res.json({
      success: true,
      data: stats,
      requestedBy: 'anonymous' // Changed from req.admin.email
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
 * No authentication required
 */
router.get("/locks/detailed-stats", (req, res) => {
  try {
    const detailedStats = atomicCache.getDetailedStats();
    res.json({
      success: true,
      data: detailedStats,
      requestedBy: 'anonymous' // Changed from req.admin.email
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
 * No authentication required
 */
router.post("/locks/release/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await forceReleaseOrderLocks(orderId);
    
    res.json({
      success: true,
      data: result,
      requestedBy: 'anonymous', // Changed from req.admin.email
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
 * No authentication required
 */
router.post("/locks/cleanup", async (req, res) => {
  try {
    const result = await cleanupExpiredOrders();
    
    res.json({
      success: true,
      data: result,
      requestedBy: 'anonymous', // Changed from req.admin.email
      timestamp: new Date()
    });
  } catch (error) {
    console.error("Error cleaning up expired orders:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup expired orders",
      error: error.message
    });
  }
});

/**
 * POST /admin/locks/clear-all
 * Clear all locks (use with caution)
 * No authentication required
 */
router.post("/locks/clear-all", async (req, res) => {
  try {
    const result = await atomicCache.clearAllLocks();
    
    res.json({
      success: true,
      data: result,
      requestedBy: 'anonymous', // Changed from req.admin.email
      timestamp: new Date()
    });
  } catch (error) {
    console.error("Error clearing all locks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear all locks",
      error: error.message
    });
  }
});

/**
 * GET /admin/locks/items/:itemId
 * Get locks for a specific item
 * No authentication required
 */
router.get("/locks/items/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    const locks = await atomicCache.getLocksForItem(itemId);
    
    res.json({
      success: true,
      data: locks,
      requestedBy: 'anonymous', // Changed from req.admin.email
      timestamp: new Date()
    });
  } catch (error) {
    console.error("Error getting locks for item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get locks for item",
      error: error.message
    });
  }
});

/**
 * GET /admin/system/health
 * Get system health information
 * No authentication required
 */
router.get("/system/health", async (req, res) => {
  try {
    const healthInfo = {
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      nodeEnv: process.env.NODE_ENV || 'development'
    };
    
    res.json({
      success: true,
      data: healthInfo,
      requestedBy: 'anonymous' // Changed from req.admin.email
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
 * GET /admin/invoices
 * Get all invoices with pagination and filtering
 * No authentication required
 */
router.get("/invoices", adminLimiter, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, recipientType, startDate, endDate } = req.query;
    
    const result = await invoiceController.getAdminInvoices({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      type,
      recipientType,
      startDate,
      endDate
    });
    
    res.json({
      success: true,
      data: result.invoices,
      pagination: result.pagination,
      requestedBy: 'anonymous' // Changed from req.admin.email
    });
  } catch (error) {
    console.error("Error getting admin invoices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get admin invoices",
      error: error.message
    });
  }
});

/**
 * GET /admin/invoices/stats
 * Get invoice statistics
 * No authentication required
 */
router.get("/invoices/stats", adminLimiter, async (req, res) => {
  try {
    const stats = await invoiceController.getInvoiceStats();
    
    res.json({
      success: true,
      data: stats,
      requestedBy: 'anonymous' // Changed from req.admin.email
    });
  } catch (error) {
    console.error("Error getting invoice stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get invoice stats",
      error: error.message
    });
  }
});

/**
 * POST /admin/invoices/bulk-download
 * Get invoices for bulk download
 * No authentication required
 */
router.post("/invoices/bulk-download", async (req, res) => {
  try {
    const { invoiceIds, format = 'pdf' } = req.body;
    
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invoice IDs array is required"
      });
    }
    
    const result = await invoiceController.getInvoicesForBulkDownload(invoiceIds, format);
    
    res.json({
      success: true,
      data: result,
      requestedBy: 'anonymous' // Changed from req.admin.email
    });
  } catch (error) {
    console.error("Error getting invoices for bulk download:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get invoices for bulk download",
      error: error.message
    });
  }
});

/**
 * POST /admin/invoices/generate-order-invoices
 * Generate invoices for a specific order
 * No authentication required
 */
router.post("/invoices/generate-order-invoices", async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }
    
    const result = await invoiceController.generateOrderInvoices(orderId);
    
    res.json({
      success: true,
      data: result,
      requestedBy: 'anonymous' // Changed from req.admin.email
    });
  } catch (error) {
    console.error("Error generating order invoices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate order invoices",
      error: error.message
    });
  }
});

/**
 * GET /admin/universities
 * Get all universities with full details including vendor counts
 * No authentication required
 */
router.get("/universities", adminLimiter, async (req, res) => {
  try {
    console.info("🔵 Admin: Fetching all universities with details");
    
    // Fetch all universities with full details
    const universities = await Uni.find({})
      .select('_id fullName email phone gstNumber packingCharge deliveryCharge platformFee isVerified isAvailable createdAt updatedAt vendors')
      .lean();

    // Get vendor counts for each university
    const universitiesWithVendorCounts = await Promise.all(
      universities.map(async (uni) => {
        // Count total vendors for this university
        const totalVendors = await Vendor.countDocuments({ uniID: uni._id });
        
        // Count active vendors (vendors that are marked as available in the uni's vendors array)
        const activeVendors = uni.vendors.filter(vendor => vendor.isAvailable === 'Y').length;
        
        return {
          _id: uni._id,
          fullName: uni.fullName,
          email: uni.email,
          phone: uni.phone || 'Not provided',
          gstNumber: uni.gstNumber,
          packingCharge: uni.packingCharge,
          deliveryCharge: uni.deliveryCharge,
          platformFee: uni.platformFee,
          isVerified: uni.isVerified,
          isAvailable: uni.isAvailable,
          createdAt: uni.createdAt,
          updatedAt: uni.updatedAt,
          totalVendors,
          activeVendors,
          vendorCount: totalVendors // For backward compatibility
        };
      })
    );

    // Sort by creation date (newest first)
    universitiesWithVendorCounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.info(`✅ Admin: Found ${universitiesWithVendorCounts.length} universities`);
    
    res.json({
      success: true,
      data: universitiesWithVendorCounts,
      total: universitiesWithVendorCounts.length,
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error fetching universities:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch universities",
      error: error.message
    });
  }
});

/**
 * GET /admin/universities/:uniId
 * Get detailed information about a specific university including all vendors
 * No authentication required
 */
router.get("/universities/:uniId", adminLimiter, async (req, res) => {
  try {
    const { uniId } = req.params;
    console.info(`🔵 Admin: Fetching details for university ${uniId}`);
    
    // Fetch university details
    const university = await Uni.findById(uniId)
      .select('_id fullName email phone gstNumber packingCharge deliveryCharge isVerified isAvailable createdAt updatedAt vendors')
      .lean();

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found"
      });
    }

    // Get all vendors for this university with their details
    const vendors = await Vendor.find({ uniID: uniId })
      .select('_id fullName email phone location deliverySettings')
      .lean();

    // Create a map of vendor availability from university's vendors array
    const availabilityMap = new Map();
    university.vendors.forEach(vendor => {
      availabilityMap.set(vendor.vendorId.toString(), vendor.isAvailable);
    });

    // Combine vendor data with availability status
    const vendorsWithAvailability = vendors.map(vendor => ({
      _id: vendor._id,
      fullName: vendor.fullName,
      email: vendor.email,
      phone: vendor.phone,
      location: vendor.location,
      isAvailable: availabilityMap.get(vendor._id.toString()) || "N",
      deliverySettings: vendor.deliverySettings || {
        offersDelivery: false,
        deliveryPreparationTime: 30
      }
    }));

    // Count statistics
    const totalVendors = vendors.length;
    const activeVendors = vendorsWithAvailability.filter(v => v.isAvailable === 'Y').length;

    const universityDetails = {
      _id: university._id,
      fullName: university.fullName,
      email: university.email,
      phone: university.phone || 'Not provided',
      gstNumber: university.gstNumber,
      packingCharge: university.packingCharge,
      deliveryCharge: university.deliveryCharge,
      isVerified: university.isVerified,
      isAvailable: university.isAvailable,
      createdAt: university.createdAt,
      updatedAt: university.updatedAt,
      vendors: vendorsWithAvailability,
      statistics: {
        totalVendors,
        activeVendors,
        inactiveVendors: totalVendors - activeVendors
      }
    };

    console.info(`✅ Admin: Found university with ${totalVendors} vendors`);
    
    res.json({
      success: true,
      data: universityDetails,
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error fetching university details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch university details",
      error: error.message
    });
  }
});

/**
 * PATCH /admin/universities/:uniId/availability
 * Toggle university availability
 * No authentication required
 */
router.patch("/universities/:uniId/availability", async (req, res) => {
  try {
    const { uniId } = req.params;
    const { isAvailable } = req.body;

    if (!isAvailable || !["Y", "N"].includes(isAvailable)) {
      return res.status(400).json({
        success: false,
        message: "Invalid 'isAvailable' value. Must be 'Y' or 'N'."
      });
    }

    console.info(`🔵 Admin: Updating availability for university ${uniId} to ${isAvailable}`);

    const university = await Uni.findByIdAndUpdate(
      uniId,
      { isAvailable },
      { new: true, runValidators: true }
    ).select('_id fullName isAvailable');

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found"
      });
    }

    console.info(`✅ Admin: University ${university.fullName} availability updated to ${isAvailable}`);

    res.json({
      success: true,
      message: `University availability updated to ${isAvailable === 'Y' ? 'available' : 'unavailable'}`,
      data: {
        _id: university._id,
        fullName: university.fullName,
        isAvailable: university.isAvailable
      },
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error updating university availability:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update university availability",
      error: error.message
    });
  }
});

/**
 * PUT /admin/universities/:uniId/platform-fee
 * Update platform fee for a specific university
 * No authentication required
 */
router.put("/universities/:uniId/platform-fee", async (req, res) => {
  try {
    const { uniId } = req.params;
    const { platformFee } = req.body;

    console.info(`🔵 Admin: Updating platform fee for university ${uniId} to ₹${platformFee}`);

    // Validate input
    if (platformFee === undefined || platformFee === null) {
      return res.status(400).json({
        success: false,
        message: "Platform fee is required"
      });
    }

    if (typeof platformFee !== 'number' || platformFee < 0) {
      return res.status(400).json({
        success: false,
        message: "Platform fee must be a non-negative number"
      });
    }

    // Find and update university
    const university = await Uni.findByIdAndUpdate(
      uniId,
      { platformFee: platformFee },
      { new: true, runValidators: true }
    ).select('_id fullName email platformFee');

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found"
      });
    }

    console.info(`✅ Admin: Platform fee updated for ${university.fullName} to ₹${platformFee}`);

    res.json({
      success: true,
      message: "Platform fee updated successfully",
      university: {
        _id: university._id,
        fullName: university.fullName,
        email: university.email,
        platformFee: university.platformFee
      },
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error updating platform fee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update platform fee",
      error: error.message
    });
  }
});

/**
 * PUT /admin/universities/bulk-platform-fees
 * Update platform fees for multiple universities
 * No authentication required
 */
router.put("/universities/bulk-platform-fees", async (req, res) => {
  try {
    const { updates } = req.body;

    console.info(`🔵 Admin: Bulk updating platform fees for ${updates.length} universities`);

    // Validate input
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required and must not be empty"
      });
    }

    // Validate each update
    for (const update of updates) {
      if (!update.uniId || update.platformFee === undefined || update.platformFee === null) {
        return res.status(400).json({
          success: false,
          message: "Each update must have uniId and platformFee"
        });
      }

      if (typeof update.platformFee !== 'number' || update.platformFee < 0) {
        return res.status(400).json({
          success: false,
          message: "Platform fee must be a non-negative number"
        });
      }
    }

    // Get all university IDs for validation
    const uniIds = updates.map(update => update.uniId);
    const existingUnis = await Uni.find({ _id: { $in: uniIds } }).select('_id fullName');
    
    if (existingUnis.length !== uniIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more universities not found"
      });
    }

    // Perform bulk update
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.uniId },
        update: { platformFee: update.platformFee }
      }
    }));

    const result = await Uni.bulkWrite(bulkOps);

    console.info(`✅ Admin: Bulk updated platform fees for ${result.modifiedCount} universities`);

    res.json({
      success: true,
      message: "Platform fees updated successfully",
      updatedCount: result.modifiedCount,
      totalRequested: updates.length,
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error bulk updating platform fees:", error);
    res.status(500).json({
      success: false,
      message: "Failed to bulk update platform fees",
      error: error.message
    });
  }
});

/**
 * GET /admin/universities/:uniId/platform-fee
 * Get platform fee for a specific university
 * No authentication required
 */
router.get("/universities/:uniId/platform-fee", async (req, res) => {
  try {
    const { uniId } = req.params;

    console.info(`🔵 Admin: Fetching platform fee for university ${uniId}`);

    const university = await Uni.findById(uniId)
      .select('_id fullName email platformFee')
      .lean();

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found"
      });
    }

    console.info(`✅ Admin: Retrieved platform fee for ${university.fullName}: ₹${university.platformFee}`);

    res.json({
      success: true,
      university: {
        _id: university._id,
        fullName: university.fullName,
        email: university.email,
        platformFee: university.platformFee
      },
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error fetching platform fee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch platform fee",
      error: error.message
    });
  }
});

/**
 * GET /admin/help-messages
 * Get all help messages with pagination and filtering
 * No authentication required
 */
router.get("/help-messages", adminLimiter, async (req, res) => {
  try {
    console.info("🔵 Admin: Fetching all help messages");
    
    const ContactMessage = require("../models/users/ContactMessage");
    
    // Get query parameters
    const { page = 1, limit = 50, status = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter query
    let filter = {};
    if (status === 'read') {
      filter.isRead = true;
    } else if (status === 'unread') {
      filter.isRead = false;
    }
    
    // Fetch messages with pagination
    const messages = await ContactMessage.find(filter)
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get total count
    const totalMessages = await ContactMessage.countDocuments(filter);
    const unreadCount = await ContactMessage.countDocuments({ isRead: false });
    const readCount = await ContactMessage.countDocuments({ isRead: true });
    
    console.info(`✅ Admin: Found ${messages.length} help messages (${unreadCount} unread)`);
    
    res.json({
      success: true,
      messages: messages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMessages / parseInt(limit)),
        totalMessages: totalMessages,
        hasNext: skip + messages.length < totalMessages,
        hasPrev: parseInt(page) > 1
      },
      statistics: {
        total: totalMessages,
        unread: unreadCount,
        read: readCount
      },
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error fetching help messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch help messages",
      error: error.message
    });
  }
});

/**
 * PUT /admin/help-messages/:messageId/read
 * Mark a help message as read
 * No authentication required
 */
router.put("/help-messages/:messageId/read", strictLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    console.info(`🔵 Admin: Marking message ${messageId} as read`);
    
    const ContactMessage = require("../models/users/ContactMessage");
    
    const message = await ContactMessage.findByIdAndUpdate(
      messageId,
      { isRead: true },
      { new: true, runValidators: true }
    ).lean();
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }
    
    console.info(`✅ Admin: Message ${messageId} marked as read`);
    
    res.json({
      success: true,
      message: "Message marked as read",
      data: {
        _id: message._id,
        isRead: message.isRead
      },
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error marking message as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark message as read",
      error: error.message
    });
  }
});

/**
 * PUT /admin/help-messages/:messageId/unread
 * Mark a help message as unread
 * No authentication required
 */
router.put("/help-messages/:messageId/unread", strictLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    console.info(`🔵 Admin: Marking message ${messageId} as unread`);
    
    const ContactMessage = require("../models/users/ContactMessage");
    
    const message = await ContactMessage.findByIdAndUpdate(
      messageId,
      { isRead: false },
      { new: true, runValidators: true }
    ).lean();
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }
    
    console.info(`✅ Admin: Message ${messageId} marked as unread`);
    
    res.json({
      success: true,
      message: "Message marked as unread",
      data: {
        _id: message._id,
        isRead: message.isRead
      },
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error marking message as unread:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark message as unread",
      error: error.message
    });
  }
});

/**
 * GET /admin/help-messages/:messageId
 * Get a specific help message by ID
 * No authentication required
 */
router.get("/help-messages/:messageId", strictLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    console.info(`🔵 Admin: Fetching help message ${messageId}`);
    
    const ContactMessage = require("../models/users/ContactMessage");
    
    const message = await ContactMessage.findById(messageId).lean();
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }
    
    console.info(`✅ Admin: Retrieved help message ${messageId}`);
    
    res.json({
      success: true,
      message: message,
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error fetching help message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch help message",
      error: error.message
    });
  }
});

/**
 * DELETE /admin/help-messages/:messageId
 * Delete a help message
 * No authentication required
 */
router.delete("/help-messages/:messageId", strictLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    console.info(`🔵 Admin: Deleting help message ${messageId}`);
    
    const ContactMessage = require("../models/users/ContactMessage");
    
    const message = await ContactMessage.findByIdAndDelete(messageId);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }
    
    console.info(`✅ Admin: Deleted help message ${messageId}`);
    
    res.json({
      success: true,
      message: "Message deleted successfully",
      requestedBy: 'anonymous'
    });
  } catch (error) {
    console.error("❌ Admin: Error deleting help message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete help message",
      error: error.message
    });
  }
});

module.exports = router; 