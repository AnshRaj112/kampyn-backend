const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const workflowInstanceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    definitionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkflowDefinition", required: true },
    status: { type: String, enum: ["running", "paused", "completed", "failed", "rejected"], default: "running" },
    currentNodeId: { type: String, required: true },
    
    // Runtime execution variables
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    
    // Approvals history trail
    logs: [
      {
        nodeId: { type: String, required: true },
        nodeType: { type: String, required: true },
        action: { type: String }, // e.g. "approved", "rejected", "escalated"
        actor: { type: String }, // User ID or system cron
        comment: { type: String },
        timestamp: { type: Date, default: Date.now }
      }
    ],

    // Target information for paused/approval states
    pendingApprovalByRole: { type: String },
    escalationDeadline: { type: Date }
  },
  {
    timestamps: true,
    shardKey: { tenantId: 1 }
  }
);

workflowInstanceSchema.index({ tenantId: 1, status: 1 });
workflowInstanceSchema.index({ pendingApprovalByRole: 1, status: 1 });

module.exports = Cluster_Accounts.model("WorkflowInstance", workflowInstanceSchema);
