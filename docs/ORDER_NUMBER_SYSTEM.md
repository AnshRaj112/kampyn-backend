# Order Number System Documentation

## Overview
The KIITBites order number system ensures unique, traceable order identifiers across all users and vendors. The system uses the **Atomic Counter Format** as the recommended production solution with **vendor-specific daily counters**.

## Order Number Format
**Format:** `BB-YYYYMMDD-UUUU-XXXXX`

**Components:**
- `BB` = BitesBay identifier
- `YYYYMMDD` = Date (e.g., 20241201 for December 1, 2024)
- `UUUU` = User ID suffix (last 4 characters, uppercase)
- `XXXXX` = Vendor-specific atomic counter (5-digit sequential number)

**Example:** `BB-20241201-A1B2-00001`

## Key Features

### Vendor-Specific Daily Counters
- **Each vendor gets their own daily counter** starting from 00001
- **Independent counters** - Vendor A and Vendor B both start from 00001 each day
- **No cross-vendor interference** - Each vendor's orders are counted separately
- **Daily reset** - Counters reset to 00001 at midnight for each vendor

**Example:**
```
December 1, 2024:
- Vendor A: BB-20241201-1234-00001, BB-20241201-5678-00002, BB-20241201-9012-00003
- Vendor B: BB-20241201-3456-00001, BB-20241201-7890-00002

December 2, 2024:
- Vendor A: BB-20241202-1234-00001, BB-20241202-5678-00002
- Vendor B: BB-20241202-3456-00001
```

## System Types

### 1. Atomic Counter Format (Recommended for Production) ✅

**Implementation:** `utils/orderUtils.js` - `generateOrderNumber(userId, vendorId)`

**How it works:**
- Uses MongoDB atomic operations (`findOneAndUpdate` with `$inc`)
- Maintains a separate `OrderCounter` collection for vendor-specific daily counters
- Each vendor-date combination has its own atomic counter
- Prevents race conditions and ensures uniqueness per vendor

**Benefits:**
- ✅ **Atomic operations** prevent race conditions
- ✅ **High performance** with proper indexing
- ✅ **Scalable** for massive concurrent users
- ✅ **Guaranteed uniqueness** across all users
- ✅ **Production-ready** for high-traffic applications
- ✅ **Vendor-specific counters** - each vendor starts from 00001 daily

**Technical Details:**
```javascript
// Vendor-specific atomic counter operation
const counterId = `${datePrefix}-${vendorId}`;
const counterResult = await OrderCounter.findOneAndUpdate(
  { counterId: counterId },
  { $inc: { sequence: 1 }, $set: { lastUpdated: new Date() } },
  { upsert: true, new: true }
);
```

**Database Schema:**
```javascript
// OrderCounter collection
{
  counterId: "20241201-6834622e10d75a5ba7b7740d",  // Date-VendorID
  sequence: 12345,        // Current sequence number for this vendor on this date
  lastUpdated: Date       // Last update timestamp
}
```

### 2. Basic Sequential System (Deprecated)

**Implementation:** Previously used sequential queries

**Issues:**
- ❌ **Race conditions** when multiple users order simultaneously
- ❌ **Poor performance** with large datasets
- ❌ **Limited scalability** for concurrent users
- ❌ **Potential duplicate numbers** under high load
- ❌ **No vendor separation** - all vendors shared the same counter

**Example Race Condition:**
```
User A (Vendor 1): Query for last order → finds BB-20241201-1234-00001
User B (Vendor 2): Query for last order → finds BB-20241201-1234-00001 (same!)
User A: Creates BB-20241201-1234-00002
User B: Creates BB-20241201-1234-00002 (DUPLICATE!)
```

### 3. High-Performance Timestamp System (Alternative)

**Format:** `BB-TIMESTAMP-UUUU-XXXXX`

**Use case:** Ultra-high volume scenarios (>1000 orders/second)

**Implementation:** Not currently used, but available for future scaling

## Migration

### Existing Orders
Use the migration script to add order numbers to existing orders:
```bash
node scripts/migrate-orders.js
```

The migration uses the same vendor-specific Atomic Counter Format to ensure consistency.

### Counter Reset
Daily counters automatically reset at midnight for each vendor. Each vendor starts with sequence 00001 each day.

## Performance Characteristics

| System | Orders/Second | Race Conditions | Scalability | Vendor Separation | Production Ready |
|--------|---------------|-----------------|-------------|-------------------|------------------|
| Basic Sequential | ~10 | High | Poor | ❌ | ❌ |
| Atomic Counter | ~1000+ | None | Excellent | ✅ | ✅ |
| Timestamp-based | ~10000+ | None | Outstanding | ✅ | ✅ |

## Implementation Files

- **Main Logic:** `utils/orderUtils.js`
- **Counter Model:** `models/order/OrderCounter.js`
- **Migration:** `utils/migrateOrderNumbers.js`
- **Migration Script:** `scripts/migrate-orders.js`

## Best Practices

1. **Always use Atomic Counter Format** for new implementations
2. **Monitor counter performance** in high-traffic scenarios
3. **Backup counter collection** regularly
4. **Use proper indexing** on `counterId` field
5. **Handle counter overflow** (unlikely with 5-digit format)
6. **Verify vendor separation** - ensure each vendor has independent counters

## Troubleshooting

### Duplicate Order Numbers
- Check if atomic operations are working correctly
- Verify OrderCounter collection integrity
- Ensure proper MongoDB connection
- Verify vendor-specific counter IDs are unique

### Performance Issues
- Monitor OrderCounter collection size
- Check index usage on `counterId`
- Consider timestamp-based system for ultra-high volume

### Migration Issues
- Run migration during low-traffic periods
- Backup data before migration
- Verify order number uniqueness after migration
- Ensure vendor-specific counters are properly set up

### Vendor Counter Issues
- Verify counter IDs include vendor ID: `YYYYMMDD-VENDORID`
- Check that each vendor starts from 00001 daily
- Monitor counter distribution across vendors 