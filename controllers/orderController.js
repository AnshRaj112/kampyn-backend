// src/controllers/orderController.js

const orderUtils = require("../utils/orderUtils");
const Vendor = require("../models/account/Vendor");
const User = require("../models/account/User");
const Order = require("../models/order/Order");
/**
 * POST /orders/:userId
 * Expects:
 *   URL param:  userId
 *   Body JSON:
 *     {
 *       orderType:       "takeaway" | "delivery" | "dinein",
 *       collectorName:   String,
 *       collectorPhone:  String,
 *       address?:        String   // required if orderType === "delivery"
 *     }
 */
exports.placeOrderHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    const { orderType, collectorName, collectorPhone, address } = req.body;

    // Basic validation: ensure those fields exist
    if (!orderType || !collectorName || !collectorPhone) {
      return res.status(400).json({
        success: false,
        message:
          "orderType, collectorName, and collectorPhone are required in the request body.",
      });
    }

    // Call createOrderForUser with the new signature
    const { orderId, razorpayOptions } = await orderUtils.createOrderForUser({
      userId,
      orderType,
      collectorName,
      collectorPhone,
      address, // may be undefined if not delivery
    });

    return res.status(201).json({
      success: true,
      orderId,
      razorpayOptions,
    });
  } catch (err) {
    console.error("Error in placeOrderHandler:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /orders/active/:vendorId/:orderType?
 */
exports.getActiveOrders = async (req, res) => {
  try {
    const { vendorId, orderType } = req.params;

    // 1) Fetch vendor name
    const vendor = await Vendor.findById(vendorId, "fullName").lean();
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    // 2) Fetch all matching orders + item details
    const orders = await orderUtils.getOrdersWithDetails(vendorId, orderType);

    // 3) Return combined payload
    return res.json({
      vendorId: vendor._id,
      vendorName: vendor.fullName,
      orders, // array of { orderId, orderType, status, collectorName, collectorPhone, items }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * PATCH /orders/:orderId/complete
 */
exports.completeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await Order.findOneAndUpdate(
      { _id: orderId, status: "inProgress" }, // only target in-progress
      { $set: { status: "completed" } }, // only update status
      { new: true } // return the updated doc
    );

    if (!result) {
      return res
        .status(400)
        .json({ message: "No active in-progress order found." });
    }

    return res.json({ message: "Order marked as completed." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * PATCH /orders/:orderId/deliver
 */
exports.deliverOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1) flip status
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "completed" },
      { $set: { status: "delivered" } },
      { new: true }
    );

    if (!order) {
      return res.status(400).json({ message: "No completed order found." });
    }

    // 2) move in User doc
    await User.updateOne(
      { _id: order.userId },
      {
        $pull: { activeOrders: order._id },
        $push: { pastOrders: order._id },
      }
    );

    return res.json({ message: "Order delivered and user records updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
};
