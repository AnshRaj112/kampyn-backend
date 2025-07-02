require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
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
const { startPeriodicCleanup } = require("./utils/orderCleanupUtils");
const configRoutes = require("./routes/configRoutes");
//const tempRoutes = require("./routes/tempRoutes");
const app = express();

app.use(express.json()); // ✅ Parses incoming JSON data
app.use(express.urlencoded({ extended: true })); // ✅ Parses form data
app.use(cookieParser()); // 🔒 Parse cookies for admin authentication

// ✅ Load environment variables
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = process.env.PORT || 5001;

// Get all allowed origins from environment variables
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_2,
  process.env.FRONTEND_URL_3,
  process.env.FRONTEND_URL_4,
  process.env.FRONTEND_URL_5
]
  .filter(Boolean) // Remove any undefined/null values
  .map(url => url.trim()) // Remove any whitespace
  .reduce((acc, url) => {
    // If the URL is localhost, add both http and https versions
    if (url.includes('localhost')) {
      acc.push(url.replace('http://', 'https://'));
      acc.push(url.replace('https://', 'http://'));
    }
    acc.push(url);
    return acc;
  }, []);

// ✅ Fix CORS issues: Use a single instance
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
      callback(new Error("CORS not allowed: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
}));

// ✅ Ensure MONGO_URL exists

// ✅ Routes
app.use("/api/user/auth", userAuthRoutes);
app.use("/api/uni/auth", uniAuthRoutes);
app.use("/api/vendor/auth", vendorAuthRoutes);
app.use("/api/admin/auth", adminAuthRoutes); // 🔒 Admin authentication routes
app.use("/api/foods", foodRoutes);
app.use("/contact", contactRoute);
app.use("/team", teamRoutes);
app.use("/api/item", itemRoutes);
app.use("/foodcourts", foodCourtRoutes);
app.use("/cart", cartRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/fav", favouriteRoutes);
app.use("/order", orderRoutes);
app.use("/payment", paymentRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/inventoryreport", inventoryReportRoutes);
app.use("/vendorcart", vendorCartRoutes);
app.use("/billinginfo", billingInfoRoutes);
app.use("/admin", adminRoutes); // 🔒 Admin routes for lock management
app.use("/api", configRoutes);
//app.use("/temp", tempRoutes);

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

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // 🔒 Start periodic cleanup of expired orders and locks
  startPeriodicCleanup(5 * 60 * 1000); // 5 minutes
  console.log("🔒 Cache locking system initialized with periodic cleanup");
  console.log("🔐 Admin authentication system ready");
});
