const GuestHouse = require("../../models/account/GuestHouse");
const GuestHouseRoom = require("../../models/account/GuestHouseRoom");
const GuestHouseRoomRateRule = require("../../models/account/GuestHouseRoomRateRule");
const GuestHouseOpsLog = require("../../models/account/GuestHouseOpsLog");
const logger = require("../../utils/pinoLogger");

const parseDateOnly = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const normalizePayload = (body) => {
  const startDate = parseDateOnly(body.startDate);
  const endDate = parseDateOnly(body.endDate);
  if (!startDate || !endDate || endDate <= startDate) {
    return { error: "startDate and endDate are required, and endDate must be after startDate" };
  }

  const minNights = Number(body.minNights ?? 1);
  if (!Number.isFinite(minNights) || minNights < 1) {
    return { error: "minNights must be at least 1" };
  }

  let overridePricePerNight = null;
  if (body.overridePricePerNight !== undefined && body.overridePricePerNight !== null && body.overridePricePerNight !== "") {
    const parsedPrice = Number(body.overridePricePerNight);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return { error: "overridePricePerNight must be a non-negative number" };
    }
    overridePricePerNight = parsedPrice;
  }

  return {
    data: {
      startDate,
      endDate,
      overridePricePerNight,
      isBlackout: body.isBlackout === true || String(body.isBlackout) === "true",
      minNights,
      notes: String(body.notes || "").trim().slice(0, 240),
      isActive: body.isActive === undefined ? true : body.isActive === true || String(body.isActive) === "true",
    },
  };
};

exports.listRateRulesForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const roomId = req.query.roomId ? String(req.query.roomId) : "";
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!roomId) return res.status(400).json({ success: false, message: "roomId query param is required" });

    const room = await GuestHouseRoom.findOne({ _id: roomId, uniId }).select("_id").lean();
    if (!room) return res.status(404).json({ success: false, message: "Room not found" });

    const rules = await GuestHouseRoomRateRule.find({ roomId, uniId })
      .sort({ startDate: -1, createdAt: -1 })
      .lean();
    return res.json({ success: true, data: rules });
  } catch (error) {
    logger.error({ error: error.message }, "listRateRulesForUni failed");
    return res.status(500).json({ success: false, message: "Failed to list rate rules" });
  }
};

exports.createRateRuleForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { roomId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const room = await GuestHouseRoom.findOne({ _id: roomId, uniId }).select("_id guestHouseId").lean();
    if (!room) return res.status(404).json({ success: false, message: "Room not found" });

    const normalized = normalizePayload(req.body);
    if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });

    const created = await GuestHouseRoomRateRule.create({
      uniId,
      guestHouseId: room.guestHouseId,
      roomId,
      ...normalized.data,
    });
    try {
      await GuestHouseOpsLog.create({
        uniId,
        guestHouseId: room.guestHouseId,
        actorRole: "uni",
        actorId: String(uniId),
        actionType: "rate_rule_change",
        entityType: "GuestHouseRoomRateRule",
        entityId: String(created._id),
        message: "Rate rule created (uni)",
        meta: { roomId, isBlackout: created.isBlackout },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log uni rate rule create");
    }
    return res.status(201).json({ success: true, message: "Rate rule created", data: created });
  } catch (error) {
    logger.error({ error: error.message }, "createRateRuleForUni failed");
    return res.status(500).json({ success: false, message: "Failed to create rate rule" });
  }
};

exports.updateRateRuleForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { ruleId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const rule = await GuestHouseRoomRateRule.findOne({ _id: ruleId, uniId });
    if (!rule) return res.status(404).json({ success: false, message: "Rule not found" });

    const normalized = normalizePayload(req.body);
    if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });

    Object.assign(rule, normalized.data);
    await rule.save();
    try {
      await GuestHouseOpsLog.create({
        uniId,
        guestHouseId: rule.guestHouseId,
        actorRole: "uni",
        actorId: String(uniId),
        actionType: "rate_rule_change",
        entityType: "GuestHouseRoomRateRule",
        entityId: String(rule._id),
        message: "Rate rule updated (uni)",
        meta: { isBlackout: rule.isBlackout },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log uni rate rule update");
    }
    return res.json({ success: true, message: "Rate rule updated", data: rule });
  } catch (error) {
    logger.error({ error: error.message }, "updateRateRuleForUni failed");
    return res.status(500).json({ success: false, message: "Failed to update rate rule" });
  }
};

exports.deleteRateRuleForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { ruleId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const deleted = await GuestHouseRoomRateRule.findOneAndDelete({ _id: ruleId, uniId });
    if (!deleted) return res.status(404).json({ success: false, message: "Rule not found" });
    try {
      await GuestHouseOpsLog.create({
        uniId,
        guestHouseId: deleted.guestHouseId,
        actorRole: "uni",
        actorId: String(uniId),
        actionType: "rate_rule_change",
        entityType: "GuestHouseRoomRateRule",
        entityId: String(deleted._id),
        message: "Rate rule deleted (uni)",
        meta: { isBlackout: deleted.isBlackout },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log uni rate rule delete");
    }
    return res.json({ success: true, message: "Rate rule deleted" });
  } catch (error) {
    logger.error({ error: error.message }, "deleteRateRuleForUni failed");
    return res.status(500).json({ success: false, message: "Failed to delete rate rule" });
  }
};

exports.listRateRulesForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const roomId = req.query.roomId ? String(req.query.roomId) : "";
    if (!roomId) return res.status(400).json({ success: false, message: "roomId query param is required" });

    const room = await GuestHouseRoom.findOne({ _id: roomId, guestHouseId }).select("_id").lean();
    if (!room) return res.status(404).json({ success: false, message: "Room not found for this guest house" });

    const rules = await GuestHouseRoomRateRule.find({ roomId, guestHouseId }).sort({ startDate: -1, createdAt: -1 }).lean();
    return res.json({ success: true, data: rules });
  } catch (error) {
    logger.error({ error: error.message }, "listRateRulesForManager failed");
    return res.status(500).json({ success: false, message: "Failed to list rate rules" });
  }
};

exports.createRateRuleForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const roomId = String(req.body?.roomId || "");
    if (!roomId) return res.status(400).json({ success: false, message: "roomId is required" });

    const room = await GuestHouseRoom.findOne({ _id: roomId, guestHouseId }).select("_id guestHouseId uniId").lean();
    if (!room) return res.status(404).json({ success: false, message: "Room not found for this guest house" });

    const normalized = normalizePayload(req.body);
    if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });

    const created = await GuestHouseRoomRateRule.create({
      uniId: room.uniId,
      guestHouseId: room.guestHouseId,
      roomId,
      ...normalized.data,
    });
    try {
      await GuestHouseOpsLog.create({
        uniId: room.uniId,
        guestHouseId: room.guestHouseId,
        actorRole: "guestHouse",
        actorId: String(guestHouseId),
        actionType: "rate_rule_change",
        entityType: "GuestHouseRoomRateRule",
        entityId: String(created._id),
        message: "Rate rule created (guesthouse)",
        meta: { roomId, isBlackout: created.isBlackout },
      });
    } catch (e) {
      logger.warn({ error: e?.message }, "Failed to log manager rate rule create");
    }
    return res.status(201).json({ success: true, message: "Rate rule created", data: created });
  } catch (error) {
    logger.error({ error: error.message }, "createRateRuleForManager failed");
    return res.status(500).json({ success: false, message: "Failed to create rate rule" });
  }
};
