const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const subAdminSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    uniID: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    isVerified: { type: Boolean, default: true },
    isAvailable: { type: String, enum: ["Y", "N"], default: "Y" }
  },
  { timestamps: true }
);

module.exports = Cluster_Accounts.model("SubAdmin", subAdminSchema);
