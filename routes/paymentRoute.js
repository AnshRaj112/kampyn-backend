// src/routes/paymentRoutes.js

const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment/paymentController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");

// Payment routes

// Verify Razorpay payment & process post‐payment updates
router.post("/verify", paymentController.verifyPaymentHandler);

module.exports = router;
