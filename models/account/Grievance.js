const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const grievanceSchema = new mongoose.Schema(
  {
    vendor: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Vendor", 
      required: true 
    },
    university: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Uni", 
      required: true 
    },
    category: { 
      type: String, 
      required: true,
      enum: [
        "equipment_not_working",
        "machine_broken",
        "technical_issue",
        "payment_delay",
        "billing_error",
        "order_display_issue",
        "something_needs_repair",
        "power_or_network_issue",
        "delivery_team_issue",
        "something_broken",
        "something_missing",
        "other"
      ]
    },
    severity: { 
      type: String, 
      required: true,
      enum: ["critical", "high", "medium", "low"],
      default: "medium"
    },
    status: { 
      type: String, 
      required: true,
      enum: ["pending", "in_progress", "completed", "closed", "not_required"],
      default: "pending"
    },
    title: { 
      type: String, 
      required: true,
      trim: true
    },
    description: { 
      type: String, 
      required: true,
      trim: true
    },
    resolvedAt: { 
      type: Date 
    },
    resolvedBy: { 
      type: String,
      ref: "Uni"
    },
    remarks: { 
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// Indexes for better query performance
grievanceSchema.index({ vendor: 1, createdAt: -1 });
grievanceSchema.index({ university: 1, status: 1, severity: 1 });
grievanceSchema.index({ status: 1, severity: -1, createdAt: -1 });

module.exports = Cluster_Accounts.model("Grievance", grievanceSchema);
