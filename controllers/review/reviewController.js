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

    const order = await Order.findById(orderId).lean();
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
        const vendor = await Vendor.findById(order.vendorId).lean();
        if (vendor?.uniID) {
          resolvedUniId = vendor.uniID;
        }
      }
    } catch (e) {
      // ignore, fallback to provided uniId
    }

    const payload = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId,
      vendorId: order.vendorId,
      uniId: resolvedUniId,
      rating,
      comment: comment || "",
    };

    const review = await Review.findOneAndUpdate(
      { orderId: order._id, userId },
      { $set: payload },
      { new: true, upsert: true }
    ).lean();

    return res.json({ success: true, data: review });
  } catch (err) {
    logger.error("upsertReview error", err);
    return res.status(500).json({ success: false, message: "Failed to submit review" });
  }
};

// Get reviews visible to a university with order/vendor details
exports.listReviewsForUniversity = async (req, res) => {
  try {
    const { uniId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const pipeline = [
      { $match: { uniId: new mongoose.Types.ObjectId(uniId) } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: "$vendor" },
      {
        $project: {
          rating: 1,
          comment: 1,
          createdAt: 1,
          orderNumber: 1,
          vendorName: "$vendor.fullName",
          orderSummary: {
            total: "$order.total",
            items: "$order.items",
            orderType: "$order.orderType",
            createdAt: "$order.createdAt",
          },
        },
      },
    ];

    const ReviewModel = Review; // access model connection
    const results = await ReviewModel.aggregate(pipeline);

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
      Retail.find({ _id: { $in: [...retailIds] } }, "name price unit").lean(),
      Produce.find({ _id: { $in: [...produceIds] } }, "name price unit").lean(),
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
    const review = await Review.findOne({ orderId, userId }).lean();
    return res.json({ success: true, data: review || null });
  } catch (err) {
    logger.error("getMyReviewForOrder error", err);
    return res.status(500).json({ success: false, message: "Failed to fetch review" });
  }
};


