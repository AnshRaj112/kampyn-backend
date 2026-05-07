const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");
const { guestHouseBaseFields } = require("./shared/guestHouseSchemaFields");

const guestHouseRoomSchema = new mongoose.Schema(
  {
    ...guestHouseBaseFields(),
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
    price: {
      type: Number,
      required: true,
      min: 0,
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

