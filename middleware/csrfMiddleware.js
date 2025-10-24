const crypto = require('crypto');

/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern for CSRF protection
 * This is more secure than the deprecated csurf package
 */

// Store for active CSRF tokens (in production, use Redis)
const tokenStore = new Map();

// Clean up expired tokens every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenStore.entries()) {
    if (data.expires < now) {
      tokenStore.delete(token);
    }
  }
}, 60 * 60 * 1000); // 1 hour

/**
 * Generate a secure CSRF token
 * @returns {string} CSRF token
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF Middleware - validates CSRF tokens for state-changing requests
 * @param {Object} options - Configuration options
 * @param {number} options.tokenExpiry - Token expiry time in milliseconds (default: 1 hour)
 * @param {Array} options.excludedPaths - Paths to exclude from CSRF protection
 * @param {Array} options.excludedMethods - HTTP methods to exclude from CSRF protection
 * @returns {Function} Express middleware function
 */
function csrfProtection(options = {}) {
  const {
    tokenExpiry = 60 * 60 * 1000, // 1 hour
    excludedPaths = [
      '/api/health',
      '/api/user/auth/login',
      '/api/user/auth/register',
      '/api/uni/auth/login',
      '/api/uni/auth/register',
      '/api/vendor/auth/login',
      '/api/vendor/auth/register',
      '/api/admin/auth/login',
      '/contact',
      '/razorpay/webhook'
    ],
    excludedMethods = ['GET', 'HEAD', 'OPTIONS']
  } = options;

  return (req, res, next) => {
    // Skip CSRF protection for excluded paths
    if (excludedPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Skip CSRF protection for excluded methods
    if (excludedMethods.includes(req.method)) {
      return next();
    }

    // Get CSRF token from header or body
    const tokenFromHeader = req.headers['x-csrf-token'];
    const tokenFromBody = req.body._csrf;
    const csrfToken = tokenFromHeader || tokenFromBody;

    // Get session token from cookie
    const sessionToken = req.cookies['csrf-token'];

    // Validate CSRF token
    if (!csrfToken || !sessionToken) {
      return res.status(403).json({
        error: 'CSRF token missing',
        message: 'CSRF protection: Token required for this request'
      });
    }

    // Check if token exists in store
    const tokenData = tokenStore.get(sessionToken);
    if (!tokenData) {
      return res.status(403).json({
        error: 'CSRF token invalid',
        message: 'CSRF protection: Invalid or expired token'
      });
    }

    // Check if token has expired
    if (tokenData.expires < Date.now()) {
      tokenStore.delete(sessionToken);
      return res.status(403).json({
        error: 'CSRF token expired',
        message: 'CSRF protection: Token has expired'
      });
    }

    // Verify token matches
    if (tokenData.token !== csrfToken) {
      return res.status(403).json({
        error: 'CSRF token mismatch',
        message: 'CSRF protection: Token does not match'
      });
    }

    // Token is valid, proceed
    next();
  };
}

/**
 * Generate and set CSRF token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function generateAndSetCSRFToken(req, res, next) {
  // Generate new CSRF token
  const csrfToken = generateCSRFToken();
  const sessionToken = generateCSRFToken();
  
  // Store token with expiry
  tokenStore.set(sessionToken, {
    token: csrfToken,
    expires: Date.now() + (60 * 60 * 1000) // 1 hour
  });

  // Set session token in cookie
  res.cookie('csrf-token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000 // 1 hour
  });

  // Add CSRF token to response
  res.locals.csrfToken = csrfToken;
  
  next();
}

/**
 * Middleware to provide CSRF token endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function csrfTokenEndpoint(req, res) {
  // Generate new CSRF token
  const csrfToken = generateCSRFToken();
  const sessionToken = generateCSRFToken();
  
  // Store token with expiry
  tokenStore.set(sessionToken, {
    token: csrfToken,
    expires: Date.now() + (60 * 60 * 1000) // 1 hour
  });

  // Set session token in cookie
  res.cookie('csrf-token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000 // 1 hour
  });

  res.json({
    csrfToken: csrfToken,
    message: 'CSRF token generated successfully'
  });
}

/**
 * Middleware to refresh CSRF token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function refreshCSRFToken(req, res) {
  const sessionToken = req.cookies['csrf-token'];
  
  if (!sessionToken) {
    return res.status(400).json({
      error: 'No session token found',
      message: 'Please request a new CSRF token'
    });
  }

  // Generate new CSRF token
  const newCsrfToken = generateCSRFToken();
  
  // Update token in store
  const tokenData = tokenStore.get(sessionToken);
  if (tokenData) {
    tokenData.token = newCsrfToken;
    tokenData.expires = Date.now() + (60 * 60 * 1000); // 1 hour
    tokenStore.set(sessionToken, tokenData);
  }

  res.json({
    csrfToken: newCsrfToken,
    message: 'CSRF token refreshed successfully'
  });
}

module.exports = {
  csrfProtection,
  generateAndSetCSRFToken,
  csrfTokenEndpoint,
  refreshCSRFToken
};
