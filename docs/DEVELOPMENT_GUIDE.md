# KAMPYN Backend - Development Guide

*Project under **EXSOLVIA** - Excellence in Software Solutions*

## Development Setup

### Detailed Installation Steps

1. **Clone and Setup**
   ```bash
   git clone https://github.com/exsolvia/kampyn-backend.git
   cd kampyn-backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Configure all required environment variables
   ```

4. **Database Setup**
   ```bash
   # Ensure MongoDB is running
   # Database will be auto-created on first connection
   ```

5. **Start Development**
   ```bash
   npm run dev
   ```

## Code Structure

```
bitesbay-backend/
├── controllers/          # API route handlers
│   ├── auth/           # Authentication controllers
│   ├── orderController.js
│   ├── vendorController.js
│   └── ...
├── models/             # Database models
│   ├── users/         # User-related models
│   ├── order/         # Order-related models
│   └── ...
├── routes/            # API routes
│   ├── auth/         # Authentication routes
│   ├── orderRoutes.js
│   └── ...
├── middleware/        # Custom middleware
├── utils/            # Utility functions
├── config/           # Configuration files
└── docs/            # Documentation
```

## API Examples

### Authentication
```bash
# User Registration
POST /api/user/auth/signup
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "1234567890",
  "password": "password123",
  "gender": "male",
  "uniID": "university_id"
}

# User Login
POST /api/user/auth/login
{
  "identifier": "john@example.com",
  "password": "password123"
}
```

### Orders
```bash
# Place Order
POST /order/:userId
{
  "items": [...],
  "vendorId": "vendor_id",
  "orderType": "dinein"
}

# Get Order Status
GET /order/:orderId
```

### Inventory
```bash
# Update Inventory
PUT /inventory/:vendorId
{
  "itemId": "item_id",
  "quantity": 50,
  "status": "available"
}
```

## Testing

### Run Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Test coverage
npm run test:coverage
```

### Test Structure
- **Unit Tests:** Individual function testing
- **Integration Tests:** API endpoint testing
- **Database Tests:** Model and query testing

## Performance Optimization

### Database Optimization
- Use indexes for frequently queried fields
- Implement pagination for large datasets
- Use aggregation pipelines for complex queries

### Caching Strategy
- Redis for session management
- Cache frequently accessed data
- Implement cache invalidation strategies

### API Optimization
- Implement rate limiting
- Use compression middleware
- Optimize response payloads

## Security Best Practices

### Authentication Security
- Use strong JWT secrets
- Implement token expiration
- Secure password hashing with bcrypt

### API Security
- Input validation and sanitization
- CORS configuration
- Rate limiting implementation
- Security headers with Helmet.js

### Data Protection
- Encrypt sensitive data
- Use environment variables for secrets
- Implement audit logging

## Deployment

### Production Setup
```bash
# Install production dependencies
npm install --production

# Build application
npm run build

# Start production server
npm start
```

### Environment Configuration
- Use production MongoDB instance
- Configure Redis for caching
- Set up SSL certificates
- Configure reverse proxy (Nginx)

### Monitoring
- Set up application monitoring
- Configure error tracking
- Implement health checks
- Set up logging system

## Troubleshooting

### Common Issues
1. **Database Connection Issues**
   - Check MongoDB connection string
   - Verify database permissions
   - Check network connectivity

2. **Authentication Problems**
   - Verify JWT secret configuration
   - Check token expiration settings
   - Validate user credentials

3. **Payment Integration Issues**
   - Verify Razorpay credentials
   - Check webhook configurations
   - Validate payment callbacks

### Debug Mode
```bash
# Enable debug logging
DEBUG=app:* npm run dev
```

## Code Quality

### Linting
```bash
# Run ESLint
npm run lint

# Fix linting issues
npm run lint:fix
```

### Code Formatting
```bash
# Format code with Prettier
npm run format
```

### Pre-commit Hooks
- Automatic linting
- Code formatting
- Test execution
- Security scanning

---

**© 2025 EXSOLVIA. All rights reserved.**
