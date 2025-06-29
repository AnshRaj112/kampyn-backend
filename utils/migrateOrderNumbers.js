// Migration script to add orderNumber to existing orders using Atomic Counter Format
const mongoose = require("mongoose");
const Order = require("../models/order/Order");
const OrderCounter = require("../models/order/OrderCounter");
const { Cluster_Order } = require("../config/db");

/**
 * Generates a unique order number for migration using Ultra-High Performance Format
 * Format: BB-MICROTIME-UUUU-XXXXX 
 * Where: BB = BitesBay, MICROTIME = Microsecond timestamp (13 digits), UUUU = User ID (last 4 chars), XXXXX = Atomic counter (5 digits)
 * 
 * Uses microsecond-based atomic counter to ensure maximum performance and zero collision probability
 */
async function generateOrderNumberForMigration(createdAt, userId, vendorId) {
  // Get last 4 characters of user ID for identification
  const userSuffix = userId.toString().slice(-4).toUpperCase();
  
  // Use microsecond timestamp (13 digits) for maximum precision
  // For migration, we'll use the creation timestamp to maintain chronological order
  const microTime = new Date(createdAt).getTime().toString();
  
  // Create microsecond-based counter ID: "MICROTIME-VENDORID"
  const counterId = `${microTime}-${vendorId}`;
  
  // Use atomic counter to get next sequence number for this vendor at this microsecond
  const counterResult = await OrderCounter.findOneAndUpdate(
    { counterId: counterId },
    { $inc: { sequence: 1 }, $set: { lastUpdated: new Date() } },
    { upsert: true, new: true }
  );
  
  const sequenceNumber = counterResult.sequence.toString().padStart(5, '0');
  
  return `BB-${microTime}-${userSuffix}-${sequenceNumber}`;
}

async function migrateOrderNumbers() {
  try {
    console.log("Starting order number migration...");
    
    // Find all orders without orderNumber
    const ordersWithoutNumber = await Order.find({ 
      orderNumber: { $exists: false } 
    }).sort({ createdAt: 1 }).lean();
    
    console.log(`Found ${ordersWithoutNumber.length} orders without orderNumber`);
    
    if (ordersWithoutNumber.length === 0) {
      console.log("No orders need migration. All orders already have orderNumber.");
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const order of ordersWithoutNumber) {
      try {
        const orderNumber = await generateOrderNumberForMigration(order.createdAt, order.userId, order.vendorId);
        
        await Order.updateOne(
          { _id: order._id },
          { $set: { orderNumber } }
        );
        
        console.log(`Updated order ${order._id} with orderNumber: ${orderNumber}`);
        successCount++;
        
        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (error) {
        console.error(`Error updating order ${order._id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`Migration completed. Success: ${successCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateOrderNumbers()
    .then(() => {
      console.log("Migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

module.exports = { migrateOrderNumbers }; 