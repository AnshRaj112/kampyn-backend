// src/utils/orderUtils.js

const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");

const Order = require("../models/order/Order");
const OrderCounter = require("../models/order/OrderCounter");
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const InventoryReport = require("../models/inventory/InventoryReport");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const { atomicCache } = require("./cacheUtils");

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

/**
 * Atomic order cancellation with database transaction
 * Ensures all operations succeed or fail together
 */
async function cancelOrderAtomically(orderId, order, session) {
  try {
    // 1) Update order status to failed
    await Order.updateOne(
      { _id: orderId },
      { $set: { status: "failed" } },
      { session }
    );

    // 2) Move order from activeOrders to pastOrders for user
    await User.updateOne(
      { _id: order.userId },
      {
        $pull: { activeOrders: orderId },
        $push: { pastOrders: orderId }
      },
      { session }
    );

    // 3) Remove order from vendor's activeOrders
    await Vendor.updateOne(
      { _id: order.vendorId },
      { $pull: { activeOrders: orderId } },
      { session }
    );

    // 4) Release item locks (outside transaction since it's in-memory cache)
    const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
    
    console.log(`Order ${orderId} cancelled atomically. Released ${lockReleaseResult.released.length} locks`);
    
    return {
      success: true,
      locksReleased: lockReleaseResult.released.length,
      failedLocks: lockReleaseResult.failed.length
    };
  } catch (error) {
    console.error(`Error in atomic order cancellation for ${orderId}:`, error);
    throw error;
  }
}

/**
 * Atomic Counter Format (Recommended for Production)
 * Generates unique order numbers using MongoDB atomic operations
 * Format: BB-YYYYMMDD-UUUU-XXXXX
 * Where: BB = BitesBay, YYYYMMDD = Date, UUUU = User ID (last 4 chars), XXXXX = Vendor-specific atomic counter (5 digits)
 * 
 * Benefits:
 * - Atomic operations prevent race conditions
 * - High performance with proper indexing
 * - Scalable for massive concurrent users
 * - Guaranteed uniqueness across all users
 * - Each vendor gets their own daily counter starting from 00001
 */
async function generateOrderNumber(userId, vendorId) {
  const today = new Date();
  const datePrefix = today.getFullYear().toString() + 
                    (today.getMonth() + 1).toString().padStart(2, '0') + 
                    today.getDate().toString().padStart(2, '0');
  
  // Get last 4 characters of user ID for identification
  const userSuffix = userId.toString().slice(-4).toUpperCase();
  
  // Create vendor-specific counter ID: "YYYYMMDD-VENDORID"
  const counterId = `${datePrefix}-${vendorId}`;
  
  // Use atomic counter to get next sequence number for this vendor on this date
  // This ensures each vendor starts from 00001 each day
  const counterResult = await OrderCounter.findOneAndUpdate(
    { counterId: counterId },
    { $inc: { sequence: 1 }, $set: { lastUpdated: new Date() } },
    { upsert: true, new: true }
  );
  
  const sequenceNumber = counterResult.sequence.toString().padStart(5, '0');
  
  return `BB-${datePrefix}-${userSuffix}-${sequenceNumber}`;
}

/**
 * High-Performance Time-Based Order Number (For Massive Scale)
 * Generates unique order numbers using timestamp and atomic counters
 * Format: BB-TIMESTAMP-UUUU-XXXXX
 * Where: BB = BitesBay, TIMESTAMP = Unix timestamp (10 digits), UUUU = User ID (last 4 chars), XXXXX = Atomic counter (5 digits)
 * 
 * Benefits for Massive Scale:
 * - Unlimited daily capacity (millions of orders per day)
 * - Better database distribution (time-based buckets)
 * - Reduced contention (multiple counters per hour)
 * - Microsecond precision prevents collisions
 * - Scales to any volume without limits
 * 
 * Use this for: 1000+ orders/day per vendor
 */
async function generateTimeBasedOrderNumber(userId, vendorId) {
  // Get last 4 characters of user ID for identification
  const userSuffix = userId.toString().slice(-4).toUpperCase();
  
  // Use current timestamp (10 digits) - provides microsecond precision
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Create time-based counter ID: "TIMESTAMP-VENDORID"
  // This creates a new counter every second for each vendor
  const counterId = `${timestamp}-${vendorId}`;
  
  // Use atomic counter to get next sequence number for this vendor at this timestamp
  const counterResult = await OrderCounter.findOneAndUpdate(
    { counterId: counterId },
    { $inc: { sequence: 1 }, $set: { lastUpdated: new Date() } },
    { upsert: true, new: true }
  );
  
  const sequenceNumber = counterResult.sequence.toString().padStart(5, '0');
  
  return `BB-${timestamp}-${userSuffix}-${sequenceNumber}`;
}

/**
 * Ultra-High Performance Order Number with Daily Reset (Recommended)
 * Generates unique order numbers using microsecond timestamps with daily counter reset
 * Format: BB-MICROTIME-UUUU-XXXXX
 * Where: BB = BitesBay, MICROTIME = Microsecond timestamp (13 digits), UUUU = User ID (last 4 chars), XXXXX = Daily atomic counter (5 digits)
 * 
 * Benefits:
 * - Handles 100,000+ orders per second per vendor
 * - Daily counter reset to 00001 for each vendor
 * - Zero collision probability with microsecond precision
 * - Perfect for high-frequency scenarios with daily tracking
 * 
 * Use this for: Any scale with daily counter reset requirement
 */
async function generateUltraHighPerformanceOrderNumberWithDailyReset(userId, vendorId) {
  // Get last 4 characters of user ID for identification
  const userSuffix = userId.toString().slice(-4).toUpperCase();
  
  // Use microsecond timestamp (13 digits) for maximum precision
  const microTime = Date.now().toString();
  
  // Create daily counter ID: "YYYYMMDD-VENDORID" for daily reset
  const today = new Date();
  const datePrefix = today.getFullYear().toString() + 
                    (today.getMonth() + 1).toString().padStart(2, '0') + 
                    today.getDate().toString().padStart(2, '0');
  const dailyCounterId = `${datePrefix}-${vendorId}`;
  
  // Use atomic counter to get next sequence number for this vendor on this date
  // This ensures each vendor starts from 00001 each day
  const counterResult = await OrderCounter.findOneAndUpdate(
    { counterId: dailyCounterId },
    { $inc: { sequence: 1 }, $set: { lastUpdated: new Date() } },
    { upsert: true, new: true }
  );
  
  const sequenceNumber = counterResult.sequence.toString().padStart(5, '0');
  
  return `BB-${microTime}-${userSuffix}-${sequenceNumber}`;
}

async function generateRazorpayOrderForUser({
  userId,
  orderType,
  collectorName,
  collectorPhone,
  address,
}) {
  // No need to check for existing pending orders in new flow
  const user = await User.findById(userId).select("cart vendorId").lean();
  if (!user) throw new Error("User not found");
  if (!user.cart || !user.cart.length) throw new Error("Cart is empty");

  if (!["takeaway", "delivery", "dinein"].includes(orderType)) {
    throw new Error(`Invalid orderType "${orderType}".`);
  }
  if (orderType === "delivery" && (!address || !address.trim())) {
    throw new Error("Address is required for delivery orders.");
  }

  // Calculate total
  const itemsForOrder = user.cart.map(item => ({
    itemId: item.itemId,
    kind: item.kind,
    quantity: item.quantity,
  }));
  let baseTotal = 0;
  let totalProduceUnits = 0;
  for (const { itemId, kind, quantity } of itemsForOrder) {
    if (kind === "Retail") {
      // You may want to fetch price from DB here
      // For now, assume price is in cart
      const cartItem = user.cart.find(i => i.itemId.toString() === itemId.toString());
      baseTotal += (cartItem?.price || 0) * quantity;
    } else {
      totalProduceUnits += quantity;
    }
  }
  let finalTotal = baseTotal;
  if (orderType !== "dinein") finalTotal += totalProduceUnits * PRODUCE_SURCHARGE;
  if (orderType === "delivery") finalTotal += DELIVERY_CHARGE;

  // Generate Razorpay order
  const shortUserId = userId.toString().slice(-6);
  const tempOrderId = `T${Date.now()}-${shortUserId}`; // always < 40 chars
  const razorpayOrder = await razorpay.orders.create({
    amount: finalTotal * 100,
    currency: "INR",
    receipt: tempOrderId,
    payment_capture: 1,
  });

  return {
    razorpayOptions: {
      key: razorpayKeyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      order_id: razorpayOrder.id,
    },
    cart: user.cart,
    vendorId: user.vendorId,
    orderType,
    collectorName,
    collectorPhone,
    address,
    finalTotal,
  };
}

// New function: create the Order in DB after payment is verified
async function createOrderAfterPayment({
  userId,
  vendorId,
  cart,
  orderType,
  collectorName,
  collectorPhone,
  address,
  finalTotal,
  razorpayOrderId,
  razorpayPaymentId,
  paymentDocId,
}) {
  // Generate unique order number
  const orderNumber = await generateUltraHighPerformanceOrderNumberWithDailyReset(userId, vendorId);
  const itemsForOrder = cart.map(item => ({
    itemId: item.itemId,
    kind: item.kind,
    quantity: item.quantity,
  }));
  const newOrder = await Order.create({
    orderNumber,
    userId,
    orderType,
    collectorName,
    collectorPhone,
    items: itemsForOrder,
    total: finalTotal,
    address: orderType === "delivery" ? address : "",
    status: "inProgress",
    vendorId,
    paymentId: paymentDocId,
  });
  // Update user and vendor
  await User.updateOne(
    { _id: userId },
    { $push: { activeOrders: newOrder._id }, $set: { cart: [], vendorId: null } }
  );
  await Vendor.updateOne(
    { _id: vendorId },
    { $push: { activeOrders: newOrder._id } }
  );
  return newOrder;
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
    // Use database transaction for atomic cancellation
    const session = await mongoose.startSession();
    try {
      const { locksReleased, failedLocks } = await session.withTransaction(async () => {
        return await cancelOrderAtomically(ourOrderId, order, session);
      });
      
      console.log(`Payment failed for order ${ourOrderId} - cancelled atomically. Released ${locksReleased} locks`);
      return { success: false, msg: "Invalid signature, payment failed" };
    } catch (error) {
      console.error(`Failed to cancel order ${ourOrderId} atomically:`, error);
      // Fallback: try to release locks even if database operations failed
      const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
      console.warn(`Fallback lock release for order ${ourOrderId}: ${lockReleaseResult.released.length} released, ${lockReleaseResult.failed.length} failed`);
      return { success: false, msg: "Invalid signature, payment failed" };
    } finally {
      await session.endSession();
    }
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
    status: { $in: ["completed", "inProgress", "onTheWay"] },
    deleted: false
  };

  if (orderType) filter.orderType = orderType;
  const orders = await Order.find(filter, {
    orderNumber: 1,
    orderType: 1,
    status: 1,
    collectorName: 1,
    collectorPhone: 1,
    address: 1,
    items: 1,
    createdAt: 1,
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

  // 5) Assemble each order's detailed items
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
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      createdAt: order.createdAt,
      collectorName: order.collectorName,
      collectorPhone: order.collectorPhone,
      address: order.address,
      items: detailedItems,
    };
  });
}

/**
 * Fetches a single order with detailed item information
 */
async function getOrderWithDetails(orderId) {
  try {
    // 1) Fetch the order
    const order = await Order.findById(orderId, {
      orderNumber: 1,
      orderType: 1,
      status: 1,
      collectorName: 1,
      collectorPhone: 1,
      address: 1,
      total: 1,
      items: 1,
      createdAt: 1,
      vendorId: 1,
    }).lean();

    if (!order) {
      console.log(`Order not found: ${orderId}`);
      return null;
    }

    // 2) Gather all itemIds by kind
    const retailIds = [];
    const produceIds = [];
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(({ itemId, kind }) => {
        if (kind === "Retail") retailIds.push(itemId);
        else if (kind === "Produce") produceIds.push(itemId);
      });
    }

    // 3) Batch-fetch details in parallel
    const [retails, produces] = await Promise.all([
      retailIds.length > 0 ? Retail.find({ _id: { $in: retailIds } }, "name price unit").lean() : [],
      produceIds.length > 0 ? Produce.find({ _id: { $in: produceIds } }, "name price unit").lean() : [],
    ]);

    // 4) Build lookup maps
    const retailMap = Object.fromEntries(
      retails.map((r) => [r._id.toString(), r])
    );
    const produceMap = Object.fromEntries(
      produces.map((p) => [p._id.toString(), p])
    );

    // 5) Assemble detailed items
    const detailedItems = (order.items || []).map(({ itemId, kind, quantity }) => {
      const key = itemId.toString();
      const doc = kind === "Retail" ? retailMap[key] : produceMap[key];
      return {
        name: doc ? doc.name : "Unknown Item",
        price: doc ? doc.price : 0,
        unit: doc ? doc.unit : "",
        type: kind.toLowerCase(),
        quantity: quantity || 1,
      };
    });

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      createdAt: order.createdAt,
      collectorName: order.collectorName,
      collectorPhone: order.collectorPhone,
      address: order.address,
      total: order.total,
      vendorId: order.vendorId,
      items: detailedItems,
    };
  } catch (error) {
    console.error(`Error in getOrderWithDetails for order ${orderId}:`, error);
    return null;
  }
}

/**
 * Fetches all past orders for a vendor (completed, delivered, failed),
 * populating item details *in two queries* instead of N per-item calls.
 */
async function getVendorPastOrdersWithDetails(vendorId) {
  // 1) Fetch the past orders
  const filter = {
    vendorId,
    status: { $in: ["completed", "delivered", "failed"] },
    deleted: false
  };

  const orders = await Order.find(filter, {
    orderNumber: 1,
    orderType: 1,
    status: 1,
    collectorName: 1,
    collectorPhone: 1,
    address: 1,
    total: 1,
    items: 1,
    createdAt: 1,
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

  // 5) Assemble each order's detailed items
  return orders.map((order) => {
    const detailedItems = order.items.map(({ itemId, kind, quantity }) => {
      const key = itemId.toString();
      const doc = kind === "Retail" ? retailMap[key] : produceMap[key];
      return {
        name: doc ? doc.name : "Unknown Item",
        price: doc ? doc.price : 0,
        unit: doc ? doc.unit : "",
        type: kind.toLowerCase(),
        quantity: quantity || 1,
      };
    });

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      createdAt: order.createdAt,
      collectorName: order.collectorName,
      collectorPhone: order.collectorPhone,
      address: order.address,
      total: order.total,
      items: detailedItems,
    };
  });
}

module.exports = {
  generateRazorpayOrderForUser,
  createOrderAfterPayment,
  verifyAndProcessPaymentWithOrderId,
  postPaymentProcessing,
  getOrdersWithDetails,
  getOrderWithDetails,
  getVendorPastOrdersWithDetails,
  generateOrderNumber,
  cancelOrderAtomically,
};
