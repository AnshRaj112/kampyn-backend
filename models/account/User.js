const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const userSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["user-standard", "user-premium", "admin"],
      required: true,
      default: "user-standard",
    },
    fullName: { type: String }, // Only for users
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender: { type: String },
    uniID: { type: mongoose.Schema.Types.ObjectId, ref: "Uni" },

    isVerified: { type: Boolean, default: false },

    // Subscription fields
    isPaid: { type: Boolean, default: false },
    subscriptionType: {
      type: String,
      enum: ["standard", "premium"],
      default: "standard",
    },
    subscriptionExpiry: { type: Date, default: null },

    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    cart: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          refPath: "cart.kind",
        },
        kind: { type: String, required: true, enum: ["Retail", "Produce"] },
        quantity: { type: Number, default: 1 },
        _id: false,
      },
    ], // For users
    pastOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }], // For users
    activeOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }], // For users
    favourites: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "favourites.kind",
          required: true,
        },
        kind: {
          type: String,
          enum: ["Retail", "Produce"],
          required: true,
        },
        vendorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Vendor",
          required: true,
        },
        _id: false,
      },
    ],
    loginAttempts: { type: Number, default: 0 },
    lastLoginAttempt: { type: Date, default: null },
  },
  { timestamps: true }
);
userSchema.index({ "cart.itemId": 1, "cart.kind": 1 });
userSchema.index({ vendorId: 1 });
userSchema.index({ "favourites.itemId": 1, "favourites.kind": 1 });

module.exports = Cluster_Accounts.model("User", userSchema);
