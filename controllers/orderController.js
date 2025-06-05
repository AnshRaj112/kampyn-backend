// src/controllers/orderController.js

const orderUtils = require("../utils/orderUtils");

/**
 * POST /orders/:userId
 * We expect the client to send the userId as a URL‐param.
 * E.g. POST http://localhost:5001/orders/6838db6c9e28f2f94e11b9d2
 */
async function placeOrderHandler(req, res) {
  try {
    // Extract the string userId from req.params
    const { userId } = req.params;

    // Now pass that string (e.g. "6838db6c9e28f2f94e11b9d2") into your util
    const { orderId, razorpayOrderOptions } =
      await orderUtils.createOrderForUser(userId);

    return res.status(201).json({
      success: true,
      orderId,
      razorpayOptions: razorpayOrderOptions,
    });
  } catch (err) {
    console.error("Error in placeOrderHandler:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = {
  placeOrderHandler,
};
