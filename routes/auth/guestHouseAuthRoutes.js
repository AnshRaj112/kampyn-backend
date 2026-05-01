const express = require("express");
const { perApiAuthLimiter } = require("../../middleware/rateLimit");
const {
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
  logout,
  verifyToken,
  checkSession,
  getUser,
  getAssignments,
} = require("../../controllers/auth/guestHouseAuthController");

const router = express.Router();

router.post("/otpverification", perApiAuthLimiter, verifyOtp);
router.post("/resendotp", perApiAuthLimiter, resendOtp);
router.post("/login", perApiAuthLimiter, login);
router.post("/forgotpassword", perApiAuthLimiter, forgotPassword);
router.post("/resetpassword", perApiAuthLimiter, resetPassword);
router.post("/logout", perApiAuthLimiter, logout);
router.get("/check", verifyToken, checkSession);
router.get("/user", verifyToken, getUser);
router.get("/assignments", verifyToken, getAssignments);

module.exports = router;

