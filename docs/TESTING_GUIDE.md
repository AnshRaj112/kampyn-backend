# KAMPYN Testing Guide

This document provides comprehensive guidelines for testing the KAMPYN backend system, including unit tests, integration tests, API tests, and testing best practices.

**Last Updated:** October 2025

---

## Table of Contents
1. [Testing Strategy](#testing-strategy)
2. [Test Setup](#test-setup)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [API Testing](#api-testing)
6. [Database Testing](#database-testing)
7. [Performance Testing](#performance-testing)
8. [Security Testing](#security-testing)
9. [Test Automation](#test-automation)
10. [Best Practices](#best-practices)

---

## Testing Strategy

### 1. Testing Pyramid
```
        /\
       /  \     E2E Tests (Few)
      /____\    
     /      \   Integration Tests (Some)
    /________\  
   /          \ Unit Tests (Many)
  /____________\
```

### 2. Test Types Overview
- **Unit Tests:** Test individual functions and components
- **Integration Tests:** Test interactions between components
- **API Tests:** Test HTTP endpoints and responses
- **Database Tests:** Test data persistence and queries
- **Performance Tests:** Test system performance under load
- **Security Tests:** Test authentication and authorization

### 3. Testing Tools
- **Jest:** Test framework and runner
- **Supertest:** HTTP assertion library
- **MongoDB Memory Server:** In-memory MongoDB for testing
- **Redis Mock:** Mock Redis for testing
- **Faker:** Generate fake data for tests

---

## Test Setup

### 1. Package Configuration

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --config jest.integration.config.js",
    "test:api": "jest --config jest.api.config.js",
    "test:performance": "jest --config jest.performance.config.js"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "supertest": "^6.0.0",
    "mongodb-memory-server": "^8.0.0",
    "redis-mock": "^0.56.0",
    "@faker-js/faker": "^8.0.0",
    "nodemon": "^3.0.0"
  }
}
```

### 2. Jest Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000
};
```

### 3. Test Environment Setup

```javascript
// tests/setup.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Redis = require('redis-mock');

let mongoServer;

beforeAll(async () => {
  // Setup in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  // Setup mock Redis
  global.redisClient = Redis.createClient();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});
```

---

## Unit Testing

### 1. Controller Testing

```javascript
// tests/controllers/userAuthController.test.js
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/account/User');
const { generateToken } = require('../../utils/jwt');

describe('User Authentication Controller', () => {
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
      expect(response.body.data.user.isVerified).toBe(false);
    });

    it('should return error for duplicate email', async () => {
      // Create existing user
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

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/user/auth/signup')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/user/auth/login', () => {
    let user;

    beforeEach(async () => {
      user = await User.create({
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '1234567890',
        password: 'password123',
        isVerified: true
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/user/auth/login')
        .send({
          identifier: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
    });

    it('should return error for invalid password', async () => {
      const response = await request(app)
        .post('/api/user/auth/login')
        .send({
          identifier: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });
  });
});
```

### 2. Utility Function Testing

```javascript
// tests/utils/jwt.test.js
const { generateToken, verifyToken } = require('../../utils/jwt');

describe('JWT Utils', () => {
  const testPayload = { userId: '123', role: 'user' };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(testPayload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate different tokens for different payloads', () => {
      const token1 = generateToken({ userId: '123' });
      const token2 = generateToken({ userId: '456' });
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);
      
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        verifyToken('invalid.token.here');
      }).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      const expiredToken = generateToken(testPayload, '1ms');
      
      setTimeout(() => {
        expect(() => {
          verifyToken(expiredToken);
        }).toThrow('Token expired');
      }, 10);
    });
  });
});
```

### 3. Model Testing

```javascript
// tests/models/User.test.js
const User = require('../../models/account/User');
const argon2 = require('argon2js');

describe('User Model', () => {
  describe('Validation', () => {
    it('should validate a valid user', async () => {
      const validUser = new User({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      });

      const savedUser = await validUser.save();
      expect(savedUser._id).toBeDefined();
      expect(savedUser.email).toBe(validUser.email);
    });

    it('should require email field', async () => {
      const userWithoutEmail = new User({
        fullName: 'John Doe',
        phone: '1234567890',
        password: 'password123'
      });

      let err;
      try {
        await userWithoutEmail.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(Error);
      expect(err.errors.email).toBeDefined();
    });

    it('should require unique email', async () => {
      const user1 = new User({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123'
      });

      const user2 = new User({
        fullName: 'Jane Doe',
        email: 'john@example.com', // Same email
        phone: '0987654321',
        password: 'password123'
      });

      await user1.save();
      
      let err;
      try {
        await user2.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(11000); // Duplicate key error
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const user = new User({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123'
      });

      await user.save();
      
      expect(user.password).not.toBe('password123');
      expect(user.password).toMatch(/^\$2[aby]\$\d{1,2}\$[./A-Za-z0-9]{53}$/);
    });

    it('should not hash password if not modified', async () => {
      const user = new User({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123'
      });

      await user.save();
      const originalHash = user.password;

      user.fullName = 'Jane Doe';
      await user.save();

      expect(user.password).toBe(originalHash);
    });
  });

  describe('Instance Methods', () => {
    it('should compare password correctly', async () => {
      const user = new User({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123'
      });

      await user.save();

      const isMatch = await user.comparePassword('password123');
      expect(isMatch).toBe(true);

      const isNotMatch = await user.comparePassword('wrongpassword');
      expect(isNotMatch).toBe(false);
    });
  });
});
```

---

## Integration Testing

### 1. Order Flow Integration

```javascript
// tests/integration/orderFlow.test.js
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/account/User');
const Vendor = require('../../models/account/Vendor');
const Item = require('../../models/item/Retail');
const Order = require('../../models/order/Order');

describe('Order Flow Integration', () => {
  let user, vendor, item;

  beforeEach(async () => {
    // Create test data
    user = await User.create({
      fullName: 'Test User',
      email: 'user@example.com',
      phone: '1234567890',
      password: 'password123',
      isVerified: true
    });

    vendor = await Vendor.create({
      fullName: 'Test Vendor',
      email: 'vendor@example.com',
      phone: '0987654321',
      password: 'password123',
      vendorName: 'Test Restaurant',
      isVerified: true
    });

    item = await Item.create({
      name: 'Test Item',
      price: 100,
      type: 'snacks',
      vendorId: vendor._id,
      uniID: 'university_id'
    });
  });

  describe('Complete Order Flow', () => {
    it('should complete full order process', async () => {
      // 1. Add item to cart
      const cartResponse = await request(app)
        .post(`/cart/add/${user._id}`)
        .send({
          itemId: item._id,
          quantity: 2,
          vendorId: vendor._id
        })
        .expect(200);

      expect(cartResponse.body.success).toBe(true);

      // 2. Place order
      const orderResponse = await request(app)
        .post(`/order/${user._id}`)
        .send({
          vendorId: vendor._id,
          items: [{ itemId: item._id, quantity: 2 }],
          orderType: 'dinein'
        })
        .expect(201);

      expect(orderResponse.body.success).toBe(true);
      expect(orderResponse.body.data.order.status).toBe('pending');

      const orderId = orderResponse.body.data.order._id;

      // 3. Update order status
      const updateResponse = await request(app)
        .patch(`/order/${orderId}/complete`)
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // 4. Verify order in database
      const order = await Order.findById(orderId);
      expect(order.status).toBe('completed');
    });

    it('should handle order cancellation', async () => {
      // Place order
      const orderResponse = await request(app)
        .post(`/order/${user._id}`)
        .send({
          vendorId: vendor._id,
          items: [{ itemId: item._id, quantity: 1 }],
          orderType: 'dinein'
        })
        .expect(201);

      const orderId = orderResponse.body.data.order._id;

      // Cancel order
      const cancelResponse = await request(app)
        .post(`/order/${orderId}/cancel`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Verify order status
      const order = await Order.findById(orderId);
      expect(order.status).toBe('cancelled');
    });
  });
});
```

### 2. Payment Integration

```javascript
// tests/integration/payment.test.js
const request = require('supertest');
const app = require('../../app');
const Payment = require('../../models/order/Payment');

describe('Payment Integration', () => {
  it('should create Razorpay order', async () => {
    const response = await request(app)
      .post('/razorpay/create-order')
      .send({
        amount: 1000,
        currency: 'INR',
        receipt: 'test_receipt'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.amount).toBe(1000);
  });

  it('should get Razorpay public key', async () => {
    const response = await request(app)
      .get('/razorpay/key')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.key).toBeDefined();
  });
});
```

---

## API Testing

### 1. Endpoint Testing

```javascript
// tests/api/endpoints.test.js
const request = require('supertest');
const app = require('../../app');

describe('API Endpoints', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Authentication Endpoints', () => {
    it('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get('/api/user/auth/user')
        .expect(401);

      expect(response.body.message).toContain('Authorization token missing');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/user/auth/signup')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });
});
```

### 2. Response Format Testing

```javascript
// tests/api/responseFormat.test.js
const request = require('supertest');
const app = require('../../app');

describe('API Response Format', () => {
  it('should return consistent success response format', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.status).toBe('string');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('should return consistent error response format', async () => {
    const response = await request(app)
      .get('/api/nonexistent')
      .expect(404);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
    expect(response.body.success).toBe(false);
    expect(typeof response.body.message).toBe('string');
  });
});
```

---

## Database Testing

### 1. Database Connection Testing

```javascript
// tests/database/connection.test.js
const mongoose = require('mongoose');

describe('Database Connection', () => {
  it('should connect to test database', () => {
    expect(mongoose.connection.readyState).toBe(1); // Connected
  });

  it('should handle connection errors gracefully', async () => {
    // Test with invalid connection string
    const invalidConnection = mongoose.createConnection('mongodb://invalid:27017/test');
    
    await expect(invalidConnection.asPromise()).rejects.toThrow();
  });
});
```

### 2. Query Performance Testing

```javascript
// tests/database/performance.test.js
const User = require('../../models/account/User');
const { performance } = require('perf_hooks');

describe('Database Performance', () => {
  beforeEach(async () => {
    // Create test data
    const users = [];
    for (let i = 0; i < 100; i++) {
      users.push({
        fullName: `User ${i}`,
        email: `user${i}@example.com`,
        phone: `123456789${i}`,
        password: 'password123',
        uniID: 'university_id'
      });
    }
    await User.insertMany(users);
  });

  it('should perform queries within acceptable time', async () => {
    const start = performance.now();
    
    const users = await User.find({ uniID: 'university_id' })
      .select('fullName email')
      .limit(10);
    
    const end = performance.now();
    const duration = end - start;

    expect(users).toHaveLength(10);
    expect(duration).toBeLessThan(100); // Should complete within 100ms
  });

  it('should use indexes effectively', async () => {
    const explain = await User.find({ email: 'user1@example.com' }).explain();
    
    expect(explain.executionStats.totalDocsExamined).toBeLessThan(10);
  });
});
```

---

## Performance Testing

### 1. Load Testing

```javascript
// tests/performance/load.test.js
const request = require('supertest');
const app = require('../../app');

describe('Load Testing', () => {
  it('should handle concurrent requests', async () => {
    const concurrentRequests = 10;
    const promises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        request(app)
          .get('/health')
          .expect(200)
      );
    }

    const responses = await Promise.all(promises);
    
    responses.forEach(response => {
      expect(response.body.status).toBe('OK');
    });
  });

  it('should handle high volume of orders', async () => {
    const orderCount = 50;
    const promises = [];

    for (let i = 0; i < orderCount; i++) {
      promises.push(
        request(app)
          .post('/order/test-user-id')
          .send({
            vendorId: 'test-vendor-id',
            items: [{ itemId: 'test-item-id', quantity: 1 }],
            orderType: 'dinein'
          })
      );
    }

    const responses = await Promise.all(promises);
    
    const successCount = responses.filter(r => r.status === 201).length;
    expect(successCount).toBeGreaterThan(orderCount * 0.9); // 90% success rate
  });
});
```

### 2. Memory Leak Testing

```javascript
// tests/performance/memory.test.js
const { performance, PerformanceObserver } = require('perf_hooks');

describe('Memory Performance', () => {
  it('should not have memory leaks in repeated operations', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Perform repeated operations
    for (let i = 0; i < 1000; i++) {
      // Simulate API calls
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});
```

---

## Security Testing

### 1. Authentication Testing

```javascript
// tests/security/authentication.test.js
const request = require('supertest');
const app = require('../../app');

describe('Security - Authentication', () => {
  it('should reject invalid JWT tokens', async () => {
    const response = await request(app)
      .get('/api/user/auth/user')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);

    expect(response.body.message).toContain('Invalid token');
  });

  it('should reject expired tokens', async () => {
    // Create expired token
    const expiredToken = 'expired.jwt.token';
    
    const response = await request(app)
      .get('/api/user/auth/user')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.message).toContain('expired');
  });

  it('should enforce rate limiting', async () => {
    const requests = [];
    
    // Make multiple requests quickly
    for (let i = 0; i < 10; i++) {
      requests.push(
        request(app)
          .post('/api/user/auth/login')
          .send({ identifier: 'test@example.com', password: 'password' })
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status === 429);
    
    expect(rateLimited).toBe(true);
  });
});
```

### 2. Input Validation Testing

```javascript
// tests/security/validation.test.js
const request = require('supertest');
const app = require('../../app');

describe('Security - Input Validation', () => {
  it('should prevent SQL injection attempts', async () => {
    const maliciousInput = "'; DROP TABLE users; --";
    
    const response = await request(app)
      .post('/api/user/auth/signup')
      .send({
        fullName: maliciousInput,
        email: 'test@example.com',
        phone: '1234567890',
        password: 'password123'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('should prevent XSS attacks', async () => {
    const xssPayload = '<script>alert("xss")</script>';
    
    const response = await request(app)
      .post('/api/user/auth/signup')
      .send({
        fullName: xssPayload,
        email: 'test@example.com',
        phone: '1234567890',
        password: 'password123'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('should validate email format', async () => {
    const invalidEmails = [
      'invalid-email',
      '@example.com',
      'test@',
      'test..test@example.com'
    ];

    for (const email of invalidEmails) {
      const response = await request(app)
        .post('/api/user/auth/signup')
        .send({
          fullName: 'Test User',
          email: email,
          phone: '1234567890',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    }
  });
});
```

---

## Test Automation

### 1. CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:6.0
        ports:
          - 27017:27017
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

### 2. Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test",
      "pre-push": "npm run test:coverage"
    }
  }
}
```

---

## Best Practices

### 1. Test Organization
- Group related tests using `describe` blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Keep tests independent and isolated

### 2. Test Data Management
- Use factories for creating test data
- Clean up data after each test
- Use meaningful test data
- Avoid hardcoded values

### 3. Mocking Strategy
- Mock external services (payment gateways, email)
- Mock time-dependent operations
- Mock expensive operations
- Use realistic mock data

### 4. Performance Considerations
- Run tests in parallel when possible
- Use in-memory databases for testing
- Optimize test setup and teardown
- Monitor test execution time

### 5. Coverage Goals
- Aim for 80%+ code coverage
- Focus on critical business logic
- Test error conditions
- Test edge cases

### 6. Documentation
- Document complex test scenarios
- Keep test documentation updated
- Use comments for non-obvious test logic
- Document test data requirements

---

## Conclusion

This testing guide provides a comprehensive framework for:

- **Reliable testing** of all system components
- **Consistent test quality** across the project
- **Automated testing** in CI/CD pipelines
- **Performance validation** of the system
- **Security verification** of the application

Remember to:
- Run tests regularly during development
- Maintain high test coverage
- Update tests when features change
- Use tests as documentation
- Monitor test performance and reliability 