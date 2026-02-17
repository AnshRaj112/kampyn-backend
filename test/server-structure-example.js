/**
 * PRODUCTION-READY SERVER STRUCTURE EXAMPLE
 * 
 * This file demonstrates the complete, clean structure for your Express backend
 * with all security middleware properly configured.
 * 
 * Key Features:
 * ✅ Helmet security headers with CSP for Razorpay/Cloudinary
 * ✅ Environment-specific configuration (dev vs production)
 * ✅ HSTS enabled only in production
 * ✅ Trust proxy for Render deployment
 * ✅ Rate limiting with different tiers
 * ✅ Secure CORS configuration
 * ✅ Secure cookie handling
 * ✅ Proper middleware ordering
 */

require("dotenv").config();
process.env.TZ = "Asia/Kolkata";

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const logger = require("../utils/pinoLogger");

// ============================================================================
// SECURITY IMPORTS
// ============================================================================
const {
    configureHelmet,
    applyPermissionsPolicy,
    configureTrustProxy,
    additionalSecurityHeaders,
} = require('../middleware/securityConfig');
const { getCorsConfig } = require('../middleware/corsConfig');
const {
    apiLimiter,
    authLimiter,
    paymentLimiter,
    adminLimiter,
} = require('../middleware/rateLimit');

// ============================================================================
// DATABASE & ROUTES IMPORTS
// ============================================================================
const { connectDB } = require("../config/db");
const userAuthRoutes = require("../routes/auth/userAuthRoutes");
const paymentRoutes = require("../routes/paymentRoute");
const razorpayRoutes = require("../routes/razorpayRoutes");
// ... (import all your other routes)

// ============================================================================
// APP INITIALIZATION
// ============================================================================
const app = express();
const PORT = process.env.PORT || 5001;

// ============================================================================
// SECURITY MIDDLEWARE (Order matters!)
// ============================================================================

// 1. Trust proxy - MUST be first for Render
configureTrustProxy(app);

// 2. Helmet - Comprehensive security headers
app.use(configureHelmet());

// 3. Permissions Policy - Browser feature restrictions
app.use(applyPermissionsPolicy);

// 4. Additional headers - Cache control, etc.
app.use(additionalSecurityHeaders);

// 5. CORS - Cross-origin configuration
app.use(cors(getCorsConfig()));

// 6. Body parsers - With size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 7. Cookie parser - For authentication
app.use(cookieParser());

// 8. Global rate limiting - DDoS protection
app.use(apiLimiter);

// ============================================================================
// HEALTH CHECK (Before other routes)
// ============================================================================
app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
    });
});

// ============================================================================
// ROUTES WITH SPECIFIC RATE LIMITERS
// ============================================================================

// Authentication routes - Strict rate limiting
app.use("/api/user/auth", authLimiter, userAuthRoutes);
app.use("/api/vendor/auth", authLimiter, vendorAuthRoutes);
app.use("/api/admin/auth", authLimiter, adminAuthRoutes);

// Payment routes - Very strict rate limiting
app.use("/payment", paymentLimiter, paymentRoutes);
app.use("/razorpay", paymentLimiter, razorpayRoutes);

// Admin routes - Moderate rate limiting
app.use("/admin", adminLimiter, adminRoutes);

// Regular routes - Use global rate limiter (already applied)
app.use("/api/foods", foodRoutes);
app.use("/cart", cartRoutes);
app.use("/order", orderRoutes);
// ... (add all your other routes)

// ============================================================================
// ERROR HANDLING
// ============================================================================
app.use((err, req, res, next) => {
    logger.error({ err, url: req.url, method: req.method }, "Server Error");

    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production'
        ? "Internal Server Error"
        : err.message;

    res.status(err.status || 500).json({
        success: false,
        message
    });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================
async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, () => {
            logger.info({
                port: PORT,
                env: process.env.NODE_ENV,
                nodeVersion: process.version
            }, "🚀 Server running with production-grade security");

            // Log security features enabled
            logger.info({
                helmet: true,
                hsts: process.env.NODE_ENV === 'production',
                csp: true,
                rateLimiting: true,
                cors: true,
                trustProxy: process.env.NODE_ENV === 'production',
            }, "Security features enabled");
        });
    } catch (error) {
        logger.error({ error: error.message }, "Failed to start server");
        process.exit(1);
    }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => {
    logger.info("SIGTERM received, shutting down gracefully");
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info("SIGINT received, shutting down gracefully");
    process.exit(0);
});

startServer();

module.exports = app;
