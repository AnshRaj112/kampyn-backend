// Migration script to add isVeg field to all existing Retail and Produce items
// This script sets isVeg to true for all existing items

require("dotenv").config();
const { Cluster_Item } = require("../config/db");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const logger = require("../utils/pinoLogger");

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

    logger.info("Connected to Items database cluster");

    // Update all Retail items that don't have isVeg field
    const retailResult = await Retail.updateMany(
      { isVeg: { $exists: false } },
      { $set: { isVeg: true } }
    );

    logger.info({ modifiedCount: retailResult.modifiedCount }, "Updated Retail items (missing isVeg)");

    // Update all Produce items that don't have isVeg field
    const produceResult = await Produce.updateMany(
      { isVeg: { $exists: false } },
      { $set: { isVeg: true } }
    );

    logger.info({ modifiedCount: produceResult.modifiedCount }, "Updated Produce items (missing isVeg)");

    // Also update items where isVeg is null
    const retailNullResult = await Retail.updateMany(
      { isVeg: null },
      { $set: { isVeg: true } }
    );

    logger.info({ modifiedCount: retailNullResult.modifiedCount }, "Updated Retail items (null isVeg)");

    const produceNullResult = await Produce.updateMany(
      { isVeg: null },
      { $set: { isVeg: true } }
    );

    logger.info({ modifiedCount: produceNullResult.modifiedCount }, "Updated Produce items (null isVeg)");

    // Get total counts
    const retailCount = await Retail.countDocuments();
    const produceCount = await Produce.countDocuments();
    
    logger.info({ retailCount, produceCount }, "Total items count");

    // Verify migration
    const retailWithoutVeg = await Retail.countDocuments({ isVeg: { $ne: true } });
    const produceWithoutVeg = await Produce.countDocuments({ isVeg: { $ne: true } });
    
    logger.info({ retailWithoutVeg, produceWithoutVeg }, "Items without isVeg=true");

    logger.info("Migration completed successfully");

  } catch (error) {
    logger.error({ error: error.message }, "Migration failed");
    process.exit(1);
  } finally {
    await Cluster_Item.close();
    logger.info("Database connection closed");
    process.exit(0);
  }
}

// Run the migration
migrateIsVeg();

