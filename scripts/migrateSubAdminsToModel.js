require("dotenv").config();
const { Cluster_Accounts } = require("../config/db");
const Uni = require("../models/account/Uni");
const User = require("../models/account/User");
const SubAdmin = require("../models/account/SubAdmin");
const logger = require("../utils/pinoLogger");

async function migrateSubAdmins() {
  try {
    // Wait for Cluster_Accounts connection to be ready
    await new Promise((resolve, reject) => {
      if (Cluster_Accounts.readyState === 1) {
        resolve();
      } else {
        Cluster_Accounts.once('connected', resolve);
        Cluster_Accounts.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      }
    });

    logger.info("Connected to Accounts database cluster");

    // Fetch all university profiles in case we need a fallback association
    const unis = await Uni.find({}).lean();
    if (unis.length === 0) {
      logger.error("No university profiles found in the database. Cannot migrate sub-administrators.");
      process.exit(1);
    }
    const defaultUniId = unis[0]._id;

    // 1. Find all sub-admins in User collection
    const legacySubAdmins = await User.find({ type: "admin" });
    logger.info(`Found ${legacySubAdmins.length} legacy sub-administrators in User collection.`);

    let migratedCount = 0;
    for (const legacy of legacySubAdmins) {
      logger.info(`Processing legacy sub-admin: ${legacy.fullName} (${legacy.email})`);

      // Resolve their university association
      const finalUniId = legacy.uniID || legacy.tenantId || defaultUniId;

      // Check if they already exist in SubAdmin collection
      const existing = await SubAdmin.findOne({
        $or: [{ email: legacy.email }, { phone: legacy.phone }]
      });

      if (!existing) {
        // Create new SubAdmin document, keeping the original ID if possible (or new ID is fine too)
        const subAdminDoc = new SubAdmin({
          _id: legacy._id, // Retain references/tokens if possible
          fullName: legacy.fullName,
          email: legacy.email,
          phone: legacy.phone,
          password: legacy.password,
          uniID: finalUniId,
          tenantId: finalUniId,
          isVerified: legacy.isVerified !== undefined ? legacy.isVerified : true,
          isAvailable: legacy.gender || "Y" // sub-admins might not have isAvailable, fallback to default Y
        });

        await subAdminDoc.save();
        migratedCount++;
        logger.info(`Transferred ${legacy.email} to SubAdmin collection.`);
      } else {
        logger.info(`Sub-admin ${legacy.email} already exists in SubAdmin collection. Skipping cloning.`);
      }

      // Delete from User collection to prevent schema validation conflicts
      await User.findByIdAndDelete(legacy._id);
      logger.info(`Removed legacy record ${legacy.email} from User collection.`);
    }

    logger.info(`Migration finished successfully. Migrated count: ${migratedCount}`);

  } catch (error) {
    logger.error({ error: error.message }, "Sub-admin migration failed");
    process.exit(1);
  } finally {
    await Cluster_Accounts.close();
    logger.info("Database connection closed");
    process.exit(0);
  }
}

migrateSubAdmins();
