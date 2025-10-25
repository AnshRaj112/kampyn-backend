const express = require("express");
const router = express.Router();
const {
  createGrievance,
  getVendorGrievances,
  getUniversityGrievances,
  getGrievanceById,
  updateGrievanceStatus,
  getGrievanceStats
} = require("../controllers/grievanceController");

// Vendor routes
router.post("/vendor/:vendorId/grievances", createGrievance);
router.get("/vendor/:vendorId/grievances", getVendorGrievances);

// University routes
router.get("/university/:uniId/grievances", getUniversityGrievances);
router.get("/university/:uniId/grievances/stats", getGrievanceStats);

// Common routes
router.get("/grievances/:grievanceId", getGrievanceById);
router.patch("/grievances/:grievanceId/status", updateGrievanceStatus);

module.exports = router;
