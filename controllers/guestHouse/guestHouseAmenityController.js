const GuestHouse = require("../../models/account/GuestHouse");
const GuestHousePhysicalRoom = require("../../models/account/GuestHousePhysicalRoom");
const GuestHouseAmenityLedger = require("../../models/account/GuestHouseAmenityLedger");
const GuestHouseOpsLog = require("../../models/account/GuestHouseOpsLog");
const logger = require("../../utils/pinoLogger");

const DEFAULT_ITEMS = ["Toiletries Kit", "Bedsheet", "Blanket", "Pillow Cover", "Towel"];

const toStartOfDayUtc = (value) => {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const normalizeItemName = (value) => String(value || "").trim().slice(0, 80);

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const buildRoomMap = (rooms) => {
  const roomMap = new Map();
  for (const room of rooms) {
    roomMap.set(room._id.toString(), room);
  }
  return roomMap;
};

const listActiveRooms = async (guestHouseId) =>
  GuestHousePhysicalRoom.find({ guestHouseId, isActive: true })
    .select("_id unitLabel floor")
    .sort({ floor: 1, unitLabel: 1 })
    .lean();

const groupLedgerForDate = (ledgerRows) => {
  const grouped = new Map();
  for (const row of ledgerRows) {
    const roomId = row.physicalRoomId.toString();
    if (!grouped.has(roomId)) grouped.set(roomId, []);
    grouped.get(roomId).push(row);
  }
  return grouped;
};

const buildResponsePayload = ({ date, rooms, ledgerRows }) => {
  const roomMap = buildRoomMap(rooms);
  const grouped = groupLedgerForDate(ledgerRows);
  const itemSet = new Set(DEFAULT_ITEMS);

  for (const row of ledgerRows) {
    itemSet.add(row.itemName);
  }

  const allItems = Array.from(itemSet).sort((a, b) => a.localeCompare(b));
  const roomRows = rooms.map((room) => {
    const entriesByItem = new Map();
    const rows = grouped.get(room._id.toString()) || [];
    for (const row of rows) {
      entriesByItem.set(row.itemName, row);
    }

    const entries = allItems.map((itemName) => {
      const row = entriesByItem.get(itemName);
      return {
        physicalRoomId: room._id,
        itemName,
        openingInRoom: row?.openingInRoom || 0,
        openingInLaundry: row?.openingInLaundry || 0,
        takenOutOfRoom: row?.takenOutOfRoom || 0,
        sentToLaundry: row?.sentToLaundry || 0,
        washedAndDried: row?.washedAndDried || 0,
        returnedToRoom: row?.returnedToRoom || 0,
        placedInRoom: row?.placedInRoom || 0,
        notes: row?.notes || "",
        estimatedCurrentInRoom:
          (row?.openingInRoom || 0) - (row?.takenOutOfRoom || 0) - (row?.sentToLaundry || 0) + (row?.returnedToRoom || 0) + (row?.placedInRoom || 0),
        estimatedCurrentInLaundry:
          (row?.openingInLaundry || 0) + (row?.sentToLaundry || 0) - (row?.washedAndDried || 0),
      };
    });

    return {
      physicalRoomId: room._id,
      unitLabel: room.unitLabel,
      floor: room.floor,
      entries,
    };
  });

  const totalsByItem = {};
  for (const row of roomRows) {
    for (const entry of row.entries) {
      if (!totalsByItem[entry.itemName]) {
        totalsByItem[entry.itemName] = {
          itemName: entry.itemName,
          inRooms: 0,
          inLaundry: 0,
          sentToLaundryToday: 0,
          washedAndDriedToday: 0,
        };
      }
      totalsByItem[entry.itemName].inRooms += Math.max(0, entry.estimatedCurrentInRoom);
      totalsByItem[entry.itemName].inLaundry += Math.max(0, entry.estimatedCurrentInLaundry);
      totalsByItem[entry.itemName].sentToLaundryToday += entry.sentToLaundry;
      totalsByItem[entry.itemName].washedAndDriedToday += entry.washedAndDried;
    }
  }

  return {
    date,
    defaultItems: allItems,
    summary: {
      roomCount: rooms.length,
      totalsByItem: Object.values(totalsByItem).sort((a, b) => a.itemName.localeCompare(b.itemName)),
    },
    rooms: roomRows,
  };
};

async function loadTrackerForGuestHouse(guestHouseId, date) {
  const rooms = await listActiveRooms(guestHouseId);
  const roomIds = rooms.map((room) => room._id);
  const ledgerRows = roomIds.length
    ? await GuestHouseAmenityLedger.find({
        guestHouseId,
        recordDate: date,
        physicalRoomId: { $in: roomIds },
      }).lean()
    : [];
  return buildResponsePayload({ date, rooms, ledgerRows });
}

exports.getAmenityTrackerForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const date = toStartOfDayUtc(req.query.date);
    if (!date) return res.status(400).json({ success: false, message: "Invalid date query param" });

    const data = await loadTrackerForGuestHouse(guestHouseId, date);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error({ error: error.message }, "getAmenityTrackerForManager failed");
    return res.status(500).json({ success: false, message: "Failed to load amenities tracker" });
  }
};

exports.updateAmenityTrackerForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const date = toStartOfDayUtc(req.query.date);
    if (!date) return res.status(400).json({ success: false, message: "Invalid date query param" });

    const updates = Array.isArray(req.body?.updates) ? req.body.updates : null;
    if (!updates || updates.length === 0) {
      return res.status(400).json({ success: false, message: "updates must be a non-empty array" });
    }

    const guestHouse = await GuestHouse.findById(guestHouseId).select("_id uniId").lean();
    if (!guestHouse) return res.status(404).json({ success: false, message: "Guest house not found" });

    const activeRooms = await listActiveRooms(guestHouseId);
    const roomMap = buildRoomMap(activeRooms);

    const bulkOps = [];
    for (const entry of updates) {
      const roomId = String(entry.physicalRoomId || "");
      const room = roomMap.get(roomId);
      if (!room) {
        return res.status(400).json({ success: false, message: "One or more physicalRoomId values are invalid" });
      }

      const itemName = normalizeItemName(entry.itemName);
      if (!itemName) {
        return res.status(400).json({ success: false, message: "itemName is required for each update row" });
      }

      const numericFields = [
        "openingInRoom",
        "openingInLaundry",
        "takenOutOfRoom",
        "sentToLaundry",
        "washedAndDried",
        "returnedToRoom",
        "placedInRoom",
      ];

      const setPayload = {
        uniId: guestHouse.uniId,
        guestHouseId,
        physicalRoomId: room._id,
        recordDate: date,
        itemName,
        updatedByRole: "guestHouse",
        notes: String(entry.notes || "").trim().slice(0, 300),
      };

      for (const field of numericFields) {
        if (entry[field] !== undefined) {
          const parsed = toNonNegativeNumber(entry[field]);
          if (parsed === null) {
            return res.status(400).json({ success: false, message: `${field} must be a non-negative number` });
          }
          setPayload[field] = parsed;
        }
      }

      bulkOps.push({
        updateOne: {
          filter: {
            guestHouseId,
            recordDate: date,
            physicalRoomId: room._id,
            itemName,
          },
          update: { $set: setPayload },
          upsert: true,
        },
      });
    }

    if (bulkOps.length) {
      await GuestHouseAmenityLedger.bulkWrite(bulkOps, { ordered: false });
      try {
        await GuestHouseOpsLog.create({
          uniId: guestHouse.uniId,
          guestHouseId,
          actorRole: "guestHouse",
          actorId: String(guestHouseId),
          actionType: "amenity_update",
          entityType: "GuestHouseAmenityLedger",
          entityId: "bulk",
          message: "Amenities tracker updated",
          meta: { date },
        });
      } catch (e) {
        logger.warn({ error: e?.message }, "Failed to log amenity update");
      }
    }

    const data = await loadTrackerForGuestHouse(guestHouseId, date);
    return res.json({
      success: true,
      message: "Amenities tracker updated",
      data,
    });
  } catch (error) {
    logger.error({ error: error.message }, "updateAmenityTrackerForManager failed");
    return res.status(500).json({ success: false, message: "Failed to update amenities tracker" });
  }
};

exports.getAmenityTrackerForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const date = toStartOfDayUtc(req.query.date);
    if (!date) return res.status(400).json({ success: false, message: "Invalid date query param" });

    const guestHouse = await GuestHouse.findOne({ _id: guestHouseId, uniId }).select("_id").lean();
    if (!guestHouse) return res.status(404).json({ success: false, message: "Guest house not found" });

    const data = await loadTrackerForGuestHouse(guestHouseId, date);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error({ error: error.message }, "getAmenityTrackerForUni failed");
    return res.status(500).json({ success: false, message: "Failed to load amenities tracker" });
  }
};
