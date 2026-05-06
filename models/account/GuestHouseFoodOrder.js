const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const orderItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouseFoodItem", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const guestHouseFoodOrderSchema = new mongoose.Schema(
  {
    uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true, index: true },
    guestHouseId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouse", required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouseRoomBooking", required: true, index: true },
    guestName: { type: String, trim: true, maxlength: 120, default: "" },
    guestPhone: { type: String, trim: true, maxlength: 20, default: "" },
    roomLabel: { type: String, trim: true, maxlength: 80, default: "" },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 240, default: "" },
    status: {
      type: String,
      enum: ["pending", "accepted", "preparing", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

guestHouseFoodOrderSchema.index({ guestHouseId: 1, status: 1, createdAt: -1 });

module.exports = Cluster_Accounts.model("GuestHouseFoodOrder", guestHouseFoodOrderSchema);
