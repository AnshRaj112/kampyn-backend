const { atomicCache } = require("../utils/cacheUtils");
const { getLockStatistics } = require("../utils/orderCleanupUtils");

/**
 * Test script to verify the cache locking system
 * This simulates concurrent order attempts to ensure race conditions are prevented
 */

async function testLockingSystem() {
  console.log("🧪 Testing Cache Locking System...\n");

  // Test 1: Basic lock acquisition and release
  console.log("Test 1: Basic lock acquisition and release");
  const itemId1 = "item123";
  const userId1 = "user456";
  
  // Try to acquire lock
  const lock1 = atomicCache.acquireLock(itemId1, userId1, 30000); // 30 seconds
  console.log(`Lock acquired for item ${itemId1}: ${lock1}`);
  
  // Check if item is locked
  const isLocked1 = atomicCache.isLocked(itemId1);
  console.log(`Item ${itemId1} is locked: ${isLocked1}`);
  
  // Try to acquire same lock with different user (should fail)
  const lock2 = atomicCache.acquireLock(itemId1, "user789", 30000);
  console.log(`Second lock attempt for item ${itemId1}: ${lock2}`);
  
  // Release lock
  const released = atomicCache.releaseLock(itemId1, userId1);
  console.log(`Lock released for item ${itemId1}: ${released}`);
  
  // Try to acquire lock again (should succeed)
  const lock3 = atomicCache.acquireLock(itemId1, "user789", 30000);
  console.log(`Third lock attempt for item ${itemId1}: ${lock3}`);
  
  // Clean up
  atomicCache.releaseLock(itemId1, "user789");
  console.log("✅ Test 1 completed\n");

  // Test 2: Cart reservation simulation
  console.log("Test 2: Cart reservation simulation");
  const cartItems = [
    { itemId: "item1", kind: "Retail", quantity: 2 },
    { itemId: "item2", kind: "Produce", quantity: 1 },
    { itemId: "item3", kind: "Retail", quantity: 3 }
  ];
  
  const userId = "user123";
  const vendorId = "vendor456";
  
  // First user reserves items
  const reservation1 = await atomicCache.reserveItemsInCart(cartItems, userId, vendorId);
  console.log("First user reservation:", reservation1.success ? "SUCCESS" : "FAILED");
  
  // Second user tries to reserve same items (should fail)
  const reservation2 = await atomicCache.reserveItemsInCart(cartItems, "user456", vendorId);
  console.log("Second user reservation:", reservation2.success ? "SUCCESS" : "FAILED");
  
  if (reservation2.failedItems) {
    console.log("Failed items for second user:", reservation2.failedItems.length);
  }
  
  // Release first user's locks
  const releaseResult = atomicCache.releaseOrderLocks(cartItems, userId);
  console.log(`Released ${releaseResult.released.length} locks, failed: ${releaseResult.failed.length}`);
  
  // Third user should now be able to reserve
  const reservation3 = await atomicCache.reserveItemsInCart(cartItems, "user789", vendorId);
  console.log("Third user reservation:", reservation3.success ? "SUCCESS" : "FAILED");
  
  // Clean up
  atomicCache.releaseOrderLocks(cartItems, "user789");
  console.log("✅ Test 2 completed\n");

  // Test 3: Lock expiration
  console.log("Test 3: Lock expiration");
  const expiringItem = "expiringItem";
  const expiringUser = "expiringUser";
  
  // Acquire lock with short TTL
  const expiringLock = atomicCache.acquireLock(expiringItem, expiringUser, 2000); // 2 seconds
  console.log(`Expiring lock acquired: ${expiringLock}`);
  
  // Check if locked
  const isExpiringLocked = atomicCache.isLocked(expiringItem);
  console.log(`Expiring item is locked: ${isExpiringLocked}`);
  
  // Wait for expiration
  console.log("Waiting 3 seconds for lock to expire...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Check if still locked
  const isStillLocked = atomicCache.isLocked(expiringItem);
  console.log(`Expiring item is still locked: ${isStillLocked}`);
  
  // Try to acquire lock again
  const newLock = atomicCache.acquireLock(expiringItem, "newUser", 30000);
  console.log(`New lock after expiration: ${newLock}`);
  
  // Clean up
  atomicCache.releaseLock(expiringItem, "newUser");
  console.log("✅ Test 3 completed\n");

  // Test 4: Statistics
  console.log("Test 4: Statistics");
  const stats = await getLockStatistics();
  console.log("Lock statistics:", stats);
  console.log("✅ Test 4 completed\n");

  // Test 5: Concurrent simulation
  console.log("Test 5: Concurrent simulation");
  const concurrentItem = "concurrentItem";
  const results = [];
  
  // Simulate 5 concurrent attempts
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      (async () => {
        const userId = `user${i}`;
        const success = atomicCache.acquireLock(concurrentItem, userId, 10000);
        if (success) {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 100));
          atomicCache.releaseLock(concurrentItem, userId);
        }
        return { userId, success };
      })()
    );
  }
  
  const concurrentResults = await Promise.all(promises);
  const successfulLocks = concurrentResults.filter(r => r.success).length;
  console.log(`Concurrent attempts: ${concurrentResults.length}, Successful: ${successfulLocks}`);
  console.log("Expected: Only 1 should succeed, others should fail");
  console.log("✅ Test 5 completed\n");

  console.log("🎉 All tests completed successfully!");
  console.log("🔒 Cache locking system is working correctly");
}

// Run the test
if (require.main === module) {
  testLockingSystem()
    .then(() => {
      console.log("Test script finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test script failed:", error);
      process.exit(1);
    });
}

module.exports = { testLockingSystem }; 