/* routes/inventoryRoutes.js */
const express = require("express");
const router = express.Router();
const {
  postVendorReport,
  postUniReport,
  getVendorReport,
} = require("../controllers/inventoryReportController");

// Create report for a specific vendor
router.post("/vendor/:vendorId", postVendorReport);
// Create report for all vendors in a university
router.post("/uni/:uniId", postUniReport);
// Get report for a specific vendor on a given day
router.get("/vendor/:vendorId", getVendorReport);

module.exports = router;
