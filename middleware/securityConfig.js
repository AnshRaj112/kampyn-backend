/**
 * Production-Grade Security Configuration
 * 
 * This module provides comprehensive security headers and policies for Express.js
 * Configured for both development (localhost) and production (HTTPS on Render)
 * 
 * Key Features:
 * - Helmet security headers with environment-specific settings
 * - Content Security Policy (CSP) for Razorpay and Cloudinary
 * - HSTS (production only)
 * - Permissions Policy
 * - Trust proxy for Render deployment
 */

const helmet = require('helmet');

/**
 * Get Content Security Policy directives
 * Configured to allow Razorpay checkout/API and Cloudinary resources
 */
function getCSPDirectives() {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        // Default source: only same origin
        defaultSrc: ["'self'"],

        // Scripts: Allow Razorpay checkout SDK and inline scripts (required for Razorpay)
        scriptSrc: [
            "'self'",
            "https://checkout.razorpay.com",  // Razorpay checkout script
            "'unsafe-inline'",                 // Required for Razorpay inline scripts
        ],

        // Styles: Allow inline styles (common in React/modern frameworks)
        styleSrc: [
            "'self'",
            "'unsafe-inline'",                 // Required for dynamic styling
            "https://fonts.googleapis.com",    // Google Fonts (if used)
        ],

        // Images: Allow Cloudinary and Razorpay
        imgSrc: [
            "'self'",
            "data:",                           // Data URIs for inline images
            "blob:",                           // Blob URLs for file uploads
            "https://res.cloudinary.com",      // Cloudinary images
            `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME || '*'}`, // Specific cloud
            "https://checkout.razorpay.com",   // Razorpay branding images
            "https://*.razorpay.com",          // All Razorpay subdomains
        ],

        // Fonts: Allow Google Fonts and data URIs
        fontSrc: [
            "'self'",
            "data:",
            "https://fonts.gstatic.com",
        ],

        // Connect (AJAX/fetch): Allow API calls to Razorpay and Cloudinary
        connectSrc: [
            "'self'",
            "https://api.razorpay.com",        // Razorpay API
            "https://checkout.razorpay.com",   // Razorpay checkout
            "https://*.razorpay.com",          // All Razorpay endpoints
            "https://api.cloudinary.com",      // Cloudinary API
            "https://res.cloudinary.com",      // Cloudinary resources
            ...(isProduction ? [] : ["http://localhost:*", "ws://localhost:*"]), // Dev hot reload
        ],

        // Frames: Allow Razorpay checkout iframe
        frameSrc: [
            "'self'",
            "https://api.razorpay.com",        // Razorpay payment iframe
            "https://checkout.razorpay.com",   // Razorpay checkout iframe
        ],

        // Media: Allow Cloudinary video/audio
        mediaSrc: [
            "'self'",
            "https://res.cloudinary.com",
            "blob:",
        ],

        // Object/Embed: Restrict plugins
        objectSrc: ["'none'"],

        // Base URI: Prevent base tag injection
        baseUri: ["'self'"],

        // Form actions: Only allow same origin
        formAction: ["'self'"],

        // Frame ancestors: Prevent clickjacking
        frameAncestors: ["'none'"],

        // Upgrade insecure requests in production
        ...(isProduction && { upgradeInsecureRequests: [] }),
    };
}

/**
 * Get Permissions Policy configuration
 * Restricts browser features to enhance privacy and security
 */
function getPermissionsPolicy() {
    return {
        // Camera/Microphone: Deny (not needed for food ordering)
        camera: [],
        microphone: [],

        // Geolocation: Allow same origin (for delivery location)
        geolocation: ['self'],

        // Payment: Allow same origin + Razorpay
        payment: ['self', 'https://api.razorpay.com', 'https://checkout.razorpay.com'],

        // USB/Serial: Deny
        usb: [],

        // Interest cohort (FLoC): Deny for privacy
        'interest-cohort': [],
    };
}

/**
 * Configure Helmet middleware with all security headers
 */
function configureHelmet() {
    const isProduction = process.env.NODE_ENV === 'production';

    return helmet({
        // Content Security Policy
        contentSecurityPolicy: {
            directives: getCSPDirectives(),
            reportOnly: false, // Set to true during testing, false in production
        },

        // HTTP Strict Transport Security (HSTS) - Production only
        hsts: isProduction ? {
            maxAge: 31536000,        // 1 year in seconds
            includeSubDomains: true, // Apply to all subdomains
            preload: true,           // Allow browser preload list inclusion
        } : false,                 // Disabled in development (no HTTPS)

        // X-Frame-Options: Prevent clickjacking
        frameguard: {
            action: 'deny',          // Don't allow any framing
        },

        // X-Content-Type-Options: Prevent MIME sniffing
        noSniff: true,

        // X-DNS-Prefetch-Control: Control DNS prefetching
        dnsPrefetchControl: {
            allow: false,
        },

        // X-Download-Options: Prevent IE from executing downloads
        ieNoOpen: true,

        // Referrer-Policy: Control referrer information
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin',
        },

        // X-Permitted-Cross-Domain-Policies: Restrict Adobe Flash/PDF
        permittedCrossDomainPolicies: {
            permittedPolicies: 'none',
        },

        // Cross-Origin-Embedder-Policy
        crossOriginEmbedderPolicy: false, // Disabled to allow Cloudinary/Razorpay

        // Cross-Origin-Opener-Policy
        crossOriginOpenerPolicy: {
            policy: 'same-origin-allow-popups', // Allow Razorpay popups
        },

        // Cross-Origin-Resource-Policy
        crossOriginResourcePolicy: {
            policy: 'cross-origin', // Allow Cloudinary resources
        },

        // Origin-Agent-Cluster
        originAgentCluster: true,

        // X-Powered-By: Hide Express
        hidePoweredBy: true,
    });
}

/**
 * Format Permissions Policy for header
 */
function formatPermissionsPolicy(policy) {
    return Object.entries(policy)
        .map(([feature, allowlist]) => {
            if (allowlist.length === 0) return `${feature}=()`;
            const origins = allowlist.map(origin =>
                origin === 'self' ? 'self' : `"${origin}"`
            ).join(' ');
            return `${feature}=(${origins})`;
        })
        .join(', ');
}

/**
 * Apply Permissions Policy middleware
 */
function applyPermissionsPolicy(req, res, next) {
    const policy = getPermissionsPolicy();
    res.setHeader('Permissions-Policy', formatPermissionsPolicy(policy));
    next();
}

/**
 * Configure trust proxy for Render deployment
 * Render uses a reverse proxy, so we need to trust the X-Forwarded-* headers
 */
function configureTrustProxy(app) {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        // Trust first proxy (Render's load balancer)
        app.set('trust proxy', 1);
    } else {
        // Don't trust proxy in development
        app.set('trust proxy', false);
    }
}

/**
 * Additional security headers not covered by Helmet
 */
function additionalSecurityHeaders(req, res, next) {
    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    next();
}

module.exports = {
    configureHelmet,
    applyPermissionsPolicy,
    configureTrustProxy,
    additionalSecurityHeaders,
    getCSPDirectives,
    getPermissionsPolicy,
};
