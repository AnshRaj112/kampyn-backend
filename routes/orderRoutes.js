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

module.exports = router;
