require("dotenv").config();
const { Cluster_Accounts } = require("../config/db");
const Uni = require("../models/account/Uni");
const User = require("../models/account/User");
const logger = require("../utils/pinoLogger");

async function healSubAdmins() {
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

    // 1. Fetch all Unis
    const unis = await Uni.find({}).lean();
    logger.info(`Found ${unis.length} university profiles:`);
    unis.forEach(u => {
      logger.info(`- Uni: ${u.fullName} (${u._id})`);
    });

    // Fetch all Tenants
    const Tenant = require("../models/account/Tenant");
    const tenants = await Tenant.find({}).lean();
    logger.info(`Found ${tenants.length} tenant profiles:`);
    tenants.forEach(t => {
      logger.info(`- Tenant: ${t.name} (${t._id}) slug: ${t.slug}`);
    });

    if (unis.length === 0) {
      logger.warn("No university profiles found in the database.");
      return;
    }

    // 2. Fetch all sub-admins from User collection
    const subAdminsUser = await User.find({ type: "admin" });
    logger.info(`Found ${subAdminsUser.length} sub-administrators in User collection:`);
    for (const sub of subAdminsUser) {
      logger.info(`- User SubAdmin: ${sub.fullName} (${sub.email}), tenantId: ${sub.tenantId}, uniID: ${sub.uniID}`);
    }

    // 3. Fetch all sub-admins from SubAdmin collection
    const SubAdmin = require("../models/account/SubAdmin");
    const subAdminsDedicated = await SubAdmin.find({});
    logger.info(`Found ${subAdminsDedicated.length} sub-administrators in SubAdmin collection:`);
    for (const sub of subAdminsDedicated) {
      logger.info(`- Dedicated SubAdmin: ${sub.fullName} (${sub.email}), tenantId: ${sub.tenantId}, uniID: ${sub.uniID}`);
    }

    logger.info("Database inspection complete.");

  } catch (error) {
    logger.error({ error: error.message }, "Database inspection/healing failed");
  } finally {
    await Cluster_Accounts.close();
    logger.info("Database connection closed");
    process.exit(0);
  }
}

healSubAdmins();
