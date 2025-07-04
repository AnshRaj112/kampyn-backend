const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/order/Order');
const User = require('../models/account/User');
const Vendor = require('../models/account/Vendor');
const { cleanupExpiredOrders } = require('../utils/orderCleanupUtils');

async function testOrderCleanup() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Test 1: Check current expired orders
    const now = new Date();
    const expiredOrders = await Order.find({
      status: "pendingPayment",
      reservationExpiresAt: { $lt: now }
    }).lean();
    
    console.log(`📊 Found ${expiredOrders.length} expired orders`);

    // Test 2: Run cleanup
    console.log('🧹 Running cleanup...');
    const result = await cleanupExpiredOrders();
    console.log('✅ Cleanup result:', result);

    // Test 3: Verify orders were moved to past orders
    if (result.cleaned > 0) {
      for (const orderId of expiredOrders.map(o => o._id)) {
        const order = await Order.findById(orderId).lean();
        const user = await User.findOne({ activeOrders: orderId }).lean();
        const vendor = await Vendor.findOne({ activeOrders: orderId }).lean();
        
        console.log(`Order ${orderId}:`);
        console.log(`  - Status: ${order.status}`);
        console.log(`  - In user activeOrders: ${!!user}`);
        console.log(`  - In vendor activeOrders: ${!!vendor}`);
      }
    }

    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the test
testOrderCleanup(); 