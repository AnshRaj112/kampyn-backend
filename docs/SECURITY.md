# Security Documentation

This document outlines the security measures, best practices, and vulnerability management for the BitesBay backend system.

**Last Updated:** January 2025

---

## 🔒 Security Overview

### Security Principles
- **Defense in Depth** - Multiple layers of security controls
- **Least Privilege** - Minimal access rights for all components
- **Zero Trust** - Verify every request and connection
- **Security by Design** - Security built into the architecture

### Security Stack
```
Authentication: JWT + bcrypt + OTP
Authorization: Role-based access control (RBAC)
Data Protection: HTTPS + Input validation + SQL injection prevention
Monitoring: Rate limiting + Audit logging + Error tracking
Infrastructure: CORS + Security headers + Environment isolation
```

---

## 🔐 Authentication & Authorization

### JWT Token Security
```javascript
// Token Configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET, // 256-bit minimum
  expiresIn: '24h', // Short-lived tokens
  algorithm: 'HS256',
  issuer: 'bitesbay-backend',
  audience: 'bitesbay-users'
};
```

### Password Security
- **Hashing Algorithm:** bcrypt with salt rounds of 12
- **Minimum Requirements:** 8 characters, uppercase, lowercase, number, special character
- **Password History:** Prevent reuse of last 5 passwords
- **Account Lockout:** 5 failed attempts = 15-minute lockout

### OTP Security
- **Expiration:** 10 minutes
- **Length:** 6 digits
- **Rate Limiting:** 3 attempts per phone number per hour
- **Cleanup:** Automatic deletion after expiration

### Session Management
- **Token Refresh:** Automatic refresh before expiration
- **Logout:** Immediate token invalidation
- **Concurrent Sessions:** Limited to 3 active sessions per user
- **Device Tracking:** Log device information for suspicious activity

---

## 🛡️ API Security

### Input Validation
```javascript
// Example validation middleware
const validateOrderInput = (req, res, next) => {
  const { items, total, vendorId } = req.body;
  
  // Type checking
  if (!Array.isArray(items) || typeof total !== 'number') {
    return res.status(400).json({ error: 'Invalid input types' });
  }
  
  // Range validation
  if (total <= 0 || total > 10000) {
    return res.status(400).json({ error: 'Invalid total amount' });
  }
  
  // ObjectId validation
  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    return res.status(400).json({ error: 'Invalid vendor ID' });
  }
  
  next();
};
```

### Rate Limiting
```javascript
// Rate limiting configuration
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
};
```

### CORS Configuration
```javascript
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_2,
      // Add other allowed origins
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
```

### Security Headers
```javascript
// Security middleware
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
```

---

## 🗄️ Database Security

### Connection Security
```javascript
// MongoDB connection with security options
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: process.env.NODE_ENV === 'production',
  sslValidate: true,
  authSource: 'admin',
  retryWrites: true,
  w: 'majority',
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};
```

### Data Validation
```javascript
// Mongoose schema validation
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Invalid phone number']
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    validate: {
      validator: function(v) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(v);
      },
      message: 'Password must contain uppercase, lowercase, number, and special character'
    }
  }
});
```

### Query Injection Prevention
- **Parameterized Queries:** Always use Mongoose methods
- **Input Sanitization:** Validate and sanitize all inputs
- **ObjectId Validation:** Verify MongoDB ObjectIds before queries
- **Aggregation Limits:** Limit aggregation pipeline complexity

---

## 💳 Payment Security

### Razorpay Integration
```javascript
// Payment verification
const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
    
  return generated_signature === razorpay_signature;
};
```

### Payment Data Protection
- **PCI Compliance:** No sensitive payment data stored
- **Tokenization:** Use Razorpay tokens for recurring payments
- **Amount Validation:** Server-side amount verification
- **Currency Validation:** Ensure INR currency for all transactions
- **Receipt Validation:** Verify receipt format and uniqueness

---

## 🔍 Monitoring & Logging

### Security Logging
```javascript
// Security event logging
const logSecurityEvent = (event, details) => {
  const logEntry = {
    timestamp: new Date(),
    event: event,
    details: details,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous'
  };
  
  // Log to secure logging service
  securityLogger.info(logEntry);
  
  // Alert on suspicious events
  if (event === 'failed_login' || event === 'suspicious_activity') {
    sendSecurityAlert(logEntry);
  }
};
```

### Audit Trail
- **User Actions:** Log all user actions with timestamps
- **Admin Actions:** Comprehensive admin action logging
- **Payment Events:** Complete payment transaction logging
- **System Changes:** Configuration and deployment logging

### Error Handling
```javascript
// Secure error handling
app.use((err, req, res, next) => {
  // Log error details
  logger.error({
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });
  
  // Don't expose internal errors to client
  const clientMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
    
  res.status(err.status || 500).json({
    success: false,
    message: clientMessage
  });
});
```

---

## 🚨 Vulnerability Management

### Common Vulnerabilities

#### 1. SQL Injection
**Risk Level:** High
**Prevention:**
- Use Mongoose ODM (prevents SQL injection)
- Validate all inputs
- Use parameterized queries
- Regular security audits

#### 2. XSS (Cross-Site Scripting)
**Risk Level:** Medium
**Prevention:**
- Input sanitization
- Output encoding
- Content Security Policy (CSP)
- XSS protection headers

#### 3. CSRF (Cross-Site Request Forgery)
**Risk Level:** Medium
**Prevention:**
- CSRF tokens for state-changing operations
- SameSite cookie attributes
- Referrer validation
- Double-submit cookie pattern

#### 4. Authentication Bypass
**Risk Level:** High
**Prevention:**
- Strong password policies
- Multi-factor authentication
- Session management
- Account lockout policies

#### 5. Sensitive Data Exposure
**Risk Level:** High
**Prevention:**
- HTTPS everywhere
- Data encryption at rest
- Secure headers
- Environment variable protection

### Security Headers Implementation
```javascript
// Security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  
  next();
});
```

---

## 🔧 Security Configuration

### Environment Variables
```bash
# Required security environment variables
JWT_SECRET=your-256-bit-secret-key
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
MONGODB_URI=your-mongodb-connection-string
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
```

### Production Security Checklist
- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Input validation implemented
- [ ] Error handling secured
- [ ] Logging configured
- [ ] Monitoring enabled
- [ ] Backup strategy in place
- [ ] Incident response plan ready

---

## 🚨 Incident Response

### Security Incident Types
1. **Data Breach** - Unauthorized access to sensitive data
2. **Account Compromise** - User account takeover
3. **Payment Fraud** - Unauthorized payment transactions
4. **System Intrusion** - Unauthorized system access
5. **DDoS Attack** - Distributed denial of service

### Response Procedures
1. **Immediate Response**
   - Isolate affected systems
   - Preserve evidence
   - Notify security team
   - Assess impact scope

2. **Investigation**
   - Analyze logs and evidence
   - Identify root cause
   - Document findings
   - Plan remediation

3. **Remediation**
   - Apply security patches
   - Update configurations
   - Reset compromised credentials
   - Implement additional controls

4. **Recovery**
   - Restore services
   - Monitor for recurrence
   - Update security measures
   - Communicate with stakeholders

### Contact Information
- **Security Team:** security@bitesbay.com
- **Emergency Hotline:** +91-XXX-XXX-XXXX
- **Escalation:** CTO and CEO for critical incidents

---

## 📋 Security Testing

### Automated Testing
```javascript
// Security test examples
describe('Security Tests', () => {
  test('should prevent SQL injection', async () => {
    const maliciousInput = "'; DROP TABLE users; --";
    const response = await request(app)
      .post('/api/user/auth/login')
      .send({ email: maliciousInput, password: 'password' });
    
    expect(response.status).toBe(400);
  });
  
  test('should validate JWT tokens', async () => {
    const invalidToken = 'invalid.jwt.token';
    const response = await request(app)
      .get('/api/user/auth/check')
      .set('Authorization', `Bearer ${invalidToken}`);
    
    expect(response.status).toBe(401);
  });
});
```

### Penetration Testing
- **Quarterly Assessments** - External security audits
- **Vulnerability Scanning** - Automated security scans
- **Code Reviews** - Security-focused code analysis
- **Dependency Audits** - Regular npm audit runs

---

## 📚 Security Resources

### Documentation
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/security/)

### Tools
- **Static Analysis:** ESLint security rules
- **Dependency Scanning:** npm audit, Snyk
- **Runtime Protection:** Helmet.js, rate-limiter-flexible
- **Monitoring:** Winston, Morgan, Sentry

### Training
- **Developer Security Training** - Annual security awareness
- **Code Review Guidelines** - Security-focused reviews
- **Incident Response Drills** - Quarterly practice sessions

---

## 🔄 Security Updates

### Update Schedule
- **Security Patches:** Apply within 24 hours
- **Minor Updates:** Weekly review and deployment
- **Major Updates:** Monthly planning and testing
- **Dependency Updates:** Weekly automated checks

### Change Management
1. **Security Review** - All changes require security approval
2. **Testing** - Security testing before deployment
3. **Rollback Plan** - Always have rollback procedures
4. **Documentation** - Update security documentation

---

*This security documentation should be reviewed and updated regularly to ensure it reflects current security practices and threats.* 