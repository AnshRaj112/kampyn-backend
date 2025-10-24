# CSRF Protection Implementation

## Overview

This document describes the CSRF (Cross-Site Request Forgery) protection implementation for the BitesBay backend API. The implementation uses a modern, secure approach with the double-submit cookie pattern.

## Security Features

- **Double-Submit Cookie Pattern**: Uses both a cookie and a header/body token for validation
- **Token Expiry**: Tokens expire after 1 hour for security
- **Automatic Cleanup**: Expired tokens are automatically removed from memory
- **Secure Cookies**: HTTP-only, secure, and SameSite=strict cookies in production
- **Flexible Configuration**: Easy to exclude specific paths and methods

## Implementation Details

### Middleware Components

1. **`csrfProtection`**: Main middleware that validates CSRF tokens
2. **`csrfTokenEndpoint`**: Endpoint to generate new CSRF tokens
3. **`refreshCSRFToken`**: Endpoint to refresh existing tokens

### Protected Routes

All routes are protected by default except:
- Health check endpoints
- Authentication endpoints (login/register)
- Contact form
- Razorpay webhooks
- CSRF token endpoints
- GET, HEAD, OPTIONS requests

### Token Generation

- **Session Token**: Stored in HTTP-only cookie (`csrf-token`)
- **CSRF Token**: Sent in request header (`X-CSRF-Token`) or body (`_csrf`)
- **Expiry**: 1 hour from generation
- **Cleanup**: Automatic removal of expired tokens

## Frontend Integration

### 1. Get CSRF Token

```javascript
// Get initial CSRF token
const response = await fetch('/api/csrf/token', {
  method: 'GET',
  credentials: 'include'
});
const data = await response.json();
const csrfToken = data.csrfToken;
```

### 2. Include Token in Requests

```javascript
// Include CSRF token in headers
const response = await fetch('/api/your-endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  credentials: 'include',
  body: JSON.stringify(yourData)
});
```

### 3. Handle Token Refresh

```javascript
// Refresh CSRF token when needed
const refreshToken = async () => {
  const response = await fetch('/api/csrf/refresh', {
    method: 'POST',
    credentials: 'include'
  });
  const data = await response.json();
  return data.csrfToken;
};
```

## Error Handling

### Common CSRF Errors

1. **CSRF token missing** (403)
   - Solution: Include `X-CSRF-Token` header or `_csrf` in body

2. **CSRF token invalid** (403)
   - Solution: Get a new token from `/api/csrf/token`

3. **CSRF token expired** (403)
   - Solution: Refresh token using `/api/csrf/refresh`

4. **CSRF token mismatch** (403)
   - Solution: Ensure token matches between cookie and header/body

### Error Response Format

```json
{
  "error": "CSRF token missing",
  "message": "CSRF protection: Token required for this request"
}
```

## Configuration

### Excluded Paths

The following paths are excluded from CSRF protection:

```javascript
excludedPaths: [
  '/api/health',
  '/api/user/auth/login',
  '/api/user/auth/register',
  '/api/uni/auth/login',
  '/api/uni/auth/register',
  '/api/vendor/auth/login',
  '/api/vendor/auth/register',
  '/api/admin/auth/login',
  '/contact',
  '/razorpay/webhook',
  '/api/csrf/token',
  '/api/csrf/refresh'
]
```

### Excluded Methods

The following HTTP methods are excluded from CSRF protection:

```javascript
excludedMethods: ['GET', 'HEAD', 'OPTIONS']
```

## Security Considerations

### Production Settings

- **Secure Cookies**: Enabled in production (`secure: true`)
- **SameSite**: Set to `strict` for maximum security
- **HTTP-Only**: Cookies are not accessible via JavaScript
- **Token Expiry**: 1-hour expiry prevents long-term token abuse

### Development vs Production

- **Development**: Cookies work over HTTP
- **Production**: Cookies require HTTPS and secure settings

## Testing

### Manual Testing

1. **Test Token Generation**:
   ```bash
   curl -X GET http://localhost:5001/api/csrf/token -c cookies.txt
   ```

2. **Test Protected Endpoint**:
   ```bash
   curl -X POST http://localhost:5001/api/your-endpoint \
     -H "X-CSRF-Token: YOUR_TOKEN" \
     -b cookies.txt
   ```

3. **Test Token Refresh**:
   ```bash
   curl -X POST http://localhost:5001/api/csrf/refresh \
     -b cookies.txt
   ```

## Monitoring and Maintenance

### Token Store Monitoring

The middleware automatically cleans up expired tokens every hour. In production, consider:

1. **Redis Storage**: Replace in-memory storage with Redis for scalability
2. **Token Analytics**: Monitor token usage patterns
3. **Rate Limiting**: Implement rate limiting for token generation

### Performance Considerations

- **Memory Usage**: Token store grows with active sessions
- **Cleanup Frequency**: Adjust cleanup interval based on usage
- **Token Size**: 32-byte tokens provide good security/performance balance

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure `X-CSRF-Token` is in allowed headers
2. **Cookie Issues**: Check cookie settings in production
3. **Token Mismatch**: Verify token is correctly passed in requests
4. **Expired Tokens**: Implement automatic token refresh

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=csrf:*
```

## Migration Guide

### From csurf Package

If migrating from the deprecated `csurf` package:

1. Remove `csurf` dependency
2. Update frontend to use new token endpoints
3. Update request headers to include `X-CSRF-Token`
4. Test all protected endpoints

### Frontend Changes Required

1. **Token Retrieval**: Use `/api/csrf/token` instead of `req.csrfToken()`
2. **Header Format**: Use `X-CSRF-Token` header instead of `_csrf` body field
3. **Error Handling**: Handle new error response format
4. **Token Refresh**: Implement token refresh logic

## Best Practices

1. **Always Include Credentials**: Use `credentials: 'include'` in fetch requests
2. **Handle Token Expiry**: Implement automatic token refresh
3. **Secure Storage**: Never store CSRF tokens in localStorage
4. **Error Handling**: Provide user-friendly error messages
5. **Testing**: Test CSRF protection in both development and production

## Security Audit

This implementation addresses the CodeQL security alert by:

- ✅ Implementing proper CSRF token validation
- ✅ Using secure cookie settings
- ✅ Providing token expiry mechanisms
- ✅ Excluding safe endpoints appropriately
- ✅ Following modern security best practices

The CSRF protection is now active and will prevent cross-site request forgery attacks while maintaining a good user experience.
