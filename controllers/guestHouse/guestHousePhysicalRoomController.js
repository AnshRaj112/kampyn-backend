const GuestHousePhysicalRoom = require("../../models/account/GuestHousePhysicalRoom");
const GuestHouse = require("../../models/account/GuestHouse");
const GuestHouseRoom = require("../../models/account/GuestHouseRoom");
const GuestHouseRoomBooking = require("../../models/account/GuestHouseRoomBooking");
const logger = require("../../utils/pinoLogger");

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

const parseNightStartUtc = (value) => {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

async function occupiedPhysicalIdsForNightRange(guestHouseId, nightStart, nightEnd) {
  const rows = await GuestHouseRoomBooking.find({
    guestHouseId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    checkInDate: { $lt: nightEnd },
    checkOutDate: { $gt: nightStart },
    assignedPhysicalRoomIds: { $exists: true, $ne: [] },
  })
    .select("assignedPhysicalRoomIds")
    .lean();
  const occupied = new Set();
  for (const row of rows) {
    for (const id of row.assignedPhysicalRoomIds || []) {
      occupied.add(id.toString());
    }
  }
  return occupied;
}

async function assertUniGuestHouse(uniId, guestHouseId) {
  return GuestHouse.findOne({ _id: guestHouseId, uniId }).select("_id").lean();
}

async function loadPhysicalRoomForUni(uniId, physicalRoomId) {
  const doc = await GuestHousePhysicalRoom.findById(physicalRoomId).lean();
  if (!doc) return null;
  const ok = await assertUniGuestHouse(uniId, doc.guestHouseId);
  return ok ? doc : null;
}

exports.listPhysicalRoomsForGuestHouse = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!(await assertUniGuestHouse(uniId, guestHouseId))) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const unitsRaw = await GuestHousePhysicalRoom.find({ guestHouseId, isActive: true })
      .populate("roomTypeId", "roomName roomCount price")
      .sort({ floor: 1, unitLabel: 1 })
      .lean();

    let occupiedSet = null;
    let previewNight = null;
    if (req.query.asOfDate !== undefined && req.query.asOfDate !== "") {
      const nightStart = parseNightStartUtc(req.query.asOfDate);
      if (nightStart) {
        const nightEnd = new Date(nightStart.getTime());
        nightEnd.setUTCDate(nightEnd.getUTCDate() + 1);
        occupiedSet = await occupiedPhysicalIdsForNightRange(guestHouseId, nightStart, nightEnd);
        previewNight = { start: nightStart, end: nightEnd };
      }
    }

    const floorsMap = {};
    const typeMap = {};
    let freeOnPreviewNight = 0;
    let busyOnPreviewNight = 0;

    const units = unitsRaw.map((u) => {
      let busyOnPreviewNightFlag = false;
      if (occupiedSet) {
        busyOnPreviewNightFlag = occupiedSet.has(u._id.toString());
        if (busyOnPreviewNightFlag) busyOnPreviewNight += 1;
        else freeOnPreviewNight += 1;
      }
      floorsMap[u.floor] = (floorsMap[u.floor] || 0) + 1;
      const tid = u.roomTypeId?._id?.toString() || "";
      if (!typeMap[tid]) {
        typeMap[tid] = {
          roomTypeId: tid,
          roomName: u.roomTypeId?.roomName || "—",
          count: 0,
        };
      }
      typeMap[tid].count += 1;
      return occupiedSet ? { ...u, busyOnPreviewNight: busyOnPreviewNightFlag } : u;
    });

    const floorsSorted = Object.keys(floorsMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map((floor) => ({ floor, roomsOnFloor: floorsMap[floor] }));

    const summary = {
      totalUnits: units.length,
      floorCount: floorsSorted.length,
      floors: floorsSorted,
      byRoomType: Object.values(typeMap),
    };
    if (occupiedSet && previewNight) {
      summary.previewNight = previewNight;
      summary.freeOnPreviewNight = freeOnPreviewNight;
      summary.busyOnPreviewNight = busyOnPreviewNight;
    }

    return res.json({
      success: true,
      data: {
        summary,
        units,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "listPhysicalRoomsForGuestHouse failed");
    return res.status(500).json({ success: false, message: "Failed to load physical rooms" });
  }
};

exports.createPhysicalRoomForGuestHouse = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    const gh = await GuestHouse.findOne({ _id: guestHouseId, uniId }).select("_id uniId").lean();
    if (!gh) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const { floor, unitLabel, roomTypeId } = req.body;
    const parsedFloor = Number(floor);
    if (!Number.isFinite(parsedFloor)) {
      return res.status(400).json({ success: false, message: "floor must be a number" });
    }
    const label = String(unitLabel || "").trim();
    if (!label) {
      return res.status(400).json({ success: false, message: "unitLabel is required" });
    }
    if (!roomTypeId) {
      return res.status(400).json({ success: false, message: "roomTypeId is required" });
    }

    const roomType = await GuestHouseRoom.findOne({
      _id: roomTypeId,
      guestHouseId,
      uniId,
      isActive: true,
    })
      .select("_id")
      .lean();
    if (!roomType) {
      return res.status(400).json({ success: false, message: "Room type not found for this guest house" });
    }

    const created = await GuestHousePhysicalRoom.create({
      uniId,
      guestHouseId,
      roomTypeId: roomType._id,
      floor: parsedFloor,
      unitLabel: label,
      isActive: true,
    });

    const populated = await GuestHousePhysicalRoom.findById(created._id)
      .populate("roomTypeId", "roomName roomCount price")
      .lean();

    return res.status(201).json({ success: true, message: "Unit added", data: populated });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This guest house already has a unit with that label",
      });
    }
    logger.error({ error: error.message }, "createPhysicalRoomForGuestHouse failed");
    return res.status(500).json({ success: false, message: "Failed to create unit" });
  }
};

exports.updatePhysicalRoom = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { physicalRoomId } = req.params;
    const doc = await loadPhysicalRoomForUni(uniId, physicalRoomId);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    const { floor, unitLabel, roomTypeId, isActive } = req.body;
    const patch = {};

    if (floor !== undefined) {
      const parsedFloor = Number(floor);
      if (!Number.isFinite(parsedFloor)) {
        return res.status(400).json({ success: false, message: "floor must be a number" });
      }
      patch.floor = parsedFloor;
    }
    if (unitLabel !== undefined) {
      const label = String(unitLabel || "").trim();
      if (!label) return res.status(400).json({ success: false, message: "unitLabel cannot be empty" });
      patch.unitLabel = label;
    }
    if (roomTypeId !== undefined) {
      const roomType = await GuestHouseRoom.findOne({
        _id: roomTypeId,
        guestHouseId: doc.guestHouseId,
        uniId,
        isActive: true,
      })
        .select("_id")
        .lean();
      if (!roomType) {
        return res.status(400).json({ success: false, message: "Room type not found for this guest house" });
      }
      patch.roomTypeId = roomType._id;
    }
    if (isActive !== undefined) {
      patch.isActive = Boolean(isActive);
    }

    const updated = await GuestHousePhysicalRoom.findByIdAndUpdate(physicalRoomId, patch, { new: true })
      .populate("roomTypeId", "roomName roomCount price")
      .lean();

    return res.json({ success: true, message: "Unit updated", data: updated });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This guest house already has a unit with that label",
      });
    }
    logger.error({ error: error.message }, "updatePhysicalRoom failed");
    return res.status(500).json({ success: false, message: "Failed to update unit" });
  }
};

exports.deletePhysicalRoom = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { physicalRoomId } = req.params;
    const doc = await loadPhysicalRoomForUni(uniId, physicalRoomId);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    await GuestHousePhysicalRoom.findByIdAndUpdate(physicalRoomId, { isActive: false });
    return res.json({ success: true, message: "Unit removed from inventory" });
  } catch (error) {
    logger.error({ error: error.message }, "deletePhysicalRoom failed");
    return res.status(500).json({ success: false, message: "Failed to delete unit" });
  }
};
