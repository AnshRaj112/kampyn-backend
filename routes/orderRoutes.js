const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order/orderController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");
const vendorAuthMiddleware = require("../middleware/auth/vendorAuthMiddleware");
const uniOrVendorAuthMiddleware = require("../middleware/auth/uniOrVendorAuthMiddleware");


// CUSTOMER ROUTES (No global auth for frontend standardization, as per request)
// Guest order endpoint for vendors (must come before /:userId route)
router.post("/guest", orderController.createGuestOrder);

// Store order details for mobile payment flow (must come before /:userId route)
router.post("/store-details", orderController.storeOrderDetails);


// Place an order (creates Order in DB + returns Razorpay options)
router.post("/:userId", authMiddleware, orderController.placeOrderHandler);

// 4. get past orders for a user
router.get("/past/:userId", authMiddleware, orderController.getPastOrders);

// 5. get active orders for a user
router.get("/user-active/:userId", authMiddleware, orderController.getUserActiveOrders);

// 7. cleanup delivered orders that are still in active orders
router.post("/cleanup-delivered/:userId", authMiddleware, orderController.cleanupDeliveredOrders);

// 8. cancel a pending order and release locks
router.post("/:orderId/cancel", orderController.cancelOrder);

// 9. manually cancel a pending order (for users)
router.post("/:orderId/cancel-manual", authMiddleware, orderController.cancelOrderManual);

// Get a specific order by ID (must be last to avoid conflicts with other :orderId routes)
router.get("/:orderId", authMiddleware, orderController.getOrderById);


// Vendor analytics endpoint
router.get('/analytics/:vendorId', uniOrVendorAuthMiddleware, orderController.getVendorAnalytics);

// Get all active orders for a vendor
router.get("/vendor/:vendorId/active", uniOrVendorAuthMiddleware, orderController.getActiveOrdersByVendor);


// VENDOR DASHBOARD ROUTES (Require vendor authentication)
// Protect everything below this with vendorAuthMiddleware
router.use(vendorAuthMiddleware);

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

// 6. get past orders for a vendor
router.get("/vendor-past/:vendorId", orderController.getVendorPastOrders);


module.exports = router;


