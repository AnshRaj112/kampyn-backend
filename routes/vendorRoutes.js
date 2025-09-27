const express = require("express");
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
  getVendorAvailability
} = require("../controllers/vendorController");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");

// Get all vendors for a specific university
router.get("/list/uni/:uniId", getVendorsByUni);

// Get all vendors with their availability status for a specific university
router.get("/availability/uni/:uniId", getVendorsWithAvailability);

// Update vendor availability in university
router.patch("/availability/uni/:uniId/vendor/:vendorId", updateVendorAvailability);

// Delete a vendor from a university and the Vendor collection
router.delete("/delete/uni/:uniId/vendor/:vendorId", deleteVendor);

// Get delivery settings for a vendor
router.get("/:vendorId/delivery-settings", getDeliverySettings);

// Update delivery settings for a vendor
router.put("/:vendorId/delivery-settings", updateDeliverySettings);

// Add route for updating isSpecial for a vendor's item
router.patch("/:vendorId/item/:itemId/:kind/special", updateItemSpecialStatus);

// Add route for updating isAvailable for a vendor's item
router.patch("/:vendorId/item/:itemId/:kind/available", updateItemAvailableStatus);

// Get vendor's current availability status
router.get("/:vendorId/availability", getVendorAvailability);

// Toggle vendor availability (vendor can toggle their own availability)
router.patch("/:vendorId/toggle-availability", toggleVendorAvailability);

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
    console.error('Error fetching vendor university charges:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

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
    console.error('Error fetching vendor assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor assignments'
    });
  }
});

module.exports = router;
