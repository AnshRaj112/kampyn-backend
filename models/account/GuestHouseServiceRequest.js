const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseServiceRequestSchema = new mongoose.Schema(
  {
    uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true, index: true },
    guestHouseId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouse", required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouseRoomBooking", required: true, index: true },
    guestName: { type: String, trim: true, maxlength: 120, default: "" },
    guestPhone: { type: String, trim: true, maxlength: 20, default: "" },
    roomLabel: { type: String, trim: true, maxlength: 80, default: "" },
    category: {
      type: String,
      enum: ["housekeeping", "laundry", "maintenance", "food", "transport", "other"],
      default: "other",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "cancelled"],
      default: "open",
      index: true,
    },
    assignedTo: { type: String, trim: true, maxlength: 120, default: "" },
    etaMinutes: { type: Number, min: 0, default: null },
    resolutionNote: { type: String, trim: true, maxlength: 300, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

guestHouseServiceRequestSchema.index({ guestHouseId: 1, status: 1, priority: 1, createdAt: -1 });

module.exports = Cluster_Accounts.model("GuestHouseServiceRequest", guestHouseServiceRequestSchema);
