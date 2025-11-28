const express = require("express");
const { signup, verifyOtp, resendOtp, login, forgotPassword, resetPassword, googleAuth, googleSignup, logout, refreshToken, verifyToken, checkSession, getUser, getColleges } = require("../../controllers/auth/userAuthController");
const router = express.Router();

// Auth routes
router.post("/signup", signup);
router.post("/otpverification", verifyOtp);
router.post("/resendotp", resendOtp);
router.post("/login", login);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword", resetPassword);
router.post("/googleAuth", googleAuth);
router.post("/googleSignup", googleSignup);
router.post("/logout", logout);
router.get("/refresh", refreshToken);
router.get("/check", verifyToken, checkSession);
router.get("/list", getColleges);

// User data route - protected by verifyToken middleware
router.get("/user", verifyToken, getUser);

module.exports = router;
