// scripts/fix_packable_property.js
// This script ensures all existing items have the correct packable property set
// Produce items should have packable: true, Retail items should have packable: false (unless explicitly set)

const mongoose = require("mongoose");
const { Cluster_Item } = require("../config/db");

const Produce = Cluster_Item.model("Produce");
const Retail = Cluster_Item.model("Retail");

async function fixPackableProperty() {
  try {
    console.log("🔧 Starting to fix packable property for all items...");
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/bitesbay");
    console.log("✅ Connected to database");
    
    // Fix Produce items - all should be packable
    const produceUpdateResult = await Produce.updateMany(
      { packable: { $exists: false } }, // Items without packable property
      { $set: { packable: true } }
    );
    
    console.log(`📦 Updated ${produceUpdateResult.modifiedCount} Produce items to have packable: true`);
    
    // Fix Retail items - most should not be packable (unless explicitly set)
    const retailUpdateResult = await Retail.updateMany(
      { packable: { $exists: false } }, // Items without packable property
      { $set: { packable: false } }
    );
    
    console.log(`🛍️ Updated ${retailUpdateResult.modifiedCount} Retail items to have packable: false`);
    
    // Verify the changes
    const produceCount = await Produce.countDocuments({ packable: true });
    const retailCount = await Retail.countDocuments({ packable: false });
    const retailPackableCount = await Retail.countDocuments({ packable: true });
    
    console.log(`\n📊 Final counts:`);
    console.log(`- Produce items with packable: true: ${produceCount}`);
    console.log(`- Retail items with packable: false: ${retailCount}`);
    console.log(`- Retail items with packable: true: ${retailPackableCount}`);
    
    console.log("\n✅ Packable property fix completed successfully!");
    
  } catch (error) {
    console.error("❌ Error fixing packable property:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from database");
  }
}

// Run the script if called directly
if (require.main === module) {
  fixPackableProperty();
}

module.exports = { fixPackableProperty };
