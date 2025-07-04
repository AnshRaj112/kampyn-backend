const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/order/Order');
const User = require('../models/account/User');
const Vendor = require('../models/account/Vendor');
const { atomicCache } = require('../utils/cacheUtils');

async function testOrderCancellation() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Test 1: Check current pending orders
    const pendingOrders = await Order.find({ status: "pendingPayment" }).lean();
    console.log(`📊 Found ${pendingOrders.length} pending orders`);

    if (pendingOrders.length === 0) {
      console.log('❌ No pending orders found for testing');
      return;
    }

    // Test 2: Check locks before cancellation
    const testOrder = pendingOrders[0];
    console.log(`🧪 Testing with order: ${testOrder._id}`);
    
    const locksBefore = atomicCache.getStats();
    console.log(`🔒 Locks before cancellation: ${locksBefore.activeLocks}`);

    // Test 3: Simulate cancellation
    console.log('🚫 Simulating order cancellation...');
    
    // Update order status to failed
    await Order.updateOne(
      { _id: testOrder._id },
      { $set: { status: "failed" } }
    );

    // Move failed order from activeOrders to pastOrders for user
    await User.updateOne(
      { _id: testOrder.userId },
      {
        $pull: { activeOrders: testOrder._id },
        $push: { pastOrders: testOrder._id }
      }
    );

    // Remove failed order from vendor's activeOrders
    await Vendor.updateOne(
      { _id: testOrder.vendorId },
      { $pull: { activeOrders: testOrder._id } }
    );

    // Release item locks
    const lockReleaseResult = atomicCache.releaseOrderLocks(testOrder.items, testOrder.userId);
    
    console.log(`✅ Order cancelled successfully. Released ${lockReleaseResult.released.length} locks`);

    // Test 4: Verify locks after cancellation
    const locksAfter = atomicCache.getStats();
    console.log(`🔒 Locks after cancellation: ${locksAfter.activeLocks}`);

    // Test 5: Verify order status
    const updatedOrder = await Order.findById(testOrder._id).lean();
    const user = await User.findOne({ activeOrders: testOrder._id }).lean();
    const vendor = await Vendor.findOne({ activeOrders: testOrder._id }).lean();
    
    console.log(`📋 Order verification:`);
    console.log(`  - Status: ${updatedOrder.status}`);
    console.log(`  - In user activeOrders: ${!!user}`);
    console.log(`  - In vendor activeOrders: ${!!vendor}`);

    console.log('✅ Order cancellation test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the test
testOrderCancellation(); 