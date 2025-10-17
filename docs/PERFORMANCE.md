# Performance Documentation

This document outlines performance optimization strategies, monitoring practices, and best practices for the KAMPYN backend system.

**Last Updated:** October 2025

---

## 🚀 Performance Overview

### Performance Goals
- **Response Time:** < 200ms for 95% of requests
- **Throughput:** 1000+ requests per second
- **Uptime:** 99.9% availability
- **Database Queries:** < 50ms average
- **Memory Usage:** < 512MB per instance

### Performance Metrics
```
Response Time Distribution:
- P50: < 100ms
- P95: < 200ms
- P99: < 500ms

Error Rates:
- 4xx Errors: < 1%
- 5xx Errors: < 0.1%

Resource Utilization:
- CPU: < 70% average
- Memory: < 80% average
- Disk I/O: < 60% average
```

---

## 🏗️ Architecture Optimization

### Caching Strategy
```javascript
// Redis caching configuration
const redisConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4,
  maxMemoryPolicy: 'allkeys-lru',
  maxMemory: '256mb'
};

// Cache middleware
const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
      
      res.sendResponse = res.json;
      res.json = (body) => {
        redis.setex(key, duration, JSON.stringify(body));
        res.sendResponse(body);
      };
      
      next();
    } catch (error) {
      next();
    }
  };
};
```

### Database Optimization
```javascript
// MongoDB connection optimization
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0,
  bufferCommands: false,
  readPreference: 'secondaryPreferred',
  writeConcern: {
    w: 'majority',
    j: true,
    wtimeout: 10000
  }
};

// Index optimization
const createIndexes = async () => {
  // User collection indexes
  await User.collection.createIndex({ email: 1 }, { unique: true });
  await User.collection.createIndex({ phone: 1 }, { unique: true });
  await User.collection.createIndex({ collegeId: 1 });
  
  // Order collection indexes
  await Order.collection.createIndex({ userId: 1 });
  await Order.collection.createIndex({ vendorId: 1 });
  await Order.collection.createIndex({ status: 1 });
  await Order.collection.createIndex({ createdAt: -1 });
  await Order.collection.createIndex({ 
    vendorId: 1, 
    status: 1, 
    createdAt: -1 
  });
  
  // Item collection indexes
  await Retail.collection.createIndex({ uniId: 1, type: 1 });
  await Produce.collection.createIndex({ uniId: 1, type: 1 });
  await Retail.collection.createIndex({ name: 'text', description: 'text' });
  await Produce.collection.createIndex({ name: 'text', description: 'text' });
};
```

### Connection Pooling
```javascript
// Database connection pooling
const mongoose = require('mongoose');

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
```

---

## 📊 Query Optimization

### Aggregation Pipeline Optimization
```javascript
// Optimized aggregation for vendor analytics
const getVendorAnalytics = async (vendorId, startDate, endDate) => {
  const pipeline = [
    {
      $match: {
        vendorId: mongoose.Types.ObjectId(vendorId),
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: "$total" },
        avgOrderValue: { $avg: "$total" }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];
  
  return await Order.aggregate(pipeline).allowDiskUse(false);
};
```

### Pagination Optimization
```javascript
// Efficient pagination with cursor-based approach
const getPaginatedItems = async (uniId, category, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  
  const [items, total] = await Promise.all([
    Retail.find({ uniId })
      .select('name price description image type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Retail.countDocuments({ uniId })
  ]);
  
  return {
    items,
    pagination: {
      current: page,
      total: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
};
```

### Bulk Operations
```javascript
// Bulk update for inventory
const bulkUpdateInventory = async (updates) => {
  const bulkOps = updates.map(update => ({
    updateOne: {
      filter: { _id: update.itemId },
      update: { $inc: { quantity: update.quantity } }
    }
  }));
  
  return await Retail.bulkWrite(bulkOps, { ordered: false });
};

// Bulk insert for items
const bulkInsertItems = async (items) => {
  return await Retail.insertMany(items, { 
    ordered: false,
    lean: true 
  });
};
```

---

## 🔄 Async Operations

### Promise Optimization
```javascript
// Parallel execution for independent operations
const getOrderDetails = async (orderId) => {
  const [order, vendor, user] = await Promise.all([
    Order.findById(orderId).lean(),
    Vendor.findById(order.vendorId).select('name location').lean(),
    User.findById(order.userId).select('name phone').lean()
  ]);
  
  return { order, vendor, user };
};

// Sequential execution for dependent operations
const processOrder = async (orderData) => {
  // Step 1: Validate inventory
  const inventoryCheck = await validateInventory(orderData.items);
  if (!inventoryCheck.valid) {
    throw new Error('Insufficient inventory');
  }
  
  // Step 2: Create order
  const order = await Order.create(orderData);
  
  // Step 3: Update inventory
  await updateInventory(orderData.items);
  
  // Step 4: Send notifications
  await Promise.all([
    sendOrderConfirmation(order),
    sendVendorNotification(order)
  ]);
  
  return order;
};
```

### Stream Processing
```javascript
// Stream processing for large datasets
const processLargeDataset = async () => {
  const stream = Order.find({ status: 'pending' })
    .cursor({ batchSize: 1000 });
  
  let processed = 0;
  
  for (let doc = await stream.next(); doc != null; doc = await stream.next()) {
    await processOrder(doc);
    processed++;
    
    if (processed % 1000 === 0) {
      console.log(`Processed ${processed} orders`);
    }
  }
};
```

---

## 🧠 Memory Management

### Memory Optimization
```javascript
// Memory-efficient data processing
const processVendorData = async (vendorId) => {
  // Use lean() for read-only operations
  const orders = await Order.find({ vendorId })
    .select('total createdAt status')
    .lean()
    .limit(1000);
  
  // Process in chunks to avoid memory spikes
  const chunkSize = 100;
  const results = [];
  
  for (let i = 0; i < orders.length; i += chunkSize) {
    const chunk = orders.slice(i, i + chunkSize);
    const processed = await processChunk(chunk);
    results.push(...processed);
  }
  
  return results;
};

// Garbage collection optimization
const optimizeMemory = () => {
  // Clear unnecessary references
  global.gc && global.gc();
  
  // Log memory usage
  const memUsage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
  });
};
```

### Object Pooling
```javascript
// Object pooling for frequently created objects
class ObjectPool {
  constructor(createFn, maxSize = 100) {
    this.createFn = createFn;
    this.maxSize = maxSize;
    this.pool = [];
  }
  
  acquire() {
    return this.pool.pop() || this.createFn();
  }
  
  release(obj) {
    if (this.pool.length < this.maxSize) {
      // Reset object state
      Object.keys(obj).forEach(key => delete obj[key]);
      this.pool.push(obj);
    }
  }
}

// Usage example
const orderPool = new ObjectPool(() => ({}), 50);
```

---

## 📈 Monitoring & Metrics

### Performance Monitoring
```javascript
// Performance monitoring middleware
const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1000000;
    
    // Log slow requests
    if (duration > 1000) {
      console.warn(`Slow request: ${req.method} ${req.url} - ${duration}ms`);
    }
    
    // Send metrics to monitoring service
    metrics.histogram('http_request_duration', duration, {
      method: req.method,
      route: req.route?.path || req.url,
      status: res.statusCode
    });
  });
  
  next();
};

// Database query monitoring
const queryMonitor = (req, res, next) => {
  const originalExec = mongoose.Query.prototype.exec;
  
  mongoose.Query.prototype.exec = function() {
    const start = process.hrtime.bigint();
    
    return originalExec.apply(this, arguments).then(result => {
      const duration = Number(process.hrtime.bigint() - start) / 1000000;
      
      if (duration > 100) {
        console.warn(`Slow query: ${duration}ms`, this.getQuery());
      }
      
      metrics.histogram('db_query_duration', duration, {
        collection: this.model.collection.name,
        operation: this.op
      });
      
      return result;
    });
  };
  
  next();
};
```

### Health Checks
```javascript
// Comprehensive health check
const healthCheck = async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    external_apis: false
  };
  
  try {
    // Database check
    await mongoose.connection.db.admin().ping();
    checks.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
  }
  
  try {
    // Redis check
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }
  
  try {
    // External API check (Razorpay)
    const response = await axios.get('https://api.razorpay.com/v1/health');
    checks.external_apis = response.status === 200;
  } catch (error) {
    console.error('External API health check failed:', error);
  }
  
  const isHealthy = Object.values(checks).every(check => check);
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
};
```

---

## 🚀 Load Balancing

### Horizontal Scaling
```javascript
// Load balancer configuration
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    // Replace the dead worker
    cluster.fork();
  });
} else {
  // Worker process
  require('./server');
  console.log(`Worker ${process.pid} started`);
}
```

### Rate Limiting
```javascript
// Adaptive rate limiting
const adaptiveRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Adjust rate limit based on user type
    if (req.user?.role === 'admin') return 1000;
    if (req.user?.role === 'vendor') return 500;
    return 100; // Default for regular users
  },
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});
```

---

## 🔧 Performance Tuning

### Node.js Optimization
```javascript
// Node.js performance tuning
const optimizeNodeJS = () => {
  // Increase max listeners
  require('events').EventEmitter.defaultMaxListeners = 20;
  
  // Optimize garbage collection
  if (process.env.NODE_ENV === 'production') {
    // Use more aggressive GC in production
    v8.setFlagsFromString('--max_old_space_size=4096');
  }
  
  // Optimize for high throughput
  process.env.UV_THREADPOOL_SIZE = 128;
};

// PM2 configuration for production
const pm2Config = {
  apps: [{
    name: 'bitesbay-backend',
    script: './index.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=4096',
    env: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: 128
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### Database Tuning
```javascript
// MongoDB performance tuning
const mongoTuning = {
  // Connection pooling
  maxPoolSize: 50,
  minPoolSize: 10,
  
  // Write concern
  writeConcern: {
    w: 'majority',
    j: true,
    wtimeout: 10000
  },
  
  // Read preference
  readPreference: 'secondaryPreferred',
  
  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  
  // Compression
  compressors: ['zlib'],
  zlibCompressionLevel: 6
};
```

---

## 📊 Performance Testing

### Load Testing
```javascript
// Load testing with Artillery
const loadTestConfig = {
  config: {
    target: 'http://localhost:5001',
    phases: [
      { duration: 60, arrivalRate: 10 }, // Ramp up
      { duration: 300, arrivalRate: 50 }, // Sustained load
      { duration: 60, arrivalRate: 100 } // Peak load
    ],
    defaults: {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  },
  scenarios: [
    {
      name: 'User authentication flow',
      weight: 30,
      flow: [
        { post: { url: '/api/user/auth/login', json: { email: 'test@example.com', password: 'password' } } },
        { get: { url: '/api/user/auth/check' } }
      ]
    },
    {
      name: 'Order placement flow',
      weight: 40,
      flow: [
        { get: { url: '/api/item/retail/uni/123' } },
        { post: { url: '/cart/add/user123', json: { itemId: 'item123', quantity: 2 } } },
        { post: { url: '/order/user123', json: { vendorId: 'vendor123', items: [] } } }
      ]
    },
    {
      name: 'Vendor operations',
      weight: 30,
      flow: [
        { get: { url: '/api/vendor/list/uni/123' } },
        { get: { url: '/order/vendor/vendor123/active' } }
      ]
    }
  ]
};
```

### Performance Benchmarks
```javascript
// Performance benchmarking
const benchmark = async (testName, testFn, iterations = 1000) => {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await testFn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000);
  }
  
  const sorted = times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  
  console.log(`Benchmark: ${testName}`);
  console.log(`Average: ${avg.toFixed(2)}ms`);
  console.log(`P50: ${p50.toFixed(2)}ms`);
  console.log(`P95: ${p95.toFixed(2)}ms`);
  console.log(`P99: ${p99.toFixed(2)}ms`);
};
```

---

## 🚨 Performance Alerts

### Alert Configuration
```javascript
// Performance alerting
const performanceAlerts = {
  // Response time alerts
  responseTime: {
    threshold: 1000, // 1 second
    window: 300000, // 5 minutes
    action: (metric) => {
      console.error(`High response time detected: ${metric.value}ms`);
      // Send alert to monitoring service
      sendAlert('HIGH_RESPONSE_TIME', metric);
    }
  },
  
  // Error rate alerts
  errorRate: {
    threshold: 0.05, // 5%
    window: 60000, // 1 minute
    action: (metric) => {
      console.error(`High error rate detected: ${metric.value}%`);
      sendAlert('HIGH_ERROR_RATE', metric);
    }
  },
  
  // Memory usage alerts
  memoryUsage: {
    threshold: 0.8, // 80%
    window: 300000, // 5 minutes
    action: (metric) => {
      console.error(`High memory usage detected: ${metric.value}%`);
      sendAlert('HIGH_MEMORY_USAGE', metric);
    }
  }
};
```

---

## 📚 Performance Resources

### Tools & Libraries
- **Load Testing:** Artillery, k6, Apache Bench
- **Profiling:** Node.js --inspect, clinic.js
- **Monitoring:** Prometheus, Grafana, New Relic
- **Caching:** Redis, Memcached
- **Database:** MongoDB Compass, Studio 3T

### Best Practices
1. **Measure First** - Profile before optimizing
2. **Cache Strategically** - Cache frequently accessed data
3. **Optimize Queries** - Use indexes and efficient queries
4. **Handle Async Properly** - Use Promise.all for parallel operations
5. **Monitor Continuously** - Set up comprehensive monitoring
6. **Scale Horizontally** - Use load balancing and clustering
7. **Optimize Memory** - Avoid memory leaks and excessive allocations

---

*This performance documentation should be regularly updated based on monitoring data and performance testing results.* 