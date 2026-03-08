const express = require("express");
const logger = require("../utils/pinoLogger");

const router = express.Router();
const {
  getVendorsByUni,
  getVendorsWithAvailability,
  updateVendorAvailability,
  updateItemSpecialStatus,
  updateItemAvailableStatus,
  deleteVendor,
  getDeliverySettings,
  updateDeliverySettings,
  toggleVendorAvailability,
  getVendorAvailability,
  updateProfile
} = require("../controllers/vendor/vendorController");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");
const upload = require("../middleware/upload");
const vendorAuthMiddleware = require("../middleware/auth/vendorAuthMiddleware");

const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const uniOrVendorAuthMiddleware = require("../middleware/auth/uniOrVendorAuthMiddleware");

/**
 * Authorization middleware to ensure a university can only access its own data/vendors.
 */
const authorizeUni = (req, res, next) => {
  const { uniId } = req.params;
  if (!req.uni || req.uni._id.toString() !== uniId) {
    logger.warn({ authorizedUni: req.uni?._id, targetUni: uniId }, "Unauthorized university access attempt to vendor data");
    return res.status(403).json({
      success: false,
      message: "Access denied. You are only authorized to manage your own university's vendors."
    });
  }
  next();
};

/**
 * Authorization middleware for routes accessible by either the vendor themselves or their parent university.
 */
const authorizeVendorOrUni = async (req, res, next) => {
  try {
    const { vendorId } = req.params;

    // If authenticated as a vendor, check if they are accessing their own data
    if (req.vendor) {
      if (req.vendor._id.toString() !== vendorId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: You can only modify your own vendor profile."
        });
      }
      return next();
    }

    // If authenticated as a university, check if the vendor belongs to them
    if (req.uni) {
      const vendor = await Vendor.findById(vendorId).select('uniID');
      if (!vendor) {
        return res.status(404).json({ success: false, message: "Vendor not found" });
      }

      if (vendor.uniID.toString() !== req.uni._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: This vendor does not belong to your university."
        });
      }
      return next();
    }

    return res.status(401).json({ success: false, message: "Authentication required" });
  } catch (error) {
    logger.error({ error: error.message }, "Error in authorizeVendorOrUni");
    res.status(500).json({ success: false, message: "Internal server error during authorization" });
  }
};


// Public Routes
// Get all vendors for a specific university
router.get("/list/uni/:uniId", getVendorsByUni);

// University Management Routes (Protected by University Auth)
router.get("/availability/uni/:uniId", uniAuthMiddleware, authorizeUni, getVendorsWithAvailability);
router.patch("/availability/uni/:uniId/vendor/:vendorId", uniAuthMiddleware, authorizeUni, updateVendorAvailability);
router.delete("/delete/uni/:uniId/vendor/:vendorId", uniAuthMiddleware, authorizeUni, deleteVendor);

// Public metadata routes for customer-facing components (Cart, BillBox)
// Get delivery settings for a vendor
router.get("/:vendorId/delivery-settings", getDeliverySettings);

// Get assigned services for a vendor
router.get("/:vendorId/assignments", async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    const vendor = await Vendor.findById(vendorId)
      .populate({ path: 'services', populate: { path: 'feature' } })
      .select('services fullName uniID');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: {
        vendor: {
          _id: vendor._id,
          fullName: vendor.fullName,
          uniID: vendor.uniID
        },
        services: vendor.services || []
      }
    });
  } catch (error) {
    logger.error('Error fetching vendor assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor assignments'
    });
  }
});

// Get vendor's current availability status
router.get("/:vendorId/availability", getVendorAvailability);

// Get vendor's university charges
router.get("/:vendorId/university-charges", async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    const vendor = await Vendor.findById(vendorId).select('uniID').lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (!vendor.uniID) {
      return res.status(404).json({
        success: false,
        message: 'Vendor is not associated with any university'
      });
    }

    const university = await Uni.findById(vendor.uniID).select('packingCharge deliveryCharge fullName').lean();

    if (!university) {
      return res.status(404).json({
        success: false,
        message: 'University not found'
      });
    }

    res.json({
      success: true,
      data: {
        packingCharge: university.packingCharge,
        deliveryCharge: university.deliveryCharge,
        universityName: university.fullName
      }
    });
  } catch (error) {
    logger.error('Error fetching vendor university charges:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update delivery settings for a vendor
router.put("/:vendorId/delivery-settings", uniOrVendorAuthMiddleware, authorizeVendorOrUni, updateDeliverySettings);

// Add route for updating isSpecial for a vendor's item
router.patch("/:vendorId/item/:itemId/:kind/special", uniOrVendorAuthMiddleware, authorizeVendorOrUni, updateItemSpecialStatus);

// Add route for updating isAvailable for a vendor's item
router.patch("/:vendorId/item/:itemId/:kind/available", uniOrVendorAuthMiddleware, authorizeVendorOrUni, updateItemAvailableStatus);

// Toggle vendor availability (vendor can toggle their own availability)
router.patch("/:vendorId/toggle-availability", uniOrVendorAuthMiddleware, authorizeVendorOrUni, toggleVendorAvailability);

// Protected Routes - require vendor authentication
router.use(vendorAuthMiddleware);



// Update vendor profile (including images) - Vendor Only Check
router.put("/:vendorId/profile", async (req, res, next) => {
  if (req.vendor._id.toString() !== req.params.vendorId) {
    return res.status(403).json({ success: false, message: "Unauthorized: You can only update your own profile." });
  }
  next();
}, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), updateProfile);

module.exports = router;
