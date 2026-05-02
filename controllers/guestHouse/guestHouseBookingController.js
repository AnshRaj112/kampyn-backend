const GuestHouseRoom = require("../../models/account/GuestHouseRoom");
const GuestHouseRoomBooking = require("../../models/account/GuestHouseRoomBooking");
const logger = require("../../utils/pinoLogger");

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

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

exports.getRoomAvailability = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { checkInDate, checkOutDate, roomsRequested } = req.query;

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

exports.createRoomBooking = async (req, res) => {
  try {
    const {
      roomId,
      checkInDate,
      checkOutDate,
      roomsRequested,
      guestName,
      guestEmail,
      guestPhone,
    } = req.body;

    if (!roomId || !checkInDate || !checkOutDate || roomsRequested === undefined || !guestName || !guestPhone) {
      return res.status(400).json({
        success: false,
        message: "roomId, checkInDate, checkOutDate, roomsRequested, guestName and guestPhone are required",
      });
    }

    const parsedCheckInDate = parseDateOnly(checkInDate);
    const parsedCheckOutDate = parseDateOnly(checkOutDate);
    if (!parsedCheckInDate || !parsedCheckOutDate) {
      return res.status(400).json({ success: false, message: "Valid checkInDate and checkOutDate are required" });
    }
    if (parsedCheckOutDate <= parsedCheckInDate) {
      return res.status(400).json({ success: false, message: "checkOutDate must be after checkInDate" });
    }

    const requestedRooms = Number(roomsRequested);
    if (!Number.isFinite(requestedRooms) || requestedRooms < 1) {
      return res.status(400).json({ success: false, message: "roomsRequested must be a number greater than 0" });
    }

    const room = await GuestHouseRoom.findById(roomId).select("uniId guestHouseId roomName roomCount price isActive").lean();
    if (!room || !room.isActive) {
      return res.status(404).json({ success: false, message: "Room not found or inactive" });
    }

    const bookedRooms = await getBookedRoomCountForDateRange(room._id, parsedCheckInDate, parsedCheckOutDate);
    const availableRooms = Math.max(0, (room.roomCount || 0) - bookedRooms);
    if (requestedRooms > availableRooms) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableRooms} room(s) are available for selected dates`,
      });
    }

    const nights = diffNights(parsedCheckInDate, parsedCheckOutDate);
    const pricePerNight = Number(room.price || 0);
    const totalPrice = pricePerNight * requestedRooms * nights;

    const booking = await GuestHouseRoomBooking.create({
      uniId: room.uniId,
      guestHouseId: room.guestHouseId,
      roomId: room._id,
      checkInDate: parsedCheckInDate,
      checkOutDate: parsedCheckOutDate,
      nights,
      roomsBooked: requestedRooms,
      pricePerNight,
      totalPrice,
      guestName: String(guestName).trim(),
      guestEmail: guestEmail ? String(guestEmail).trim().toLowerCase() : "",
      guestPhone: String(guestPhone).trim(),
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Room booking request submitted successfully",
      data: {
        bookingId: booking._id,
        roomName: room.roomName,
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        nights: booking.nights,
        roomsBooked: booking.roomsBooked,
        pricePerNight: booking.pricePerNight,
        totalPrice: booking.totalPrice,
        status: booking.status,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to create room booking");
    return res.status(500).json({ success: false, message: "Failed to create booking" });
  }
};

