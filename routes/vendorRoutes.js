const express = require("express");
const router = express.Router();
const { getVendorsByUni, getVendorsWithAvailability, updateVendorAvailability, updateItemSpecialStatus } = require("../controllers/vendorController");

// Get all vendors for a specific university
router.get("/list/uni/:uniId", getVendorsByUni);

// Get all vendors with their availability status for a specific university
router.get("/availability/uni/:uniId", getVendorsWithAvailability);

// Update vendor availability in university
router.patch("/availability/uni/:uniId/vendor/:vendorId", updateVendorAvailability);

// Delete a vendor from a university and the Vendor collection
router.delete("/delete/uni/:uniId/vendor/:vendorId", require("../controllers/vendorController").deleteVendor);

// Add route for updating isSpecial for a vendor's item
router.patch("/:vendorId/item/:itemId/:kind/special", updateItemSpecialStatus);

module.exports = router;
