const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseRoomRateRuleSchema = new mongoose.Schema(
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
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    overridePricePerNight: {
      type: Number,
      min: 0,
      default: null,
    },
    isBlackout: {
      type: Boolean,
      default: false,
    },
    minNights: {
      type: Number,
      min: 1,
      default: 1,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

guestHouseRoomRateRuleSchema.index({ roomId: 1, startDate: 1, endDate: 1, isActive: 1 });

module.exports = Cluster_Accounts.model("GuestHouseRoomRateRule", guestHouseRoomRateRuleSchema);
