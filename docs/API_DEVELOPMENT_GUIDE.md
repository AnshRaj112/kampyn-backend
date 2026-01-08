# KAMPYN Backend - API Development Guide

*Project under **EXSOLVIA** - Excellence in Software Solutions*

This document provides comprehensive guidelines for developing and maintaining APIs in the KAMPYN backend system, including coding standards, best practices, and development workflows.

**Last Updated:** October 2025

---

## Table of Contents
1. [Project Structure](#project-structure)
2. [Coding Standards](#coding-standards)
3. [API Design Principles](#api-design-principles)
4. [Error Handling](#error-handling)
5. [Authentication & Authorization](#authentication--authorization)
6. [Database Operations](#database-operations)
7. [Testing Guidelines](#testing-guidelines)
8. [Performance Optimization](#performance-optimization)
9. [Security Best Practices](#security-best-practices)
10. [Documentation Standards](#documentation-standards)

---

## Project Structure

### Directory Organization
```
kampyn-backend/
├── config/                 # Configuration files
├── controllers/           # Route handlers
│   ├── auth/             # Authentication controllers
│   └── ...               # Other controllers
├── middleware/           # Custom middleware
├── models/              # Database models
│   ├── account/         # User account models
│   ├── item/           # Item-related models
│   ├── order/          # Order-related models
│   └── users/          # User-related models
├── routes/              # API route definitions
│   ├── auth/           # Authentication routes
│   └── ...             # Other routes
├── utils/              # Utility functions
├── scripts/            # Database scripts and migrations
├── docs/               # Documentation
└── tests/              # Test files
```

### File Naming Conventions
- **Controllers:** `camelCase.js` (e.g., `userAuthController.js`)
- **Models:** `PascalCase.js` (e.g., `User.js`)
- **Routes:** `camelCase.js` (e.g., `userAuthRoutes.js`)
- **Middleware:** `camelCase.js` (e.g., `authMiddleware.js`)
- **Utils:** `camelCase.js` (e.g., `sendOtp.js`)

---

## Coding Standards

### 1. JavaScript/Node.js Standards

#### Code Style
- Use **ES6+** features (const, let, arrow functions, destructuring)
- Follow **2-space indentation**
- Use **semicolons** at the end of statements
- Use **single quotes** for strings
- Use **camelCase** for variables and functions
- Use **PascalCase** for classes and constructors

#### Example:
```javascript
const express = require('express');
const { User, Order } = require('../models');
const { validateInput } = require('../utils/validation');

const createOrder = async (req, res) => {
  try {
    const { userId, items, vendorId } = req.body;
    
    // Validate input
    const validation = validateInput({ userId, items, vendorId });
    if (!validation.isValid) {
      return res.status(400).json({ 
        message: 'Invalid input', 
        errors: validation.errors 
      });
    }

    // Create order
    const order = new Order({
      userId,
      items,
      vendorId,
      status: 'pending'
    });

    await order.save();
    
    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
```

### 2. Async/Await Usage
- Always use **async/await** instead of callbacks or promises
- Wrap async operations in try-catch blocks
- Use meaningful error messages

```javascript
// ✅ Good
const getUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ❌ Bad
const getUser = (req, res) => {
  const { userId } = req.params;
  User.findById(userId)
    .then(user => {
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ user });
    })
    .catch(error => {
      console.error('Get user error:', error);
      res.status(500).json({ message: 'Internal server error' });
    });
};
```

---

## API Design Principles

### 1. RESTful Design
- Use **HTTP methods** appropriately (GET, POST, PUT, PATCH, DELETE)
- Use **plural nouns** for resource endpoints
- Use **nested resources** for related data
- Return **consistent response formats**

#### Endpoint Examples:
```javascript
// Users
GET    /api/auth/user               // Get current user
POST   /api/user/auth/signup             // Create user
PUT    /api/auth/profile            // Update user profile
DELETE /api/auth/logout             // Logout user

// Orders
GET    /api/orders/:orderId         // Get specific order
POST   /api/orders                  // Create order
PATCH  /api/orders/:orderId/status  // Update order status
DELETE /api/orders/:orderId/cancel  // Cancel order

// Items
GET    /api/items/category/:category // Get items by category
POST   /api/items                   // Create item
PUT    /api/items/:id               // Update item
DELETE /api/items/:id               // Delete item

// Vendors
GET    /api/vendors                 // Get all vendors
POST   /api/vendors                 // Create vendor
PUT    /api/vendors/:id             // Update vendor
DELETE /api/vendors/:id             // Delete vendor

// Inventory
GET    /api/inventory               // Get inventory
POST   /api/inventory               // Add inventory item
PUT    /api/inventory/:id           // Update inventory
DELETE /api/inventory/:id           // Remove inventory item

// Payments
POST   /api/payments/create         // Create payment
POST   /api/payments/verify         // Verify payment
GET    /api/payments/:id            // Get payment details
```

### 2. Response Format Standards

#### Success Response:
```javascript
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

#### Error Response:
```javascript
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (development only)",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 3. Pagination
- Use **limit** and **skip** for pagination
- Include **total count** and **page info**
- Default **limit: 10, page: 1**

```javascript
// Request: GET /api/items?page=2&limit=20
// Response:
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "currentPage": 2,
      "totalPages": 5,
      "totalItems": 100,
      "itemsPerPage": 20,
      "hasNext": true,
      "hasPrev": true
    }
  }
}
```

---

## Error Handling

### 1. HTTP Status Codes
- **200** - Success
- **201** - Created
- **400** - Bad Request (validation errors)
- **401** - Unauthorized (authentication required)
- **403** - Forbidden (insufficient permissions)
- **404** - Not Found
- **409** - Conflict (duplicate data)
- **422** - Unprocessable Entity
- **429** - Too Many Requests (rate limiting)
- **500** - Internal Server Error

### 2. Error Handling Middleware
```javascript
// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};
```

### 3. Custom Error Classes
```javascript
// utils/errors.js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

module.exports = { AppError, ValidationError, AuthenticationError };
```

---

## Authentication & Authorization

### 1. JWT Token Management
```javascript
// utils/jwt.js
const jwt = require('jsonwebtoken');

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new AuthenticationError('Invalid token');
  }
};

module.exports = { generateToken, verifyToken };
```

### 2. Authentication Middleware
```javascript
// middleware/authMiddleware.js
const { verifyToken } = require('../utils/jwt');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization token missing');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
};
```

### 3. Role-Based Access Control
```javascript
// Usage in routes
router.get('/api/admin/users', authenticate, authorize('admin', 'super_admin'), getUsers);
router.post('/api/vendors/:id/items', authenticate, authorize('vendor'), createItem);
router.get('/api/orders', authenticate, authorize('user', 'vendor', 'admin'), getOrders);
```

---

## Database Operations

### 1. Model Design
```javascript
// models/User.js
const mongoose = require('mongoose');
const argon2 = require('argon2js');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    default: 'user',
    enum: ['user', 'vendor', 'university', 'admin', 'super_admin']
  }
}, {
  timestamps: true
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  this.password = await argon2.hash(this.password, 12);
  next();
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await argon2.compare(candidatePassword, this.password);
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);
```

### 2. Query Optimization
```javascript
// ✅ Good - Use select to limit fields
const users = await User.find({ uniID })
  .select('fullName email phone')
  .limit(10)
  .sort({ createdAt: -1 });

// ✅ Good - Use populate for related data
const orders = await Order.find({ userId })
  .populate('vendorId', 'vendorName')
  .populate('items.itemId', 'name price');

// ❌ Bad - Don't fetch unnecessary data
const users = await User.find({ uniID }); // Fetches all fields
```

### 3. Transaction Usage
```javascript
// utils/database.js
const mongoose = require('mongoose');

const withTransaction = async (callback) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Usage
const createOrder = async (orderData) => {
  return await withTransaction(async (session) => {
    const order = new Order(orderData);
    await order.save({ session });
    
    // Update inventory
    await Inventory.updateMany(
      { itemId: { $in: orderData.items.map(item => item.itemId) } },
      { $inc: { quantity: -1 } },
      { session }
    );
    
    return order;
  });
};
```

---

## Testing Guidelines

### 1. Unit Testing
```javascript
// tests/controllers/userAuthController.test.js
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');

describe('User Authentication', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/user/auth/signup', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      const response = await request(app)
        .post('/api/user/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
    });

    it('should return error for duplicate email', async () => {
      // Create user first
      await User.create({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '0987654321',
        password: 'password123'
      });

      const response = await request(app)
        .post('/api/user/auth/signup')
        .send({
          fullName: 'John Doe',
          email: 'jane@example.com', // Duplicate email
          phone: '1234567890',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });
});
```

### 2. Integration Testing
```javascript
// tests/integration/orderFlow.test.js
describe('Order Flow Integration', () => {
  let user, vendor, item;

  beforeEach(async () => {
    // Setup test data
    user = await User.create({ /* user data */ });
    vendor = await Vendor.create({ /* vendor data */ });
    item = await Item.create({ /* item data */ });
  });

  it('should complete full order flow', async () => {
    // 1. Add item to cart
    const cartResponse = await request(app)
      .post(`/api/cart/add/${user._id}`)
      .send({ itemId: item._id, quantity: 2 })
      .expect(200);

    // 2. Place order
    const orderResponse = await request(app)
      .post(`/api/orders`)
      .send({
        userId: user._id,
        vendorId: vendor._id,
        items: [{ itemId: item._id, quantity: 2 }]
      })
      .expect(201);

    // 3. Verify order status
    const order = await Order.findById(orderResponse.body.data.order._id);
    expect(order.status).toBe('pending');
  });
});
```

---

## Performance Optimization

### 1. Caching Strategy
```javascript
// utils/cache.js
const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL
});

const cache = {
  async get(key) {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  },

  async set(key, value, ttl = 3600) {
    await client.setex(key, ttl, JSON.stringify(value));
  },

  async del(key) {
    await client.del(key);
  }
};

// Usage in controllers
const getVendorItems = async (req, res) => {
  const { vendorId } = req.params;
  const cacheKey = `vendor:${vendorId}:items`;

  // Try cache first
  let items = await cache.get(cacheKey);
  
  if (!items) {
    items = await Item.find({ vendorId });
    await cache.set(cacheKey, items, 1800); // 30 minutes
  }

  res.json({ 
    success: true,
    data: { items },
    message: 'Items retrieved successfully'
  });
};
```

### 2. Database Indexing
```javascript
// models/Order.js
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ vendorId: 1, status: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
```

### 3. Query Optimization
```javascript
// Use aggregation for complex queries
const getVendorStats = async (vendorId) => {
  return await Order.aggregate([
    { $match: { vendorId: mongoose.Types.ObjectId(vendorId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);
};
```

---

## Security Best Practices

### 1. Input Validation
```javascript
// utils/validation.js
const Joi = require('joi');

const userSchema = Joi.object({
  fullName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  password: Joi.string().min(6).required(),
  gender: Joi.string().valid('male', 'female', 'other'),
  uniID: Joi.string().required()
});

const validateUser = (data) => {
  return userSchema.validate(data);
};
```

### 2. Rate Limiting
```javascript
// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
```

### 3. Security Headers
```javascript
// app.js
const helmet = require('helmet');
const cors = require('cors');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
```

---

## Documentation Standards

### 1. Code Comments
```javascript
/**
 * Create a new user account
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with user data and token
 */
const signup = async (req, res) => {
  // Implementation
};
```

### 2. API Documentation
```javascript
/**
 * @api {post} /api/user/auth/signup Create User Account
 * @apiName CreateUser
 * @apiGroup Authentication
 * @apiVersion 1.0.0
 *
 * @apiParam {String} fullName User's full name
 * @apiParam {String} email User's email address
 * @apiParam {String} phone User's phone number
 * @apiParam {String} password User's password
 * @apiParam {String} gender User's gender
 * @apiParam {String} uniID University ID
 *
 * @apiSuccess {Boolean} success Success status
 * @apiSuccess {String} message Success message
 * @apiSuccess {Object} data User data
 * @apiSuccess {String} data.token JWT token
 *
 * @apiError {Object} 400 Validation error
 * @apiError {Object} 409 User already exists
 */
```

### 3. README Updates
- Update API documentation when adding new endpoints
- Include examples for new features
- Document breaking changes
- Keep installation instructions current

---

## Development Workflow

### 1. Feature Development
1. Create feature branch: `git checkout -b features/feature-name`
2. Implement feature with tests
3. Update documentation
4. Create pull request
5. Code review and merge

### 2. Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Error handling is implemented
- [ ] Security considerations addressed
- [ ] Performance impact assessed

### 3. Deployment Checklist
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Security headers configured
- [ ] Monitoring and logging setup
- [ ] Backup strategy verified

---

## Tools and Resources

### 1. Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Testing framework
- **Supertest** - API testing
- **MongoDB Compass** - Database GUI

### 2. Monitoring Tools
- **Winston** - Logging
- **Morgan** - HTTP request logging
- **PM2** - Process management
- **New Relic** - Application monitoring

### 3. Security Tools
- **Helmet** - Security headers
- **Rate-limiter-flexible** - Rate limiting
- **Joi** - Input validation
- **argon2js** - Password hashing

---

## Conclusion

Following these guidelines ensures:
- **Consistent code quality** across the project
- **Maintainable and scalable** codebase
- **Secure and performant** APIs
- **Comprehensive testing** coverage
- **Clear documentation** for future developers

Remember to:
- Review and update these guidelines regularly
- Share knowledge with team members
- Continuously improve development practices
- Stay updated with industry best practices

---

**© 2025 EXSOLVIA. All rights reserved.** 