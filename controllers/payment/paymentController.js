// src/controllers/paymentController.js

const Order = require("../../models/order/Order");
const Payment = require("../../models/order/Payment"); // ← import the Payment model
const orderUtils = require("../../utils/orderUtils");
const paymentUtils = require("../../utils/paymentUtils");
const { atomicCache } = require("../../utils/cacheUtils");
const invoiceUtils = require("../../utils/invoiceUtils");
const { sendVendorNotification } = require("../../services/vendorNotificationHub");
const logger = require("../../utils/pinoLogger");

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

    // 2. Signature is valid → ensure idempotency before creating a new order
    const existingPayment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      status: "paid",
    })
      .select("_id orderId")
      .lean();

    if (existingPayment) {
      const existingOrder =
        (existingPayment.orderId && (await Order.findById(existingPayment.orderId).select("_id orderNumber").lean())) ||
        (orderId && (await Order.findById(orderId).select("_id orderNumber").lean()));

      if (existingOrder) {
        return res.json({
          success: true,
          message: "Payment already verified for this order.",
          orderId: existingOrder._id,
          orderNumber: existingOrder.orderNumber,
          idempotent: true,
        });
      }
    }

    // 3. Signature is valid → create the Order in DB
    // Retrieve order details from temporary storage using razorpay_order_id
    logger.info("🔍 Looking for order details with razorpay_order_id:", razorpay_order_id);
    const orderDetails = orderUtils.getPendingOrderDetails(razorpay_order_id);
    logger.info("🔍 Order details found:", orderDetails ? "YES" : "NO");
    
    if (!orderDetails) {
      logger.error("❌ Order details not found for razorpay_order_id:", razorpay_order_id);
      return res.status(400).json({ 
        success: false, 
        message: "Order details not found. Payment may have expired or order was already processed." 
      });
    }

    const { userId, cart, vendorId, orderType, collectorName, collectorPhone, address, finalTotal } = orderDetails;

    // 4. Create a new Payment document in the payment collection:
    const paymentDoc = await Payment.create({
      userId,
      amount: finalTotal,
      status: "paid",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    // 5. Create the Order in DB (status: inProgress)
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

    // Persist reverse link for idempotent callbacks and support lookups by payment.
    await Payment.updateOne({ _id: paymentDoc._id }, { $set: { orderId: order._id } });

    // 6. Clean up temporary order details
    orderUtils.removePendingOrderDetails(razorpay_order_id);

    // 7. Run post-payment logic (inventory updates, user.cart → pastOrders, vendor.activeOrders, etc.)
    await orderUtils.postPaymentProcessing(order);

    // 8. Notify vendor dashboard to refresh active orders
    try {
      sendVendorNotification(vendorId, "active-order-update", {
        orderId: order._id,
        status: "inProgress"
      });
    } catch (e) {
      logger.warn({ err: e.message }, "Failed to send vendor notification for new order");
    }

    // 9. 🔓 RELEASE LOCKS: After successful payment, release all item locks
    const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, userId);
    
    if (lockReleaseResult.failed.length > 0) {
      console.warn(`Failed to release locks for items: ${lockReleaseResult.failed.join(', ')}`);
    }

    // 10. 📄 Generate invoices for the order
    try {
      // Prepare order data for invoice generation
      const orderDataForInvoice = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        vendorId,
        total: finalTotal,
        orderType: orderType,
        collectorName,
        collectorPhone,
        address,
        items: cart.map(item => ({
          itemId: item.itemId, // Add this field for invoice generation
          name: item.name,
          price: item.price,
          priceExcludingTax: item.priceExcludingTax, // Add price before GST
          quantity: item.quantity,
          kind: item.kind,
          gstPercentage: item.gstPercentage || 0,
          unit: item.unit,
          packable: item.packable
        })),
        packagingCharge: orderDetails.packingCharge || 0,
        deliveryCharge: orderDetails.deliveryCharge || 0
      };

      // Generate invoices asynchronously (don't wait for completion)
      invoiceUtils.generateOrderInvoices(orderDataForInvoice)
        .then(invoiceResults => {
          logger.info('📄 Invoice generation completed:', invoiceResults);
        })
        .catch(error => {
          logger.error('❌ Invoice generation failed:', error);
        });

    } catch (invoiceError) {
      logger.error('❌ Error preparing invoice data:', invoiceError);
      // Don't fail the payment if invoice generation fails
    }

    return res.json({
      success: true,
      message: "Payment successful, Payment record created, and order processed.",
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    logger.error("Error in verifyPaymentHandler:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  verifyPaymentHandler,
};
