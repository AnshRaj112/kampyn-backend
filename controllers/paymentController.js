// src/controllers/paymentController.js

const Order = require("../models/order/Order");
const Payment = require("../models/order/Payment"); // ← import the Payment model
const orderUtils = require("../utils/orderUtils");
const paymentUtils = require("../utils/paymentUtils");

/**
 * POST /payments/verify
 * Body: {
 *   razorpay_order_id:   String,
 *   razorpay_payment_id: String,
 *   razorpay_signature:  String,
 *   orderId:             String // our own Order._id
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

    // 1. Validate the Razorpay signature
    const isValid = paymentUtils.validateRazorpaySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!isValid) {
      // If invalid, mark the order as failedPayment
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

    // 2. Signature is valid → fetch the Order
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    // 3. Create a new Payment document in the payment collection:
    //    • orderId → reference to the Order._id
    //    • userId  → comes from order.userId
    //    • amount  → the order’s total
    //    • status  → "paid"
    //    • paymentMethod → "razorpay"
    //    • razorpayOrderId, razorpayPaymentId → from Razorpay
    const paymentDoc = await Payment.create({
      orderId: order._id,
      userId: order.userId,
      amount: order.total,
      status: "paid",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    // 4. Update the Order to store this payment’s ObjectId and set status = "inProgress"
    order.status = "inProgress";
    order.paymentId = paymentDoc._id;
    await order.save();

    // 5. Run post-payment logic (inventory updates, user.cart → pastOrders, vendor.activeOrders, etc.)
    await orderUtils.postPaymentProcessing(order);

    return res.json({
      success: true,
      message:
        "Payment successful, Payment record created, and order processed.",
    });
  } catch (err) {
    console.error("Error in verifyPaymentHandler:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  verifyPaymentHandler,
};
