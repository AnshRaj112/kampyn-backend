// src/routes/orderApprovalRoutes.js
// NEW FILE: Routes for order approval workflow

const express = require("express");
const router = express.Router();
const orderApprovalController = require("../controllers/orderApprovalController");

// Submit order for vendor approval (instead of direct payment)
router.post("/submit/:userId", orderApprovalController.submitOrderForApproval);

// Check order approval status (for polling from frontend)
router.get("/status/:orderId", orderApprovalController.getOrderApprovalStatus);

// Vendor accepts an order
router.post("/:orderId/accept", orderApprovalController.acceptOrder);

// Vendor denies an order
router.post("/:orderId/deny", orderApprovalController.denyOrder);

// Get all pending approval orders for a vendor
router.get("/pending/:vendorId", orderApprovalController.getPendingApprovalOrders);

module.exports = router;

