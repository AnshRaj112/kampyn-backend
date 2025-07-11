# BitesBay Backend Documentation

Welcome to the comprehensive documentation for the BitesBay backend system. This documentation provides detailed information about the architecture, APIs, deployment, and development guidelines.

**Last Updated:** July 2025

---

## 📚 Documentation Index

### 🚀 Getting Started
- **[Main README](../README.md)** - Project overview, setup, and quick start guide
- **[API Reference](./API_REFERENCE.md)** - Complete API endpoint documentation
- **[Authentication Guide](./AUTHENTICATION.md)** - Authentication system and security

### 🏗️ Architecture & Design
- **[Database Schema](./DATABASE_SCHEMA.md)** - Database structure, relationships, and indexing
- **[API Development Guide](./API_DEVELOPMENT_GUIDE.md)** - Coding standards and best practices
- **[Cache Locking System](./CACHE_LOCKING_SYSTEM.md)** - Order management and concurrency control

### 🧪 Testing & Quality
- **[Testing Guide](./TESTING_GUIDE.md)** - Unit, integration, and API testing guidelines
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

### 🚀 Deployment & Operations
- **[Deployment & Operations](./DEPLOYMENT_OPERATIONS.md)** - Production deployment and monitoring
- **[CI/CD Setup](./CI_CD_SETUP.md)** - Automated deployment pipeline
- **[Deployment Guide](./DEPLOYMENT.md)** - Basic deployment instructions

### 🔧 Features & Systems
- **[Order Number System](./ORDER_NUMBER_SYSTEM.md)** - Order numbering and tracking
- **[Order Cleanup Fix](./ORDER_CLEANUP_FIX.md)** - Order lifecycle management
- **[University Charges Feature](./UNIVERSITY_CHARGES_FEATURE.md)** - University-specific billing

---

## 🎯 Quick Navigation

### For Developers
| Task | Documentation |
|------|---------------|
| **Set up development environment** | [Main README](../README.md) |
| **Understand API endpoints** | [API Reference](./API_REFERENCE.md) |
| **Learn coding standards** | [API Development Guide](./API_DEVELOPMENT_GUIDE.md) |
| **Write tests** | [Testing Guide](./TESTING_GUIDE.md) |
| **Understand database structure** | [Database Schema](./DATABASE_SCHEMA.md) |

### For DevOps & Operations
| Task | Documentation |
|------|---------------|
| **Deploy to production** | [Deployment & Operations](./DEPLOYMENT_OPERATIONS.md) |
| **Set up CI/CD** | [CI/CD Setup](./CI_CD_SETUP.md) |
| **Monitor system health** | [Deployment & Operations](./DEPLOYMENT_OPERATIONS.md) |
| **Troubleshoot issues** | [Troubleshooting](./TROUBLESHOOTING.md) |

### For System Administrators
| Task | Documentation |
|------|---------------|
| **Configure authentication** | [Authentication Guide](./AUTHENTICATION.md) |
| **Manage database** | [Database Schema](./DATABASE_SCHEMA.md) |
| **Set up monitoring** | [Deployment & Operations](./DEPLOYMENT_OPERATIONS.md) |
| **Handle backups** | [Deployment & Operations](./DEPLOYMENT_OPERATIONS.md) |

---

## 🏛️ System Architecture

### Overview
BitesBay is a multi-tenant food ordering platform designed for universities, featuring:

- **Multi-role authentication** (Users, Vendors, Universities, Admins)
- **Real-time order management** with WebSocket support
- **Payment integration** via Razorpay
- **Inventory management** for vendors
- **Analytics and reporting** capabilities

### Technology Stack
```
Backend Framework: Node.js + Express.js
Database: MongoDB + Mongoose ODM
Authentication: JWT + bcrypt
Caching: Redis
Payment: Razorpay
Email: Nodemailer
Real-time: Socket.io
Testing: Jest + Supertest
Deployment: PM2 + Nginx
```

### Core Components
```
├── Authentication System
│   ├── JWT-based authentication
│   ├── OTP verification
│   ├── Google OAuth integration
│   └── Role-based access control
├── Order Management
│   ├── Order creation and tracking
│   ├── Real-time status updates
│   ├── Payment processing
│   └── Order lifecycle management
├── Inventory System
│   ├── Item management
│   ├── Stock tracking
│   ├── Vendor catalog
│   └── Inventory reports
└── Analytics & Reporting
    ├── Order analytics
    ├── Revenue tracking
    ├── User behavior analysis
    └── Performance metrics
```

---

## 🔐 Authentication System

### User Types
- **Users** - Regular customers who place orders
- **Vendors** - Food court operators and restaurant owners
- **Universities** - Educational institutions managing the platform
- **Admins** - System administrators with full access

### Authentication Flow
1. **Registration** - User signup with email verification
2. **Login** - JWT-based authentication
3. **OTP Verification** - Email-based verification
4. **Password Reset** - Secure password recovery
5. **Google OAuth** - Social login integration

### Security Features
- Password hashing with bcrypt
- JWT token management
- Rate limiting on auth endpoints
- Input validation and sanitization
- CORS configuration
- Security headers

---

## 📊 Database Design

### Collections Overview
```
Users & Authentication
├── users (regular customers)
├── vendors (food court operators)
├── universities (institution managers)
├── admins (system administrators)
└── otps (one-time passwords)

Order Management
├── orders (order records)
├── payments (payment transactions)
├── ordercounters (order numbering)
└── billinginfos (billing records)

Inventory & Items
├── retails (retail items)
├── produces (produce items)
└── inventoryreports (stock reports)

System Collections
├── colleges (university data)
├── contactmessages (support messages)
└── cacheanalytics (performance metrics)
```

### Key Relationships
- Users/Vendors/Universities → College (Many-to-One)
- Orders → User (Many-to-One)
- Orders → Vendor (Many-to-One)
- Items → Vendor (Many-to-One)

---

## 🚀 API Design

### RESTful Endpoints
```
Authentication
├── POST /api/user/auth/signup
├── POST /api/user/auth/login
├── POST /api/user/auth/otpverification
└── POST /api/user/auth/forgotpassword

Orders
├── POST /order/:userId
├── GET /order/:orderId
├── PATCH /order/:orderId/complete
└── POST /order/:orderId/cancel

Items
├── GET /api/item/:category/uni/:uniId
├── POST /api/item/:category
├── PUT /api/item/:category/:id
└── DELETE /api/item/:category/:id

Vendors
├── GET /api/vendor/list/uni/:uniId
├── PATCH /api/vendor/availability/uni/:uniId/vendor/:vendorId
└── GET /api/vendor/:vendorId/delivery-settings
```

### Response Format
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## 🧪 Testing Strategy

### Test Types
- **Unit Tests** - Individual function testing
- **Integration Tests** - Component interaction testing
- **API Tests** - Endpoint and response testing
- **Database Tests** - Data persistence testing
- **Performance Tests** - Load and stress testing
- **Security Tests** - Authentication and authorization testing

### Testing Tools
- **Jest** - Test framework and runner
- **Supertest** - HTTP assertion library
- **MongoDB Memory Server** - In-memory database for testing
- **Redis Mock** - Mock Redis for testing

### Coverage Goals
- **Code Coverage**: 80%+
- **Critical Paths**: 100%
- **Error Conditions**: 100%
- **Security Features**: 100%

---

## 🚀 Deployment & Operations

### Production Environment
- **Server**: Ubuntu 22.04 LTS
- **Process Manager**: PM2
- **Web Server**: Nginx
- **SSL**: Let's Encrypt
- **Monitoring**: New Relic + Custom metrics

### Deployment Pipeline
1. **Code Commit** → GitHub
2. **Automated Testing** → Jest + Supertest
3. **Security Scan** → Dependency vulnerability check
4. **Build & Deploy** → Render/Heroku
5. **Health Check** → Application monitoring
6. **Rollback** → Automatic on failure

### Monitoring & Alerting
- **Application Metrics** - Response time, error rates
- **System Metrics** - CPU, memory, disk usage
- **Database Metrics** - Query performance, connection pools
- **Business Metrics** - Order volume, revenue, user activity

---

## 🔧 Development Workflow

### Code Standards
- **ES6+** JavaScript features
- **2-space** indentation
- **camelCase** for variables and functions
- **PascalCase** for classes and constructors
- **Async/await** for asynchronous operations
- **Comprehensive error handling**

### Git Workflow
```
Feature Development
├── Create feature branch: features/feature-name
├── Implement feature with tests
├── Update documentation
├── Create pull request
└── Code review and merge

Bug Fixes
├── Create fix branch: fixes/bug-description
├── Implement fix with tests
├── Update documentation
├── Create pull request
└── Code review and merge
```

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Error handling is implemented
- [ ] Security considerations addressed
- [ ] Performance impact assessed

---

## 🛠️ Common Tasks

### Adding New API Endpoints
1. **Create controller** in `controllers/` directory
2. **Define routes** in `routes/` directory
3. **Add validation** using Joi schemas
4. **Write tests** for the endpoint
5. **Update API documentation**
6. **Add to main app** in `index.js`

### Database Schema Changes
1. **Update model** in `models/` directory
2. **Create migration script** if needed
3. **Update related controllers**
4. **Add database tests**
5. **Update documentation**

### Authentication Integration
1. **Add middleware** for route protection
2. **Update user model** if needed
3. **Test authentication flow**
4. **Update security documentation**

---

## 📞 Support & Resources

### Getting Help
- **Documentation Issues**: Create GitHub issue
- **Bug Reports**: Use GitHub issue template
- **Feature Requests**: Submit via GitHub discussions
- **Security Issues**: Email security@bitesbay.com

### External Resources
- **Node.js Documentation**: https://nodejs.org/docs
- **Express.js Guide**: https://expressjs.com/guide
- **MongoDB Manual**: https://docs.mongodb.com/manual
- **Jest Testing**: https://jestjs.io/docs/getting-started

### Team Contacts
- **Backend Team**: backend@bitesbay.com
- **DevOps Team**: devops@bitesbay.com
- **Security Team**: security@bitesbay.com

---

## 📈 Performance Metrics

### Current Benchmarks
- **API Response Time**: < 200ms (95th percentile)
- **Database Query Time**: < 50ms (average)
- **Concurrent Users**: 1000+ supported
- **Uptime**: 99.9% availability
- **Error Rate**: < 0.1%

### Optimization Areas
- **Database indexing** for complex queries
- **Redis caching** for frequently accessed data
- **Connection pooling** for database efficiency
- **CDN integration** for static assets
- **Load balancing** for horizontal scaling

---

## 🔮 Future Roadmap

### Planned Features
- **Microservices Architecture** - Service decomposition
- **Real-time Analytics** - Live dashboard
- **Advanced Reporting** - Custom report builder
- **Mobile API** - Native mobile app support
- **Third-party Integrations** - ERP system connections

### Technical Improvements
- **GraphQL API** - Flexible data querying
- **Event Sourcing** - Audit trail and analytics
- **Container Orchestration** - Kubernetes deployment
- **Advanced Caching** - Multi-level caching strategy
- **API Versioning** - Backward compatibility

---

## 📝 Documentation Maintenance

### Update Schedule
- **API Documentation**: Updated with each release
- **Deployment Guides**: Updated for infrastructure changes
- **Security Documentation**: Updated for new threats
- **Performance Guides**: Updated quarterly

### Contributing to Documentation
1. **Fork the repository**
2. **Create documentation branch**
3. **Make changes** with clear explanations
4. **Add examples** and code snippets
5. **Submit pull request** for review

---

## 🎉 Conclusion

This documentation provides a comprehensive guide to the BitesBay backend system. Whether you're a developer, DevOps engineer, or system administrator, you'll find the information you need to work effectively with the platform.

**Remember**: This documentation is a living document. Please contribute improvements, report issues, and suggest enhancements to keep it current and useful for the entire team.

---

*Last updated: January 2025*
*BitesBay Backend Team* 