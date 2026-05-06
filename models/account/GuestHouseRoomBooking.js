const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseRoomBookingSchema = new mongoose.Schema(
  {
    uniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Uni",
      required: true,
      index: true,
    },
    guestHouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHouse",
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHouseRoom",
      required: true,
      index: true,
    },
    checkInDate: {
      type: Date,
      required: true,
    },
    checkOutDate: {
      type: Date,
      required: true,
    },
    nights: {
      type: Number,
      required: true,
      min: 1,
    },
    roomsBooked: {
      type: Number,
      required: true,
      min: 1,
    },
    adultsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    kidsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    guestName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    guestEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    guestPhone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "confirmed",
      index: true,
    },
    lifecycleStatus: {
      type: String,
      enum: ["booked", "checked_in", "checked_out", "no_show"],
      default: "booked",
      index: true,
    },
    actualCheckInAt: {
      type: Date,
      default: null,
    },
    actualCheckOutAt: {
      type: Date,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    razorpayOrderId: {
      type: String,
      default: "",
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      index: true,
    },
    /** Physical room number(s) assigned by guest-house staff, shown to the guest (e.g. "204" or "101, 102"). */
    assignedRoomNumbers: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    /** Concrete units allocated for this booking (same length as roomsBooked when fully assigned via picker). */
    assignedPhysicalRoomIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "GuestHousePhysicalRoom" }],
      default: [],
    },
  },
  { timestamps: true }
);

guestHouseRoomBookingSchema.index({ roomId: 1, checkInDate: 1, checkOutDate: 1, status: 1 });
guestHouseRoomBookingSchema.index({ guestHouseId: 1, checkInDate: -1 });

module.exports = Cluster_Accounts.model("GuestHouseRoomBooking", guestHouseRoomBookingSchema);
