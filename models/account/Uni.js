const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const uniSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    vendors: [
      {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
        isAvailable: { type: String, enum: ["Y", "N"], default: "Y" },
        _id: false,
      },
    ],
    loginAttempts: { type: Number, default: 0 },
    lastLoginAttempt: { type: Date, default: null },
  },
  { timestamps: true }
);
module.exports = Cluster_Accounts.model("Uni", uniSchema);
