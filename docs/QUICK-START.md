# Quick Start Guide

## Installation

```bash
npm install helmet
```

## Usage

Your `index.js` is already configured! Just ensure `NODE_ENV` is set:

**Development:**
```bash
NODE_ENV=development npm run dev
```

**Production:**
```bash
NODE_ENV=production npm start
```

## Verify Security

```bash
# Test all modules load
node test-security.js

# Start server
npm run dev

# Check security headers
curl -I http://localhost:5001/api/health
```

## Files Created

| File | Purpose |
|------|---------|
| `middleware/securityConfig.js` | Helmet + CSP + HSTS + Permissions |
| `middleware/corsConfig.js` | Enhanced CORS |
| `middleware/rateLimit.js` | Rate limiting (enhanced) |
| `middleware/cookieConfig.js` | Secure cookies |
| `SECURITY-SETUP.md` | Full documentation |
| `server-structure-example.js` | Clean example |
| `test-security.js` | Verification script |
| `ENV-CONFIG-GUIDE.js` | Environment guide |

## Key Features

✅ **Helmet** - 15+ security headers  
✅ **CSP** - Razorpay + Cloudinary allowed  
✅ **HSTS** - Production only (1 year)  
✅ **Rate Limiting** - 5 tiers (auth, payment, admin, api, strict)  
✅ **CORS** - Environment-specific  
✅ **Secure Cookies** - httpOnly, secure, sameSite  
✅ **Trust Proxy** - Render deployment ready  

## Testing Razorpay

CSP allows:
- `https://checkout.razorpay.com` (script + iframe)
- `https://api.razorpay.com` (API calls)
- `'unsafe-inline'` (required for Razorpay)

## Testing Cloudinary

CSP allows:
- `https://res.cloudinary.com` (images)
- `https://api.cloudinary.com` (uploads)
- `blob:` and `data:` (previews)

## Common Commands

```bash
# Development
npm run dev

# Production
NODE_ENV=production npm start

# Test security
node test-security.js

# Check headers
curl -I http://localhost:5001/api/health
```

## Troubleshooting

**Issue**: Razorpay not loading  
**Fix**: Check browser console for CSP violations

**Issue**: Cloudinary images blocked  
**Fix**: Verify `CLOUDINARY_CLOUD_NAME` in .env

**Issue**: CORS errors  
**Fix**: Add domain to `FRONTEND_URL` env var

**Issue**: Cookies not working  
**Fix**: Ensure HTTPS in production

## Production Deployment

1. Set `NODE_ENV=production` in Render
2. Add production `FRONTEND_URL`
3. Deploy
4. Test: https://securityheaders.com

## Support

See `SECURITY-SETUP.md` for detailed documentation.
