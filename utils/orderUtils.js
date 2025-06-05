// src/utils/orderUtils.js

const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");

const Order = require("../models/order/Order");
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const InventoryReport = require("../models/inventory/InventoryReport");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");

// Load Razorpay instance from config
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("Missing Razorpay credentials in process.env");
}

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

/**
 * 1. Create a Razorpay order, create our Order document (status = "pendingPayment").
 * 2. Return { orderId, razorpayOrderOptions } so client can open checkout.
 */

async function createOrderForUser(userId) {
  // 1. Fetch user + their cart
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");

  if (!user.cart || user.cart.length === 0) {
    throw new Error("Cart is empty");
  }

  // 2. Calculate total: for each cart item, fetch price from Retail or Produce
  let totalAmount = 0;
  const itemsForOrder = [];
  for (const cartItem of user.cart) {
    const { itemId, kind, quantity } = cartItem;
    let price;
    if (kind === "Retail") {
      const retailDoc = await Retail.findById(itemId).select("price");
      if (!retailDoc) throw new Error(`Retail item ${itemId} not found`);
      price = retailDoc.price;
    } else if (kind === "Produce") {
      const produceDoc = await Produce.findById(itemId).select("price");
      if (!produceDoc) throw new Error(`Produce item ${itemId} not found`);
      price = produceDoc.price;
    } else {
      throw new Error("Unknown cart item kind");
    }
    totalAmount += price * quantity;
    itemsForOrder.push({ itemId, kind, quantity });
  }

  // 3. Create our own Order document **first**, so we can use its _id as the receipt
  const newOrder = await Order.create({
    userId,
    orderType: "delivery",
    collectorName: user.fullName,
    collectorPhone: user.phone,
    items: itemsForOrder,
    total: totalAmount,
    address: user.address || "",
    reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    status: "pendingPayment",
    vendorId: user.vendorId,
  });

  // 4. Build a short `receipt` string under 40 characters:
  //    - Using newOrder._id (24 chars) is safe:
  const receiptId = newOrder._id.toString(); // e.g. "6838db6c9e28f2f94e11b9d2"

  // 5. Create Razorpay order (amount is in paise)
  const razorpayOrder = await razorpay.orders.create({
    amount: totalAmount * 100, // e.g. ₹250 → 25000 paise
    currency: "INR",
    receipt: receiptId,
    payment_capture: 1,
  });

  // 6. Return info to client
  return {
    orderId: newOrder._id,
    razorpayOrderOptions: {
      key: razorpayKeyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: "My FoodApp",
      description: "Order Payment",
      order_id: razorpayOrder.id,
      prefill: {
        name: user.fullName,
        email: user.email,
        contact: user.phone,
      },
      notes: {
        orderId: newOrder._id.toString(),
      },
      theme: { color: "#F37254" },
    },
  };
}

/**
 * 1. Verify Razorpay signature.
 * 2. Update Order.status = "failedPayment" if invalid.
 * 3. If valid: call postPaymentProcessing()
 */
async function verifyAndProcessPayment({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  // 1. Fetch razorpay_order_id from our DB based on notes or store razorpayOrderId in Order?
  //    We assume client passed `orderId` in notes. Let’s re‐derive it:
  // In this example, we trust notes.orderId
  // But Razorpay does NOT send `notes` to webhook by default. So your client must post back: {razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId}.

  // For clarity, assume the function signature is:
  //    verifyAndProcessPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature, ourOrderId })

  // Let caller provide ourOrderId explicitly:
  // e.g.: const order = await Order.findById(ourOrderId);
  //       if (!order) throw new Error("Order not found");

  throw new Error("Deprecated: call verifyAndProcessPaymentWithOrderId()");
}

async function verifyAndProcessPaymentWithOrderId({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  ourOrderId,
}) {
  const order = await Order.findById(ourOrderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // 1. Build signature string: `${razorpay_order_id}|${razorpay_payment_id}`
  const generatedSig = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSig !== razorpay_signature) {
    // Invalid payment → mark order failed, save, return error
    order.status = "failedPayment";
    await order.save();
    return {
      success: false,
      msg: "Invalid signature, payment verification failed",
    };
  }

  // 2. Payment is valid:
  order.status = "inProgress";
  order.paymentId = razorpay_payment_id;
  await order.save();

  // 3. Now do all the “post‐payment” updates:
  //    a) update Vendor inventory
  //    b) update InventoryReport
  //    c) update User (clear cart, move to pastOrders)
  //    d) update Vendor.activeOrders
  await postPaymentProcessing(order);

  return { success: true, msg: "Payment verified and processed" };
}

/**
 * Performs all cluster‐specific updates after successful payment.
 */
async function postPaymentProcessing(orderDoc) {
  const sessionOrder = orderDoc; // already saved with status = inProgress

  // 1. Update Vendor inventory & add to vendor.activeOrders
  const vendor = await Vendor.findById(sessionOrder.vendorId);
  if (!vendor) throw new Error("Vendor not found");

  // For each item in the order:
  for (const lineItem of sessionOrder.items) {
    const { itemId, kind, quantity } = lineItem;

    if (kind === "Retail") {
      // Decrement vendor.retailInventory.$.quantity by `quantity` atomically
      await Vendor.updateOne(
        {
          _id: vendor._id,
          "retailInventory.itemId": itemId,
          "retailInventory.quantity": { $gte: quantity },
        },
        { $inc: { "retailInventory.$.quantity": -quantity } }
      );
      // Note: you may want to check the result to ensure matchCount === 1,
      // else you had insufficient stock. For now, we assume enough stock.
    } else if (kind === "Produce") {
      // Mark produceInventory.isAvailable = "N" (assuming one‐time availability)
      await Vendor.updateOne(
        {
          _id: vendor._id,
          "produceInventory.itemId": itemId,
          "produceInventory.isAvailable": "Y",
        },
        { $set: { "produceInventory.$.isAvailable": "N" } }
      );
    }
    // If you also have `Raw` items (for inventoryReport.rawEntries), handle them similarly.
  }

  // 2. Update or create today’s InventoryReport for this vendor:
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);

  let invReport = await InventoryReport.findOne({
    vendorId: vendor._id,
    date: {
      $gte: todayAtMidnight,
      $lt: new Date(todayAtMidnight.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  if (!invReport) {
    invReport = await InventoryReport.create({
      vendorId: vendor._id,
      date: new Date(),
    });
  }

  // Build maps for easy lookups:
  const retailMap = new Map();
  invReport.retailEntries.forEach((entry) =>
    retailMap.set(entry.item.toString(), entry)
  );

  const produceMap = new Map();
  invReport.produceEntries.forEach((entry) =>
    produceMap.set(entry.item.toString(), entry)
  );

  // For each sold item, update `soldQty` (and opening/closing if needed)
  for (const { itemId, kind, quantity } of sessionOrder.items) {
    if (kind === "Retail") {
      const key = itemId.toString();
      if (retailMap.has(key)) {
        retailMap.get(key).soldQty += quantity;
        retailMap.get(key).closingQty -= quantity;
      } else {
        // First sale of this item today: fetch current vendor inventory to set openingQty
        const vendorDoc = await Vendor.findOne(
          { _id: vendor._id, "retailInventory.itemId": itemId },
          { "retailInventory.$": 1 }
        );
        const currentQty = vendorDoc.retailInventory[0].quantity + quantity; // before we subtracted
        invReport.retailEntries.push({
          item: itemId,
          openingQty: currentQty,
          soldQty: quantity,
          closingQty: currentQty - quantity,
        });
      }
    } else if (kind === "Produce") {
      const key = itemId.toString();
      if (produceMap.has(key)) {
        produceMap.get(key).soldQty += quantity;
      } else {
        invReport.produceEntries.push({
          item: itemId,
          soldQty: quantity,
        });
      }
    }
    // (If you want rawEntries: handle similarly.)
  }

  await invReport.save();

  // 3. Update User: clear cart, move order to pastOrders
  const user = await User.findById(sessionOrder.userId);
  if (!user) throw new Error("User not found for post‐payment");

  // Remove from activeOrders if it was ever added (in create step we didn't add)
  // Push into pastOrders array:
  user.pastOrders.push(sessionOrder._id);
  user.cart = []; // clear cart completely
  // If you had a field activeOrders for user, you could remove it from there:
  // user.activeOrders = user.activeOrders.filter(o => o.toString() !== sessionOrder._id.toString());
  await user.save();

  // 4. Update Vendor.activeOrders
  vendor.activeOrders.push(sessionOrder._id);
  await vendor.save();

  // Done.
}

module.exports = {
  createOrderForUser,
  verifyAndProcessPaymentWithOrderId,
  postPaymentProcessing,
};
