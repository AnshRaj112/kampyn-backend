/**
 * Enhanced CORS Configuration
 * 
 * Provides production-grade CORS settings with:
 * - Environment-specific origin handling
 * - Secure credentials support
 * - Proper preflight handling
 */

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins() {
    const origins = [
        process.env.FRONTEND_URL,
        process.env.FRONTEND_URL_2,
        process.env.FRONTEND_URL_3,
        process.env.FRONTEND_URL_4,
        process.env.FRONTEND_URL_5,
    ]
        .filter(Boolean)                    // Remove undefined/null
        .map((url) => url.trim())           // Remove whitespace
        .reduce((acc, url) => {
            // Add both http and https for localhost
            if (url.includes('localhost')) {
                acc.push(url.replace('http://', 'https://'));
                acc.push(url.replace('https://', 'http://'));
            }
            acc.push(url);
            return acc;
        }, []);

    return [...new Set(origins)]; // Remove duplicates
}

/**
 * CORS configuration object
 */
function getCorsConfig() {
    const allowedOrigins = getAllowedOrigins();

    return {
        // Origin validation function
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, Postman, etc.)
            if (!origin) {
                return callback(null, true);
            }

            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                // Log blocked origin for debugging
                console.warn(`CORS blocked origin: ${origin}`);
                callback(new Error(`CORS not allowed for origin: ${origin}`));
            }
        },

        // Allow credentials (cookies, authorization headers)
        credentials: true,

        // Allowed HTTP methods
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

        // Allowed request headers
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Accept',
            'X-CSRF-Token',
            'X-Requested-With',
        ],

        // Exposed response headers (accessible to frontend)
        exposedHeaders: [
            'Content-Range',
            'X-Content-Range',
            'X-Total-Count',
        ],

        // Preflight cache duration (24 hours)
        maxAge: 86400,

        // Pass preflight response to next handler
        preflightContinue: false,

        // Provide successful status for OPTIONS requests
        optionsSuccessStatus: 204,
    };
}

module.exports = {
    getCorsConfig,
    getAllowedOrigins,
};
