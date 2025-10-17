# KAMPYN Deployment & Operations Guide

This document provides comprehensive guidance for deploying, monitoring, and maintaining the KAMPYN backend in production environments.

**Last Updated:** October 2025

---

## Table of Contents
1. [Environment Setup](#environment-setup)
2. [Production Deployment](#production-deployment)
3. [Database Management](#database-management)
4. [Monitoring & Logging](#monitoring--logging)
5. [Performance Optimization](#performance-optimization)
6. [Security Hardening](#security-hardening)
7. [Backup & Recovery](#backup--recovery)
8. [Maintenance Procedures](#maintenance-procedures)
9. [Troubleshooting](#troubleshooting)
10. [Scaling Strategies](#scaling-strategies)

---

## Environment Setup

### 1. Production Environment Variables

Create a `.env.production` file with the following variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=5001
HOST=0.0.0.0

# Database Configuration
MONGO_URL=mongodb://username:password@host:port/database?authSource=admin
MONGO_OPTIONS={"useNewUrlParser":true,"useUnifiedTopology":true,"maxPoolSize":10}

# JWT Configuration
JWT_SECRET=your_super_secure_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Redis Configuration
REDIS_URL=redis://username:password@host:port
REDIS_TTL=3600

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_specific_password
EMAIL_FROM=KAMPYN <noreply@bitesbay.com>

# Payment Gateway (Razorpay)
RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloud Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Security
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
SENTRY_DSN=your_sentry_dsn
NEW_RELIC_LICENSE_KEY=your_new_relic_key

# Backup
BACKUP_S3_BUCKET=your-backup-bucket
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

### 2. Server Requirements

#### Minimum Requirements
- **CPU:** 2 cores
- **RAM:** 4GB
- **Storage:** 50GB SSD
- **OS:** Ubuntu 20.04 LTS or CentOS 8

#### Recommended Requirements
- **CPU:** 4+ cores
- **RAM:** 8GB+
- **Storage:** 100GB+ SSD
- **OS:** Ubuntu 22.04 LTS

### 3. Software Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Install Redis
sudo apt-get install -y redis-server

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx
```

---

## Production Deployment

### 1. Application Deployment

#### Using PM2
```bash
# Navigate to application directory
cd /var/www/bitesbay-backend

# Install dependencies
npm ci --only=production

# Build application (if needed)
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

#### PM2 Ecosystem Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'bitesbay-backend',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

### 2. Nginx Configuration

```nginx
# /etc/nginx/sites-available/bitesbay-backend
server {
    listen 80;
    server_name api.bitesbay.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.bitesbay.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.bitesbay.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.bitesbay.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;

    # Proxy Configuration
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Health Check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

### 3. SSL Certificate Setup

```bash
# Obtain SSL certificate
sudo certbot --nginx -d api.bitesbay.com

# Auto-renewal setup
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 4. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 27017  # MongoDB (if external)
sudo ufw allow 6379   # Redis (if external)
sudo ufw enable
```

---

## Database Management

### 1. MongoDB Production Setup

#### MongoDB Configuration
```yaml
# /etc/mongod.conf
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

net:
  port: 27017
  bindIp: 127.0.0.1

security:
  authorization: enabled

operationProfiling:
  slowOpThresholdMs: 100
  mode: slowOp

replication:
  replSetName: "bitesbay-replica"
```

#### Database User Setup
```javascript
// Connect to MongoDB and create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "secure_password",
  roles: ["userAdminAnyDatabase", "dbAdminAnyDatabase", "readWriteAnyDatabase"]
})

// Create application user
use bitesbay
db.createUser({
  user: "bitesbay_user",
  pwd: "app_specific_password",
  roles: ["readWrite"]
})
```

### 2. Database Indexing

```javascript
// Essential indexes for performance
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "phone": 1 }, { unique: true });
db.users.createIndex({ "uniID": 1 });

db.orders.createIndex({ "orderNumber": 1 }, { unique: true });
db.orders.createIndex({ "userId": 1, "createdAt": -1 });
db.orders.createIndex({ "vendorId": 1, "status": 1 });
db.orders.createIndex({ "createdAt": 1 });

db.retails.createIndex({ "vendorId": 1 });
db.retails.createIndex({ "uniID": 1, "type": 1 });
db.produces.createIndex({ "vendorId": 1 });
db.produces.createIndex({ "uniID": 1, "type": 1 });

// Text search indexes
db.retails.createIndex({ "name": "text", "description": "text" });
db.produces.createIndex({ "name": "text", "description": "text" });
```

### 3. Database Monitoring

```javascript
// MongoDB monitoring queries
// Check slow queries
db.getProfilingStatus()
db.setProfilingLevel(1, 100) // Log queries slower than 100ms

// Check index usage
db.orders.aggregate([
  { $indexStats: {} }
])

// Check collection sizes
db.runCommand({ dbStats: 1 })
db.runCommand({ collStats: "orders" })
```

---

## Monitoring & Logging

### 1. Application Logging

#### Winston Configuration
```javascript
// utils/logger.js
const winston = require('winston');
require('winston-daily-rotate-file');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bitesbay-backend' },
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

module.exports = logger;
```

### 2. Health Checks

```javascript
// routes/health.js
const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');

const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {}
  };

  // Check MongoDB
  try {
    await mongoose.connection.db.admin().ping();
    health.services.mongodb = 'OK';
  } catch (error) {
    health.services.mongodb = 'ERROR';
    health.status = 'ERROR';
  }

  // Check Redis
  try {
    const client = redis.createClient(process.env.REDIS_URL);
    await client.ping();
    health.services.redis = 'OK';
    client.quit();
  } catch (error) {
    health.services.redis = 'ERROR';
    health.status = 'ERROR';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
```

### 3. Performance Monitoring

#### New Relic Setup
```javascript
// index.js
require('newrelic');

const express = require('express');
const app = express();

// New Relic will automatically instrument Express
```

#### Custom Metrics
```javascript
// utils/metrics.js
const { Counter, Histogram, Gauge } = require('prom-client');

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const orderCounter = new Counter({
  name: 'orders_total',
  help: 'Total number of orders'
});

module.exports = { httpRequestDuration, activeConnections, orderCounter };
```

---

## Performance Optimization

### 1. Caching Strategy

#### Redis Caching
```javascript
// utils/cache.js
const redis = require('redis');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }
}

module.exports = new CacheManager();
```

### 2. Database Query Optimization

```javascript
// Optimized queries with caching
const getVendorItems = async (vendorId) => {
  const cacheKey = `vendor:${vendorId}:items`;
  
  // Try cache first
  let items = await cache.get(cacheKey);
  
  if (!items) {
    // Optimized database query
    items = await Item.find({ vendorId })
      .select('name price type isAvailable isSpecial')
      .lean()
      .exec();
    
    // Cache for 30 minutes
    await cache.set(cacheKey, items, 1800);
  }
  
  return items;
};

// Aggregation for analytics
const getVendorStats = async (vendorId, startDate, endDate) => {
  return await Order.aggregate([
    {
      $match: {
        vendorId: mongoose.Types.ObjectId(vendorId),
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        orderCount: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        avgOrderValue: { $avg: "$totalAmount" }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};
```

---

## Security Hardening

### 1. Security Headers

```javascript
// middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const securityMiddleware = (app) => {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP'
    }
  });
  app.use('/api/', limiter);

  // Specific rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      error: 'Too many authentication attempts'
    }
  });
  app.use('/api/*/auth/', authLimiter);
};

module.exports = securityMiddleware;
```

### 2. Input Validation

```javascript
// middleware/validation.js
const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

const userSchema = Joi.object({
  fullName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
  password: Joi.string().min(6).required()
});

module.exports = { validateRequest, userSchema };
```

---

## Backup & Recovery

### 1. Automated Backup Script

```bash
#!/bin/bash
# /scripts/backup.sh

BACKUP_DIR="/var/backups/bitesbay"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="bitesbay"

# Create backup directory
mkdir -p $BACKUP_DIR

# MongoDB backup
mongodump --db $DB_NAME --out $BACKUP_DIR/mongodb_$DATE

# Compress backup
tar -czf $BACKUP_DIR/mongodb_$DATE.tar.gz -C $BACKUP_DIR mongodb_$DATE

# Upload to S3
aws s3 cp $BACKUP_DIR/mongodb_$DATE.tar.gz s3://your-backup-bucket/

# Clean up old backups (keep last 7 days)
find $BACKUP_DIR -name "mongodb_*.tar.gz" -mtime +7 -delete

# Log backup completion
echo "Backup completed: $DATE" >> /var/log/bitesbay-backup.log
```

### 2. Backup Schedule

```bash
# Add to crontab
sudo crontab -e

# Daily backup at 2 AM
0 2 * * * /var/www/bitesbay-backend/scripts/backup.sh

# Weekly full backup
0 2 * * 0 /var/www/bitesbay-backend/scripts/full-backup.sh
```

### 3. Recovery Procedures

```bash
#!/bin/bash
# /scripts/restore.sh

BACKUP_FILE=$1
DB_NAME="bitesbay"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# Stop application
pm2 stop bitesbay-backend

# Restore database
tar -xzf $BACKUP_FILE
mongorestore --db $DB_NAME mongodb_*/$DB_NAME/

# Start application
pm2 start bitesbay-backend

echo "Restore completed"
```

---

## Maintenance Procedures

### 1. Regular Maintenance Tasks

#### Daily Tasks
- Monitor application logs for errors
- Check database performance
- Verify backup completion
- Monitor disk space usage

#### Weekly Tasks
- Review security logs
- Update system packages
- Analyze slow queries
- Clean up old log files

#### Monthly Tasks
- Review and update SSL certificates
- Update application dependencies
- Review performance metrics
- Update security patches

### 2. Log Rotation

```bash
# /etc/logrotate.d/bitesbay
/var/log/bitesbay/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 3. System Updates

```bash
#!/bin/bash
# /scripts/update.sh

# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
cd /var/www/bitesbay-backend
npm ci --only=production

# Restart application
pm2 restart bitesbay-backend

# Check application health
curl -f http://localhost:5001/health || exit 1
```

---

## Troubleshooting

### 1. Common Issues

#### High Memory Usage
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Check Node.js memory
pm2 monit

# Restart if needed
pm2 restart bitesbay-backend
```

#### Database Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Test connection
mongo --eval "db.adminCommand('ping')"
```

#### SSL Certificate Issues
```bash
# Check certificate expiration
sudo certbot certificates

# Renew certificates
sudo certbot renew

# Check Nginx configuration
sudo nginx -t
```

### 2. Performance Issues

#### Slow Queries
```javascript
// Enable query profiling
db.setProfilingLevel(1, 100);

// Check slow queries
db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 });
```

#### Memory Leaks
```bash
# Monitor memory usage
node --inspect index.js

# Use heapdump for analysis
npm install heapdump
```

### 3. Emergency Procedures

#### Application Crash
```bash
# Check PM2 status
pm2 status

# Restart application
pm2 restart bitesbay-backend

# Check logs
pm2 logs bitesbay-backend --lines 100
```

#### Database Corruption
```bash
# Stop application
pm2 stop bitesbay-backend

# Repair database
mongod --repair --dbpath /var/lib/mongodb

# Restore from backup if needed
./scripts/restore.sh /path/to/backup.tar.gz
```

---

## Scaling Strategies

### 1. Horizontal Scaling

#### Load Balancer Setup
```nginx
# /etc/nginx/sites-available/bitesbay-load-balancer
upstream bitesbay_backend {
    least_conn;
    server 192.168.1.10:5001;
    server 192.168.1.11:5001;
    server 192.168.1.12:5001;
}

server {
    listen 80;
    server_name api.bitesbay.com;
    
    location / {
        proxy_pass http://bitesbay_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Session Management
```javascript
// Use Redis for session storage
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true }
}));
```

### 2. Database Scaling

#### Read Replicas
```javascript
// MongoDB replica set configuration
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URL, {
  replicaSet: 'bitesbay-replica',
  readPreference: 'secondaryPreferred'
});
```

#### Sharding Strategy
```javascript
// Shard by university ID
sh.shardCollection("bitesbay.orders", { "uniID": 1 });
sh.shardCollection("bitesbay.users", { "uniID": 1 });
```

### 3. Microservices Architecture

#### Service Decomposition
```
bitesbay-backend/
├── auth-service/          # Authentication & authorization
├── order-service/         # Order management
├── payment-service/       # Payment processing
├── notification-service/  # Email & push notifications
└── analytics-service/     # Business intelligence
```

#### API Gateway
```javascript
// Using Express Gateway
const gateway = require('express-gateway');

gateway()
  .load('./config')
  .run();
```

---

## Conclusion

This deployment and operations guide provides a comprehensive framework for:

- **Reliable deployment** of KAMPYN backend
- **Effective monitoring** and alerting
- **Robust security** measures
- **Scalable architecture** for growth
- **Efficient maintenance** procedures

Remember to:
- Regularly update this documentation
- Test all procedures in staging environment
- Monitor system performance continuously
- Keep security measures up to date
- Plan for disaster recovery scenarios 