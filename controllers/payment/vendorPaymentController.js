const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../../models/order/Order");
const Payment = require("../../models/order/Payment");
const User = require("../../models/account/User");
const Vendor = require("../../models/account/Vendor");
const orderUtils = require("../../utils/orderUtils");
const logger = require("../../utils/pinoLogger");
// const invoiceUtils = require("../utils/invoiceUtils");

// Initialize Razorpay
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("Missing Razorpay credentials in process.env");
}

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

// Temporary storage for vendor order details during payment flow
const pendingVendorOrderDetails = new Map();

/**
 * POST /vendor-payment/create-order
 * Create Razorpay order for vendor guest orders
 */
exports.createVendorRazorpayOrder = async (req, res) => {
  try {
    const {
      vendorId,
      items,
      total,
      collectorName,
      collectorPhone,
      orderType,
    } = req.body;

    // Basic validation
    if (!vendorId || !items || !total || !collectorName || !collectorPhone || !orderType) {
      return res.status(400).json({
        success: false,
        message: "vendorId, items, total, collectorName, collectorPhone, and orderType are required.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array must not be empty.",
      });
    }

    // Check if vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found.",
      });
    }

    // Validate orderType
    if (!["dinein", "takeaway"].includes(orderType)) {
      return res.status(400).json({
        success: false,
        message: "orderType must be either 'dinein' or 'takeaway'.",
      });
    }

    // Validate amount
    const amountInPaise = Math.round(total * 100);
    if (amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount.",
      });
    }

    logger.info("💳 Creating Razorpay order for vendor guest order:", {
      vendorId,
      total,
      amountInPaise,
      collectorName,
      collectorPhone,
      orderType,
      itemsCount: items.length
    });

    // Generate Razorpay order
    const receipt = `vendor-${Date.now()}-${vendorId.slice(-6)}`;
    
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: receipt,
      payment_capture: 1,
    });

    logger.info("💳 Razorpay order created:", {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });

    // Store order details for payment verification
    pendingVendorOrderDetails.set(razorpayOrder.id, {
      vendorId,
      items,
      total,
      collectorName,
      collectorPhone,
      orderType,
      timestamp: Date.now()
    });

    // Clean up old entries (older than 30 minutes)
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    for (const [key, value] of pendingVendorOrderDetails.entries()) {
      if (value.timestamp < thirtyMinutesAgo) {
        pendingVendorOrderDetails.delete(key);
      }
    }

    res.json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt
    });
  } catch (error) {
    logger.error("❌ Error creating vendor Razorpay order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order"
    });
  }
};

/**
 * POST /vendor-payment/verify
 * Verify vendor payment and create order
 */
exports.verifyVendorPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    logger.info("🔍 Verifying vendor payment:", {
      razorpay_order_id,
      razorpay_payment_id
    });

    // 1. Validate the Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      logger.error("❌ Invalid Razorpay signature");
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed.",
      });
    }

    // 2. Get order details from temporary storage
    const orderDetails = pendingVendorOrderDetails.get(razorpay_order_id);
    if (!orderDetails) {
      logger.error("❌ Order details not found for razorpay_order_id:", razorpay_order_id);
      return res.status(400).json({
        success: false,
        message: "Order details not found. Payment may have expired or order was already processed.",
      });
    }

    const { vendorId, items, total, collectorName, collectorPhone, orderType } = orderDetails;

    // 3. Check if vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found.",
      });
    }

    // 4. Check if user exists with the provided phone number
    let userId = null;
    let isNewUser = false;
    const existingUser = await User.findOne({ phone: collectorPhone });
    
    if (existingUser) {
      userId = existingUser._id;
    } else {
      // Create a guest user account
      const guestUser = new User({
        fullName: collectorName,
        phone: collectorPhone,
        email: `guest_${Date.now()}@kiitbites.com`, // Temporary email
        password: "guest_password", // Temporary password
        type: "user-standard",
        isVerified: true,
        uniID: vendor.uniID,
      });
      
      const savedGuestUser = await guestUser.save();
      userId = savedGuestUser._id;
      isNewUser = true;
    }

    // 5. Create Payment document
    const paymentDoc = await Payment.create({
      userId,
      amount: total,
      status: "paid",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    // 6. Generate order number
    const orderNumber = await orderUtils.generateOrderNumber(userId, vendorId);

    // 7. Create the order
    const newOrder = await Order.create({
      orderNumber,
      userId,
      orderType: orderType,
      paymentMethod: "upi",
      collectorName,
      collectorPhone,
      items: items.map(item => ({
        itemId: item.itemId,
        kind: item.kind,
        quantity: item.quantity
      })),
      total,
      status: "inProgress", // Start as in progress since payment is successful
      vendorId,
      isGuest: true,
      paymentId: paymentDoc._id,
    });

    // 8. Update user and vendor
    if (existingUser) {
      await User.findByIdAndUpdate(userId, {
        $push: { activeOrders: newOrder._id }
      });
    }

    await Vendor.findByIdAndUpdate(vendorId, {
      $push: { activeOrders: newOrder._id }
    });

    // 9. Clean up temporary order details
    pendingVendorOrderDetails.delete(razorpay_order_id);

    // 📄 Generate invoices for the vendor order
    try {
      // Get item details for invoice generation
      const populatedItems = await Promise.all(
        items.map(async (item) => {
          const itemModel = item.kind === 'Retail' ? require('../models/item/Retail') : require('../models/item/Produce');
          const itemDoc = await itemModel.findById(item.itemId);
          return {
            itemId: item.itemId, // Add itemId for reference
            name: itemDoc?.name || 'Unknown Item',
            price: itemDoc?.price || 0,
            quantity: item.quantity,
            kind: item.kind,
            packable: itemDoc?.packable || false,
            gstPercentage: itemDoc?.gstPercentage || 0,
            sgstPercentage: itemDoc?.sgstPercentage || 0,
            cgstPercentage: itemDoc?.cgstPercentage || 0,
            hsnCode: itemDoc?.hsnCode || 'N/A',
            unit: itemDoc?.unit || 'piece'
          };
        })
      );

      // Prepare order data for invoice generation
      const orderDataForInvoice = {
        orderId: newOrder._id,
        orderNumber: newOrder.orderNumber,
        vendorId: vendor._id,
        total: total,
        orderType: orderType,
        collectorName,
        collectorPhone,
        address: 'KIIT University Campus',
        items: populatedItems,
        packagingCharge: 0,
        deliveryCharge: 0
      };

      // Generate invoices asynchronously (don't wait for completion)
      const invoiceUtils = require('../utils/invoiceUtils');
      invoiceUtils.generateOrderInvoices(orderDataForInvoice)
        .then(invoiceResults => {
          logger.info('📄 Vendor order invoice generation completed:', invoiceResults);
        })
        .catch(error => {
          logger.error('❌ Vendor order invoice generation failed:', error);
        });

    } catch (invoiceError) {
      logger.error('❌ Error preparing vendor order invoice data:', invoiceError);
      // Don't fail the payment if invoice generation fails
    }

    logger.info("✅ Vendor payment verified and order created:", {
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
      isNewUser
    });

    return res.json({
      success: true,
      message: "Payment successful and order created.",
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
      isNewUser,
    });

  } catch (error) {
    logger.error("❌ Error in verifyVendorPayment:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error"
    });
  }
};

/**
 * GET /vendor-payment/key
 * Get Razorpay public key
 */
exports.getRazorpayKey = async (req, res) => {
  try {
    res.json({
      success: true,
      key: razorpayKeyId
    });
  } catch (error) {
    logger.error("❌ Error getting Razorpay key:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get Razorpay key"
    });
  }
}; 