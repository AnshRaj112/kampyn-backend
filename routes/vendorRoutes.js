const express = require("express");
const router = express.Router();
const { getVendorsByUni, getVendorsWithAvailability, updateVendorAvailability } = require("../controllers/vendorController");

// Get all vendors for a specific university
router.get("/list/uni/:uniId", getVendorsByUni);

// Get all vendors with their availability status for a specific university
router.get("/availability/uni/:uniId", getVendorsWithAvailability);

// Update vendor availability in university
router.patch("/availability/uni/:uniId/vendor/:vendorId", updateVendorAvailability);

module.exports = router;
