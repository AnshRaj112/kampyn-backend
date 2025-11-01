require("dotenv").config();

// Set timezone to Indian Standard Time (IST)
process.env.TZ = "Asia/Kolkata";

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

// Import CSRF protection middleware
const lusca = require('lusca');
const { csrfProtection, csrfTokenEndpoint, refreshCSRFToken } = require('./middleware/csrfMiddleware');

// Import database connections
const { Cluster_User, Cluster_Order, Cluster_Item, Cluster_Inventory, Cluster_Accounts, Cluster_Cache_Analytics } = require("./config/db");

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
const orderApprovalRoutes = require("./routes/orderApprovalRoutes"); // NEW: Order approval workflow routes
//const tempRoutes = require("./routes/tempRoutes");
const app = express();

app.use(express.json()); // ✅ Parses incoming JSON data
app.use(express.urlencoded({ extended: true })); // ✅ Parses form data
app.use(cookieParser()); // 🔒 Parse cookies for admin authentication

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
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = process.env.PORT || 5001;

// Get all allowed origins from environment variables
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_2,
  process.env.FRONTEND_URL_3,
  process.env.FRONTEND_URL_4,
  process.env.FRONTEND_URL_5,
]
  .filter(Boolean) // Remove any undefined/null values
  .map((url) => url.trim()) // Remove any whitespace
  .reduce((acc, url) => {
    // If the URL is localhost, add both http and https versions
    if (url.includes("localhost")) {
      acc.push(url.replace("http://", "https://"));
      acc.push(url.replace("https://", "http://"));
    }
    acc.push(url);
    return acc;
  }, []);

// ✅ Fix CORS issues: Use a single instance
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.info("CORS blocked for origin:", origin);
        console.info("Allowed origins:", allowedOrigins);
        callback(new Error("CORS not allowed: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-CSRF-Token"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
  })
);

// ✅ Ensure MONGO_URL exists

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
//app.use("/temp", tempRoutes);

// ✅ Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ✅ Global error handling
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

// ✅ Redirect HTTP to HTTPS in Production
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect("https://" + req.headers.host + req.url);
    }
    next();
  });
}

// Export app for testing
module.exports = app;

// ✅ Start Server
app.listen(PORT, () => {
  console.info(`🚀 Server running on port ${PORT}`);

  // ✅ Log database connection status
  console.info("📊 Database Connection Status:");
  console.info(`   Users: ${Cluster_User.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.info(`   Orders: ${Cluster_Order.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.info(`   Items: ${Cluster_Item.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.info(`   Inventory: ${Cluster_Inventory.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.info(`   Accounts: ${Cluster_Accounts.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.info(`   Cache: ${Cluster_Cache_Analytics.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);

  // 🔒 Start periodic cleanup of expired orders and locks
  startPeriodicCleanup(10 * 60 * 1000); // 10 minutes
  console.info("🔒 Cache locking system initialized with periodic cleanup");
  console.info("🔐 Admin authentication system ready");

  // 🧹 Initialize daily raw material inventory clearing
  initializeDailyClearing();
  console.info("🧹 Daily raw material clearing schedule initialized");
});
