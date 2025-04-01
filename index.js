require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const foodRoutes = require("./routes/foodRoutes");
const contactRoute = require("./routes/contactRoute");
const connectDB = require("./config/db");
const teamRoutes = require("./routes/teamRoutes");

const app = express();
connectDB();

app.use(express.json());  // ✅ Parses incoming JSON data
app.use(express.urlencoded({ extended: true }));  // ✅ Parses form data

// ✅ Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const EXPOWEB_URL = process.env.EXPO_PUBLIC_BACKEND_URL_WEB || "http://localhost:8081";
const EXPOAPP_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "http://10.2.248.221:8081";
const MONGO_URL = process.env.MONGO_URL;
const PORT = process.env.PORT || 5001;

// ✅ Fix CORS issues: Use a single instance
app.use(
  cors({
    origin: [FRONTEND_URL, EXPOWEB_URL, EXPOAPP_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
  })
);


// ✅ Ensure MONGO_URL exists
if (!MONGO_URL) {
  console.error("❌ MONGO_URL is missing in .env file");
  process.exit(1);
}

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api", foodRoutes);
app.use("/contact", contactRoute);
app.use("/team", teamRoutes);

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
  console.log(`🚀 Server running on port ${PORT}, allowing frontend from ${FRONTEND_URL}, allowing frontend of web application from ${EXPOWEB_URL}, allowing frontend of application from ${EXPOAPP_URL}`)
);
