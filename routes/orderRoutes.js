// src/routes/orderRoutes.js

const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
//const authMiddleware = require("../middlewares/authMiddleware"); // your JWT‐based auth

// Place an order (creates Order in DB + returns Razorpay options)
router.post("/:userId", orderController.placeOrderHandler);

module.exports = router;
