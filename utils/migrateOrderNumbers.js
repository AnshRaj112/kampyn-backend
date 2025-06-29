// Migration script to add orderNumber to existing orders
const mongoose = require("mongoose");
const Order = require("../models/order/Order");
const { Cluster_Order } = require("../config/db");

/**
 * Generates a unique order number for migration with user identification
 * Format: BB-YYYYMMDD-UUUU-XXXXX 
 * Where: BB = BitesBay, UUUU = User ID (last 4 chars), XXXXX = 5-digit sequential number
 */
async function generateOrderNumberForMigration(createdAt, userId) {
  const date = new Date(createdAt);
  const datePrefix = date.getFullYear().toString() + 
                    (date.getMonth() + 1).toString().padStart(2, '0') + 
                    date.getDate().toString().padStart(2, '0');
  
  // Get last 4 characters of user ID for identification
  const userSuffix = userId.toString().slice(-4).toUpperCase();
  
  const baseOrderNumber = `BB-${datePrefix}-${userSuffix}-`;
  
  // Find the highest order number for this user on this date
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  
  const lastOrder = await Order.findOne({
    orderNumber: { $regex: `^${baseOrderNumber}` },
    createdAt: { $gte: dayStart, $lt: dayEnd }
  }).sort({ orderNumber: -1 }).select('orderNumber').lean();
  
  let sequenceNumber = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('-')[3]);
    sequenceNumber = lastSequence + 1;
  }
  
  return `${baseOrderNumber}${sequenceNumber.toString().padStart(5, '0')}`;
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
        const orderNumber = await generateOrderNumberForMigration(order.createdAt, order.userId);
        
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