const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const amenityLedgerSchema = new mongoose.Schema(
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
    physicalRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHousePhysicalRoom",
      required: true,
      index: true,
    },
    recordDate: {
      type: Date,
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    openingInRoom: { type: Number, min: 0, default: 0 },
    openingInLaundry: { type: Number, min: 0, default: 0 },
    takenOutOfRoom: { type: Number, min: 0, default: 0 },
    sentToLaundry: { type: Number, min: 0, default: 0 },
    washedAndDried: { type: Number, min: 0, default: 0 },
    returnedToRoom: { type: Number, min: 0, default: 0 },
    placedInRoom: { type: Number, min: 0, default: 0 },
    notes: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    updatedByRole: {
      type: String,
      enum: ["guestHouse", "system"],
      default: "guestHouse",
    },
  },
  { timestamps: true }
);

amenityLedgerSchema.index(
  { guestHouseId: 1, recordDate: 1, physicalRoomId: 1, itemName: 1 },
  { unique: true }
);

module.exports = Cluster_Accounts.model("GuestHouseAmenityLedger", amenityLedgerSchema);
