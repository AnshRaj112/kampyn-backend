const mongoose = require("mongoose");
const GuestHouse = require("../../models/account/GuestHouse");
const GuestHouseRoomBooking = require("../../models/account/GuestHouseRoomBooking");
const GuestHouseServiceRequest = require("../../models/account/GuestHouseServiceRequest");
const GuestHouseOpsLog = require("../../models/account/GuestHouseOpsLog");
const logger = require("../../utils/pinoLogger");

const phonesMatch = (stored, input) => {
  const a = String(stored || "").replace(/\D/g, "");
  const b = String(input || "").replace(/\D/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.slice(-10) === b.slice(-10);
};

exports.createServiceRequestPublic = async (req, res) => {
  try {
    const { bookingId, guestPhone, category, priority, description } = req.body;
    if (!bookingId || !guestPhone || !description) {
      return res.status(400).json({ success: false, message: "bookingId, guestPhone and description are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid bookingId" });
    }

    const booking = await GuestHouseRoomBooking.findById(bookingId)
      .select("uniId guestHouseId guestName guestPhone assignedRoomNumbers paymentStatus status")
      .lean();
    if (!booking || booking.paymentStatus !== "paid" || booking.status === "cancelled") {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (!phonesMatch(booking.guestPhone, guestPhone)) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    const guestHouse = await GuestHouse.findById(booking.guestHouseId)
      .select("guestExperienceSettings")
      .lean();
    const settings = guestHouse?.guestExperienceSettings || {};
    if (settings.allowServiceRequests === false) {
      return res.status(403).json({ success: false, message: "This guest house has disabled service requests" });
    }
    if (String(category) === "food" && settings.inRoomFoodEnabled !== true) {
      return res.status(403).json({ success: false, message: "In-room food ordering is not enabled for this guest house" });
    }

    const created = await GuestHouseServiceRequest.create({
      uniId: booking.uniId,
      guestHouseId: booking.guestHouseId,
      bookingId,
      guestName: booking.guestName || "",
      guestPhone: booking.guestPhone || "",
      roomLabel: booking.assignedRoomNumbers || "",
      category: ["housekeeping", "laundry", "maintenance", "food", "transport", "other"].includes(String(category))
        ? String(category)
        : "other",
      priority: ["low", "medium", "high", "urgent"].includes(String(priority)) ? String(priority) : "medium",
      description: String(description).trim().slice(0, 500),
      status: "open",
    });
    try {
      await GuestHouseOpsLog.create({
        uniId: booking.uniId,
        guestHouseId: booking.guestHouseId,
        actorRole: "user",
        actorId: String(booking.guestPhone || ""),
        actionType: "service_request",
        entityType: "GuestHouseServiceRequest",
        entityId: String(created._id),
        message: `Service request created (${created.category})`,
        meta: { priority: created.priority },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log service request create");
    }
    return res.status(201).json({ success: true, message: "Service request created", data: created });
  } catch (error) {
    logger.error({ error: error.message }, "createServiceRequestPublic failed");
    return res.status(500).json({ success: false, message: "Failed to create request" });
  }
};

exports.listServiceRequestsPublic = async (req, res) => {
  try {
    const { bookingId, guestPhone } = req.query;
    if (!bookingId || !guestPhone) {
      return res.status(400).json({ success: false, message: "bookingId and guestPhone are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
      return res.status(400).json({ success: false, message: "Invalid bookingId" });
    }
    const booking = await GuestHouseRoomBooking.findById(bookingId).select("guestPhone paymentStatus status").lean();
    if (!booking || booking.paymentStatus !== "paid" || booking.status === "cancelled") {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (!phonesMatch(booking.guestPhone, guestPhone)) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const rows = await GuestHouseServiceRequest.find({ bookingId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listServiceRequestsPublic failed");
    return res.status(500).json({ success: false, message: "Failed to load requests" });
  }
};

exports.listServiceRequestsForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const status = req.query.status ? String(req.query.status) : "";
    const query = { guestHouseId };
    if (status && ["open", "in_progress", "resolved", "cancelled"].includes(status)) query.status = status;

    const rows = await GuestHouseServiceRequest.find(query).sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listServiceRequestsForManager failed");
    return res.status(500).json({ success: false, message: "Failed to load requests" });
  }
};

exports.updateServiceRequestForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { requestId } = req.params;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid request id" });
    }

    const row = await GuestHouseServiceRequest.findOne({ _id: requestId, guestHouseId });
    if (!row) return res.status(404).json({ success: false, message: "Request not found" });

    const allowedStatuses = ["open", "in_progress", "resolved", "cancelled"];
    if (req.body?.status !== undefined) {
      const nextStatus = String(req.body.status);
      if (!allowedStatuses.includes(nextStatus)) {
        return res.status(400).json({ success: false, message: `status must be one of: ${allowedStatuses.join(", ")}` });
      }
      row.status = nextStatus;
      row.resolvedAt = nextStatus === "resolved" ? new Date() : null;
    }
    if (req.body?.assignedTo !== undefined) row.assignedTo = String(req.body.assignedTo || "").trim().slice(0, 120);
    if (req.body?.etaMinutes !== undefined) {
      const eta = Number(req.body.etaMinutes);
      if (!Number.isFinite(eta) || eta < 0) return res.status(400).json({ success: false, message: "etaMinutes must be non-negative" });
      row.etaMinutes = eta;
    }
    if (req.body?.resolutionNote !== undefined) row.resolutionNote = String(req.body.resolutionNote || "").trim().slice(0, 300);
    if (req.body?.priority !== undefined) {
      const p = String(req.body.priority);
      if (!["low", "medium", "high", "urgent"].includes(p)) return res.status(400).json({ success: false, message: "Invalid priority" });
      row.priority = p;
    }

    await row.save();
    try {
      await GuestHouseOpsLog.create({
        uniId: row.uniId,
        guestHouseId,
        actorRole: "guestHouse",
        actorId: String(guestHouseId),
        actionType: "service_request_update",
        entityType: "GuestHouseServiceRequest",
        entityId: String(row._id),
        message: `Service request updated to ${row.status}`,
        meta: { priority: row.priority },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log service request update");
    }
    return res.json({ success: true, message: "Request updated", data: row });
  } catch (error) {
    logger.error({ error: error.message }, "updateServiceRequestForManager failed");
    return res.status(500).json({ success: false, message: "Failed to update request" });
  }
};

exports.listServiceRequestsForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const exists = await GuestHouse.findOne({ _id: guestHouseId, uniId }).select("_id").lean();
    if (!exists) return res.status(404).json({ success: false, message: "Guest house not found" });

    const rows = await GuestHouseServiceRequest.find({ guestHouseId, uniId })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listServiceRequestsForUni failed");
    return res.status(500).json({ success: false, message: "Failed to load requests" });
  }
};
