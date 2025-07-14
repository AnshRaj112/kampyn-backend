// src/routes/orderRoutes.js

const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
//const authMiddleware = require("../middlewares/authMiddleware"); // your JWT‐based auth

// Guest order endpoint for vendors (must come before /:userId route)
router.post("/guest", orderController.createGuestOrder);

// Store order details for mobile payment flow (must come before /:userId route)
router.post("/store-details", orderController.storeOrderDetails);

// Place an order (creates Order in DB + returns Razorpay options)
router.post("/:userId", orderController.placeOrderHandler);

// 1. get current active order for a vendor (specify type: dinein|takeaway|delivery)
router.get("/active/:vendorId/:orderType", orderController.getActiveOrders);

// 1.5. get delivery orders for a vendor (onTheWay status only)
router.get("/delivery/:vendorId", orderController.getDeliveryOrders);

// 2. change status from inProgress to completed
router.patch("/:orderId/complete", orderController.completeOrder);

// 2.1. change status from inProgress to ready
router.patch('/:orderId/ready', orderController.readyOrder);

// 3. change status from completed to delivered (moves in user pastOrders)
router.patch("/:orderId/deliver", orderController.deliverOrder);
router.patch("/:orderId/onTheWay", orderController.startDelivery);

// 4. get past orders for a user
router.get("/past/:userId", orderController.getPastOrders);

// 5. get active orders for a user
router.get("/user-active/:userId", orderController.getUserActiveOrders);

// 6. get past orders for a vendor
router.get("/vendor-past/:vendorId", orderController.getVendorPastOrders);

// 7. cleanup delivered orders that are still in active orders
router.post("/cleanup-delivered/:userId", orderController.cleanupDeliveredOrders);

// 8. cancel a pending order and release locks
router.post("/:orderId/cancel", orderController.cancelOrder);

// 9. manually cancel a pending order (for users)
router.post("/:orderId/cancel-manual", orderController.cancelOrderManual);

// Get all active orders for a vendor
router.get("/vendor/:vendorId/active", orderController.getActiveOrdersByVendor);

// Get a specific order by ID (must be last to avoid conflicts with other :orderId routes)
router.get("/:orderId", orderController.getOrderById);

module.exports = router;
