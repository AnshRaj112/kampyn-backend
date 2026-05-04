const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

/** One bookable physical unit (bedroom) tied to a room *type* for availability-aware assignment. */
const guestHousePhysicalRoomSchema = new mongoose.Schema(
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
    /** GuestHouseRoom _id — category (e.g. double bed); null until configured on floor plan. */
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHouseRoom",
      default: null,
      index: true,
    },
    floor: {
      type: Number,
      required: true,
      default: 1,
      min: -5,
      max: 200,
    },
    /** Door label shown to guests, e.g. 101, A-12 */
    unitLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Staff-only notes (maintenance, VIP, etc.) */
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    housekeepingStatus: {
      type: String,
      enum: ["ready", "dirty", "maintenance", "blocked"],
      default: "ready",
      index: true,
    },
  },
  { timestamps: true }
);

guestHousePhysicalRoomSchema.index({ guestHouseId: 1, unitLabel: 1 }, { unique: true });
guestHousePhysicalRoomSchema.index({ guestHouseId: 1, floor: 1, roomTypeId: 1 });

module.exports = Cluster_Accounts.model("GuestHousePhysicalRoom", guestHousePhysicalRoomSchema);
