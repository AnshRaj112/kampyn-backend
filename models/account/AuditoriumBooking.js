const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const auditoriumBookingSchema = new mongoose.Schema(
  {
    uniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Uni",
      required: true,
      index: true,
    },
    auditoriumId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auditorium",
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    eventName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    attendeeCount: {
      type: Number,
      required: true,
      min: 1,
    },
    totalDays: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    bookedByName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    bookedByEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    bookedByPhone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 600,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "confirmed",
      index: true,
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
  },
  { timestamps: true }
);

auditoriumBookingSchema.index({ auditoriumId: 1, startDate: 1, endDate: 1, status: 1 });
auditoriumBookingSchema.index({ uniId: 1, createdAt: -1 });

module.exports = Cluster_Accounts.model("AuditoriumBooking", auditoriumBookingSchema);
