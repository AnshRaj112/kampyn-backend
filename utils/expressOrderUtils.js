// src/utils/expressOrderUtils.js

const mongoose = require("mongoose");
const Order = require("../models/order/Order");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");
const Payment = require("../models/order/Payment");
const { getCartDetails } = require("./cartUtils");
const {
  generateUltraHighPerformanceOrderNumberWithDailyReset,
  postPaymentProcessing,
} = require("./orderUtils");

const EXPRESS_EXPIRATION_MINUTES = 36;
const DEFAULT_PRODUCE_SURCHARGE = 5;
const DEFAULT_DELIVERY_CHARGE = 50;

/**
 * Fetch vendor’s packing & delivery charges from its Uni
 */
async function getVendorCharges(vendorId) {
  const vendor = await Vendor.findById(vendorId).select("uniID").lean();
  if (!vendor) throw new Error("getVendorCharges: Vendor not found");

  const uni = await Uni.findById(vendor.uniID)
    .select("packingCharge deliveryCharge")
    .lean();

  return {
    packingCharge: uni?.packingCharge ?? DEFAULT_PRODUCE_SURCHARGE,
    deliveryCharge: uni?.deliveryCharge ?? DEFAULT_DELIVERY_CHARGE,
  };
}

/**
 * 1) Create an express order (no online payment)
 */
async function initiateExpressOrder({
  userId,
  vendorId,
  orderType,
  collectorName,
  collectorPhone,
  address,
}) {
  if (!userId) throw new Error("initiateExpressOrder: userId is required");
  if (!vendorId) throw new Error("initiateExpressOrder: vendorId is required");

  // Fetch & validate cart
  const { cart: populatedCart } = await getCartDetails(userId);
  if (!Array.isArray(populatedCart)) {
    throw new Error("initiateExpressOrder: cart must be an array");
  }
  if (populatedCart.length === 0) {
    throw new Error("initiateExpressOrder: Cart is empty");
  }

  // Validate type & address
  if (!["takeaway", "delivery", "dinein"].includes(orderType)) {
    throw new Error(`initiateExpressOrder: Invalid orderType "${orderType}"`);
  }
  if (orderType === "delivery" && !address?.trim()) {
    throw new Error("initiateExpressOrder: Address required for delivery");
  }

  // Calculate totals
  let itemTotal = 0;
  let packableCount = 0;
  populatedCart.forEach((it) => {
    const line = (it.price || 0) * (it.quantity || 0);
    itemTotal += line;
    if (it.packable || it.kind === "Produce") {
      packableCount += it.quantity;
    }
  });

  // Get charges
  const { packingCharge, deliveryCharge } = await getVendorCharges(vendorId);
  const packaging = orderType !== "dinein" ? packableCount * packingCharge : 0;
  const delivery = orderType === "delivery" ? deliveryCharge : 0;
  const finalTotal = itemTotal + packaging + delivery;

  // Expiration timestamp
  const now = new Date();
  const expires = new Date(now.getTime() + EXPRESS_EXPIRATION_MINUTES * 60000);

  // Generate orderNumber & create
  const orderNumber =
    await generateUltraHighPerformanceOrderNumberWithDailyReset(
      userId,
      vendorId
    );
  const expressOrder = await Order.create({
    orderNumber,
    userId,
    vendorId,
    orderType,
    paymentMethod: "cash",
    orderCategory: "express",
    collectorName,
    collectorPhone,
    items: populatedCart.map((i) => ({
      itemId: i.itemId,
      kind: i.kind,
      quantity: i.quantity,
    })),
    total: finalTotal,
    address: orderType === "delivery" ? address : "",
    reservationExpiresAt: expires,
    status: "pendingPayment",
    isGuest: false,
    deleted: false,
  });

  console.info("✅ ExpressOrder created:", {
    id: expressOrder._id.toString(),
    expires: expressOrder.reservationExpiresAt.toISOString(),
  });

  return expressOrder;
}

/**
 * 2) List pending, unexpired express orders for a vendor
 */
async function getVendorExpressOrders(vendorId) {
  if (!vendorId)
    throw new Error("getVendorExpressOrders: vendorId is required");

  const now = new Date();
  const filter = {
    vendorId,
    orderCategory: "express",
    status: "pendingPayment",
    reservationExpiresAt: { $gt: now },
    deleted: false,
  };
  console.info("🔍 getVendorExpressOrders filter:", filter);

  return Order.find(filter).sort({ createdAt: -1 }).lean();
}

/**
 * 3) Confirm (manual cash payment) an express order
 */
async function confirmExpressOrder(expressOrderId) {
  if (!expressOrderId) {
    throw new Error("confirmExpressOrder: expressOrderId is required");
  }

  // 1) Fetch & validate
  const order = await Order.findById(expressOrderId);
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.orderCategory !== "express") {
    throw new Error("Order is not an express order");
  }
  if (order.status !== "pendingPayment") {
    throw new Error(`Cannot confirm order in status "${order.status}"`);
  }
  if (order.reservationExpiresAt <= new Date()) {
    throw new Error("Express order has expired");
  }

  // 2) Create Payment record (cash)
  const paymentDoc = await Payment.create({
    orderId: order._id,
    userId: order.userId,
    amount: order.total,
    status: "paid",
    paymentMethod: "cash",
  });

  // 3) Update order status & attach payment
  order.status = "inProgress";
  order.paymentId = paymentDoc._id;
  await order.save();

  // 4) Inventory + reports + user/vendor updates
  await postPaymentProcessing({
    _id: order._id,
    items: order.items,
    userId: order.userId,
    vendorId: order.vendorId,
  });

  // 5) Return fresh copy
  return Order.findById(order._id).lean();
}

module.exports = {
  initiateExpressOrder,
  getVendorExpressOrders,
  confirmExpressOrder,
};
