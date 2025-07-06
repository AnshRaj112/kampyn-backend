const mongoose = require("mongoose");
require("dotenv").config();

const { Cluster_Accounts } = require("../config/db");
const Vendor = Cluster_Accounts.model("Vendor");

async function migrateDeliverySettings() {
  try {
    console.log("🔧 Starting delivery settings migration...");
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Connected to MongoDB");
    
    // Find all vendors that don't have deliverySettings
    const vendorsWithoutSettings = await Vendor.find({
      $or: [
        { deliverySettings: { $exists: false } },
        { deliverySettings: null }
      ]
    });
    
    console.log(`📊 Found ${vendorsWithoutSettings.length} vendors without delivery settings`);
    
    if (vendorsWithoutSettings.length === 0) {
      console.log("✅ All vendors already have delivery settings");
      return;
    }
    
    // Default delivery settings
    const defaultDeliverySettings = {
      offersDelivery: false,
      deliveryPreparationTime: 30
    };
    
    // Update all vendors without delivery settings
    const updateResult = await Vendor.updateMany(
      {
        $or: [
          { deliverySettings: { $exists: false } },
          { deliverySettings: null }
        ]
      },
      {
        $set: { deliverySettings: defaultDeliverySettings }
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} vendors with default delivery settings`);
    
    // Verify the migration
    const remainingVendors = await Vendor.find({
      $or: [
        { deliverySettings: { $exists: false } },
        { deliverySettings: null }
      ]
    });
    
    if (remainingVendors.length === 0) {
      console.log("✅ Migration completed successfully!");
    } else {
      console.log(`⚠️  Warning: ${remainingVendors.length} vendors still don't have delivery settings`);
    }
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateDeliverySettings();
}

module.exports = migrateDeliverySettings; 