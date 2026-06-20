const Review = require("../../models/order/Review");
const Order = require("../../models/order/Order");
const Vendor = require("../../models/account/Vendor");
const Retail = require("../../models/item/Retail");
const Produce = require("../../models/item/Produce");
const mongoose = require("mongoose");
const logger = require("../../utils/pinoLogger");

// Create or update a review for an order by the same user
exports.upsertReview = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user?.userId || req.body.userId; // fallback if middleware not used

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating must be 1-5" });
    }

    const order = await Order.findOne({ _id: orderId, tenantId: req.tenantId }).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (String(order.userId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Not your order" });
    }
    if (order.status !== "delivered" && order.status !== "completed") {
      return res.status(400).json({ success: false, message: "You can review completed/delivered orders only" });
    }

    // Resolve uniId from vendor if possible
    let resolvedUniId = req.body.uniId;
    try {
      if (order.vendorId) {
        const vendor = await Vendor.findOne({ _id: order.vendorId, tenantId: req.tenantId }).lean();
        if (vendor?.uniID) {
          resolvedUniId = vendor.uniID;
        }
      }
    } catch (e) {
      // ignore, fallback to provided uniId
    }

    // Check if review already exists to prevent duplicates
    const existingReview = await Review.findOne({ orderId: order._id, userId, tenantId: req.tenantId }).lean();
    if (existingReview) {
      return res.status(400).json({ success: false, message: "You have already reviewed this order" });
    }

    const payload = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId,
      vendorId: order.vendorId,
      uniId: resolvedUniId || req.tenantId,
      tenantId: req.tenantId,
      rating,
      comment: comment || "",
    };

    const review = await Review.create(payload);

    return res.json({ success: true, data: review });
  } catch (err) {
    logger.error("upsertReview error", err);
    return res.status(500).json({ success: false, message: "Failed to submit review" });
  }
};

// Get reviews visible to a university with order/vendor details
exports.listReviewsForUniversity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Query reviews scoped by tenantId
    const reviews = await Review.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    if (!reviews.length) {
      return res.json({ success: true, data: [] });
    }

    const orderIds = reviews.map((r) => r.orderId).filter(Boolean);
    const vendorIds = reviews.map((r) => r.vendorId).filter(Boolean);

    // Fetch related orders and vendors
    const [orders, vendors] = await Promise.all([
      Order.find({ _id: { $in: orderIds }, tenantId: req.tenantId }).lean(),
      Vendor.find({ _id: { $in: vendorIds }, tenantId: req.tenantId }).lean(),
    ]);

    const orderMap = Object.fromEntries(orders.map((o) => [String(o._id), o]));
    const vendorMap = Object.fromEntries(vendors.map((v) => [String(v._id), v]));

    // Construct final results, skipping items where order/vendor isn't resolved (mimics aggregate unwind behavior)
    const results = [];
    reviews.forEach((review) => {
      const order = orderMap[String(review.orderId)];
      const vendor = vendorMap[String(review.vendorId)];
      if (order && vendor) {
        results.push({
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          orderNumber: review.orderNumber,
          vendorName: vendor.fullName,
          orderSummary: {
            total: order.total,
            items: order.items,
            orderType: order.orderType,
            createdAt: order.createdAt,
          },
        });
      }
    });

    // Enrich item details with names and units
    const retailIds = new Set();
    const produceIds = new Set();
    results.forEach((r) => {
      const items = r?.orderSummary?.items || [];
      items.forEach((it) => {
        if (it?.itemId && it?.kind === "Retail") retailIds.add(String(it.itemId));
        if (it?.itemId && it?.kind === "Produce") produceIds.add(String(it.itemId));
      });
    });

    const [retails, produces] = await Promise.all([
      Retail.find({ _id: { $in: [...retailIds] }, tenantId: req.tenantId }, "name price unit").lean(),
      Produce.find({ _id: { $in: [...produceIds] }, tenantId: req.tenantId }, "name price unit").lean(),
    ]);
    const retailMap = Object.fromEntries(retails.map((r) => [String(r._id), r]));
    const produceMap = Object.fromEntries(produces.map((p) => [String(p._id), p]));

    const enriched = results.map((r) => {
      const items = (r?.orderSummary?.items || []).map((it) => {
        const key = String(it.itemId);
        const meta = it.kind === "Retail" ? retailMap[key] : produceMap[key];
        return {
          itemId: it.itemId,
          kind: it.kind,
          quantity: it.quantity,
          name: meta?.name || "Item",
          price: meta?.price ?? undefined,
          unit: meta?.unit || undefined,
        };
      });
      return {
        ...r,
        items,
      };
    });

    return res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error("listReviewsForUniversity error", err);
    return res.status(500).json({ success: false, message: "Failed to fetch reviews" });
  }
};

// Get one review by orderId for the user (to show/edit state)
exports.getMyReviewForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId || req.query.userId;
    const review = await Review.findOne({ orderId, userId, tenantId: req.tenantId }).lean();
    return res.json({ success: true, data: review || null });
  } catch (err) {
    logger.error("getMyReviewForOrder error", err);
    return res.status(500).json({ success: false, message: "Failed to fetch review" });
  }
};


