const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseRoomSchema = new mongoose.Schema(
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
    roomName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    roomCount: {
      type: Number,
      required: true,
      min: 1,
    },
    coverImage: {
      type: String,
      required: true,
      trim: true,
    },
    detailedImages: {
      type: [String],
      default: [],
    },
    services: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

guestHouseRoomSchema.index({ guestHouseId: 1, roomName: 1 }, { unique: true });

module.exports = Cluster_Accounts.model("GuestHouseRoom", guestHouseRoomSchema);

