const express = require("express");
const router = express.Router();
const orderApprovalController = require("../controllers/order/orderApprovalController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");
const vendorAuthMiddleware = require("../middleware/auth/vendorAuthMiddleware");

// User Routes - require standard auth
router.post("/submit/:userId", authMiddleware, orderApprovalController.submitOrderForApproval);
router.get("/status/:orderId", authMiddleware, orderApprovalController.getOrderApprovalStatus);
router.post("/:orderId/cancel", authMiddleware, orderApprovalController.cancelPendingOrder);
router.post("/cancel-all/:userId", authMiddleware, orderApprovalController.cancelAllPendingOrders);

// Vendor Routes - require vendor auth
router.post("/:orderId/accept", vendorAuthMiddleware, orderApprovalController.acceptOrder);
router.post("/:orderId/deny", vendorAuthMiddleware, orderApprovalController.denyOrder);
router.get("/pending/:vendorId", vendorAuthMiddleware, orderApprovalController.getPendingApprovalOrders);

module.exports = router;

