// src/controllers/paymentController.js

const Order = require("../models/order/Order");
const orderUtils = require("../utils/orderUtils");
const paymentUtils = require("../utils/paymentUtils");

/**
 * POST /payments/verify
 * Body: {
 *   razorpay_order_id:   String,
 *   razorpay_payment_id: String,
 *   razorpay_signature:  String,
 *   orderId:             String // your own Order._id
 * }
 */
async function verifyPaymentHandler(req, res, next) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    // 1. Validate signature first
    const isValid = paymentUtils.validateRazorpaySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!isValid) {
      // If invalid, mark the order as failedPayment (status updated in util)
      await orderUtils.verifyAndProcessPaymentWithOrderId({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        ourOrderId: orderId,
      });
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed.",
      });
    }

    // 2. Signature is valid → Update Order.status and paymentId (string)
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    order.status = "inProgress";
    order.paymentId = razorpay_payment_id; // assign string directly
    await order.save();

    // 3. Run post-payment logic (inventory, user/cart updates, etc.)
    await orderUtils.postPaymentProcessing(order);

    return res.json({
      success: true,
      message: "Payment successful and order processed.",
    });
  } catch (err) {
    console.error("Error in verifyPaymentHandler:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  verifyPaymentHandler,
};
