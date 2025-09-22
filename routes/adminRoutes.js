const express = require("express");
const router = express.Router();
const { getLockStatistics, forceReleaseOrderLocks, cleanupExpiredOrders } = require("../utils/orderCleanupUtils");
const { atomicCache } = require("../utils/cacheUtils");
const invoiceController = require("../controllers/invoiceController");
const Uni = require("../models/account/Uni");
const Vendor = require("../models/account/Vendor");

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
router.get("/invoices", async (req, res) => {
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
router.get("/invoices/stats", async (req, res) => {
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
router.get("/universities", async (req, res) => {
  try {
    console.log("🔵 Admin: Fetching all universities with details");
    
    // Fetch all universities with full details
    const universities = await Uni.find({})
      .select('_id fullName email phone gstNumber packingCharge deliveryCharge isVerified isAvailable createdAt updatedAt vendors')
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

    console.log(`✅ Admin: Found ${universitiesWithVendorCounts.length} universities`);
    
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
router.get("/universities/:uniId", async (req, res) => {
  try {
    const { uniId } = req.params;
    console.log(`🔵 Admin: Fetching details for university ${uniId}`);
    
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

    console.log(`✅ Admin: Found university with ${totalVendors} vendors`);
    
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

    console.log(`🔵 Admin: Updating availability for university ${uniId} to ${isAvailable}`);

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

    console.log(`✅ Admin: University ${university.fullName} availability updated to ${isAvailable}`);

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

module.exports = router; 