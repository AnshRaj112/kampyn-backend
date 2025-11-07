// Migration script to add isVeg field to all existing Retail and Produce items
// This script sets isVeg to true for all existing items

require("dotenv").config();
const { Cluster_Item } = require("../config/db");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");

async function migrateIsVeg() {
  try {
    // Wait for Cluster_Item connection to be ready
    await new Promise((resolve, reject) => {
      if (Cluster_Item.readyState === 1) {
        resolve();
      } else {
        Cluster_Item.once('connected', resolve);
        Cluster_Item.once('error', reject);
        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      }
    });

    console.log("Connected to Items database cluster");

    // Update all Retail items that don't have isVeg field
    const retailResult = await Retail.updateMany(
      { isVeg: { $exists: false } },
      { $set: { isVeg: true } }
    );

    console.log(`Updated ${retailResult.modifiedCount} Retail items (missing isVeg)`);

    // Update all Produce items that don't have isVeg field
    const produceResult = await Produce.updateMany(
      { isVeg: { $exists: false } },
      { $set: { isVeg: true } }
    );

    console.log(`Updated ${produceResult.modifiedCount} Produce items (missing isVeg)`);

    // Also update items where isVeg is null
    const retailNullResult = await Retail.updateMany(
      { isVeg: null },
      { $set: { isVeg: true } }
    );

    console.log(`Updated ${retailNullResult.modifiedCount} Retail items (null isVeg)`);

    const produceNullResult = await Produce.updateMany(
      { isVeg: null },
      { $set: { isVeg: true } }
    );

    console.log(`Updated ${produceNullResult.modifiedCount} Produce items (null isVeg)`);

    // Get total counts
    const retailCount = await Retail.countDocuments();
    const produceCount = await Produce.countDocuments();
    
    console.log(`\nTotal Retail items: ${retailCount}`);
    console.log(`Total Produce items: ${produceCount}`);

    // Verify migration
    const retailWithoutVeg = await Retail.countDocuments({ isVeg: { $ne: true } });
    const produceWithoutVeg = await Produce.countDocuments({ isVeg: { $ne: true } });
    
    console.log(`\nRetail items without isVeg=true: ${retailWithoutVeg}`);
    console.log(`Produce items without isVeg=true: ${produceWithoutVeg}`);

    console.log("\n✅ Migration completed successfully!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await Cluster_Item.close();
    console.log("Database connection closed");
    process.exit(0);
  }
}

// Run the migration
migrateIsVeg();

