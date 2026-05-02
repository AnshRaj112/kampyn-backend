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
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

guestHouseRoomBookingSchema.index({ roomId: 1, checkInDate: 1, checkOutDate: 1, status: 1 });

module.exports = Cluster_Accounts.model("GuestHouseRoomBooking", guestHouseRoomBookingSchema);

