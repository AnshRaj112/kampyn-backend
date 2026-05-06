const GuestHouseOpsLog = require("../../models/account/GuestHouseOpsLog");
const GuestHouse = require("../../models/account/GuestHouse");
const logger = require("../../utils/pinoLogger");

exports.listOpsLogsForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const actionType = req.query.actionType ? String(req.query.actionType) : "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const query = { guestHouseId };
    if (actionType) query.actionType = actionType;

    const rows = await GuestHouseOpsLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listOpsLogsForManager failed");
    return res.status(500).json({ success: false, message: "Failed to load logs" });
  }
};

exports.listOpsLogsForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const exists = await GuestHouse.findOne({ _id: guestHouseId, uniId }).select("_id").lean();
    if (!exists) return res.status(404).json({ success: false, message: "Guest house not found" });

    const actionType = req.query.actionType ? String(req.query.actionType) : "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);

    const query = { guestHouseId, uniId };
    if (actionType) query.actionType = actionType;

    const rows = await GuestHouseOpsLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "listOpsLogsForUni failed");
    return res.status(500).json({ success: false, message: "Failed to load logs" });
  }
};

