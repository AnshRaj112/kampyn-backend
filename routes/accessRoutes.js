const express = require("express");
const router = express.Router();
const { getVendorFeatures } = require("../controllers/accessController");
const vendorAuthMiddleware = require("../middleware/vendorAuthMiddleware");

// Get vendor features based on university, vendor, and role
router.get("/features", vendorAuthMiddleware, getVendorFeatures);

module.exports = router;
