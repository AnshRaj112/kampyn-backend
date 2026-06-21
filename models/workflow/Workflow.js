const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const workflowDefinitionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    triggerEvent: { type: String, required: true }, // e.g. "OUTING_REQUEST_CREATED"
    status: { type: String, enum: ["active", "draft", "disabled"], default: "draft" },
    
    // Workflow nodes structured as a map/key-value directory
    nodes: {
      type: Map,
      of: new mongoose.Schema({
        type: { type: String, enum: ["trigger", "condition", "approval", "action", "end"], required: true },
        next: { type: String }, // Next node ID (for sequential executions)
        
        // Conditional properties
        expression: { type: String }, // JS expression (e.g. "request.durationDays <= 3")
        onTrue: { type: String },
        onFalse: { type: String },

        // Approval properties
        assigneeRole: { type: String }, // Target role to approve
        escalationDays: { type: Number, default: 2 },
        onApprove: { type: String },
        onReject: { type: String },

        // Action properties
        actionHandler: { type: String } // Function/Hook identifier
      }, { _id: false })
    },
    
    version: { type: Number, default: 1 }
  },
  {
    timestamps: true,
    shardKey: { tenantId: 1 }
  }
);

workflowDefinitionSchema.index({ tenantId: 1, triggerEvent: 1, status: 1 });

module.exports = Cluster_Accounts.model("WorkflowDefinition", workflowDefinitionSchema);
