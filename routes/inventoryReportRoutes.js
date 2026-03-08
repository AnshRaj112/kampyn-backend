/* routes/inventoryRoutes.js */
const express = require("express");
const router = express.Router();
const {
  postVendorReport,
  postUniReport,
  getVendorReport,
  getVendorReportDates,
  generateAllVendorReports,
} = require("../controllers/inventory/inventoryReportController");
const vendorAuthMiddleware = require("../middleware/auth/vendorAuthMiddleware");
const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const uniOrVendorAuthMiddleware = require("../middleware/auth/uniOrVendorAuthMiddleware");

// Create report for a specific vendor
router.post("/vendor/:vendorId", vendorAuthMiddleware, postVendorReport);
// Create report for all vendors in a university
router.post("/uni/:uniId", uniAuthMiddleware, postUniReport);
// Generate reports for all vendors (for testing/manual triggers)
router.post("/generate-all", uniAuthMiddleware, generateAllVendorReports);
// Get report for a specific vendor on a given day
router.get("/vendor/:vendorId", uniOrVendorAuthMiddleware, getVendorReport);
// Get all report dates for a specific vendor
router.get("/vendor/:vendorId/dates", uniOrVendorAuthMiddleware, getVendorReportDates);


module.exports = router;
