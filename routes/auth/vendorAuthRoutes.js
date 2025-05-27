const express = require("express");
const { signup, verifyOtp, login, forgotPassword, resetPassword, googleAuth, googleSignup, logout, refreshToken, verifyToken, checkSession, getUser } = require("../../controllers/auth/vendorAuthController");
const router = express.Router();

// Auth routes
router.post("/signup", signup);
router.post("/otpverification", verifyOtp);
router.post("/login", login);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword", resetPassword);
router.post("/googleAuth", googleAuth);
router.post("/googleSignup", googleSignup);
router.post("/logout", logout);
router.get("/refresh", refreshToken);
router.get("/check", verifyToken, checkSession);

// User data route - protected by verifyToken middleware
router.get("/user", verifyToken, getUser);

module.exports = router;
