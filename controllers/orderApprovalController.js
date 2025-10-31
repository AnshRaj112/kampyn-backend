// src/controllers/orderApprovalController.js
// NEW FILE: Handles order approval workflow - vendor accept/deny orders

const Order = require("../models/order/Order");
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const orderUtils = require("../utils/orderUtils");
const mongoose = require("mongoose");

/**
 * POST /order-approval/submit/:userId
 * Submit order for vendor approval (without payment)
 */
exports.submitOrderForApproval = async (req, res) => {
  try {
    const { userId } = req.params;
    const { orderType, collectorName, collectorPhone, address } = req.body;

    // Basic validation
    if (!orderType || !collectorName || !collectorPhone) {
      return res.status(400).json({
        success: false,
        message: "orderType, collectorName, and collectorPhone are required.",
      });
    }

    // Create order with pendingVendorApproval status
    // This uses similar logic to generateRazorpayOrderForUser but without payment
    const result = await orderUtils.createOrderForApproval({
      userId,
      orderType,
      collectorName,
      collectorPhone,
      address,
    });

    return res.status(201).json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      vendorId: result.vendorId,
      orderType: result.orderType,
      collectorName: result.collectorName,
      collectorPhone: result.collectorPhone,
      address: result.address,
      finalTotal: result.finalTotal,
      status: "pendingVendorApproval",
    });
  } catch (err) {
    console.error("Error in submitOrderForApproval:", err);
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: "Order number already exists. Please try again.",
        errorType: "DUPLICATE_ORDER_NUMBER"
      });
    }
    
    return res.status(400).json({ 
      success: false, 
      message: err && err.message ? err.message : 'Unknown error occurred' 
    });
  }
};

/**
 * GET /order-approval/status/:orderId
 * Check order approval status (for polling)
 */
exports.getOrderApprovalStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID is required." 
      });
    }

    const order = await Order.findById(orderId).lean();
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found." 
      });
    }

    return res.json({
      success: true,
      orderId: order._id,
      status: order.status,
      denialReason: order.denialReason || null,
      createdAt: order.createdAt,
    });
  } catch (err) {
    console.error("Error in getOrderApprovalStatus:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error." 
    });
  }
};

/**
 * POST /order-approval/:orderId/accept
 * Vendor accepts an order request
 */
exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { vendorId } = req.body; // Vendor ID for verification

    if (!orderId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "Order ID and Vendor ID are required.",
      });
    }

    // Find order and verify vendor
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (order.vendorId.toString() !== vendorId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to accept this order.",
      });
    }

    // Only pendingVendorApproval orders can be accepted
    if (order.status !== "pendingVendorApproval") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be accepted. Current status: ${order.status}`,
      });
    }

    // Update order status to inProgress (order accepted, now in active orders)
    order.status = "inProgress";
    await order.save();

    // Clear user's cart and add order to activeOrders
    // CHANGED: Now clears cart when order is accepted by vendor (previously cart was cleared during payment)
    await User.updateOne(
      { _id: order.userId },
      { 
        $addToSet: { activeOrders: order._id },
        $set: { cart: [], vendorId: null } // Clear cart after order acceptance
      }
    );

    // Add order to vendor's activeOrders
    await Vendor.updateOne(
      { _id: order.vendorId },
      { $addToSet: { activeOrders: order._id } }
    );

    return res.json({
      success: true,
      message: "Order accepted successfully.",
      orderId: order._id,
      status: order.status,
    });
  } catch (err) {
    console.error("Error in acceptOrder:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error." 
    });
  }
};

/**
 * POST /order-approval/:orderId/deny
 * Vendor denies an order request
 */
exports.denyOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { vendorId, denialReason } = req.body;

    if (!orderId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "Order ID and Vendor ID are required.",
      });
    }

    // Find order and verify vendor
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (order.vendorId.toString() !== vendorId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to deny this order.",
      });
    }

    // Only pendingVendorApproval orders can be denied
    if (order.status !== "pendingVendorApproval") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be denied. Current status: ${order.status}`,
      });
    }

    // Update order status to denied
    order.status = "denied";
    order.denialReason = denialReason || "Item not available"; // Default reason
    await order.save();

    // Release item locks if they exist
    try {
      const { atomicCache } = require("../utils/cacheUtils");
      atomicCache.releaseOrderLocks(order.items, order.userId);
    } catch (lockError) {
      console.error("Error releasing locks:", lockError);
      // Continue even if lock release fails
    }

    return res.json({
      success: true,
      message: "Order denied successfully.",
      orderId: order._id,
      status: order.status,
      denialReason: order.denialReason,
    });
  } catch (err) {
    console.error("Error in denyOrder:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error." 
    });
  }
};

/**
 * GET /order-approval/pending/:vendorId
 * Get all pending approval orders for a vendor
 */
exports.getPendingApprovalOrders = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID is required.",
      });
    }

    // Verify vendor exists
    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found.",
      });
    }

    // Fetch pending approval orders with details
    const orders = await orderUtils.getOrdersWithDetails(
      vendorId,
      null, // orderType filter (null = all types)
      "pendingVendorApproval" // status filter
    );

    return res.json({
      success: true,
      vendorId: vendor._id,
      vendorName: vendor.fullName,
      orders, // array of { orderId, orderType, status, collectorName, collectorPhone, items, total, etc. }
    });
  } catch (err) {
    console.error("Error in getPendingApprovalOrders:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server error." 
    });
  }
};

