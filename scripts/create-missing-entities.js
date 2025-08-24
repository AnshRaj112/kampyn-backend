const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Admin = require('../models/account/Admin');

async function createMissingEntities() {
  try {
    console.log('🔧 Creating missing entities for invoice generation...\n');
    
    // Connect to database
    const mongoUri = process.env.MONGO_URI_ACCOUNT;
    if (!mongoUri) {
      console.error('❌ MONGO_URI_ACCOUNT not found in environment variables');
      return;
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database\n');
    
    // Check and create university if missing
    console.log('🏫 Checking/Creating University...');
    let university = await Uni.findOne({});
    
    if (!university) {
      console.log('Creating KIIT University...');
      university = new Uni({
        fullName: 'KIIT University',
        shortName: 'KIIT',
        address: 'KIIT University Campus, Bhubaneswar, Odisha',
        contact: '+91-674-2725113',
        email: 'info@kiit.ac.in',
        website: 'https://kiit.ac.in',
        isActive: true
      });
      await university.save();
      console.log('✅ Created university:', university.fullName);
    } else {
      console.log('✅ University already exists:', university.fullName);
    }
    
    // Check and create vendor if missing
    console.log('\n📋 Checking/Creating Vendor...');
    let vendor = await Vendor.findOne({});
    
    if (!vendor) {
      console.log('Creating sample vendor...');
      vendor = new Vendor({
        name: 'Sample Food Vendor',
        phone: '+91-9876543210',
        email: 'vendor@bitesbay.com',
        address: 'KIIT University Campus, Bhubaneswar, Odisha',
        uniID: university._id,
        isActive: true,
        offersDelivery: true,
        deliveryPreparationTime: 30,
        packingCharge: 5,
        deliveryCharge: 50
      });
      await vendor.save();
      console.log('✅ Created vendor:', vendor.name);
    } else {
      console.log('✅ Vendor already exists:', vendor.name);
      
      // Update vendor's uniID if not set
      if (!vendor.uniID) {
        console.log('Updating vendor uniID...');
        vendor.uniID = university._id;
        await vendor.save();
        console.log('✅ Updated vendor uniID');
      }
    }
    
    // Check and create admin if missing
    console.log('\n👨‍💼 Checking/Creating Admin...');
    let admin = await Admin.findOne({ role: 'super_admin' });
    
    if (!admin) {
      console.log('Creating super-admin...');
      admin = new Admin({
        username: 'admin',
        email: 'admin@bitesbay.com',
        password: 'admin123', // You should change this in production
        fullName: 'Super Administrator',
        role: 'super_admin',
        isActive: true,
        permissions: {
          viewLocks: true,
          releaseLocks: true,
          clearAllLocks: true,
          viewStats: true,
          manageUsers: true,
          manageVendors: true,
          systemSettings: true
        }
      });
      await admin.save();
      console.log('✅ Created super-admin:', admin.username);
    } else {
      console.log('✅ Super-admin already exists:', admin.username);
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`University: ✅ ${university.fullName}`);
    console.log(`Vendor: ✅ ${vendor.name}`);
    console.log(`Super-Admin: ✅ ${admin.username}`);
    
    console.log('\n✅ All required entities created. Invoice generation should now work!');
    
    // Test the entities
    console.log('\n🧪 Testing entity relationships...');
    const testVendor = await Vendor.findById(vendor._id).populate('uniID');
    const testUni = await Uni.findById(university._id);
    const testAdmin = await Admin.findOne({ role: 'super-admin' });
    
    if (testVendor && testUni && testAdmin) {
      console.log('✅ Entity relationships verified:');
      console.log(`  Vendor ${testVendor.name} -> University ${testVendor.uniID.fullName}`);
      console.log(`  Admin ${testAdmin.username} has role ${testAdmin.role}`);
    } else {
      console.log('❌ Entity relationships verification failed');
    }
    
  } catch (error) {
    console.error('❌ Error creating entities:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the creation
createMissingEntities();
