const Auditorium = require("../../models/account/Auditorium");
const AuditoriumBooking = require("../../models/account/AuditoriumBooking");
const logger = require("../../utils/pinoLogger");
const Razorpay = require("razorpay");
const razorpayConfig = require("../../config/razorpay");
const paymentUtils = require("../../utils/paymentUtils");

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];
const pendingAuditoriumPayments = new Map();
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

const diffDays = (startDate, endDate) => {
  const ms = endDate.getTime() - startDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const countOverlappingBookings = async (auditoriumId, startDate, endDate) => {
  return AuditoriumBooking.countDocuments({
    auditoriumId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  });
};

exports.getAuditoriumAvailability = async (req, res) => {
  try {
    const { auditoriumId } = req.params;
    const { startDate, endDate, attendeeCount } = req.query;
    const parsedStartDate = parseDateOnly(startDate);
    const parsedEndDate = parseDateOnly(endDate);
    if (!parsedStartDate || !parsedEndDate) {
      return res.status(400).json({ success: false, message: "Valid startDate and endDate are required" });
    }
    if (parsedEndDate <= parsedStartDate) {
      return res.status(400).json({ success: false, message: "endDate must be after startDate" });
    }

    const auditorium = await Auditorium.findById(auditoriumId).select("name sittingSpace pricePerDay isActive").lean();
    if (!auditorium || !auditorium.isActive) {
      return res.status(404).json({ success: false, message: "Auditorium not found or inactive" });
    }

    const parsedAttendeeCount = attendeeCount !== undefined ? Number(attendeeCount) : null;
    if (parsedAttendeeCount !== null && (!Number.isFinite(parsedAttendeeCount) || parsedAttendeeCount < 1)) {
      return res.status(400).json({ success: false, message: "attendeeCount must be a number greater than 0" });
    }

    const overlaps = await countOverlappingBookings(auditorium._id, parsedStartDate, parsedEndDate);
    const capacityOk = parsedAttendeeCount === null ? true : parsedAttendeeCount <= Number(auditorium.sittingSpace || 0);
    const totalDays = diffDays(parsedStartDate, parsedEndDate);
    const pricePerDay = Number(auditorium.pricePerDay || 0);
    const totalPrice = totalDays * pricePerDay;
    return res.json({
      success: true,
      data: {
        auditoriumId: auditorium._id,
        auditoriumName: auditorium.name,
        sittingSpace: auditorium.sittingSpace,
        attendeeCount: parsedAttendeeCount,
        canBook: overlaps === 0 && capacityOk,
        hasDateConflict: overlaps > 0,
        capacityOk,
        totalDays,
        pricePerDay,
        totalPrice,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch auditorium availability");
    return res.status(500).json({ success: false, message: "Failed to fetch auditorium availability" });
  }
};

exports.createAuditoriumPaymentOrder = async (req, res) => {
  try {
    const { auditoriumId, startDate, endDate, eventName, attendeeCount, bookedByName, bookedByEmail, bookedByPhone, notes } =
      req.body;
    if (!auditoriumId || !startDate || !endDate || !eventName || !attendeeCount || !bookedByName || !bookedByPhone) {
      return res.status(400).json({
        success: false,
        message: "auditoriumId, startDate, endDate, eventName, attendeeCount, bookedByName and bookedByPhone are required",
      });
    }

    const parsedStartDate = parseDateOnly(startDate);
    const parsedEndDate = parseDateOnly(endDate);
    if (!parsedStartDate || !parsedEndDate) {
      return res.status(400).json({ success: false, message: "Valid startDate and endDate are required" });
    }
    if (parsedEndDate <= parsedStartDate) {
      return res.status(400).json({ success: false, message: "endDate must be after startDate" });
    }

    const parsedAttendeeCount = Number(attendeeCount);
    if (!Number.isFinite(parsedAttendeeCount) || parsedAttendeeCount < 1) {
      return res.status(400).json({ success: false, message: "attendeeCount must be a number greater than 0" });
    }

    const auditorium = await Auditorium.findById(auditoriumId).select("uniId name sittingSpace pricePerDay isActive").lean();
    if (!auditorium || !auditorium.isActive) {
      return res.status(404).json({ success: false, message: "Auditorium not found or inactive" });
    }
    if (parsedAttendeeCount > Number(auditorium.sittingSpace || 0)) {
      return res.status(400).json({ success: false, message: "Attendee count exceeds auditorium sitting capacity" });
    }

    const overlaps = await countOverlappingBookings(auditorium._id, parsedStartDate, parsedEndDate);
    if (overlaps > 0) {
      return res.status(409).json({ success: false, message: "Auditorium is already booked for selected dates" });
    }

    const totalDays = diffDays(parsedStartDate, parsedEndDate);
    const pricePerDay = Number(auditorium.pricePerDay || 0);
    const totalPrice = totalDays * pricePerDay;
    if (totalPrice <= 0) {
      return res.status(400).json({ success: false, message: "Invalid total amount for payment" });
    }
    const amountPaise = Math.round(totalPrice * 100);
    if (amountPaise < 100) {
      return res.status(400).json({ success: false, message: "Minimum payable amount is ₹1" });
    }

    const receipt = `aud_${auditorium._id.toString().slice(-8)}_${Date.now().toString(36)}`.slice(0, 40);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: {
        type: "auditorium_booking",
        uniId: auditorium.uniId?.toString(),
        auditoriumId: auditorium._id.toString(),
      },
    });

    pendingAuditoriumPayments.set(order.id, {
      auditoriumId: auditorium._id,
      uniId: auditorium.uniId,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      eventName: String(eventName).trim(),
      attendeeCount: parsedAttendeeCount,
      bookedByName: String(bookedByName).trim(),
      bookedByEmail: bookedByEmail ? String(bookedByEmail).trim().toLowerCase() : "",
      bookedByPhone: String(bookedByPhone).trim(),
      notes: notes ? String(notes).trim() : "",
      totalDays,
      pricePerDay,
      totalPrice,
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
        totalDays,
        pricePerDay,
        totalPrice,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to create auditorium payment order");
    return res.status(500).json({ success: false, message: "Failed to create payment order" });
  }
};

exports.verifyAuditoriumPayment = async (req, res) => {
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

    const pending = pendingAuditoriumPayments.get(razorpay_order_id);
    if (!pending) {
      return res.status(400).json({
        success: false,
        message: "Payment session expired or invalid. Please start booking again.",
      });
    }
    if (Date.now() - pending.createdAt > PENDING_MS) {
      pendingAuditoriumPayments.delete(razorpay_order_id);
      return res.status(400).json({ success: false, message: "Payment session expired. Please try again." });
    }

    const overlaps = await countOverlappingBookings(pending.auditoriumId, pending.startDate, pending.endDate);
    if (overlaps > 0) {
      pendingAuditoriumPayments.delete(razorpay_order_id);
      return res.status(409).json({
        success: false,
        message: "Auditorium is no longer available for these dates.",
      });
    }

    const booking = await AuditoriumBooking.create({
      uniId: pending.uniId,
      auditoriumId: pending.auditoriumId,
      startDate: pending.startDate,
      endDate: pending.endDate,
      eventName: pending.eventName,
      attendeeCount: pending.attendeeCount,
      totalDays: pending.totalDays,
      pricePerDay: pending.pricePerDay,
      totalPrice: pending.totalPrice,
      bookedByName: pending.bookedByName,
      bookedByEmail: pending.bookedByEmail,
      bookedByPhone: pending.bookedByPhone,
      notes: pending.notes,
      status: "confirmed",
      paymentStatus: "paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    pendingAuditoriumPayments.delete(razorpay_order_id);

    return res.json({
      success: true,
      message: "Auditorium booking confirmed and payment successful",
      data: {
        bookingId: booking._id,
        eventName: booking.eventName,
        totalDays: booking.totalDays,
        pricePerDay: booking.pricePerDay,
        totalPrice: booking.totalPrice,
        paymentStatus: booking.paymentStatus,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to verify auditorium payment");
    return res.status(500).json({ success: false, message: "Failed to confirm booking" });
  }
};

exports.listAuditoriumBookingsForUniversity = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });
    const rows = await AuditoriumBooking.find({ uniId })
      .populate({ path: "auditoriumId", select: "name location sittingSpace" })
      .sort({ startDate: -1 })
      .lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch auditorium bookings for university");
    return res.status(500).json({ success: false, message: "Failed to fetch auditorium bookings" });
  }
};
