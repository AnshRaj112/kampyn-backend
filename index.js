require("dotenv").config();
const express = require("express");
const cors = require("cors");
const userAuthRoutes = require("./routes/auth/userAuthRoutes");
const uniAuthRoutes = require("./routes/auth/uniAuthRoutes");
const vendorAuthRoutes = require("./routes/auth/vendorAuthRoutes");
// const foodRoutes = require("./routes/foodRoutes");
const contactRoute = require("./routes/contactRoute");
const teamRoutes = require("./routes/teamRoutes");
const itemRoutes = require("./routes/itemRoutes");
const foodCourtRoutes = require("./routes/foodCourtRoutes");
const cartRoutes = require("./routes/cartRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
// const paymentRoutes = require("./routes/paymentRoute");

const app = express();

app.use(express.json()); // ✅ Parses incoming JSON data
app.use(express.urlencoded({ extended: true })); // ✅ Parses form data

// ✅ Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = process.env.PORT || 5001;

// ✅ Fix CORS issues: Use a single instance
app.use(
  cors({
    origin: [FRONTEND_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
  })
);

// ✅ Ensure MONGO_URL exists

// ✅ Routes
app.use("/api/user/auth", userAuthRoutes);
app.use("/api/uni/auth", uniAuthRoutes);
app.use("/api/vendor/auth", vendorAuthRoutes);
// app.use("/api", foodRoutes);
app.use("/contact", contactRoute);
app.use("/team", teamRoutes);
app.use("/items", itemRoutes);
app.use("/foodcourts", foodCourtRoutes);
app.use("/cart", cartRoutes);
app.use("/inventory", inventoryRoutes);
// app.use("/payment", paymentRoutes);

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
app.listen(PORT, () =>
  console.log(
    `🚀 Server running on port ${PORT}, allowing frontend from ${FRONTEND_URL}`
  )
);
