const express = require("express");
const router = express.Router();

// Import controllers
const {
  createGrievance,
  getUniversityGrievances,
  getVendorGrievances,
  getGrievanceById,
  updateGrievanceStatus,
  addInternalNote,
  getGrievanceStats,
  searchGrievances,
  deleteGrievance
} = require("../controllers/grievanceController");

// Import middleware
const authMiddleware = require("../middleware/authMiddleware").authMiddleware;
const { uniAuthMiddleware } = require("../middleware/uniAuthMiddleware");

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Create grievance (both vendor and university can create)
router.post("/:uniId/grievances", createGrievance);

// Get specific grievance (both vendor and university can view)
router.get("/:uniId/grievances/:grievanceId", getGrievanceById);

// Get grievances raised by vendor (vendor only)
router.get("/:uniId/vendor-grievances", getVendorGrievances);

// Get all grievances for university (university only)
router.get("/:uniId/grievances", uniAuthMiddleware, getUniversityGrievances);

// Update grievance status (university only)
router.patch("/:uniId/grievances/:grievanceId/status", uniAuthMiddleware, updateGrievanceStatus);

// Add internal note (university only)
router.post("/:uniId/grievances/:grievanceId/internal-notes", uniAuthMiddleware, addInternalNote);

// Get grievance statistics (university only)
router.get("/:uniId/grievances-stats", uniAuthMiddleware, getGrievanceStats);

// Search grievances (university only)
router.get("/:uniId/grievances-search", uniAuthMiddleware, searchGrievances);

// Delete grievance (university only)
router.delete("/:uniId/grievances/:grievanceId", uniAuthMiddleware, deleteGrievance);

module.exports = router;
