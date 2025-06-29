// src/routes/orderRoutes.js

const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
//const authMiddleware = require("../middlewares/authMiddleware"); // your JWT‐based auth

// Place an order (creates Order in DB + returns Razorpay options)
router.post("/:userId", orderController.placeOrderHandler);
// 1. get current active order for a vendor (specify type: dinein|takeaway|delivery)
router.get("/active/:vendorId/:orderType", orderController.getActiveOrders);

// 2. change status from inProgress to completed
router.patch("/:orderId/complete", orderController.completeOrder);

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

module.exports = router;
