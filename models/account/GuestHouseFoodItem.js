const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseFoodItemSchema = new mongoose.Schema(
  {
    uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true, index: true },
    guestHouseId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouse", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, trim: true, maxlength: 60, default: "General", index: true },
    description: { type: String, trim: true, maxlength: 240, default: "" },
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true, index: true },
    imageUrl: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

guestHouseFoodItemSchema.index({ guestHouseId: 1, category: 1, isAvailable: 1 });

module.exports = Cluster_Accounts.model("GuestHouseFoodItem", guestHouseFoodItemSchema);
