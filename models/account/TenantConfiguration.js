const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const tenantConfigurationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    environment: { type: String, enum: ["DEV", "TEST", "UAT", "PROD"], required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    
    branding: {
      logo: { type: String, default: "" },
      favicon: { type: String, default: "" },
      primaryColor: { type: String, default: "#01796f" },
      secondaryColor: { type: String, default: "#4ea199" },
      font: { type: String, default: "Poppins" },
      backgroundColor: { type: String, default: "" }
    },
    
    modules: [
      {
        name: { type: String, required: true },
        enabled: { type: Boolean, default: false },
        features: { type: Map, of: mongoose.Schema.Types.Mixed }
      }
    ],

    navigation: {
      header: [
        {
          label: { type: String, required: true },
          path: { type: String, required: true },
          icon: { type: String },
          roles: [{ type: String }]
        }
      ]
    },

    permissions: {
      roles: [
        {
          name: { type: String, required: true },
          inherits: [{ type: String }],
          policies: [
            {
              resource: { type: String, required: true },
              action: { type: String, required: true },
              effect: { type: String, enum: ["allow", "deny"], default: "allow" },
              conditions: { type: mongoose.Schema.Types.Mixed }
            }
          ]
        }
      ]
    },

    checksum: { type: String, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  {
    timestamps: true,
    shardKey: { tenantId: 1 }
  }
);

// Unique index to ensure only one active config per environment per tenant
tenantConfigurationSchema.index({ tenantId: 1, environment: 1, status: 1 }, { unique: true });
// Historical version index
tenantConfigurationSchema.index({ tenantId: 1, version: -1 });

module.exports = Cluster_Accounts.model("TenantConfiguration", tenantConfigurationSchema);
