# 7-Day Token Expiry Implementation

## Overview
This implementation adds 7-day token expiration for all login types (user, vendor, admin, and university) with automatic logout after 7 days of inactivity.

## Changes Made

### 1. Database Schema Updates
Added `lastActivity` field to all user models:
- `User.js` - Added `lastActivity: { type: Date, default: Date.now }`
- `Vendor.js` - Added `lastActivity: { type: Date, default: Date.now }`
- `Uni.js` - Added `lastActivity: { type: Date, default: Date.now }`
- `Admin.js` - Added `lastActivity: { type: Date, default: Date.now }`

### 2. New Utility Functions
Created `utils/authUtils.js` with:
- `checkUserActivity(userId, userType)` - Checks if user should be logged out
- `updateUserActivity(userId, userType)` - Updates user's last activity timestamp
- `getUserTypeFromToken(decoded)` - Determines user type from JWT payload

### 3. Updated Authentication Middleware
Modified all authentication middleware to check both token expiration and last activity:

#### `middleware/authMiddleware.js`
- Added activity checking for user authentication
- Updates last activity on each request
- Returns 401 if user has been inactive for 7+ days

#### `middleware/adminAuthMiddleware.js`
- Added activity checking for admin authentication
- Updates last activity on each request
- Returns 401 if admin has been inactive for 7+ days

#### `middleware/uniAuthMiddleware.js`
- Added activity checking for university authentication
- Updates last activity on each request
- Returns 401 if university has been inactive for 7+ days

### 4. Updated Auth Controllers
Modified all auth controllers to:
- Set last activity on login
- Check activity in verifyToken functions
- Return appropriate error messages for expired sessions

#### Files Updated:
- `controllers/auth/userAuthController.js`
- `controllers/auth/vendorAuthController.js`
- `controllers/auth/adminAuthController.js`
- `controllers/auth/uniAuthController.js`

### 5. Token Expiration Updates
- **Admin login**: Changed from 24 hours to 7 days
- **All other logins**: Already had 7-day expiration (maintained)

## How It Works

### 1. Login Process
When a user logs in:
1. JWT token is generated with 7-day expiration
2. `lastActivity` is set to current timestamp
3. Token is returned to client

### 2. Request Authentication
On each authenticated request:
1. JWT token is verified
2. User's `lastActivity` is checked
3. If `lastActivity` is older than 7 days, user is logged out
4. If `lastActivity` is within 7 days, it's updated to current timestamp
5. Request proceeds normally

### 3. Automatic Logout
Users are automatically logged out when:
- JWT token expires (7 days from generation)
- Last activity is older than 7 days (inactivity-based logout)

## Error Messages

### Token Expired
```json
{
  "message": "Token expired. Please log in again."
}
```

### Session Expired Due to Inactivity
```json
{
  "message": "Session expired due to inactivity. Please log in again."
}
```

### Invalid Token
```json
{
  "message": "Invalid or expired token"
}
```

## Testing

### Manual Testing
1. Login with any user type
2. Wait 7 days without making requests
3. Make a request - should get "Session expired due to inactivity" error
4. Login again - should work normally

### Automated Testing
Run the test script:
```bash
node test-token-expiry.js
```

## Configuration

### Environment Variables
No new environment variables required. Uses existing `JWT_SECRET`.

### Database Migration
The `lastActivity` field will be automatically added to existing users with the current timestamp as the default value.

## Security Considerations

1. **Activity Tracking**: Last activity is updated on every authenticated request
2. **Token Expiration**: JWT tokens expire after 7 days regardless of activity
3. **Inactivity Logout**: Users are logged out after 7 days of inactivity
4. **Automatic Cleanup**: No manual cleanup required - expired tokens are automatically rejected

## Backward Compatibility

- Existing users will have `lastActivity` set to their creation time
- No breaking changes to existing API endpoints
- All existing functionality remains unchanged

## Performance Impact

- Minimal performance impact (one additional database query per request)
- `lastActivity` field is indexed for fast lookups
- Activity updates are non-blocking

## Monitoring

To monitor token expiry:
1. Check `lastActivity` field in user records
2. Monitor 401 responses for "Session expired due to inactivity"
3. Track login frequency to identify inactive users

## Troubleshooting

### Common Issues

1. **Users getting logged out immediately**
   - Check if `lastActivity` field was properly added
   - Verify database connection

2. **Users not getting logged out after 7 days**
   - Check if middleware is properly applied to routes
   - Verify `checkUserActivity` function is working

3. **Performance issues**
   - Ensure `lastActivity` field is indexed
   - Check database query performance

### Debug Commands

```javascript
// Check user's last activity
const user = await User.findById(userId);
console.log('Last activity:', user.lastActivity);

// Check if user should be logged out
const { shouldLogout } = await checkUserActivity(userId, 'user');
console.log('Should logout:', shouldLogout);
```

## Future Enhancements

1. **Configurable Expiry**: Make 7-day limit configurable
2. **Warning System**: Warn users before session expires
3. **Activity Dashboard**: Show last activity in admin panel
4. **Bulk Cleanup**: Clean up inactive user sessions
5. **Analytics**: Track user activity patterns
