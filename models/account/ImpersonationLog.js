const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const impersonationLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    action: { type: String, required: true }, // e.g. "GET_ORDERS", "FETCH_REVENUE"
    endpoint: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now }
  },
  {
    shardKey: { tenantId: 1 }
  }
);

// TTL Index for auto-deletion after 365 days (31,536,000 seconds)
impersonationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

module.exports = Cluster_Accounts.model("ImpersonationLog", impersonationLogSchema);
