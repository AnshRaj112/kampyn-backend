require("dotenv").config();

// Set timezone to Indian Standard Time (IST)
process.env.TZ = "Asia/Kolkata";

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const logger = require("./utils/pinoLogger");

// Import security configurations
const {
  configureHelmet,
  applyPermissionsPolicy,
  configureTrustProxy,
  additionalSecurityHeaders,
} = require('./middleware/securityConfig');
const { getCorsConfig } = require('./middleware/corsConfig');
const { apiLimiter } = require('./middleware/rateLimit');

// Import CSRF protection middleware (currently disabled)
const lusca = require('lusca');
const { csrfProtection, csrfTokenEndpoint, refreshCSRFToken } = require('./middleware/csrfMiddleware');

// Import database connections
const {
  connectDB,
  Cluster_User,
  Cluster_Order,
  Cluster_Item,
  Cluster_Inventory,
  Cluster_Accounts,
  Cluster_Cache_Analytics,
} = require("./config/db");

// Import routes
const userAuthRoutes = require("./routes/auth/userAuthRoutes");
const uniAuthRoutes = require("./routes/auth/uniAuthRoutes");
const vendorAuthRoutes = require("./routes/auth/vendorAuthRoutes");
const adminAuthRoutes = require("./routes/auth/adminAuthRoutes");
const foodRoutes = require("./routes/foodRoutes");
const contactRoute = require("./routes/contactRoute");
const teamRoutes = require("./routes/teamRoutes");
const itemRoutes = require("./routes/itemRoutes");
const foodCourtRoutes = require("./routes/foodCourtRoutes");
const cartRoutes = require("./routes/cartRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const favouriteRoutes = require("./routes/favouriteRoutes");
const orderRoutes = require("./routes/orderRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const paymentRoutes = require("./routes/paymentRoute");
const inventoryReportRoutes = require("./routes/inventoryReportRoutes");
const vendorCartRoutes = require("./routes/vendorCartRoutes");
const billingInfoRoutes = require("./routes/billingInfoRoutes");
const adminRoutes = require("./routes/adminRoutes");
const universityRoutes = require("./routes/universityRoutes");
const razorpayRoutes = require("./routes/razorpayRoutes");
const vendorPaymentRoutes = require("./routes/vendorPaymentRoutes");
const featureRoutes = require("./routes/featureRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const accessRoutes = require("./routes/accessRoutes");
const { startPeriodicCleanup } = require("./utils/orderCleanupUtils");
const { initializeDailyClearing } = require("./utils/inventoryReportUtils");
const configRoutes = require("./routes/configRoutes");
const expressOrderRoutes = require("./routes/expressOrderRoutes");
const vendorTransferRoutes = require("./routes/vendorTransferRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const grievanceRoutes = require("./routes/grievanceRoutes");
const recipeRoutes = require("./routes/recipeRoutes");
// NEW: Order approval workflow routes (new file) - handles vendor accept/deny order requests
const orderApprovalRoutes = require("./routes/orderApprovalRoutes");
const menuSortRoutes = require("./routes/menuSortRoutes");
const vendorNotificationRoutes = require("./routes/vendorNotificationRoutes");
//const tempRoutes = require("./routes/tempRoutes");
const { trackApiHit } = require("./middleware/apiTrackingMiddleware");

// ✅ Initialize Express app
const app = express();

// ============================================================================
// 🔒 SECURITY MIDDLEWARE (Applied in correct order)
// ============================================================================

// 1. Trust proxy - MUST be first for Render deployment
configureTrustProxy(app);

// 2. Helmet security headers - Comprehensive protection
app.use(configureHelmet());

// 3. Permissions Policy - Additional browser feature restrictions
app.use(applyPermissionsPolicy);

// 4. Additional security headers - Cache control, etc.
app.use(additionalSecurityHeaders);

// 5. CORS - Must come before routes
app.use(cors(getCorsConfig()));

// 6. Body parsers - Parse incoming requests
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 7. Cookie parser - Parse cookies for authentication
app.use(cookieParser());

// 8. Global rate limiting - Protect against DDoS
app.use(apiLimiter);

// 🔒 CSRF Protection - DISABLED
// CSRF protection has been disabled for development/testing purposes

// const csrfExcludedPaths = [
//   '/api/health',
//   '/api/user/auth/login',
//   '/api/user/auth/register',
//   '/api/user/auth/signup',
//   '/api/user/auth/otpverification',
//   '/api/user/auth/forgotpassword',
//   '/api/user/auth/resetpassword',
//   '/api/uni/auth/login',
//   '/api/uni/auth/register',
//   '/api/uni/auth/signup',
//   '/api/uni/auth/otpverification',
//   '/api/uni/auth/forgotpassword',
//   '/api/uni/auth/resetpassword',
//   '/api/vendor/auth/login',
//   '/api/vendor/auth/register',
//   '/api/vendor/auth/signup',
//   '/api/vendor/auth/otpverification',
//   '/api/vendor/auth/forgotpassword',
//   '/api/vendor/auth/resetpassword',
//   '/api/admin/auth/login',
//   '/contact',
//   '/razorpay/webhook',
//   '/api/csrf/token',
//   '/api/csrf/refresh',
//   '/api/admin/services',
//   '/api/university/universities'
// ];
// const csrfExcludedMethods = ['GET', 'HEAD', 'OPTIONS'];

// app.use((req, res, next) => {
//   if (
//     csrfExcludedPaths.includes(req.path) ||
//     csrfExcludedMethods.includes(req.method) ||
//     req.path.startsWith('/api/university/universities/') ||
//     req.path.startsWith('/api/admin/')
//   ) {
//     return next();
//   }
//   return csrfProtection()(req, res, next);
// });

// ✅ Load environment variables
const PORT = process.env.PORT || 5001;


// ✅ Ensure MONGO_URL exists

// ✅ API Tracking Middleware - Track all API hits
app.use(trackApiHit);

// ✅ Health check endpoint for Render
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 🔒 CSRF Token endpoints - DISABLED
// app.get("/api/csrf/token", csrfTokenEndpoint);
// app.post("/api/csrf/refresh", refreshCSRFToken);

// ✅ Serve static files for uploads (fallback for when Cloudinary fails)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Routes
app.use("/api/user/auth", userAuthRoutes);
app.use("/api/uni/auth", uniAuthRoutes);
app.use("/api/vendor/auth", vendorAuthRoutes);
app.use("/api/admin/auth", adminAuthRoutes); // 🔒 Admin authentication routes
app.use("/api/foods", foodRoutes);
app.use("/contact", contactRoute);
app.use("/team", teamRoutes);
app.use("/api/item", itemRoutes);
// Backward/forward compatibility: support both singular and plural paths
app.use("/api/items", itemRoutes);
app.use("/foodcourts", foodCourtRoutes);
app.use("/cart", cartRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/fav", favouriteRoutes);
app.use("/order", orderRoutes);
app.use("/order-approval", orderApprovalRoutes); // NEW: Order approval workflow routes
app.use("/payment", paymentRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/university", universityRoutes);
app.use("/inventoryreport", inventoryReportRoutes);
app.use("/vendorcart", vendorCartRoutes);
app.use("/billinginfo", billingInfoRoutes);
app.use("/admin", adminRoutes);
app.use("/razorpay", razorpayRoutes);
app.use("/vendor-payment", vendorPaymentRoutes);
app.use("/api", configRoutes);
app.use("/express-order", expressOrderRoutes);
app.use("/api", vendorTransferRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/admin", featureRoutes);
app.use("/api/admin", serviceRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api", grievanceRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/menu-sort", menuSortRoutes);
app.use("/api/vendor/notifications", vendorNotificationRoutes);
//app.use("/temp", tempRoutes);

// ✅ Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ✅ Global error handling
app.use((err, req, res, next) => {
  logger.error({ err, url: req.url, method: req.method }, "Server Error");
  res.status(500).json({ message: "Internal Server Error" });
});

// Export app for testing
module.exports = app;

// ✅ Start Server after DB connection
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, async () => {
      logger.info({ port: PORT }, "Server running");

      const dbStatus = {
        Users: Cluster_User.readyState === 1 ? "Connected" : "Disconnected",
        Orders: Cluster_Order.readyState === 1 ? "Connected" : "Disconnected",
        Items: Cluster_Item.readyState === 1 ? "Connected" : "Disconnected",
        Inventory: Cluster_Inventory.readyState === 1 ? "Connected" : "Disconnected",
        Accounts: Cluster_Accounts.readyState === 1 ? "Connected" : "Disconnected",
        Cache: Cluster_Cache_Analytics.readyState === 1 ? "Connected" : "Disconnected",
      };
      logger.info({ dbStatus }, "Database Connection Status");

      // Track server start
      try {
        const { ServerEvent } = require("./models/ServerMonitoring");
        await ServerEvent.create({
          eventType: 'start',
          timestamp: new Date(),
          details: {
            port: PORT,
            nodeVersion: process.version,
            platform: process.platform,
            dbStatus
          }
        });
        logger.info("Server start event recorded");
      } catch (err) {
        logger.error({ error: err.message }, "Failed to record server start event");
      }

      startPeriodicCleanup(10 * 60 * 1000);
      logger.info("Cache locking system initialized with periodic cleanup");
      logger.info("Admin authentication system ready");

      initializeDailyClearing();
      logger.info("Daily raw material clearing schedule initialized");
    });
  } catch (error) {
    logger.error({ error: error.message }, "Unable to start server - MongoDB connection failed");

    // Only track server crash if database is connected (check Cache cluster)
    // If DB connection failed, we can't write to it anyway
    if (Cluster_Cache_Analytics.readyState === 1) {
      try {
        const { ServerEvent } = require("./models/ServerMonitoring");
        await ServerEvent.create({
          eventType: 'crash',
          timestamp: new Date(),
          error: error.message,
          details: {
            stack: error.stack,
            port: PORT,
            reason: 'MongoDB connection failed'
          }
        });
      } catch (err) {
        // Ignore errors when tracking crash - DB might not be available
        logger.error({ error: err.message }, "Failed to record crash event (DB unavailable)");
      }
    }

    process.exit(1);
  }
}

// Track unhandled errors and crashes
process.on('uncaughtException', async (error) => {
  logger.error({ error: error.message, stack: error.stack }, "Uncaught Exception");

  // Only track if database is connected
  if (Cluster_Cache_Analytics && Cluster_Cache_Analytics.readyState === 1) {
    try {
      const { ServerEvent } = require("./models/ServerMonitoring");
      await ServerEvent.create({
        eventType: 'crash',
        timestamp: new Date(),
        error: error.message,
        details: {
          stack: error.stack,
          type: 'uncaughtException'
        }
      });
    } catch (err) {
      // Ignore errors when tracking crash - DB might not be available
      logger.error({ error: err.message }, "Failed to record crash event");
    }
  }

  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Rejection");

  // Only track if database is connected
  if (Cluster_Cache_Analytics && Cluster_Cache_Analytics.readyState === 1) {
    try {
      const { ServerEvent } = require("./models/ServerMonitoring");
      await ServerEvent.create({
        eventType: 'crash',
        timestamp: new Date(),
        error: reason?.toString() || 'Unhandled Promise Rejection',
        details: {
          type: 'unhandledRejection',
          promise: promise?.toString()
        }
      });
    } catch (err) {
      // Ignore errors when tracking crash - DB might not be available
      logger.error({ error: err.message }, "Failed to record crash event");
    }
  }
});

// Track graceful shutdown
process.on('SIGTERM', async () => {
  logger.info("SIGTERM received, shutting down gracefully");

  try {
    const { ServerEvent } = require("./models/ServerMonitoring");
    await ServerEvent.create({
      eventType: 'stop',
      timestamp: new Date(),
      details: {
        signal: 'SIGTERM'
      }
    });
  } catch (err) {
    // Ignore errors when tracking stop
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info("SIGINT received, shutting down gracefully");

  try {
    const { ServerEvent } = require("./models/ServerMonitoring");
    await ServerEvent.create({
      eventType: 'stop',
      timestamp: new Date(),
      details: {
        signal: 'SIGINT'
      }
    });
  } catch (err) {
    // Ignore errors when tracking stop
  }

  process.exit(0);
});

startServer();
