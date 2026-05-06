const mongoose = require("mongoose");
const GuestHouse = require("../../models/account/GuestHouse");
const GuestHouseRoomBooking = require("../../models/account/GuestHouseRoomBooking");
const GuestHouseFoodItem = require("../../models/account/GuestHouseFoodItem");
const GuestHouseFoodOrder = require("../../models/account/GuestHouseFoodOrder");
const GuestHouseOpsLog = require("../../models/account/GuestHouseOpsLog");
const logger = require("../../utils/pinoLogger");

const phonesMatch = (stored, input) => {
  const a = String(stored || "").replace(/\D/g, "");
  const b = String(input || "").replace(/\D/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.slice(-10) === b.slice(-10);
};

async function assertPublicFoodEnabled(bookingId, guestPhone) {
  const booking = await GuestHouseRoomBooking.findById(bookingId)
    .select("uniId guestHouseId guestName guestPhone assignedRoomNumbers paymentStatus status")
    .lean();
  if (!booking || booking.paymentStatus !== "paid" || booking.status === "cancelled") {
    return { error: { status: 404, message: "Booking not found" } };
  }
  if (!phonesMatch(booking.guestPhone, guestPhone)) {
    return { error: { status: 404, message: "Booking not found" } };
  }
  const guestHouse = await GuestHouse.findById(booking.guestHouseId).select("guestExperienceSettings name").lean();
  const settings = guestHouse?.guestExperienceSettings || {};
  if (settings.inRoomFoodEnabled !== true) {
    return { error: { status: 403, message: "In-room food ordering is not enabled for this guest house" } };
  }
  return { booking, guestHouse, settings };
}

exports.getPublicFoodCatalog = async (req, res) => {
  try {
    const bookingId = String(req.query.bookingId || "");
    const guestPhone = String(req.query.guestPhone || "");
    if (!bookingId || !guestPhone) return res.status(400).json({ success: false, message: "bookingId and guestPhone are required" });
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return res.status(400).json({ success: false, message: "Invalid bookingId" });

    const asserted = await assertPublicFoodEnabled(bookingId, guestPhone);
    if (asserted.error) return res.status(asserted.error.status).json({ success: false, message: asserted.error.message });

    const items = await GuestHouseFoodItem.find({
      guestHouseId: asserted.booking.guestHouseId,
      isAvailable: true,
    })
      .select("_id name category description price imageUrl isAvailable")
      .sort({ category: 1, name: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        guestHouseName: asserted.guestHouse?.name || "",
        menuNote: asserted.settings?.inRoomFoodMenuNote || "",
        items,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "getPublicFoodCatalog failed");
    return res.status(500).json({ success: false, message: "Failed to load catalog" });
  }
};

exports.createPublicFoodOrder = async (req, res) => {
  try {
    const { bookingId, guestPhone, items, notes } = req.body;
    if (!bookingId || !guestPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "bookingId, guestPhone and non-empty items are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) return res.status(400).json({ success: false, message: "Invalid bookingId" });

    const asserted = await assertPublicFoodEnabled(String(bookingId), String(guestPhone));
    if (asserted.error) return res.status(asserted.error.status).json({ success: false, message: asserted.error.message });

    const normalizedIds = items
      .map((i) => ({ itemId: String(i.itemId || ""), qty: Number(i.qty || 0) }))
      .filter((i) => mongoose.Types.ObjectId.isValid(i.itemId) && Number.isFinite(i.qty) && i.qty >= 1);

    if (normalizedIds.length === 0) {
      return res.status(400).json({ success: false, message: "Provide valid items with qty >= 1" });
    }

    const docs = await GuestHouseFoodItem.find({
      _id: { $in: normalizedIds.map((x) => x.itemId) },
      guestHouseId: asserted.booking.guestHouseId,
      isAvailable: true,
    })
      .select("_id name price")
      .lean();

    if (docs.length !== new Set(normalizedIds.map((x) => x.itemId)).size) {
      return res.status(400).json({ success: false, message: "One or more items are unavailable" });
    }

    const map = new Map(docs.map((d) => [String(d._id), d]));
    const lineItems = normalizedIds.map((x) => {
      const doc = map.get(x.itemId);
      const unitPrice = Number(doc.price || 0);
      const qty = x.qty;
      return {
        itemId: doc._id,
        name: doc.name,
        qty,
        unitPrice,
        lineTotal: unitPrice * qty,
      };
    });
    const subtotal = lineItems.reduce((sum, li) => sum + Number(li.lineTotal || 0), 0);

    const created = await GuestHouseFoodOrder.create({
      uniId: asserted.booking.uniId,
      guestHouseId: asserted.booking.guestHouseId,
      bookingId: asserted.booking._id,
      guestName: asserted.booking.guestName || "",
      guestPhone: asserted.booking.guestPhone || "",
      roomLabel: asserted.booking.assignedRoomNumbers || "",
      items: lineItems,
      subtotal,
      notes: String(notes || "").trim().slice(0, 240),
      status: "pending",
    });

    try {
      await GuestHouseOpsLog.create({
        uniId: asserted.booking.uniId,
        guestHouseId: asserted.booking.guestHouseId,
        actorRole: "user",
        actorId: String(asserted.booking.guestPhone || ""),
        actionType: "service_request", // reuse audit bucket for guest actions
        entityType: "GuestHouseFoodOrder",
        entityId: String(created._id),
        message: "In-room food order created",
        meta: { subtotal },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log food order create");
    }

    return res.status(201).json({ success: true, message: "Order placed", data: created });
  } catch (error) {
    logger.error({ error: error.message }, "createPublicFoodOrder failed");
    return res.status(500).json({ success: false, message: "Failed to place order" });
  }
};

exports.listPublicFoodOrders = async (req, res) => {
  try {
    const bookingId = String(req.query.bookingId || "");
    const guestPhone = String(req.query.guestPhone || "");
    if (!bookingId || !guestPhone) return res.status(400).json({ success: false, message: "bookingId and guestPhone are required" });
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return res.status(400).json({ success: false, message: "Invalid bookingId" });

    const booking = await GuestHouseRoomBooking.findById(bookingId).select("guestPhone guestHouseId paymentStatus status").lean();
    if (!booking || booking.paymentStatus !== "paid" || booking.status === "cancelled") {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (!phonesMatch(booking.guestPhone, guestPhone)) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const rows = await GuestHouseFoodOrder.find({ bookingId: booking._id })
      .select("_id items subtotal notes status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listPublicFoodOrders failed");
    return res.status(500).json({ success: false, message: "Failed to load orders" });
  }
};

// =======================
// Manager APIs
// =======================

exports.listFoodItemsForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const rows = await GuestHouseFoodItem.find({ guestHouseId }).sort({ category: 1, name: 1 }).lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listFoodItemsForManager failed");
    return res.status(500).json({ success: false, message: "Failed to load items" });
  }
};

exports.createFoodItemForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const gh = await GuestHouse.findById(guestHouseId).select("_id uniId guestExperienceSettings").lean();
    if (!gh) return res.status(404).json({ success: false, message: "Guest house not found" });
    if (gh.guestExperienceSettings?.inRoomFoodEnabled !== true) {
      return res.status(403).json({ success: false, message: "Enable in-room food in Profile settings first" });
    }

    const { name, category, description, price, isAvailable, imageUrl } = req.body;
    const parsedPrice = Number(price);
    if (!name || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: "name and non-negative price are required" });
    }

    const created = await GuestHouseFoodItem.create({
      uniId: gh.uniId,
      guestHouseId,
      name: String(name).trim(),
      category: String(category || "General").trim().slice(0, 60) || "General",
      description: String(description || "").trim().slice(0, 240),
      price: parsedPrice,
      isAvailable: isAvailable === undefined ? true : isAvailable === true || String(isAvailable) === "true",
      imageUrl: String(imageUrl || "").trim(),
    });

    return res.status(201).json({ success: true, message: "Item created", data: created });
  } catch (error) {
    logger.error({ error: error.message }, "createFoodItemForManager failed");
    return res.status(500).json({ success: false, message: "Failed to create item" });
  }
};

exports.updateFoodItemForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { itemId } = req.params;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!mongoose.Types.ObjectId.isValid(itemId)) return res.status(400).json({ success: false, message: "Invalid item id" });

    const item = await GuestHouseFoodItem.findOne({ _id: itemId, guestHouseId });
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });

    const { name, category, description, price, isAvailable, imageUrl } = req.body;
    if (name !== undefined) item.name = String(name).trim().slice(0, 120);
    if (category !== undefined) item.category = String(category || "General").trim().slice(0, 60) || "General";
    if (description !== undefined) item.description = String(description || "").trim().slice(0, 240);
    if (imageUrl !== undefined) item.imageUrl = String(imageUrl || "").trim();
    if (isAvailable !== undefined) item.isAvailable = isAvailable === true || String(isAvailable) === "true";
    if (price !== undefined) {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 0) return res.status(400).json({ success: false, message: "price must be non-negative" });
      item.price = p;
    }

    await item.save();
    return res.json({ success: true, message: "Item updated", data: item });
  } catch (error) {
    logger.error({ error: error.message }, "updateFoodItemForManager failed");
    return res.status(500).json({ success: false, message: "Failed to update item" });
  }
};

exports.listFoodOrdersForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const status = req.query.status ? String(req.query.status) : "";
    const query = { guestHouseId };
    if (status && ["pending", "accepted", "preparing", "delivered", "cancelled"].includes(status)) query.status = status;
    const rows = await GuestHouseFoodOrder.find(query).sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listFoodOrdersForManager failed");
    return res.status(500).json({ success: false, message: "Failed to load orders" });
  }
};

exports.updateFoodOrderStatusForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { orderId } = req.params;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ success: false, message: "Invalid order id" });

    const order = await GuestHouseFoodOrder.findOne({ _id: orderId, guestHouseId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const next = String(req.body?.status || "");
    const allowed = ["pending", "accepted", "preparing", "delivered", "cancelled"];
    if (!allowed.includes(next)) return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}` });
    order.status = next;
    await order.save();

    return res.json({ success: true, message: "Order updated", data: order });
  } catch (error) {
    logger.error({ error: error.message }, "updateFoodOrderStatusForManager failed");
    return res.status(500).json({ success: false, message: "Failed to update order" });
  }
};

