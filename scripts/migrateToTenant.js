// migrateToTenant.js
// Migration script to migrate all Uni records to Tenant records, and backfill tenantId across all collections

require("dotenv").config();
const { connectDB, closeAllConnections } = require("../config/db");
const Tenant = require("../models/account/Tenant");
const Uni = require("../models/account/Uni");
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const Order = require("../models/order/Order");
const Review = require("../models/order/Review");
const Recipe = require("../models/Recipe");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const Raw = require("../models/item/Raw");
const InventoryReport = require("../models/inventory/InventoryReport");
const GuestHouse = require("../models/account/GuestHouse");
const GuestHouseRoom = require("../models/account/GuestHouseRoom");
const GuestHouseRoomBooking = require("../models/account/GuestHouseRoomBooking");
const logger = require("../utils/pinoLogger");

async function runMigration() {
  try {
    logger.info("Initializing database connection pools...");
    await connectDB();
    logger.info("Database connection pools ready.");

    // 1. Migrate Uni -> Tenant
    logger.info("Scanning Uni configuration collection...");
    const unis = await Uni.find({}).lean();
    logger.info(`Found ${unis.length} university records to migrate.`);

    for (const uni of unis) {
      const slug = uni.fullName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      let tenant = await Tenant.findById(uni._id);
      if (!tenant) {
        tenant = await Tenant.findOne({ slug });
      }

      if (!tenant) {
        logger.info(`Creating Tenant for ${uni.fullName} (slug: ${slug}, id: ${uni._id})`);
        await Tenant.create({
          _id: uni._id, // Keep the same ID for referential integrity
          name: uni.fullName,
          slug,
          status: "active",
          branding: {
            logo: uni.retailImage || "",
            favicon: "",
            primaryColor: "#01796f",
            secondaryColor: "#4ea199",
            font: "Poppins"
          },
          enabledModules: ["food", "hostel", "auditorium"],
          email: uni.email,
          phone: uni.phone,
          password: uni.password,
          isVerified: uni.isVerified || false,
          gstNumber: uni.gstNumber,
          packingCharge: uni.packingCharge ?? 5,
          deliveryCharge: uni.deliveryCharge ?? 50,
          platformFee: uni.platformFee ?? 2,
          categoryImages: uni.categoryImages || []
        });
      } else {
        logger.info(`Tenant already exists for ${uni.fullName}`);
      }
    }

    // Load all current tenant maps
    const tenants = await Tenant.find({}).lean();
    logger.info(`Loaded ${tenants.length} tenants for reference.`);

    // Helper to log updates
    const logUpdate = (name, result) => {
      logger.info(`${name} backfill completed: matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
    };

    // 2. Users & Vendors
    logger.info("Backfilling Users and Vendors...");
    const userRes = await User.updateMany(
      { tenantId: { $exists: false }, uniID: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniID" } } ]
    );
    logUpdate("Users", userRes);

    const vendorRes = await Vendor.updateMany(
      { tenantId: { $exists: false }, uniID: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniID" } } ]
    );
    logUpdate("Vendors", vendorRes);

    // 3. Items (Retail, Produce, Recipe)
    logger.info("Backfilling Items and Recipes...");
    const retailRes = await Retail.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Retail", retailRes);

    const produceRes = await Produce.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Produce", produceRes);

    const recipeRes = await Recipe.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Recipes", recipeRes);

    // 4. Raw Materials (referenced by Vendors)
    logger.info("Backfilling Raw Materials based on Vendor inventories...");
    const vendorsList = await Vendor.find({}).lean();
    let rawUpdatedCount = 0;
    for (const vendor of vendorsList) {
      const vTenantId = vendor.tenantId || vendor.uniID;
      if (vTenantId && vendor.rawMaterialInventory && vendor.rawMaterialInventory.length > 0) {
        const rawIds = vendor.rawMaterialInventory.map(item => item.itemId).filter(Boolean);
        if (rawIds.length > 0) {
          const rawRes = await Raw.updateMany(
            { _id: { $in: rawIds }, tenantId: { $exists: false } },
            { $set: { tenantId: vTenantId } }
          );
          rawUpdatedCount += rawRes.modifiedCount;
        }
      }
    }
    logger.info(`Raw materials backfilled: ${rawUpdatedCount}`);

    // 5. Orders (requires resolving vendorId -> Vendor -> tenantId/uniID)
    logger.info("Backfilling Orders...");
    const orders = await Order.find({ tenantId: { $exists: false } }).lean();
    logger.info(`Found ${orders.length} orders lacking tenantId.`);
    let orderUpdatedCount = 0;
    for (const order of orders) {
      if (order.vendorId) {
        const vendor = await Vendor.findById(order.vendorId).lean();
        const vTenantId = vendor?.tenantId || vendor?.uniID;
        if (vTenantId) {
          const oRes = await Order.updateOne(
            { _id: order._id },
            { $set: { tenantId: vTenantId } }
          );
          orderUpdatedCount += oRes.modifiedCount;
        }
      }
    }
    logger.info(`Orders backfilled successfully: ${orderUpdatedCount}`);

    // 6. Reviews
    logger.info("Backfilling Reviews...");
    const reviewRes = await Review.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Reviews", reviewRes);

    // 7. Inventory Reports
    logger.info("Backfilling Inventory Reports...");
    const reports = await InventoryReport.find({ tenantId: { $exists: false } }).lean();
    logger.info(`Found ${reports.length} reports lacking tenantId.`);
    let reportUpdatedCount = 0;
    for (const report of reports) {
      if (report.vendorId) {
        const vendor = await Vendor.findById(report.vendorId).lean();
        const vTenantId = vendor?.tenantId || vendor?.uniID;
        if (vTenantId) {
          const rRes = await InventoryReport.updateOne(
            { _id: report._id },
            { $set: { tenantId: vTenantId } }
          );
          reportUpdatedCount += rRes.modifiedCount;
        }
      }
    }
    logger.info(`Inventory Reports backfilled: ${reportUpdatedCount}`);

    // 8. Guest House Models
    logger.info("Backfilling Guest Houses...");
    const guestHouseRes = await GuestHouse.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Guest Houses", guestHouseRes);

    logger.info("Backfilling Guest House Rooms...");
    const guestHouseRoomRes = await GuestHouseRoom.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Guest House Rooms", guestHouseRoomRes);

    logger.info("Backfilling Guest House Bookings...");
    const guestHouseBookingRes = await GuestHouseRoomBooking.updateMany(
      { tenantId: { $exists: false }, uniId: { $exists: true, $ne: null } },
      [ { $set: { tenantId: "$uniId" } } ]
    );
    logUpdate("Guest House Bookings", guestHouseBookingRes);

    logger.info("Database migration and backfilling completed successfully!");
  } catch (error) {
    logger.error("Migration execution failed:", error);
    process.exit(1);
  } finally {
    await closeAllConnections();
    logger.info("All connections closed cleanly.");
    process.exit(0);
  }
}

runMigration();
