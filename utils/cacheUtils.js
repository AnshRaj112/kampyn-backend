/**
 * In-Memory Cache with Atomic Operations
 * Implements Lua-like atomic operations to prevent race conditions
 */

class AtomicCache {
  constructor() {
    this.locks = new Map();
    this.cleanupInterval = null;
    this.startCleanup();
    
    // Handle graceful shutdown
    process.on('exit', () => this.stopCleanup());
    process.on('SIGINT', () => {
      this.stopCleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.stopCleanup();
      process.exit(0);
    });
  }

  /**
   * Atomic operation to acquire a lock for an item
   * Returns true if lock acquired, false if already locked
   */
  acquireLock(itemId, userId, ttlMs = 5 * 60 * 1000) { // 5 minutes default
    const lockKey = `lock:${itemId}`;
    const now = Date.now();
    
    // Check if lock exists and is still valid
    const existingLock = this.locks.get(lockKey);
    if (existingLock && existingLock.expiresAt > now) {
      return false; // Lock is still active
    }
    
    // Acquire lock atomically
    const lockData = {
      userId: userId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      itemId: itemId
    };
    
    this.locks.set(lockKey, lockData);
    return true;
  }

  /**
   * Release a lock for an item
   * Returns true if lock was released, false if lock didn't exist
   */
  releaseLock(itemId, userId) {
    const lockKey = `lock:${itemId}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) {
      return false; // No lock exists
    }
    
    // Only the user who acquired the lock can release it
    if (lock.userId !== userId) {
      return false; // Not authorized to release this lock
    }
    
    this.locks.delete(lockKey);
    return true;
  }

  /**
   * Check if an item is locked
   */
  isLocked(itemId) {
    const lockKey = `lock:${itemId}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) {
      return false;
    }
    
    // Check if lock has expired
    if (lock.expiresAt <= Date.now()) {
      this.locks.delete(lockKey);
      return false;
    }
    
    return true;
  }

  /**
   * Get lock information for an item
   */
  getLockInfo(itemId) {
    const lockKey = `lock:${itemId}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) {
      return null;
    }
    
    // Check if lock has expired
    if (lock.expiresAt <= Date.now()) {
      this.locks.delete(lockKey);
      return null;
    }
    
    return {
      userId: lock.userId,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
      remainingTime: lock.expiresAt - Date.now()
    };
  }

  /**
   * Atomic operation to reserve items in cart
   * This is the core function that prevents race conditions
   */
  async reserveItemsInCart(cartItems, userId, vendorId) {
    const reservations = [];
    const failedItems = [];
    
    // First pass: try to acquire locks for all items
    for (const item of cartItems) {
      const lockKey = `lock:${item.itemId}`;
      
      if (this.acquireLock(item.itemId, userId)) {
        reservations.push({
          itemId: item.itemId,
          kind: item.kind,
          quantity: item.quantity,
          lockKey: lockKey
        });
      } else {
        failedItems.push({
          itemId: item.itemId,
          kind: item.kind,
          quantity: item.quantity,
          reason: 'Item is currently being processed by another user'
        });
      }
    }
    
    // If any items failed to lock, release all acquired locks
    if (failedItems.length > 0) {
      for (const reservation of reservations) {
        this.releaseLock(reservation.itemId, userId);
      }
      return {
        success: false,
        failedItems: failedItems,
        message: 'Some items are currently unavailable'
      };
    }
    
    return {
      success: true,
      reservations: reservations,
      message: 'All items reserved successfully'
    };
  }

  /**
   * Release all locks for a user's order
   */
  releaseOrderLocks(orderItems, userId) {
    const released = [];
    const failed = [];
    
    for (const item of orderItems) {
      if (this.releaseLock(item.itemId, userId)) {
        released.push(item.itemId);
      } else {
        failed.push(item.itemId);
      }
    }
    
    return { released, failed };
  }

  /**
   * Cleanup expired locks
   */
  cleanupExpiredLocks() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.locks.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      console.info(`Cleaned up ${expiredKeys.length} expired locks`);
    }
  }

  /**
   * Start automatic cleanup of expired locks
   */
  startCleanup() {
    // Clean up expired locks every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
    }, 30000);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.info("Cache cleanup stopped");
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      activeLocks: this.locks.size,
      lockKeys: Array.from(this.locks.keys()),
      timestamp: new Date()
    };
  }

  /**
   * Clear all locks (for testing/debugging)
   */
  clearAllLocks() {
    const count = this.locks.size;
    this.locks.clear();
    return count;
  }

  /**
   * Get detailed lock information for debugging
   */
  getDetailedStats() {
    const now = Date.now();
    const activeLocks = [];
    const expiredLocks = [];
    
    for (const [key, lock] of this.locks.entries()) {
      const lockInfo = {
        key,
        userId: lock.userId,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt,
        remainingTime: lock.expiresAt - now,
        isExpired: lock.expiresAt <= now
      };
      
      if (lock.expiresAt <= now) {
        expiredLocks.push(lockInfo);
      } else {
        activeLocks.push(lockInfo);
      }
    }
    
    return {
      totalLocks: this.locks.size,
      activeLocks: activeLocks.length,
      expiredLocks: expiredLocks.length,
      activeLockDetails: activeLocks,
      expiredLockDetails: expiredLocks,
      timestamp: new Date()
    };
  }
}

// Create a singleton instance
const atomicCache = new AtomicCache();

module.exports = {
  atomicCache,
  AtomicCache
}; 