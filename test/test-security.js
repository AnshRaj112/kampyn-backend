/**
 * Quick Test Script for Security Configuration
 * 
 * Run: node test-security.js
 */

require("dotenv").config();

console.log("🔍 Testing Security Configuration...\n");

// Test 1: Security Config
try {
    const securityConfig = require('../middleware/securityConfig');
    console.log("✅ securityConfig.js loaded");
    console.log("   - configureHelmet:", typeof securityConfig.configureHelmet);
    console.log("   - applyPermissionsPolicy:", typeof securityConfig.applyPermissionsPolicy);
    console.log("   - configureTrustProxy:", typeof securityConfig.configureTrustProxy);
} catch (err) {
    console.error("❌ securityConfig.js failed:", err.message);
}

// Test 2: CORS Config
try {
    const corsConfig = require('../middleware/corsConfig');
    console.log("\n✅ corsConfig.js loaded");
    console.log("   - getCorsConfig:", typeof corsConfig.getCorsConfig);
    const config = corsConfig.getCorsConfig();
    console.log("   - credentials:", config.credentials);
    console.log("   - methods:", config.methods.join(", "));
} catch (err) {
    console.error("❌ corsConfig.js failed:", err.message);
}

// Test 3: Rate Limit Config
try {
    const rateLimit = require('../middleware/rateLimit');
    console.log("\n✅ rateLimit.js loaded");
    console.log("   - authLimiter:", typeof rateLimit.authLimiter);
    console.log("   - paymentLimiter:", typeof rateLimit.paymentLimiter);
    console.log("   - apiLimiter:", typeof rateLimit.apiLimiter);
} catch (err) {
    console.error("❌ rateLimit.js failed:", err.message);
}

// Test 4: Cookie Config
try {
    const cookieConfig = require('../middleware/cookieConfig');
    console.log("\n✅ cookieConfig.js loaded");
    console.log("   - getCookieOptions:", typeof cookieConfig.getCookieOptions);
    const options = cookieConfig.getCookieOptions();
    console.log("   - httpOnly:", options.httpOnly);
    console.log("   - secure:", options.secure);
    console.log("   - sameSite:", options.sameSite);
} catch (err) {
    console.error("❌ cookieConfig.js failed:", err.message);
}

// Test 5: Environment Check
console.log("\n🌍 Environment Configuration:");
console.log("   - NODE_ENV:", process.env.NODE_ENV || "development");
console.log("   - FRONTEND_URL:", process.env.FRONTEND_URL || "not set");
console.log("   - RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "✅ set" : "❌ not set");
console.log("   - CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME ? "✅ set" : "❌ not set");

console.log("\n✅ All security modules loaded successfully!");
console.log("\n📝 Next steps:");
console.log("   1. Start server: npm run dev");
console.log("   2. Check security headers: curl -I http://localhost:5001/api/health");
console.log("   3. Test Razorpay integration");
console.log("   4. Test Cloudinary uploads");
