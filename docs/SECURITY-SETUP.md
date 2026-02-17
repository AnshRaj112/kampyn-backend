# Production-Grade Security Configuration

## Overview

This backend implements comprehensive security measures for production deployment on Render with Razorpay payments and Cloudinary media uploads.

## Security Features Implemented

### 1. Helmet Security Headers

**File**: `middleware/securityConfig.js`

Helmet provides 15+ security headers:

- **Content Security Policy (CSP)**: Configured for Razorpay and Cloudinary
- **HSTS**: Enabled only in production (31536000s = 1 year)
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **Referrer-Policy**: Controls referrer information
- **X-DNS-Prefetch-Control**: Limits DNS prefetching
- **Hide X-Powered-By**: Hides Express fingerprint

### 2. Content Security Policy (CSP)

Allows required resources while blocking everything else:

```javascript
// Scripts: Razorpay checkout
scriptSrc: ["'self'", "https://checkout.razorpay.com", "'unsafe-inline'"]

// Images: Cloudinary
imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"]

// Connect: API calls
connectSrc: ["'self'", "https://api.razorpay.com", "https://api.cloudinary.com"]

// Frames: Razorpay iframe
frameSrc: ["'self'", "https://checkout.razorpay.com"]
```

### 3. HSTS (HTTP Strict Transport Security)

**Production only** - Forces HTTPS for 1 year:

```javascript
hsts: isProduction ? {
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true,
} : false
```

### 4. Permissions Policy

Restricts browser features:

```javascript
{
  camera: [],              // Deny
  microphone: [],          // Deny
  geolocation: ['self'],   // Allow for delivery
  payment: ['self', 'https://api.razorpay.com'],
  'interest-cohort': [],   // Block FLoC
}
```

### 5. CORS Configuration

**File**: `middleware/corsConfig.js`

Environment-specific origin handling:

- **Development**: Allows localhost (http/https)
- **Production**: Only allowed production domains
- **Credentials**: Enabled for cookies
- **Preflight**: 24-hour cache

### 6. Rate Limiting

**File**: `middleware/rateLimit.js`

Multiple tiers:

| Limiter | Window | Max Requests | Use Case |
|---------|--------|--------------|----------|
| `authLimiter` | 15 min | 5 (prod) / 10 (dev) | Login, signup |
| `paymentLimiter` | 15 min | 10 | Razorpay operations |
| `adminLimiter` | 15 min | 50 | Admin operations |
| `apiLimiter` | 15 min | 100 (prod) / 200 (dev) | General API |
| `strictLimiter` | 15 min | 20 | Database-intensive |

### 7. Trust Proxy

**Enabled in production** for Render deployment:

```javascript
app.set('trust proxy', 1); // Trust first proxy (Render's load balancer)
```

This ensures:
- Correct client IP detection
- HTTPS detection via `X-Forwarded-Proto`
- Rate limiting works correctly

### 8. Secure Cookies

**File**: `middleware/cookieConfig.js`

Environment-specific cookie settings:

```javascript
{
  httpOnly: true,                    // Prevent XSS
  secure: isProduction,              // HTTPS only in production
  sameSite: isProduction ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
}
```

## Middleware Order (Critical!)

```javascript
1. configureTrustProxy(app)        // MUST be first
2. app.use(configureHelmet())      // Security headers
3. app.use(applyPermissionsPolicy) // Browser restrictions
4. app.use(additionalSecurityHeaders)
5. app.use(cors(getCorsConfig()))  // CORS
6. app.use(express.json())         // Body parser
7. app.use(cookieParser())         // Cookies
8. app.use(apiLimiter)             // Rate limiting
```

## Environment Variables Required

```env
NODE_ENV=production                 # or development
FRONTEND_URL=https://yourdomain.com
RAZORPAY_KEY_ID=rzp_xxx
CLOUDINARY_CLOUD_NAME=your_cloud
```

## Testing

### Development (localhost)

```bash
NODE_ENV=development npm run dev
```

- HSTS: Disabled
- HTTPS: Not required
- Rate limits: Lenient
- CORS: Allows localhost

### Production (Render)

```bash
NODE_ENV=production npm start
```

- HSTS: Enabled (1 year)
- HTTPS: Required
- Rate limits: Strict
- CORS: Production domains only
- Trust proxy: Enabled

## Razorpay Integration

CSP allows:
- ✅ Razorpay checkout script
- ✅ Razorpay API calls
- ✅ Razorpay payment iframe
- ✅ Razorpay inline scripts (required)

## Cloudinary Integration

CSP allows:
- ✅ Cloudinary images (`res.cloudinary.com`)
- ✅ Cloudinary API calls
- ✅ Cloudinary uploads
- ✅ Blob URLs for file previews

## Security Headers Response

```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://checkout.razorpay.com 'unsafe-inline'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), payment=(self "https://api.razorpay.com")
```

## Common Issues & Solutions

### Issue: Razorpay checkout not loading

**Solution**: CSP already allows `'unsafe-inline'` for scripts. If still blocked, check browser console for specific CSP violation.

### Issue: Cloudinary images not loading

**Solution**: CSP allows `res.cloudinary.com`. Ensure your cloud name is correct in env vars.

### Issue: CORS errors in production

**Solution**: Add your production domain to `FRONTEND_URL` env var.

### Issue: Rate limiting too strict

**Solution**: Adjust limits in `middleware/rateLimit.js` or apply specific limiters to routes.

### Issue: Cookies not working in production

**Solution**: Ensure `NODE_ENV=production` and your site uses HTTPS.

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Verify HTTPS is enabled on Render
- [ ] Test Razorpay checkout flow
- [ ] Test Cloudinary uploads
- [ ] Verify rate limiting works
- [ ] Check security headers with [securityheaders.com](https://securityheaders.com)

## Security Audit

Run these checks:

1. **Headers**: https://securityheaders.com
2. **SSL**: https://www.ssllabs.com/ssltest/
3. **CSP**: Browser DevTools → Console (check for violations)

## Performance Impact

- Helmet: < 1ms overhead
- Rate limiting: < 1ms overhead
- CORS: < 1ms overhead
- **Total**: Negligible impact on response time

## Maintenance

Update CSP when adding new services:

```javascript
// In middleware/securityConfig.js
connectSrc: [
  "'self'",
  "https://api.razorpay.com",
  "https://api.cloudinary.com",
  "https://new-service.com",  // Add here
]
```

## Support

For issues:
1. Check browser console for CSP violations
2. Check server logs for rate limit hits
3. Verify environment variables
4. Test in development first
