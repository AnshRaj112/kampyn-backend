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

    // Seller type: whether the vendor participates as a seller or non-seller
    sellerType: {
      type: String,
      enum: ["SELLER", "NON_SELLER"],
      default: "NON_SELLER",
      required: true,
    },

    // GST Information
    gstNumber: { type: String }, // Optional - vendor can have their own GST number
    useUniGstNumber: { type: Boolean, default: false }, // Whether to use university's GST number

    // Delivery preferences
    deliverySettings: {
      offersDelivery: { type: Boolean, default: false },
      deliveryPreparationTime: { type: Number, default: 30 }, // in minutes
    },

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

    rawMaterialInventory: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Raw",
          required: true,
        },
        openingAmount: { type: Number, default: 0, required: true },
        closingAmount: { type: Number, default: 0, required: true },
        unit: { type: String, enum: ["l", "kg"], required: true },
        createdAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    activeOrders: [{ type: mongoose.Types.ObjectId, ref: "Order" }],

    services: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Service" }
    ],

    lastLoginAttempt: { type: Date, default: null },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// this compound index can help—MongoDB can jump directly to that subdocument.
vendorSchema.index({ uniID: 1, "retailInventory.itemId": 1 });
vendorSchema.index({ uniID: 1, "produceInventory.itemId": 1 });
vendorSchema.index({ uniID: 1, "rawMaterialInventory.itemId": 1 });
module.exports = Cluster_Accounts.model("Vendor", vendorSchema);
