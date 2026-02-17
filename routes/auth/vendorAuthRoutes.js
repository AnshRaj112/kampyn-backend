const express = require("express");
const { signup, verifyOtp, login, forgotPassword, resetPassword, googleAuth, googleSignup, logout, refreshToken, verifyToken, checkSession, getUser } = require("../../controllers/auth/vendorAuthController");
const { perApiAuthLimiter } = require("../../middleware/rateLimit");
const router = express.Router();

// Auth routes with per-API rate limiting
// Each endpoint has its own rate limit counter per IP
// Hitting limit on /login won't block /signup or other endpoints
router.post("/signup", perApiAuthLimiter, signup);
router.post("/otpverification", perApiAuthLimiter, verifyOtp);
router.post("/login", perApiAuthLimiter, login);
router.post("/forgotpassword", perApiAuthLimiter, forgotPassword);
router.post("/resetpassword", perApiAuthLimiter, resetPassword);
router.post("/googleAuth", perApiAuthLimiter, googleAuth);
router.post("/googleSignup", perApiAuthLimiter, googleSignup);
router.post("/logout", perApiAuthLimiter, logout);
router.get("/refresh", perApiAuthLimiter, refreshToken);
router.get("/check", verifyToken, checkSession);

// User data route - protected by verifyToken middleware
router.get("/user", verifyToken, getUser);

module.exports = router;
