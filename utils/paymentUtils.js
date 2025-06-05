// src/utils/paymentUtils.js

const crypto = require("crypto");
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

/**
 * Given razorpay_order_id, razorpay_payment_id, razorpay_signature,
 * returns true if valid, false otherwise.
 */
function validateRazorpaySignature({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  const generatedSig = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  return generatedSig === razorpay_signature;
}

module.exports = {
  validateRazorpaySignature,
};
