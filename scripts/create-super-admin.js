// scripts/create-super-admin.js

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/account/Admin");

/**
 * Script to create the first super admin user
 * Usage: node scripts/create-super-admin.js
 */

async function createSuperAdmin() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI_ACCOUNT);
    console.log("✅ Connected to database");

    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      console.log("⚠️  Super admin already exists:", existingSuperAdmin.email);
      console.log("If you want to create a new super admin, please delete the existing one first.");
      process.exit(0);
    }

    // Default super admin credentials
    const superAdminData = {
      username: "superadmin",
      email: "admin@kiitbites.com",
      password: "SuperAdmin123!",
      fullName: "Super Administrator",
      role: "super_admin",
      permissions: {
        viewLocks: true,
        releaseLocks: true,
        clearAllLocks: true,
        viewStats: true,
        manageUsers: true,
        manageVendors: true,
        systemSettings: true
      },
      isActive: true
    };

    // Create super admin
    const superAdmin = new Admin(superAdminData);
    await superAdmin.save();

    console.log("🎉 Super admin created successfully!");
    console.log("📧 Email:", superAdmin.email);
    console.log("👤 Username:", superAdmin.username);
    console.log("🔑 Password:", superAdminData.password);
    console.log("⚠️  Please change the password after first login!");
    console.log("\n🔗 Login URL: http://localhost:5001/api/admin/auth/login");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating super admin:", error);
    
    if (error.code === 11000) {
      console.error("Email or username already exists. Please use different credentials.");
    }
    
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  createSuperAdmin();
}

module.exports = { createSuperAdmin }; 