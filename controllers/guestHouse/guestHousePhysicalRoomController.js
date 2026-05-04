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

async function buildPhysicalRoomsResponse(guestHouseId, asOfDateQuery) {
  const unitsRaw = await GuestHousePhysicalRoom.find({ guestHouseId, isActive: true })
    .populate("roomTypeId", "roomName roomCount price")
    .sort({ floor: 1, unitLabel: 1 })
    .lean();

  let occupiedSet = null;
  let previewNight = null;
  if (asOfDateQuery !== undefined && asOfDateQuery !== "") {
    const nightStart = parseNightStartUtc(asOfDateQuery);
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
    const tid = u.roomTypeId?._id?.toString() || "__unassigned__";
    const roomName = u.roomTypeId?.roomName || "Unassigned";
    if (!typeMap[tid]) {
      typeMap[tid] = {
        roomTypeId: tid === "__unassigned__" ? null : tid,
        roomName,
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

  return { summary, units };
}

async function loadPhysicalRoomOwnedByGuestHouse(guestHouseId, physicalRoomId) {
  return GuestHousePhysicalRoom.findOne({ _id: physicalRoomId, guestHouseId }).lean();
}

async function runGenerateLayout({ uniId, guestHouseId, floors }) {
  if (!Array.isArray(floors) || floors.length === 0) {
    return { error: { status: 400, message: "floors must be a non-empty array of { floor, roomsOnFloor }" } };
  }

  let createdNew = 0;
  let skippedActive = 0;
  let reactivated = 0;

  for (const spec of floors) {
    const f = Number(spec.floor);
    const n = Number(spec.roomsOnFloor);
    if (!Number.isFinite(f) || f < -5 || f > 200) {
      return { error: { status: 400, message: "Each floor must be a number between -5 and 200" } };
    }
    if (!Number.isFinite(n) || n < 1 || n > 120) {
      return { error: { status: 400, message: "roomsOnFloor must be between 1 and 120 per floor" } };
    }

    for (let i = 1; i <= n; i += 1) {
      const unitLabel = `${f}-${String(i).padStart(2, "0")}`;
      const existing = await GuestHousePhysicalRoom.findOne({ guestHouseId, unitLabel }).select("_id isActive").lean();
      if (existing) {
        if (!existing.isActive) {
          await GuestHousePhysicalRoom.updateOne(
            { _id: existing._id },
            { $set: { isActive: true, roomTypeId: null, housekeepingStatus: "ready" } }
          );
          reactivated += 1;
        } else {
          skippedActive += 1;
        }
        continue;
      }

      await GuestHousePhysicalRoom.create({
        uniId,
        guestHouseId,
        floor: f,
        unitLabel,
        roomTypeId: null,
        isActive: true,
        notes: "",
        housekeepingStatus: "ready",
      });
      createdNew += 1;
    }
  }

  return { ok: true, createdNew, skippedActive, reactivated };
}

/** Uni — Floor Plan: campus floor index and/or sellable room category */
exports.updatePhysicalRoomPlanForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId, physicalRoomId } = req.params;
    if (!(await assertUniGuestHouse(uniId, guestHouseId))) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const gh = await GuestHouse.findById(guestHouseId).select("uniId").lean();
    if (!gh) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const { floor, roomTypeId } = req.body;
    const patch = {};

    if (floor !== undefined && floor !== null && floor !== "") {
      const parsedFloor = Number(floor);
      if (!Number.isFinite(parsedFloor) || parsedFloor < -5 || parsedFloor > 200) {
        return res.status(400).json({ success: false, message: "floor must be a number between -5 and 200" });
      }
      patch.floor = parsedFloor;
    }

    if (roomTypeId !== undefined) {
      if (roomTypeId === null || roomTypeId === "") {
        patch.roomTypeId = null;
      } else {
        const roomType = await GuestHouseRoom.findOne({
          _id: roomTypeId,
          guestHouseId,
          uniId: gh.uniId,
          isActive: true,
        })
          .select("_id")
          .lean();
        if (!roomType) {
          return res.status(400).json({ success: false, message: "Room type not found for this guest house" });
        }
        patch.roomTypeId = roomType._id;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, message: "Provide floor and/or roomTypeId to update" });
    }

    const doc = await GuestHousePhysicalRoom.findOne({
      _id: physicalRoomId,
      guestHouseId,
      isActive: true,
    })
      .select("_id")
      .lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    const updated = await GuestHousePhysicalRoom.findByIdAndUpdate(physicalRoomId, patch, { new: true })
      .populate("roomTypeId", "roomName roomCount price")
      .lean();

    return res.json({ success: true, message: "Floor plan updated", data: updated });
  } catch (error) {
    logger.error({ error: error.message }, "updatePhysicalRoomPlanForUni failed");
    return res.status(500).json({ success: false, message: "Failed to update physical room" });
  }
};

exports.generatePhysicalRoomLayoutForUni = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!(await assertUniGuestHouse(uniId, guestHouseId))) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const gh = await GuestHouse.findById(guestHouseId).select("_id uniId").lean();
    if (!gh) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const result = await runGenerateLayout({
      uniId: gh.uniId,
      guestHouseId,
      floors: req.body.floors,
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    return res.status(201).json({
      success: true,
      message: `Created ${result.createdNew} new slot(s). Reactivated ${result.reactivated}. Skipped ${result.skippedActive} (label already active).`,
      data: {
        createdNew: result.createdNew,
        skippedActive: result.skippedActive,
        reactivated: result.reactivated,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "generatePhysicalRoomLayoutForUni failed");
    return res.status(500).json({ success: false, message: "Failed to generate layout" });
  }
};

/** Uni: read-only snapshot for CRM visibility */
exports.listPhysicalRoomsForGuestHouse = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!(await assertUniGuestHouse(uniId, guestHouseId))) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const { summary, units } = await buildPhysicalRoomsResponse(guestHouseId, req.query.asOfDate);

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

/** Guest house JWT — same payload as uni GET */
exports.listPhysicalRoomsForGuestHouseManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const exists = await GuestHouse.findById(guestHouseId).select("_id").lean();
    if (!exists) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const { summary, units } = await buildPhysicalRoomsResponse(guestHouseId, req.query.asOfDate);

    return res.json({
      success: true,
      data: {
        summary,
        units,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "listPhysicalRoomsForGuestHouseManager failed");
    return res.status(500).json({ success: false, message: "Failed to load physical rooms" });
  }
};

exports.listRoomTypesForGuestHouseManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const rooms = await GuestHouseRoom.find({ guestHouseId, isActive: true })
      .select("_id roomName")
      .sort({ roomName: 1 })
      .lean();

    return res.json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    logger.error({ error: error.message }, "listRoomTypesForGuestHouseManager failed");
    return res.status(500).json({ success: false, message: "Failed to load room types" });
  }
};

exports.generatePhysicalRoomLayoutForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const gh = await GuestHouse.findById(guestHouseId).select("_id uniId").lean();
    if (!gh) {
      return res.status(404).json({ success: false, message: "Guest house not found" });
    }

    const result = await runGenerateLayout({
      uniId: gh.uniId,
      guestHouseId,
      floors: req.body.floors,
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    return res.status(201).json({
      success: true,
      message: `Created ${result.createdNew} new slot(s). Reactivated ${result.reactivated}. Skipped ${result.skippedActive} (label already active).`,
      data: {
        createdNew: result.createdNew,
        skippedActive: result.skippedActive,
        reactivated: result.reactivated,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "generatePhysicalRoomLayoutForManager failed");
    return res.status(500).json({ success: false, message: "Failed to generate layout" });
  }
};

exports.createPhysicalRoomForGuestHouseManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const gh = await GuestHouse.findById(guestHouseId).select("_id uniId").lean();
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

    let resolvedRoomTypeId = null;
    if (roomTypeId) {
      const roomType = await GuestHouseRoom.findOne({
        _id: roomTypeId,
        guestHouseId,
        uniId: gh.uniId,
        isActive: true,
      })
        .select("_id")
        .lean();
      if (!roomType) {
        return res.status(400).json({ success: false, message: "Room type not found for this guest house" });
      }
      resolvedRoomTypeId = roomType._id;
    }

    const created = await GuestHousePhysicalRoom.create({
      uniId: gh.uniId,
      guestHouseId,
      roomTypeId: resolvedRoomTypeId,
      floor: parsedFloor,
      unitLabel: label,
      isActive: true,
      notes: "",
      housekeepingStatus: "ready",
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
    logger.error({ error: error.message }, "createPhysicalRoomForGuestHouseManager failed");
    return res.status(500).json({ success: false, message: "Failed to create unit" });
  }
};

exports.updatePhysicalRoomForGuestHouseManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { physicalRoomId } = req.params;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doc = await loadPhysicalRoomOwnedByGuestHouse(guestHouseId, physicalRoomId);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    const { unitLabel, isActive, notes, housekeepingStatus } = req.body;
    const patch = {};

    if (unitLabel !== undefined) {
      const label = String(unitLabel || "").trim();
      if (!label) return res.status(400).json({ success: false, message: "unitLabel cannot be empty" });
      patch.unitLabel = label;
    }
    if (notes !== undefined) {
      patch.notes = String(notes ?? "").trim().slice(0, 500);
    }
    if (housekeepingStatus !== undefined) {
      const allowed = ["ready", "dirty", "maintenance", "blocked"];
      const h = String(housekeepingStatus);
      if (!allowed.includes(h)) {
        return res.status(400).json({ success: false, message: `housekeepingStatus must be one of: ${allowed.join(", ")}` });
      }
      patch.housekeepingStatus = h;
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
    logger.error({ error: error.message }, "updatePhysicalRoomForGuestHouseManager failed");
    return res.status(500).json({ success: false, message: "Failed to update unit" });
  }
};

exports.deletePhysicalRoomForGuestHouseManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { physicalRoomId } = req.params;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doc = await loadPhysicalRoomOwnedByGuestHouse(guestHouseId, physicalRoomId);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    await GuestHousePhysicalRoom.findByIdAndUpdate(physicalRoomId, { isActive: false });
    return res.json({ success: true, message: "Unit removed from inventory" });
  } catch (error) {
    logger.error({ error: error.message }, "deletePhysicalRoomForGuestHouseManager failed");
    return res.status(500).json({ success: false, message: "Failed to delete unit" });
  }
};
