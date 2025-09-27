/* routes/inventoryRoutes.js */
const express = require("express");
const router = express.Router();
const {
  postVendorReport,
  postUniReport,
  getVendorReport,
  getVendorReportDates,
  generateAllVendorReports,
} = require("../controllers/inventoryReportController");

// Create report for a specific vendor
router.post("/vendor/:vendorId", postVendorReport);
// Create report for all vendors in a university
router.post("/uni/:uniId", postUniReport);
// Generate reports for all vendors (for testing/manual triggers)
router.post("/generate-all", generateAllVendorReports);
// Get report for a specific vendor on a given day
router.get("/vendor/:vendorId", getVendorReport);
// Get all report dates for a specific vendor
router.get("/vendor/:vendorId/dates", getVendorReportDates);

module.exports = router;
