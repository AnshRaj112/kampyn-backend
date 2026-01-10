const express = require("express");
const router = express.Router();
const vendorPaymentController = require("../controllers/payment/vendorPaymentController");

// POST /vendor-payment/create-order
// Create Razorpay order for vendor guest orders
router.post("/create-order", vendorPaymentController.createVendorRazorpayOrder);

// POST /vendor-payment/verify
// Verify vendor payment and create order
router.post("/verify", vendorPaymentController.verifyVendorPayment);

// GET /vendor-payment/key
// Get Razorpay public key
router.get("/key", vendorPaymentController.getRazorpayKey);

module.exports = router; 