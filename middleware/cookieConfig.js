/**
 * Secure Cookie Configuration
 * 
 * Provides production-grade cookie settings for authentication tokens
 * Configured for both development (HTTP) and production (HTTPS)
 */

/**
 * Get cookie options based on environment
 */
function getCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        // HTTP Only: Prevent XSS attacks by making cookie inaccessible to JavaScript
        httpOnly: true,

        // Secure: Send cookie only over HTTPS (production only)
        secure: isProduction,

        // SameSite: CSRF protection
        // 'lax' allows cookies on top-level navigation (better UX than 'strict')
        // 'none' requires secure=true and is needed for cross-site requests
        sameSite: isProduction ? 'strict' : 'lax',

        // Max age: 7 days
        maxAge: 7 * 24 * 60 * 60 * 1000,

        // Path: Cookie available for entire domain
        path: '/',

        // Domain: Set only in production for subdomain support
        ...(isProduction && process.env.COOKIE_DOMAIN && {
            domain: process.env.COOKIE_DOMAIN
        }),
    };
}

/**
 * Get cookie options for refresh tokens (longer expiry)
 */
function getRefreshTokenCookieOptions() {
    const baseOptions = getCookieOptions();

    return {
        ...baseOptions,
        // Refresh token: 30 days
        maxAge: 30 * 24 * 60 * 60 * 1000,
    };
}

/**
 * Get cookie options for session cookies (shorter expiry)
 */
function getSessionCookieOptions() {
    const baseOptions = getCookieOptions();

    return {
        ...baseOptions,
        // Session: 1 day
        maxAge: 24 * 60 * 60 * 1000,
    };
}

/**
 * Clear cookie helper
 */
function clearCookie(res, cookieName) {
    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie(cookieName, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/',
    });
}

module.exports = {
    getCookieOptions,
    getRefreshTokenCookieOptions,
    getSessionCookieOptions,
    clearCookie,
};
