// src/controllers/orderController.js

const orderUtils = require("../utils/orderUtils");

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
async function placeOrderHandler(req, res) {
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
}

module.exports = {
  placeOrderHandler,
};
