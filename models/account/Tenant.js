const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true }, // e.g. "kiit", "vit"
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    
    branding: {
      logo: { type: String, default: "" },
      favicon: { type: String, default: "" },
      primaryColor: { type: String, default: "#01796f" },
      secondaryColor: { type: String, default: "#4ea199" },
      font: { type: String, default: "Poppins" }
    },
    
    enabledModules: {
      type: [String],
      enum: ["food", "hostel", "auditorium", "library", "transport", "laundry"],
      default: ["food", "hostel", "auditorium"]
    },

    // Operational University configuration
    email: { type: String, required: true, unique: true },
    phone: { type: String, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    gstNumber: { type: String, required: true },
    packingCharge: { type: Number, default: 5 },
    deliveryCharge: { type: Number, default: 50 },
    platformFee: { type: Number, default: 2 },
    
    categoryImages: [
      {
        name: { type: String, required: true },
        image: { type: String, required: true }
      }
    ],
    
    // Dynamic navigation menu structure
    navigation: [
      {
        label: { type: String, required: true },
        path: { type: String, required: true },
        icon: { type: String },
        roles: [{ type: String }]
      }
    ]
  },
  { 
    timestamps: true,
    shardKey: { _id: 1 }
  }
);

// Establish database index on slug for routing lookups
tenantSchema.index({ slug: 1 });

module.exports = Cluster_Accounts.model("Tenant", tenantSchema);
