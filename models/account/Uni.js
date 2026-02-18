const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const uniSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    isAvailable: { type: String, enum: ["Y", "N"], default: "Y" },

    // College-specific Category Images
    retailImage: { type: String, default: "" },
    produceImage: { type: String, default: "" },

    // Dynamic Category (Kind) Images (e.g., Pizza -> url)
    categoryImages: [
      {
        name: { type: String, required: true }, // e.g., "Pizza"
        image: { type: String, required: true }
      }
    ],

    // GST Information
    gstNumber: { type: String, required: true, unique: true },
    // Packing and delivery charges
    packingCharge: { type: Number, default: 5, min: 0 }, // Default ₹5 per produce item
    deliveryCharge: { type: Number, default: 50, min: 0 }, // Default ₹50 for delivery
    // Platform fee
    platformFee: { type: Number, default: 2, min: 0 }, // Default ₹2 per order
    vendors: [
      {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
        isAvailable: { type: String, enum: ["Y", "N"], default: "Y" },
        _id: false,
      },
    ],
    features: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Feature" }
    ],
    services: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Service" }
    ],
    loginAttempts: { type: Number, default: 0 },
    lastLoginAttempt: { type: Date, default: null },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
module.exports = Cluster_Accounts.model("Uni", uniSchema);
