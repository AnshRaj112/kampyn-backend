# KAMPYN Backend - Architecture Guide

*Project under **EXSOLVIA** - Excellence in Software Solutions*

## System Architecture

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Mobile App    │    │   Admin Panel   │
│   (Next.js)     │    │   (React Native)│    │   (Next.js)     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      Load Balancer        │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │     KAMPYN Backend        │
                    │    (Node.js/Express)      │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────┴───────┐    ┌─────────┴───────┐    ┌─────────┴───────┐
│    MongoDB      │    │     Redis       │    │   Cloudinary    │
│   (Database)    │    │    (Cache)      │    │  (File Storage) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Component Architecture

#### Core Components
1. **API Gateway Layer**
   - Request routing and load balancing
   - Authentication and authorization
   - Rate limiting and throttling
   - Request/response transformation

2. **Business Logic Layer**
   - Controllers for handling requests
   - Service layer for business logic
   - Data validation and processing
   - Error handling and logging

3. **Data Access Layer**
   - Database models and schemas
   - Query optimization and caching
   - Data migration and seeding
   - Backup and recovery

4. **Integration Layer**
   - Third-party service integrations
   - Webhook handling
   - Real-time communication
   - External API management

## Database Design

### MongoDB Collections

#### User Management
```javascript
// Users Collection
{
  _id: ObjectId,
  fullName: String,
  email: String,
  phone: String,
  password: String (hashed),
  role: String, // 'user', 'vendor', 'admin', 'uni'
  uniID: ObjectId,
  isVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Universities Collection
{
  _id: ObjectId,
  name: String,
  address: String,
  contactInfo: Object,
  settings: Object,
  isActive: Boolean
}
```

#### Order Management
```javascript
// Orders Collection
{
  _id: ObjectId,
  orderNumber: String,
  userId: ObjectId,
  vendorId: ObjectId,
  items: [{
    itemId: ObjectId,
    quantity: Number,
    price: Number,
    customizations: Object
  }],
  totalAmount: Number,
  status: String, // 'pending', 'confirmed', 'preparing', 'ready', 'completed'
  orderType: String, // 'dinein', 'takeaway'
  paymentStatus: String,
  createdAt: Date,
  updatedAt: Date
}

// Order Counters Collection
{
  _id: ObjectId,
  sequence: Number,
  lastOrderDate: Date
}
```

#### Inventory Management
```javascript
// Inventory Collection
{
  _id: ObjectId,
  vendorId: ObjectId,
  itemId: ObjectId,
  quantity: Number,
  minQuantity: Number,
  maxQuantity: Number,
  expiryDate: Date,
  status: String, // 'available', 'low_stock', 'out_of_stock'
  lastUpdated: Date
}

// Items Collection
{
  _id: ObjectId,
  name: String,
  description: String,
  price: Number,
  category: String,
  vendorId: ObjectId,
  imageUrl: String,
  isActive: Boolean,
  customizations: [{
    name: String,
    options: [String],
    price: Number
  }]
}
```

### Database Indexes

#### Performance Indexes
```javascript
// Users Collection
db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "phone": 1 }, { unique: true })
db.users.createIndex({ "uniID": 1, "role": 1 })

// Orders Collection
db.orders.createIndex({ "userId": 1, "createdAt": -1 })
db.orders.createIndex({ "vendorId": 1, "status": 1 })
db.orders.createIndex({ "orderNumber": 1 }, { unique: true })

// Inventory Collection
db.inventory.createIndex({ "vendorId": 1, "itemId": 1 })
db.inventory.createIndex({ "status": 1, "lastUpdated": -1 })
```

## API Design

### RESTful API Structure

#### Authentication Endpoints
```
POST   /api/user/auth/signup          # User registration
POST   /api/user/auth/login           # User authentication
POST   /api/auth/logout          # User logout
POST   /api/auth/refresh         # Token refresh
POST   /api/auth/forgot-password # Password reset request
POST   /api/auth/reset-password  # Password reset confirmation
```

#### Order Management
```
GET    /api/orders               # Get user orders
POST   /api/orders               # Create new order
GET    /api/orders/:id           # Get specific order
PUT    /api/orders/:id           # Update order
DELETE /api/orders/:id           # Cancel order
GET    /api/orders/tracking/:id  # Track order status
```

#### Inventory Management
```
GET    /api/inventory            # Get vendor inventory
POST   /api/inventory            # Add inventory item
PUT    /api/inventory/:id        # Update inventory item
DELETE /api/inventory/:id        # Remove inventory item
GET    /api/inventory/reports    # Get inventory reports
```

### API Response Format

#### Success Response
```javascript
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Response
```javascript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Security Architecture

### Authentication Flow
```
1. User submits credentials
2. Server validates credentials
3. Server generates JWT token
4. Token stored in secure cookie/localStorage
5. Subsequent requests include token
6. Server validates token on each request
7. Token refreshed before expiration
```

### Authorization Levels
```javascript
// Role-based permissions
const permissions = {
  user: ['read:profile', 'create:order', 'read:order'],
  vendor: ['read:inventory', 'update:inventory', 'read:orders'],
  admin: ['read:all', 'update:all', 'delete:all'],
  uni: ['read:campus', 'manage:vendors', 'view:analytics']
}
```

### Data Encryption
- **At Rest:** MongoDB encryption for sensitive data
- **In Transit:** HTTPS/TLS for all communications
- **Application Level:** argon2 for password hashing
- **API Keys:** Environment variable encryption

## Performance Optimization

### Caching Strategy
```javascript
// Redis caching layers
const cacheKeys = {
  user: 'user:${userId}',
  inventory: 'inventory:${vendorId}',
  orders: 'orders:${userId}:${page}',
  vendors: 'vendors:active'
}

// Cache TTL (Time To Live)
const cacheTTL = {
  user: 3600,        // 1 hour
  inventory: 300,    // 5 minutes
  orders: 600,       // 10 minutes
  vendors: 1800      // 30 minutes
}
```

### Database Optimization
- **Connection Pooling:** MongoDB connection management
- **Query Optimization:** Efficient aggregation pipelines
- **Indexing Strategy:** Strategic index placement
- **Data Pagination:** Limit large dataset queries

### API Optimization
- **Response Compression:** Gzip compression
- **Request Batching:** Combine multiple requests
- **Lazy Loading:** Load data on demand
- **CDN Integration:** Static asset delivery

## Scalability Considerations

### Horizontal Scaling
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Server 1  │    │   Server 2  │    │   Server 3  │
│  (Primary)  │    │ (Secondary) │    │ (Secondary) │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                ┌──────────┴──────────┐
                │   Load Balancer     │
                └──────────┬──────────┘
                           │
                ┌──────────┴──────────┐
                │   Shared Database   │
                │     (MongoDB)       │
                └─────────────────────┘
```

### Microservices Architecture
- **User Service:** Authentication and user management
- **Order Service:** Order processing and tracking
- **Inventory Service:** Stock management and reporting
- **Payment Service:** Payment processing and reconciliation
- **Notification Service:** Email, SMS, and push notifications

## Monitoring & Logging

### Application Monitoring
```javascript
// Performance metrics
const metrics = {
  responseTime: 'avg_response_time',
  throughput: 'requests_per_second',
  errorRate: 'error_percentage',
  uptime: 'service_availability'
}

// Health checks
const healthChecks = {
  database: 'mongodb_connection',
  redis: 'redis_connection',
  external: 'payment_gateway_status'
}
```

### Logging Strategy
```javascript
// Log levels
const logLevels = {
  error: 'Critical errors and exceptions',
  warn: 'Warning conditions',
  info: 'General information',
  debug: 'Detailed debugging information'
}

// Log categories
const logCategories = {
  auth: 'Authentication and authorization',
  order: 'Order processing and tracking',
  payment: 'Payment processing',
  inventory: 'Inventory management'
}
```

---

**© 2025 EXSOLVIA. All rights reserved.**
