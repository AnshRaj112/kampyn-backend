const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const systemAuditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    actionType: { 
      type: String, 
      enum: ["MODULE_TOGGLE", "BRANDING_UPDATE", "TENANT_SUSPENSION", "FEES_MODIFICATION", "TENANT_CREATION", "TENANT_SWITCH"], 
      required: true 
    },
    description: { type: String, required: true }, // Human-readable change text
    previousState: { type: mongoose.Schema.Types.Mixed },
    newState: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { 
    timestamps: { createdAt: true, updatedAt: false },
    shardKey: { tenantId: 1 }
  }
);

module.exports = Cluster_Accounts.model("SystemAuditLog", systemAuditLogSchema);
