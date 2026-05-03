const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const GuestHouseRoom = require("../../models/account/GuestHouseRoom");
const GuestHousePhysicalRoom = require("../../models/account/GuestHousePhysicalRoom");
const GuestHouseRoomBooking = require("../../models/account/GuestHouseRoomBooking");
const logger = require("../../utils/pinoLogger");
const razorpayConfig = require("../../config/razorpay");
const paymentUtils = require("../../utils/paymentUtils");

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

/** Units allocated on overlapping bookings (excludes excludeBookingId when provided). */
async function getOccupiedPhysicalRoomIdsForRange(guestHouseId, checkInDate, checkOutDate, excludeBookingId) {
  const match = {
    guestHouseId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    checkInDate: { $lt: checkOutDate },
    checkOutDate: { $gt: checkInDate },
    assignedPhysicalRoomIds: { $exists: true, $ne: [] },
  };
  if (excludeBookingId) {
    match._id = { $ne: excludeBookingId };
  }
  const rows = await GuestHouseRoomBooking.find(match).select("assignedPhysicalRoomIds").lean();
  const occupied = new Set();
  for (const row of rows) {
    for (const id of row.assignedPhysicalRoomIds || []) {
      occupied.add(id.toString());
    }
  }
  return occupied;
}

/** In-memory pending Razorpay orders → booking payload (until verified). TTL ~25 min. */
const pendingGuestHousePayments = new Map();
const PENDING_MS = 25 * 60 * 1000;

const razorpay = new Razorpay({
  key_id: razorpayConfig.keyId,
  key_secret: razorpayConfig.keySecret,
});

const parseDateOnly = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const diffNights = (checkInDate, checkOutDate) => {
  const ms = checkOutDate.getTime() - checkInDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const getBookedRoomCountForDateRange = async (roomId, checkInDate, checkOutDate, excludeBookingId = null) => {
  const match = {
    roomId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    checkInDate: { $lt: checkOutDate },
    checkOutDate: { $gt: checkInDate },
  };
  if (excludeBookingId) {
    match._id = { $ne: excludeBookingId };
  }

  const aggregate = await GuestHouseRoomBooking.aggregate([
    { $match: match },
    { $group: { _id: "$roomId", totalBooked: { $sum: "$roomsBooked" } } },
  ]);

  return aggregate[0]?.totalBooked || 0;
};

const validateGuestCounts = (adultsCount, kidsCount) => {
  const adults = Number(adultsCount);
  const kids = Number(kidsCount);
  if (!Number.isFinite(adults) || adults < 0) {
    return { ok: false, message: "adultsCount must be a non-negative number" };
  }
  if (!Number.isFinite(kids) || kids < 0) {
    return { ok: false, message: "kidsCount must be a non-negative number (kids are under 14)" };
  }
  if (adults + kids < 1) {
    return { ok: false, message: "At least one guest (adult or child) is required" };
  }
  return { ok: true, adults, kids };
};

const buildBookingPayload = async (body) => {
  const {
    roomId,
    checkInDate,
    checkOutDate,
    roomsRequested,
    adultsCount,
    kidsCount,
    guestName,
    guestEmail,
    guestPhone,
  } = body;

  if (
    !roomId ||
    !checkInDate ||
    !checkOutDate ||
    roomsRequested === undefined ||
    adultsCount === undefined ||
    kidsCount === undefined ||
    !guestName ||
    !guestPhone
  ) {
    return {
      error: {
        status: 400,
        message:
          "roomId, checkInDate, checkOutDate, roomsRequested, adultsCount, kidsCount, guestName and guestPhone are required",
      },
    };
  }

  const counts = validateGuestCounts(adultsCount, kidsCount);
  if (!counts.ok) {
    return { error: { status: 400, message: counts.message } };
  }

  const parsedCheckInDate = parseDateOnly(checkInDate);
  const parsedCheckOutDate = parseDateOnly(checkOutDate);
  if (!parsedCheckInDate || !parsedCheckOutDate) {
    return { error: { status: 400, message: "Valid checkInDate and checkOutDate are required" } };
  }
  if (parsedCheckOutDate <= parsedCheckInDate) {
    return { error: { status: 400, message: "checkOutDate must be after checkInDate" } };
  }

  const requestedRooms = Number(roomsRequested);
  if (!Number.isFinite(requestedRooms) || requestedRooms < 1) {
    return { error: { status: 400, message: "roomsRequested must be a number greater than 0" } };
  }

  const room = await GuestHouseRoom.findById(roomId).select("uniId guestHouseId roomName roomCount price isActive").lean();
  if (!room || !room.isActive) {
    return { error: { status: 404, message: "Room not found or inactive" } };
  }

  const bookedRooms = await getBookedRoomCountForDateRange(room._id, parsedCheckInDate, parsedCheckOutDate);
  const availableRooms = Math.max(0, (room.roomCount || 0) - bookedRooms);
  if (requestedRooms > availableRooms) {
    return {
      error: {
        status: 400,
        message: `Only ${availableRooms} room(s) are available for selected dates`,
      },
    };
  }

  const nights = diffNights(parsedCheckInDate, parsedCheckOutDate);
  const pricePerNight = Number(room.price || 0);
  const totalPrice = pricePerNight * requestedRooms * nights;

  return {
    payload: {
      room,
      parsedCheckInDate,
      parsedCheckOutDate,
      nights,
      requestedRooms,
      pricePerNight,
      totalPrice,
      adultsCount: counts.adults,
      kidsCount: counts.kids,
      guestName: String(guestName).trim(),
      guestEmail: guestEmail ? String(guestEmail).trim().toLowerCase() : "",
      guestPhone: String(guestPhone).trim(),
    },
  };
};

exports.getRoomAvailability = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { checkInDate, checkOutDate, roomsRequested, adultsCount, kidsCount } = req.query;

    const parsedCheckInDate = parseDateOnly(checkInDate);
    const parsedCheckOutDate = parseDateOnly(checkOutDate);
    if (!parsedCheckInDate || !parsedCheckOutDate) {
      return res.status(400).json({ success: false, message: "Valid checkInDate and checkOutDate are required" });
    }
    if (parsedCheckOutDate <= parsedCheckInDate) {
      return res.status(400).json({ success: false, message: "checkOutDate must be after checkInDate" });
    }

    const room = await GuestHouseRoom.findById(roomId).select("guestHouseId uniId roomName roomCount price isActive").lean();
    if (!room || !room.isActive) {
      return res.status(404).json({ success: false, message: "Room not found or inactive" });
    }

    const requestedRooms = roomsRequested !== undefined ? Number(roomsRequested) : 1;
    if (!Number.isFinite(requestedRooms) || requestedRooms < 1) {
      return res.status(400).json({ success: false, message: "roomsRequested must be a number greater than 0" });
    }

    let guestsSummary = null;
    if (adultsCount !== undefined || kidsCount !== undefined) {
      const aIn = adultsCount === undefined || adultsCount === "" ? 0 : adultsCount;
      const kIn = kidsCount === undefined || kidsCount === "" ? 0 : kidsCount;
      const c = validateGuestCounts(aIn, kIn);
      if (!c.ok) {
        return res.status(400).json({ success: false, message: c.message });
      }
      guestsSummary = { adults: c.adults, kidsUnder14: c.kids };
    }

    const bookedRooms = await getBookedRoomCountForDateRange(room._id, parsedCheckInDate, parsedCheckOutDate);
    const availableRooms = Math.max(0, (room.roomCount || 0) - bookedRooms);
    const nights = diffNights(parsedCheckInDate, parsedCheckOutDate);
    const pricePerNight = Number(room.price || 0);
    const totalPrice = pricePerNight * requestedRooms * nights;

    return res.json({
      success: true,
      data: {
        roomId: room._id,
        roomName: room.roomName,
        checkInDate: parsedCheckInDate,
        checkOutDate: parsedCheckOutDate,
        nights,
        totalRoomsInType: room.roomCount,
        alreadyBookedRooms: bookedRooms,
        availableRooms,
        roomsRequested: requestedRooms,
        guests: guestsSummary,
        canBook: requestedRooms <= availableRooms,
        pricePerNight,
        totalPrice,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch room availability");
    return res.status(500).json({ success: false, message: "Failed to fetch room availability" });
  }
};

/**
 * POST /public/create-payment-order
 * Creates Razorpay order (funds settle per your Razorpay account / Route config).
 * University bank settlement is configured in Razorpay Dashboard (linked accounts / settlements).
 */
exports.createGuestHousePaymentOrder = async (req, res) => {
  try {
    const built = await buildBookingPayload(req.body);
    if (built.error) {
      return res.status(built.error.status).json({ success: false, message: built.error.message });
    }

    const {
      room,
      parsedCheckInDate,
      parsedCheckOutDate,
      nights,
      requestedRooms,
      pricePerNight,
      totalPrice,
      adultsCount,
      kidsCount,
      guestName,
      guestEmail,
      guestPhone,
    } = built.payload;

    if (totalPrice <= 0) {
      return res.status(400).json({ success: false, message: "Invalid total amount for payment" });
    }

    const amountPaise = Math.round(Number(totalPrice) * 100);
    if (amountPaise < 100) {
      return res.status(400).json({ success: false, message: "Minimum payable amount is ₹1" });
    }

    const receipt = `gh_${room._id.toString().slice(-8)}_${Date.now().toString(36)}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: {
        type: "guest_house_room",
        uniId: room.uniId?.toString(),
        roomId: room._id.toString(),
      },
    });

    pendingGuestHousePayments.set(order.id, {
      ...built.payload,
      createdAt: Date.now(),
    });

    return res.json({
      success: true,
      data: {
        razorpayOrderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: razorpayConfig.keyId,
        receipt: order.receipt,
        totalPrice,
        pricePerNight,
        nights,
        roomsBooked: requestedRooms,
        adultsCount,
        kidsCount,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to create guest house payment order");
    return res.status(500).json({ success: false, message: "Failed to create payment order" });
  }
};

/**
 * POST /public/verify-payment
 */
exports.verifyGuestHousePayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
      });
    }

    const valid = paymentUtils.validateRazorpaySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!valid) {
      return res.status(400).json({ success: false, message: "Payment signature verification failed" });
    }

    const pending = pendingGuestHousePayments.get(razorpay_order_id);
    if (!pending) {
      return res.status(400).json({
        success: false,
        message: "Payment session expired or invalid. Please start booking again.",
      });
    }
    if (Date.now() - pending.createdAt > PENDING_MS) {
      pendingGuestHousePayments.delete(razorpay_order_id);
      return res.status(400).json({ success: false, message: "Payment session expired. Please try again." });
    }

    const {
      room,
      parsedCheckInDate,
      parsedCheckOutDate,
      nights,
      requestedRooms,
      pricePerNight,
      totalPrice,
      adultsCount,
      kidsCount,
      guestName,
      guestEmail,
      guestPhone,
    } = pending;

    const bookedRooms = await getBookedRoomCountForDateRange(room._id, parsedCheckInDate, parsedCheckOutDate);
    const availableRooms = Math.max(0, (room.roomCount || 0) - bookedRooms);
    if (requestedRooms > availableRooms) {
      pendingGuestHousePayments.delete(razorpay_order_id);
      return res.status(409).json({
        success: false,
        message:
          "Rooms are no longer available for these dates. If payment was captured, contact support for a refund.",
      });
    }

    const booking = await GuestHouseRoomBooking.create({
      uniId: room.uniId,
      guestHouseId: room.guestHouseId,
      roomId: room._id,
      checkInDate: parsedCheckInDate,
      checkOutDate: parsedCheckOutDate,
      nights,
      roomsBooked: requestedRooms,
      adultsCount,
      kidsCount,
      pricePerNight,
      totalPrice,
      guestName,
      guestEmail,
      guestPhone,
      status: "confirmed",
      paymentStatus: "paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    pendingGuestHousePayments.delete(razorpay_order_id);

    return res.json({
      success: true,
      message: "Booking confirmed and payment successful",
      data: {
        bookingId: booking._id,
        roomName: room.roomName,
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        nights: booking.nights,
        roomsBooked: booking.roomsBooked,
        adultsCount: booking.adultsCount,
        kidsCount: booking.kidsCount,
        totalPrice: booking.totalPrice,
        paymentStatus: booking.paymentStatus,
        assignedRoomNumbers: booking.assignedRoomNumbers || "",
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to verify guest house payment");
    return res.status(500).json({ success: false, message: "Failed to confirm booking" });
  }
};

const phonesMatchForLookup = (stored, input) => {
  const a = String(stored || "").replace(/\D/g, "");
  const b = String(input || "").replace(/\D/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  const tail = (s) => s.slice(-10);
  return tail(a) === tail(b);
};

/**
 * GET /public/booking-lookup?bookingId=&guestPhone=
 * Guests can check assigned room number(s) after staff updates the booking.
 */
exports.lookupGuestHouseBooking = async (req, res) => {
  try {
    const { bookingId, guestPhone } = req.query;
    if (!bookingId || guestPhone === undefined || guestPhone === null || String(guestPhone).trim() === "") {
      return res.status(400).json({ success: false, message: "bookingId and guestPhone are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const booking = await GuestHouseRoomBooking.findById(bookingId)
      .select(
        "guestName guestPhone checkInDate checkOutDate nights roomsBooked adultsCount kidsCount totalPrice status paymentStatus assignedRoomNumbers roomId guestHouseId"
      )
      .populate({ path: "roomId", select: "roomName" })
      .populate({ path: "guestHouseId", select: "name location contactNumber" })
      .lean();

    if (!booking || booking.paymentStatus !== "paid" || booking.status === "cancelled") {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (!phonesMatchForLookup(booking.guestPhone, guestPhone)) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    return res.json({
      success: true,
      data: {
        bookingId: booking._id,
        guestName: booking.guestName,
        guestHouseName: booking.guestHouseId?.name,
        guestHouseLocation: booking.guestHouseId?.location,
        guestHousePhone: booking.guestHouseId?.contactNumber,
        roomTypeName: booking.roomId?.roomName,
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        nights: booking.nights,
        roomsBooked: booking.roomsBooked,
        adultsCount: booking.adultsCount,
        kidsCount: booking.kidsCount,
        totalPrice: booking.totalPrice,
        assignedRoomNumbers: booking.assignedRoomNumbers || "",
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Guest booking lookup failed");
    return res.status(500).json({ success: false, message: "Lookup failed" });
  }
};

/**
 * GET /manager/bookings — authenticated guest-house manager (JWT userId = GuestHouse _id)
 */
exports.listGuestHouseBookingsForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 500);
    const statusFilter = req.query.status;
    const query = { guestHouseId };
    if (statusFilter && ["pending", "confirmed", "cancelled"].includes(String(statusFilter))) {
      query.status = statusFilter;
    }

    const bookings = await GuestHouseRoomBooking.find(query)
      .populate({ path: "roomId", select: "roomName roomCount price" })
      .populate({ path: "guestHouseId", select: "name location" })
      .sort({ checkInDate: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to list guest house bookings");
    return res.status(500).json({ success: false, message: "Failed to load bookings" });
  }
};

/**
 * PATCH /manager/bookings/:bookingId
 * Body: { assignedPhysicalRoomIds?: string[], assignedRoomNumbers?: string }
 * If assignedPhysicalRoomIds is sent (including []), units drive labels and overwrite assignedRoomNumbers (except [] + manual numbers below).
 */
exports.updateGuestHouseBookingRoomAssignment = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { bookingId } = req.params;
    const { assignedRoomNumbers, assignedPhysicalRoomIds } = req.body;

    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }

    const trimmed =
      assignedRoomNumbers === undefined || assignedRoomNumbers === null
        ? ""
        : String(assignedRoomNumbers).trim().slice(0, 200);

    const booking = await GuestHouseRoomBooking.findOne({
      _id: bookingId,
      guestHouseId,
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (assignedPhysicalRoomIds !== undefined) {
      if (!Array.isArray(assignedPhysicalRoomIds)) {
        return res.status(400).json({ success: false, message: "assignedPhysicalRoomIds must be an array" });
      }
      const uniqueIds = [...new Set(assignedPhysicalRoomIds.map((id) => String(id)))];
      if (uniqueIds.length === 0) {
        booking.assignedPhysicalRoomIds = [];
        booking.assignedRoomNumbers = trimmed;
      } else if (uniqueIds.length !== booking.roomsBooked) {
        return res.status(400).json({
          success: false,
          message: `Select exactly ${booking.roomsBooked} physical unit(s), or clear selection.`,
        });
      } else {
        const units = await GuestHousePhysicalRoom.find({
          _id: { $in: uniqueIds },
          guestHouseId,
          roomTypeId: booking.roomId,
          isActive: true,
        }).lean();
        if (units.length !== uniqueIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more units are invalid for this room type",
          });
        }
        const occupied = await getOccupiedPhysicalRoomIdsForRange(
          guestHouseId,
          booking.checkInDate,
          booking.checkOutDate,
          booking._id
        );
        for (const id of uniqueIds) {
          if (occupied.has(id)) {
            return res.status(409).json({
              success: false,
              message: "One or more units are already allocated for overlapping stays",
            });
          }
        }
        booking.assignedPhysicalRoomIds = uniqueIds;
        const sortedLabels = [...units].sort(
          (a, b) => a.floor - b.floor || String(a.unitLabel).localeCompare(String(b.unitLabel))
        );
        booking.assignedRoomNumbers = sortedLabels.map((u) => u.unitLabel).join(", ");
      }
    } else {
      booking.assignedRoomNumbers = trimmed;
      booking.assignedPhysicalRoomIds = [];
    }

    await booking.save();

    const populated = await GuestHouseRoomBooking.findById(booking._id)
      .populate({ path: "roomId", select: "roomName roomCount price" })
      .populate({ path: "guestHouseId", select: "name location" })
      .lean();

    return res.json({ success: true, message: "Room assignment updated", data: populated });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to update room assignment");
    return res.status(500).json({ success: false, message: "Failed to update assignment" });
  }
};

/**
 * GET /manager/inventory-overview?asOfDate=ISO optional — occupancy preview for one calendar night (check-out morning excluded).
 */
exports.getPhysicalInventoryOverviewForManager = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let nightStart = parseDateOnly(req.query.asOfDate || new Date());
    if (!nightStart) nightStart = parseDateOnly(new Date());
    const nightEnd = new Date(nightStart.getTime());
    nightEnd.setUTCDate(nightEnd.getUTCDate() + 1);

    const units = await GuestHousePhysicalRoom.find({ guestHouseId, isActive: true })
      .populate("roomTypeId", "roomName roomCount price")
      .sort({ floor: 1, unitLabel: 1 })
      .lean();

    const occupiedForNight = await getOccupiedPhysicalRoomIdsForRange(guestHouseId, nightStart, nightEnd, null);

    const floorsMap = {};
    const typeMap = {};
    let freeTonight = 0;
    let busyTonight = 0;

    const unitsOut = units.map((u) => {
      const busy = occupiedForNight.has(u._id.toString());
      if (busy) busyTonight += 1;
      else freeTonight += 1;
      floorsMap[u.floor] = (floorsMap[u.floor] || 0) + 1;
      const tid = u.roomTypeId?._id?.toString() || "";
      if (!typeMap[tid]) {
        typeMap[tid] = { roomTypeId: tid, roomName: u.roomTypeId?.roomName || "—", count: 0 };
      }
      typeMap[tid].count += 1;
      return {
        ...u,
        busyOnPreviewNight: busy,
      };
    });

    const floorsSorted = Object.keys(floorsMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map((floor) => ({ floor, roomsOnFloor: floorsMap[floor] }));

    return res.json({
      success: true,
      data: {
        previewNight: { start: nightStart, end: nightEnd },
        summary: {
          totalUnits: units.length,
          floorCount: floorsSorted.length,
          floors: floorsSorted,
          byRoomType: Object.values(typeMap),
          freeOnPreviewNight: freeTonight,
          busyOnPreviewNight: busyTonight,
        },
        units: unitsOut,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "inventory overview manager failed");
    return res.status(500).json({ success: false, message: "Failed to load inventory" });
  }
};

/**
 * GET /manager/bookings/:bookingId/assignable-units
 */
exports.getAssignableUnitsForBooking = async (req, res) => {
  try {
    const guestHouseId = req.user?.userId;
    const { bookingId } = req.params;

    if (!guestHouseId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }

    const booking = await GuestHouseRoomBooking.findOne({
      _id: bookingId,
      guestHouseId,
    }).lean();

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const occupied = await getOccupiedPhysicalRoomIdsForRange(
      guestHouseId,
      booking.checkInDate,
      booking.checkOutDate,
      booking._id
    );

    const units = await GuestHousePhysicalRoom.find({
      guestHouseId,
      roomTypeId: booking.roomId,
      isActive: true,
    })
      .sort({ floor: 1, unitLabel: 1 })
      .lean();

    const assignedHere = new Set((booking.assignedPhysicalRoomIds || []).map((id) => id.toString()));

    const mapped = units.map((u) => {
      const idStr = u._id.toString();
      const blockedElsewhere = occupied.has(idStr);
      const pickedHere = assignedHere.has(idStr);
      const availability = blockedElsewhere ? "busy" : "free";
      return {
        _id: u._id,
        floor: u.floor,
        unitLabel: u.unitLabel,
        availability,
        selectedForThisBooking: pickedHere,
      };
    });

    return res.json({
      success: true,
      data: {
        bookingId: booking._id,
        roomsBooked: booking.roomsBooked,
        roomTypeId: booking.roomId,
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        units: mapped,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "getAssignableUnitsForBooking failed");
    return res.status(500).json({ success: false, message: "Failed to load assignable units" });
  }
};
