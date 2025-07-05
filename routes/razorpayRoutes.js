const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("Missing Razorpay credentials in process.env");
}

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

// POST /razorpay/create-order
router.post("/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || !receipt) {
      return res.status(400).json({
        success: false,
        message: "Amount and receipt are required"
      });
    }

    console.log("💳 Creating Razorpay order:", {
      amount,
      currency,
      receipt
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: amount,
      currency: currency,
      receipt: receipt,
      payment_capture: 1,
    });

    console.log("💳 Razorpay order created:", {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });

    res.json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt
    });
  } catch (error) {
    console.error("❌ Error creating Razorpay order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order"
    });
  }
});

module.exports = router; 