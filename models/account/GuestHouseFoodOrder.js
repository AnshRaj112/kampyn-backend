const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");
const { guestRequestBaseFields } = require("./shared/guestRequestSchemaFields");

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
    ...guestRequestBaseFields(),
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
