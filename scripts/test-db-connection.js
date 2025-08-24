#!/usr/bin/env node

/**
 * Test Database Connection
 * This script tests the database connection and model loading
 */

require('dotenv').config();

async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Import database connections
    const { Cluster_User, Cluster_Order, Cluster_Item, Cluster_Inventory, Cluster_Accounts, Cluster_Cache_Analytics } = require('../config/db');
    
    // Wait a bit for connections to establish
    console.log('⏳ Waiting for database connections to establish...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('📊 Database Connection Status:');
    console.log(`   Users: ${Cluster_User.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Orders: ${Cluster_Order.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Items: ${Cluster_Item.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Inventory: ${Cluster_Inventory.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Accounts: ${Cluster_Accounts.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Cache: ${Cluster_Cache_Analytics.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    
    // Test model loading
    console.log('\n🔍 Testing model loading...');
    
    try {
      const Invoice = require('../models/invoice/Invoice');
      console.log('✅ Invoice model loaded successfully');
      
      const Order = require('../models/order/Order');
      console.log('✅ Order model loaded successfully');
      
      const Vendor = require('../models/account/Vendor');
      console.log('✅ Vendor model loaded successfully');
      
      const Uni = require('../models/account/Uni');
      console.log('✅ Uni model loaded successfully');
      
      console.log('\n🎉 All models loaded successfully!');
      
    } catch (modelError) {
      console.error('❌ Model loading failed:', modelError.message);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testDatabaseConnection().then(success => {
    if (success) {
      console.log('\n✅ Database connection test completed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Database connection test failed!');
      process.exit(1);
    }
  });
}

module.exports = { testDatabaseConnection };
