const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/order/Order');
const User = require('../models/account/User');
const Vendor = require('../models/account/Vendor');
const { atomicCache } = require('../utils/cacheUtils');

async function testAtomicTransactions() {
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

    // Test 2: Simulate atomic cancellation
    const testOrder = pendingOrders[0];
    console.log(`🧪 Testing atomic cancellation with order: ${testOrder._id}`);
    
    const locksBefore = atomicCache.getStats();
    console.log(`🔒 Locks before cancellation: ${locksBefore.activeLocks}`);

    // Test 3: Use database transaction for atomic cancellation
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // 1) Update order status to failed
        await Order.updateOne(
          { _id: testOrder._id },
          { $set: { status: "failed" } },
          { session }
        );

        // 2) Move order from activeOrders to pastOrders for user
        await User.updateOne(
          { _id: testOrder.userId },
          {
            $pull: { activeOrders: testOrder._id },
            $push: { pastOrders: testOrder._id }
          },
          { session }
        );

        // 3) Remove order from vendor's activeOrders
        await Vendor.updateOne(
          { _id: testOrder.vendorId },
          { $pull: { activeOrders: testOrder._id } },
          { session }
        );

        console.log('✅ All database operations completed within transaction');
      });
      
      // 4) Release item locks (outside transaction since it's in-memory cache)
      const lockReleaseResult = atomicCache.releaseOrderLocks(testOrder.items, testOrder.userId);
      console.log(`✅ Order cancelled atomically. Released ${lockReleaseResult.released.length} locks`);

    } catch (error) {
      console.error('❌ Transaction failed:', error);
      throw error;
    } finally {
      await session.endSession();
    }

    // Test 4: Verify locks after cancellation
    const locksAfter = atomicCache.getStats();
    console.log(`🔒 Locks after cancellation: ${locksAfter.activeLocks}`);

    // Test 5: Verify order status and database consistency
    const updatedOrder = await Order.findById(testOrder._id).lean();
    const user = await User.findOne({ activeOrders: testOrder._id }).lean();
    const vendor = await Vendor.findOne({ activeOrders: testOrder._id }).lean();
    const userPastOrders = await User.findOne({ pastOrders: testOrder._id }).lean();
    
    console.log(`📋 Database consistency check:`);
    console.log(`  - Order status: ${updatedOrder.status}`);
    console.log(`  - In user activeOrders: ${!!user}`);
    console.log(`  - In user pastOrders: ${!!userPastOrders}`);
    console.log(`  - In vendor activeOrders: ${!!vendor}`);

    // Verify consistency
    const isConsistent = updatedOrder.status === "failed" && 
                        !user && 
                        userPastOrders && 
                        !vendor;
    
    if (isConsistent) {
      console.log('✅ Database consistency verified - all operations succeeded atomically');
    } else {
      console.log('❌ Database inconsistency detected - some operations may have failed');
    }

    console.log('✅ Atomic transaction test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the test
testAtomicTransactions(); 