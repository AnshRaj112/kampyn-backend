const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Admin = require('../models/account/Admin');
const Order = require('../models/order/Order');

async function checkInvoiceEntities() {
  try {
    console.log('🔍 Checking invoice generation entities...\n');
    
    // Connect to database
    const mongoUri = process.env.MONGO_URI_ACCOUNT;
    if (!mongoUri) {
      console.error('❌ MONGO_URI_ACCOUNT not found in environment variables');
      return;
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database\n');
    
    // Check for vendors
    console.log('📋 Checking Vendors...');
    const vendors = await Vendor.find({}).select('name _id uniID phone email address').lean();
    console.log(`Found ${vendors.length} vendors`);
    
    if (vendors.length === 0) {
      console.log('❌ No vendors found - this will cause invoice generation to fail');
    } else {
      console.log('✅ Vendors found');
      vendors.forEach(vendor => {
        console.log(`  - ${vendor.name} (ID: ${vendor._id}) - UniID: ${vendor.uniID || 'NOT SET'}`);
      });
    }
    
    // Check for universities
    console.log('\n🏫 Checking Universities...');
    const universities = await Uni.find({}).select('fullName _id').lean();
    console.log(`Found ${universities.length} universities`);
    
    if (universities.length === 0) {
      console.log('❌ No universities found - this will cause invoice generation to fail');
    } else {
      console.log('✅ Universities found');
      universities.forEach(uni => {
        console.log(`  - ${uni.fullName} (ID: ${uni._id})`);
      });
    }
    
    // Check for admins
    console.log('\n👨‍💼 Checking Admins...');
    const admins = await Admin.find({}).select('username role _id').lean();
    console.log(`Found ${admins.length} admins`);
    
    const superAdmin = admins.find(admin => admin.role === 'super-admin');
    if (!superAdmin) {
      console.log('❌ No super-admin found - this will cause invoice generation to fail');
    } else {
      console.log('✅ Super-admin found');
      console.log(`  - ${superAdmin.username} (Role: ${superAdmin.role})`);
    }
    
    // Check for orders
    console.log('\n📦 Checking Orders...');
    const orders = await Order.find({}).select('orderNumber vendorId total createdAt').lean();
    console.log(`Found ${orders.length} orders`);
    
    if (orders.length === 0) {
      console.log('❌ No orders found');
    } else {
      console.log('✅ Orders found');
      orders.slice(0, 5).forEach(order => {
        console.log(`  - ${order.orderNumber} (Vendor: ${order.vendorId}, Total: ${order.total})`);
      });
      if (orders.length > 5) {
        console.log(`  ... and ${orders.length - 5} more orders`);
      }
    }
    
    // Check for orphaned orders (orders without valid vendors)
    console.log('\n🔍 Checking for orphaned orders...');
    const orphanedOrders = [];
    for (const order of orders) {
      if (order.vendorId) {
        const vendor = await Vendor.findById(order.vendorId);
        if (!vendor) {
          orphanedOrders.push(order);
        }
      }
    }
    
    if (orphanedOrders.length > 0) {
      console.log(`❌ Found ${orphanedOrders.length} orphaned orders (orders without valid vendors)`);
      orphanedOrders.forEach(order => {
        console.log(`  - ${order.orderNumber} (Vendor ID: ${order.vendorId} - NOT FOUND)`);
      });
    } else {
      console.log('✅ No orphaned orders found');
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`Vendors: ${vendors.length > 0 ? '✅' : '❌'} (${vendors.length})`);
    console.log(`Universities: ${universities.length > 0 ? '✅' : '❌'} (${universities.length})`);
    console.log(`Super-Admin: ${superAdmin ? '✅' : '❌'}`);
    console.log(`Orders: ${orders.length > 0 ? '✅' : '❌'} (${orders.length})`);
    console.log(`Orphaned Orders: ${orphanedOrders.length > 0 ? '❌' : '✅'} (${orphanedOrders.length})`);
    
    if (vendors.length === 0 || universities.length === 0 || !superAdmin) {
      console.log('\n🚨 INVOICE GENERATION WILL FAIL!');
      console.log('Missing required entities. Please create the missing entities first.');
    } else {
      console.log('\n✅ All required entities found. Invoice generation should work.');
    }
    
  } catch (error) {
    console.error('❌ Error checking entities:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the check
checkInvoiceEntities();
