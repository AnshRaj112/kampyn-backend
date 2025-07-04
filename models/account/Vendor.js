// models/Vendor.js
const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const vendorSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, unique: true },
    password: { type: String, required: true }, // hash in pre-save
    location: { type: String },
    uniID: { type: mongoose.Schema.Types.ObjectId, ref: "Uni" },
    isVerified: { type: Boolean, default: false },
    retailInventory: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Retail",
          required: true,
        },
        quantity: { type: Number, default: 0, required: true },
        isSpecial: {
          type: String,
          enum: ["Y", "N"],
          default: "N",
          required: true,
        },
        isAvailable: {
          type: String,
          enum: ["Y", "N"],
          default: "Y",
          required: true,
        },
        _id: false,
      },
    ],

    produceInventory: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Produce",
          required: true,
        },
        isAvailable: {
          type: String,
          enum: ["Y", "N"],
          default: "Y",
          required: true,
        },
        isSpecial: {
          type: String,
          enum: ["Y", "N"],
          default: "N",
          required: true,
        },
        _id: false,
      },
    ],
    activeOrders: [{ type: mongoose.Types.ObjectId, ref: "Order" }],

    lastLoginAttempt: { type: Date, default: null },
  },
  { timestamps: true }
);

// this compound index can help—MongoDB can jump directly to that subdocument.
vendorSchema.index({ uniID: 1, "retailInventory.itemId": 1 });
vendorSchema.index({ uniID: 1, "produceInventory.itemId": 1 });
module.exports = Cluster_Accounts.model("Vendor", vendorSchema);
