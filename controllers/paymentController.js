// src/controllers/paymentController.js

const Order = require("../models/order/Order");
const Payment = require("../models/order/Payment"); // ← import the Payment model
const orderUtils = require("../utils/orderUtils");
const paymentUtils = require("../utils/paymentUtils");
const { atomicCache } = require("../utils/cacheUtils");

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
      // If invalid, do not create any order
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed.",
      });
    }

    // 2. Signature is valid → create the Order in DB
    // Retrieve order details from temporary storage using razorpay_order_id
    const orderDetails = orderUtils.getPendingOrderDetails(razorpay_order_id);
    if (!orderDetails) {
      return res.status(400).json({ 
        success: false, 
        message: "Order details not found. Payment may have expired or order was already processed." 
      });
    }

    const { userId, cart, vendorId, orderType, collectorName, collectorPhone, address, finalTotal } = orderDetails;

    // 3. Create a new Payment document in the payment collection:
    const paymentDoc = await Payment.create({
      userId,
      amount: finalTotal,
      status: "paid",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    // 4. Create the Order in DB (status: inProgress)
    const order = await orderUtils.createOrderAfterPayment({
      userId,
      vendorId,
      cart,
      orderType,
      collectorName,
      collectorPhone,
      address,
      finalTotal,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentDocId: paymentDoc._id,
    });

    // 5. Clean up temporary order details
    orderUtils.removePendingOrderDetails(razorpay_order_id);

    // 6. Run post-payment logic (inventory updates, user.cart → pastOrders, vendor.activeOrders, etc.)
    await orderUtils.postPaymentProcessing(order);

    // 🔓 RELEASE LOCKS: After successful payment, release all item locks
    const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, userId);
    
    if (lockReleaseResult.failed.length > 0) {
      console.warn(`Failed to release locks for items: ${lockReleaseResult.failed.join(', ')}`);
    }

    return res.json({
      success: true,
      message: "Payment successful, Payment record created, and order processed.",
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    console.error("Error in verifyPaymentHandler:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  verifyPaymentHandler,
};
