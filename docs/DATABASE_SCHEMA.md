# BitesBay Database Schema

This document provides a comprehensive overview of the database schema used in BitesBay backend, including all collections, their fields, relationships, and indexing strategies.

**Last Updated:** October 2025

---

## Overview

BitesBay uses MongoDB as the primary database with Mongoose ODM for schema management. The database is organized into logical collections that support the multi-tenant architecture for universities, vendors, and users.

## Database Collections

### 1. User Management Collections

#### Users Collection (`users`)
```javascript
{
  _id: ObjectId,
  fullName: String (required),
  email: String (required, unique, lowercase),
  phone: String (required, unique),
  password: String (required, hashed),
  gender: String (enum: ['male', 'female', 'other']),
  uniID: ObjectId (ref: 'College'),
  isVerified: Boolean (default: false),
  type: String (default: 'user'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `email` (unique)
- `phone` (unique)
- `uniID` (for university-based queries)

#### Vendors Collection (`vendors`)
```javascript
{
  _id: ObjectId,
  fullName: String (required),
  email: String (required, unique, lowercase),
  phone: String (required, unique),
  password: String (required, hashed),
  vendorName: String (required),
  vendorType: String (enum: ['restaurant', 'cafe', 'food_court']),
  uniID: ObjectId (ref: 'College'),
  isVerified: Boolean (default: false),
  isAvailable: String (enum: ['Y', 'N'], default: 'Y'),
  type: String (default: 'vendor'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `email` (unique)
- `phone` (unique)
- `uniID` (for university-based queries)
- `isAvailable` (for availability filtering)

#### Universities Collection (`universities`)
```javascript
{
  _id: ObjectId,
  fullName: String (required),
  email: String (required, unique, lowercase),
  phone: String (required, unique),
  password: String (required, hashed),
  universityName: String (required),
  uniID: ObjectId (ref: 'College'),
  isVerified: Boolean (default: false),
  type: String (default: 'university'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

#### Admins Collection (`admins`)
```javascript
{
  _id: ObjectId,
  fullName: String (required),
  email: String (required, unique, lowercase),
  password: String (required, hashed),
  role: String (enum: ['super_admin', 'admin'], default: 'admin'),
  permissions: [String] (array of permission strings),
  isActive: Boolean (default: true),
  type: String (default: 'admin'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

#### Colleges Collection (`colleges`)
```javascript
{
  _id: ObjectId,
  name: String (required),
  location: String,
  address: String,
  contactEmail: String,
  contactPhone: String,
  isActive: Boolean (default: true),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

### 2. Authentication Collections

#### OTP Collection (`otps`)
```javascript
{
  _id: ObjectId,
  email: String (required),
  otp: String (required, 6 digits),
  createdAt: Date (default: Date.now),
  expiresAt: Date (computed: createdAt + 10 minutes)
}
```

**Indexes:**
- `email` (for quick OTP lookup)
- `createdAt` (TTL index for automatic cleanup)

### 3. Item Management Collections

#### Retail Items Collection (`retails`)
```javascript
{
  _id: ObjectId,
  name: String (required),
  description: String,
  price: Number (required),
  type: String (required, enum: ['snacks', 'beverages', 'desserts', 'other']),
  image: String (URL),
  isAvailable: Boolean (default: true),
  isSpecial: Boolean (default: false),
  vendorId: ObjectId (ref: 'Vendor'),
  uniID: ObjectId (ref: 'College'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `vendorId` (for vendor-specific queries)
- `uniID` (for university-based queries)
- `type` (for category filtering)
- `isAvailable` (for availability filtering)

#### Produce Items Collection (`produces`)
```javascript
{
  _id: ObjectId,
  name: String (required),
  description: String,
  price: Number (required),
  type: String (required, enum: ['fruits', 'vegetables', 'grains', 'other']),
  image: String (URL),
  isAvailable: Boolean (default: true),
  isSpecial: Boolean (default: false),
  vendorId: ObjectId (ref: 'Vendor'),
  uniID: ObjectId (ref: 'College'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

### 4. Order Management Collections

#### Orders Collection (`orders`)
```javascript
{
  _id: ObjectId,
  orderNumber: String (required, unique),
  userId: ObjectId (ref: 'User'),
  vendorId: ObjectId (ref: 'Vendor'),
  items: [{
    itemId: ObjectId,
    name: String,
    price: Number,
    quantity: Number,
    category: String (enum: ['retail', 'produce'])
  }],
  totalAmount: Number (required),
  orderType: String (enum: ['dinein', 'takeaway', 'delivery']),
  status: String (enum: ['pending', 'confirmed', 'inProgress', 'completed', 'delivered', 'cancelled']),
  paymentStatus: String (enum: ['pending', 'completed', 'failed']),
  paymentMethod: String (enum: ['razorpay', 'cod']),
  deliveryAddress: {
    address: String,
    city: String,
    state: String,
    pincode: String
  },
  specialInstructions: String,
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `orderNumber` (unique)
- `userId` (for user order history)
- `vendorId` (for vendor order management)
- `status` (for status-based queries)
- `createdAt` (for time-based queries)

#### Order Counter Collection (`ordercounters`)
```javascript
{
  _id: ObjectId,
  vendorId: ObjectId (ref: 'Vendor'),
  date: String (YYYY-MM-DD format),
  counter: Number (default: 1),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `vendorId_date` (compound unique index)

### 5. Payment Collections

#### Payments Collection (`payments`)
```javascript
{
  _id: ObjectId,
  orderId: ObjectId (ref: 'Order'),
  razorpayOrderId: String,
  razorpayPaymentId: String,
  amount: Number (required),
  currency: String (default: 'INR'),
  status: String (enum: ['pending', 'completed', 'failed', 'refunded']),
  paymentMethod: String,
  refundId: String,
  refundAmount: Number,
  refundReason: String,
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `orderId` (unique)
- `razorpayOrderId` (for payment gateway integration)
- `status` (for payment status queries)

### 6. Cart Collections

#### User Carts Collection (`carts`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'User'),
  vendorId: ObjectId (ref: 'Vendor'),
  items: [{
    itemId: ObjectId,
    name: String,
    price: Number,
    quantity: Number,
    category: String
  }],
  totalAmount: Number (default: 0),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `userId` (unique, for user-specific cart)

#### Vendor Carts Collection (`vendorcarts`)
```javascript
{
  _id: ObjectId,
  vendorId: ObjectId (ref: 'Vendor'),
  items: [{
    itemId: ObjectId,
    name: String,
    price: Number,
    quantity: Number,
    category: String
  }],
  totalAmount: Number (default: 0),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

### 7. Billing Collections

#### Billing Info Collection (`billinginfos`)
```javascript
{
  _id: ObjectId,
  orderNumber: String (required),
  vendorId: ObjectId (ref: 'Vendor'),
  customerPhone: String (required),
  customerName: String,
  items: [{
    name: String,
    price: Number,
    quantity: Number
  }],
  subtotal: Number (required),
  packingCharge: Number (default: 0),
  deliveryCharge: Number (default: 0),
  totalAmount: Number (required),
  paymentStatus: String (enum: ['pending', 'completed', 'failed']),
  paymentMethod: String,
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `orderNumber` (unique)
- `vendorId` (for vendor billing history)
- `customerPhone` (for customer billing history)

### 8. Inventory Collections

#### Inventory Reports Collection (`inventoryreports`)
```javascript
{
  _id: ObjectId,
  vendorId: ObjectId (ref: 'Vendor'),
  date: String (YYYY-MM-DD format),
  items: [{
    itemId: ObjectId,
    name: String,
    category: String,
    quantity: Number,
    price: Number,
    totalValue: Number
  }],
  totalItems: Number,
  totalValue: Number,
  createdAt: Date (default: Date.now)
}
```

**Indexes:**
- `vendorId_date` (compound unique index)

### 9. System Collections

#### Contact Messages Collection (`contactmessages`)
```javascript
{
  _id: ObjectId,
  name: String (required),
  email: String (required),
  subject: String (required),
  message: String (required),
  status: String (enum: ['unread', 'read', 'replied'], default: 'unread'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

## Relationships

### Primary Relationships
1. **User → College** (Many-to-One)
   - Users belong to a specific college/university
   - College manages multiple users

2. **Vendor → College** (Many-to-One)
   - Vendors operate within a specific college
   - College can have multiple vendors

3. **University → College** (One-to-One)
   - University manages a specific college
   - Each college has one university manager

4. **Order → User** (Many-to-One)
   - Users can place multiple orders
   - Each order belongs to one user

5. **Order → Vendor** (Many-to-One)
   - Vendors can receive multiple orders
   - Each order is placed with one vendor

6. **Item → Vendor** (Many-to-One)
   - Vendors can have multiple items
   - Each item belongs to one vendor

### Referential Integrity
- All foreign key references use ObjectId
- Cascade deletion is handled at application level
- Soft deletes are preferred over hard deletes

## Indexing Strategy

### Performance Indexes
1. **Query Optimization**
   - Compound indexes for multi-field queries
   - Text indexes for search functionality
   - Geospatial indexes for location-based queries

2. **Unique Constraints**
   - Email addresses across all user types
   - Phone numbers across all user types
   - Order numbers
   - Payment IDs

3. **TTL Indexes**
   - OTP collection (automatic cleanup)
   - Session data (if implemented)

### Index Maintenance
- Regular index analysis using `explain()`
- Monitor index usage with MongoDB profiler
- Drop unused indexes to improve write performance

## Data Validation

### Schema Validation
- Mongoose schema validation
- Custom validation functions
- Business logic validation at controller level

### Data Integrity
- Input sanitization
- Type checking
- Range validation
- Format validation (email, phone, etc.)

## Backup Strategy

### Automated Backups
- Daily full backups
- Hourly incremental backups
- Point-in-time recovery capability

### Backup Storage
- Local backup storage
- Cloud backup storage (AWS S3, Google Cloud Storage)
- Encrypted backup files

## Security Considerations

### Data Protection
- Encrypted sensitive data (passwords, payment info)
- PII data masking in logs
- Access control at database level

### Connection Security
- TLS/SSL encryption
- Network-level security
- IP whitelisting for production access

## Monitoring and Analytics

### Performance Monitoring
- Query performance tracking
- Index usage monitoring
- Connection pool monitoring

### Business Analytics
- Order volume tracking
- Revenue analytics
- User behavior analysis
- Vendor performance metrics

---

## Migration and Versioning

### Schema Evolution
- Backward-compatible changes
- Migration scripts for breaking changes
- Version control for schema changes

### Data Migration
- Automated migration scripts
- Rollback procedures
- Data validation post-migration

---

## Future Enhancements

### Planned Schema Changes
- Multi-language support
- Advanced analytics collections
- Real-time notification system
- Advanced reporting capabilities

### Performance Improvements
- Read replicas for analytics
- Sharding for horizontal scaling
- Advanced caching strategies 