const express = require("express");
const router = express.Router();
const { getVendorFeatures } = require("../controllers/access/accessController");
const vendorAuthMiddleware = require("../middleware/auth/vendorAuthMiddleware");

// Get vendor features based on university, vendor, and role
router.get("/features", vendorAuthMiddleware, getVendorFeatures);

module.exports = router;
