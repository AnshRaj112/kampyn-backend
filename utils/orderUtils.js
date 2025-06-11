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

const PRODUCE_SURCHARGE = 5;
const DELIVERY_CHARGE = 50;

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("Missing Razorpay credentials in process.env");
}
const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

async function createOrderForUser({
  userId,
  orderType,
  collectorName,
  collectorPhone,
  address,
}) {
  const user = await User.findById(userId).select("cart vendorId").lean();
  if (!user) throw new Error("User not found");
  if (!user.cart || !user.cart.length) throw new Error("Cart is empty");

  if (!["takeaway", "delivery", "dinein"].includes(orderType)) {
    throw new Error(`Invalid orderType "${orderType}".`);
  }
  if (orderType === "delivery" && (!address || !address.trim())) {
    throw new Error("Address is required for delivery orders.");
  }

  const vendor = await Vendor.findById(user.vendorId)
    .select("retailInventory produceInventory")
    .lean();
  if (!vendor) throw new Error(`Vendor ${user.vendorId} not found.`);

  const retailMap = new Map();
  (vendor.retailInventory || []).forEach((e) =>
    retailMap.set(String(e.itemId), e.quantity)
  );
  const produceMap = new Map();
  (vendor.produceInventory || []).forEach((e) =>
    produceMap.set(String(e.itemId), e.isAvailable)
  );

  const retailIds = [],
    produceIds = [];
  user.cart.forEach(({ itemId, kind }) => {
    if (kind === "Retail") retailIds.push(itemId);
    else if (kind === "Produce") produceIds.push(itemId);
  });

  const [retailDocs, produceDocs] = await Promise.all([
    Retail.find({ _id: { $in: retailIds } })
      .select("price")
      .lean(),
    Produce.find({ _id: { $in: produceIds } })
      .select("price")
      .lean(),
  ]);
  const retailPriceMap = new Map(
    retailDocs.map((d) => [String(d._id), d.price])
  );
  const producePriceMap = new Map(
    produceDocs.map((d) => [String(d._id), d.price])
  );

  let baseTotal = 0,
    totalProduceUnits = 0;
  const itemsForOrder = [];

  for (const { itemId, kind, quantity } of user.cart) {
    const key = String(itemId);
    if (kind === "Retail") {
      const avail = retailMap.get(key) ?? 0;
      if (avail < quantity)
        throw new Error(`Insufficient stock for Retail item ${itemId}.`);
      const price = retailPriceMap.get(key);
      if (price == null)
        throw new Error(`Retail item ${itemId} missing price.`);
      baseTotal += price * quantity;
    } else {
      const avail = produceMap.get(key);
      if (avail !== "Y")
        throw new Error(`Produce item ${itemId} not available.`);
      const price = producePriceMap.get(key);
      if (price == null)
        throw new Error(`Produce item ${itemId} missing price.`);
      baseTotal += price * quantity;
      totalProduceUnits += quantity;
    }
    itemsForOrder.push({ itemId, kind, quantity });
  }

  let finalTotal = baseTotal;
  if (orderType !== "dinein")
    finalTotal += totalProduceUnits * PRODUCE_SURCHARGE;
  if (orderType === "delivery") finalTotal += DELIVERY_CHARGE;

  const newOrder = await Order.create({
    userId,
    orderType,
    collectorName,
    collectorPhone,
    items: itemsForOrder,
    total: finalTotal,
    address: orderType === "delivery" ? address : "",
    reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    status: "pendingPayment",
    vendorId: user.vendorId,
  });

  const receiptId = newOrder._id.toString();
  const razorpayOrder = await razorpay.orders.create({
    amount: finalTotal * 100,
    currency: "INR",
    receipt: receiptId,
    payment_capture: 1,
  });

  return {
    orderId: newOrder._id,
    razorpayOptions: {
      key: razorpayKeyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      order_id: razorpayOrder.id,
    },
  };
}

async function verifyAndProcessPaymentWithOrderId({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  ourOrderId,
}) {
  const order = await Order.findById(ourOrderId)
    .select("items userId vendorId")
    .lean();
  if (!order) throw new Error("Order not found");

  const generatedSig = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSig !== razorpay_signature) {
    await Order.updateOne(
      { _id: ourOrderId },
      { $set: { status: "failedPayment" } }
    );
    return { success: false, msg: "Invalid signature, payment failed" };
  }

  await Order.updateOne(
    { _id: ourOrderId },
    { $set: { status: "inProgress" } }
  );
  await postPaymentProcessing(order);
  return { success: true, msg: "Payment verified and processed" };
}

async function postPaymentProcessing(orderDoc) {
  const { _id: orderId, items, userId, vendorId } = orderDoc;

  // Vendor inventory bulk updates
  const bulkOps = items.map(({ itemId, kind, quantity }) => {
    if (kind === "Retail") {
      return {
        updateOne: {
          filter: {
            _id: vendorId,
            "retailInventory.itemId": itemId,
            "retailInventory.quantity": { $gte: quantity },
          },
          update: { $inc: { "retailInventory.$.quantity": -quantity } },
        },
      };
    } else {
      return {
        updateOne: {
          filter: {
            _id: vendorId,
            "produceInventory.itemId": itemId,
            "produceInventory.isAvailable": "Y",
          },
          update: { $set: { "produceInventory.$.isAvailable": "Y" } },
        },
      };
    }
  });
  if (bulkOps.length) await Vendor.bulkWrite(bulkOps);

  // InventoryReport upsert + update
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Preload vendor inventory for openingQty
  const invVendor = await Vendor.findById(vendorId)
    .select("retailInventory")
    .lean();
  const vendorRetailMap = new Map(
    (invVendor.retailInventory || []).map((e) => [String(e.itemId), e.quantity])
  );

  let invReport = await InventoryReport.findOneAndUpdate(
    {
      vendorId,
      date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
    },
    { $setOnInsert: { date: new Date() } },
    { upsert: true, new: true }
  ).lean();

  const retailMap = new Map(
    (invReport.retailEntries || []).map((e) => [String(e.item), e])
  );
  const produceMap = new Map(
    (invReport.produceEntries || []).map((e) => [String(e.item), e])
  );
  const updatedRetail = invReport.retailEntries || [];
  const updatedProduce = invReport.produceEntries || [];

  for (const { itemId, kind, quantity } of items) {
    const key = String(itemId);
    if (kind === "Retail") {
      if (retailMap.has(key)) {
        const e = retailMap.get(key);
        e.soldQty += quantity;
        e.closingQty -= quantity;
      } else {
        const openingQty = (vendorRetailMap.get(key) || 0) + quantity;
        updatedRetail.push({
          item: new mongoose.Types.ObjectId(itemId),
          openingQty,
          soldQty: quantity,
          closingQty: openingQty - quantity,
        });
      }
    } else {
      if (produceMap.has(key)) {
        produceMap.get(key).soldQty += quantity;
      } else {
        updatedProduce.push({
          item: new mongoose.Types.ObjectId(itemId),
          soldQty: quantity,
        });
      }
    }
  }

  await InventoryReport.updateOne(
    { _id: invReport._id },
    { $set: { retailEntries: updatedRetail, produceEntries: updatedProduce } }
  );

  // Update user and vendor
  await User.updateOne(
    { _id: userId },
    { $push: { activeOrders: orderId }, $set: { cart: [], vendorId: null } }
  );
  await Vendor.updateOne(
    { _id: vendorId },
    { $push: { activeOrders: orderId } }
  );
}

/**
 * Fetches all in-progress orders for a vendor (and optional type),
 * populating item details *in two queries* instead of N per-item calls.
 */
async function getOrdersWithDetails(vendorId, orderType) {
  // 1) Fetch the orders
  const filter = {
    vendorId,
    status: { $in: ["completed", "inProgress"] },
  };

  if (orderType) filter.orderType = orderType;
  const orders = await Order.find(filter, {
    orderType: 1,
    status: 1,
    collectorName: 1,
    collectorPhone: 1,
    items: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (orders.length === 0) return [];

  // 2) Gather all itemIds by kind
  const retailIds = new Set();
  const produceIds = new Set();
  orders.forEach((o) =>
    o.items.forEach(({ itemId, kind }) =>
      (kind === "Retail" ? retailIds : produceIds).add(itemId.toString())
    )
  );

  // 3) Batch-fetch details in parallel
  const [retails, produces] = await Promise.all([
    Retail.find({ _id: { $in: [...retailIds] } }, "name price unit").lean(),
    Produce.find({ _id: { $in: [...produceIds] } }, "name price unit").lean(),
  ]);

  // 4) Build lookup maps
  const retailMap = Object.fromEntries(
    retails.map((r) => [r._id.toString(), r])
  );
  const produceMap = Object.fromEntries(
    produces.map((p) => [p._id.toString(), p])
  );

  // 5) Assemble each order’s detailed items
  return orders.map((order) => {
    const detailedItems = order.items.map(({ itemId, kind, quantity }) => {
      const key = itemId.toString();
      const doc = kind === "Retail" ? retailMap[key] : produceMap[key];
      return {
        name: doc.name,
        price: doc.price,
        unit: doc.unit,
        type: kind.toLowerCase(),
        quantity,
      };
    });

    return {
      orderId: order._id,
      orderType: order.orderType,
      status: order.status,
      createdAt: order.createdAt,
      collectorName: order.collectorName,
      collectorPhone: order.collectorPhone,
      items: detailedItems,
    };
  });
}

module.exports = {
  createOrderForUser,
  verifyAndProcessPaymentWithOrderId,
  postPaymentProcessing,
  getOrdersWithDetails,
};
